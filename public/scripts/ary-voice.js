/* Voz ARY: activación explícita, sin leer formularios ni enviar trámites. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const root = $('ary-assistant'), panel = $('ary-assistant-panel');
  const input = $('ary-chat-message'), chat = $('ary-chat');
  if (!root || !panel || !input || !chat || root.dataset.voiceReady) return;
  root.dataset.voiceReady = 'true';
  const make = (tag, text, className) => {
    const el = document.createElement(tag);
    if (text) el.textContent = text;
    if (className) el.className = className;
    return el;
  };
  const bar = make('div', '', 'ary-voice');
  const speak = make('button', 'Escuchar ayuda', 'ary-voice-button');
  speak.id = 'ary-voice-speak'; speak.type = 'button'; speak.setAttribute('aria-pressed', 'false');
  const status = make('p', 'La voz se activa únicamente al pulsar un botón.', 'ary-voice-status');
  status.id = 'ary-voice-status'; status.setAttribute('role', 'status');
  bar.append(speak, status);
  panel.querySelector('.ary-assistant-body').prepend(bar);
  const permission = make('label', '', 'ary-voice-consent');
  const consent = make('input'); consent.type = 'checkbox'; consent.id = 'ary-voice-consent';
  permission.append(consent, make('span', 'Permitir dictado. Mi navegador puede procesar el audio con su proveedor. No dictaré datos fiscales, contraseñas ni datos de pago.'));
  const dictate = make('button', 'Dictar pregunta', 'ary-voice-button');
  dictate.id = 'ary-voice-dictate'; dictate.type = 'button'; dictate.setAttribute('aria-pressed', 'false');
  dictate.setAttribute('aria-describedby', 'ary-voice-status');
  const actions = chat.querySelector('.ary-chat-actions');
  actions.before(permission); actions.append(dictate);
  const synth = window.speechSynthesis;
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let utterance = null, recognition = null, base = '', oldReadOnly = false;
  let sequence = 0, voiceList = [], voiceSession = false;
  function loadVoices() {
    try { voiceList = synth ? synth.getVoices() : []; } catch { voiceList = []; }
  }
  function bestSpanishVoice() {
    const spanish = voiceList.filter(voice => /^es(?:[-_]|$)/i.test(String(voice.lang || '')));
    if (!spanish.length) return null;
    const score = voice => {
      const lang = String(voice.lang || ''), name = String(voice.name || '');
      let points = /^es[-_]MX$/i.test(lang) ? 120 : /^es[-_](?:US|419)$/i.test(lang) ? 90 : 60;
      if (/dalia/i.test(name)) points += 100;
      if (/natural|neural|online/i.test(name)) points += 75;
      if (/microsoft|google/i.test(name)) points += 30;
      if (/paulina|sabina|m[oó]nica|raul|jorge/i.test(name)) points += 20;
      if (/compact|legacy|basic/i.test(name)) points -= 35;
      return points;
    };
    return spanish.sort((a, b) => score(b) - score(a))[0];
  }
  loadVoices();
  synth?.addEventListener?.('voiceschanged', loadVoices);
  function stopSpeech() {
    const old = utterance; utterance = null;
    if (old) { old.onend = null; old.onerror = null; }
    try { synth?.cancel(); } catch { /* Voice API unavailable. */ }
    speak.textContent = 'Escuchar ayuda'; speak.setAttribute('aria-pressed', 'false');
  }
  function stopListening() {
    sequence++;
    const old = recognition; recognition = null;
    if (old) {
      old.onresult = null; old.onend = null; old.onerror = null;
      try { old.abort(); } catch { /* Already stopped. */ }
      input.readOnly = oldReadOnly;
    }
    dictate.textContent = 'Dictar pregunta'; dictate.setAttribute('aria-pressed', 'false');
  }
  function stopAll() { const active = Boolean(utterance || recognition); stopSpeech(); stopListening(); if(active) status.textContent = 'Voz detenida.'; }
  function helpText() {
    const tour = $('ary-assistant-tour');
    if (tour && !tour.hidden) return [$('ary-assistant-step')?.textContent, $('ary-assistant-description')?.textContent].filter(Boolean).join('. ');
    if (chat.open) {
      const replies = chat.querySelectorAll('.ary-chat-message.is-assistant p');
      if (replies.length) return replies[replies.length - 1].textContent;
    }
    return 'Soy tu asistente ARY. Puedo guiarte para facturar, registrar un cliente o responder dudas. Elige una opción o abre el chat. No leo tus formularios ni envío solicitudes por ti.';
  }
  speak.addEventListener('click', () => {
    if (utterance) { stopSpeech(); status.textContent = 'Lectura detenida.'; return; }
    if (!synth || !window.SpeechSynthesisUtterance) { status.textContent = 'Este navegador no admite lectura en voz. Puedes leer la ayuda en pantalla.'; return; }
    stopListening(); stopSpeech(); loadVoices();
    const text = String(helpText() || '').trim().slice(0, 3000);
    if (!text) { status.textContent = 'No hay ayuda para leer todavía.'; return; }
    const u = new SpeechSynthesisUtterance(text); utterance = u;
    u.lang = 'es-MX'; u.rate = 0.94; u.pitch = 1.02; u.volume = 1;
    const voice = bestSpanishVoice();
    if (voice) u.voice = voice;
    u.onend = () => { if (utterance === u) { stopSpeech(); status.textContent = 'Lectura terminada.'; } };
    u.onerror = () => { if (utterance === u) { stopSpeech(); status.textContent = 'No se pudo reproducir la voz. Revisa el audio y vuelve a pulsar Escuchar ayuda.'; } };
    speak.textContent = 'Detener voz'; speak.setAttribute('aria-pressed', 'true');
    status.textContent = 'Leyendo la ayuda. No se leen tus campos de facturación.';
    try { synth.resume(); synth.speak(u); } catch { stopSpeech(); status.textContent = 'La voz no está disponible. La ayuda escrita sigue funcionando.'; }
  });
  function speakAssistantReply(text) {
    if (!voiceSession || !synth || !window.SpeechSynthesisUtterance) return;
    const clean = String(text || '').trim().slice(0, 1800);
    if (!clean) return;
    stopListening(); stopSpeech(); loadVoices();
    const u = new SpeechSynthesisUtterance(clean); utterance = u;
    u.lang = 'es-MX'; u.rate = 0.94; u.pitch = 1.02; u.volume = 1;
    const voice = bestSpanishVoice();
    if (voice) u.voice = voice;
    u.onend = () => {
      if (utterance === u) {
        stopSpeech();
        status.textContent = 'Respuesta terminada. Pulsa Dictar pregunta para hablar otra vez.';
      }
    };
    u.onerror = () => {
      if (utterance === u) {
        stopSpeech();
        status.textContent = 'No se pudo reproducir la respuesta. Puedes leerla en pantalla.';
      }
    };
    speak.textContent = 'Detener voz'; speak.setAttribute('aria-pressed', 'true');
    status.textContent = 'Respondiendo con voz.';
    try { synth.resume(); synth.speak(u); } catch { stopSpeech(); }
  }
  window.addEventListener('ary:assistant-message', event => speakAssistantReply(event.detail?.text));

  const errors = {
    'not-allowed': 'El permiso del micrófono fue denegado. Permítelo en los ajustes de este sitio o escribe tu pregunta.',
    'service-not-allowed': 'El navegador no permite el servicio de dictado. Escribe tu pregunta.',
    'audio-capture': 'No se encontró un micrófono disponible. Revisa su conexión o escribe tu pregunta.',
    'no-speech': 'No se detectó voz. Puedes volver a pulsar Dictar pregunta.',
    'network': 'El servicio de dictado no tiene conexión. Escribe tu pregunta o vuelve a intentarlo.',
    'language-not-supported': 'El servicio no admite dictado en español. Escribe tu pregunta.'
  };
  dictate.addEventListener('click', () => {
    if (recognition) { stopListening(); status.textContent = 'Dictado detenido. Revisa el texto antes de enviarlo.'; return; }
    if (!Recognition) { status.textContent = 'Este navegador no admite dictado. Puedes escribir la pregunta; la lectura en voz es independiente.'; return; }
    if (!window.isSecureContext) { status.textContent = 'El dictado necesita abrir el sitio con HTTPS.'; return; }
    if (!consent.checked) { status.textContent = 'Marca Permitir dictado antes de activar el micrófono.'; consent.focus(); return; }
    if (input.disabled || input.readOnly) { status.textContent = 'Termina la consulta actual antes de dictar otra.'; return; }
    stopSpeech();
    let r;
    try { r = new Recognition(); } catch { status.textContent = 'El dictado no está disponible. Puedes escribir tu pregunta.'; return; }
    recognition = r;
    const current = ++sequence;
    r.lang = 'es-MX'; r.continuous = false; r.interimResults = false; r.maxAlternatives = 1;
    base = input.value.trim(); oldReadOnly = input.readOnly; input.readOnly = true;
    let failed = false;
    r.onresult = event => {
      if (recognition !== r || sequence !== current) return;
      const pieces = [];
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) pieces.push(event.results[i][0].transcript);
      }
      if (!pieces.length) return;
      input.value = [base, pieces.join(' ')].filter(Boolean).join(' ').slice(0, 500);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      status.textContent = 'Texto capturado. Revísalo y pulsa Enviar únicamente cuando esté correcto.';
    };
    r.onerror = event => {
      if (recognition !== r || sequence !== current) return;
      failed = true;
      status.textContent = errors[event.error] || 'El dictado se detuvo. Puedes seguir escribiendo tu pregunta.';
      stopListening();
    };
    r.onend = () => {
      if (recognition !== r || sequence !== current) return;
      recognition = null; input.readOnly = oldReadOnly;
      dictate.textContent = 'Dictar pregunta'; dictate.setAttribute('aria-pressed', 'false');
      if (!failed) status.textContent = 'Dictado terminado. Revisa la pregunta antes de pulsar Enviar.';
    };
    dictate.textContent = 'Detener dictado'; dictate.setAttribute('aria-pressed', 'true');
    status.textContent = 'Micrófono activo. Dicta únicamente tu pregunta de ayuda; no se enviará automáticamente.';
    try { r.start(); } catch { stopListening(); status.textContent = 'No se pudo iniciar el micrófono. Revisa los permisos o escribe tu pregunta.'; }
  });
  window.addEventListener('ary:voice-help-requested', () => {
    voiceSession = true;
    if (!chat.open) chat.open = true;
    consent.checked = true;
    if (!Recognition) {
      status.textContent = 'Este navegador no admite dictado. Puedes escribir tu pregunta y escuchar las respuestas.';
      input.focus();
      return;
    }
    if (!window.isSecureContext) {
      status.textContent = 'El dictado necesita abrir el sitio con HTTPS.';
      input.focus();
      return;
    }
    if (!recognition) dictate.click();
  });
  consent.addEventListener('change', () => { if (!consent.checked) { voiceSession = false; stopListening(); } });
  $('ary-chat-send')?.addEventListener('click', stopListening, { capture: true });
  chat.querySelector('.ary-chat-clear')?.addEventListener('click', () => { voiceSession = false; stopAll(); }, { capture: true });
  chat.addEventListener('toggle', () => { if (!chat.open) { voiceSession = false; stopListening(); } });
  const visibility = new MutationObserver(() => {
    if (root.hidden || panel.hidden) { voiceSession = false; stopAll(); }
    else if ($('ary-assistant-home')?.hidden) stopListening();
  });
  for (const el of [root, panel, $('ary-assistant-home')]) if (el) visibility.observe(el, { attributes: true, attributeFilter: ['hidden'] });
  const step = $('ary-assistant-step');
  if (step) new MutationObserver(stopSpeech).observe(step, { childList: true, characterData: true, subtree: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopAll(); });
  window.addEventListener('pagehide', stopAll);
  if (!Recognition) { dictate.disabled = true; permission.hidden = true; status.textContent = 'Dictado no disponible en este navegador. Puedes escribir tu pregunta y usar Escuchar ayuda cuando haya voz disponible.'; }
  if (!synth || !window.SpeechSynthesisUtterance) speak.disabled = true;
})();
