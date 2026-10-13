"""Consent, mascot, microphone and guided steps; all media/API responses simulated.
No hardware, AI service, live invoices or personal field reads are used.
"""
import json
import os
import re
import time
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect
ROOT = Path(__file__).resolve().parents[1]
DIST = Path(os.getenv('ARY_TEST_DIST', ROOT/'dist'))
BASE = os.getenv('ARY_TEST_URL', 'http://127.0.0.1:4173').rstrip('/')
OUT = ROOT/'test-results'; OUT.mkdir(exist_ok=True)
CATALOG = json.loads(re.search(r'const INITIAL = (\{.*?\});', (DIST/'facturacion/index.html').read_text(encoding='utf-8'))[1])
RESULTS = []
MASCOT = '/media/ary-mascota-pensando-v1.webp'
MOCK = r"""
window.__voice={listens:0,aborts:0,spoken:[],cancels:0,active:null,probes:0,stopped:0,mode:'allow',requests:[],pending:[]};
const stream=()=>({getTracks:()=>[{stop:()=>{__voice.stopped++;}}]});
Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:constraints=>{
 __voice.probes++;__voice.requests.push(constraints);
 if(__voice.mode==='pending')return new Promise((resolve,reject)=>__voice.pending.push({resolve:()=>resolve(stream()),reject}));
 if(__voice.mode!=='allow')return Promise.reject(new DOMException('Simulated only',__voice.mode));
 return Promise.resolve(stream());
}}});
class FakeRecognition {
 start(){if(__voice.stopped===0)throw new Error('Media permission not checked/released');__voice.active=this;__voice.listens++;this.onstart?.({});}
 abort(){__voice.aborts++;this.onend?.({});}
}
window.SpeechRecognition=FakeRecognition;window.webkitSpeechRecognition=undefined;
window.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{
 getVoices:()=>[{lang:'es-MX',name:'Test voice'}],cancel:()=>{__voice.cancels++;},
 speak:u=>{if(__voice.active?.onresult)throw new Error('Must stop mic before speech');__voice.spoken.push(u.text);setTimeout(()=>{u.onstart?.({});u.onend?.({});},15);}
}});
window.__emitVoice=text=>{const r=[{transcript:text,confidence:.99}];r.isFinal=true;__voice.active?.onresult?.({results:[r],resultIndex:0});};
window.__voiceError=error=>__voice.active?.onerror?.({error});
window.__endVoice=()=>__voice.active?.onend?.({});
"""

def launch(browser, route='/facturacion/', width=390, height=844, choice=None, recognition=True, speech=True, media='allow'):
    ctx=browser.new_context(viewport={'width':width,'height':height},reduced_motion='reduce')
    init=MOCK+'\n__voice.mode='+json.dumps(media)+';'
    if choice: init+='\nsessionStorage.setItem("ary-voice-choice-v1",'+json.dumps(choice)+');'
    if not recognition: init+='\nwindow.SpeechRecognition=undefined;'
    if not speech: init+='\nwindow.SpeechSynthesisUtterance=undefined;'
    ctx.add_init_script(init)
    page=ctx.new_page(); errors=[]; blocked=[]; posts=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('console',lambda m:errors.append(m.text) if m.type=='error' and ('Content Security Policy' in m.text or 'Refused to execute' in m.text) else None)
    def intercept(r):
        req=r.request; path=urlparse(req.url).path
        if not req.url.startswith(BASE+'/') or path.startswith('/api/asistente/'):
            blocked.append(req.url);r.abort();return
        if path.startswith('/api/facturacion/'):
            if req.method!='GET': posts.append(path)
            r.fulfill(status=200,content_type='application/json',body=json.dumps(dict(CATALOG,csrf='MOCK-CONSENT',modo_seguro=True,aceptando=True)))
        else:r.continue_()
    ctx.route('**/*',intercept)
    page.goto(BASE+route,wait_until='networkidle')
    expect(page.locator('#ary-voice')).to_have_count(1)
    page._test=ctx,errors,blocked,posts
    return page

def wait(page, expression, arg=None, timeout=6):
    end=time.monotonic()+timeout
    while time.monotonic()<end:
        if page.evaluate(expression,arg):return
        page.wait_for_timeout(50)
    raise AssertionError(expression)

def finish(page,name):
    ctx,errors,blocked,posts=page._test
    assert not errors,(name,errors)
    assert not blocked,(name,blocked)
    assert not posts,(name,'No voice command may submit billing',posts)
    assert not page.evaluate('document.documentElement.scrollWidth>innerWidth+1'),name
    RESULTS.append({'name':name,'result':'passed'}); print('PASS',name,flush=True);ctx.close()

def active(page):
    expect(page.locator('#ary-voice-toggle')).to_have_text('Desactivar voz')
    expect(page.locator('#ary-voice-toggle')).to_have_attribute('aria-pressed','true')
    wait(page,'Boolean(__voice.active?.onresult)')

def say(page,text):
    active(page);page.evaluate('text=>__emitVoice(text)',text)

def spoken(page,text):wait(page,'text=>__voice.spoken.some(s=>s.includes(text))',text)

def accept(page):
    expect(page.locator('#ary-voice-consent')).to_be_visible()
    page.locator('#ary-voice-consent-allow').click();active(page)

def open_help(page):
    if page.locator('#ary-assistant-panel').is_hidden(): page.locator('#ary-assistant-launcher').click()

def run():
    with sync_playwright() as p:
        opts={'headless':True}
        if os.getenv('CHROMIUM_PATH'):opts['executable_path']=os.environ['CHROMIUM_PATH']
        browser=p.chromium.launch(**opts)
        for width,height in [(320,740),(390,844),(768,1024),(1280,900)]:
            page=launch(browser,width=width,height=height)
            expect(page.locator('#ary-voice-consent')).to_be_visible()
            expect(page.locator('#ary-voice-consent-allow')).to_have_text('Sí, permitir')
            expect(page.locator('#ary-voice-consent-skip')).to_have_text('No por ahora')
            assert page.evaluate('__voice.probes===0&&__voice.listens===0&&__voice.spoken.length===0')
            for image in page.locator('#ary-assistant img, #ary-voice-consent img').all():
                expect(image).to_have_attribute('src',MASCOT)
                wait(page,'()=>Array.from(document.querySelectorAll("#ary-assistant img,#ary-voice-consent img")).every(i=>i.complete&&i.naturalWidth>0)')
            if width in (390,1280):page.screenshot(path=str(OUT/f'voice-consent-{width}.png'))
            accept(page)
            assert page.evaluate('__voice.probes===1&&__voice.stopped===1')
            assert page.evaluate('__voice.requests[0]')=={'audio':True,'video':False}
            expect(page.locator('.ary-voice-actions button')).to_have_count(1)
            for name in ('#ary-chat','#ary-voice-mic','#ary-voice-audio','#ary-voice-repeat'):
                expect(page.locator(name)).to_have_count(0)
            say(page,'quiero facturar')
            expect(page.locator('#tab-factura')).to_have_attribute('aria-selected','true')
            expect(page.locator('#ary-assistant-count')).to_have_text('Paso 1 de 11');spoken(page,'Elige tu estación')
            say(page,'siguiente');expect(page.locator('#ary-assistant-count')).to_have_text('Paso 2 de 11');spoken(page,'Escribe tu RFC registrado')
            say(page,'anterior');expect(page.locator('#ary-assistant-count')).to_have_text('Paso 1 de 11')
            before=page.evaluate('__voice.spoken.length');say(page,'repetir');wait(page,'n=>__voice.spoken.length>n',before)
            say(page,'quiero darme de alta');expect(page.locator('#tab-alta')).to_have_attribute('aria-selected','true')
            for index in range(2,10):
                spoken(page,f'Paso {index-1} de 9');say(page,'siguiente')
                expect(page.locator('#ary-assistant-count')).to_have_text(f'Paso {index} de 9')
            expect(page.locator('#form-alta input[name="confirmado"]')).not_to_be_checked()
            expect(page.locator('#alta-rfc')).to_have_value('')
            spoken(page,'Paso 9 de 9');say(page,'siguiente')
            expect(page.locator('#ary-assistant-panel')).to_be_hidden();wait(page,'__voice.active.onresult===null')
            finish(page,f'consent:first-load-yes-full-guide:{width}')

        page=launch(browser);page.locator('#ary-voice-consent-skip').click();open_help(page)
        expect(page.locator('#ary-voice-toggle')).to_have_text('Activar voz')
        assert page.evaluate('__voice.probes===0&&__voice.listens===0')
        page.locator('#ary-assistant-close').click();open_help(page)
        assert page.evaluate('__voice.probes===0')
        page.locator('#ary-voice-toggle').click();active(page)
        assert page.evaluate('__voice.probes===1')
        say(page,'quiero facturar');spoken(page,'Elige tu estación')
        page.locator('#ary-assistant-next').click();spoken(page,'Escribe tu RFC registrado')
        page.locator('#ary-voice-toggle').click();before=page.evaluate('__voice.spoken.length')
        page.locator('#ary-assistant-next').click();page.wait_for_timeout(200)
        assert page.evaluate('__voice.spoken.length')==before
        page.locator('#ary-assistant-close').click();open_help(page)
        assert page.evaluate('__voice.probes===1')
        page.locator('#ary-voice-toggle').click();say(page,'repetir');spoken(page,'Captura el folio del ticket')
        finish(page,'consent:no-later-activation-manual-steps-deactivate')

        page=launch(browser);page.locator('#ary-voice-consent-skip').click();page.reload(wait_until='networkidle')
        expect(page.locator('#ary-voice-consent')).to_be_hidden();open_help(page)
        assert page.evaluate('__voice.probes===0&&__voice.listens===0')
        finish(page,'consent:no-is-kept-on-reload')

        page=launch(browser);expect(page.locator('#ary-voice-consent-skip')).to_be_focused()
        page.keyboard.press('Tab');expect(page.locator('#ary-voice-consent-allow')).to_be_focused()
        page.keyboard.press('Shift+Tab');expect(page.locator('#ary-voice-consent-skip')).to_be_focused()
        page.keyboard.press('Escape');expect(page.locator('#ary-voice-consent')).to_be_hidden()
        expect(page.locator('#ary-assistant-launcher')).to_be_focused();assert page.evaluate('__voice.probes===0')
        finish(page,'consent:keyboard-escape-is-no')

        page=launch(browser,media='NotAllowedError');page.locator('#ary-voice-consent-allow').click()
        expect(page.locator('#ary-voice-status')).to_contain_text('bloqueado')
        expect(page.locator('#ary-voice-toggle')).to_have_text('Activar voz')
        page.wait_for_timeout(700);assert page.evaluate('__voice.probes===1&&__voice.listens===0')
        page.evaluate('__voice.mode="allow"');page.locator('#ary-voice-toggle').click();active(page)
        assert page.evaluate('__voice.probes===2');finish(page,'consent:native-denial-explicit-retry')

        for method in ['cancel','close','review','hidden']:
            page=launch(browser,media='pending');page.locator('#ary-voice-consent-allow').click()
            expect(page.locator('#ary-voice-toggle')).to_have_text('Cancelar activación')
            if method=='cancel':page.locator('#ary-voice-toggle').click()
            elif method=='close':page.locator('#ary-assistant-close').click()
            elif method=='review':page.evaluate('document.getElementById("reviewDialog").showModal()')
            else:page.evaluate('Object.defineProperty(document,"visibilityState",{configurable:true,value:"hidden"});document.dispatchEvent(new Event("visibilitychange"));')
            page.wait_for_timeout(100);page.evaluate('__voice.pending[0].resolve()')
            wait(page,'__voice.stopped===1');assert page.evaluate('__voice.listens===0')
            finish(page,'consent:late-permission-released:'+method)

        page=launch(browser);page.evaluate('document.getElementById("ary-voice-consent-allow").click()')
        expect(page.locator('#ary-voice-consent')).to_be_visible();assert page.evaluate('__voice.probes===0')
        finish(page,'consent:synthetic-click-does-not-request-microphone')

        page=launch(browser);accept(page)
        for text in ['No quiero facturar','Quiero facturar y darme de alta','AAA010101AAA','prueba@example.com','enviar solicitud','confirmar']:
            say(page,text);expect(page.locator('#ary-assistant-home')).to_be_visible();spoken(page,'No reconocí')
        assert 'AAA010101AAA' not in page.evaluate('JSON.stringify(__voice.spoken)')
        assert 'prueba@example.com' not in page.locator('#ary-voice').inner_text()
        finish(page,'voice:ambiguous-sensitive-no-submit')

        page=launch(browser);accept(page);page.evaluate('__voiceError("no-speech")');wait(page,'__voice.listens>=2')
        active(page);page.evaluate('__endVoice()');wait(page,'__voice.listens>=3');active(page)
        finish(page,'voice:restart-after-silence-and-end')

        page=launch(browser);accept(page);page.evaluate('__voiceError("not-allowed")')
        expect(page.locator('#ary-voice-status')).to_contain_text('no tiene permiso')
        expect(page.locator('#ary-voice-toggle')).to_have_text('Activar voz')
        page.wait_for_timeout(800);assert page.evaluate('__voice.listens===1')
        finish(page,'voice:recognition-denied-no-loop')

        page=launch(browser);accept(page);page.evaluate('()=>{window.__stale=__voice.active.onresult;}')
        page.locator('#ary-assistant-close').click()
        page.evaluate('const r=[{transcript:"quiero facturar"}];r.isFinal=true;__stale({results:[r],resultIndex:0});')
        expect(page.locator('#ary-assistant-panel')).to_be_hidden();assert page.evaluate('__voice.active.onresult===null')
        finish(page,'voice:close-rejects-late-command')

        page=launch(browser);accept(page);page.evaluate('document.getElementById("reviewDialog").showModal()')
        expect(page.locator('#ary-assistant-panel')).to_be_hidden();wait(page,'__voice.active.onresult===null')
        assert page.evaluate('__voice.aborts>=1');finish(page,'voice:review-stops-recognition')

        for speech in (True,False):
            page=launch(browser,recognition=False,speech=speech)
            expect(page.locator('#ary-voice-consent-allow')).to_be_disabled()
            page.locator('#ary-voice-consent-skip').click();open_help(page)
            expect(page.locator('#ary-voice-toggle')).to_be_disabled()
            page.locator('[data-ary-guide="alta"]').click()
            expect(page.locator('#ary-assistant-count')).to_have_text('Paso 1 de 9')
            assert page.evaluate('__voice.probes===0&&__voice.listens===0')
            finish(page,f'voice:unsupported-fallback:{speech}')

        page=launch(browser,route='/');accept(page);say(page,'quiero facturar')
        expect(page).to_have_url(re.compile(r'/facturacion/\?guia=factura&voz=1'))
        expect(page.locator('#ary-voice-consent')).to_be_hidden()
        expect(page.locator('#ary-assistant-count')).to_have_text('Paso 1 de 11')
        assert page.evaluate('__voice.probes===0&&__voice.listens===0')
        page.locator('#ary-assistant-launcher').click();say(page,'repetir');spoken(page,'Elige tu estación')
        finish(page,'voice:navigation-requires-fresh-click')
        browser.close()
    (OUT/'voice-report.json').write_text(json.dumps(RESULTS,ensure_ascii=False,indent=2),encoding='utf-8')
    print(f'{len(RESULTS)} voice/browser checks passed. No real mic, speech or billing.')
if __name__=='__main__':run()
