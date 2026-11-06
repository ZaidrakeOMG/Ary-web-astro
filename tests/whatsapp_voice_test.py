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
Object.defineProperty(navigator,'audioSession',{configurable:true,value:{type:'ambient'}});
Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{
 getUserMedia:async()=>{window.voiceCalls.permissionRequests++;return{getTracks:()=>[{stop(){}}]}}
}});
Object.defineProperty(navigator,'permissions',{configurable:true,value:{
 query:async()=>({state:'granted'})
}});
"""


def setup(browser,state='REVISION_REQUERIDA',failure=None,voice=True,paused=False,mobile=False,ios=False):
    options={'viewport':{'width':390 if mobile else 1280,'height':844 if mobile else 900},'is_mobile':mobile,'has_touch':mobile}
    if ios:
        options['user_agent']='Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/18.6 Mobile/15E148 Safari/604.1'
    ctx=browser.new_context(**options)
    nativeAudioMock = """
window.mobileAudioCalls={played:[],paused:0};
window.Audio=class {
  constructor(url){this.src=url;this.volume=1;window.mobilePlayer=this;}
  play(){mobileAudioCalls.played.push(this.src);this.onplay?.();return Promise.resolve();}
  pause(){mobileAudioCalls.paused++;}
  removeAttribute(name){if(name==='src')this.src='';}
  load(){}
};
"""
    ctx.add_init_script(VOICE_MOCK+('' if voice else '\nwindow.SpeechRecognition=undefined;')+(nativeAudioMock if ios else ''))
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


def test_oils_notice_is_only_in_sidebar_and_guide_is_compact(browser):
    for mobile in (False, True):
        ctx,page,calls,_=setup(browser,mobile=mobile)
        try:
            page.locator('#tab-factura').click()
            assert page.locator('.billing-aside .billing-oils').count()==1
            assert page.locator('#panel-factura .billing-oils').count()==0
            assert page.locator('.billing-guide').count()==0
            assert page.locator('.billing-help').count()==0
            assert page.locator('.billing-guide-mascot').count()==0
            assert page.locator('.billing-guide-compact').count()==1
            assert page.locator('#panel-factura #billing-guide-control').count()==0
            assert page.locator('.billing-aside #billing-guide-control').count()==1
            assert page.locator('.billing-assistant-card').is_visible()
            assert page.locator('.billing-assistant-card h2').inner_text()=='Tu asistente'
            assert page.locator('#billing-guide-state').get_attribute('class').find('sr-only')!=-1
            assert page.locator('#billing-guide-toggle').is_visible()
            assert page.locator('#billing-guide-voice').is_visible()
            assert page.locator('#billing-guide-restart').count()==1
            photo=page.locator('.billing-assistant-photo img')
            assert photo.is_visible()
            assert photo.get_attribute('src')=='/media/ary-3.webp'
            assert photo.bounding_box()['y']>=page.locator('#billing-guide-voice').bounding_box()['y']+page.locator('#billing-guide-voice').bounding_box()['height']-1
            assert page.locator('.billing-oils strong').inner_text()=='¿Necesitas facturar aceites?'
            assert 'Los aceites no se facturan desde este portal' in page.locator('.billing-oils').inner_text()
            link=page.locator('.billing-oils-whatsapp')
            assert link.get_attribute('href').startswith('https://wa.me/528711651404')
            assert link.get_attribute('target')=='_blank'
            assert 'Se aplica el límite que venza primero.' not in page.locator('body').inner_text()
            # Sidebar assistant only belongs to invoice tab. The existing voice
            # handlers remain the same; only its placement has changed.
            page.locator('#tab-alta').click()
            assert not page.locator('.billing-assistant-card').is_visible()
            page.locator('#tab-factura').click()
            assert page.locator('.billing-assistant-card').is_visible()
            if mobile:
                aside=page.locator('.billing-oils').bounding_box()
                width=page.evaluate('window.innerWidth')
                assert aside['x']>=0 and aside['x']+aside['width']<=width+2
            assert not any(c['path'].endswith('/solicitudes') for c in calls)
        finally:
            ctx.close()


def test_invoice_guide_opens_on_entry_and_can_be_disabled(browser):
    ctx,page,calls,_=setup(browser)
    try:
        assert page.locator('#ary-assistant-tour').is_hidden()
        page.locator('#tab-factura').click()
        page.locator('#ary-assistant-tour').wait_for(state='visible')
        # The floating guide must not cover the new left-side control buttons.
        # The guide's exact pixel position can change with fonts and viewport.
        # Verify the sidebar controls remain usable while the floating guide is open.
        assert page.locator('.billing-aside #billing-guide-toggle').is_visible()
        assert '72 horas' in page.locator('#ary-assistant-description').inner_text()
        assert 'aceites' in page.locator('#ary-assistant-description').inner_text()
        assert page.locator('#billing-guide-toggle').get_attribute('aria-checked') == 'true'
        page.locator('#ary-assistant-next').click()
        assert 'Elige tu estación' in page.locator('#ary-assistant-step').inner_text()
        page.locator('#billing-guide-restart').click()
        assert 'Paso 1 de' in page.locator('#ary-assistant-count').inner_text()
        page.locator('#billing-guide-toggle').click()
        assert page.locator('#billing-guide-toggle').get_attribute('aria-checked') == 'false'
        assert page.locator('#ary-assistant-panel').is_hidden()
        assert page.evaluate("localStorage.getItem('ary-invoice-auto-guide-v1')") == '0'
        page.locator('#tab-alta').click()
        page.locator('#tab-factura').click()
        assert page.locator('#ary-assistant-panel').is_hidden()
        page.reload(wait_until='networkidle')
        page.locator('#tab-factura').click()
        assert page.locator('#billing-guide-toggle').get_attribute('aria-checked') == 'false'
        assert page.locator('#ary-assistant-panel').is_hidden()
        page.locator('#billing-guide-toggle').click()
        page.locator('#ary-assistant-tour').wait_for(state='visible')
        assert page.locator('#billing-guide-toggle').get_attribute('aria-checked') == 'true'
        assert '72 horas' in page.locator('#ary-assistant-description').inner_text()
        assert page.evaluate("localStorage.getItem('ary-invoice-auto-guide-v1')") == '1'
        assert not any(c['path'].endswith('/solicitudes') for c in calls)
    finally: ctx.close()


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
        assert page.evaluate('voiceCalls.permissionRequests')==0
        page.locator('#ary-assistant-tour').wait_for(state='visible')
        assert 'Facturar ticket' in page.locator('#ary-assistant-kind').inner_text()
        assert page.evaluate('voiceCalls.spoken.length')==1
        assert 'Natural' in page.evaluate('voiceCalls.spoken[0].voiceName')
        assert page.evaluate('voiceCalls.spoken[0].rate') < 1
        assert page.evaluate('voiceCalls.starts')==0
        page.locator('#ary-voice-mic').click()
        assert page.evaluate('voiceCalls.permissionRequests')==1
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
        assert page.evaluate('voiceCalls.permissionRequests')==0
        page.locator('#ary-voice-mic').click()
        assert page.evaluate('voiceCalls.permissionRequests')==1
        page.reload(wait_until='networkidle')
        page.locator('#ary-assistant-tour').wait_for(state='visible',timeout=5000)
        assert page.locator('#ary-voice-prompt').is_hidden()
        assert page.evaluate('voiceCalls.permissionRequests')==0
        # Mobile browsers must not autoplay or request permission on reload.
        assert page.evaluate('voiceCalls.spoken.length')==0
        page.locator('#tab-factura').click()
        page.locator('#billing-guide-voice').click()
        assert page.evaluate('voiceCalls.spoken.length')==1
        assert page.evaluate('voiceCalls.permissionRequests')==0
    finally: ctx.close()


def test_missing_microphone_keeps_automatic_narration(browser):
    ctx,page,_,_=setup(browser)
    try:
        page.locator('#ary-voice-prompt').wait_for(state='visible',timeout=5000)
        page.evaluate("""Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async()=>{voiceCalls.permissionRequests++;throw new DOMException('Requested device not found','NotFoundError')}});0""")
        page.locator('#ary-voice-enable').click()
        page.locator('#ary-assistant-tour').wait_for(state='visible')
        assert page.evaluate('voiceCalls.permissionRequests')==0
        assert page.evaluate('voiceCalls.spoken.length')==1
        page.locator('#ary-voice-mic').click()
        assert page.evaluate('voiceCalls.permissionRequests')==1
        assert 'Natural' in page.evaluate('voiceCalls.spoken[0].voiceName')
        page.evaluate('lastUtterance.onend()')
        assert page.evaluate('voiceCalls.starts')==0
        assert 'micrófono' in page.locator('#ary-voice-status').inner_text()
        assert 'Paso 1 de' in page.locator('#ary-assistant-count').inner_text()
    finally: ctx.close()


def test_mobile_guide_button_narrates_without_microphone_permission(browser):
    ctx,page,calls,_=setup(browser)
    try:
        page.set_viewport_size({'width':390,'height':844})
        page.locator('#tab-factura').click()
        page.evaluate("""Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async()=>{voiceCalls.permissionRequests++;throw new DOMException('Permission denied','NotAllowedError')}});0""")
        page.locator('#billing-guide-voice').click()
        assert page.evaluate('voiceCalls.permissionRequests')==0
        assert page.evaluate('voiceCalls.spoken.length')==1
        page.locator('#ary-voice-mic').click()
        assert page.evaluate('voiceCalls.permissionRequests')==1
        assert '72 horas' in page.evaluate('voiceCalls.spoken[0].text')
        assert page.locator('#billing-guide-voice').get_attribute('aria-pressed')=='true'
        assert page.locator('#ary-assistant-tour').is_visible()
        assert 'Micrófono denegado' in page.locator('#ary-voice-status').inner_text()
        page.locator('#ary-assistant-next').click()
        assert page.evaluate('voiceCalls.spoken.length')==2
        assert not any(c['path'].endswith('/solicitudes') for c in calls)
    finally: ctx.close()


def test_mobile_touch_launcher_and_bottom_sheet(browser):
    for width in (320,390):
        ctx,page,calls,_=setup(browser,mobile=True)
        try:
            page.set_viewport_size({'width':width,'height':740 if width==320 else 844})
            page.locator('#tab-factura').tap()
            assert page.locator('#ary-assistant-panel').is_hidden()
            page.locator('#billing-guide-voice').tap()
            page.locator('#ary-assistant-panel').wait_for(state='visible')
            panel=page.locator('#ary-assistant-panel').bounding_box()
            header=page.locator('.site-header').bounding_box()
            assert panel['x']>=0 and panel['x']+panel['width']<=width+2
            assert panel['y']>=header['y']+header['height']-2
            assert page.locator('#ary-assistant-next').is_visible()
            assert page.locator('#ary-assistant-launcher').is_hidden()
            assert page.evaluate('voiceCalls.spoken.length')==1
            assert page.evaluate('voiceCalls.permissionRequests')==0
            page.locator('#ary-assistant-next').tap()
            assert 'Paso 2 de' in page.locator('#ary-assistant-count').inner_text()
            page.locator('#ary-assistant-field').tap()
            assert page.locator('#ary-assistant-panel').is_hidden()
            page.locator('#ary-assistant-launcher').tap()
            assert 'Paso 2 de' in page.locator('#ary-assistant-count').inner_text()
            assert not any(c['path'].endswith('/solicitudes') for c in calls)
        finally: ctx.close()


def test_microphone_consent_tap_starts_guide_audio(browser):
    ctx,page,calls,_=setup(browser)
    try:
        page.locator('#tab-factura').click()
        page.locator('#ary-assistant-tour').wait_for(state='visible')
        assert page.evaluate('voiceCalls.spoken.length')==0
        page.locator('#ary-voice-mic').click()
        assert page.evaluate('voiceCalls.permissionRequests')==1
        assert page.evaluate('voiceCalls.spoken.length')==1
        assert page.evaluate('navigator.audioSession.type')=='playback'
        assert page.evaluate('voiceCalls.starts')==0
        page.evaluate('lastUtterance.onend()')
        assert page.evaluate('voiceCalls.starts')==1
        assert not any(c['path'].endswith('/solicitudes') for c in calls)
    finally: ctx.close()


def test_mobile_iphone_uses_real_mp3_without_speechsynthesis(browser):
    ctx,page,calls,_=setup(browser,mobile=True,ios=True)
    try:
        # Actual static media is shipped; the request must succeed without an API.
        for name in ['factura-0.mp3','factura-11.mp3','alta-0.mp3','prueba-0.mp3']:
            response=page.request.get(BASE+'/media/ary-guide-audio/'+name)
            assert response.status==200, name
            assert response.headers.get('content-type','').startswith('audio/'), name
            assert len(response.body())>1000, name
        page.locator('#tab-factura').tap()
        assert 'Audio móvil MP3' in page.locator('#billing-guide-voice-note').inner_text()
        assert page.locator('#ary-voice-test-tts').count()==0
        assert page.locator('#ary-voice-test').count()==0
        page.locator('#billing-guide-voice').tap()
        assert page.locator('#ary-voice-speak').is_visible()
        assert '/factura-0.mp3?voice=neural-claude-2' in page.evaluate("mobileAudioCalls.played[0]")
        assert page.evaluate('voiceCalls.spoken.length')==0
        assert page.locator('#ary-voice-speak').get_attribute('aria-pressed')=='true'
        page.locator('#ary-assistant-next').tap()
        assert '/factura-1.mp3?voice=neural-claude-2' in page.evaluate("mobileAudioCalls.played.at(-1)")
        assert page.evaluate('mobileAudioCalls.paused')>=1
        # Repeating is still available without extra debug/test buttons.
        page.evaluate("mobilePlayer.onended()")
        page.locator('#ary-voice-speak').tap()
        assert '/factura-1.mp3?voice=neural-claude-2' in page.evaluate("mobileAudioCalls.played.at(-1)")
        assert page.evaluate("mobileAudioCalls.played.length")==3
        assert page.evaluate('voiceCalls.permissionRequests')==0
        assert not any(c['path'].endswith('/solicitudes') for c in calls)
    finally: ctx.close()


def test_iphone_long_guide_is_spoken_in_short_parts(browser):
    ctx,page,calls,_=setup(browser,mobile=True)
    try:
        page.locator('#tab-factura').tap()
        page.evaluate("""Object.defineProperty(navigator,'userAgent',{configurable:true,get:()=> 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1'});0""")
        page.locator('#billing-guide-voice').tap()
        assert page.evaluate('voiceCalls.spoken.length')==1
        assert len(page.evaluate('voiceCalls.spoken[0].text'))<=180
        for _ in range(30):
            if page.locator('#ary-voice-speak').get_attribute('aria-pressed')=='false':
                break
            page.evaluate('lastUtterance.onend()')
        assert page.evaluate('voiceCalls.spoken.length')>=3
        assert page.locator('#ary-voice-speak').get_attribute('aria-pressed')=='false'
        assert page.evaluate('voiceCalls.permissionRequests')==0
        assert page.evaluate("navigator.audioSession.type")=='playback'
        assert not any(c['path'].endswith('/solicitudes') for c in calls)
    finally: ctx.close()


def test_success_remembers_reusable_invoice_fields_only(browser):
    ctx,page,_,_=setup(browser)
    try:
        fill(page); submit(page)
        page.locator('#receipt').wait_for(state='visible')
        profile=page.evaluate("JSON.parse(localStorage.getItem('ary_factura_profile_v1'))")
        assert profile=={'estacion':'ARY V','forma_pago':'TARJETA DE DEBITO','uso_cfdi':'G03','correo':'prueba@example.com'}
        fiscal=page.evaluate("JSON.parse(localStorage.getItem('ary_factura_fiscal_support_v1'))")
        assert fiscal['rfc']==CAPTURE['rfc'] and fiscal['razon_social']==CAPTURE['razon_social']
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


def test_manual_repeat_uses_natural_voice_and_stops_when_closed(browser):
    ctx,page,_,_=setup(browser)
    try:
        assert page.evaluate('voiceCalls.spoken.length')==0
        open_chat(page)
        page.locator('#ary-voice-speak').click()
        assert page.evaluate('voiceCalls.permissionRequests')==0
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
