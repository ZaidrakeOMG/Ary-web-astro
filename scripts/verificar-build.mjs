import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = path => fs.readFileSync(path, 'utf8');
const original = read('ary_facturacion.htm');
const legacy = read('dist/ary_facturacion.htm');
const astroBilling = read('dist/facturacion/index.html');
const configOriginal = read('web.config');
const configBuild = read('dist/web.config');

// El bot ya funciona: se preserva el archivo de producción sin reescribir su JavaScript.
assert.equal(legacy, original, 'El portal histórico se debe copiar sin alteraciones');
const extractScripts = html => {
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
  assert.ok(scripts.length, 'No se encontró el script crítico de facturación');
  return scripts.map(s=>s[1]).join('\n');
};
assert.equal(extractScripts(legacy), extractScripts(original), 'Script histórico modificado');
assert.equal(extractScripts(astroBilling), extractScripts(original), 'La integración Astro modificó el script del bot');
for(const token of ['id="form-factura"','id="form-alta"',"const API = '/api/facturacion'", "'/solicitudes'", "'/estado'", "'/recepcion'", 'X-ARY-Request-Id', 'X-ARY-CSRF']){
  assert.ok(original.includes(token), `Falta componente del portal original: ${token}`);
  assert.ok(astroBilling.includes(token), `Astro no conserva el componente: ${token}`);
}
assert.ok(astroBilling.includes('<base href="/"'), 'La ruta Astro debe resolver assets desde la raíz');
assert.ok(astroBilling.includes('/media/ary-symbol.webp'), 'Logo nuevo no aplicado a facturación');
assert.ok(astroBilling.includes('Facturar ticket') && astroBilling.includes('Dar de alta cliente'), 'Pestañas faltantes');

// Evitar el 500.19 de IIS y conservar el rewrite exacto hacia el servidor privado del bot.
const filesXml=configBuild.match(/<defaultDocument\b[^>]*>[\s\S]*?<files\b[^>]*>([\s\S]*?)<\/files>[\s\S]*?<\/defaultDocument>/i)?.[1];
assert.ok(filesXml,'IIS defaultDocument/files ausente');
const defaults=[...filesXml.matchAll(/<add\s+value=["']([^"']+)["']\s*\/>/gi)].map(m=>m[1].toLowerCase());
assert.equal(defaults[0], 'index.html', 'Astro debe ser el documento principal de IIS');
assert.equal(new Set(defaults).size, defaults.length, 'IIS HTTP 500.19: documento predeterminado duplicado');
assert.ok(configBuild.includes('ARY Portal Facturacion API'), 'Regla del bot eliminada');
assert.ok(configBuild.includes('10.20.20.182:8765'), 'El destino del bot cambió');
assert.ok(configOriginal.includes('10.20.20.182:8765'), 'La configuración original del bot no coincide');
assert.ok(configBuild.includes('ARY Astro - Facturacion'), 'No hay redirección de la facturación antigua');
assert.ok(configBuild.includes('ARY Astro - Inicio'), 'No hay redirección del inicio antiguo');
assert.ok(configBuild.includes('stopProcessing="true"'), 'IIS debe detener la evaluación de reglas coincidentes');

const routes=['','empresa','estaciones','servicios','productos','contacto','consejos','credito','privacidad','facturacion','error','gracias'];
for (const route of routes){
  const file=`dist/${route ? route+'/' : ''}index.html`;
  assert.ok(fs.existsSync(file), `La ruta Astro ${route||'/'} no fue compilada`);
}
for(const image of ['ary-1','ary-2','ary-3','ary-4','ary-5','ary-6','apache','ary-symbol','ary-logo','ary-mascota','ary-visual']){
  const path=`dist/media/${image}.webp`;
  assert.ok(fs.existsSync(path),`Falta la foto nueva: ${path}`);
  const data=fs.readFileSync(path);
  assert.equal(data.toString('ascii',0,4),'RIFF',`Imagen no es WebP: ${path}`);
  assert.equal(data.toString('ascii',8,12),'WEBP',`Formato WebP inválido: ${path}`);
}
const home=read('dist/index.html');
const stationPage=read('dist/estaciones/index.html');
assert.ok(home.includes('/media/ary-3.webp') && home.includes('/facturacion/'), 'Portada nueva incompleta');
for(const photo of ['ary-1','ary-2','ary-3','ary-4','ary-5','ary-6','apache']){
  assert.ok(stationPage.includes('/media/'+photo+'.webp'), `Falta estación: ${photo}`);
}
const businessPages=routes.filter(p=>p!=='facturacion');
for(const route of businessPages){
  const page=read(`dist/${route?route+'/':''}index.html`);
  assert.ok(!/<a\b[^>]*href="(?:default|ary_[^"#]+)\.htm"/i.test(page),`Enlace al sitio antiguo en ${route}`);
}
assert.ok(!fs.existsSync('dist/Images/_notes'), 'El build todavía publica assets viejos _notes');
console.log('OK: Astro responsive, 7 estaciones, 11 imágenes nuevas, 12 rutas, facturación/alta sin cambios y reglas IIS correctas.');
