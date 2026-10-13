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

  // Outside home/tour: microphone and audio controls remain available on every step.
  const voice = make('section', 'ary-voice'); voice.id = 'ary-voice';
  voice.setAttribute('aria-labelledby', 'ary-voice-title');
  const title = make('h3', '', 'Dictado por voz'); title.id = 'ary-voice-title';
  const hint = make('p', 'ary-voice-hint', 'Di “quiero facturar”, “quiero darme de alta”, “siguiente”, “anterior” o “repetir”.');
  const actions = make('div', 'ary-voice-actions');
  const mic = button('ary-voice-mic', '🎙 Dictar una instrucción');
  mic.setAttribute('aria-pressed', 'false');
  const audio = button('ary-voice-audio', 'Escuchar indicaciones');
  audio.setAttribute('aria-pressed', 'false');
  const repeat = button('ary-voice-repeat', 'Repetir indicación');
  actions.append(mic, audio, repeat);
  const status = make('p', 'ary-voice-status', 'El micrófono se activa solo cuando lo pulsas.');
  status.id = 'ary-voice-status'; status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite'); status.setAttribute('aria-atomic', 'true');
  mic.setAttribute('aria-describedby', status.id);
  const privacy = make('p', 'ary-voice-privacy', 'No dictes RFC, correos ni otros datos personales aquí. El navegador puede usar su servicio de voz para procesar el audio. ARY no guarda grabaciones ni transcripciones.');
  voice.append(title, hint, actions, status, privacy);
  body.prepend(voice);

  let enabled = false, preferenceSet = false, recognition = null;
  let listenTimer = 0, speakTimer = 0, serial = 0, lastStep = '', resizeFrame = 0;
  const available = () => !root.hidden && !panel.hidden && !modal?.open && document.visibilityState !== 'hidden';
  function resizePanel() {
    if (!resizeFrame) resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0; window.dispatchEvent(new Event('resize'));
    });
  }
  function message(text) { status.textContent = text; resizePanel(); }
  function stopListening() {
    clearTimeout(listenTimer);
    const previous = recognition; recognition = null;
    if (previous) {
      previous.onresult = previous.onerror = previous.onend = previous.onstart = null;
      try { previous.abort(); } catch { /* Already ended. */ }
    }
    mic.textContent = '🎙 Dictar una instrucción';
    mic.setAttribute('aria-pressed', 'false');
  }
  function stopSpeaking() {
    clearTimeout(speakTimer); serial++;
    try { synthesis?.cancel(); } catch { /* Speech is optional. */ }
  }
  function setAudio(value) {
    enabled = Boolean(value && canSpeak); preferenceSet = true;
    audio.textContent = enabled ? 'Silenciar indicaciones' : 'Escuchar indicaciones';
    audio.setAttribute('aria-pressed', String(enabled));
    if (!enabled) stopSpeaking();
  }
  function speak(text) {
    if (!enabled || !canSpeak || !available() || !text) return;
    stopListening(); stopSpeaking();
    const token = serial;
    try {
      const utterance = new window.SpeechSynthesisUtterance(text);
      utterance.lang = 'es-MX'; utterance.rate = 0.95;
      const voices = synthesis.getVoices();
      const selected = voices.find(v => /^es[-_]MX$/i.test(v.lang)) || voices.find(v => /^es(?:[-_]|$)/i.test(v.lang));
      if (selected) utterance.voice = selected;
      utterance.onstart = () => { if (token === serial) message('Leyendo la indicación…'); };
      utterance.onend = () => { if (token === serial) message('Toca el micrófono para dictar otra instrucción o usa los botones.'); };
      utterance.onerror = () => {
        if (token === serial) message('No se pudo reproducir la voz. Puedes leer el paso o pulsar Repetir indicación.');
      };
      synthesis.speak(utterance);
    } catch { message('La voz no está disponible. La guía escrita sigue funcionando.'); }
  }
  function currentInstruction() {
    if (tour.hidden) return '¿Qué necesitas hacer? Puedes decir: quiero facturar, o quiero darme de alta.';
    // Only predefined guide copy, never input values, receipt details or billing data.
    return [byId('count').textContent, byId('step').textContent.replace(/^\d+\.\s*/, ''), byId('description').textContent].join('. ');
  }
  function readCurrent() { lastStep = currentInstruction(); speak(lastStep); }
  function sync() {
    if (!available()) {
      const wasListening = Boolean(recognition);
      stopListening(); stopSpeaking(); lastStep = '';
      if (wasListening) message('Dictado detenido. No se ejecutó ninguna instrucción pendiente.');
      return;
    }
    const instruction = currentInstruction();
    if (instruction === lastStep) return;
    lastStep = instruction;
    stopListening(); stopSpeaking();
    if (enabled) speakTimer = setTimeout(() => speak(currentInstruction()), 80);
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
  function explain(text) { message(text); if (enabled) speak(text); }
  function execute(text) {
    if (!available()) return;
    const action = command(text);
    if (!action) {
      explain('No reconocí una instrucción. Di quiero facturar, quiero darme de alta, siguiente, anterior o repetir. Los datos y el envío se confirman en el formulario.');
      return;
    }
    if (action === 'mute') { setAudio(false); message('Indicaciones silenciadas. El dictado sigue disponible al pulsar el micrófono.'); return; }
    if (action === 'audio' || action === 'repeat') { setAudio(true); readCurrent(); return; }
    if (action === 'factura' || action === 'alta') {
      message(action === 'factura' ? 'Abriendo la guía para facturar.' : 'Abriendo la guía para darte de alta.');
      if (document.getElementById('form-factura') && document.getElementById('form-alta')) {
        home.querySelector('[data-ary-guide="' + action + '"]').click();
      } else {
        stopListening(); stopSpeaking();
        // Two fixed same-origin destinations, never a URL dictated by the visitor.
        window.location.assign('/facturacion/?guia=' + action + '&voz=1');
      }
      return;
    }
    if (action === 'close') { byId('close').click(); return; }
    if (action === 'menu') { byId('menu').click(); return; }
    if (tour.hidden) { explain('Primero elige quiero facturar o quiero darme de alta.'); return; }
    const target = byId(action); // Only next or prev; NEVER form submit/checkbox.
    if (target.disabled) { explain('Ya estás en el primer paso.'); return; }
    target.click();
  }
  function listen() {
    if (!available()) return;
    if (recognition) { stopListening(); message('Dictado detenido.'); return; }
    if (!canListen) { message('El dictado no está disponible en este navegador. Usa los botones de la guía.'); return; }
    stopSpeaking();
    if (!preferenceSet) setAudio(true);
    let current;
    try { current = new Recognition(); } catch { message('No se pudo iniciar el dictado en este navegador. Usa los botones.'); return; }
    recognition = current;
    current.lang = 'es-MX'; current.continuous = false; current.interimResults = false; current.maxAlternatives = 1;
    current.onstart = () => {
      if (recognition !== current) return;
      mic.textContent = '■ Detener dictado'; mic.setAttribute('aria-pressed', 'true');
      message('Escuchando una instrucción…');
    };
    current.onresult = event => {
      if (recognition !== current || !available()) return;
      const result = event.results?.[event.resultIndex ?? 0];
      if (!result?.isFinal) return;
      const text = result[0]?.transcript || '';
      stopListening(); execute(text); // Transcript is not rendered, logged or stored.
    };
    current.onerror = event => {
      if (recognition !== current) return;
      stopListening();
      const messages = {
        'not-allowed': 'El micrófono no tiene permiso. Puedes permitirlo desde el navegador o seguir con los botones.',
        'service-not-allowed': 'El servicio de dictado no está disponible. Usa los botones de la guía.',
        'audio-capture': 'No se detectó un micrófono disponible. Usa los botones de la guía.',
        'no-speech': 'No escuché una instrucción. Pulsa el micrófono e inténtalo otra vez.',
        network: 'El servicio de voz no respondió. Puedes seguir con los botones de la guía.'
      };
      message(messages[event.error] || 'Se detuvo el dictado. Puedes intentarlo de nuevo o usar los botones.');
    };
    current.onend = () => {
      if (recognition !== current) return;
      stopListening(); message('El dictado terminó. Pulsa el micrófono para intentarlo otra vez.');
    };
    listenTimer = setTimeout(() => {
      if (recognition !== current) return;
      stopListening(); message('No llegó una instrucción a tiempo. Usa los botones o vuelve a pulsar el micrófono.');
    }, 15000);
    try { current.start(); } catch { stopListening(); message('No se pudo activar el micrófono. Usa los botones de la guía.'); }
  }
  mic.disabled = !canListen;
  audio.disabled = repeat.disabled = !canSpeak;
  if (!canListen) message('Dictado no disponible aquí. Usa los botones; la voz de las indicaciones depende de tu navegador.');
  if (!canSpeak) message('Este navegador no ofrece lectura en voz alta. Puedes seguir la guía escrita.');
  if (new URL(window.location.href).searchParams.get('voz') === '1' && canSpeak) {
    message('Guía lista. Toca Escuchar indicaciones para activar el audio en esta página.');
  }
  mic.addEventListener('click', listen);
  audio.addEventListener('click', () => {
    stopListening(); setAudio(!enabled);
    if (enabled) readCurrent(); else message('Indicaciones silenciadas.');
  });
  repeat.addEventListener('click', () => { stopListening(); setAudio(true); readCurrent(); });
  // Manual guide selection also speaks, unless the visitor deliberately muted it.
  root.addEventListener('click', event => {
    if (!event.target.closest?.('[data-ary-guide]')) return;
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    if (event.isTrusted && !preferenceSet) setAudio(true);
  }, true);
  const observer = new MutationObserver(sync);
  for (const element of [panel, home, tour]) observer.observe(element, { attributes: true, attributeFilter: ['hidden'] });
  if (modal) observer.observe(modal, { attributes: true, attributeFilter: ['open'] });
  for (const element of [byId('step'), byId('description'), byId('count')]) observer.observe(element, { childList: true, characterData: true, subtree: true });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') sync(); });
  window.addEventListener('pagehide', () => { stopListening(); stopSpeaking(); });
  resizePanel(); sync();
})();
