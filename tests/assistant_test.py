"""Mascot regression tests against compiled HTML, including CSP.
All billing API traffic is intercepted with synthetic data; no live billing runs.
Run after build with the same local HTTP server used by browser_test.py.
"""
from __future__ import annotations
import json
import os
import re
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-results'
OUT.mkdir(exist_ok=True)
BASE = os.getenv('ARY_TEST_URL', 'http://127.0.0.1:4173').rstrip('/')
SOURCE = (ROOT / 'dist/facturacion/index.html').read_text(encoding='utf-8')
CATALOG = json.loads(re.search(r'const INITIAL = (\{.*?\});', SOURCE)[1])
RESULTS = []


def launch(browser, route='/facturacion/', width=390, height=844, offline=False):
    context = browser.new_context(viewport={'width': width, 'height': height}, reduced_motion='reduce')
    page = context.new_page()
    sent, errors, bad = [], [], []
    receipt = {}
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda msg: errors.append(msg.text) if msg.type == 'error' and ('Content Security Policy' in msg.text or 'Refused to execute' in msg.text) else None)

    def route_request(r):
        req = r.request
        if not req.url.startswith(BASE + '/'):
            bad.append(req.url)
            r.abort()
            return
        if '/api/facturacion/' not in req.url:
            r.continue_()
            return
        endpoint = urlparse(req.url).path.rsplit('/', 1)[-1]
        if endpoint == 'opciones':
            data = dict(CATALOG, csrf='MOCK-CSRF-ASSISTANT', modo_seguro=True, aceptando=True)
            if offline:
                r.fulfill(status=502, content_type='application/json', body=json.dumps({'error': 'Sin conexion en esta prueba'}))
                return
        elif endpoint == 'solicitudes':
            body = req.post_data_json
            sent.append(body)
            receipt.update(tipo=body['tipo'], referencia='ARY-DEMO-ASSISTANT', seguimiento='MOCK-TRACK', estado='EN_COLA', modo_seguro=True, mensaje='Solo simulacion de navegador')
            data = receipt
        elif endpoint in ('estado', 'recepcion'):
            data = receipt
        else:
            bad.append(req.url)
            r.abort()
            return
        r.fulfill(status=200, content_type='application/json', body=json.dumps(data))

    context.route('**/*', route_request)
    page.on('response', lambda response: bad.append(f'{response.status} {response.url}') if response.status >= 400 and '/api/facturacion/' not in response.url else None)
    page.goto(BASE + route, wait_until='networkidle')
    expect(page.locator('#ary-assistant-launcher')).to_be_visible()
    page._test = (context, sent, errors, bad)
    return page


def finish(page, name):
    context, sent, errors, bad = page._test
    assert not errors, (name, errors)
    assert not bad, (name, bad)
    assert not page.evaluate('document.documentElement.scrollWidth > innerWidth + 1'), name
    RESULTS.append({'name': name, 'result': 'passed'})
    print('PASS', name, flush=True)
    context.close()


def begin(page, kind):
    if page.locator('#ary-assistant-panel').is_hidden():
        page.locator('#ary-assistant-launcher').click()
    if page.locator('#ary-assistant-home').is_hidden():
        page.locator('#ary-assistant-menu').click()
    page.locator(f'[data-ary-guide="{kind}"]').click()
    expect(page.locator('#ary-assistant-panel')).to_be_visible()
    expect(page.locator('#tab-' + kind)).to_have_attribute('aria-selected', 'true')


def fill(page, kind):
    page.locator('#tab-' + kind).click()
    page.locator('#' + kind + '-estacion').select_option('ARY I')
    page.locator('#' + kind + '-rfc').fill('AAA010101AAA')
    if kind == 'alta':
        page.locator('#alta-idcif').fill('12345678901')
        page.locator('#alta-telefono').fill('8711234567')
    else:
        page.locator('#factura-ticket').fill('12345')
        page.locator('#factura-fecha').fill(page.locator('#factura-fecha').get_attribute('max'))
        page.locator('#factura-pago').select_option('EFECTIVO')
    page.locator('#' + kind + '-correo').fill('prueba@example.com')
    page.locator('#' + kind + '-confirmacion').fill('prueba@example.com')
    page.locator('#form-' + kind + ' input[name="confirmado"]').check()


def main():
    with sync_playwright() as p:
        options = {'headless': True}
        if os.getenv('CHROMIUM_PATH'):
            options['executable_path'] = os.environ['CHROMIUM_PATH']
        browser = p.chromium.launch(**options)
        for width, height in [(320, 740), (390, 844), (844, 390), (1280, 900)]:
            page = launch(browser, '/', width, height)
            expect(page.locator('#ary-assistant-panel')).to_be_hidden()
            page.locator('#ary-assistant-launcher').click()
            expect(page.locator('#ary-assistant-panel')).to_be_visible()
            assert page.locator('#ary-assistant-panel').bounding_box()['y'] >= 0
            if width == 390:
                page.screenshot(path=str(OUT / 'assistant-home-390.png'))
            page.keyboard.press('Escape')
            expect(page.locator('#ary-assistant-launcher')).to_be_focused()
            finish(page, f'assistant:home:{width}')
            for kind, count in [('alta', 9), ('factura', 11)]:
                page = launch(browser, '/facturacion/?guia=' + kind, width, height)
                expect(page.locator('#ary-assistant-count')).to_have_text(f'Paso 1 de {count}')
                expect(page.locator('#tab-' + kind)).to_have_attribute('aria-selected', 'true')
                for index in range(count):
                    expect(page.locator('#ary-assistant-count')).to_have_text(f'Paso {index+1} de {count}')
                    if index < count - 1:
                        assert page.locator('.ary-assistant-target').count() == 1
                    else:
                        expect(page.locator('#ary-assistant-notice')).to_be_visible()
                    assert not page._test[1], 'Guide must never POST'
                    expect(page.locator('#form-' + kind + ' input[name="confirmado"]')).not_to_be_checked()
                    if (width == 390 and kind == 'alta' and index == 2) or (width == 1280 and kind == 'factura' and index == 0):
                        page.screenshot(path=str(OUT / f'assistant-{kind}-{width}.png'))
                    page.locator('#ary-assistant-next').click()
                expect(page.locator('#ary-assistant-panel')).to_be_hidden()
                assert page.locator('.ary-assistant-target').count() == 0
                assert not page._test[1]
                finish(page, f'assistant:all-steps:{kind}:{width}')

        page = launch(browser)
        begin(page, 'alta')
        page.locator('#ary-assistant-next').click()
        expect(page.locator('#alta-rfc')).to_have_attribute('aria-describedby', re.compile('ary-assistant-description'))
        page.locator('#ary-assistant-field').click()
        expect(page.locator('#ary-assistant-panel')).to_be_hidden()
        expect(page.locator('#alta-rfc')).to_be_focused()
        page.locator('#alta-rfc').fill('AAA010101AAA')
        page.locator('#ary-assistant-launcher').click()
        expect(page.locator('#ary-assistant-count')).to_have_text('Paso 2 de 9')
        page.locator('#ary-assistant-next').click()
        page.locator('#ary-assistant-prev').click()
        expect(page.locator('#alta-rfc')).to_have_value('AAA010101AAA')
        page.keyboard.press('Escape')
        expect(page.locator('#alta-rfc')).to_have_attribute('aria-describedby', 'alta-rfc-hint')
        assert not page._test[1]
        finish(page, 'assistant:editing-resume-preserve-value-and-hint')

        page = launch(browser)
        begin(page, 'alta')
        page.locator('#tab-factura').click()
        expect(page.locator('#ary-assistant-kind')).to_have_text('Facturar ticket')
        page.locator('#menuButton').click()
        expect(page.locator('#ary-assistant')).to_be_hidden()
        page.keyboard.press('Escape')
        expect(page.locator('#ary-assistant')).to_be_visible()
        page.emulate_media(media='print')
        expect(page.locator('#ary-assistant')).to_be_hidden()
        page.emulate_media(media='screen')
        finish(page, 'assistant:manual-tab-mobile-menu-print')

        for kind in ['alta', 'factura']:
            page = launch(browser, width=1280, height=900)
            fill(page, kind)
            begin(page, kind)
            page.locator('#form-' + kind + ' .submit').click()
            if kind == 'factura':
                expect(page.locator('#reviewDialog')).to_be_visible()
                expect(page.locator('#ary-assistant')).to_be_hidden()
                assert not page._test[1]
                page.locator('#reviewBack').click()
                expect(page.locator('#ary-assistant')).to_be_visible()
                page.locator('#form-factura .submit').click()
                page.locator('#reviewConfirm').click()
            expect(page.locator('#receipt')).to_be_visible()
            expect(page.locator('#ary-assistant-step')).to_have_text('Conserva tu referencia')
            assert len(page._test[1]) == 1
            page.locator('#ary-assistant-next').click()
            assert len(page._test[1]) == 1
            finish(page, 'assistant:manual-submit-only:' + kind)

        page = launch(browser, offline=True)
        begin(page, 'alta')
        for _ in range(7):
            page.locator('#ary-assistant-next').click()
        expect(page.locator('#ary-assistant-notice')).to_be_visible()
        expect(page.locator('#ary-assistant-field')).to_be_disabled()
        assert not page._test[1]
        finish(page, 'assistant:offline-does-not-enable-submit')

        page = launch(browser, '/')
        page.locator('#ary-assistant-launcher').click()
        page.locator('[data-ary-guide="factura"]').click()
        expect(page.locator('#ary-assistant-count')).to_have_text('Paso 1 de 11')
        assert not page._test[1]
        finish(page, 'assistant:home-navigation-starts-selected-guide')
        browser.close()
    (OUT / 'assistant-report.json').write_text(json.dumps(RESULTS, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'{len(RESULTS)} assistant checks passed; all billing simulated.')


if __name__ == '__main__':
    main()
