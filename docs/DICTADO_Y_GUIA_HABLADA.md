# ARY: dictado por voz e indicaciones habladas

Reemplaza «Conversar con el asistente», el cuadro de texto y el consentimiento de IA por un micrófono de comandos y lectura de los pasos existentes. Conserva la mascota Pemex y la burbuja móvil/arrastrable. Los nombres históricos `ary-chat.js`, `ary-chat.css` y `chat_browser_test.py` se conservan para no romper referencias de IIS/CI, pero su contenido ya es de voz, no de chat.

## Uso

- Abrir la mascota y tocar «Dictar una instrucción»; permitir el micrófono cuando lo solicite el navegador.
- Decir «quiero facturar» o «quiero darme de alta». En facturación abre la guía correspondiente sin enviar datos.
- Para recorrerla: «siguiente», «anterior», «repetir», «silencio», «activar voz», «volver al menú» o «cerrar guía».
- El micrófono escucha una instrucción por pulsación, con límite de 15 segundos. No queda escuchando de forma continua.
- «Escuchar indicaciones» activa la lectura del paso actual y de los siguientes. «Silenciar indicaciones» la detiene. «Repetir indicación» vuelve a leer el paso.
- Al elegir una guía manualmente se activa su lectura, salvo que el visitante haya elegido silenciar. No hay audio ni micrófono al cargar la página por sí sola.
- Desde Inicio, el comando abre `/facturacion/?guia=factura&voz=1` o la variante de alta. En la página nueva se solicita tocar «Escuchar indicaciones» para no depender de reproducción automática bloqueada por el navegador.

## Límites intencionales

No es un chat de IA ni un dictado de datos fiscales. El visitante captura sus datos en el formulario. La guía no lee valores de campos, no marca confirmaciones y no pulsa botones de envío, aun si escucha «enviar» o «confirmar». La validación y la confirmación final existentes permanecen intactas.

No hay peticiones al antiguo endpoint de chat. No se configura una clave ni se arranca el servicio de IA para esta función. No se retiran automáticamente servicios o reglas que un administrador pudiera haber instalado anteriormente.

El reconocimiento requiere un navegador compatible y un contexto seguro (HTTPS o localhost en pruebas). Algunos navegadores procesan audio mediante su propio servicio remoto; no debe prometerse funcionamiento offline ni procesamiento exclusivamente local. El sitio no guarda audios ni transcripciones. Cuando el reconocimiento o la síntesis no están disponibles, se mantienen los botones y textos de la guía.

La escucha y la lectura se cancelan al minimizar, cambiar de página, ocultar la pestaña o abrir la revisión final. Las respuestas tardías de un reconocimiento cancelado se ignoran.

## Pruebas

`node --check public/scripts/ary-chat.js`, compilación Astro e integridad del script/formularios de facturación sin cambios. `python tests/chat_browser_test.py` usa reconocimiento, voz y API de facturación simulados, e impide cualquier llamada al antiguo endpoint de chat. Se conservan `browser_test.py` y `assistant_test.py` para regresión de formularios, móvil, accesibilidad, burbuja y envío exclusivamente manual.

Se debe comprobar por separado micrófono y reproducción reales en los navegadores de los clientes. La simulación no prueba disponibilidad de sus servicios de voz.

Referencias técnicas: https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API y https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition.
