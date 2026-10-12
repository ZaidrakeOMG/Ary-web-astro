# Asistente ARY — guía con la mascota

> Actualización 12/10/2026: se añadió una extensión de chat y la mascota con listón Pemex. Consulta [Asistente IA ARY](ASISTENTE_IA_ARY.md) para el saludo, privacidad y activación opcional de IA. Las indicaciones siguientes describen únicamente los recorridos locales, que siguen sin usar IA ni enviar mensajes de chat.

La mascota acompaña dos recorridos:
`/facturacion/?guia=factura` (11 pasos) y `/facturacion/?guia=alta` (9 pasos).
Desde cualquier página, abrir el asistente y elegir el trámite.

## Uso

- Anterior y Siguiente recorren las explicaciones sin exigir datos ni enviar formularios.
- Ir al campo señalado enfoca el control. En pantalla pequeña minimiza la ayuda; al volver a abrirla continúa en el mismo paso.
- Minimizar o Escape cierran la ayuda sin borrar lo capturado. Volver al menú permite cambiar de recorrido.
- La guía se aparta cuando se abre la revisión final. Al mostrarse una referencia explica el seguimiento sin afirmar que el trámite haya terminado.
- La guía no sustituye la confirmación de registro ni la emisión real del CFDI. El modo de prueba sigue siendo de prueba.

## Mantenimiento

Interfaz y estilos de recorridos: `src/components/AryAssistant.astro`.
Textos, selectores y comportamiento de recorridos: `public/scripts/ary-assistant.js`.
Integración global: `src/layouts/SiteLayout.astro`.
La extensión `public/scripts/ary-chat.js` presenta la nueva imagen `public/media/ary-mascota-pemex.webp`, el saludo y el chat.

Los recorridos son guías deterministas, no IA generativa. No requieren claves ni servicios externos. No leen valores de los formularios, no hacen solicitudes de red, no marcan casillas y nunca pulsan los botones de envío. Solo pueden activar las pestañas de navegación al elegir una guía. Conservan preferencias de posición y vista, no datos fiscales.
El script operativo en `legacy/billing-original.htm`, sus validaciones, CSP, endpoints y contrato de envío permanecen sin cambios.
La guía conserva los `aria-describedby` originales y admite teclado, minimizar y estilos de impresión.

## Validación y publicación

```sh
npm ci
npm run check
npm run build
npm run test:integrity
python -m http.server 4173 --directory dist
# En otra terminal, con los requisitos de tests/requirements.txt y Chromium instalados:
python tests/browser_test.py
python tests/assistant_test.py
python tests/chat_browser_test.py
```

GitHub Actions ejecuta las suites sobre el HTML compilado, con respuestas de facturación e IA simuladas y CSP activa. Las capturas y reportes quedan en el artefacto `ary-browser-and-build`.
Estas pruebas no sustituyen una verificación en el IIS real, en un celular físico ni del servicio real de facturación.

Publicar con el procedimiento de IIS del README del proyecto. No copiar el código fuente sobre la carpeta web ni reemplazar la API de facturación. Actualizar GitHub no publica automáticamente el servidor IIS.
