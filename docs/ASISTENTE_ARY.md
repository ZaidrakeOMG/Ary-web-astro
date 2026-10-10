# Asistente ARY — guía con la mascota

La mascota existente `public/media/ary-mascota.webp` acompaña dos recorridos:
`/facturacion/?guia=factura` (11 pasos) y `/facturacion/?guia=alta` (9 pasos).
Desde cualquier página, abrir **¿Te ayudo?** y elegir el trámite.

## Uso

- Anterior y Siguiente recorren las explicaciones sin exigir datos ni enviar formularios.
- Ir al campo señalado enfoca el control. En pantalla pequeña minimiza la ayuda; al volver a abrirla continúa en el mismo paso.
- Minimizar o Escape cierran la ayuda sin borrar lo capturado. Volver al menú permite cambiar de recorrido.
- La guía se aparta cuando se abre la revisión final o el menú móvil. Al mostrarse una referencia explica el seguimiento sin afirmar que el trámite haya terminado.
- La guía no sustituye la confirmación de registro ni la emisión real del CFDI. El modo de prueba sigue siendo de prueba.

## Mantenimiento

Interfaz y estilos: `src/components/AryAssistant.astro`.
Textos, selectores y comportamiento: `public/scripts/ary-assistant.js`.
Integración global: `src/layouts/SiteLayout.astro`.
Imagen: se reutiliza la original sin generar ni sustituir el personaje.

La implementación es una guía determinista, no un chat de IA generativa. No requiere claves, suscripciones, servicios externos ni dependencias adicionales.
No lee valores de los formularios, no almacena datos, no hace solicitudes de red, no marca casillas y nunca pulsa los botones de envío. Solo puede activar las pestañas de navegación al elegir una guía.
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
```

GitHub Actions ejecuta ambas suites sobre el HTML compilado, con respuestas de facturación simuladas y CSP activa. Las capturas y reportes quedan en el artefacto `ary-browser-and-build`.
Estas pruebas no sustituyen una verificación en el IIS real, en un celular físico ni del servicio real de facturación.

Publicar con el procedimiento de IIS del README del proyecto. No copiar el código fuente sobre la carpeta web ni reemplazar la API de facturación. Actualizar GitHub no publica automáticamente el servidor IIS.
