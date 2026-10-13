"""Voice replaces the chat. All speech and billing are simulated; no real mic/API.
The historical test filename is kept so the existing CI runs this regression.
"""
import json
import os
import re
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect
ROOT = Path(__file__).resolve().parents[1]
DIST = Path(os.getenv('ARY_TEST_DIST', ROOT / 'dist'))
BASE = os.getenv('ARY_TEST_URL', 'http://127.0.0.1:4173').rstrip('/')
OUT = ROOT / 'test-results'; OUT.mkdir(exist_ok=True)
CATALOG = json.loads(re.search(r'const INITIAL = (\{.*?\});', (DIST / 'facturacion/index.html').read_text(encoding='utf-8'))[1])
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
 speak:u=>{__voice.spoken.push(u.text); setTimeout(()=>{u.onstart?.({});u.onend?.({});},0);}
}});
window.__emitVoice = text => {
 const result=[{transcript:text,confidence:0.99}]; result.isFinal=true;
 __voice.active?.onresult?.({resultIndex:0,results:[result]});
};
"""


def launch(browser, route='/facturacion/', width=390, height=844, recognition=True, speech=True):
    context = browser.new_context(viewport={'width': width, 'height': height}, reduced_motion='reduce')
    init = MOCK_SPEECH
    if not recognition: init += '\nwindow.SpeechRecognition=undefined;'
    if not speech: init += '\nwindow.SpeechSynthesisUtterance=undefined;'
    context.add_init_script(init)
    page = context.new_page(); errors, forbidden, posts = [], [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda msg: errors.append(msg.text) if msg.type == 'error' and ('Content Security Policy' in msg.text or 'Refused to execute' in msg.text) else None)

    def intercept(r):
        req = r.request
        path = urlparse(req.url).path
        if not req.url.startswith(BASE + '/') or path.startswith('/api/asistente/'):
            forbidden.append(req.url); r.abort(); return
        if path.startswith('/api/facturacion/'):
            if req.method != 'GET': posts.append(path)
            r.fulfill(status=200, content_type='application/json', body=json.dumps(dict(CATALOG, csrf='MOCK-VOICE', modo_seguro=True, aceptando=True)))
        else: r.continue_()
    context.route('**/*', intercept)
    page.goto(BASE + route, wait_until='networkidle')
    expect(page.locator('#ary-voice')).to_have_count(1)
    page._test = context, errors, forbidden, posts
    return page


def finish(page, name):
    context, errors, forbidden, posts = page._test
    assert not errors, (name, errors)
    assert not forbidden, (name, forbidden)
    assert not posts, (name, 'Voice/guide must never send requests', posts)
    assert not page.evaluate('document.documentElement.scrollWidth > innerWidth + 1'), name
    RESULTS.append({'name':name, 'result':'passed'})
    print('PASS', name, flush=True); context.close()


def say(page, text):
    page.locator('#ary-voice-mic').click()
    expect(page.locator('#ary-voice-mic')).to_have_attribute('aria-pressed', 'true')
    page.evaluate('(text)=>__emitVoice(text)', text)


def spoken(page, text):
    page.wait_for_function('(text)=>__voice.spoken.some(s=>s.includes(text))', arg=text)


def open_help(page):
    if page.locator('#ary-assistant-panel').is_hidden(): page.locator('#ary-assistant-launcher').click()


def run():
    with sync_playwright() as p:
        options = {'headless': True}
        if os.getenv('CHROMIUM_PATH'): options['executable_path'] = os.environ['CHROMIUM_PATH']
        browser = p.chromium.launch(**options)
        for width, height in [(320,740), (390,844), (768,1024), (1280,900)]:
            page=launch(browser, width=width, height=height)
            open_help(page)
            expect(page.locator('#ary-chat')).to_have_count(0)
            expect(page.get_by_text('Conversar con el asistente', exact=True)).to_have_count(0)
            assert page.evaluate('__voice.listens') == 0
            assert page.evaluate('__voice.spoken.length') == 0
            assert page.locator('#ary-assistant-launcher img').get_attribute('src') == '/media/ary-mascota-pemex.webp'
            say(page, 'Quiero facturar.')
            expect(page.locator('#tab-factura')).to_have_attribute('aria-selected','true')
            expect(page.locator('#ary-assistant-count')).to_have_text('Paso 1 de 11')
            spoken(page, 'Elige tu estación')
            say(page, 'siguiente')
            expect(page.locator('#ary-assistant-count')).to_have_text('Paso 2 de 11')
            spoken(page, 'Escribe tu RFC registrado')
            say(page, 'anterior')
            expect(page.locator('#ary-assistant-count')).to_have_text('Paso 1 de 11')
            before=page.evaluate('__voice.spoken.length')
            say(page, 'repetir')
            page.wait_for_function('(n)=>__voice.spoken.length>n', arg=before)
            say(page, 'quiero darme de alta')
            expect(page.locator('#tab-alta')).to_have_attribute('aria-selected','true')
            expect(page.locator('#ary-assistant-count')).to_have_text('Paso 1 de 9')
            for index in range(2,10):
                say(page, 'siguiente')
                expect(page.locator('#ary-assistant-count')).to_have_text(f'Paso {index} de 9')
                spoken(page, f'Paso {index} de 9')
            expect(page.locator('#form-alta input[name="confirmado"]')).not_to_be_checked()
            expect(page.locator('#alta-rfc')).to_have_value('')
            if width in (390,1280): page.screenshot(path=str(OUT/f'voice-alta-{width}.png'))
            say(page, 'siguiente')
            expect(page.locator('#ary-assistant-panel')).to_be_hidden()
            finish(page, f'voice:commands-and-alta:{width}')

        page=launch(browser); open_help(page)
        page.locator('[data-ary-guide="factura"]').click()
        spoken(page, 'Elige tu estación')
        page.locator('#ary-assistant-next').click()
        spoken(page, 'Escribe tu RFC registrado')
        page.locator('#ary-voice-audio').click()
        before=page.evaluate('__voice.spoken.length')
        page.locator('#ary-assistant-next').click();page.wait_for_timeout(200)
        assert page.evaluate('__voice.spoken.length')==before
        page.locator('#ary-voice-repeat').click();spoken(page,'Captura el folio del ticket')
        finish(page,'voice:manual-steps-mute-repeat')

        page=launch(browser);open_help(page)
        for text in ['No quiero facturar', 'Quiero facturar y darme de alta', 'AAA010101AAA', 'prueba@example.com', 'enviar solicitud', 'confirmar']:
            say(page,text)
            expect(page.locator('#ary-assistant-home')).to_be_visible()
        assert 'AAA010101AAA' not in page.evaluate('JSON.stringify(__voice.spoken)')
        assert 'prueba@example.com' not in page.locator('#ary-voice').inner_text()
        finish(page,'voice:ambiguous-negated-sensitive-never-send')

        page=launch(browser);open_help(page)
        page.locator('#ary-voice-mic').click()
        page.evaluate("__voice.active.onerror({error:'not-allowed'})")
        expect(page.locator('#ary-voice-status')).to_contain_text('no tiene permiso')
        expect(page.locator('#ary-voice-mic')).to_have_attribute('aria-pressed','false')
        assert page.evaluate('__voice.listens')==1
        finish(page,'voice:permission-denied-no-retry')

        page=launch(browser);open_help(page)
        page.locator('#ary-voice-mic').click()
        page.evaluate('() => { window.__stale = __voice.active.onresult; }')
        page.locator('#ary-assistant-close').click()
        page.evaluate("const r=[{transcript:'quiero facturar'}];r.isFinal=true;__stale({results:[r],resultIndex:0})")
        expect(page.locator('#ary-assistant-panel')).to_be_hidden()
        assert page.evaluate('__voice.active.onresult') is None
        finish(page,'voice:late-result-after-close-ignored')

        page=launch(browser);open_help(page)
        page.locator('#ary-voice-mic').click()
        page.evaluate('document.getElementById("reviewDialog").showModal()')
        expect(page.locator('#ary-assistant-panel')).to_be_hidden()
        page.wait_for_function('__voice.active.onresult===null')
        assert page.evaluate('__voice.aborts')>=1
        finish(page,'voice:review-stops-listening')

        for recognition, speech in [(False,True),(False,False)]:
            page=launch(browser,recognition=recognition,speech=speech);open_help(page)
            expect(page.locator('#ary-voice-mic')).to_be_disabled()
            page.locator('[data-ary-guide="alta"]').click()
            expect(page.locator('#ary-assistant-count')).to_have_text('Paso 1 de 9')
            assert page.evaluate('__voice.listens')==0
            if not speech: expect(page.locator('#ary-voice-repeat')).to_be_disabled()
            finish(page,f'voice:unsupported-fallback:{speech}')

        page=launch(browser,route='/');open_help(page)
        say(page,'quiero facturar')
        expect(page).to_have_url(re.compile('/facturacion/\\?guia=factura&voz=1'))
        expect(page.locator('#ary-assistant-count')).to_have_text('Paso 1 de 11')
        assert page.evaluate('__voice.spoken.length')==0
        page.locator('#ary-voice-audio').click();spoken(page,'Elige tu estación')
        finish(page,'voice:home-navigation-no-autoplay-after-navigation')
        browser.close()
    (OUT/'voice-report.json').write_text(json.dumps(RESULTS,ensure_ascii=False,indent=2),encoding='utf-8')
    print(f'{len(RESULTS)} voice/browser checks passed. No live speech or billing.')

if __name__=='__main__':run()
