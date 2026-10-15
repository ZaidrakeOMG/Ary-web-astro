'use strict';
(() => {
  const API = '/api/facturacion';
  const INITIAL = {"estaciones":[{"valor":"ARY I","texto":"ARY I · Est. 6953"},{"valor":"ARY II","texto":"ARY II · Est. 4376"},{"valor":"ARY III","texto":"ARY III · Est. 4837"},{"valor":"ARY IV","texto":"ARY IV · Est. 5522"},{"valor":"SERVICIO APACHE","texto":"SERVICIO APACHE · Est. 6086"},{"valor":"ARY V","texto":"ARY V · Est. 9427"},{"valor":"ARY VI","texto":"ARY VI · Est. 11507"}],"formas_pago":[{"valor":"EFECTIVO","texto":"Efectivo"},{"valor":"TARJETA DE CREDITO","texto":"Tarjeta de crédito"},{"valor":"TARJETA DE DEBITO","texto":"Tarjeta de débito"},{"valor":"TRANSFERENCIA ELECTRONICA DE FONDOS","texto":"Transferencia"}],"usos_cfdi":[{"valor":"G01","texto":"G01 — ADQUISICIÓN DE MERCANCÍAS."},{"valor":"G02","texto":"G02 — DEVOLUCIONES, DESCUENTOS O BONIFICACIONES."},{"valor":"G03","texto":"G03 — GASTOS EN GENERAL."},{"valor":"I01","texto":"I01 — CONSTRUCCIONES."},{"valor":"I02","texto":"I02 — MOBILIARIO Y EQUIPO DE OFICINA POR INVERSIONES."},{"valor":"I03","texto":"I03 — EQUIPO DE TRANSPORTE."},{"valor":"I04","texto":"I04 — EQUIPO DE CÓMPUTO Y ACCESORIOS."},{"valor":"I05","texto":"I05 — DADOS, TROQUELES, MOLDES, MATRICES Y HERRAMENTAL."},{"valor":"I06","texto":"I06 — COMUNICACIONES TELEFÓNICAS."},{"valor":"I07","texto":"I07 — COMUNICACIONES SATELITALES."},{"valor":"I08","texto":"I08 — OTRA MAQUINARIA Y EQUIPO."},{"valor":"D01","texto":"D01 — HONORARIOS MÉDICOS, DENTALES Y GASTOS HOSPITALARIOS."},{"valor":"D02","texto":"D02 — GASTOS MÉDICOS POR INCAPACIDAD O DISCAPACIDAD."},{"valor":"D03","texto":"D03 — GASTOS FUNERALES."},{"valor":"D04","texto":"D04 — DONATIVOS."},{"valor":"D05","texto":"D05 — INTERESES REALES EFECTIVAMENTE PAGADOS POR CRÉDITOS HIPOTECARIOS."},{"valor":"D06","texto":"D06 — APORTACIONES VOLUNTARIAS AL SAR."},{"valor":"D07","texto":"D07 — PRIMAS POR SEGUROS DE GASTOS MÉDICOS."},{"valor":"D08","texto":"D08 — GASTOS DE TRANSPORTACIÓN ESCOLAR OBLIGATORIA."},{"valor":"D09","texto":"D09 — DEPÓSITOS EN CUENTAS PARA EL AHORRO Y PLANES DE PENSIONES."},{"valor":"D10","texto":"D10 — PAGOS POR SERVICIOS EDUCATIVOS (COLEGIATURAS)."},{"valor":"S01","texto":"S01 — SIN EFECTOS FISCALES."},{"valor":"CP01","texto":"CP01 — PAGOS."},{"valor":"CN01","texto":"CN01 — NÓMINA."},{"valor":"P01","texto":"P01 — POR DEFINIR"}]};
  const $ = id => document.getElementById(id);
  const storage = {
    get(key) { try { return sessionStorage.getItem(key); } catch (_) { return null; } },
    set(key, value) { try { sessionStorage.setItem(key, value); } catch (_) {} },
    remove(key) { try { sessionStorage.removeItem(key); } catch (_) {} }
  };
  const localStore = {
    get(key) { try { return localStorage.getItem(key); } catch (_) { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch (_) {} },
    remove(key) { try { localStorage.removeItem(key); } catch (_) {} }
  };
  const FACTURA_PROFILE_KEY = 'ary_factura_profile_v1';
  const FACTURA_FISCAL_KEY = 'ary_factura_fiscal_support_v1';
  let csrf = '', serverSafe = true, ready = false, active = 'alta', busy = false, poll = null, receipt = null;
  let snapshots = {factura: null, alta: null};
  let reviewApproved = false;
  let assistanceSnapshot = null, lastReceipt = null;
  const id = () => { const bytes = new Uint8Array(16); crypto.getRandomValues(bytes); return Array.from(bytes, b => b.toString(16).padStart(2,'0')).join(''); };
  let ids = {factura: id(), alta: id()};
  $('year').textContent = String(new Date().getFullYear());
  const brandLogo = $('brandLogo');
  const showLogo = () => { if(brandLogo.complete && brandLogo.naturalWidth > 0) { brandLogo.hidden = false; $('brandFallback').hidden = true; } };
  brandLogo.addEventListener('load', showLogo);
  showLogo();
  // Preserve the original date window: today and the three preceding days.
  const dateInput = $('factura-fecha');
  function localISO(d) {
    const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  }
  function configureTicketDate() {
    if(!dateInput) return;
    const today=new Date(); today.setHours(12,0,0,0);
    const minDate=new Date(today); minDate.setDate(minDate.getDate()-3);
    dateInput.min=localISO(minDate); dateInput.max=localISO(today);
  }
  function ticketDateIsAllowed(value) {
    if(!value) return false;
    const picked=new Date(value+'T12:00:00');
    if(Number.isNaN(picked.getTime())) return false;
    const today=new Date(); today.setHours(12,0,0,0);
    const minDate=new Date(today); minDate.setDate(minDate.getDate()-3);
    return picked>=minDate && picked<=today;
  }
  function selectedText(select) {
    if(!select || select.selectedIndex<0) return '';
    return select.options[select.selectedIndex].textContent.trim();
  }
  function displayDate(value) {
    const p=String(value||'').split('-');
    return p.length===3 ? `${p[2]}/${p[1]}/${p[0]}` : value;
  }
  function reviewItem(label,value,full=false) {
    const div=document.createElement('div'); div.className='review-item'+(full?' full':'');
    const small=document.createElement('small'); small.textContent=label;
    const strong=document.createElement('strong'); strong.textContent=value||'—';
    div.append(small,strong); return div;
  }
  function openFacturaReview(values) {
    $('reviewGrid').replaceChildren(
      reviewItem('Estación',selectedText($('factura-estacion'))),
      reviewItem('Constancia fiscal','PDF adjunto: se comprobarán RFC y razón social; la calle no interviene'),
      reviewItem('Folio del ticket',values.ticket),
      reviewItem('Fecha del ticket',displayDate(values.fecha_ticket)),
      reviewItem('Forma de pago',selectedText($('factura-pago'))),
      reviewItem('Uso de CFDI',selectedText($('factura-uso')),true),
      reviewItem('Correo',values.correo,true)
    );
    const dialog=$('reviewDialog');
    if(typeof dialog.showModal==='function') dialog.showModal();
    else if(window.confirm('Verifica todos los datos antes de facturar. ¿Enviar solicitud?')) {
      reviewApproved=true; $('form-factura').requestSubmit();
    }
  }
  configureTicketDate();
  function options(select, rows, placeholder = '', chosen = '') {
    select.replaceChildren();
    if (placeholder) select.add(new Option(placeholder, ''));
    rows.forEach(row => select.add(new Option(row.texto, row.valor)));
    select.value = chosen;
  }
  function setCatalogs(data) {
    document.querySelectorAll('.station').forEach(select => options(select, data.estaciones, 'Selecciona tu estación', select.value));
    options($('factura-pago'), data.formas_pago, 'Selecciona tu forma de pago', $('factura-pago').value);
    options($('factura-uso'), data.usos_cfdi, '', $('factura-uso').value || 'G03');
  }
  function readFacturaProfile() {
    try {
      const value = JSON.parse(localStore.get(FACTURA_PROFILE_KEY) || 'null');
      return value && typeof value === 'object' ? value : {};
    } catch (_) { return {}; }
  }
  function rememberFacturaProfile(values) {
    const profile = {
      estacion: clean(values?.estacion, 50),
      forma_pago: clean(values?.forma_pago, 50),
      uso_cfdi: clean(values?.uso_cfdi, 4),
      correo: clean(values?.correo, 254)
    };
    if (!profile.correo) return;
    localStore.set(FACTURA_PROFILE_KEY, JSON.stringify(profile));
  }
  function applyFacturaProfile() {
    const profile = readFacturaProfile();
    const assignSelect = (id, value) => {
      const el = $(id);
      if (el && value && [...el.options].some(option => option.value === value)) el.value = value;
    };
    assignSelect('factura-estacion', profile.estacion);
    assignSelect('factura-pago', profile.forma_pago);
    assignSelect('factura-uso', profile.uso_cfdi || 'G03');
    if (profile.correo) {
      $('factura-correo').value = profile.correo;
      $('factura-confirmacion').value = profile.correo;
    }
  }
  setCatalogs(INITIAL);
  applyFacturaProfile();
  function selectTab(name, focus = false) {
    if (busy || snapshots.factura || snapshots.alta) return;
    active = name;
    ['factura','alta'].forEach(key => {
      $('panel-'+key).hidden = key !== name;
      $('tab-'+key).setAttribute('aria-selected', String(key === name));
      $('tab-'+key).tabIndex = key === name ? 0 : -1;
    });
    if (focus) $('tab-'+name).focus();
  }
  ['factura','alta'].forEach(key => $('tab-'+key).addEventListener('click', () => selectTab(key)));
  $('tabs').addEventListener('keydown', event => {
    if (['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {
      event.preventDefault();
      selectTab(event.key === 'Home' ? 'factura' : event.key === 'End' ? 'alta' : active === 'factura' ? 'alta' : 'factura', true);
    }
  });
  $('menuButton').addEventListener('click', () => {
    const open = $('mainNav').classList.toggle('open');
    $('menuButton').setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('keydown', event => { if(event.key==='Escape') { $('mainNav').classList.remove('open'); $('menuButton').setAttribute('aria-expanded','false'); } });
  document.querySelectorAll('.rfc').forEach(input => input.addEventListener('input', () => { input.value = input.value.toUpperCase(); }));
  document.querySelectorAll('input[name="correo_confirmacion"]').forEach(input => input.addEventListener('input', () => input.setCustomValidity('')));

  async function call(path, body, headers = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(API+path, { method: body ? 'POST' : 'GET', credentials:'same-origin',
        cache:'no-store', signal:controller.signal, headers: body ? {'Content-Type':'application/json','X-ARY-CSRF':csrf, ...headers} : headers,
        ...(body ? {body: JSON.stringify(body)} : {}) });
      let data;
      try { data = await response.json(); } catch (_) { throw new Error('El servidor no devolvió una respuesta válida. No envíes el mismo ticket desde otro formulario.'); }
      if (!response.ok) { const error = new Error(data.error || 'No se confirmó la solicitud.'); error.status = response.status; throw error; }
      return data;
    } finally { clearTimeout(timeout); }
  }
  // In-memory whitelist only. Never copy the PDF, idCIF, address or tracking token to WhatsApp.
  const supportFields = {rfc:13, razon_social:180, estacion:50, ticket:20,
    fecha_ticket:10, forma_pago:50, uso_cfdi:180, correo_destino:254};
  const clean = (value, max = 600) => typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g,' ').trim().slice(0,max) : '';
  function supportValues(values) {
    const out = {};
    for (const [key,max] of Object.entries(supportFields)) out[key] = clean(values?.[key], max);
    out.correo_destino ||= clean(values?.correo, 254);
    return out;
  }
  function rememberedFiscalSupport(email) {
    try {
      const saved = JSON.parse(localStore.get(FACTURA_FISCAL_KEY) || 'null');
      if (!saved || typeof saved !== 'object') return {};
      const current = clean(email, 254).toLowerCase();
      if (!current || clean(saved.correo_destino, 254).toLowerCase() !== current) return {};
      return supportValues(saved);
    } catch (_) { return {}; }
  }
  function rememberFiscalSupport(values) {
    const safe = supportValues(values);
    if (!safe.rfc || !safe.razon_social || !safe.correo_destino) return;
    localStore.set(FACTURA_FISCAL_KEY, JSON.stringify({
      rfc: safe.rfc,
      razon_social: safe.razon_social,
      correo_destino: safe.correo_destino
    }));
  }
  function mergeSupport(...sources) {
    const out = {};
    for (const source of sources) {
      for (const [key,value] of Object.entries(source || {})) if (value) out[key] = value;
    }
    return supportValues(out);
  }
  function currentFormSupport() {
    const form = $('form-factura'), values = {};
    for (const key of ['estacion','ticket','fecha_ticket','forma_pago','uso_cfdi','correo']) {
      values[key] = form.elements.namedItem(key)?.value || '';
    }
    const local = supportValues(values);
    return mergeSupport(rememberedFiscalSupport(local.correo_destino), local);
  }
  function showWhatsApp(box, data = {}, error = '', dynamic = false) {
    box.querySelectorAll('.ary-whatsapp').forEach(el => el.remove());
    const holder = document.createElement('div'); holder.className = 'ary-whatsapp';
    const link = document.createElement('a'); link.textContent = 'Continuar por WhatsApp';
    link.target = '_blank'; link.rel = 'noopener noreferrer'; link.referrerPolicy = 'no-referrer';
    link.dataset.whatsapp = 'true';
    const note = document.createElement('p');
    note.textContent = 'Abrirá WhatsApp con tu solicitud preparada. Revisa los datos y pulsa Enviar allí. Antes de emitir otra factura, ARY debe comprobar el resultado anterior.';
    const details = document.createElement('details');
    const summary = document.createElement('summary'); summary.textContent = 'Ver los datos que se compartirán';
    const preview = document.createElement('pre'); details.append(summary, preview);
    function prepare() {
      const local = dynamic ? currentFormSupport() : assistanceSnapshot || {};
      const backend = supportValues(data.asistencia?.datos || {});
      if (backend.rfc && backend.razon_social) rememberFiscalSupport(backend);
      const remembered = rememberedFiscalSupport(local.correo_destino || backend.correo_destino);
      const values = mergeSupport(remembered, local, backend);
      const unavailable = 'No disponible: la constancia no fue procesada';
      const lines = [
        'Hola, necesito ayuda con mi solicitud de facturación ARY.',
        'Referencia: ' + (clean(data.referencia,80) || 'No confirmada'),
        'Estado: ' + (clean(data.estado,80) || 'RESULTADO NO CONFIRMADO'),
        'RFC: ' + (values.rfc || unavailable),
        'Razón social: ' + (values.razon_social || unavailable),
        'Estación: ' + (values.estacion || 'No capturada'),
        'Ticket / folio: ' + (values.ticket || 'No capturado'),
        'Fecha del ticket: ' + (displayDate(values.fecha_ticket) || 'No capturada'),
        'Forma de pago: ' + (values.forma_pago || 'No capturada'),
        'Uso de CFDI: ' + (values.uso_cfdi || 'No capturado'),
        'Correo: ' + (values.correo_destino || 'No capturado'),
        'Error / motivo: ' + (clean(error || data.mensaje) || 'Solicito revisión del resultado.'),
        'Antes de emitir otra factura, confirmen si este ticket ya fue timbrado. No autorizo duplicarlo.'
      ];
      const message = lines.join('\n'); preview.textContent = message;
      link.href = 'https://wa.me/528711651404?text=' + encodeURIComponent(message);
    }
    prepare(); link.addEventListener('click', prepare);
    details.addEventListener('toggle', () => { if(details.open) prepare(); });
    holder.append(link,note,details); box.append(holder);
  }
  function formError(kind, message) {
    const box = $('error-'+kind); box.textContent = message; box.hidden = false;
    if(kind === 'factura') showWhatsApp(box, {}, message);
    box.focus();
  }
  function storeReceipt(data) {
    receipt = data;
    storage.set('ary_portal_seguimiento', JSON.stringify({seguimiento:data.seguimiento, referencia:data.referencia}));
    storage.remove('ary_portal_pendiente');
  }
  const PHONE_DISPLAY = '871 165 1404';
  const PHONE_LINK = 'tel:+528711651404';
  const PROGRESS = {
    EN_COLA:{pct:18,title:'Solicitud recibida',msg:'Tu solicitud está en espera para ser atendida.'},
    EJECUTANDO:{pct:68,title:'Generando tu factura…',msg:'Estamos procesando tu solicitud. No cierres esta página.'},
    PREPARADA_FACTURA:{pct:82,title:'Prueba preparada',msg:'La prueba quedó preparada sin emitir una factura.',warning:true},
    PREPARADA_ALTA:{pct:82,title:'Alta preparada',msg:'Tu alta está preparada y pendiente de confirmación.'},
    ACEPTAR_ALTA:{pct:88,title:'Confirmando registro…',msg:'Estamos confirmando tu alta en el sistema.'},
    ALTA_CONFIRMADA:{pct:100,title:'Alta confirmada',msg:'Tu registro quedó confirmado correctamente.'},
    ENVIO_SOLICITADO:{pct:100,title:'Factura generada',msg:'Se ha enviado por correo su factura.'},
    YA_FACTURADO:{pct:100,title:'Ticket ya facturado',msg:'Este ticket ya aparece facturado en el sistema.',warning:true},
    REVISION_REQUERIDA:{pct:100,title:'Revisión de factura',msg:'El resultado requiere revisión. Comuníquese con ARY al '+PHONE_DISPLAY+'.',error:true},
    REVISION_CERRADA:{pct:100,title:'Revisión de factura',msg:'Consulte el resultado con ARY al '+PHONE_DISPLAY+'.',error:true},
    ESPERANDO_DATOS:{pct:100,title:'Faltan datos',msg:'No fue posible completar la solicitud. Comuníquese con ARY al '+PHONE_DISPLAY+'.',error:true},
    CANCELADA:{pct:100,title:'Solicitud cancelada',msg:'La solicitud fue cancelada. Comuníquese con ARY al '+PHONE_DISPLAY+'.',error:true},
    PRUEBA_CERRADA:{pct:100,title:'Prueba finalizada',msg:'La prueba terminó sin emitir una factura.',warning:true}
  };
  const TERMINAL = new Set([
    'PREPARADA_FACTURA','ALTA_CONFIRMADA','ENVIO_SOLICITADO','YA_FACTURADO',
    'REVISION_REQUERIDA','REVISION_CERRADA','ESPERANDO_DATOS','CANCELADA','PRUEBA_CERRADA'
  ]);
  function updateProgress(data) {
    lastReceipt = data;
    const state = {...(PROGRESS[data.estado] || {
      pct:45, title:data.tipo==='FACTURA' ? 'Generando tu factura…' : 'Procesando solicitud…',
      msg:data.mensaje || 'Estamos atendiendo tu solicitud.'
    })};
    const clienteError = data.tipo === 'FACTURA'
      && ['CLIENTE_NO_REGISTRADO','CLIENTE_SIN_REGIMEN','VERIFICACION_FISCAL_PENDIENTE'].includes(data.codigo_cliente);
    if(clienteError && ['REVISION_REQUERIDA','REVISION_CERRADA'].includes(data.estado)){
      state.title = data.codigo_cliente === 'CLIENTE_NO_REGISTRADO'
        ? 'Cliente no registrado'
        : data.codigo_cliente === 'VERIFICACION_FISCAL_PENDIENTE' ? 'Verificación fiscal pendiente' : 'Registro fiscal incompleto';
      state.msg = data.mensaje; state.error = true;
    }
    if(data.tipo === 'FACTURA' && state.error && data.mensaje) state.msg = data.mensaje;
    const card=$('progressCard'), bar=$('progressBar'), track=$('progressTrack'), result=$('finalResult');
    $('progressTitle').textContent=state.title;
    $('progressPercent').textContent=state.pct+'%'; $('progressMessage').textContent=state.msg;
    bar.style.width=state.pct+'%'; track.setAttribute('aria-valuenow',String(state.pct));
    bar.classList.toggle('loading',!TERMINAL.has(data.estado));
    card.dataset.result=state.error ? 'error' : state.warning ? 'warning' : TERMINAL.has(data.estado) ? 'success' : '';
    result.hidden=true; result.className='result-box'; result.replaceChildren();
    if(data.tipo==='FACTURA' && data.estado==='ENVIO_SOLICITADO') {
      result.classList.add('success'); result.hidden=false;
      const strong=document.createElement('strong'); strong.textContent='✓ Se ha enviado por correo su factura.';
      const text=document.createElement('span'); text.textContent=' Revise su bandeja de entrada y también correo no deseado.';
      result.append(strong,text);
    } else if(data.tipo==='FACTURA' && state.error) {
      result.classList.add('error'); result.hidden=false;
      const strong=document.createElement('strong'); strong.textContent=state.msg || 'La solicitud requiere revisión.';
      const text=document.createTextNode(' Comuníquese con ARY al ');
      const link=document.createElement('a'); link.href=PHONE_LINK; link.textContent=PHONE_DISPLAY;
      result.append(strong,text,link,document.createTextNode('.'));
    } else if(data.tipo==='FACTURA' && data.estado==='YA_FACTURADO') {
      result.classList.add('warning'); result.hidden=false;
      const strong=document.createElement('strong'); strong.textContent='Este ticket ya aparece facturado.';
      const text=document.createTextNode(' Si no recibió su comprobante, comuníquese con ARY al ');
      const link=document.createElement('a'); link.href=PHONE_LINK; link.textContent=PHONE_DISPLAY;
      result.append(strong,text,link,document.createTextNode('.'));
    }
    if(data.tipo === 'FACTURA' && (state.error || data.estado === 'YA_FACTURADO')) showWhatsApp(result, data, data.mensaje || state.msg);
  }
  function renderReceipt(data) {
    $('tabs').hidden = true; $('panel-factura').hidden = true; $('panel-alta').hidden = true;
    $('receipt').hidden = false; $('receiptRef').textContent = data.referencia;
    $('receiptState').textContent = data.estado.replaceAll('_',' ');
    $('receiptSafe').hidden = !data.modo_seguro;
    const state = PROGRESS[data.estado];
    $('receiptMessage').textContent = data.codigo_cliente || data.tipo === 'ALTA' || state?.error
      ? data.mensaje : state ? state.msg : data.mensaje;
    updateProgress(data);
    if (poll) clearTimeout(poll);
    if (!TERMINAL.has(data.estado) && !document.hidden) poll = setTimeout(refresh, 2000);
  }
  async function refresh() {
    if(!receipt || !csrf) return;
    $('refreshStatus').disabled = true; $('statusError').hidden = true;
    try {
      renderReceipt(await call('/estado', {seguimiento:receipt.seguimiento}));
    } catch (error) {
      $('statusError').textContent='No se pudo actualizar el avance en este momento. La solicitud no se volvió a enviar.';
      $('statusError').hidden=false;
      if(lastReceipt?.tipo === 'FACTURA') showWhatsApp($('statusError'), lastReceipt, 'No se pudo consultar el resultado. La solicitud NO se volvió a enviar.');
      if(!document.hidden) poll=setTimeout(refresh,4000);
    } finally { $('refreshStatus').disabled=false; }
  }
  $('refreshStatus').addEventListener('click', refresh);
  document.addEventListener('visibilitychange', () => { if(document.hidden && poll) clearTimeout(poll); else if(receipt) refresh(); });
  $('copyReference').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('receiptRef').textContent); $('copyReference').textContent='Copiado'; }
    catch (_) { const range=document.createRange();range.selectNodeContents($('receiptRef'));const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);$('copyReference').textContent='Seleccionado'; }
  });
  $('newRequest').addEventListener('click', () => {
    if(!window.confirm('Conserva tu referencia. No vuelvas a enviar el mismo ticket o la misma alta pendiente. ¿Iniciar un trámite diferente?')) return;
    if(poll) clearTimeout(poll); receipt=null; storage.remove('ary_portal_seguimiento');
    ['factura','alta'].forEach(kind => { const form=$('form-'+kind);form.reset();form.querySelector('fieldset').disabled=false;$('error-'+kind).hidden=true; });
    snapshots={factura:null,alta:null};assistanceSnapshot=null;lastReceipt=null;reviewApproved=false;ids={factura:id(),alta:id()};
    document.querySelectorAll('#error-factura .ary-whatsapp,#statusError .ary-whatsapp,#finalResult .ary-whatsapp').forEach(el=>el.remove());
    setCatalogs(INITIAL);applyFacturaProfile();$('receipt').hidden=true;$('tabs').hidden=false;selectTab('alta',true);
  });
  $('reviewBack').addEventListener('click', () => { reviewApproved=false; $('reviewDialog').close(); });
  $('reviewConfirm').addEventListener('click', () => { reviewApproved=true; $('reviewDialog').close(); $('form-factura').requestSubmit(); });
  $('reviewDialog').addEventListener('cancel', () => { reviewApproved=false; });

  $('clearRememberedBilling')?.addEventListener('click', () => {
    if(!window.confirm('¿Borrar los datos de facturación recordados en este dispositivo?')) return;
    localStore.remove(FACTURA_PROFILE_KEY);
    localStore.remove(FACTURA_FISCAL_KEY);
    for (const id of ['factura-estacion','factura-pago']) $(id).value = '';
    $('factura-uso').value = 'G03';
    $('factura-correo').value = '';
    $('factura-confirmacion').value = '';
    const button = $('clearRememberedBilling');
    button.textContent = 'Datos recordados borrados';
    setTimeout(() => { button.textContent = 'Borrar datos recordados en este dispositivo'; }, 2400);
  });

  const MAX_CONSTANCIA=2*1024*1024;
  function leerConstancia(file) {
    if(!file || !/\.pdf$/i.test(file.name||'') || file.size<200 || file.size>MAX_CONSTANCIA)
      throw new Error('Adjunta el PDF digital original de la Constancia de Situación Fiscal (máx. 2 MB).');
    return new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onerror=()=>reject(new Error('No se pudo leer el PDF de la constancia.'));
      reader.onload=()=>{
        const value=String(reader.result||''); const start=value.indexOf('base64,');
        if(start<0){reject(new Error('No se pudo codificar la constancia PDF.'));return;}
        resolve(value.slice(start+7));
      };
      reader.readAsDataURL(file);
    });
  }
  async function send(kind, event) {
    event.preventDefault();
    if(busy || !ready) return;
    const form=$('form-'+kind), button=form.querySelector('.submit');
    if(!snapshots[kind]) {
      const email=form.elements.correo, confirmation=form.elements.correo_confirmacion;
      confirmation.setCustomValidity(email.value.trim() === confirmation.value.trim() ? '' : 'Los dos correos deben coincidir.');
      if(!form.reportValidity()) return;
      const values=Object.fromEntries(new FormData(form).entries());
      values.tipo=kind==='factura' ? 'FACTURA' : 'ALTA'; values.confirmado=form.elements.confirmado.checked;
      if(kind === 'factura') assistanceSnapshot = supportValues(values);
      try { values.constancia_pdf=await leerConstancia(form.elements.constancia_archivo.files[0]); }
      catch(error) { formError(kind,error.message); return; }
      delete values.constancia_archivo;
      if(kind==='factura' && !ticketDateIsAllowed(values.fecha_ticket)) {
        formError(kind,'La fecha del ticket debe ser de hoy o de uno de los 3 días anteriores.'); return;
      }
      if(kind==='factura' && !reviewApproved) { openFacturaReview(values); return; }
      if(kind==='factura') reviewApproved=false;
      snapshots[kind]=values;
    }
    busy=true;button.disabled=true;button.textContent='Enviando…';form.querySelector('fieldset').disabled=true;$('error-'+kind).hidden=true;
    storage.set('ary_portal_pendiente',ids[kind]);
    try {
      const sent = snapshots[kind];
      const data=await call('/solicitudes',sent,{'X-ARY-Request-Id':ids[kind], 'X-ARY-Mode':serverSafe?'seguro':'real'});
      if(kind === 'factura') {
        rememberFacturaProfile(sent);
        rememberFiscalSupport(data.perfil_local || {});
      }
      storeReceipt(data);snapshots[kind]=null;renderReceipt(data);$('receipt').focus();
    } catch(error) {
      const certain=error.status && error.status < 500;
      if(certain || error.status===503) { snapshots[kind]=null;storage.remove('ary_portal_pendiente');form.querySelector('fieldset').disabled=false; }
      formError(kind, certain || error.status===503 ? error.message : 'No se confirmó la recepción. Conservé el mismo envío para evitar duplicarlo. Pulsa «Confirmar recepción» sin cambiar los datos.');
    } finally {
      busy=false;button.disabled=!ready;
      button.textContent=snapshots[kind] ? 'Confirmar recepción' : kind==='factura' ? 'Enviar solicitud →' : 'Solicitar alta →';
    }
  }
  ['factura','alta'].forEach(kind => $('form-'+kind).addEventListener('submit', event => send(kind,event)));
  async function connect() {
    if(location.protocol==='file:') {
      $('connection').textContent='Vista previa sin conexión';$('connection').dataset.state='error';
      $('connectionError').hidden=false;$('connectionError').textContent='Esta es una vista previa. Para enviar solicitudes, abre el portal desde el bot o desde el sitio con el API configurado. Abrir el archivo por sí solo no conecta con Polaris.';return;
    }
    try {
      const data=await call('/opciones');
      if(!data.csrf || !Array.isArray(data.estaciones)) throw new Error('Respuesta del portal no válida.');
      csrf=data.csrf;serverSafe=data.modo_seguro===true;setCatalogs(data);applyFacturaProfile();ready=data.aceptando===true;
      $('modeBanner').hidden=!data.modo_seguro;
      $('connection').textContent=ready ? 'Conectado al portal' : 'Recepción pausada';$('connection').dataset.state=ready?'ok':'error';
      document.querySelectorAll('.submit').forEach(button => button.disabled=!ready);
      if(!ready){$('connectionError').hidden=false;$('connectionError').textContent='La recepción de nuevas solicitudes está pausada. El seguimiento de las ya registradas continúa disponible.';showWhatsApp($('connectionError'),{},'Recepción de solicitudes pausada.',true);}
      const saved=storage.get('ary_portal_seguimiento');
      if(saved){try{receipt=JSON.parse(saved);if(receipt.seguimiento){const result=await call('/estado',{seguimiento:receipt.seguimiento});renderReceipt(result);return;}}catch(_){receipt=null;storage.remove('ary_portal_seguimiento');}}
      const pending=storage.get('ary_portal_pendiente');
      if(pending){
        try{const result=await call('/recepcion',{request_id:pending});storeReceipt(result);renderReceipt(result);}
        catch(error){
          if(error.status===404){storage.remove('ary_portal_pendiente');}
          else{ready=false;document.querySelectorAll('.submit').forEach(button=>button.disabled=true);throw new Error('Hay un envío pendiente de confirmar. Recarga la página para consultar su recepción antes de iniciar otro.');}
        }
      }
    } catch(error) {
      ready=false;document.querySelectorAll('.submit').forEach(button=>button.disabled=true);
      $('connection').textContent='Sin conexión al bot';$('connection').dataset.state='error';
      $('connectionError').hidden=false;$('connectionError').textContent='No se pudo conectar con el portal de facturación. No se ha registrado una nueva solicitud desde esta pantalla. '+(error.name==='AbortError' ? 'Revisa la conexión.' : error.message);
      showWhatsApp($('connectionError'), {}, 'No se pudo conectar con el portal. Comprobar cualquier solicitud pendiente antes de emitir.', true);
    }
  }
  connect();
})();
