# Facturación con fotografía de ticket (rama de prueba)

## Cambios
- Se elimina la captura manual del folio en la página Astro.
- El navegador toma/sube una foto y la comprime a JPEG.
- \`POST /api/facturacion/validar-ticket\` consulta al bot con la sesión y CSRF existentes.
- El bot extrae el FOLIO como texto, **sin eliminar ceros iniciales**, y rechaza fotos dudosas o tickets con la leyenda REIMPRESIÓN.
- \`POST /api/facturacion/solicitudes\` vuelve a comprobar la misma foto en servidor y rechaza folios manipulados u omitidos. No se envía la imagen a Polaris ni se guarda en la cola.

## Requisitos de despliegue
1. **No desplegar solo Astro:** primero actualizar el bot Python y la ruta IIS, y después publicar la nueva página, durante una ventana de mantenimiento. La versión antigua de Astro deja de ser compatible con la validación obligatoria al activar la versión nueva del bot.
2. En Windows, confirmar que Tesseract-OCR esté instalado con los idiomas \`spa\` y \`eng\`. El bot utiliza \`arybot/ocr_ticket.py\` para ubicar su ejecutable; puede configurarse \`TESSERACT_EXE\`.
3. Instalar los paquetes Python del proyecto (\`Pillow\` y \`pytesseract\` ya figuran en \`requirements.in\`) y reiniciar el proceso del portal en el puerto 8765.
4. En Astro: ejecutar \`npm ci\`, \`npm run check\`, \`npm run build\`, \`npm run test:integrity\` y publicar **todo el contenido compilado de \`dist/\`**, incluido el nuevo \`web.config\`.
5. El \`web.config\` aumenta \`maxAllowedContentLength\` de 5 a 10 MB y habilita la ruta \`validar-ticket\`. La API Python limita el cuerpo JSON a 8 MB y la foto JPEG descodificada a 3 MB.
6. Probar con \`permitir_facturacion_real=false\` antes de activar timbrado. El ticket de ejemplo del 04/11/2026 sirve para **OCR**, no para solicitar una factura fuera de plazo.

## Pruebas de aceptación antes de producción
- Foto original legible: muestra el folio exacto, por ejemplo \`0008430573\`.
- Ticket marcado REIMPRESIÓN / REIMPRESION / RE-IMPRESION: denegado.
- Foto borrosa o folios que no concuerdan: solicitar nueva fotografía.
- Intentar editar el folio por herramientas del navegador, omitir la foto o enviar directamente a \`/solicitudes\`: denegado por el bot.
- Alta de clientes sin ticket: continúa operando.
- Confirmar que la facturación por Polaris, los correos y la idempotencia funcionan igual que antes.

## Limitaciones
El OCR **no demuestra** que un papel sea original: puede no ver una marca pequeña o tapada de REIMPRESIÓN. Por eso bloquea capturas ambiguas, pero la revisión de duplicados y la comprobación por Polaris siguen siendo necesarias. No sustituye la verificación de folios procesados.

Las fotografías se procesan en memoria durante la petición y no se persisten como archivos ni en almacenamiento local.


## Nuevo modo: foto solo del código de barras

- La página envía `modo_ticket: "codigo_barras"` a la misma ruta `/validar-ticket` y lo vuelve a incluir en `/solicitudes`.
- El bot utiliza `analizar_codigo_barras_foto`: acepta recortes horizontales y decodifica CODE39/CODE128 sin OCR, preservando ceros iniciales. Rechaza ausencia o múltiples códigos contradictorios.
- En el envío final, vuelve a decodificar exactamente la misma foto y compara el folio para evitar cambios manuales.
- La API anterior de fotografía completa (`modo_ticket` ausente o `ticket_completo`) se conserva para clientes que aún no actualizan el sitio.
- **Limitación:** el código de barras no acredita que el ticket sea original, su fecha ni el producto/importe. La declaración del usuario, la validación de fecha, los controles de duplicidad y las verificaciones en Polaris siguen siendo indispensables. No interpretar la prelectura como comprobación del ticket real.
- Reutiliza los endpoints existentes: no requiere nuevas reglas URL Rewrite en IIS. Desplegar la compilación Astro al directorio real que atiende IIS.
