import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const out=path.resolve(process.env.ARY_OUT_DIR || 'dist');
const read=p=>fs.readFileSync(p,'utf8');
const source=read('legacy/billing-original.htm');
const billing=read(path.join(out,'facturacion/index.html'));
const scripts=s=>[...s.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(x=>x[1]);
const originalCore=scripts(source).find(x=>x.includes("const API = '/api/facturacion'"));
const builtCore=scripts(billing).find(x=>x.includes("const API = '/api/facturacion'"));
assert.ok(originalCore,'Missing baseline billing script');
assert.equal(builtCore,originalCore,'STOP: operational billing code changed');
const digest=createHash('sha256').update(builtCore).digest('base64');
assert.ok(billing.includes('sha256-'+digest),'Billing inline script is not permitted by its CSP');
assert.ok(billing.includes("connect-src 'self'") || billing.includes('connect-src &#39;self&#39;'),'Missing same-origin API CSP');
const attrs=s=>Object.fromEntries([...s.matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)].map(x=>[x[1],x[2]??x[3]??x[4]??'']));
function contract(html){
 const result={};
 for(const form of html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)){
  const id=attrs(form[1]).id;if(!id?.startsWith('form-'))continue;
  result[id]=[...form[2].matchAll(/<(input|select)\b([^>]*)>/gi)].map(x=>{
   const a=attrs(x[2]);const item={tag:x[1],name:a.name,type:a.type||(x[1]==='input'?'text':'select')};
   for(const k of ['id','minlength','maxlength','pattern'])if(a[k]!==undefined)item[k]=a[k];
   item.required=a.required!==undefined;return item;
  }).sort((a,b)=>a.name.localeCompare(b.name));
 }
 return result;
}
assert.deepEqual(contract(billing),contract(source),'STOP: a billing field or validation changed');
for(const id of [...new Set([...originalCore.matchAll(/\$\('([^']+)'\)/g)].map(x=>x[1]))])assert.ok(billing.includes(`id="${id}"`),`Missing original event target: ${id}`);
const config=read(path.join(out,'web.config'));const rootConfig=read('web.config');
const rule=s=>s.match(/<rule\b[^>]*name="ARY Portal Facturacion API"[\s\S]*?<\/rule>/)?.[0].replace(/\s+/g,'');
assert.ok(rule(config),'Missing original API proxy');assert.equal(rule(config),rule(rootConfig),'STOP: backend API rule changed');
const defaultFiles=config.match(/<defaultDocument\b[^>]*>[\s\S]*?<files>([\s\S]*?)<\/files>/)?.[1];assert.ok(defaultFiles);
const names=[...defaultFiles.matchAll(/<add\b[^>]*value="([^"]+)"/g)].map(x=>x[1].toLowerCase());assert.equal(names[0],'index.html');assert.equal(names.length,new Set(names).size,'IIS duplicate defaultDocument entries');
assert.ok(config.includes('mimeType="image/webp"'),'IIS must serve the new WebP photographs');
assert.ok(!fs.existsSync(path.join(out,'Images')),'Obsolete images must not be deployed');assert.ok(!fs.existsSync(path.join(out,'legacy')),'Legacy source must remain private');
const release=JSON.parse(read(path.join(out,'release.json')));
for(const [file,target] of Object.entries(release.aliases)){const html=read(path.join(out,file));assert.ok(html.includes(`content="${target}"`));assert.ok(html.length<1600,'An old design was copied instead of an alias');}
function walk(p){return fs.readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(p,e.name)):[path.join(p,e.name)]);}
let count=0;
for(const file of walk(out).filter(p=>p.endsWith('.html'))){
 const html=read(file);if(!html.includes('ary-release'))continue;count++;
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);assert.equal(ids.length,new Set(ids).size,`Duplicate element IDs: ${file}`);
 assert.ok(!/<iframe/i.test(html),`Embedded old site in ${file}`);
 for(const m of html.matchAll(/\b(href|src)="([^"<>]+)"/g)){
  let ref=m[2];if(/^(?:https?:|mailto:|tel:|#|data:)/i.test(ref) || ref.startsWith('//'))continue;
  assert.ok(ref.startsWith('/'),`Relative link can escape the Astro route: ${ref}`);
  ref=decodeURIComponent(ref.split(/[?#]/)[0]);
  if(m[1]==='href')assert.ok(!/\.htm$/i.test(ref),`Navigation returns to the old site: ${ref}`);
  const dest=path.join(out,ref);assert.ok(fs.existsSync(dest),`Broken local asset/link in ${file}: ${ref}`);
 }
}
assert.ok(count>=11,'Not all Astro routes were generated');
const results={builtPages:count,scriptSHA256:createHash('sha256').update(builtCore).digest('hex'),billingFields:'unchanged',apiProxy:'unchanged',aliases:Object.keys(release.aliases).length,legacyImagesPublished:false};
fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(results,null,2));
console.log('PASS: '+JSON.stringify(results));

// The compiled ZIP can be deployed without reinstalling Node/npm dependencies.
const manifest=Object.fromEntries(walk(out).filter(p=>path.basename(p)!=='sha256-manifest.json').sort().map(p=>[path.relative(out,p).split(path.sep).join('/'),createHash('sha256').update(fs.readFileSync(p)).digest('hex')]));
fs.writeFileSync(path.join(out,'sha256-manifest.json'),JSON.stringify(manifest,null,2));
console.log(`SHA256 manifest: ${Object.keys(manifest).length} files.`);
