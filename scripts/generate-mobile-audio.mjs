// Generate browser-independent Spanish voice clips for the guided billing steps.
// This file is used only by the audio asset GitHub Action (not on IIS).
// It never receives invoice data, tax documents, customer data or API credentials.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const source = fs.readFileSync('public/scripts/ary-assistant.js', 'utf8');
const root = path.resolve('public/media/ary-guide-audio');
fs.mkdirSync(root, { recursive: true });
const stepRe = /step\('((?:\\.|[^'])*)',\s*'((?:\\.|[^'])*)',\s*'((?:\\.|[^'])*)'\)/g;
function getSteps(name) {
  const begin = name === 'factura' ? '    factura: [' : '    alta: [';
  const end = name === 'factura' ? '    ],\n    alta: [' : '    ]\n  };';
  const block = source.split(begin)[1]?.split(end)[0];
  if (!block) throw new Error('Cannot find guide group: ' + name);
  const entries = [...block.matchAll(stepRe)].map(m => ({
    title: m[2].replace(/\\'/g, "'"),
    text: m[3].replace(/\\'/g, "'"),
  }));
  if (entries.length !== (name === 'factura' ? 11 : 7) || !/\bfollowUp\b/.test(block)) {
    throw new Error('Guide text shape changed: review audio regeneration before release.');
  }
  const final = source.match(/const followUp = step\('(?:\\.|[^'])*', '((?:\\.|[^'])*)', '((?:\\.|[^'])*)'\);/);
  if (!final) throw new Error('Final reference step missing');
  return [...entries, {title:final[1],text:final[2]}];
}
function execute(command, args) {
  const proc = spawnSync(command, args, { encoding:'utf8', maxBuffer:20*1024*1024 });
  if (proc.error || proc.status !== 0) throw new Error(command+' failed: '+(proc.stderr || proc.error || proc.status));
}
function render(name, index, text) {
  const wav = path.join(root, '_temporary.wav');
  const filename = path.join(root, name+'-'+index+'.mp3');
  try {
    execute('espeak', ['-v','es-la','-s','157','-p','49','-a','155','-w',wav,text]);
    execute('ffmpeg', ['-nostdin','-hide_banner','-loglevel','error','-y','-i',wav,
      '-codec:a','libmp3lame','-b:a','40k','-ar','22050','-ac','1',filename]);
  } finally { if (fs.existsSync(wav)) fs.unlinkSync(wav); }
  if (fs.statSync(filename).size < 1000) throw new Error('Empty output: '+filename);
  return path.basename(filename);
}
const files = [];
for (const name of ['factura','alta']) {
  const items = getSteps(name);
  items.forEach((item,index) => {
    files.push(render(name,index,[item.title,item.text].join('. ')));
  });
}
files.push(render('prueba',0,'Hola. Soy tu asistente de Gasolinerías ARY. Ahora puedes escuchar las indicaciones de tu factura desde el teléfono.'));
fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify({version:1,files},null,2)+'\n');
console.log('Generated '+files.length+' local Spanish MP3 clips');
