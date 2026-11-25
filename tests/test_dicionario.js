// Testa o juiz por dicionário:  node tests/test_dicionario.js
'use strict';
const assert = require('assert');
const { loadLang } = require('../dict');

// [categoria, resposta, fácil, médio, difícil]
const CASOS = [
  ['País', 'Angola', 1, 1, 1],
  ['País', 'angola', 1, 1, 1],
  ['País', 'Argélia', 1, 1, 1],
  ['País', 'Argelia', 1, 1, 0],
  ['País', 'Angolla', 1, 0, 0],
  ['País', 'Abacate', 0, 0, 0],
  ['País', 'Costa do Marfim', 1, 1, 1],
  ['País', 'São Tomé e Príncipe', 1, 1, 1],
  ['Fruto', 'Abacate', 1, 1, 1],
  ['Fruto', 'abacates', 1, 1, 1],
  ['Fruto', 'Ananás', 1, 1, 1],
  ['Fruto', 'Ananas', 1, 1, 0],
  ['Fruto', 'Múcua', 1, 1, 1],
  ['Fruto', 'Mucua', 1, 1, 0],
  ['Fruto', 'Gajaja', 1, 1, 1],
  ['Fruto', 'Azzzz', 0, 0, 0],
  ['Fruto', 'Elefante', 0, 0, 0],
  ['Animal', 'Elefante', 1, 1, 1],
  ['Animal', 'Elefnte', 1, 0, 0],
  ['Animal', 'Palanca-negra', 1, 1, 1],
  ['Animal', 'Palanca negra', 1, 1, 1],
  ['Animal', 'Leões', 1, 1, 1],
  ['Cor', 'Azul', 1, 1, 1],
  ['Cor', 'Amarelo', 1, 1, 1],
  ['Cor', 'Amarello', 1, 0, 0],
  ['Nome', 'Ana', 1, 1, 1],
  ['Nome', 'João', 1, 1, 1],
  ['Nome', 'Joao', 1, 1, 0],
  ['Nome', 'Kiluanji', 1, 1, 1],
  ['Nome', 'Maria José', 1, 1, 1],
  ['Nome', 'Xptoxpto', 0, 0, 0],
  ['Cidade', 'Luanda', 1, 1, 1],
  ['Cidade', 'Lubango', 1, 1, 1],
  ['Objecto', 'Objecto', 1, 1, 1],
  ['Objecto', 'Objeto', 1, 1, 1],
  ['Objecto', 'Cadeira', 1, 1, 1],
  ['Objecto', 'Cadeiras', 1, 1, 1],
  ['Objecto', 'Cadera', 1, 0, 0],
  ['Objecto', 'Telemóvel', 1, 1, 1],
  ['Objecto', 'Telemovel', 1, 1, 0],
  ['Objecto', 'Guarda-chuva', 1, 1, 1],
  ['Objecto', 'Guarda chuva', 1, 1, 1],
  ['Objecto', 'Qwrtz', 0, 0, 0],
  ['Profissão', 'Director', 1, 1, 1],
  ['Profissão', 'Directora', 1, 1, 1],
  ['Profissão', 'Actor', 1, 1, 1],
  ['Comida', 'Funge', 1, 1, 1],
  ['Comida', 'Acção', 1, 1, 1],
  ['Celebridade', 'Qualquer coisa', 1, 1, 1],
  ['Marca', 'Zzzz', 1, 1, 1],
];

(async () => {
  const t0 = Date.now();
  const pt = await loadLang('pt');
  console.log('dicionário carregado em', Date.now() - t0, 'ms');
  const t1 = Date.now();
  let falhas = 0;
  for (const [cat, raw, ...exp] of CASOS) {
    ['facil', 'medio', 'dificil'].forEach((lv, i) => {
      const r = pt.check(cat, raw, lv);
      if (+r.ok !== exp[i]) { falhas++; console.log(`FALHOU  ${cat} | ${raw} | ${lv}: esperado ${exp[i] ? 'válida' : 'inválida'}, deu ${r.ok ? 'válida' : 'inválida (' + r.r + ')'}`); }
    });
  }
  console.log(CASOS.length * 3, 'verificações em', Date.now() - t1, 'ms');
  console.log(falhas ? falhas + ' falhas' : 'OK');
  assert.strictEqual(falhas, 0);
})().catch(e => { console.error(e); process.exit(1); });
