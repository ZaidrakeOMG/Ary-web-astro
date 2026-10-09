import fs from "node:fs";
import assert from "node:assert/strict";

const read = path => fs.readFileSync(path, "utf8");
const original = read("ary_facturacion.htm");
const legacy = read("dist/ary_facturacion.htm");
const astroBilling = read("dist/facturacion/index.html");
const configSource = read("web.config");
const configBuilt = read("dist/web.config");

assert.equal(legacy, original, "El HTML original de facturacion debe copiarse sin modificaciones");
for (const token of [
  'id="form-factura"',
  'id="form-alta"',
  "const API = '/api/facturacion'",
  "'/solicitudes'",
  "'/estado'",
  "'/recepcion'",
  'X-ARY-Request-Id',
]) {
  assert.ok(original.includes(token), "Falta parte critica de facturacion: " + token);
  assert.ok(astroBilling.includes(token), "Ruta Astro no incluye parte critica: " + token);
}

const inlineScript = value => {
  const scripts = [...value.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
  assert.ok(scripts.length >= 1, "No se encontro el codigo de facturacion");
  return scripts.map(item => item[1]).join("\n");
};
assert.equal(inlineScript(legacy), inlineScript(original), "El script del portal original cambio");
assert.ok(inlineScript(astroBilling).includes("const API = '/api/facturacion'"), "La ruta Astro no conserva la API");
assert.ok(astroBilling.includes('<base href="/"'), "Falta base del portal Astro");
assert.ok(configBuilt.includes('value="index.html"'), "No se configuro index.html como inicio");
assert.ok(configBuilt.includes('api/facturacion'), "Falta el rewrite del API");
assert.ok(configBuilt.includes('10.20.20.182:8765'), "No coincide el destino del proxy actual");
assert.ok(configSource.includes('10.20.20.182:8765'), "Cambio inesperado en config original");

for (const path of [
 "dist/index.html",
 "dist/empresa/index.html",
 "dist/estaciones/index.html",
 "dist/servicios/index.html",
 "dist/productos/index.html",
 "dist/contacto/index.html",
 "dist/consejos/index.html",
 "dist/credito/index.html",
 "dist/facturacion/index.html",
 "dist/Images/Arylogo2.png",
 "dist/favicon.ico",
 "dist/web.config"
]) {
  assert.ok(fs.existsSync(path), "Falta archivo de publicación: " + path);
}
console.log("OK: Astro, IIS, HTML, form FACTURA, alta de clientes y API conservados.");
