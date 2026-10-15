/* ARY chat: separate from billing and the existing guided tours.
 * Only explicitly typed chat messages may leave the page, after opt-in.
 * No form reads, automatic submissions, remote scripts, or API keys. */
(() => {
  'use strict';
  const root = document.getElementById('ary-assistant');
  const home = document.getElementById('ary-assistant-home');
  const launcher = document.getElementById('ary-assistant-launcher');
  const panel = document.getElementById('ary-assistant-panel');
  const isBillingPage = Boolean(document.getElementById('form-factura'));
  if (!root || !home || !launcher || !panel || root.dataset.chatReady) return;
  root.dataset.chatReady = 'true';
  const make = (tag, className, text) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text) el.textContent = text;
    return el;
  };
  root.querySelectorAll('img').forEach(img => { img.src = '/media/ary-mascota-pemex.webp'; });
  launcher.setAttribute('aria-label', 'Abrir el asistente ARY: chat y ayuda paso a paso');
  const footer = root.querySelector('.ary-assistant-footer');
  if (footer) footer.textContent = 'No leo tus formularios ni envío trámites. Solo se comparte con la IA lo que escribes en el chat y autorizas enviar.';

  // A quiet greeting, once per tab/session. No modal, focus stealing or sounds.
  const greeting = make('aside', 'ary-greeting');
  greeting.id = 'ary-greeting'; greeting.hidden = true;
  const greetOpen = make('button', 'ary-greeting-open'); greetOpen.type = 'button';
  greetOpen.append(
    make('strong', '', isBillingPage ? '¿Quieres ayuda para facturar?' : '¡Hola! ¿Te puedo ayudar en algo?'),
    make('span', '', isBillingPage ? 'Ayudar · háblame y te escucho' : 'Soy tu asistente ARY. Toca aquí.')
  );
  greetOpen.setAttribute('aria-label', isBillingPage ? 'Ayudar con facturación usando voz' : 'Abrir el asistente ARY');
  const greetClose = make('button', 'ary-greeting-close', '×'); greetClose.type = 'button';
  greetClose.setAttribute('aria-label', 'Cerrar mensaje de bienvenida');
  greeting.append(greetOpen, greetClose); root.append(greeting);
  const greetingKey = 'ary-greeting-dismissed-v2';
  let dismissed = false, greetingDue = false, positionFrame = 0;
  try { dismissed = sessionStorage.getItem(greetingKey) === '1'; } catch { /* optional UI storage */ }
  function dismissGreeting() {
    dismissed = true; greeting.hidden = true;
    try { sessionStorage.setItem(greetingKey, '1'); } catch { /* optional UI storage */ }
  }
  function positionGreeting() {
    positionFrame = 0;
    const opened = launcher.getAttribute('aria-expanded') === 'true';
    if (opened) dismissGreeting();
    const menuOpen = document.getElementById('menuButton')?.getAttribute('aria-expanded') === 'true';
    const modalOpen = Boolean(document.getElementById('reviewDialog')?.open);
    const vv = window.visualViewport;
    const keyboardOpen = Boolean(vv && window.innerHeight - vv.height > 140);
    greeting.hidden = !greetingDue || dismissed || root.hidden || opened || menuOpen || modalOpen || keyboardOpen || root.classList.contains('is-dragging');
    if (greeting.hidden) return;
    const r = launcher.getBoundingClientRect();
    const w = greeting.offsetWidth, h = greeting.offsetHeight;
    const vw = document.documentElement.clientWidth, vh = window.innerHeight;
    const x = Math.max(12, Math.min(r.right - w, vw - w - 12));
    const y = r.top - h - 12 >= 12 ? r.top - h - 12 : r.bottom + 12;
    greeting.style.left = Math.round(x) + 'px';
    greeting.style.top = Math.max(12, Math.min(y, vh - h - 12)) + 'px';
  }
  function schedulePosition() { if (!positionFrame) positionFrame = requestAnimationFrame(positionGreeting); }
  greetClose.addEventListener('click', dismissGreeting);
  greetOpen.addEventListener('click', () => {
    dismissGreeting();
    if (launcher.getAttribute('aria-expanded') !== 'true') launcher.click();
    if (isBillingPage) window.dispatchEvent(new CustomEvent('ary:voice-help-requested'));
  });
  const uiObserver = new MutationObserver(schedulePosition);
  uiObserver.observe(root, { attributes: true, attributeFilter: ['hidden', 'style', 'class'] });
  uiObserver.observe(launcher, { attributes: true, attributeFilter: ['aria-expanded', 'disabled'] });
  for (const [id, attribute] of [['menuButton', 'aria-expanded'], ['reviewDialog', 'open']]) {
    const el = document.getElementById(id);
    if (el) uiObserver.observe(el, { attributes: true, attributeFilter: [attribute] });
  }
  window.addEventListener('resize', schedulePosition, { passive: true });
  window.visualViewport?.addEventListener('resize', schedulePosition, { passive: true });
  setTimeout(() => { greetingDue = true; schedulePosition(); }, 2400);

  const chat = make('details', 'ary-chat'); chat.id = 'ary-chat';
  const summary = make('summary', '', 'Conversar con el asistente');
  const status = make('p', 'ary-chat-status', 'Modo guía local · IA opcional');
  status.id = 'ary-chat-status'; status.setAttribute('role', 'status');
  const privacy = make('p', 'ary-chat-privacy', 'No escribas RFC, idCIF, correos, teléfonos, contraseñas ni datos de pago. La guía local no envía tus mensajes.');
  privacy.id = 'ary-chat-privacy';
  const consentLabel = make('label', 'ary-chat-consent');
  const consent = make('input'); consent.type = 'checkbox'; consent.id = 'ary-chat-consent';
  consentLabel.append(consent, make('span', '', 'Usar IA de OpenAI. Autorizo enviar mis mensajes del chat para recibir respuestas. Puede equivocarse.'));
  const log = make('div', 'ary-chat-log'); log.id = 'ary-chat-log'; log.setAttribute('role', 'log'); log.setAttribute('aria-live', 'polite'); log.setAttribute('aria-relevant', 'additions'); log.setAttribute('aria-label', 'Conversación con el asistente ARY');
  const label = make('label', 'ary-chat-label', 'Escribe tu pregunta'); label.htmlFor = 'ary-chat-message';
  const input = make('textarea', 'ary-chat-input'); input.id = 'ary-chat-message'; input.rows = 2; input.maxLength = 500; input.placeholder = 'Por ejemplo: ¿cómo entro a Flotillas?'; input.setAttribute('aria-describedby', 'ary-chat-privacy'); input.autocomplete = 'off';
  const actions = make('div', 'ary-chat-actions');
  const send = make('button', 'ary-chat-send', 'Enviar'); send.id = 'ary-chat-send'; send.type = 'button';
  const clear = make('button', 'ary-chat-clear', 'Borrar chat'); clear.type = 'button';
  actions.append(send, clear);
  const quick = make('div', 'ary-chat-links');
  for (const [href, text] of [['/facturacion/?guia=factura', 'Guía de factura'], ['/facturacion/?guia=alta', 'Guía de alta'], ['https://www.grupoary.com.mx:4443/', 'Abrir Flotillas'], ['/contacto/', 'Atención ARY']]) {
    const a = make('a', '', text); a.href = href; quick.append(a);
  }
  chat.append(summary, status, privacy, consentLabel, log, label, input, actions, quick);
  home.append(chat);
  const welcome = '¡Hola! Puedo orientarte sobre facturación, alta de clientes, estaciones y acceso a Flotillas. ¿Qué necesitas?';
  let history = [], busy = false, controller = null, generation = 0;
  function addMessage(who, text) {
    const item = make('div', 'ary-chat-message ' + (who === 'Tú' ? 'is-user' : 'is-assistant'));
    item.append(make('strong', '', who), make('p', '', text)); log.append(item);
    while (log.children.length > 16) log.firstElementChild.remove();
    log.scrollTop = log.scrollHeight;
    if (who !== 'Tú') window.dispatchEvent(new CustomEvent('ary:assistant-message', { detail: { text } }));
  }
  addMessage('Asistente ARY · guía local', welcome);
  function repositionPanel() { window.dispatchEvent(new Event('resize')); }
  chat.addEventListener('toggle', repositionPanel);
  // Reflow the existing floating panel; never inspect billing values.
  if (window.ResizeObserver) {
    let lastHeight = 0;
    new ResizeObserver(entries => {
      const height = Math.round(entries[0].contentRect.height);
      if (height !== lastHeight) { lastHeight = height; repositionPanel(); }
    }).observe(chat);
  }
  const sensitive = text => /\b[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}\b/i.test(text) || /[^\s@]+@[^\s@]+\.[^\s@]+/.test(text) || /(?:\d[\s().+-]*){10,}/.test(text) || /\bsk-[a-z0-9_-]{12,}/i.test(text);
  function localAnswer(text) {
    const q = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (/flot|flota/.test(q)) return 'Usa el botón Flotillas de la cabecera o “Abrir Flotillas” aquí abajo. Abre el portal empresarial en el puerto 4443. No puedo consultar tu saldo ni recuperar contraseñas; para eso contacta al equipo ARY.';
    if (/idcif|constancia/.test(q)) return 'Descarga tu Constancia de Situación Fiscal original en PDF desde el SAT y adjúntala en la página de facturación o alta (máximo 2 MB). El bot leerá RFC, razón social, calle e idCIF cuando corresponda. No escribas esos datos en este chat.';
    if (/alta|registr/.test(q)) return 'Abre “Guía de alta”. Te acompaña para elegir la estación, completar el formulario y revisar tus datos. La solicitud y su confirmación se realizan en el portal, nunca desde este chat.';
    if (/estado|referencia|llego|recib|seguimiento/.test(q)) return 'Consulta el avance con tu referencia y “Actualizar estado” en el portal de facturación. Una referencia no significa que tu factura ya esté emitida. No puedo consultar trámites desde este chat.';
    if (/factur|ticket|cfdi/.test(q)) return 'Abre “Guía de factura”. Elige la estación de tu ticket y revisa los campos del portal. Si aún no estás registrado, comienza con “Guía de alta”. No puedo emitir facturas ni decidir por ti el uso de CFDI.';
    if (/estacion|direccion|ubic|cerca/.test(q)) return 'En “Estaciones” de la cabecera puedes consultar las ubicaciones y abrir las rutas. No tengo tu ubicación ni información de tráfico en tiempo real.';
    if (/precio|costo|litro|promoc|credito|horario/.test(q)) return 'Para precios, promociones, horarios o condiciones de crédito vigentes, consulta al equipo ARY desde “Atención ARY”. No tengo datos en tiempo real y no quiero darte información incorrecta.';
    if (/hola|gracia|ayuda/.test(q)) return welcome;
    return 'En modo guía local solo respondo dudas básicas de ARY. Prueba con facturación, alta, estaciones o flotillas; también puedes abrir “Atención ARY”. La opción de IA necesita que el servicio esté configurado.';
  }
  async function getJSON(path, options, signal) {
    const response = await fetch('/api/asistente/' + path, { ...options, signal, credentials: 'omit', cache: 'no-store', mode: 'same-origin', redirect: 'error' });
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('IA no disponible');
    return response.json();
  }
  function cancelPending() {
    generation++; controller?.abort(); controller = null; busy = false;
    send.disabled = false; send.textContent = 'Enviar';
  }
  consent.addEventListener('change', async () => {
    cancelPending(); history = []; // No old local conversation is forwarded after opt-in.
    if (!consent.checked) { status.textContent = 'Modo guía local · mensajes sin enviar a IA'; return; }
    const myGeneration = generation;
    status.textContent = 'Comprobando disponibilidad de IA…';
    send.disabled = true;
    controller = new AbortController(); const healthController = controller;
    const timeout = setTimeout(() => healthController.abort(), 4000);
    try {
      const data = await getJSON('salud', { method: 'GET' }, healthController.signal);
      if (myGeneration !== generation) return;
      if (data.ready !== true) throw new Error('No configurada');
      status.textContent = 'IA habilitada · solo enviaré lo que escribas a partir de ahora';
    } catch {
      if (myGeneration !== generation) return;
      consent.checked = false;
      status.textContent = 'IA no disponible. Puedes usar la guía local.';
    } finally {
      clearTimeout(timeout);
      if (myGeneration === generation) { controller = null; send.disabled = false; }
    }
  });
  async function sendMessage() {
    if (busy || send.disabled) return;
    const message = input.value.trim();
    if (!message) { input.focus(); return; }
    if (message.length > 500 || sensitive(message)) {
      status.textContent = 'Escribe una pregunta general, sin datos personales, folios largos ni claves. No se envió tu mensaje.';
      input.focus(); return;
    }
    addMessage('Tú', message); input.value = '';
    if (!consent.checked) { addMessage('Asistente ARY · guía local', localAnswer(message)); repositionPanel(); return; }
    busy = true; send.disabled = true; send.textContent = 'Consultando…';
    status.textContent = 'Consultando a la IA…';
    controller = new AbortController(); const requestController = controller;
    const myGeneration = generation;
    const timeout = setTimeout(() => requestController.abort(), 16000);
    try {
      const data = await getJSON('chat', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-ARY-Chat': '1' }, body: JSON.stringify({ message, history }) }, requestController.signal);
      if (myGeneration !== generation) return;
      if (data.mode !== 'ia' || typeof data.reply !== 'string' || !data.reply.trim() || data.reply.length > 2000) throw new Error('Respuesta inválida');
      addMessage('Asistente ARY · IA', data.reply);
      history = [...history, { role: 'user', content: message }, { role: 'assistant', content: data.reply.slice(0, 500) }].slice(-6);
      status.textContent = 'Respuesta de IA · comprueba la información importante con ARY';
    } catch {
      if (myGeneration !== generation) return;
      consent.checked = false; history = [];
      status.textContent = 'La IA no respondió. Sigo en modo guía local.';
      addMessage('Asistente ARY · guía local', localAnswer(message));
    } finally {
      clearTimeout(timeout);
      if (myGeneration === generation) { busy = false; controller = null; send.disabled = false; send.textContent = 'Enviar'; repositionPanel(); }
    }
  }
  send.addEventListener('click', sendMessage);
  input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); sendMessage(); } });
  clear.addEventListener('click', () => { cancelPending(); history = []; consent.checked = false; input.value = ''; log.replaceChildren(); addMessage('Asistente ARY · guía local', welcome); status.textContent = 'Chat borrado · modo guía local'; repositionPanel(); });
  window.addEventListener('pagehide', () => { cancelPending(); history = []; });
})();
