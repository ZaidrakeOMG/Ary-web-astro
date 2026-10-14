"""Browser regression using simulated billing and speech only.

Run after build: python tests/whatsapp_voice_test.py
No real invoice, SAT document, WhatsApp message, microphone or AI request is used.
"""
from __future__ import annotations
import json
import os
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from playwright.sync_api import sync_playwright

BASE=os.environ.get('ARY_TEST_URL','http://127.0.0.1:4173')
OPTIONS={'csrf':'test-only-csrf','modo_seguro':True,'aceptando':True,
         'estaciones':[{'valor':'ARY V','texto':'ARY V'}],
         'formas_pago':[{'valor':'EFECTIVO','texto':'Efectivo'},{'valor':'TARJETA DE DEBITO','texto':'Débito'}],
         'usos_cfdi':[{'valor':'G03','texto':'G03 - Gastos en general'}]}
CAPTURE={'rfc':'AAA010101AAA','razon_social':'EMPRESA DE PRUEBA SA DE CV','estacion':'ARY V',
         'ticket':'123456','fecha_ticket':'2026-10-14','forma_pago':'TARJETA DE DEBITO',
         'uso_cfdi':'GASTOS EN GENERAL.','correo_destino':'prueba@example.com'}
VOICE_MOCK=r"""
window.voiceCalls={spoken:[],starts:0,aborts:0,cancels:0};
const synth={getVoices:()=>[{lang:'es-MX',name:'Voz de prueba'}],resume(){},
 cancel(){window.voiceCalls.cancels++},
 speak(u){window.voiceCalls.spoken.push({text:u.text,lang:u.lang,voice:u.voice?.lang});window.lastUtterance=u},
 addEventListener(){}};
Object.defineProperty(window,'speechSynthesis',{configurable:true,value:synth});
window.SpeechSynthesisUtterance=class{constructor(text){this.text=text}};
window.SpeechRecognition=class{
 constructor(){window.lastRecognition=this}
 start(){window.voiceCalls.starts++}
 abort(){window.voiceCalls.aborts++}
};
window.webkitSpeechRecognition=undefined;
"""


def setup(browser,state='REVISION_REQUERIDA',failure=None,voice=True,paused=False):
    ctx=browser.new_context(viewport={'width':1280,'height':900})
    ctx.add_init_script(VOICE_MOCK+('' if voice else '\nwindow.SpeechRecognition=undefined;'))
    calls=[]; details=dict(CAPTURE)
    def api(route):
        request=route.request; path=urlparse(request.url).path
        body=request.post_data_json if request.method=='POST' else None
        calls.append({'path':path,'body':body,'id':request.headers.get('x-ary-request-id')})
        if path.endswith('/opciones'): data=dict(OPTIONS,aceptando=not paused)
        elif path.endswith('/solicitudes'):
            number=sum(c['path'].endswith('/solicitudes') for c in calls)
            if failure=='abort' and number==1:
                route.abort('failed'); return
            if failure=='400':
                route.fulfill(status=400,json={'error':'La constancia no pudo ser procesada.'}); return
            details['fecha_ticket']=body['fecha_ticket']
            data={'referencia':'ARY-TEST-1234','tipo':'FACTURA','estado':'EN_COLA','modo_seguro':True,
                  'mensaje':'Solicitud recibida.','seguimiento':'TEST-TRACKING-NO-COMPARTIR'}
        else:
            data={'referencia':'ARY-TEST-1234','tipo':'FACTURA','estado':state,'modo_seguro':True,
                  'mensaje':'Revisión de ejemplo. Comprobar el timbrado anterior antes de emitir otra.',
                  'asistencia':{'telefono':'528711651404','datos':details}}
        route.fulfill(status=200,json=data)
    ctx.route('**/api/facturacion/**',api)
    ctx.route('https://wa.me/**',lambda route:route.abort())
    ctx.route('**/api/asistente',lambda route:route.fulfill(status=503,json={'error':'No AI in this test'}))
    page=ctx.new_page(); page.goto(BASE+'/facturacion/',wait_until='networkidle')
    return ctx,page,calls,details


def fill(page):
    page.locator('#tab-factura').click()
    page.locator('#factura-estacion').select_option('ARY V')
    page.locator('#factura-constancia').set_input_files({'name':'prueba.pdf','mimeType':'application/pdf','buffer':b'%PDF-'+b'FAKE-TEST-ONLY'*30})
    page.locator('#factura-ticket').fill('123456')
    today=page.evaluate("document.getElementById('factura-fecha').max")
    page.locator('#factura-fecha').fill(today)
    page.locator('#factura-pago').select_option('TARJETA DE DEBITO')
    page.locator('#factura-correo').fill('prueba@example.com')
    page.locator('#factura-confirmacion').fill('prueba@example.com')
    page.locator('#form-factura [name=confirmado]').check()


def submit(page):
    page.locator('#form-factura .submit').click()
    page.locator('#reviewDialog[open]').wait_for()
    assert 'la calle no interviene' in page.locator('#reviewGrid').inner_text()
    page.locator('#reviewConfirm').click()


def message(page,selector='#finalResult'):
    link=page.locator(selector+' a[data-whatsapp]'); link.wait_for(state='visible',timeout=10000)
    url=urlparse(link.get_attribute('href'))
    assert url.scheme=='https' and url.netloc=='wa.me' and url.path=='/528711651404'
    assert link.get_attribute('rel')=='noopener noreferrer'
    return parse_qs(url.query)['text'][0]


def test_error_preserves_capture_and_reload(browser):
    ctx,page,calls,details=setup(browser)
    try:
        fill(page); submit(page); text=message(page)
        for value in (CAPTURE['rfc'],CAPTURE['razon_social'],CAPTURE['estacion'],CAPTURE['ticket'],CAPTURE['forma_pago'],CAPTURE['uso_cfdi'],CAPTURE['correo_destino']):
            assert value in text,value
        assert 'No autorizo duplicarlo' in text and 'TEST-TRACKING' not in text and 'JVBER' not in text
        assert len([x for x in calls if x['path'].endswith('/solicitudes')])==1
        stored=page.evaluate('JSON.stringify(sessionStorage)')
        assert CAPTURE['rfc'] not in stored and CAPTURE['correo_destino'] not in stored
        page.reload(wait_until='networkidle'); assert CAPTURE['rfc'] in message(page)
        assert len([x for x in calls if x['path'].endswith('/solicitudes')])==1
    finally: ctx.close()


def test_early_error_has_captured_fields_without_inventing_rfc(browser):
    ctx,page,calls,_=setup(browser,failure='400')
    try:
        fill(page); submit(page); text=message(page,'#error-factura')
        assert 'prueba@example.com' in text and '123456' in text and 'TARJETA DE DEBITO' in text
        assert 'No disponible: la constancia no fue procesada' in text and CAPTURE['rfc'] not in text
    finally: ctx.close()


def test_uncertain_retry_keeps_same_request_id(browser):
    ctx,page,calls,_=setup(browser,failure='abort')
    try:
        fill(page); submit(page); assert 'No autorizo duplicarlo' in message(page,'#error-factura')
        assert page.locator('#form-factura .submit').inner_text()=='Confirmar recepción'
        page.locator('#form-factura .submit').click(); message(page)
        posts=[x for x in calls if x['path'].endswith('/solicitudes')]
        assert len(posts)==2 and posts[0]['id']==posts[1]['id'] and posts[0]['body']==posts[1]['body']
    finally: ctx.close()


def test_already_invoiced_offers_support_not_new_invoice(browser):
    ctx,page,calls,_=setup(browser,state='YA_FACTURADO')
    try:
        fill(page); submit(page); text=message(page)
        assert 'YA_FACTURADO' in text and CAPTURE['rfc'] in text and 'No autorizo duplicarlo' in text
        assert len([x for x in calls if x['path'].endswith('/solicitudes')])==1
    finally: ctx.close()


def test_support_uses_text_not_html(browser):
    ctx,page,calls,details=setup(browser)
    try:
        details['razon_social']='<img src=x onerror=alert(1)> & PRUEBA'
        fill(page); submit(page); assert details['razon_social'] in message(page)
        assert page.locator('#finalResult img').count()==0
    finally: ctx.close()


def open_chat(page):
    page.locator('#ary-assistant-launcher').click()
    page.locator('#ary-chat > summary').click()
    page.locator('#ary-voice-dictate').wait_for(state='visible')


def test_speech_is_explicit_and_stops_when_closed(browser):
    ctx,page,_,_=setup(browser)
    try:
        assert page.evaluate('voiceCalls.starts')==0 and page.evaluate('voiceCalls.spoken.length')==0
        open_chat(page); page.locator('#ary-voice-speak').click()
        assert page.evaluate('voiceCalls.spoken.length')==1
        assert page.evaluate('voiceCalls.spoken[0].voice')=='es-MX'
        assert page.locator('#ary-voice-speak').get_attribute('aria-pressed')=='true'
        page.locator('#ary-assistant-close').click()
        assert page.locator('#ary-voice-speak').get_attribute('aria-pressed')=='false'
        assert page.evaluate('voiceCalls.cancels')>0
    finally: ctx.close()


def test_dictation_needs_consent_and_never_submits(browser):
    ctx,page,calls,_=setup(browser)
    try:
        open_chat(page); page.locator('#ary-voice-dictate').click()
        assert page.evaluate('voiceCalls.starts')==0
        page.locator('#ary-voice-consent').check(); page.locator('#ary-chat-message').fill('Hola')
        page.locator('#ary-voice-dictate').click(); assert page.evaluate('voiceCalls.starts')==1
        page.evaluate("const result=[{transcript:'cómo entro a flotillas'}]; result.isFinal=true; lastRecognition.onresult({results:[result]});")
        assert page.locator('#ary-chat-message').input_value()=='Hola cómo entro a flotillas'
        assert page.locator('#ary-chat-log .is-user').count()==0
        assert not any(x['path'].endswith('/solicitudes') for x in calls)
        page.locator('#ary-assistant-close').click(); assert page.evaluate('voiceCalls.aborts')==1
        assert page.locator('#ary-chat-message').evaluate('(el)=>el.readOnly') is False
    finally: ctx.close()


def test_mic_error_restores_typing(browser):
    ctx,page,_,_=setup(browser)
    try:
        open_chat(page); page.locator('#ary-voice-consent').check(); page.locator('#ary-voice-dictate').click()
        page.evaluate("lastRecognition.onerror({error:'not-allowed'});")
        assert 'denegado' in page.locator('#ary-voice-status').inner_text()
        assert page.locator('#ary-chat-message').evaluate('(el)=>el.readOnly') is False
        assert page.locator('#ary-voice-dictate').get_attribute('aria-pressed')=='false'
    finally: ctx.close()


def test_unsupported_dictation_has_text_fallback(browser):
    ctx,page,_,_=setup(browser,voice=False)
    try:
        open_chat(page)
        assert page.locator('#ary-voice-dictate').is_disabled()
        assert not page.locator('#ary-voice-speak').is_disabled()
        page.locator('#ary-chat-message').fill('Pregunta escrita')
        assert page.locator('#ary-chat-message').input_value()=='Pregunta escrita'
    finally: ctx.close()


def main():
    names=[name for name in globals() if name.startswith('test_')]
    selected=os.environ.get('ARY_TEST_FILTER','')
    if selected: names=[name for name in names if selected in name]
    results=[]
    with sync_playwright() as p:
        args={'headless':True}
        if os.environ.get('ARY_CHROMIUM_PATH'): args['executable_path']=os.environ['ARY_CHROMIUM_PATH']
        browser=p.chromium.launch(**args)
        try:
            for name in names:
                globals()[name](browser)
                results.append({'test':name,'status':'PASS'}); print('PASS',name,flush=True)
        finally: browser.close()
    folder=Path('test-results'); folder.mkdir(exist_ok=True)
    (folder/'whatsapp-voice.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
    print(f'{len(results)} browser tests passed. All services were simulated.')

if __name__=='__main__': main()
