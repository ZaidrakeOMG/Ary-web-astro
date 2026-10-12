"""Assistant chat regression: mock ALL APIs, never contact live billing or OpenAI."""
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

def run():
    with sync_playwright() as p:
        options = {'headless': True}
        if os.getenv('CHROMIUM_PATH'): options['executable_path'] = os.environ['CHROMIUM_PATH']
        browser = p.chromium.launch(**options)
        for width, height in [(320, 740), (390, 844), (768, 1024), (1280, 900)]:
            context = browser.new_context(viewport={'width': width, 'height': height}, reduced_motion='reduce')
            page = context.new_page(); errors = []; requests = []; posts = []; replies = {'fail': False}
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on('console', lambda message: errors.append(message.text) if message.type == 'error' and ('Content Security Policy' in message.text or 'Refused to execute' in message.text) else None)
            def route(r):
                req = r.request
                assert req.url.startswith(BASE + '/'), req.url
                path = urlparse(req.url).path
                if path.startswith('/api/facturacion/'):
                    assert req.method == 'GET', 'Chat must never send billing requests'
                    r.fulfill(status=200, content_type='application/json', body=json.dumps(dict(CATALOG, csrf='MOCK-CHAT', modo_seguro=True, aceptando=True)))
                elif path.startswith('/api/asistente/'):
                    requests.append(path)
                    if path.endswith('/salud'):
                        r.fulfill(status=200, content_type='application/json', body=json.dumps({'ready': True}))
                    else:
                        posts.append(req.post_data_json)
                        assert req.headers['x-ary-chat'] == '1'
                        r.fulfill(status=503 if replies['fail'] else 200, content_type='application/json', body=json.dumps({'error':'MOCK-ERROR'} if replies['fail'] else {'mode':'ia', 'reply':'Respuesta simulada <img src=x onerror=alert(1)> usa el botón Flotillas.'}))
                else: r.continue_()
            context.route('**/*', route)
            page.goto(BASE + '/', wait_until='networkidle')
            expect(page.locator('#ary-greeting')).to_be_visible(timeout=5000)
            assert not requests
            b = page.locator('#ary-greeting').bounding_box()
            assert b['x'] >= 0 and b['x'] + b['width'] <= width + 1
            assert page.locator('#ary-assistant-launcher img').get_attribute('src') == '/media/ary-mascota-pemex.webp'
            assert page.locator('#ary-assistant-launcher img').evaluate('(img) => img.complete && img.naturalWidth > 0')
            if width in (390, 1280): page.screenshot(path=str(OUT / f'chat-greeting-{width}.png'))
            page.locator('.ary-greeting-open').click()
            expect(page.locator('#ary-greeting')).to_be_hidden()
            page.locator('#ary-chat > summary').click()
            page.locator('#ary-chat-message').fill('¿Cómo entro a Flotillas?'); page.locator('#ary-chat-send').click()
            expect(page.locator('#ary-chat-log')).to_contain_text('puerto 4443')
            assert not requests
            page.locator('#ary-chat-consent').check()
            expect(page.locator('#ary-chat-status')).to_contain_text('IA habilitada')
            page.locator('#ary-chat-message').fill('AAA010101AAA'); page.locator('#ary-chat-send').click()
            expect(page.locator('#ary-chat-status')).to_contain_text('No se envió')
            assert not posts
            page.locator('#ary-chat-message').fill('Ayúdame a entrar a flotillas'); page.locator('#ary-chat-send').click()
            expect(page.locator('#ary-chat-log')).to_contain_text('Respuesta simulada')
            assert len(posts) == 1 and posts[0]['history'] == []
            assert page.locator('#ary-chat-log img').count() == 0
            expect(page.locator('#ary-chat-status')).to_contain_text('Respuesta de IA')
            if width in (390, 1280): page.screenshot(path=str(OUT / f'chat-open-{width}.png'))
            replies['fail'] = True
            page.locator('#ary-chat-message').fill('Quiero darme de alta'); page.locator('#ary-chat-send').click()
            expect(page.locator('#ary-chat-status')).to_contain_text('no respondió')
            expect(page.locator('#ary-chat-consent')).not_to_be_checked()
            page.locator('.ary-chat-clear').click()
            assert page.locator('#ary-chat-log .ary-chat-message').count() == 1
            page.keyboard.press('Escape')
            page.goto(BASE + '/facturacion/?guia=factura', wait_until='networkidle')
            expect(page.locator('#ary-assistant-count')).to_have_text('Paso 1 de 11')
            expect(page.locator('#ary-greeting')).to_be_hidden()
            page.locator('#ary-assistant-next').click()
            expect(page.locator('#ary-assistant-count')).to_have_text('Paso 2 de 11')
            assert not page.locator('#form-factura input[name=confirmado]').is_checked()
            assert not page.evaluate('document.documentElement.scrollWidth > innerWidth + 1')
            assert not errors, errors
            RESULTS.append({'viewport': [width,height], 'result':'passed', 'api':'mock-only'})
            print('PASS chat', width, height, flush=True)
            context.close()
        browser.close()
    (OUT / 'chat-report.json').write_text(json.dumps(RESULTS, indent=2), encoding='utf-8')
if __name__ == '__main__': run()
