"""Prueba del monito ARY: un toque activa voz, un único control desactiva.
Micrófono, voz hablada y API fiscal simulados. No toca Polaris ni facturas.
"""
import json
import os
import re
import time
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
DIST = Path(os.getenv('ARY_TEST_DIST', ROOT / 'dist'))
BASE = os.getenv('ARY_TEST_URL', 'http://127.0.0.1:4173').rstrip('/')
OUT = ROOT / 'test-results'
OUT.mkdir(exist_ok=True)
CATALOG = json.loads(re.search(
    r'const INITIAL = (\{.*?\});',
    (DIST / 'facturacion/index.html').read_text(encoding='utf-8'))[1])
RESULTS = []

MOCK_SPEECH = r"""
window.__voice = { listens:0, aborts:0, spoken:[], cancels:0, active:null };
class FakeRecognition {
  start() { __voice.active=this; __voice.listens++; this.onstart?.({}); }
  abort() { __voice.aborts++; this.onend?.({}); }
}
window.SpeechRecognition = FakeRecognition;
window.webkitSpeechRecognition = undefined;
window.SpeechSynthesisUtterance = class { constructor(text) { this.text=text; } };
Object.defineProperty(window, 'speechSynthesis', {configurable:true, value:{
  getVoices:()=>[{lang:'es-MX',name:'Voz de prueba'}],
  cancel:()=>{__voice.cancels++;},
  speak:u=>{__voice.spoken.push(u.text); setTimeout(()=>{u.onstart?.({});u.onend?.({});},15);}
}});
window.__emitVoice = text => {
  const result=[{transcript:text,confidence:0.99}]; result.isFinal=true;
  __voice.active?.onresult?.({resultIndex:0,results:[result]});
};
window.__endVoice = () => __voice.active?.onend?.({});
window.__voiceError = error => __voice.active?.onerror?.({error});
"""

def launch(browser, route='/facturacion/', width=390, height=844, recognition=True, speech=True):
    context = browser.new_context(
        viewport={'width':width,'height':height}, reduced_motion='reduce')
    init = MOCK_SPEECH
    if not recognition:
        init += '\nwindow.SpeechRecognition=undefined;'
    if not speech:
        init += '\nwindow.SpeechSynthesisUtterance=undefined;'
    context.add_init_script(init)
    page = context.new_page()
    errors, forbidden, posts = [], [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda msg: errors.append(msg.text)
            if msg.type == 'error' and ('Content Security Policy' in msg.text
                                       or 'Refused to execute' in msg.text) else None)

    def intercept(route):
        req = route.request
        path = urlparse(req.url).path
        if not req.url.startswith(BASE + '/') or path.startswith('/api/asistente/'):
            forbidden.append(req.url)
            route.abort()
            return
        if path.startswith('/api/facturacion/'):
            if req.method != 'GET':
                posts.append(path)
            route.fulfill(status=200, content_type='application/json',
                          body=json.dumps(dict(CATALOG, csrf='MOCK-VOICE',
                                              modo_seguro=True, aceptando=True)))
        else:
            route.continue_()

    context.route('**/*', intercept)
    page.goto(BASE + route, wait_until='networkidle')
    expect(page.locator('#ary-voice')).to_have_count(1)
    page._test = context, errors, forbidden, posts
    return page

def finish(page, name):
    context, errors, forbidden, posts = page._test
    assert not errors, (name, errors)
    assert not forbidden, (name, forbidden)
    assert not posts, (name, 'No deben enviarse solicitudes fiscales', posts)
    assert not page.evaluate('document.documentElement.scrollWidth > innerWidth + 1'), name
    RESULTS.append({'name':name,'result':'passed'})
    print('PASS',name,flush=True)
    context.close()

def wait(page, expression, arg=None, timeout=6.0):
    """Polling through Playwright evaluate (wait_for_function uses eval blocked by CSP)."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if page.evaluate(expression, arg):
            return
        page.wait_for_timeout(60)
    raise AssertionError('No se cumplió la condición simulada: ' + expression)

def open_help(page):
    if page.locator('#ary-assistant-panel').is_hidden():
        page.locator('#ary-assistant-launcher').click()

def active(page):
    expect(page.locator('#ary-voice-toggle')).to_have_text('Desactivar voz')
    expect(page.locator('#ary-voice-toggle')).to_have_attribute('aria-pressed','true')
    wait(page, 'Boolean(__voice.active?.onresult)')

def say(page, text):
    active(page)
    page.evaluate('(text)=>__emitVoice(text)', text)

def spoken(page, text):
    wait(page, 'text => __voice.spoken.some(s=>s.includes(text))', text)

def run():
    with sync_playwright() as p:
        settings = {'headless':True}
        if os.getenv('CHROMIUM_PATH'):
            settings['executable_path'] = os.environ['CHROMIUM_PATH']
        browser = p.chromium.launch(**settings)

        for width,height in [(320,740),(390,844),(768,1024),(1280,900)]:
            page = launch(browser,width=width,height=height)
            assert page.evaluate('__voice.listens') == 0
            open_help(page)
            expect(page.locator('#ary-chat')).to_have_count(0)
            expect(page.get_by_text('Conversar con el asistente',exact=True)).to_have_count(0)
            expect(page.locator('.ary-voice-actions button')).to_have_count(1)
            expect(page.locator('#ary-voice-mic')).to_have_count(0)
            expect(page.locator('#ary-voice-audio')).to_have_count(0)
            expect(page.locator('#ary-voice-repeat')).to_have_count(0)
            assert page.evaluate('__voice.listens') == 1
            assert page.locator('#ary-assistant-launcher img').get_attribute('src') == '/media/ary-mascota-pemex.webp'
            say(page,'Quiero facturar.')
            expect(page.locator('#tab-factura')).to_have_attribute('aria-selected','true')
            expect(page.locator('#ary-assistant-count')).to_have_text('Paso 1 de 11')
            spoken(page,'Elige tu estación')
            say(page,'siguiente')
            expect(page.locator('#ary-assistant-count')).to_have_text('Paso 2 de 11')
            spoken(page,'Escribe tu RFC registrado')
            say(page,'anterior')
            expect(page.locator('#ary-assistant-count')).to_have_text('Paso 1 de 11')
            spoken(page,'Elige tu estación')
            before=page.evaluate('__voice.spoken.length')
            say(page,'repetir')
            wait(page, 'n => __voice.spoken.length>n', before)
            say(page,'quiero darme de alta')
            expect(page.locator('#tab-alta')).to_have_attribute('aria-selected','true')
            expect(page.locator('#ary-assistant-count')).to_have_text('Paso 1 de 9')
            for index in range(2,10):
                spoken(page,f'Paso {index-1} de 9')
                say(page,'siguiente')
                expect(page.locator('#ary-assistant-count')).to_have_text(f'Paso {index} de 9')
            expect(page.locator('#form-alta input[name="confirmado"]')).not_to_be_checked()
            expect(page.locator('#alta-rfc')).to_have_value('')
            if width in (390,1280):
                page.screenshot(path=str(OUT/f'voice-alta-{width}.png'))
            spoken(page,'Paso 9 de 9')
            say(page,'siguiente')
            expect(page.locator('#ary-assistant-panel')).to_be_hidden()
            assert page.evaluate('__voice.active?.onresult===null')
            finish(page,f'voice:automatic-one-tap-steps:{width}')

        page=launch(browser)
        open_help(page)
        say(page,'quiero facturar')
        spoken(page,'Elige tu estación')
        original=page.evaluate('__voice.listens')
        wait(page, 'n => __voice.listens>n', original)
        page.locator('#ary-assistant-next').click()
        spoken(page,'Escribe tu RFC registrado')
        expect(page.locator('#ary-voice-toggle')).to_have_text('Desactivar voz')
        page.locator('#ary-voice-toggle').click()
        expect(page.locator('#ary-voice-toggle')).to_have_text('Activar voz')
        expect(page.locator('#ary-voice-toggle')).to_have_attribute('aria-pressed','false')
        before=page.evaluate('__voice.spoken.length')
        page.locator('#ary-assistant-next').click()
        page.wait_for_timeout(180)
        assert page.evaluate('__voice.spoken.length')==before
        page.locator('#ary-voice-toggle').click()
        say(page,'repetir')
        spoken(page,'Captura el folio del ticket')
        finish(page,'voice:disable-and-reactivate-only-one-button')

        page=launch(browser)
        open_help(page)
        for text in ['No quiero facturar','Quiero facturar y darme de alta',
                     'AAA010101AAA','prueba@example.com','enviar solicitud','confirmar']:
            say(page,text)
            expect(page.locator('#ary-assistant-home')).to_be_visible()
            spoken(page,'No reconocí')
        assert 'AAA010101AAA' not in page.evaluate('JSON.stringify(__voice.spoken)')
        assert 'prueba@example.com' not in page.locator('#ary-voice').inner_text()
        finish(page,'voice:reject-ambiguous-and-sensitive')

        page=launch(browser)
        open_help(page)
        page.evaluate("__voiceError('no-speech')")
        wait(page, '__voice.listens>=2')
        active(page)
        page.evaluate("__endVoice()")
        wait(page, '__voice.listens>=3')
        active(page)
        finish(page,'voice:autorestart-after-silence-and-end')

        page=launch(browser)
        open_help(page)
        page.evaluate("__voiceError('not-allowed')")
        expect(page.locator('#ary-voice-status')).to_contain_text('no tiene permiso')
        expect(page.locator('#ary-voice-toggle')).to_have_text('Activar voz')
        assert page.evaluate('__voice.listens')==1
        page.wait_for_timeout(950)
        assert page.evaluate('__voice.listens')==1
        finish(page,'voice:permission-denied-no-retry')

        page=launch(browser)
        open_help(page)
        page.evaluate('() => {window.__stale = __voice.active.onresult;}')
        page.locator('#ary-assistant-close').click()
        page.evaluate("const r=[{transcript:'quiero facturar'}];r.isFinal=true;__stale({results:[r],resultIndex:0})")
        expect(page.locator('#ary-assistant-panel')).to_be_hidden()
        assert page.evaluate('__voice.active.onresult') is None
        finish(page,'voice:close-rejects-late-dictation')

        page=launch(browser)
        open_help(page)
        page.evaluate('document.getElementById("reviewDialog").showModal()')
        expect(page.locator('#ary-assistant-panel')).to_be_hidden()
        wait(page, '__voice.active.onresult===null')
        assert page.evaluate('__voice.aborts')>=1
        finish(page,'voice:review-modal-stops-microphone')

        for recognition,speech in [(False,True),(False,False)]:
            page=launch(browser,recognition=recognition,speech=speech)
            open_help(page)
            expect(page.locator('#ary-voice-toggle')).to_be_disabled()
            assert page.evaluate('__voice.listens')==0
            page.locator('[data-ary-guide="alta"]').click()
            expect(page.locator('#ary-assistant-count')).to_have_text('Paso 1 de 9')
            finish(page,f'voice:unsupported-safe-fallback:{speech}')

        page=launch(browser,route='/')
        open_help(page)
        say(page,'quiero facturar')
        expect(page).to_have_url(re.compile('/facturacion/\\?guia=factura&voz=1'))
        expect(page.locator('#ary-assistant-count')).to_have_text('Paso 1 de 11')
        assert page.evaluate('__voice.listens') == 0
        page.locator('#ary-assistant-launcher').click()
        expect(page.locator('#ary-assistant-panel')).to_be_visible()
        say(page,'repetir')
        spoken(page,'Elige tu estación')
        finish(page,'voice:navigate-then-resume-on-mascot-tap')

        browser.close()
    (OUT/'voice-report.json').write_text(
        json.dumps(RESULTS,ensure_ascii=False,indent=2),encoding='utf-8')
    print(f'{len(RESULTS)} voice/browser checks passed. No live speech or billing.')

if __name__=='__main__':
    run()
