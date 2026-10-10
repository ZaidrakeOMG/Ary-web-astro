/* ARY guided help, v2 (floating on all sections). No dependencies, storage, form reads or network requests.
 * It only opens a tab on explicit request, highlights controls, and explains them.
 * It NEVER checks confirmation boxes, calls submit(), or clicks a submit button.
 */
(() => {
  'use strict';
  const root = document.getElementById('ary-assistant');
  if (!root || root.dataset.ready) return;
  root.dataset.ready = 'true';
  const byId = (id) => document.getElementById('ary-assistant-' + id);
  const panel = byId('panel');
  const launcher = byId('launcher');
  const home = byId('home');
  const tour = byId('tour');
  const heading = byId('step');
  const description = byId('description');
  const notice = byId('notice');
  const fieldButton = byId('field');
  const previous = byId('prev');
  const next = byId('next');
  const progress = byId('progress');
  const receipt = document.getElementById('receipt');
  const dialog = document.getElementById('reviewDialog');
  const isBilling = Boolean(document.getElementById('form-factura') && document.getElementById('form-alta'));
  const step = (selector, title, text) => ({ selector, title, text });
  const followUp = step('#receipt', 'Conserva tu referencia', 'Después de enviar, el portal mostrará una referencia para consultar el avance con “Actualizar estado”. Recibir la solicitud no significa que la factura esté emitida ni que el alta esté confirmada. En modo de prueba no se completa el trámite real.');
  const guides = {
    factura: [
      step('#factura-estacion', '1. Elige tu estación', 'Selecciona la estación donde cargaste combustible. Revisa su nombre y número en el ticket para no enviar tu solicitud a otra estación.'),
      step('#factura-rfc', '2. Escribe tu RFC registrado', 'Captura el RFC que ya está dado de alta en esa estación. Si es tu primera vez, usa “Quiero darme de alta” y espera la confirmación del registro antes de facturar.'),
      step('#factura-ticket', '3. Captura el folio del ticket', 'Escribe únicamente el folio numérico de tu ticket. Revisa cada dígito: no se trata del importe ni del número de estación.'),
      step('#factura-fecha', '4. Indica la fecha del ticket', 'Elige la fecha que aparece en el ticket. Consulta el rango permitido junto al campo y en el calendario del portal; no cambies la fecha de tu compra para intentar continuar.'),
      step('#factura-pago', '5. Selecciona cómo pagaste', 'Elige la forma de pago con la que realizaste esta compra. Debe coincidir con tu ticket; no selecciones otra solo para avanzar.'),
      step('#factura-uso', '6. Elige el uso de CFDI', 'Selecciona el uso que corresponde a tu solicitud. Si tienes dudas sobre cuál necesitas, confírmalo con tu contador antes de enviar.'),
      step('#factura-correo', '7. Escribe tu correo', 'Captura un correo al que tengas acceso. Revisa letras, puntos y dominio para que la información de tu trámite llegue al destinatario correcto.'),
      step('#factura-confirmacion', '8. Confirma tu correo', 'Escribe nuevamente el mismo correo. Ambos campos deben coincidir; esta segunda captura ayuda a detectar errores.'),
      step('#form-factura input[name="confirmado"]', '9. Revisa y confirma tus datos', 'Revisa estación, RFC, folio, fecha, forma de pago, uso de CFDI y correo. Marca tú mismo la casilla únicamente cuando todo sea correcto.'),
      step('#form-factura .submit', '10. Abre la revisión final', 'Presiona “Revisar y enviar” en el formulario. Se abrirá un resumen: puedes elegir “Volver a revisar” o, solo después de comprobarlo, “Sí, enviar solicitud”. Los botones de esta guía nunca envían tu factura.'),
      followUp
    ],
    alta: [
      step('#alta-estacion', '1. Elige la estación', 'Selecciona la estación donde vas a solicitar tus facturas. Este registro corresponde a la estación elegida.'),
      step('#alta-rfc', '2. Captura tu RFC', 'Escribe tu RFC de 12 o 13 caracteres tal como aparece en tu constancia de situación fiscal. Revisa que no falte ninguna letra o número.'),
      step('#alta-idcif', '3. Encuentra tu idCIF', 'Busca el identificador idCIF en tu constancia de situación fiscal y captura sus 11 dígitos, sin espacios. No es tu RFC. También puedes abrir “¿Dónde encuentro mi idCIF?” en el formulario.'),
      step('#alta-telefono', '4. Agrega tu teléfono', 'Escribe un número de contacto e incluye la lada. El equipo ARY utilizará los datos del formulario para dar seguimiento a tu solicitud.'),
      step('#alta-correo', '5. Escribe tu correo', 'Captura un correo al que tengas acceso y comprueba que esté bien escrito. Ahí podrás recibir información relacionada con tu registro.'),
      step('#alta-confirmacion', '6. Confirma tu correo', 'Escribe otra vez el mismo correo. Comprueba que las dos direcciones coincidan antes de continuar.'),
      step('#form-alta input[name="confirmado"]', '7. Comprueba tus datos', 'Revisa estación, RFC, idCIF, teléfono y correo. Marca tú mismo la casilla de confirmación solamente si todos los datos son correctos.'),
      step('#form-alta .submit', '8. Solicita tu alta', 'Cuando estés listo, pulsa “Solicitar mi alta” en el formulario. Ese botón sí envía tu solicitud de registro. Esta guía no lo presiona por ti. Espera la confirmación de tu alta antes de solicitar una factura.'),
      followUp
    ]
  };
  let opened = false;
  let kind = null;
  let index = 0;
  let target = null;
  let highlighted = null;
  let switching = false;
  let resizeFrame = 0;
  const visible = (el) => Boolean(el && !el.closest('[hidden]') && el.getClientRects().length);
  const blocked = () => Boolean(dialog?.open);


  // Persist only UI preferences. Never save form fields, RFC, tickets or API data.
  const POSITION_KEY = 'ary-assistant-position-v2';
  const VIEW_KEY = 'ary-assistant-view-v2';
  let drag = null;
  let dragFrame = 0;
  let ignoreClick = false;
  let bubbleX = 0;
  let bubbleY = 0;
  const clamp = (number, min, max) => Math.min(Math.max(number, min), max);
  const viewportWidth = () => document.documentElement.clientWidth || window.innerWidth;
  let savedView = null;
  try { savedView = JSON.parse(sessionStorage.getItem(VIEW_KEY) || 'null'); } catch { /* blocked storage */ }
  if (savedView && typeof savedView === 'object') {
    opened = savedView.opened === true;
    if (isBilling && Object.hasOwn(guides, savedView.kind)) {
      kind = savedView.kind;
      index = Number.isInteger(savedView.index) ? savedView.index : 0;
    }
  }
  function rememberView() {
    try {
      const previous = JSON.parse(sessionStorage.getItem(VIEW_KEY) || 'null') || {};
      sessionStorage.setItem(VIEW_KEY, JSON.stringify({
        opened,
        kind: isBilling ? kind : (previous.kind || null),
        index: isBilling ? index : (previous.index || 0)
      }));
    } catch { /* storage is optional */ }
  }
  function movementLimits() {
    const width = launcher.offsetWidth || 74;
    const height = launcher.offsetHeight || 74;
    const gap = 12;
    return {
      minX: gap,
      maxX: Math.max(gap, viewportWidth() - width - gap),
      minY: gap,
      maxY: Math.max(gap, window.innerHeight - height - (viewportWidth() <= 700 ? 82 : 12))
    };
  }
  function positionPanel() {
    if (!opened || panel.hidden || root.hidden) return;
    const vw = viewportWidth();
    const vh = window.innerHeight;
    const margin = 12;
    const bubble = launcher.getBoundingClientRect();
    const pw = panel.getBoundingClientRect().width || Math.min(360, vw - 24);
    const leftSpace = bubble.left - margin * 2;
    const rightSpace = vw - bubble.right - margin * 2;
    let x;
    let y;
    if (leftSpace >= pw || rightSpace >= pw) {
      panel.style.maxHeight = 'calc(100dvh - 24px)';
      const ph = panel.getBoundingClientRect().height;
      x = leftSpace >= pw ? bubble.left - pw - margin : bubble.right + margin;
      y = clamp(bubble.bottom - ph, margin, Math.max(margin, vh - ph - margin));
    } else {
      // On narrow screens the guide opens above or below the bubble, not over it.
      const above = Math.max(0, bubble.top - margin * 2);
      const below = Math.max(0, vh - bubble.bottom - margin * 2);
      const placeAbove = above >= below;
      panel.style.maxHeight = Math.max(100, Math.floor(placeAbove ? above : below)) + 'px';
      const ph = panel.getBoundingClientRect().height;
      x = clamp(bubble.right - pw, margin, Math.max(margin, vw - pw - margin));
      y = placeAbove ? bubble.top - ph - margin : bubble.bottom + margin;
      y = clamp(y, margin, Math.max(margin, vh - ph - margin));
    }
    panel.style.left = Math.round(x) + 'px';
    panel.style.top = Math.round(y) + 'px';
  }
  function moveBubble(x, y, persist = false) {
    const limits = movementLimits();
    bubbleX = clamp(x, limits.minX, limits.maxX);
    bubbleY = clamp(y, limits.minY, limits.maxY);
    root.style.left = Math.round(bubbleX) + 'px';
    root.style.top = Math.round(bubbleY) + 'px';
    root.style.right = 'auto';
    root.style.bottom = 'auto';
    positionPanel();
    if (persist) {
      try {
        localStorage.setItem(POSITION_KEY, JSON.stringify({
          x: (bubbleX - limits.minX) / Math.max(1, limits.maxX - limits.minX),
          y: (bubbleY - limits.minY) / Math.max(1, limits.maxY - limits.minY)
        }));
      } catch { /* storage is optional */ }
    }
  }
  function restoreBubble() {
    const limits = movementLimits();
    let x = limits.maxX;
    let y = limits.maxY;
    try {
      const stored = JSON.parse(localStorage.getItem(POSITION_KEY) || 'null');
      if (stored && Number.isFinite(stored.x) && Number.isFinite(stored.y)) {
        x = limits.minX + clamp(stored.x, 0, 1) * (limits.maxX - limits.minX);
        y = limits.minY + clamp(stored.y, 0, 1) * (limits.maxY - limits.minY);
      }
    } catch { /* storage is optional */ }
    moveBubble(x, y);
  }
  launcher.addEventListener('pointerdown', (event) => {
    if (blocked() || !event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    drag = { id: event.pointerId, startX: event.clientX, startY: event.clientY, x: bubbleX, y: bubbleY, moved: false, lastX: event.clientX, lastY: event.clientY };
    launcher.setPointerCapture?.(event.pointerId);
  });
  launcher.addEventListener('pointermove', (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 7) return;
    if (!drag.moved) {
      drag.moved = true;
      root.classList.add('is-dragging');
    }
    if (!dragFrame) dragFrame = requestAnimationFrame(() => {
      dragFrame = 0;
      if (drag) moveBubble(drag.x + drag.lastX - drag.startX, drag.y + drag.lastY - drag.startY);
    });
    event.preventDefault();
  });
  function finishDrag(event) {
    if (!drag || drag.id !== event.pointerId) return;
    if (dragFrame) { cancelAnimationFrame(dragFrame); dragFrame = 0; }
    if (drag.moved) {
      moveBubble(drag.x + event.clientX - drag.startX, drag.y + event.clientY - drag.startY, true);
      ignoreClick = true;
      setTimeout(() => { ignoreClick = false; }, 0);
    }
    root.classList.remove('is-dragging');
    drag = null;
  }
  launcher.addEventListener('pointerup', finishDrag);
  launcher.addEventListener('pointercancel', finishDrag);
  launcher.addEventListener('dragstart', (event) => event.preventDefault());
  launcher.addEventListener('keydown', (event) => {
    const offsets = { ArrowLeft: [-24, 0], ArrowRight: [24, 0], ArrowUp: [0, -24], ArrowDown: [0, 24] };
    if (!event.shiftKey || !Object.hasOwn(offsets, event.key)) return;
    event.preventDefault();
    const [dx, dy] = offsets[event.key];
    moveBubble(bubbleX + dx, bubbleY + dy, true);
  });

  function clearHighlight() {
    highlighted?.classList.remove('ary-assistant-target');
    if (target) {
      const ids = (target.getAttribute('aria-describedby') || '').split(/\s+/).filter((id) => id && id !== description.id);
      if (ids.length) target.setAttribute('aria-describedby', ids.join(' '));
      else target.removeAttribute('aria-describedby');
    }
    target = null;
    highlighted = null;
  }

  function reserveSpace() {
    const needed = opened && kind && !root.hidden;
    document.body.classList.toggle('ary-assistant-space', Boolean(needed));
    if (needed) document.body.style.setProperty('--ary-assistant-space', Math.ceil(root.getBoundingClientRect().height + 100) + 'px');
    else document.body.style.removeProperty('--ary-assistant-space');
  }

  function revealTarget() {
    if (!visible(highlighted) || !opened || root.hidden) return;
    const box = highlighted.getBoundingClientRect();
    const header = document.querySelector('.site-header');
    const top = Math.max(24, (header?.getBoundingClientRect().bottom || 0) + 20);
    const card = panel.getBoundingClientRect();
    const overlaps = box.right > card.left && box.left < card.right;
    const bottom = overlaps ? card.top - 20 : window.innerHeight - 90;
    if (box.top < top || box.bottom > bottom) {
      // Keep the field below the sticky header and above the help card where space allows.
      window.scrollBy({ top: box.top - top, behavior: 'instant' });
    }
  }

  function render(focus = false, scroll = true) {
    clearHighlight();
    home.hidden = Boolean(kind);
    tour.hidden = !kind;
    if (!kind) { reserveSpace(); positionPanel(); rememberView(); return; }
    const items = guides[kind];
    index = Math.max(0, Math.min(index, items.length - 1));
    const current = items[index];
    byId('kind').textContent = kind === 'factura' ? 'Facturar ticket' : 'Alta de cliente';
    byId('count').textContent = `Paso ${index + 1} de ${items.length}`;
    progress.max = items.length;
    progress.value = index + 1;
    heading.textContent = current.title;
    description.textContent = current.text;
    previous.disabled = index === 0;
    next.textContent = index === items.length - 1 ? 'Terminar guía ✓' : 'Siguiente →';
    const candidate = document.querySelector(current.selector);
    fieldButton.hidden = !visible(candidate);
    fieldButton.disabled = Boolean(candidate?.disabled);
    fieldButton.textContent = current.selector === '#receipt' ? 'Ver mi seguimiento ↗' : 'Ir al campo señalado ↗';
    notice.hidden = true;
    if (current.selector === '#receipt' && !visible(candidate)) {
      notice.textContent = 'Este paso aparecerá cuando envíes el formulario. Terminar la guía no envía ni completa tu trámite.';
      notice.hidden = false;
    } else if (candidate?.disabled) {
      notice.textContent = 'Este control todavía no está habilitado. Revisa el estado de conexión y los avisos del formulario; la guía no puede habilitarlo.';
      notice.hidden = false;
    } else if (!visible(candidate)) {
      notice.textContent = 'Este campo no está visible en el estado actual del trámite. Puedes cerrar la ayuda y revisar el mensaje del portal.';
      notice.hidden = false;
    }
    if (opened && !root.hidden && visible(candidate)) {
      target = candidate;
      highlighted = candidate.closest('.field, .check') || candidate;
      highlighted.classList.add('ary-assistant-target');
      const ids = new Set((target.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
      ids.add(description.id);
      target.setAttribute('aria-describedby', [...ids].join(' '));
    }
    reserveSpace();
    positionPanel();
    rememberView();
    if (focus) heading.focus({ preventScroll: true });
    if (scroll) requestAnimationFrame(revealTarget);
  }

  function setOpen(value, restoreFocus = false, focusOnOpen = true) {
    opened = Boolean(value);
    panel.hidden = !opened || blocked();
    launcher.setAttribute('aria-expanded', String(opened && !blocked()));
    launcher.setAttribute('aria-label', opened ? 'Minimizar ayuda de ARY' : 'Abrir ayuda paso a paso de ARY');
    if (opened) {
      render(false);
      if (focusOnOpen) {
        if (kind) heading.focus({ preventScroll: true });
        else home.querySelector('a')?.focus({ preventScroll: true });
      }
    } else {
      clearHighlight();
      reserveSpace();
      if (restoreFocus && !root.hidden) launcher.focus({ preventScroll: true });
    }
    positionPanel();
    rememberView();
  }

  function begin(selected) {
    if (!Object.hasOwn(guides, selected)) return;
    kind = selected;
    index = 0;
    if (visible(receipt)) index = guides[kind].length - 1;
    else {
      const tab = document.getElementById('tab-' + kind);
      if (visible(tab) && !tab.disabled && tab.getAttribute('aria-selected') !== 'true') {
        switching = true;
        tab.click(); // Navigation only. Never click form actions or confirmations.
        switching = false;
      }
    }
    setOpen(true);
  }

  function syncPortal() {
    const modalOpen = blocked();
    launcher.disabled = modalOpen;
    panel.hidden = !opened || modalOpen;
    if (modalOpen) { clearHighlight(); reserveSpace(); return; }
    if (opened && kind) {
      if (visible(receipt)) index = guides[kind].length - 1;
      render(false, false);
    } else reserveSpace();
    positionPanel();
  }

  launcher.addEventListener('click', (event) => {
    if (ignoreClick) { event.preventDefault(); event.stopImmediatePropagation(); ignoreClick = false; return; }
    if (!blocked()) setOpen(!opened);
  });
  byId('close').addEventListener('click', () => setOpen(false, true));
  byId('menu').addEventListener('click', () => { kind = null; index = 0; render(); home.querySelector('a')?.focus(); });
  previous.addEventListener('click', () => { if (index > 0) { index--; render(true); } });
  next.addEventListener('click', () => {
    if (!kind) return;
    if (index < guides[kind].length - 1) { index++; render(true); }
    else { kind = null; index = 0; setOpen(false, true); }
  });
  root.querySelectorAll('[data-ary-guide]').forEach((link) => link.addEventListener('click', (event) => {
    if (!isBilling || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    begin(link.dataset.aryGuide);
  }));
  fieldButton.addEventListener('click', () => {
    const control = target;
    if (!visible(control) || control.disabled) return;
    // On small screens, minimize before editing. Reopening resumes the same step.
    if (window.innerWidth < 1100) setOpen(false);
    control.focus({ preventScroll: true });
    control.scrollIntoView({ block: 'center', behavior: 'instant' });
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && opened && !blocked()) setOpen(false, true);
  });
  document.getElementById('tabs')?.addEventListener('click', (event) => {
    const tab = event.target.closest?.('#tab-alta, #tab-factura');
    if (!tab || switching || !opened || !kind) return;
    kind = tab.id === 'tab-alta' ? 'alta' : 'factura';
    index = 0;
    render(false);
  });
  document.getElementById('newRequest')?.addEventListener('click', () => {
    if (opened && kind) { index = 0; render(false, false); }
  });
  const observer = new MutationObserver(syncPortal);
  if (receipt) observer.observe(receipt, { attributes: true, attributeFilter: ['hidden'] });
  if (dialog) observer.observe(dialog, { attributes: true, attributeFilter: ['open'] });
  if (isBilling) document.querySelectorAll('#form-alta, #form-factura').forEach((form) => observer.observe(form, { attributes: true, subtree: true, attributeFilter: ['disabled'] }));
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      const limits = movementLimits();
      moveBubble(clamp(bubbleX, limits.minX, limits.maxX), clamp(bubbleY, limits.minY, limits.maxY));
      reserveSpace();
    });
  }, { passive: true });
  window.visualViewport?.addEventListener('resize', () => {
    const active = document.activeElement;
    if (opened && window.innerWidth < 1100 && active?.matches('input, select, textarea') && !root.contains(active) && window.visualViewport.height < 540) setOpen(false);
  }, { passive: true });
  window.addEventListener('pagehide', () => { clearHighlight(); rememberView(); });
  root.hidden = false;
  restoreBubble();
  const requested = new URL(window.location.href).searchParams.get('guia');
  if (isBilling && requested && Object.hasOwn(guides, requested)) begin(requested);
  else setOpen(opened, false, false);
  syncPortal();
})();
