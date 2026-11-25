// Gera data/pt/preao.txt a partir do dicionário pt_PT do LibreOffice (anotações PREAO90).
// Cada linha: grafia antiga (antes do Acordo de 1990) e a actual, separadas por espaço.
//   npm i --no-save dictionary-pt-pt && node scripts/gerar-preao.js [caminho/index.dic]
'use strict';
const fs = require('fs'), path = require('path');
const dic = fs.readFileSync(process.argv[2] || path.join(__dirname, '..', 'node_modules', 'dictionary-pt-pt', 'index.dic'), 'utf8');
const out = new Set();
for (const line of dic.split('\n')) {
  const m = /^([^\/\t\s]+)[^\t]*\t.*PREAO90=([^,\]\s]+)/.exec(line);
  if (m && m[1] !== m[2]) out.add(m[2].toLowerCase() + ' ' + m[1].toLowerCase());
}
fs.writeFileSync(path.join(__dirname, '..', 'data', 'pt', 'preao.txt'), [...out].sort().join('\n') + '\n');
console.log(out.size, 'pares');
