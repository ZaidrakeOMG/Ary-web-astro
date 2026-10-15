/* Ayuda por voz ARY: permiso explícito una vez, narración y comandos automáticos. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const root = $('ary-assistant'), panel = $('ary-assistant-panel');
  const input = $('ary-chat-message'), chat = $('ary-chat');
  if (!root || !panel || !input || !chat || root.dataset.voiceReady) return;
  root.dataset.voiceReady = 'true';

  const isBillingPage = Boolean($('form-factura'));
  const PREF_KEY = 'ary-voice-enabled-v2';
  const PROMPT_SESSION_KEY = 'ary-voice-prompt-dismissed-v2';
  const make = (tag, text, className) => {
    const el = document.createElement(tag);
    if (text) el.textContent = text;
    if (className) el.className = className;
    return el;
  };
  const readLocal = key => { try { return localStorage.getItem(key); } catch { return null; } };
  const writeLocal = (key, value) => { try { localStorage.setItem(key, value); } catch { /* optional */ } };
  const removeLocal = key => { try { localStorage.removeItem(key); } catch { /* optional */ } };
  const readSession = key => { try { return sessionStorage.getItem(key); } catch { return null; } };
  const writeSession = (key, value) => { try { sessionStorage.setItem(key, value); } catch { /* optional */ } };

  const bar = make('div', '', 'ary-voice');
  const speak = make('button', 'Repetir voz', 'ary-voice-button');
  speak.id = 'ary-voice-speak'; speak.type = 'button'; speak.setAttribute('aria-pressed', 'false');
  const disable = make('button', 'Desactivar voz', 'ary-voice-button ary-voice-disable');
  disable.id = 'ary-voice-disable'; disable.type = 'button';
  const status = make('p', 'La ayuda por voz está lista cuando tú la activas.', 'ary-voice-status');
  status.id = 'ary-voice-status'; status.setAttribute('role', 'status');
  bar.append(speak, disable, status);
  panel.querySelector('.ary-assistant-body').prepend(bar);

  const permission = make('label', '', 'ary-voice-consent');
  const consent = make('input'); consent.type = 'checkbox'; consent.id = 'ary-voice-consent';
  permission.append(consent, make('span', 'Activar ayuda por voz. El navegador puede procesar el audio con su proveedor; ARY no guarda una grabación del micrófono.'));
  const dictate = make('button', 'Dictar pregunta', 'ary-voice-button');
  dictate.id = 'ary-voice-dictate'; dictate.type = 'button'; dictate.setAttribute('aria-pressed', 'false');
  dictate.setAttribute('aria-describedby', 'ary-voice-status');
  const actions = chat.querySelector('.ary-chat-actions');
  actions.before(permission); actions.append(dictate);

  let prompt = null, promptFrame = 0;
  if (isBillingPage) {
    prompt = make('aside', '', 'ary-greeting ary-voice-prompt');
    prompt.id = 'ary-voice-prompt'; prompt.hidden = true;
    const enable = make('button', '', 'ary-greeting-open');
    enable.id = 'ary-voice-enable'; enable.type = 'button';
    enable.append(
      make('strong', '¿Quieres ayuda por voz para facturar?'),
      make('span', 'Actívala una vez. Te guiaré paso a paso y escucharé comandos como “siguiente”.')
    );
    const close = make('button', '×', 'ary-greeting-close');
    close.id = 'ary-voice-prompt-close'; close.type = 'button'; close.setAttribute('aria-label', 'Cerrar invitación de ayuda por voz');
    prompt.append(enable, close);
    root.append(prompt);
    close.addEventListener('click', () => {
      prompt.hidden = true;
      writeSession(PROMPT_SESSION_KEY, '1');
    });
  }

  const synth = window.speechSynthesis;
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let utterance = null, recognition = null, recognitionMode = '';
  let oldReadOnly = false, sequence = 0, voiceList = [];
  let voiceEnabled = readLocal(PREF_KEY) === '1';
  let voiceSession = voiceEnabled;
  let currentGuide = null, lastGuideKey = '', silenceRetries = 0;

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
    try { synth?.cancel(); } catch { /* unavailable */ }
    speak.textContent = 'Repetir voz'; speak.setAttribute('aria-pressed', 'false');
  }
  function stopListening() {
    sequence++;
    const old = recognition; recognition = null; recognitionMode = '';
    if (old) {
      old.onresult = null; old.onend = null; old.onerror = null;
      try { old.abort(); } catch { /* already stopped */ }
      input.readOnly = oldReadOnly;
    }
    dictate.textContent = 'Dictar pregunta'; dictate.setAttribute('aria-pressed', 'false');
  }
  function stopAll(message = '') {
    const active = Boolean(utterance || recognition);
    stopSpeech(); stopListening();
    if (message || active) status.textContent = message || 'Voz detenida.';
  }

  function speakText(text, options = {}) {
    const clean = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 2600);
    if (!clean || !synth || !window.SpeechSynthesisUtterance) {
      options.after?.();
      return false;
    }
    stopListening(); stopSpeech(); loadVoices();
    const u = new SpeechSynthesisUtterance(clean); utterance = u;
    u.lang = 'es-MX'; u.rate = 0.94; u.pitch = 1.02; u.volume = 1;
    const voice = bestSpanishVoice();
    if (voice) u.voice = voice;
    u.onend = () => {
      if (utterance !== u) return;
      utterance = null;
      speak.textContent = 'Repetir voz'; speak.setAttribute('aria-pressed', 'false');
      options.after?.();
    };
    u.onerror = () => {
      if (utterance !== u) return;
      utterance = null;
      speak.textContent = 'Repetir voz'; speak.setAttribute('aria-pressed', 'false');
      status.textContent = 'El navegador bloqueó la reproducción automática. Toca “Repetir voz” para continuar.';
    };
    speak.textContent = 'Detener voz'; speak.setAttribute('aria-pressed', 'true');
    status.textContent = options.status || 'Te estoy guiando por voz.';
    try { synth.resume(); synth.speak(u); return true; }
    catch {
      stopSpeech();
      status.textContent = 'No se pudo iniciar la voz. Toca “Repetir voz” para continuar.';
      return false;
    }
  }

  function guideKey(detail) {
    return detail ? `${detail.kind}:${detail.index}:${detail.title}` : '';
  }
  function narrateGuide(detail, force = false) {
    if (!detail || !voiceEnabled || !voiceSession) return;
    currentGuide = detail;
    const key = guideKey(detail);
    if (!force && key === lastGuideKey) return;
    lastGuideKey = key;
    silenceRetries = 0;
    const commandHint = detail.index === 0
      ? 'Cuando termine de hablar, puedes decir: siguiente, anterior, repetir, ir al campo o cerrar ayuda.'
      : 'Cuando estés listo, di siguiente para continuar.';
    const text = [detail.title, detail.text, detail.notice, commandHint].filter(Boolean).join('. ');
    speakText(text, {
      status: `Paso ${detail.index + 1} de ${detail.total}. Te estoy guiando por voz.`,
      after: () => startRecognition('guide')
    });
  }

  function normalized(text) {
    return String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }
  function handleGuideCommand(text) {
    const q = normalized(text);
    if (/\b(siguiente|continuar|continua|avanzar|adelante)\b/.test(q)) {
      $('ary-assistant-next')?.click(); return true;
    }
    if (/\b(anterior|atras|regresar|volver)\b/.test(q)) {
      $('ary-assistant-prev')?.click(); return true;
    }
    if (/\b(repetir|repite|otra vez)\b/.test(q)) {
      narrateGuide(currentGuide, true); return true;
    }
    if (/\b(ir al campo|mostrar campo|campo señalado|campo senalado|editar campo)\b/.test(q)) {
      $('ary-assistant-field')?.click(); status.textContent = 'Te llevé al campo señalado. La voz queda en pausa mientras lo completas.'; return true;
    }
    if (/\b(cerrar|terminar|salir|cerrar ayuda)\b/.test(q)) {
      $('ary-assistant-close')?.click(); return true;
    }
    speakText('No entendí ese comando. Puedes decir siguiente, anterior, repetir, ir al campo o cerrar ayuda.', {
      status: 'No entendí el comando. Te escucho otra vez.',
      after: () => startRecognition('guide')
    });
    return false;
  }

  const errors = {
    'not-allowed': 'El permiso del micrófono fue denegado o el navegador exige una interacción. Usa “Activar ayuda por voz” y permite el micrófono.',
    'service-not-allowed': 'El navegador no permite el servicio de dictado.',
    'audio-capture': 'No se encontró un micrófono disponible.',
    'no-speech': 'No detecté voz.',
    'network': 'El servicio de dictado no tiene conexión.',
    'language-not-supported': 'El navegador no admite dictado en español.'
  };

  function startRecognition(mode = 'chat') {
    if (!voiceEnabled || !voiceSession || recognition || utterance) return;
    if (!Recognition) {
      status.textContent = 'Este navegador no admite dictado por voz. La narración sigue disponible.';
      return;
    }
    if (!window.isSecureContext) {
      status.textContent = 'El micrófono requiere HTTPS.';
      return;
    }
    if (mode === 'chat' && (input.disabled || input.readOnly)) return;
    let r;
    try { r = new Recognition(); } catch {
      status.textContent = 'No se pudo iniciar el reconocimiento de voz.';
      return;
    }
    recognition = r; recognitionMode = mode;
    const current = ++sequence;
    r.lang = 'es-MX'; r.continuous = false; r.interimResults = false; r.maxAlternatives = 1;
    let base = '';
    if (mode === 'chat') {
      base = input.value.trim(); oldReadOnly = input.readOnly; input.readOnly = true;
      dictate.textContent = 'Detener dictado'; dictate.setAttribute('aria-pressed', 'true');
      status.textContent = 'Micrófono activo. Dicta tu pregunta; no se enviará automáticamente.';
    } else {
      status.textContent = 'Micrófono activo. Di “siguiente”, “anterior”, “repetir”, “ir al campo” o “cerrar ayuda”.';
    }
    let gotResult = false, failed = false;
    r.onresult = event => {
      if (recognition !== r || sequence !== current) return;
      const pieces = [];
      for (let i = 0; i < event.results.length; i++) if (event.results[i].isFinal) pieces.push(event.results[i][0].transcript);
      const transcript = pieces.join(' ').trim();
      if (!transcript) return;
      gotResult = true;
      if (mode === 'guide') {
        stopListening();
        handleGuideCommand(transcript);
        return;
      }
      input.value = [base, transcript].filter(Boolean).join(' ').slice(0, 500);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      status.textContent = 'Texto capturado. Revísalo y pulsa Enviar cuando esté correcto.';
    };
    r.onerror = event => {
      if (recognition !== r || sequence !== current) return;
      failed = true;
      const code = event.error;
      stopListening();
      status.textContent = errors[code] || 'El dictado se detuvo.';
      if (mode === 'guide' && code === 'no-speech' && voiceEnabled && voiceSession && silenceRetries < 1) {
        silenceRetries++;
        setTimeout(() => startRecognition('guide'), 600);
      }
    };
    r.onend = () => {
      if (recognition !== r || sequence !== current) return;
      recognition = null; recognitionMode = '';
      if (mode === 'chat') {
        input.readOnly = oldReadOnly;
        dictate.textContent = 'Dictar pregunta'; dictate.setAttribute('aria-pressed', 'false');
        if (!failed && !gotResult) status.textContent = 'No detecté voz. Puedes volver a hablar o escribir tu pregunta.';
      } else if (!failed && !gotResult && voiceEnabled && voiceSession && silenceRetries < 1) {
        silenceRetries++;
        setTimeout(() => startRecognition('guide'), 600);
      }
    };
    try { r.start(); } catch {
      stopListening();
      status.textContent = 'El navegador no permitió iniciar el micrófono automáticamente. Toca “Dictar pregunta” para reanudar.';
    }
  }

  async function permissionState() {
    try {
      if (!navigator.permissions?.query) return 'unknown';
      const result = await navigator.permissions.query({ name: 'microphone' });
      return result.state || 'unknown';
    } catch { return 'unknown'; }
  }
  async function requestMicrophonePermission() {
    if (!window.isSecureContext) throw new Error('El micrófono requiere HTTPS.');
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Este navegador no puede solicitar acceso al micrófono.');
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    try { stream.getTracks().forEach(track => track.stop()); } catch { /* release best effort */ }
  }

  function positionPrompt() {
    promptFrame = 0;
    if (!prompt || prompt.hidden) return;
    const launcher = $('ary-assistant-launcher');
    const r = launcher?.getBoundingClientRect();
    if (!r) return;
    const w = prompt.offsetWidth, h = prompt.offsetHeight;
    const vw = document.documentElement.clientWidth, vh = window.innerHeight;
    const x = Math.max(12, Math.min(r.right - w, vw - w - 12));
    const y = r.top - h - 12 >= 12 ? r.top - h - 12 : r.bottom + 12;
    prompt.style.left = Math.round(x) + 'px';
    prompt.style.top = Math.max(12, Math.min(y, vh - h - 12)) + 'px';
  }
  function schedulePromptPosition() {
    if (!promptFrame) promptFrame = requestAnimationFrame(positionPrompt);
  }
  function showPrompt(message = '') {
    if (!prompt || readSession(PROMPT_SESSION_KEY) === '1') return;
    if (message) {
      const span = prompt.querySelector('.ary-greeting-open span');
      if (span) span.textContent = message;
    }
    prompt.hidden = false;
    schedulePromptPosition();
  }
  function hidePrompt() { if (prompt) prompt.hidden = true; }

  async function enableVoice(startGuide = true) {
    try {
      status.textContent = 'Solicitando permiso del micrófono…';
      if (Recognition) await requestMicrophonePermission();
      voiceEnabled = true; voiceSession = true; consent.checked = true;
      writeLocal(PREF_KEY, '1'); hidePrompt();
      status.textContent = 'Ayuda por voz activada. No necesitas volver a autorizarla mientras el navegador conserve el permiso.';
      if (startGuide && isBillingPage) {
        window.dispatchEvent(new CustomEvent('ary:guide-start', { detail: { kind: 'factura' } }));
      } else if (chat.open) {
        startRecognition('chat');
      }
      return true;
    } catch (error) {
      voiceEnabled = false; voiceSession = false; consent.checked = false; removeLocal(PREF_KEY);
      const denied = error?.name === 'NotAllowedError' || error?.name === 'SecurityError';
      status.textContent = denied ? 'El micrófono está bloqueado. Permítelo en los ajustes del sitio para usar dictado.' : (error?.message || 'No se pudo habilitar el micrófono.');
      showPrompt(denied ? 'El micrófono está bloqueado. Revisa el permiso del sitio y vuelve a tocar aquí.' : 'Toca aquí para volver a intentar activar la ayuda por voz.');
      return false;
    }
  }
  function disableVoice(showStatus = true) {
    voiceEnabled = false; voiceSession = false; consent.checked = false;
    removeLocal(PREF_KEY); lastGuideKey = ''; currentGuide = null; stopAll();
    if (showStatus) status.textContent = 'Ayuda por voz desactivada. Puedes volver a activarla cuando quieras.';
  }

  function helpText() {
    if (currentGuide && !$('ary-assistant-tour')?.hidden) {
      return [currentGuide.title, currentGuide.text, currentGuide.notice].filter(Boolean).join('. ');
    }
    if (chat.open) {
      const replies = chat.querySelectorAll('.ary-chat-message.is-assistant p');
      if (replies.length) return replies[replies.length - 1].textContent;
    }
    return 'Soy tu asistente ARY. Puedo guiarte para facturar, registrar un cliente o responder dudas.';
  }

  speak.addEventListener('click', async () => {
    if (utterance) { stopSpeech(); status.textContent = 'Lectura detenida.'; return; }
    if (!voiceEnabled) {
      const enabled = await enableVoice(false);
      if (!enabled) return;
    }
    const after = currentGuide && !$('ary-assistant-tour')?.hidden ? () => startRecognition('guide') : () => { if (chat.open) startRecognition('chat'); };
    speakText(helpText(), { status: 'Repitiendo la ayuda.', after });
  });

  dictate.addEventListener('click', async () => {
    if (recognition) { stopListening(); status.textContent = 'Dictado detenido.'; return; }
    if (!voiceEnabled) {
      const enabled = await enableVoice(false);
      if (!enabled) return;
    }
    voiceSession = true;
    startRecognition('chat');
  });

  disable.addEventListener('click', () => disableVoice(true));
  consent.addEventListener('change', async () => {
    if (consent.checked) await enableVoice(false);
    else disableVoice(true);
  });

  window.addEventListener('ary:guide-step', event => {
    currentGuide = event.detail;
    if (voiceEnabled && voiceSession) narrateGuide(currentGuide);
  });
  window.addEventListener('ary:assistant-message', event => {
    if (!voiceEnabled || !voiceSession) return;
    const text = String(event.detail?.text || '').trim();
    if (!text) return;
    speakText(text, {
      status: 'Respondiendo con voz.',
      after: () => { if (chat.open) startRecognition('chat'); }
    });
  });
  window.addEventListener('ary:voice-help-requested', async () => {
    const enabled = voiceEnabled ? true : await enableVoice(false);
    if (!enabled) return;
    voiceSession = true;
    if (!chat.open) chat.open = true;
    startRecognition('chat');
  });

  $('ary-chat-send')?.addEventListener('click', stopListening, { capture: true });
  chat.querySelector('.ary-chat-clear')?.addEventListener('click', () => stopAll('Chat borrado. La ayuda por voz sigue activada.'), { capture: true });
  chat.addEventListener('toggle', () => {
    if (!chat.open && recognitionMode === 'chat') stopListening();
    else if (chat.open && voiceEnabled && voiceSession && !utterance && !recognition) setTimeout(() => startRecognition('chat'), 250);
  });

  const visibility = new MutationObserver(() => {
    if (root.hidden || panel.hidden) stopAll();
    else if ($('ary-assistant-home')?.hidden && recognitionMode === 'chat') stopListening();
  });
  for (const el of [root, panel, $('ary-assistant-home')]) if (el) visibility.observe(el, { attributes: true, attributeFilter: ['hidden'] });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopAll(); });
  window.addEventListener('pagehide', stopAll);
  window.addEventListener('resize', schedulePromptPosition, { passive: true });
  window.visualViewport?.addEventListener('resize', schedulePromptPosition, { passive: true });

  if (!Recognition) {
    dictate.disabled = true;
    status.textContent = 'Tu navegador puede leer la guía, pero no admite dictado por voz.';
  }
  if (!synth || !window.SpeechSynthesisUtterance) speak.disabled = true;
  disable.hidden = !voiceEnabled;

  const stateObserver = new MutationObserver(() => { disable.hidden = !voiceEnabled; });
  stateObserver.observe(consent, { attributes: true, attributeFilter: ['checked'] });

  async function initBillingVoice() {
    if (!isBillingPage) return;
    if (!voiceEnabled) {
      setTimeout(() => showPrompt(), 850);
      return;
    }
    consent.checked = true; voiceSession = true; disable.hidden = false;
    const state = await permissionState();
    if (state === 'denied' || state === 'prompt') {
      voiceEnabled = false; voiceSession = false; consent.checked = false; removeLocal(PREF_KEY);
      setTimeout(() => showPrompt(state === 'denied'
        ? 'El navegador tiene el micrófono bloqueado. Permítelo en los ajustes del sitio y vuelve a tocar aquí.'
        : 'El navegador necesita confirmar el micrófono otra vez. Toca aquí para continuar.'), 500);
      return;
    }
    setTimeout(() => window.dispatchEvent(new CustomEvent('ary:guide-start', { detail: { kind: 'factura' } })), 650);
  }

  prompt?.querySelector('#ary-voice-enable')?.addEventListener('click', () => enableVoice(true));
  initBillingVoice();
})();
