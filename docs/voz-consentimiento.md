# Consentimiento de micrófono y mascota ARY

Al entrar por primera vez en una pestaña aparece una pregunta propia del sitio:
«¿Activamos el micrófono para el bot ARY?», con «Sí, permitir» y «No por ahora».
Cargar la página o abrir el aviso no solicita acceso al micrófono ni inicia reconocimiento.

## Sí, permitir

El clic abre la guía y solicita exclusivamente audio mediante getUserMedia. El
navegador decide si muestra su permiso, lo concede por un permiso previo o lo
rechaza. El stream temporal se libera inmediatamente; no se graba ni se envía.
Solo entonces comienza el reconocimiento de instrucciones. El único control activo
es «Desactivar voz»; durante el permiso se puede cancelar la activación.

## No por ahora

El sitio recuerda esta elección en sessionStorage, únicamente para esa pestaña.
No insiste al cambiar de sección o recargar. Abrir el monito mantiene el micrófono
apagado y muestra «Activar voz», para solicitarlo más adelante de forma explícita.
Desactivar la voz también conserva esta preferencia. No se interpreta esta
preferencia como un permiso real del navegador.

## Privacidad y límites

Cerrar/minimizar la guía, cambiar de pestaña, salir de la página o abrir la revisión
fiscal detiene el dictado. Los permisos resueltos después de cancelar se descartan
y los tracks se liberan. Nunca se solicita cámara, se rellenan datos fiscales ni
se envía una factura desde la voz. La guía usa textos predefinidos; el servicio de
voz del navegador puede procesar audio. No se guardan grabaciones/transcripciones.

Un bloqueo del micrófono en el navegador, Windows, iframe o Permissions-Policy no
se omite. El usuario verá una explicación; la guía escrita sigue disponible.
No se modifica web.config ni la API de facturación para este cambio.

## Imagen

public/media/ary-mascota-pensando-v1.webp es una copia web de la imagen RGBA que
aportó el usuario, reducida a 256 × 256; se usa en el monito, el avatar y el aviso.

## Validación

chat_browser_test.py cubre los caminos Sí/No, activación posterior, errores,
permisos tardíos/cancelados, accesibilidad, cuatro tamaños y órdenes de voz.
Los streams, el reconocimiento, la síntesis y el API fiscal son simulados.
without_voice_prompt.py ejecuta las suites originales de formularios y de guía
con la preferencia «No por ahora», sin cambiar ni omitir sus comprobaciones.
La verificación de micrófono y audio reales se realiza en el navegador de IIS.
