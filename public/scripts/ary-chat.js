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
  const canListen = Boolean(Recognition && window.isSecureContext);
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
  root.querySelectorAll('img').forEach(image => { image.src = '/media/ary-mascota-pemex.webp'; });
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
  const status = make('p', 'ary-voice-status', 'Toca el monito ARY para comenzar a dictar.');
  status.id = 'ary-voice-status'; status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite'); status.setAttribute('aria-atomic', 'true');
  toggle.setAttribute('aria-describedby', status.id);
  const privacy = make('p', 'ary-voice-privacy', 'Solo instrucciones de la guía; no dictes RFC, correos o datos personales. El navegador puede procesar el audio en su propio servicio. No guardamos grabaciones ni transcripciones.');
  voice.append(title, hint, actions, status, privacy);
  body.prepend(voice);

  let voiceMode = false, recognition = null, speaking = false, utterance = null;
  let listenTimer = 0, speakTimer = 0, restartTimer = 0, serial = 0;
  let lastStep = '', resizeFrame = 0, rapidEnds = 0;
  const available = () => !root.hidden && !panel.hidden && !modal?.open && document.visibilityState !== 'hidden';
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
    toggle.textContent = voiceMode ? 'Desactivar voz' : (canListen ? 'Activar voz' : 'Voz no disponible');
    toggle.setAttribute('aria-pressed', String(voiceMode));
  }
  function deactivate(reason = 'Voz desactivada. Puedes usar los botones de la guía.') {
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
      if (voiceMode) deactivate('El dictado se detuvo al cerrar la guía o cambiar de pantalla.');
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
      deactivate();
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
  function activate() {
    if (!available()) return;
    if (!canListen) {
      message('Este navegador no permite dictado seguro. Puedes seguir los pasos con los botones.');
      return;
    }
    voiceMode = true; rapidEnds = 0; updateToggle();
    // Start synchronously in the click gesture: microphone permission is browser-controlled.
    listen();
  }
  toggle.disabled = !canListen;
  updateToggle();
  if (!canListen) message('El navegador no admite dictado aquí. La guía escrita funciona con sus botones.');
  else if (!canSpeak) message('Puedes dictar órdenes, pero este navegador no permite hablar las indicaciones.');
  toggle.addEventListener('click', () => {
    if (voiceMode) deactivate();
    else activate();
  });
  const launcher = byId('launcher');
  // On normal opening, the existing guide listener runs before this one and opens the panel.
  launcher.addEventListener('click', () => {
    if (!available()) {
      if (voiceMode) deactivate();
      return;
    }
    if (!voiceMode) activate();
  });
  // When a voice command navigates from the home page to billing, the guide is
  // already open. A fresh click on the mascot resumes voice without closing it.
  let resumeFromNavigation = new URL(window.location.href).searchParams.get('voz') === '1';
  launcher.addEventListener('click', event => {
    if (!resumeFromNavigation || voiceMode || !available()) return;
    resumeFromNavigation = false;
    event.preventDefault(); event.stopImmediatePropagation();
    activate();
  }, true);
  if (resumeFromNavigation) message('Guía lista. Toca el monito o Activar voz para continuar dictando.');
  const observer = new MutationObserver(sync);
  for (const element of [panel, home, tour]) observer.observe(element, { attributes: true, attributeFilter: ['hidden'] });
  if (modal) observer.observe(modal, { attributes: true, attributeFilter: ['open'] });
  for (const element of [byId('step'), byId('description'), byId('count')]) observer.observe(element, { childList: true, characterData: true, subtree: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && voiceMode) deactivate('Dictado detenido al ocultar la página.');
    else sync();
  });
  window.addEventListener('pagehide', () => { clearRestart(); stopListening(); stopSpeaking(); voiceMode = false; });
  resizePanel(); sync();
})();
