"""Browser regression suite. All billing responses are simulated; no live server is contacted.
Default: python -m http.server 4173 --directory dist & python tests/browser_test.py
Offline sandbox: ARY_OFFLINE=1 CHROMIUM_PATH=/usr/bin/chromium python tests/browser_test.py
Offline mode embeds resources and omits CSP only in its local rendering harness.
CI runs the unmodified compiled HTML over HTTP, including its CSP.
"""
from __future__ import annotations
import base64, json, mimetypes, os, re, time
from pathlib import Path
from urllib.parse import urlparse
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "test-results"
OUT.mkdir(exist_ok=True)
OFFLINE = os.getenv("ARY_OFFLINE") == "1"
BASE = os.getenv("ARY_TEST_URL", "http://127.0.0.1:4173").rstrip("/")
SOURCE = (ROOT / "legacy/billing-original.htm").read_text(encoding="utf-8")
CATALOG = json.loads(re.search(r"const INITIAL = (\{.*?\});", SOURCE)[1])
RESULTS: list[dict] = []
EXPECTED_RELEASE = re.search(r'<meta name="ary-release" content="([^"]+)"', (ROOT / 'src/layouts/SiteLayout.astro').read_text(encoding='utf-8'))[1]


def embedded(route: str) -> str:
    file = route.split("?")[0].lstrip("/")
    file += "index.html" if not file or file.endswith("/") else ""
    html = BeautifulSoup((ROOT / "dist" / file).read_text(encoding="utf-8"), "html.parser")
    for t in html.find_all("meta", attrs={"http-equiv": True}):
        t.decompose()
    for t in html.find_all("link", rel="stylesheet"):
        p = ROOT / "dist" / urlparse(t["href"]).path.lstrip("/")
        s = html.new_tag("style"); s.string = p.read_text(encoding="utf-8"); t.replace_with(s)
    for t in html.find_all("script", src=True):
        p = ROOT / "dist" / urlparse(t["src"]).path.lstrip("/")
        del t["src"]; t.string = p.read_text(encoding="utf-8")
    for t in html.find_all("img", src=True):
        p = ROOT / "dist" / urlparse(t["src"]).path.lstrip("/")
        t["src"] = "data:" + mimetypes.guess_type(p)[0] + ";base64," + base64.b64encode(p.read_bytes()).decode()
        t["loading"] = "eager"
    return str(html)


class API:
    def __init__(self, scenario="ok", safe=True):
        self.scenario = scenario; self.safe = safe; self.calls = []; self.receipt = None

    def answer(self, call):
        self.calls.append(call)
        endpoint = urlparse(call["url"]).path.rsplit("/", 1)[-1]
        body = call.get("body")
        if endpoint == "opciones":
            if self.scenario == "offline": return {"status": 502, "data": {"error": "Servidor de prueba no disponible"}}
            return {"status": 200, "data": dict(CATALOG, csrf="MOCK-CSRF-NOT-PRODUCTION", modo_seguro=self.safe, aceptando=self.scenario != "paused")}
        if endpoint == "solicitudes":
            self.receipt = {"tipo": body["tipo"], "referencia": "ARY-DEMO-0001", "seguimiento": "MOCK-TRACK-ONLY", "estado": "ALTA_CONFIRMADA" if body["tipo"] == "ALTA" else "ENVIO_SOLICITADO", "modo_seguro": self.safe, "mensaje": "Simulacion de navegador"}
            count = len([c for c in self.calls if c["url"].endswith("/solicitudes")])
            if self.scenario == "retry" and count == 1: return {"status": 500, "data": {"error": "Recepcion incierta simulada"}}
            if self.scenario == "reject": return {"status": 400, "data": {"error": "Datos rechazados en simulacion"}}
            if self.scenario == "review": self.receipt["estado"] = "REVISION_REQUERIDA"
            if self.scenario in ("no_registro", "sin_regimen"):
                self.receipt["estado"] = "REVISION_REQUERIDA"
                self.receipt["codigo_cliente"] = ("CLIENTE_NO_REGISTRADO" if self.scenario == "no_registro"
                                                   else "CLIENTE_SIN_REGIMEN")
                self.receipt["mensaje"] = ("Su cliente no está dado de alta en nuestro sistema de facturación. Regístrese primero para poder solicitar su factura."
                                          if self.scenario == "no_registro"
                                          else "Su cliente no está dado de alta correctamente para facturar. Falta registrar su régimen fiscal.")
            if self.scenario == "queue": self.receipt["estado"] = "EN_COLA"
            return {"status": 200, "data": self.receipt}
        if endpoint in ("recepcion", "estado"):
            value = self.receipt or {"tipo":"ALTA","referencia":"ARY-RECUPERADA","seguimiento":"MOCK-RECOVERY","estado":"ALTA_CONFIRMADA","modo_seguro":True,"mensaje":"Solicitud recuperada"}
            if self.scenario == "queue": value = dict(value, estado="ALTA_CONFIRMADA")
            return {"status": 200, "data": value}
        raise AssertionError("Unexpected API call: " + call["url"])

    @property
    def sent(self): return [c for c in self.calls if c["url"].endswith("/solicitudes")]


def launch_page(browser, route="/facturacion/", width=390, height=844, api=None, storage=None):
    api = api or API()
    context = browser.new_context(viewport={"width":width,"height":height}, is_mobile=width<700, has_touch=width<700, device_scale_factor=1,
        user_agent="Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36" if width < 700 else None)
    page = context.new_page(); errors=[]; security=[]; bad=[]
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: security.append(m.text) if m.type == "error" and ("Content Security Policy" in m.text or "Refused to execute" in m.text) else None)
    if OFFLINE:
        page.expose_function("__aryMock", api.answer)
        page.evaluate("""(initial)=>{const mem=new Map(Object.entries(initial));Object.defineProperty(window,'sessionStorage',{value:{getItem:k=>mem.get(k)||null,setItem:(k,v)=>mem.set(k,String(v)),removeItem:k=>mem.delete(k)}});window.fetch=async(url,opts={})=>{const answer=await window.__aryMock({url:String(url),method:opts.method||'GET',body:opts.body?JSON.parse(opts.body):null,headers:Object.fromEntries(Object.entries(opts.headers||{}).map(([k,v])=>[k.toLowerCase(),v]))});return new Response(JSON.stringify(answer.data),{status:answer.status,headers:{'Content-Type':'application/json'}});};}""", storage or {})
        page.set_content(embedded(route), wait_until="load")
    else:
        if storage:
            context.add_init_script("for(const [k,v] of Object.entries("+json.dumps(storage)+")){sessionStorage.setItem(k,v);}")
        def intercept(r):
            req=r.request
            if not req.url.startswith(BASE + "/"):
                bad.append(req.url); r.abort(); return
            if "/api/facturacion/" in req.url:
                result=api.answer({"url":req.url,"method":req.method,"body":req.post_data_json if req.post_data else None,"headers":req.all_headers()})
                r.fulfill(status=result["status"],content_type="application/json",body=json.dumps(result["data"]))
            else: r.continue_()
        context.route("**/*", intercept)
        page.on("response", lambda r: bad.append(str(r.status)+" "+r.url) if r.status>=400 and "/api/facturacion/" not in r.url else None)
        page.goto(BASE + route, wait_until="networkidle")
    if route.startswith('/facturacion'):
        expect(page.locator('#connection')).not_to_have_text('Conectando al portal…')
    page.wait_for_timeout(100)
    page._ary = (context, api, errors, security, bad)
    return page


def finish(page, name):
    context, api, errors, security, bad = page._ary
    assert not errors, (name,errors)
    assert not security, (name,security)
    assert not bad, (name,bad)
    RESULTS.append({"name":name,"result":"passed"}); print("PASS",name,flush=True)
    context.close()


def fill(page, kind="alta"):
    page.locator('#tab-'+kind).click()
    page.locator('#'+kind+'-estacion').select_option('ARY I')
    page.locator('#'+kind+'-constancia').set_input_files({
        'name':'constancia-sat-prueba.pdf', 'mimeType':'application/pdf',
        'buffer': b'%PDF-1.4\n' + b'ARCHIVO-SIMULADO-EXCLUSIVO-PRUEBA\n' * 9
    })
    if kind == 'alta':
        page.locator('#alta-telefono').fill('8711234567')
    else:
        page.locator('#factura-ticket').fill('12345')
        page.locator('#factura-fecha').fill(page.locator('#factura-fecha').get_attribute('max'))
        page.locator('#factura-pago').select_option('EFECTIVO')
    page.locator('#'+kind+'-correo').fill('prueba@example.com')
    page.locator('#'+kind+'-confirmacion').fill('prueba@example.com')
    page.locator('#form-'+kind+' input[name=confirmado]').check()


def main():
    with sync_playwright() as p:
        kwargs={"headless":True}
        if os.getenv('CHROMIUM_PATH'): kwargs['executable_path']=os.environ['CHROMIUM_PATH']
        b=p.chromium.launch(**kwargs)
        # 13 routes x 8 sizes, including small Android and landscape.
        routes=[] if os.getenv('ARY_FAST') else ['/','/estaciones/','/facturacion/','/empresa/','/servicios/','/productos/','/contacto/','/credito/','/consejos/','/privacidad/','/error/','/gracias/','/404.html']
        for width,height in [(320,740),(360,800),(390,844),(412,915),(768,1024),(844,390),(1280,900),(1440,1060)]:
            for route in routes:
                page=launch_page(b,route,width,height)
                overflow=page.evaluate('document.documentElement.scrollWidth>window.innerWidth+1')
                assert not overflow,(route,width,'horizontal overflow')
                assert page.locator('h1').count()==1,(route,'one main heading')
                # Load even CSS-hidden desktop illustrations without trying to scroll to them.
                # This changes only loading priority in the test, not layout or production HTML.
                if not OFFLINE:
                    page.locator('img').evaluate_all("images => images.forEach(i => i.loading = 'eager')")
                    for image in page.locator('img').all():
                        if image.is_visible(): image.scroll_into_view_if_needed(); page.wait_for_timeout(15)
                page.wait_for_function('Array.from(document.images).every(i=>i.complete&&i.naturalWidth>0)')
                if route=='/facturacion/':
                    page.locator('#tab-factura').click()
                    assert not page.evaluate('document.documentElement.scrollWidth>window.innerWidth+1')
                    for control in page.locator('#form-factura .control').all():
                        assert control.evaluate('e=>parseFloat(getComputedStyle(e).fontSize)')>=16
                        assert control.bounding_box()['height']>=48
                if width<700:
                    page.locator('#menuButton').click()
                    expect(page.locator('#mainNav')).to_have_class(re.compile(r'open'))
                    page.keyboard.press('Escape')
                    expect(page.locator('#menuButton')).to_have_attribute('aria-expanded','false')
                finish(page,f'layout:{route}:{width}x{height}')
        # Success pathways, exact unchanged operational request fields and security headers.
        for kind in ['alta','factura']:
            api=API();page=launch_page(b,api=api);fill(page,kind)
            assert page.locator('#'+kind+'-constancia').evaluate('e=>e.files.length')==1
            page.locator('#form-'+kind+' .submit').click()
            if kind=='factura':
                expect(page.locator('#reviewDialog')).to_be_visible();assert len(api.sent)==0
                assert '12345' in page.locator('#reviewGrid').inner_text()
                page.locator('#reviewConfirm').click()
            expect(page.locator('#receipt')).to_be_visible()
            assert len(api.sent)==1
            call=api.sent[0];assert call['method']=='POST'
            assert call['body']['tipo']==kind.upper() and call['body']['confirmado'] is True
            assert 'rfc' not in call['body'] and 'idcif' not in call['body']
            assert 'constancia_archivo' not in call['body']
            assert call['body']['constancia_pdf'].startswith('JVBERi')
            assert call['body']['sitio_web']==''
            assert call['headers']['x-ary-csrf']=='MOCK-CSRF-NOT-PRODUCTION'
            assert call['headers']['x-ary-mode']=='seguro'
            assert re.fullmatch('[0-9a-f]{32}',call['headers']['x-ary-request-id'])
            expect(page.locator('#receiptSafe')).to_be_visible()
            expect(page.locator('#progressTrack')).to_have_attribute('aria-valuenow','100')
            page.screenshot(path=str(OUT/f'{kind}-receipt-android.png'),full_page=True)
            finish(page,'submit:'+kind+':contract-and-receipt')
        # El telefono opcional debe funcionar con el contrato del bot y sin inventar dato.
        api=API();page=launch_page(b,api=api);fill(page,'alta')
        page.locator('#alta-telefono').clear()
        assert not page.locator('#alta-telefono').evaluate('e=>e.required')
        page.locator('#form-alta .submit').click()
        expect(page.locator('#receipt')).to_be_visible()
        assert api.sent[0]['body']['telefono'] == ''
        finish(page,'alta:telefono-opcional')

        # Documento obligatorio; sin PDF no debe transmitirse solicitud.
        api=API();page=launch_page(b,api=api);fill(page,'factura')
        page.locator('#factura-constancia').set_input_files([])
        page.locator('#form-factura .submit').click();page.wait_for_timeout(120)
        assert not api.sent
        assert not page.locator('#factura-constancia').evaluate('e=>e.validity.valid')
        finish(page,'validation:constancia-pdf-obligatoria')
        api=API();page=launch_page(b,api=api);fill(page)
        page.locator('#alta-confirmacion').fill('otro@example.com')
        page.locator('#form-alta .submit').click();page.wait_for_timeout(100)
        assert len(api.sent)==0 and not page.locator('#alta-confirmacion').evaluate('e=>e.validity.valid')
        finish(page,'validation:emails-do-not-match')
        api=API();page=launch_page(b,api=api);fill(page,'factura')
        page.locator('#factura-fecha').fill('2000-01-01')
        page.locator('#form-factura .submit').click();page.wait_for_timeout(100)
        assert len(api.sent)==0 and not page.locator('#factura-fecha').evaluate('e=>e.validity.valid')
        finish(page,'validation:ticket-date-range')
        api=API();page=launch_page(b,api=api);fill(page,'factura')
        page.locator('#form-factura .submit').click();expect(page.locator('#reviewDialog')).to_be_visible()
        assert not page.evaluate('document.documentElement.scrollWidth>innerWidth+1')
        page.screenshot(path=str(OUT/'factura-review-android.png'),full_page=True)
        page.locator('#reviewBack').click();assert not api.sent
        finish(page,'invoice:cancel-review-no-request')
        api=API('retry');page=launch_page(b,api=api);fill(page)
        page.locator('#form-alta .submit').click();expect(page.locator('#error-alta')).to_be_visible()
        expect(page.locator('#form-alta .submit')).to_have_text('Confirmar recepción')
        assert page.locator('#form-alta fieldset').evaluate('e=>e.disabled')
        page.locator('#form-alta .submit').click();expect(page.locator('#receipt')).to_be_visible()
        assert len(api.sent)==2
        assert api.sent[0]['body']==api.sent[1]['body']
        assert api.sent[0]['headers']['x-ary-request-id']==api.sent[1]['headers']['x-ary-request-id']
        finish(page,'retry:identical-idempotency-and-body')
        api=API('reject');page=launch_page(b,api=api);fill(page)
        page.locator('#form-alta .submit').click();expect(page.locator('#error-alta')).to_have_text('Datos rechazados en simulacion')
        assert not page.locator('#form-alta fieldset').evaluate('e=>e.disabled')
        finish(page,'rejection:400-unlocks-form')
        for scenario in ['paused','offline']:
            api=API(scenario);page=launch_page(b,api=api)
            expect(page.locator('#form-alta .submit')).to_be_disabled();assert not api.sent
            expect(page.locator('#connectionError')).to_be_visible()
            finish(page,'connection:'+scenario)
        api=API(safe=False);page=launch_page(b,api=api);fill(page)
        expect(page.locator('#modeBanner')).to_be_hidden()
        page.locator('#form-alta .submit').click();expect(page.locator('#receipt')).to_be_visible()
        assert api.sent[0]['body']['sitio_web']==''
        assert api.sent[0]['headers']['x-ary-mode']=='real'
        finish(page,'server-mode:propagates-mode-with-mock-only')
        api=API();page=launch_page(b,api=api,storage={'ary_portal_pendiente':'a'*32})
        expect(page.locator('#receipt')).to_be_visible();assert not api.sent
        assert any(c['url'].endswith('/recepcion') and c['body']['request_id']=='a'*32 for c in api.calls)
        finish(page,'recovery:pending-request-without-resubmitting')
        api=API();page=launch_page(b,api=api,storage={'ary_portal_seguimiento':json.dumps({'seguimiento':'MOCK-RECOVERY','referencia':'ARY-RECUPERADA'})})
        expect(page.locator('#receipt')).to_be_visible();assert not api.sent
        assert any(c['url'].endswith('/estado') for c in api.calls)
        finish(page,'recovery:saved-tracking')
        api=API('review');page=launch_page(b,api=api);fill(page,'factura')
        page.locator('#form-factura .submit').click();page.locator('#reviewConfirm').click()
        expect(page.locator('#finalResult')).to_be_visible()
        assert page.locator('#finalResult a').get_attribute('href')=='tel:+528711651404'
        finish(page,'result:review-required-and-contact')
        # Dos errores reales distintos: la API entrega el codigo y la web lo muestra.
        # No se reenvia la factura durante seguimiento; todos los datos son simulados.
        for scenario, codigo, esperado in [
            ('no_registro','CLIENTE_NO_REGISTRADO','no está dado de alta'),
            ('sin_regimen','CLIENTE_SIN_REGIMEN','régimen fiscal'),
        ]:
            api=API(scenario);page=launch_page(b,api=api);fill(page,'factura')
            page.locator('#form-factura .submit').click()
            page.locator('#reviewConfirm').click()
            expect(page.locator('#receipt')).to_be_visible()
            expect(page.locator('#finalResult')).to_be_visible()
            assert esperado in page.locator('#finalResult').inner_text()
            assert esperado in page.locator('#progressMessage').inner_text()
            assert esperado in page.locator('#receiptMessage').inner_text()
            assert api.receipt['codigo_cliente'] == codigo
            assert len(api.sent) == 1
            page.locator('#refreshStatus').click()
            assert len(api.sent) == 1
            finish(page,'result:'+scenario+':visible-without-resubmit')
        api=API('queue');page=launch_page(b,api=api);fill(page)
        page.locator('#form-alta .submit').click();expect(page.locator('#receipt')).to_be_visible()
        page.locator('#refreshStatus').click();expect(page.locator('#receiptState')).to_have_text('ALTA CONFIRMADA')
        assert len(api.sent)==1
        finish(page,'tracking:refresh-is-not-resubmission')
        page=launch_page(b,route='/estaciones/')
        page.locator('[data-filter="Torreón"]').click()
        assert page.locator('.station-card:visible').count()==3
        finish(page,'stations:city-filter')
        if not OFFLINE:
            release=json.loads((ROOT/'dist/release.json').read_text())
            for alias,target in release['aliases'].items():
                page=launch_page(b,route='/'+alias)
                expect(page).to_have_url(BASE+target)
                assert page.locator('meta[name=ary-release]').get_attribute('content')==EXPECTED_RELEASE
                finish(page,'legacy-alias:'+alias)
            page=launch_page(b,route='/facturacion/?tramite=factura')
            expect(page.locator('#panel-factura')).to_be_visible()
            finish(page,'billing:deep-link-factura')
        b.close()
    report={'mode':'offline-embedded' if OFFLINE else 'http-with-original-csp','browser':'Chromium','physicalAndroidTested':False,'mockBillingOnly':True,'livePolarisTested':False,'passed':len(RESULTS),'checks':RESULTS}
    (OUT/'browser-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print('PASS',report['passed'],'checks;',report['mode'],'; no live billing requests')

if __name__=='__main__': main()
