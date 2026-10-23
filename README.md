# Grupo ARY — Astro Pro / Android · versión 2.0

Sitio corporativo y portal de facturación con una sola identidad visual. La portada, estaciones, servicios, contacto y facturación están construidos con componentes Astro. No se incrusta ni se publica el diseño anterior.

## Actualización del 23 de octubre de 2026

- **Facturación:** el bot busca exclusivamente por RFC leído de la constancia fiscal. El nombre/razón social y el domicilio no filtran la selección. Si hay cero o más de un cliente con ese RFC, o Polaris VCL no permite comprobar **todas** las filas, **NO** se pulsa Aceptar ni se timbra; se solicita revisión humana. Las altas siguen exigiendo nombre, calle e idCIF.
- **Plazo ARY:** el formulario de facturación muestra un aviso destacado de **72 horas desde la compra** y un error cuando la fecha seleccionada está fuera del rango admitido. El API comprueba que la fecha del ticket sea hoy o alguno de los tres días anteriores. Como no se captura la hora de la compra, **esa comprobación no puede garantizar exactamente las 72 horas**; casos próximos al límite deben verificarse con el ticket y personal de ARY.
- Los cambios del frontend requieren volver a publicar Astro en IIS. Los cambios del lector/selector y la validación del plazo requieren actualizar **y reiniciar el bot** en su VM. No desactives los controles contra RFC duplicados para forzar el timbrado.

## Actualización del 14 de octubre de 2026

La factura identifica al cliente únicamente por **RFC y razón social**, sin usar la calle para seleccionar el registro. Requiere el bot actualizado: `ZaidrakeOMG/Facturacion-bot-`, PR #8, commit `5f416fde966138d7203d110feb12b57c71ab91e6`. El alta de clientes conserva sus propias validaciones de domicilio e idCIF. Dos registros con el mismo RFC y razón social requieren revisión, no se elige el primero.

En errores de facturación aparece **Continuar por WhatsApp**, dirigido al contacto existente de ARY, 871 165 1404. El mensaje contiene referencia, estado, RFC, razón social, estación, ticket, fecha, forma de pago, uso de CFDI, correo y motivo público. Hay una vista previa de los datos que se compartirán. WhatsApp abre el texto preparado; el usuario lo revisa y pulsa Enviar en esa aplicación. No se adjuntan automáticamente documentos, PDF, idCIF, domicilio, tokens ni errores internos.

Los campos capturados se conservan en memoria para el error actual; al recuperar el seguimiento, el bot devuelve su copia autorizada. Si la constancia no llegó a procesarse, RFC y razón social se indican como no disponibles: no se inventan ni se extraen enviando el PDF a terceros. Un resultado incierto conserva su identificador de solicitud; el botón de ayuda no vuelve a timbrar.

El asistente incluye **Escuchar ayuda** y **Dictar pregunta**. La lectura usa la voz disponible del navegador, preferentemente español de México. El dictado requiere HTTPS, consentimiento y permiso del micrófono, y puede usar el servicio de voz del proveedor del navegador. Solo rellena la pregunta: no la envía ni modifica datos fiscales. No se deben dictar datos fiscales, contraseñas ni información de pago. Cerrar u ocultar el asistente detiene su voz y micrófono. Cuando el navegador no admite dictado, sigue disponible la escritura.

## Qué cambia

- Diseño claro, magenta y vino; tipografía legible, navegación compartida y fotografías nuevas de cada estación.
- Adaptación desde 320 px; menú móvil, barra de accesos, controles de al menos 48 px y campos de 16 px. La barra inferior se oculta al detectar el teclado reduciendo la ventana visible.
- Facturación completamente rediseñada: pestañas, grupos de datos, ayuda de alta, confirmación, comprobante de recepción, errores y seguimiento.
- Estaciones filtrables por ciudad y búsqueda; las fotografías corresponden a su estación.
- Las 24 direcciones heredadas redirigen al portal nuevo. No hay enlaces de navegación interna a archivos antiguos.
- Solo se distribuyen los nuevos recursos de `public/media`. Las imágenes viejas se eliminan del código actual y del contenido publicado. Git conserva el historial; el servidor conserva versiones anteriores para recuperación.
- Sin fuentes externas, paquetes visuales pesados, rastreadores ni service worker que almacene trámites fiscales.

## Facturación: fuente operativa y contrato

El archivo `legacy/billing-original.htm` conserva el contrato original de formularios y el historial de migración: **no se publica**. Desde esta actualización, la fuente operativa editable es `src/lib/billing-runtime.js`. `src/lib/billing.mjs` la carga como texto y calcula el hash CSP correspondiente. No edites la referencia legacy para cambiar el comportamiento actual.

La verificación compara el script compilado byte por byte con esa fuente canónica, no solo sus nombres. También verifica todos los hashes CSP, los contratos de ambos formularios, los catálogos contra la referencia legacy y la conservación del proxy IIS. Se mantienen rango de fechas, CSRF, modo seguro, identificadores, reintentos con la misma solicitud y recuperación del seguimiento.

El servicio sigue utilizando:

- `GET /api/facturacion/opciones`
- `POST /api/facturacion/solicitudes`, para `FACTURA` y `ALTA`
- `POST /api/facturacion/estado`
- `POST /api/facturacion/recepcion`

El bot y Polaris no están incluidos en este repositorio. El cambio coordinado del bot se encuentra en su propio repositorio, indicado arriba. El alta fiscal sigue siendo procesada por el bot. Una recepción no significa timbrado concluido. No se guardan datos fiscales en una base de datos nueva del navegador.

## Publicar en el IIS existente

Antes de actualizar, conserva un respaldo del sitio y verifica que no tengas cambios locales pendientes. No uses `git reset --hard` ni `git clean` para resolver diferencias de producción. Actualiza y reinicia también el bot desde su carpeta, sin borrar `config.json`, `credentials.json`, `token.json` ni `data`.

### Opción A: desde GitHub

En CMD, dentro de la copia del proyecto:

    cd /d C:\inetpub\wwwroot\grupoary
    git status
    git pull --ff-only origin main

Solo continúa si el `pull` terminó correctamente. Ejecuta **INICIAR_ARY_IIS.bat como administrador**. Se requiere Node.js 22 actualizado o 24, npm, IIS y sus módulos ya configurados.

La primera ejecución instala las dependencias fijadas en `package-lock.json`. Si no cambia ese archivo, las siguientes reutilizan la instalación. **El sitio activo no se recompila encima de sí mismo**: se prepara en una carpeta separada.

### Opción B: ZIP compilado, sin npm install

El paquete de entrega incluye `paquete-publicacion/` con los archivos compilados, un manifiesto SHA256 y los scripts de publicación. Extrae el ZIP completo en la carpeta del proyecto (no en `dist`). El paquete no sobrescribe la carpeta `dist` que podría estar activa.

Ejecuta **PUBLICAR_COMPILADO.bat como administrador**. Esta opción no instala dependencias ni requiere Node para publicar.

### Qué hace el publicador

1. Identifica exactamente un sitio IIS asociado con esta carpeta. Si hay ambigüedad, se detiene sin modificar sitios.
2. Compila y verifica en `.ary-staging`, o valida el manifiesto del paquete compilado.
3. Crea una carpeta versionada `.ary-releases/fecha-hora`.
4. **Parte del `web.config` activo en tu servidor**, no sustituye la configuración por una genérica. Conserva bindings, certificado y configuración local. La regla `ARY Portal Facturacion API` debe conservar exactamente su XML.
5. Actualiza únicamente el documento predeterminado, nuestras rutas heredadas, soporte WebP y un encabezado de versión. Valida que no haya `index.html` duplicados.
6. Respalda la configuración IIS; cambia la ruta física de ese sitio; comprueba por HTTPS que responde 200 con la nueva versión. Ante una falla, intenta regresar a la ruta anterior.
7. Consulta solamente las opciones del API. **No envía ninguna factura ni alta de prueba.** Una advertencia de conectividad requiere revisar el bot antes de habilitar atención real.

No hace `iisreset`, no cambia puertos ni detiene Polaris. Puedes cerrar el BAT al terminar: IIS sirve archivos estáticos sin mantener una consola de Node abierta.

Si el nombre/ruta del sitio no se detecta, indica explícitamente el sitio correcto en PowerShell de administrador:

    cd C:\inetpub\wwwroot\grupoary
    .\scripts\publicar-astro-iis.ps1 -SiteName 'NOMBRE EXACTO EN IIS' -UseCompiled

No uses un nombre de ejemplo: copia el de tu Administrador de IIS.

## Recuperación

Ejecuta **RECUPERAR_VERSION_ANTERIOR.bat** como administrador. Muestra el sitio y la ruta anterior, exige escribir `RESTAURAR` y no elimina archivos. Solo actúa si la ruta activa sigue siendo la de la última publicación registrada.

Mantén el sitio apuntando a `.ary-releases/...` después de publicar. No lo regreses a la raíz del repositorio: allí están los archivos de trabajo y `.git`.

## Pruebas y límites de la validación

    npm ci
    npm run check
    npm run build
    npm run test:integrity

Las pruebas de navegador utilizan Python y Playwright:

    pip install -r tests/requirements.txt
    playwright install chromium
    python -m http.server 4173 --directory dist

En otra terminal:

    python tests/whatsapp_voice_test.py
    python tests/chat_browser_test.py
    python tests/browser_test.py
    python tests/assistant_test.py

Se comprueban 13 rutas a ocho tamaños, navegación, imágenes, campos, confirmación de factura, altas, errores, pausas, reintentos con mismo identificador y recuperación de seguimiento. El API está interceptado con respuestas simuladas; no se llama al backend real. Las nuevas pruebas comprueban datos de WhatsApp, recuperación, privacidad, duplicados, permisos de voz, cierre del micrófono y alternativa escrita. No usan un micrófono real ni envían mensajes de WhatsApp.

El recorrido HTTP de CI conserva la CSP original. `test-results/browser-report.json` y `test-results/whatsapp-voice.json` identifican las comprobaciones realizadas.

**La emulación de Android y de las APIs de voz no sustituye probar un teléfono y micrófono físicos. Compilar y probar respuestas simuladas tampoco valida una emisión real en Polaris ni tu configuración particular de IIS.** Antes de atender clientes, revisa desde tu Android los dos formularios y realiza las pruebas controladas correspondientes al modo seguro del bot. Un commit en GitHub no publica ni reinicia automáticamente tu servidor.

## Estructura

- `src/pages/`: 13 páginas de Astro.
- `src/components/`, `src/styles/`, `src/scripts/`: interfaz compartida.
- `src/lib/billing-runtime.js`: programa operativo de facturación y asistencia WhatsApp.
- `public/scripts/ary-voice.js`: voz opcional del asistente.
- `src/data/site.ts`: ubicaciones, correos y contactos del sitio.
- `public/media/`: fotografías y marca nuevas.
- `legacy/`: referencia operativa privada, excluida del sitio compilado.
- `scripts/postbuild.mjs`: compatibilidad de URL e información de versión.
- `scripts/verificar-build.mjs`: regresiones de funcionamiento y manifiesto de distribución.
- `scripts/publicar-astro-iis.ps1`: publicación aislada y reversible.

No subas contraseñas, `.env`, datos de clientes, certificados ni copias de producción al repositorio. Las herramientas de prueba y las versiones de recuperación no se publican como contenido web.
