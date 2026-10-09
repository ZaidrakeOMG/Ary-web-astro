# Grupo ARY · Portal web para IIS

Sitio corporativo de **ARY Super Servicios**, con secciones de estaciones, servicios, productos, crédito, consejos y trámites de facturación.

**Estado técnico:** hoy el sitio utiliza archivos estáticos `.htm` y el servidor web **IIS**. A pesar del nombre del repositorio `Ary-web-astro`, **no es todavía una aplicación de Astro Framework** (no existe `astro.config.mjs` ni `package.json`). Esta actualización prioriza mantener operativa la web publicada y el bot de facturación.

## Iniciar la página desde Windows Server

1. Conserva la carpeta en `C:\inetpub\wwwroot\grupoary` o en la ubicación real asignada en IIS.
2. Ejecuta **INICIAR_ARY_IIS.bat** como administrador desde la carpeta del proyecto.
3. El script localiza el sitio IIS cuya ruta física coincide con esta carpeta (o contiene la carpeta), arranca su Application Pool y sitio si están detenidos y abre `default.htm` en el navegador.
4. Si no lo encuentra, primero configura en IIS la ruta física, los bindings, el certificado HTTPS y el grupo de aplicaciones.

El BAT **no** hace `iisreset`, **no** crea puertos ni bindings y **no** inicia Polaris ni el servicio de facturación; son servicios independientes. Tampoco instala Astro ni Node.

## Facturación y alta de clientes

El archivo `ary_facturacion.htm` incorpora dos pestañas:

- **Facturar ticket** para clientes existentes.
- **Dar de alta cliente** para registrar los datos fiscales mediante el bot.

Se preservan los campos, el JavaScript, las validaciones y estas rutas del API:

- `GET /api/facturacion/opciones`
- `POST /api/facturacion/solicitudes` (tipo `FACTURA` o `ALTA`)
- `POST /api/facturacion/estado`
- `POST /api/facturacion/recepcion`

**No se ha cambiado la lógica del bot.** Las mejoras en esa página son únicamente visuales (CSS). La configuración original `web.config` tampoco se alteró: contiene la redirección HTTPS y el proxy hacia el servicio interno de facturación.

La prueba real de captura, registro del cliente en Polaris y timbrado debe realizarse en el servidor, siguiendo el modo seguro del bot y los procedimientos de producción.

## Páginas y archivos relevantes

| Ruta | Propósito |
| --- | --- |
| `default.htm` | Inicio de Grupo ARY |
| `ary_facturacion.htm` | Facturación + alta de clientes |
| `ary_ubica_nuestras_estaciones.htm` | Estaciones |
| `ary_tips_ahorro_combustible.htm` | Consejos de consumo (página nueva) |
| `ary_servicios_solicitud_credito.htm` | Información de crédito (página nueva, sin solicitud automática) |
| `assets/ary-extras.css` | Diseño y accesos móviles |
| `INICIAR_ARY_IIS.bat` | Arranque de la página en IIS |
| `scripts/iniciar-ary-iis.ps1` | Detección e inicio del sitio |
| `web.config` | Configuración existente de IIS, HTTPS y API |

## Llevar los cambios de GitHub al servidor

**Antes de actualizar, respalda tu sitio y revisa `git status`.** Si hay cambios locales, resuélvelos antes de traer la rama remota.

```cmd
cd /d C:\inetpub\wwwroot\grupoary
git status
git pull --ff-only origin main
```

No uses `git reset --hard` ni `git clean -fd` sobre la web productiva sin respaldar.

## Recomendaciones de seguridad

- No subas contraseñas, secretos, tokens, datos personales, respaldos ni bases de datos.
- Mantén el puerto privado del bot detrás del proxy y de las reglas de firewall existentes.
- Revisa que URL Rewrite/ARR siga activado y que `GET /api/facturacion/opciones` responda correctamente bajo HTTPS.
- Las páginas PHP heredadas son módulos distintos del bot; si alguna se usa, revisa su compatibilidad y su seguridad antes de habilitar PHP en IIS.
