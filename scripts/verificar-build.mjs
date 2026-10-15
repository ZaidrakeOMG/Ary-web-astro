import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const out=path.resolve(process.env.ARY_OUT_DIR || 'dist');
const read=p=>fs.readFileSync(p,'utf8');
const source=read('legacy/billing-original.htm');
const runtime=read('src/lib/billing-runtime.js');
const billing=read(path.join(out,'facturacion/index.html'));
const builtRuntime=read(path.join(out,'scripts/billing-runtime.js'));
const scripts=s=>[...s.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(x=>x[1]);
const originalCore=scripts(source).find(x=>x.includes("const API = '/api/facturacion'"));
assert.ok(originalCore,'Missing baseline billing script');
assert.equal(builtRuntime,runtime,'STOP: external billing runtime differs from canonical source');
const catalog=s=>JSON.parse(s.match(/const INITIAL = (.*);/)[1]);
assert.deepEqual(catalog(runtime),catalog(originalCore),'STOP: billing catalog changed');
assert.ok(billing.includes('/scripts/billing-runtime.js'),'Billing must load the canonical runtime as an external same-origin script');
assert.ok(billing.includes("connect-src 'self'") || billing.includes('connect-src &#39;self&#39;'),'Missing same-origin API CSP');
const attrs=s=>Object.fromEntries([...s.matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)].map(x=>[x[1],x[2]??x[3]??x[4]??'']));

// Verify every executable inline script, not just the billing program.
const cspTag=[...billing.matchAll(/<meta\b([^>]+)>/gi)].map(m=>attrs(m[1])).find(a=>a['http-equiv']?.toLowerCase()==='content-security-policy');
assert.ok(cspTag?.content,'Billing CSP is missing');
const policy=cspTag.content.replaceAll('&#39;',"'").replaceAll('&quot;','"');
const scriptDirective=policy.split(';').map(s=>s.trim()).find(s=>s.startsWith('script-src '));
assert.ok(scriptDirective && !scriptDirective.includes("'unsafe-inline'"),'Billing must not permit inline JavaScript');
assert.ok(policy.includes("script-src-attr 'none'"),'Billing must block inline event-handler JavaScript');
assert.ok(policy.includes("require-trusted-types-for 'script'"),'Billing must enforce Trusted Types for DOM script sinks');
assert.ok(policy.includes("trusted-types 'none'"),'Billing must not allow arbitrary Trusted Types policies');
for(const script of billing.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
 const a=attrs(script[1]);
 if(a.src){assert.ok(a.src.startsWith('/') && !a.src.startsWith('//'),'Unexpected external billing script origin');continue;}
 if(a.type && !['module','text/javascript','application/javascript'].includes(a.type.toLowerCase()))continue;
 assert.ok(!script[2].trim(),'STOP: executable inline JavaScript detected in billing');
}
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
assert.ok(billing.includes('/scripts/ary-voice.js'),'Missing voice module');
assert.ok(billing.includes('/ary-assistance.css'),'Missing assistance styles');
const config=read(path.join(out,'web.config'));const rootConfig=read('web.config');
const rule=s=>s.match(/<rule\b[^>]*name="ARY Portal Facturacion API"[\s\S]*?<\/rule>/)?.[0].replace(/\s+/g,'');
assert.ok(rule(config),'Missing original API proxy');assert.equal(rule(config),rule(rootConfig),'STOP: backend API rule changed');
const defaultFiles=config.match(/<defaultDocument\b[^>]*>[\s\S]*?<files>([\s\S]*?)<\/files>/)?.[1];assert.ok(defaultFiles);
const names=[...defaultFiles.matchAll(/<add\b[^>]*value="([^"]+)"/g)].map(x=>x[1].toLowerCase());assert.equal(names[0],'index.html');assert.equal(names.length,new Set(names).size,'IIS duplicate defaultDocument entries');
assert.ok(config.includes('mimeType="image/webp"'),'IIS must serve the new WebP photographs');
for(const name of ['X-Content-Type-Options','X-Frame-Options','X-XSS-Protection','Referrer-Policy','Permissions-Policy','Strict-Transport-Security','Cross-Origin-Opener-Policy','Cross-Origin-Resource-Policy','Origin-Agent-Cluster','X-DNS-Prefetch-Control','X-Permitted-Cross-Domain-Policies','Content-Security-Policy']){
 assert.ok(config.includes(`<add name="${name}" value="`),`Missing IIS security header: ${name}`);
}
const globalCsp=(config.match(/<add name="Content-Security-Policy" value="([^"]+)"/)||[])[1]||'';
assert.ok(globalCsp.includes("script-src 'self'") && !globalCsp.includes("script-src 'self' 'unsafe-inline'"),'Global CSP must not allow inline JavaScript');
assert.ok(globalCsp.includes("script-src-attr 'none'"),'Global CSP must block inline event handlers');
assert.ok(globalCsp.includes("require-trusted-types-for 'script'") && globalCsp.includes("trusted-types 'none'"),'Global CSP must enforce Trusted Types');
assert.ok(config.includes('<requestFiltering removeServerHeader="true" allowDoubleEscaping="false">'),'IIS must hide its Server header and reject double escaping');
assert.ok(config.includes('maxAllowedContentLength="5242880" maxUrl="2048" maxQueryString="1024"'),'Missing hardened IIS request limits');
for(const verb of ['GET','HEAD','POST','OPTIONS']) assert.ok(config.includes(`<add verb="${verb}" allowed="true" />`),`Missing allowed HTTP verb: ${verb}`);
for(const segment of ['.git','.github','.ary-releases','.ary-staging','node_modules','src','server','tests','legacy','data','logs']){
 assert.ok(config.includes(`<add segment="${segment}" />`),`Missing hidden IIS segment: ${segment}`);
}
for(const ext of ['.json','.log','.sql','.bak','.ps1','.bat','.py','.sqlite3','.zip','.pem','.key','.pfx']){
 assert.ok(config.includes(`<add fileExtension="${ext}" allowed="false" />`),`Missing blocked IIS extension: ${ext}`);
}
for(const ruleName of ['ARY Security Reject Unexpected Host','ARY Security Redirect HTTP to canonical HTTPS','ARY Security Redirect apex to WWW','ARY Security Block Scanner Paths']){
 assert.ok(config.includes(`name="${ruleName}"`),`Missing security rewrite rule: ${ruleName}`);
}
assert.ok(!config.includes('name="Redirect HTTP to HTTPS"'),'Legacy Host-header redirect must not remain');
assert.ok(fs.existsSync(path.join(out,'.well-known/security.txt')),'Missing RFC 9116 security.txt');
assert.ok(fs.existsSync(path.join(out,'seguridad/index.html')),'Missing public cybersecurity page');
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
const results={builtPages:count,scriptSHA256:createHash('sha256').update(builtRuntime).digest('hex'),scriptSource:'src/lib/billing-runtime.js',billingRuntime:'external-no-inline',billingFields:'unchanged',billingCatalogs:'unchanged',apiProxy:'unchanged',aliases:Object.keys(release.aliases).length,legacyImagesPublished:false};
fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(results,null,2));
console.log('PASS: '+JSON.stringify(results));
const manifest=Object.fromEntries(walk(out).filter(p=>path.basename(p)!=='sha256-manifest.json').sort().map(p=>[path.relative(out,p).split(path.sep).join('/'),createHash('sha256').update(fs.readFileSync(p)).digest('hex')]));
fs.writeFileSync(path.join(out,'sha256-manifest.json'),JSON.stringify(manifest,null,2));
console.log(`SHA256 manifest: ${Object.keys(manifest).length} files.`);
