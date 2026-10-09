# Grupo ARY — Sitio web con Astro 5 + IIS

Esta **sí es una aplicación Astro real**, con componentes reutilizables, rutas .astro, TypeScript, CSS responsive, generación de HTML estático y compilación con npm run build.

## Arquitectura

| Ruta de Astro | Página |
| --- | --- |
| / | Inicio con marca Grupo ARY, estaciones, servicios y accesos rápidos |
| /empresa/ | Conoce Grupo ARY |
| /estaciones/ | Siete ubicaciones ARY/Apache, con filtro por ciudad |
| /servicios/ | Flotillas, tarjeta ARY, vales y servicios |
| /productos/ | Combustible, lubricantes y productos |
| /contacto/ | Medios de contacto |
| /consejos/ | Consejos de mantenimiento y ahorro |
| /credito/ | Información y contacto para crédito empresarial |
| /facturacion/ | Portal de facturación y alta de clientes, conservado e integrado con Astro |

La carpeta src/ contiene código Astro: src/layouts, src/components, src/data, src/styles y src/pages están organizados por responsabilidad.

La carpeta public/ mantiene **las rutas y archivos heredados** necesarios para publicar en IIS: imágenes, páginas .htm, formularios, favicon.ico y web.config. Esto permite conservar los enlaces existentes.

## Facturación y alta de clientes: mantener la lógica original

**No se alteraron el programa Polaris, el backend del bot, los nombres de los campos ni el JavaScript que envía solicitudes.**

- En ary_facturacion.htm están los formularios de **Facturar ticket** y **Dar de alta cliente**.
- Astro genera también /facturacion/ integrando el mismo documento original mediante src/pages/facturacion.astro. Solo añade la etiqueta HTML base href="/" para recursos relativos; no reescribe el JavaScript del portal.
- El bot sigue usando las rutas /api/facturacion/opciones, /api/facturacion/solicitudes, /api/facturacion/estado y /api/facturacion/recepcion.
- public/web.config conserva las reglas del proxy, HTTPS y destino privado. La única diferencia respecto de web.config original es la prioridad de index.html en defaultDocument.
- El alta fiscal es un trámite del bot: el sitio envía el tipo ALTA, no crea un cliente directamente desde el navegador ni evita validaciones del backend.
- El modo seguro del bot permanece controlado por el servidor.

El script npm run test:integrity comprueba estáticamente el archivo legado publicado, los formularios, rutas API y proxy IIS. **No sustituye una prueba real de facturación o alta en Polaris.**

## Requisitos en Windows Server

- Node.js 20 o 22 LTS, y npm.
- IIS instalado con HTTPS, bindings y certificado configurados.
- IIS URL Rewrite y ARR/proxy habilitados para el web.config existente.
- El backend original de facturación operativo y accesible por la red privada.
- Permisos de administrador para modificar la ruta física de un sitio IIS.

## Compilar y publicar con un BAT

Desde C:\inetpub\wwwroot\grupoary:

1. Haz respaldo antes de actualizar y revisa el resultado de git status.
2. Actualiza el código con git pull --ff-only origin main **si no hay cambios locales sin resolver**.
3. Haz clic derecho sobre **INICIAR_ARY_IIS.bat → Ejecutar como administrador**.
4. El BAT ejecuta npm install, npm run build y npm run test:integrity.
5. Solo cuando todo sale bien, scripts/publicar-astro-iis.ps1 respalda la configuración de IIS y cambia únicamente un sitio cuya raíz coincida exactamente con la carpeta del proyecto o con su directorio dist.
6. Inicia el sitio si estaba detenido y abre la web. Si no encuentra coincidencia exacta, no cambia ningún sitio y muestra qué ruta configurar manualmente.

**No ejecuta iisreset, ni cambia puertos, dominios, certificados o el servicio Polaris.** No elimina archivos del directorio previo. Ante un error posterior al cambio intenta restaurar la ruta física.

El sitio IIS debe apuntar a la carpeta dist, **no a la raíz del repositorio**, para evitar exponer archivos Git, herramientas y código fuente.

## Desarrollo y comprobación local

    cd /d C:\inetpub\wwwroot\grupoary
    npm install
    npm run dev

Astro muestra la dirección de desarrollo (normalmente http://localhost:4321). **La facturación real no funciona ahí sin configurar un proxy seguro a /api/facturacion: prueba con IIS.**

Para compilar sin publicar:

    npm run build
    npm run test:integrity

## Verificaciones antes de liberar

- Inicio, navegación, teléfonos y escritorio.
- Página /estaciones/, filtros por ciudad y enlaces de mapas.
- URLs /ary_facturacion.htm y /facturacion/ y sus dos formularios.
- Carga de opciones de facturación, alta fiscal, envío y consulta de estado.
- Certificado HTTPS, ARR, URL Rewrite, permisos y backend.
- Bot en modo seguro y, posteriormente, pruebas controladas en producción.

**Seguridad:** evita subir .env, contraseñas, tokens, datos de clientes y respaldos. Los scripts PHP heredados se mantienen por compatibilidad; revísalos de manera independiente antes de activar PHP en IIS.

## Recuperación

Si necesitas volver al sitio anterior, restaura desde el Administrador de IIS la ruta física anterior a dist (el directorio original no se elimina). El script guarda también un respaldo de IIS mediante appcmd add backup GrupoARY-Astro-....
