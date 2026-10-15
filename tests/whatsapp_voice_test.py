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
window.voiceCalls={spoken:[],starts:0,aborts:0,cancels:0,permissionRequests:0};
const synth={getVoices:()=>[
 {lang:'es-MX',name:'Voz de prueba'},
 {lang:'es-MX',name:'Microsoft Dalia Online (Natural) - Spanish (Mexico)'}
],resume(){},
 cancel(){window.voiceCalls.cancels++},
 speak(u){window.voiceCalls.spoken.push({text:u.text,lang:u.lang,voice:u.voice?.lang,voiceName:u.voice?.name,rate:u.rate});window.lastUtterance=u},
 addEventListener(){}};
Object.defineProperty(window,'speechSynthesis',{configurable:true,value:synth});
window.SpeechSynthesisUtterance=class{constructor(text){this.text=text}};
window.SpeechRecognition=class{
 constructor(){window.lastRecognition=this}
 start(){window.voiceCalls.starts++}
 abort(){window.voiceCalls.aborts++}
};
window.webkitSpeechRecognition=undefined;
Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{
 getUserMedia:async()=>{window.voiceCalls.permissionRequests++;return{getTracks:()=>[{stop(){}}]}}
}});
Object.defineProperty(navigator,'permissions',{configurable:true,value:{
 query:async()=>({state:'granted'})
}});
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
                  'mensaje':'Solicitud recibida.','seguimiento':'TEST-TRACKING-NO-COMPARTIR',
                  'perfil_local':{'rfc':details['rfc'],'razon_social':details['razon_social'],
                                  'correo_destino':details['correo_destino']}}
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


def dismiss_voice_prompt(page):
    prompt=page.locator('#ary-voice-prompt')
    if prompt.count() and prompt.is_visible():
        page.locator('#ary-voice-prompt-close').click()


def open_chat(page):
    dismiss_voice_prompt(page)
    page.locator('#ary-assistant-launcher').click()
    if not page.locator('#ary-chat').evaluate('(el)=>el.open'):
        page.locator('#ary-chat > summary').click()
    page.locator('#ary-voice-dictate').wait_for(state='visible')


def test_voice_waits_for_user_permission(browser):
    ctx,page,_,_=setup(browser)
    try:
        page.locator('#ary-voice-prompt').wait_for(state='visible',timeout=5000)
        assert '¿Quieres ayuda por voz para facturar?' in page.locator('#ary-voice-prompt').inner_text()
        assert page.evaluate('voiceCalls.permissionRequests')==0
        assert page.evaluate('voiceCalls.starts')==0
        assert page.evaluate('voiceCalls.spoken.length')==0
    finally: ctx.close()


def test_enable_voice_narrates_guide_and_listens_for_next(browser):
    ctx,page,calls,_=setup(browser)
    try:
        page.locator('#ary-voice-prompt').wait_for(state='visible',timeout=5000)
        page.locator('#ary-voice-enable').click()
        assert page.evaluate('voiceCalls.permissionRequests')==1
        page.locator('#ary-assistant-tour').wait_for(state='visible')
        assert 'Facturar ticket' in page.locator('#ary-assistant-kind').inner_text()
        assert page.evaluate('voiceCalls.spoken.length')==1
        assert 'Natural' in page.evaluate('voiceCalls.spoken[0].voiceName')
        assert page.evaluate('voiceCalls.spoken[0].rate') < 1
        assert page.evaluate('voiceCalls.starts')==0
        page.evaluate('lastUtterance.onend()')
        assert page.evaluate('voiceCalls.starts')==1
        page.evaluate("const result=[{transcript:'siguiente'}]; result.isFinal=true; lastRecognition.onresult({results:[result]});")
        assert 'Paso 2 de' in page.locator('#ary-assistant-count').inner_text()
        assert page.evaluate('voiceCalls.spoken.length')==2
        assert not any(x['path'].endswith('/solicitudes') for x in calls)
        assert page.evaluate("localStorage.getItem('ary-voice-enabled-v2')")=='1'
    finally: ctx.close()


def test_granted_voice_preference_does_not_request_microphone_again(browser):
    ctx,page,_,_=setup(browser)
    try:
        page.locator('#ary-voice-prompt').wait_for(state='visible',timeout=5000)
        page.locator('#ary-voice-enable').click()
        assert page.evaluate('voiceCalls.permissionRequests')==1
        page.reload(wait_until='networkidle')
        page.locator('#ary-assistant-tour').wait_for(state='visible',timeout=5000)
        assert page.locator('#ary-voice-prompt').is_hidden()
        assert page.evaluate('voiceCalls.permissionRequests')==0
        assert page.evaluate('voiceCalls.spoken.length')>=1
    finally: ctx.close()


def test_missing_microphone_keeps_automatic_narration(browser):
    ctx,page,_,_=setup(browser)
    try:
        page.locator('#ary-voice-prompt').wait_for(state='visible',timeout=5000)
        page.evaluate("""Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async()=>{voiceCalls.permissionRequests++;throw new DOMException('Requested device not found','NotFoundError')}});0""")
        page.locator('#ary-voice-enable').click()
        page.locator('#ary-assistant-tour').wait_for(state='visible')
        assert page.evaluate('voiceCalls.permissionRequests')==1
        assert page.evaluate('voiceCalls.spoken.length')==1
        assert 'Natural' in page.evaluate('voiceCalls.spoken[0].voiceName')
        page.evaluate('lastUtterance.onend()')
        assert page.evaluate('voiceCalls.starts')==0
        assert 'No se detectó un micrófono' in page.locator('#ary-voice-status').inner_text()
        assert 'Paso 1 de' in page.locator('#ary-assistant-count').inner_text()
    finally: ctx.close()


def test_success_remembers_reusable_invoice_fields_only(browser):
    ctx,page,_,_=setup(browser)
    try:
        fill(page); submit(page)
        page.locator('#receipt').wait_for(state='visible')
        profile=page.evaluate("JSON.parse(localStorage.getItem('ary_factura_profile_v1'))")
        assert profile['estacion']=='ARY V' and profile['forma_pago']=='TARJETA DE DEBITO'
        assert profile['uso_cfdi']=='G03' and profile['correo']=='prueba@example.com'
        assert isinstance(profile['saved_at'], (int,float)) and profile['saved_at'] > 0
        fiscal=page.evaluate("JSON.parse(localStorage.getItem('ary_factura_fiscal_support_v1'))")
        assert fiscal['rfc']==CAPTURE['rfc'] and fiscal['razon_social']==CAPTURE['razon_social']
        assert isinstance(fiscal['saved_at'], (int,float)) and fiscal['saved_at'] > 0
        page.evaluate('sessionStorage.clear()')
        page.reload(wait_until='networkidle')
        page.locator('#tab-factura').click()
        assert page.locator('#factura-estacion').input_value()=='ARY V'
        assert page.locator('#factura-pago').input_value()=='TARJETA DE DEBITO'
        assert page.locator('#factura-uso').input_value()=='G03'
        assert page.locator('#factura-correo').input_value()=='prueba@example.com'
        assert page.locator('#factura-confirmacion').input_value()=='prueba@example.com'
        assert page.locator('#factura-ticket').input_value()==''
        assert page.locator('#factura-fecha').input_value()==''
        assert page.locator('#factura-constancia').evaluate('(el)=>el.files.length')==0
        page.on('dialog', lambda dialog: dialog.accept())
        page.locator('#clearRememberedBilling').click()
        assert page.evaluate("localStorage.getItem('ary_factura_profile_v1')") is None
        assert page.evaluate("localStorage.getItem('ary_factura_fiscal_support_v1')") is None
    finally: ctx.close()


def test_expired_remembered_billing_data_is_removed(browser):
    ctx,page,_,_=setup(browser)
    try:
        page.evaluate("""localStorage.setItem('ary_factura_profile_v1', JSON.stringify({saved_at:1,estacion:'ARY V',forma_pago:'EFECTIVO',uso_cfdi:'G03',correo:'viejo@example.com'}));
localStorage.setItem('ary_factura_fiscal_support_v1', JSON.stringify({saved_at:1,rfc:'AAA010101AAA',razon_social:'VIEJO SA DE CV',correo_destino:'viejo@example.com'}));""")
        page.reload(wait_until='networkidle')
        page.locator('#tab-factura').click()
        assert page.locator('#factura-correo').input_value()==''
        assert page.evaluate("localStorage.getItem('ary_factura_profile_v1')") is None
        assert page.evaluate("localStorage.getItem('ary_factura_fiscal_support_v1')") is None
    finally: ctx.close()


def test_manual_repeat_uses_natural_voice_and_stops_when_closed(browser):
    ctx,page,_,_=setup(browser)
    try:
        assert page.evaluate('voiceCalls.spoken.length')==0
        open_chat(page)
        page.locator('#ary-voice-speak').click()
        assert page.evaluate('voiceCalls.permissionRequests')==1
        assert page.evaluate('voiceCalls.spoken.length')==1
        assert page.evaluate('voiceCalls.spoken[0].voice')=='es-MX'
        assert 'Natural' in page.evaluate('voiceCalls.spoken[0].voiceName')
        assert page.locator('#ary-voice-speak').get_attribute('aria-pressed')=='true'
        page.locator('#ary-assistant-close').click()
        assert page.locator('#ary-voice-speak').get_attribute('aria-pressed')=='false'
        assert page.evaluate('voiceCalls.cancels')>0
    finally: ctx.close()


def test_manual_dictation_never_submits_billing(browser):
    ctx,page,calls,_=setup(browser)
    try:
        open_chat(page)
        page.locator('#ary-chat-message').fill('Hola')
        page.locator('#ary-voice-dictate').click()
        assert page.evaluate('voiceCalls.permissionRequests')==1
        assert page.evaluate('voiceCalls.starts')==1
        page.evaluate("const result=[{transcript:'cómo entro a flotillas'}]; result.isFinal=true; lastRecognition.onresult({results:[result]});")
        assert page.locator('#ary-chat-message').input_value()=='Hola cómo entro a flotillas'
        assert page.locator('#ary-chat-log .is-user').count()==0
        assert not any(x['path'].endswith('/solicitudes') for x in calls)
        page.locator('#ary-assistant-close').click()
        assert page.locator('#ary-chat-message').evaluate('(el)=>el.readOnly') is False
    finally: ctx.close()


def test_mic_error_restores_typing(browser):
    ctx,page,_,_=setup(browser)
    try:
        open_chat(page)
        page.locator('#ary-voice-dictate').click()
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
