# Asistente ARY: mascota Pemex, saludo y chat con IA opcional

## Qué recibe el sitio al publicar

La mascota enviada por ARY se conserva sin redibujarla; se optimiza a WebP de 192 px con transparencia, en `public/media/ary-mascota-pemex.webp`. El asistente muestra «¡Hola! ¿Te puedo ayudar en algo?» una vez por pestaña/sesión, sin abrir un diálogo automáticamente, emitir sonidos ni tomar el foco. El saludo se puede cerrar, se mantiene dentro de la pantalla y se aparta del menú y de la revisión final de factura.

El nuevo chat convive con las guías de factura (11 pasos) y alta (9 pasos). El botón Flotillas de la cabecera y su destino no se cambian.

**Guía local no significa IA.** Sin configuración de servidor, el chat funciona con respuestas básicas identificadas como «guía local». La opción de IA está desmarcada. No se envían mensajes de chat ni se consulta su API al cargar la página o usar las guías. Al activar IA, el visitante autoriza enviar las preguntas que escriba a partir de ese momento. La conversación local previa no se remite retroactivamente.

## Bajar y publicar la parte visual

En CMD, dentro del repositorio ya localizado:

```cmd
cd /d C:\inetpub\wwwroot\grupoary
git status
git pull --ff-only origin main
```

Si hay cambios locales o falla el pull, detenerse. No usar `reset --hard`, `clean` ni reemplazar la carpeta IIS. Tras un pull correcto, ejecutar `INICIAR_ARY_IIS.bat` **como administrador**, conforme al README de publicación. No es necesario copiar `dist` manualmente. GitHub no publica IIS automáticamente.

## Activar IA real: requiere una clave privada

Esta instalación es opcional e independiente de la publicación estática. No se activa con `git pull`. Usa la Responses API de OpenAI, inicialmente con `gpt-4.1-mini`; `OPENAI_MODEL` permite seleccionar otro modelo compatible. Se requiere Node 22 actualizado o una versión compatible, acceso HTTPS saliente al proveedor y la clave con acceso al modelo. La API tiene consumo propio; revisar límites y facturación en el proveedor antes de habilitar atención pública.

1. Con el usuario de Windows que ejecutará el servicio, abrir `CONFIGURAR_IA_ARY.bat`. Introducir la clave en el cuadro de consola oculto. No enviarla por chat ni agregarla a `.env`, `public/`, Astro `PUBLIC_*` o Git. La clave se cifra para ese usuario/equipo en `%LOCALAPPDATA%\ARY\asistente-ia\openai-key.xml`, fuera del sitio web. Configurarla no valida todavía los permisos contra OpenAI.
2. Ejecutar `INICIAR_IA_ARY.bat` con **el mismo usuario de Windows**. Mantener abierta esa consola. Inicia solo un servicio en `127.0.0.1:8786`; no es un servicio Windows ni una tarea al reinicio. Al cerrar la ventana, cerrar sesión o reiniciar, hay que iniciarlo de nuevo. No abrir ese puerto en el firewall o en el router.
3. Con el servicio iniciado, ejecutar `CONECTAR_IA_IIS.bat` como administrador. Detecta exactamente un sitio asociado a este proyecto y muestra nombre/ruta antes de pedir escribir `CONECTAR`. Agrega únicamente `^api/asistente/(salud|chat)$` hacia el servicio local. No reemplaza las reglas existentes, no cambia puertos, no reinicia IIS y no envía facturas. Requiere los módulos Rewrite/ARR que ya utiliza la API existente. Guarda respaldo del `web.config` activo fuera del sitio. Si no hay detección única, configuración compatible o servicio listo, se detiene.
4. En la web publicada, abrir la mascota, «Conversar con el asistente», activar IA y escribir una pregunta general. «IA habilitada» significa que el servicio está configurado; una respuesta etiquetada como IA confirma que pudo responder el proveedor. Si la clave no sirve, hay error, límite o timeout, se informa y se regresa a guía local. No se inventa una respuesta de IA.

El publicador existente parte del `web.config` activo; comprobar que la regla `ARY Asistente IA` se conserva después de futuras publicaciones. Si IIS rechaza la regla, restaurar **el respaldo indicado por ese intento al mismo archivo activo**. No restaurar un respaldo sobre otra versión/ruta a ciegas. No se ha validado esta activación contra el IIS real ni contra una clave real de ARY.

## Separación y límites

- No se toca `legacy/billing-original.htm`, sus contratos, validaciones, modo prueba/real, CSRF, API, base de datos ni Polaris. La IA no tiene herramientas, acceso a cuentas, consulta de saldos ni capacidad de emitir trámites.
- El navegador no recibe la clave. Solo usa el endpoint del mismo sitio. Respuestas como texto con `textContent`, sin ejecutar HTML o vínculos del modelo.
- El chat no lee campos de facturación. Texto explícito únicamente; historial acotado en memoria de la página, sin guardarlo en localStorage/sessionStorage. «Borrar chat» limpia lo mostrado, cancela trabajo pendiente del navegador y desactiva IA; no revoca un mensaje que ya haya llegado al proveedor.
- Filtros orientativos rechazan patrones de RFC, correo, números largos y claves, tanto en navegador como en servidor. **No constituyen detección perfecta de datos personales.** La advertencia al visitante sigue siendo necesaria.
- El servidor pide `store: false` y no registra mensajes ni errores del proveedor. Eso no equivale a garantizar retención cero por parte del proveedor. Revisar las políticas de privacidad y datos antes de habilitarlo públicamente.
- Cuerpos de hasta 8 KiB, preguntas de 500 caracteres, historial máximo de 6 mensajes, respuestas de 350 tokens y timeout de 12 segundos. No hay reintentos automáticos.
- Dos peticiones simultáneas; 20 solicitudes por cliente cada 10 minutos, 200 por hora globales y 1,000 por día globales, por proceso. Los contadores son en memoria y reinician con el servicio; **no sustituyen límites monetarios del proveedor**. `ARY_AI_HOURLY_LIMIT` y `ARY_AI_DAILY_LIMIT` permiten ajustar los topes acotados. Origen/cabecera no autentican personas ni detienen bots por sí solos. Revisar abuso antes de escalar.
- IIS debe añadir al final de `X-Forwarded-For` la IP que observó. El servidor toma el último elemento IP válido. Si no está, todos comparten el límite conservador de loopback. Los topes globales y de concurrencia siguen aplicando.

## Archivos y pruebas

`public/scripts/ary-chat.js`, `public/styles/ary-chat.css` y `src/layouts/SiteLayout.astro`: integración visual aditiva. `server/ary-ai.mjs`: backend opcional sin dependencias. Los BAT y scripts de PowerShell solo se ejecutan de forma explícita.

```sh
node --check public/scripts/ary-chat.js
node --test tests/assistant-ai.test.mjs
npm run check
npm run build
npm run test:integrity
python -m http.server 4173 --directory dist
# En otra terminal:
python tests/chat_browser_test.py
python tests/assistant_test.py
python tests/browser_test.py
```

Las pruebas de IA y facturación interceptan respuestas: no gastan una clave real, no acceden a clientes y no emiten CFDI. Las pruebas de servidor no validan IIS; la emulación móvil no reemplaza un teléfono físico.

Referencias técnicas consultadas: [seguridad de claves](https://help.openai.com/en/articles/5112595-best-practices-for-api-key-safety), [Responses API](https://platform.openai.com/docs/api-reference/responses/create), [modelo](https://platform.openai.com/docs/models/gpt-4.1-mini).
