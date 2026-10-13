/* ARY voice guide. This historical asset path is kept for IIS compatibility.
 * No chat, AI endpoint, recordings, transcript storage or form-field reads.
 * Voice commands only choose/navigate the EXISTING guide. Never submit a form.
 */
(() => {
  'use strict';
  const root = document.getElementById('ary-assistant');
  const byId = name => document.getElementById('ary-assistant-' + name);
  const panel = byId('panel'), home = byId('home'), tour = byId('tour');
  if (!root || !panel || !home || !tour || root.dataset.voiceReady) return;
  root.dataset.voiceReady = 'true';
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const synthesis = window.speechSynthesis;
  const canSpeak = Boolean(synthesis && window.SpeechSynthesisUtterance);
  const canListen = Boolean(Recognition && window.isSecureContext && navigator.mediaDevices?.getUserMedia);
  const modal = document.getElementById('reviewDialog');
  const body = root.querySelector('.ary-assistant-body');
  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };
  const button = (id, text) => {
    const node = make('button', '', text);
    node.type = 'button'; node.id = id;
    return node;
  };
  root.querySelectorAll('img').forEach(image => { image.src = '/media/ary-mascota-pensando-v1.webp'; });
  byId('title').textContent = 'Guía de voz ARY';
  const footer = root.querySelector('.ary-assistant-footer');
  if (footer) footer.textContent = 'El dictado elige y recorre la guía. Tú capturas, revisas y envías tus datos en el formulario.';
  const welcome = home.querySelector('.ary-assistant-welcome');
  if (welcome) welcome.textContent = 'Dime qué necesitas o elige una opción. Al iniciar una guía puedes escuchar cada indicación.';

  // A single button is all the visitor needs after tapping the ARY mascot.
  const voice = make('section', 'ary-voice'); voice.id = 'ary-voice';
  voice.setAttribute('aria-labelledby', 'ary-voice-title');
  const title = make('h3', '', 'Guía hablada ARY'); title.id = 'ary-voice-title';
  const hint = make('p', 'ary-voice-hint', 'Di “quiero facturar”, “quiero darme de alta”, “siguiente”, “anterior” o “repetir”.');
  const actions = make('div', 'ary-voice-actions');
  const toggle = button('ary-voice-toggle', 'Activar voz');
  toggle.setAttribute('aria-pressed', 'false');
  actions.append(toggle);
  const status = make('p', 'ary-voice-status', 'Pulsa Activar voz para permitir el micrófono del bot.');
  status.id = 'ary-voice-status'; status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite'); status.setAttribute('aria-atomic', 'true');
  toggle.setAttribute('aria-describedby', status.id);
  const privacy = make('p', 'ary-voice-privacy', 'Solo instrucciones de la guía; no dictes RFC, correos o datos personales. El navegador puede procesar el audio en su propio servicio. No guardamos grabaciones ni transcripciones.');
  voice.append(title, hint, actions, status, privacy);
  body.prepend(voice);

  // Remember only this tab's choice, never a permission grant or audio/transcripts.
  const CHOICE_KEY = 'ary-voice-choice-v1';
  let choice = '';
  try { choice = sessionStorage.getItem(CHOICE_KEY) || ''; } catch { /* optional storage */ }
  if (!['allow', 'skip'].includes(choice)) choice = '';
  function rememberChoice(value) {
    choice = value;
    try { sessionStorage.setItem(CHOICE_KEY, value); } catch { /* optional storage */ }
  }
  let voiceMode = false, recognition = null, speaking = false, utterance = null;
  let permissionPending = false, permissionSerial = 0, permissionTimer = 0;
  let consentShown = Boolean(choice);
  let listenTimer = 0, speakTimer = 0, restartTimer = 0, serial = 0;
  let lastStep = '', resizeFrame = 0, rapidEnds = 0;
  const consent = make('dialog', 'ary-voice-consent');
  const available = () => !root.hidden && !panel.hidden && !modal?.open && !consent.open && !consent.hasAttribute('data-fallback-open') && document.visibilityState !== 'hidden';
  function resizePanel() {
    if (!resizeFrame) resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0; window.dispatchEvent(new Event('resize'));
    });
  }
  function message(text) { status.textContent = text; resizePanel(); }
  function clearRestart() { clearTimeout(restartTimer); restartTimer = 0; }
  function stopListening() {
    clearTimeout(listenTimer); listenTimer = 0;
    const previous = recognition; recognition = null;
    if (previous) {
      previous.onresult = previous.onerror = previous.onend = previous.onstart = null;
      try { previous.abort(); } catch { /* Recognition already ended. */ }
    }
  }
  function stopSpeaking() {
    clearTimeout(speakTimer); speakTimer = 0; serial++;
    speaking = false; utterance = null;
    try { synthesis?.cancel(); } catch { /* Speech is optional. */ }
  }
  function updateToggle() {
    toggle.textContent = permissionPending ? 'Cancelar activación' : (voiceMode ? 'Desactivar voz' : (canListen ? 'Activar voz' : 'Voz no disponible'));
    toggle.setAttribute('aria-busy', String(permissionPending));
    toggle.setAttribute('aria-pressed', String(voiceMode));
  }
  function deactivate(reason = 'Voz desactivada. Puedes usar los botones de la guía.') {
    permissionSerial++; permissionPending = false; clearTimeout(permissionTimer);
    voiceMode = false; clearRestart(); stopListening(); stopSpeaking(); updateToggle();
    message(reason);
  }
  function scheduleListen(delay = 180) {
    clearRestart();
    if (!voiceMode || !available() || recognition || speaking) return;
    restartTimer = setTimeout(() => { restartTimer = 0; listen(); }, delay);
  }
  function speak(text) {
    if (!voiceMode || !available() || !text) return;
    if (!canSpeak) { scheduleListen(); return; }
    clearRestart(); stopListening(); stopSpeaking();
    const token = serial;
    speaking = true;
    try {
      const voiceLine = new window.SpeechSynthesisUtterance(text);
      utterance = voiceLine; // Keep a reference until the utterance completes.
      voiceLine.lang = 'es-MX'; voiceLine.rate = 0.95;
      const voices = synthesis.getVoices();
      const selected = voices.find(v => /^es[-_]MX$/i.test(v.lang)) || voices.find(v => /^es(?:[-_]|$)/i.test(v.lang));
      if (selected) voiceLine.voice = selected;
      voiceLine.onstart = () => { if (token === serial) message('ARY te está explicando el paso…'); };
      const finished = (failed = false) => {
        if (token !== serial) return;
        clearTimeout(speakTimer); speakTimer = 0;
        speaking = false; utterance = null;
        if (voiceMode) {
          message(failed ? 'No pude hablar. Sigo escuchando tus instrucciones.' : 'Escuchando tu siguiente instrucción…');
          scheduleListen();
        }
      };
      voiceLine.onend = () => finished();
      voiceLine.onerror = () => finished(true);
      speakTimer = setTimeout(() => {
        if (token !== serial) return;
        stopSpeaking();
        if (voiceMode) { message('La voz tardó demasiado. Vuelvo a escuchar.'); scheduleListen(); }
      }, Math.max(8000, Math.min(45000, text.length * 90 + 5000)));
      synthesis.speak(voiceLine);
    } catch {
      speaking = false; utterance = null;
      message('La voz hablada no está disponible. Sigo escuchando tus instrucciones.');
      scheduleListen();
    }
  }
  function currentInstruction() {
    if (tour.hidden) return '¿Qué necesitas hacer? Puedes decir: quiero facturar, o quiero darme de alta.';
    // Never read form fields, receipt values or personal data aloud.
    return [byId('count').textContent, byId('step').textContent.replace(/^\d+\.\s*/, ''), byId('description').textContent].join('. ');
  }
  function readCurrent() { lastStep = currentInstruction(); speak(lastStep); }
  function sync() {
    if (!available()) {
      if (voiceMode || permissionPending) deactivate('El dictado se detuvo al cerrar la guía o cambiar de pantalla.');
      lastStep = '';
      return;
    }
    const instruction = currentInstruction();
    if (instruction === lastStep) return;
    lastStep = instruction;
    if (!voiceMode) return;
    clearRestart(); stopListening(); stopSpeaking();
    if (canSpeak) speakTimer = setTimeout(() => speak(currentInstruction()), 80);
    else scheduleListen();
  }

  function normalise(text) {
    return String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ').trim()
      .replace(/^(?:hola )?(?:ary )?/, '').replace(/(?: por favor)$/, '').trim();
  }
  function command(text) {
    const q = normalise(text);
    // Exact commands: negations, mixed intentions and personal data are not guessed.
    if (/^(?:(?:quiero|necesito) )?(?:facturar(?: (?:mi|un|el) ticket)?|una factura)$/.test(q)) return 'factura';
    if (/^(?:(?:quiero|necesito) )?(?:darme de alta|registrarme|alta de cliente)$/.test(q)) return 'alta';
    if (/^(?:siguiente(?: paso)?|continuar|continua|avanza)$/.test(q)) return 'next';
    if (/^(?:anterior|paso anterior|regresar|regresa)$/.test(q)) return 'prev';
    if (/^(?:repite(?: la indicacion| el paso)?|repetir(?: indicacion| paso)?|otra vez|no entendi)$/.test(q)) return 'repeat';
    if (/^(?:silencio|silenciar|deja de hablar|silenciar indicaciones)$/.test(q)) return 'mute';
    if (/^(?:activar voz|habla|escuchar indicaciones)$/.test(q)) return 'audio';
    if (/^(?:menu|volver al menu|inicio)$/.test(q)) return 'menu';
    if (/^(?:cerrar ayuda|cerrar guia|terminar guia)$/.test(q)) return 'close';
    return null;
  }
  function explain(text) { message(text); if (voiceMode) speak(text); }
  function execute(text) {
    if (!voiceMode || !available()) return;
    const action = command(text);
    if (!action) {
      explain('No reconocí la instrucción. Di quiero facturar, quiero darme de alta, siguiente, anterior o repetir. Nunca se envían datos desde la guía.');
      return;
    }
    if (action === 'mute' || action === 'close') {
      rememberChoice('skip'); deactivate();
      if (action === 'close') byId('close').click();
      return;
    }
    if (action === 'audio' || action === 'repeat') { readCurrent(); return; }
    if (action === 'factura' || action === 'alta') {
      message(action === 'factura' ? 'Abriendo la guía para facturar.' : 'Abriendo la guía para darte de alta.');
      if (document.getElementById('form-factura') && document.getElementById('form-alta')) {
        home.querySelector('[data-ary-guide="' + action + '"]').click();
      } else {
        stopListening(); stopSpeaking();
        // Only fixed same-origin destinations, never arbitrary dictated URLs.
        window.location.assign('/facturacion/?guia=' + action + '&voz=1');
      }
      return;
    }
    if (action === 'menu') { byId('menu').click(); return; }
    if (tour.hidden) { explain('Primero dime: quiero facturar o quiero darme de alta.'); return; }
    const target = byId(action); // Only next/prev: never submit or tick confirmations.
    if (target.disabled) { explain('Ya estás en el primer paso.'); return; }
    target.click();
  }

  function listen() {
    if (!voiceMode || !available() || recognition || speaking) return;
    if (!canListen) { deactivate('El dictado no está disponible en este navegador. Usa los botones.'); return; }
    let current;
    try { current = new Recognition(); }
    catch { deactivate('No se pudo iniciar el micrófono. Usa los botones de la guía.'); return; }
    recognition = current;
    const startedAt = Date.now();
    current.lang = 'es-MX'; current.continuous = false; current.interimResults = false; current.maxAlternatives = 1;
    current.onstart = () => {
      if (recognition !== current || !voiceMode) return;
      message('Escuchando… di quiero facturar, quiero darme de alta o siguiente.');
    };
    current.onresult = event => {
      if (recognition !== current || !voiceMode || !available()) return;
      const result = event.results?.[event.resultIndex ?? 0];
      if (!result?.isFinal) return;
      const spokenText = result[0]?.transcript || '';
      rapidEnds = 0; stopListening();
      execute(spokenText); // Never show, store or transmit the transcript.
      // The guide's DOM changes may also trigger a spoken step.
      if (voiceMode && !recognition && !speaking) scheduleListen(350);
    };
    current.onerror = event => {
      if (recognition !== current) return;
      stopListening();
      const fatal = {
        'not-allowed': 'El micrófono no tiene permiso. Actívalo desde el navegador y vuelve a pulsar Activar voz.',
        'service-not-allowed': 'El servicio de dictado no está disponible aquí. Usa los botones de la guía.',
        'audio-capture': 'No se encontró un micrófono disponible. Usa los botones.',
        network: 'El servicio de reconocimiento no respondió. Vuelve a activar la voz si lo deseas.'
      };
      if (event.error === 'no-speech') {
        message('No escuché una instrucción. Continúo escuchando…');
        scheduleListen(400);
      } else {
        rememberChoice('skip');
        deactivate(fatal[event.error] || 'El navegador detuvo el micrófono. Puedes volver a activar la voz.');
      }
    };
    current.onend = () => {
      if (recognition !== current) return;
      current.onresult = current.onerror = current.onend = current.onstart = null;
      recognition = null;
      clearTimeout(listenTimer); listenTimer = 0;
      if (!voiceMode || !available()) return;
      // Don't loop forever if the browser rejects starts immediately.
      rapidEnds = Date.now() - startedAt < 650 ? rapidEnds + 1 : 0;
      if (rapidEnds >= 3) {
        deactivate('El navegador está cortando el dictado. Pulsa Activar voz para intentarlo de nuevo.');
        return;
      }
      message('El navegador terminó de escuchar; reanudando el dictado…');
      scheduleListen(rapidEnds ? 900 : 250);
    };
    listenTimer = setTimeout(() => {
      if (recognition !== current) return;
      stopListening();
      if (voiceMode) {
        message('Sigo aquí. Vuelvo a escuchar una instrucción…');
        scheduleListen(350);
      }
    }, 15000);
    try { current.start(); }
    catch { deactivate('El navegador no permitió iniciar el micrófono. Usa los botones o vuelve a activar la voz.'); }
  }
  function releaseStream(stream) {
    try { for (const track of stream.getTracks()) track.stop(); } catch { /* best effort */ }
  }
  function activate() {
    if (!available() || voiceMode || permissionPending) return;
    if (!canListen) {
      message('Este navegador no ofrece dictado seguro. Puedes usar la guía escrita.');
      return;
    }
    // Do not bypass a policy configured by the site, an iframe, or the browser.
    try {
      const policy = document.permissionsPolicy || document.featurePolicy;
      if (policy?.allowsFeature && !policy.allowsFeature('microphone')) {
        message('La configuración de esta página bloquea el micrófono. Revisa Permissions-Policy en IIS. La guía escrita sigue disponible.');
        return;
      }
    } catch { /* Browser permission check below is authoritative. */ }
    permissionPending = true; updateToggle();
    const token = ++permissionSerial;
    lastStep = currentInstruction();
    message('Permite el micrófono en el aviso del navegador. Es solo para las instrucciones del bot ARY.');
    permissionTimer = setTimeout(() => {
      if (token !== permissionSerial || !permissionPending) return;
      rememberChoice('skip');
      deactivate('El permiso quedó sin responder. Puedes pulsar Activar voz más tarde.');
    }, 45000);
    let request;
    try {
      // Called only by Sí, permitir / Activar voz or an explicit accepted mascot tap.
      // Audio only: never request the camera or record/upload the permission stream.
      request = navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch (error) {
      permissionFailed(error, token); return;
    }
    Promise.resolve(request).then(stream => {
      // Always stop this probe, even if permission was answered after cancel/close.
      releaseStream(stream);
      if (token !== permissionSerial || !permissionPending || !available()) return;
      clearTimeout(permissionTimer); permissionPending = false;
      rememberChoice('allow'); voiceMode = true; rapidEnds = 0;
      lastStep = currentInstruction(); updateToggle();
      listen();
    }).catch(error => permissionFailed(error, token));
  }
  function permissionFailed(error, token) {
    if (token !== permissionSerial || !permissionPending) return;
    const errors = {
      NotAllowedError: 'El micrófono está bloqueado en el navegador, Windows o la página. Abre la configuración del sitio, permite Micrófono y pulsa Activar voz otra vez.',
      SecurityError: 'La seguridad del navegador bloqueó el micrófono. Revisa los permisos del sitio.',
      NotFoundError: 'No se encontró un micrófono. Conéctalo y pulsa Activar voz para reintentar.',
      NotReadableError: 'No pude usar el micrófono. Revisa si otra aplicación lo está ocupando.',
      AbortError: 'La activación del micrófono se interrumpió. Puedes volver a intentarlo.'
    };
    rememberChoice('skip');
    deactivate(errors[error?.name] || 'No se pudo activar el micrófono. Puedes continuar sin voz o reintentarlo desde el bot.');
  }

  // The initial question is ARY's own dialog. Loading the page requests NO media.
  consent.id = 'ary-voice-consent';
  consent.setAttribute('aria-labelledby', 'ary-voice-consent-title');
  consent.setAttribute('aria-describedby', 'ary-voice-consent-text');
  consent.setAttribute('aria-modal', 'true');
  const card = make('div', 'ary-voice-consent-card');
  const image = make('img', 'ary-voice-consent-image');
  image.src = '/media/ary-mascota-pensando-v1.webp'; image.alt = '';
  image.width = 96; image.height = 96;
  const eyebrow = make('p', 'ary-voice-consent-eyebrow', 'TU BOT ARY, PASO A PASO');
  const question = make('h2', '', '¿Activamos el micrófono para el bot ARY?');
  question.id = 'ary-voice-consent-title';
  const info = make('p', '', 'Podrás decir “quiero facturar” o “quiero darme de alta” y escuchar las indicaciones paso a paso. También puedes continuar sin voz.');
  info.id = 'ary-voice-consent-text';
  const details = make('p', 'ary-voice-consent-note', 'Tú decides. Si aceptas, el navegador te pedirá permiso. No dictes datos personales; el servicio de voz del navegador puede procesar el audio. ARY no guarda grabaciones.');
  const choices = make('div', 'ary-voice-consent-actions');
  const allow = button('ary-voice-consent-allow', 'Sí, permitir');
  const skip = button('ary-voice-consent-skip', 'No por ahora');
  skip.setAttribute('autofocus', '');
  choices.append(allow, skip);
  card.append(image, eyebrow, question, info, details, choices);
  consent.append(card); document.body.append(consent);
  if (!canListen) {
    allow.disabled = true;
    info.textContent = 'Este navegador no ofrece dictado por voz aquí. Puedes usar el bot con los botones y seguir todas las indicaciones escritas.';
  }
  function hideConsent() {
    if (consent.open && typeof consent.close === 'function') consent.close();
    consent.removeAttribute('data-fallback-open');
    consent.removeAttribute('open');
    document.body.classList.remove('ary-voice-consent-open');
  }
  function decline() {
    rememberChoice('skip'); hideConsent();
    deactivate('Sin micrófono por ahora. Puedes activarlo después desde este bot con Activar voz.');
    byId('launcher').focus({ preventScroll: true });
  }
  function showConsent() {
    if (consentShown || modal?.open || document.visibilityState === 'hidden') return;
    consentShown = true;
    document.body.classList.add('ary-voice-consent-open');
    if (typeof consent.showModal === 'function') consent.showModal();
    else { consent.setAttribute('open', ''); consent.setAttribute('data-fallback-open', ''); }
    skip.focus({ preventScroll: true });
    sync();
  }
  allow.addEventListener('click', event => {
    if (!event.isTrusted) return;
    rememberChoice('skip'); hideConsent(); // A click is intent, not a granted permission.
    if (panel.hidden) byId('launcher').click(); // Opens UI only; synthetic clicks never request media.
    activate();
  });
  skip.addEventListener('click', decline);
  consent.addEventListener('cancel', event => { event.preventDefault(); decline(); });
  consent.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const first = allow.disabled ? skip : allow;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); skip.focus(); }
    else if (!event.shiftKey && document.activeElement === skip) { event.preventDefault(); first.focus(); }
  });
  toggle.disabled = !canListen; updateToggle();
  if (!canListen) message('El navegador no admite dictado aquí. Usa los botones de la guía.');
  else if (choice === 'skip') message('Puedes activar el micrófono después con Activar voz.');
  toggle.addEventListener('click', event => {
    if (!event.isTrusted) return;
    if (voiceMode || permissionPending) { rememberChoice('skip'); deactivate(); }
    else activate();
  });
  const launcher = byId('launcher');
  launcher.addEventListener('click', event => {
    if (!event.isTrusted) return;
    if (!available()) {
      if (voiceMode || permissionPending) deactivate();
      return;
    }
    // Opting out is respected: opening the bot after No por ahora only shows Activar voz.
    if (choice === 'allow' && !voiceMode && !permissionPending) activate();
  });
  let resumeFromNavigation = new URL(window.location.href).searchParams.get('voz') === '1';
  launcher.addEventListener('click', event => {
    if (!event.isTrusted || !resumeFromNavigation || choice !== 'allow' || voiceMode || permissionPending || !available()) return;
    resumeFromNavigation = false;
    event.preventDefault(); event.stopImmediatePropagation(); activate();
  }, true);
  if (resumeFromNavigation) message('Guía lista. Pulsa Activar voz para continuar. El micrófono no se enciende al cambiar de página.');
  const observer = new MutationObserver(() => { sync(); showConsent(); });
  for (const element of [root, panel, home, tour]) observer.observe(element, { attributes: true, attributeFilter: ['hidden'] });
  if (modal) observer.observe(modal, { attributes: true, attributeFilter: ['open'] });
  for (const element of [byId('step'), byId('description'), byId('count')]) observer.observe(element, { childList: true, characterData: true, subtree: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && (voiceMode || permissionPending)) deactivate('Dictado detenido al ocultar la página.');
    else { sync(); showConsent(); }
  });
  window.addEventListener('pagehide', () => { deactivate('Dictado detenido al salir de la página.'); });
  resizePanel(); sync(); showConsent();
})();
