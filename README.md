# Grupo ARY — Astro Pro / Android · versión 2.0

Sitio corporativo y portal de facturación con una sola identidad visual. La portada, estaciones, servicios, contacto y facturación están construidos con componentes Astro. No se incrusta ni se publica el diseño anterior.

## Qué cambia

- Diseño claro, magenta y vino; tipografía legible, navegación compartida y fotografías nuevas de cada estación.
- Adaptación desde 320 px; menú móvil, barra de accesos, controles de al menos 48 px y campos de 16 px. La barra inferior se oculta al detectar el teclado reduciendo la ventana visible.
- Facturación completamente rediseñada: pestañas, grupos de datos, ayuda de alta, confirmación, comprobante de recepción, errores y seguimiento.
- Estaciones filtrables por ciudad y búsqueda; las fotografías corresponden a su estación.
- Las 24 direcciones heredadas redirigen al portal nuevo. No hay enlaces de navegación interna a archivos antiguos.
- Solo se distribuyen los nuevos recursos de `public/media`. Las imágenes viejas se eliminan del código actual y del contenido publicado. Git conserva el historial; el servidor conserva versiones anteriores para recuperación.
- Sin fuentes externas, paquetes visuales pesados, rastreadores ni service worker que almacene trámites fiscales.

## Facturación: mismo funcionamiento, nueva presentación

El archivo `legacy/billing-original.htm` es una referencia privada de compilación: **no se publica**. `src/lib/billing.mjs` extrae exactamente su JavaScript. Las páginas de Astro utilizan una estructura nueva manteniendo los identificadores, nombres de campo, restricciones y eventos esperados por ese código.

La verificación compara el script completo byte por byte, no solo sus nombres. También verifica el hash CSP que autoriza el script y los contratos de ambos formularios. Los métodos de pago, catálogos, rango de fechas, CSRF, modo seguro, identificadores, reintentos y seguimiento no se reescribieron.

El servicio sigue utilizando:

- `GET /api/facturacion/opciones`
- `POST /api/facturacion/solicitudes`, para `FACTURA` y `ALTA`
- `POST /api/facturacion/estado`
- `POST /api/facturacion/recepcion`

El bot y Polaris no están incluidos ni se modifican. El alta fiscal sigue siendo procesada por el bot. Una recepción no significa timbrado concluido. No se guardan datos fiscales en una base de datos nueva del navegador.

## Publicar en el IIS existente

Antes de actualizar, conserva un respaldo del sitio y verifica que no tengas cambios locales pendientes. No uses `git reset --hard` ni `git clean` para resolver diferencias de producción.

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

    python tests/browser_test.py

Se comprueban 13 rutas a ocho tamaños, navegación, imágenes, campos, confirmación de factura, altas, errores, pausas, reintentos con mismo identificador y recuperación de seguimiento. El API está interceptado con respuestas simuladas; no se llama al backend real. El recorrido HTTP de CI conserva la CSP original. `test-results/browser-report.json` identifica qué comprobaciones se ejecutaron y si se usó el modo aislado de renderizado.

**La emulación de Android no sustituye probar un teléfono físico. Compilar y probar respuestas simuladas tampoco valida una emisión real en Polaris ni tu configuración particular de IIS.** Antes de atender clientes, revisa desde tu Android los dos formularios y realiza las pruebas controladas correspondientes al modo seguro del bot.

## Estructura

- `src/pages/`: 13 páginas de Astro.
- `src/components/`, `src/styles/`, `src/scripts/`: interfaz compartida.
- `src/data/site.ts`: ubicaciones, correos y contactos del sitio.
- `public/media/`: fotografías y marca nuevas.
- `legacy/`: referencia operativa privada, excluida del sitio compilado.
- `scripts/postbuild.mjs`: compatibilidad de URL e información de versión.
- `scripts/verificar-build.mjs`: regresiones de funcionamiento y manifiesto de distribución.
- `scripts/publicar-astro-iis.ps1`: publicación aislada y reversible.

No subas contraseñas, `.env`, datos de clientes, certificados ni copias de producción al repositorio. Las herramientas de prueba y las versiones de recuperación no se publican como contenido web.
