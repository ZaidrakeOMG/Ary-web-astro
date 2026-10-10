import fs from 'node:fs';
import path from 'node:path';
const out = path.resolve(process.env.ARY_OUT_DIR || 'dist');
const aliases = {
 'default.htm':'/', 'default.html':'/', 'default_01.htm':'/', 'defaultori.htm':'/', 'indext.htm':'/', 'indext.html':'/', 'index.htm':'/',
 'ary_conoce_nuestra_empresa.htm':'/empresa/', 'ary_ubica_nuestras_estaciones.htm':'/estaciones/',
 'ary_servicios.htm':'/servicios/', 'ary-superservicios.htm':'/servicios/', 'ary_productos.htm':'/productos/',
 'ary_contacto.htm':'/contacto/', 'ary_tips_ahorro_combustible.htm':'/consejos/',
 'ary_servicios_solicitud_credito.htm':'/credito/', 'ary_facturacion.htm':'/facturacion/',
 'ary_facturacion-electronica.htm':'/facturacion/', 'ary_facturacion-electronica_incluye boton.htm':'/facturacion/',
 'ary_politica_de_privacidad.htm':'/privacidad/', 'politica_de_privacidad.htm':'/privacidad/',
 'ary_gracias.htm':'/gracias/', 'gracias.htm':'/gracias/', 'ary_error.htm':'/error/', 'error2.htm':'/error/'
};
fs.mkdirSync(path.join(out,'_ary'),{recursive:true});
fs.writeFileSync(path.join(out,'_ary/legacy-route.js'), "const target=document.querySelector('link[rel=canonical]')?.getAttribute('href');if(target?.startsWith('/')&&!target.startsWith('//'))location.replace(target+location.search+location.hash);\n");
for (const [name,target] of Object.entries(aliases)) {
 const html=`<!doctype html><html lang="es-MX"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><meta name="ary-legacy-target" content="${target}"><link rel="canonical" href="${target}"><title>Continuar en ARY</title><script src="/_ary/legacy-route.js" defer></script></head><body><p>Esta página se encuentra en nuestro nuevo portal.</p><a href="${target}">Continuar en ARY</a></body></html>`;
 fs.writeFileSync(path.join(out,name),html);
}
// UI-only routes; the existing backend rewrite stays untouched.
let config=fs.readFileSync(path.join(out,'web.config'),'utf8');
config=config.replace(/\s*<rule\b[^>]*name="ARY Astro[^"\n]*"[\s\S]*?<\/rule>/g,'');
const escapeRE=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const rules=Object.entries(aliases).map(([name,target],i)=>`    <rule name="ARY Astro alias ${i+1}" stopProcessing="true"><match url="^${escapeRE(name)}$" ignoreCase="true"/><action type="Redirect" url="${target}" redirectType="Found" appendQueryString="true"/></rule>`).join('\n');
config=config.replace('</rules>',rules+'\n  </rules>');
fs.writeFileSync(path.join(out,'web.config'),config);
// Read the built page marker so the manifest and IIS verification cannot drift.
const home=fs.readFileSync(path.join(out,'index.html'),'utf8');
const design=home.match(/<meta\b[^>]*name="ary-release"[^>]*content="([a-zA-Z0-9._-]+)"[^>]*>/)?.[1];
if(!design) throw new Error('Missing or invalid ary-release marker in compiled home page');
fs.writeFileSync(path.join(out,'release.json'),JSON.stringify({version:'2.0.0',design,builtAt:new Date().toISOString(),commit:process.env.GITHUB_SHA || 'local-build',aliases},null,2));
console.log(`Prepared ${Object.keys(aliases).length} compatibility routes; old designs are not published.`);
