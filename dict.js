// Juiz por dicionário: valida as respostas do Stop! sem chamar nenhuma IA.
// - Categorias com lista (País, Cor, Animal, Fruto, Nome, Cidade): a resposta tem de estar na lista.
// - Categorias livres (Celebridade, Marca, Filme…): não se verifica, os jogadores decidem por votos.
// - Todas as outras: a palavra tem de existir no dicionário.
// Níveis: 'dificil' = ortografia exacta (acentos incluídos); 'medio' = ignora acentos e cedilhas;
//         'facil' = ignora acentos e aceita 1 erro (2 em palavras com 8 letras ou mais).
// A grafia anterior ao Acordo Ortográfico (objecto, acção, director) é sempre aceite.
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const LEVELS = ['facil', 'medio', 'dificil'];
const DATA = path.join(__dirname, 'data');

const strip = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
// forma exacta: minúsculas, acentos mantidos, hífens e espaços equivalentes
const exactOf = s => String(s || '').normalize('NFC').toLocaleLowerCase('pt').replace(/[\s\-–'’.]+/g, ' ').trim();
// forma solta: também sem acentos
const looseOf = s => strip(exactOf(s));
const cap = s => s.charAt(0).toLocaleUpperCase('pt') + s.slice(1);

const CAT_KIND = {
  nome: 'nome', 'nome proprio': 'nome', 'nome de pessoa': 'nome', nomes: 'nome', pessoa: 'nome',
  pais: 'pais', paises: 'pais',
  cor: 'cor', cores: 'cor',
  animal: 'animal', animais: 'animal', bicho: 'animal', bichos: 'animal',
  fruto: 'fruto', frutos: 'fruto', fruta: 'fruto', frutas: 'fruto',
  cidade: 'cidade', cidades: 'cidade', capital: 'cidade', capitais: 'cidade', 'cidade / pais': 'cidade'
};
// Categorias que nenhum dicionário cobre: os jogadores decidem por votos.
const FREE = ['celebridade', 'famoso', 'famosa', 'cantor', 'cantora', 'artista', 'marca', 'filme', 'novela', 'serie',
  'banda', 'musica', 'jogador', 'personagem', 'desenho', 'bairro', 'clube', 'equipa', 'time', 'programa', 'carro',
  'livro', 'escritor', 'actor', 'ator', 'actriz', 'atriz', 'politico', 'apelido', 'sobrenome', 'jogo', 'app', 'rua', 'escola'];

const REASON = {
  dict: 'não existe no dicionário', pais: 'não é um país da lista', cor: 'não é uma cor conhecida',
  animal: 'não é um animal da lista', fruto: 'não é um fruto da lista', nome: 'nome desconhecido', cidade: 'cidade desconhecida'
};

function kindOf(cat) {
  const k = looseOf(cat);
  if (CAT_KIND[k]) return CAT_KIND[k];
  if (FREE.some(f => k.split(/[^a-z]+/).includes(f))) return 'free';
  return 'dict';
}

function readList(file) {
  const p = path.join(DATA, file);
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf8').split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
}
function setPair(words) {
  const ex = new Set(), lo = new Set();
  for (const w of words) { ex.add(exactOf(w)); lo.add(looseOf(w)); }
  return { ex, lo };
}

// Distância de edição com limite (Damerau simplificado). Devolve true se d(a,b) <= max.
function within(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev2 = null, prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let best = i;
    for (let j = 1; j <= b.length; j++) {
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur.push(v); if (v < best) best = v;
    }
    if (best > max) return false;
    prev2 = prev; prev = cur;
  }
  return prev[b.length] <= max;
}
const maxErrors = k => { const n = k.replace(/ /g, '').length; return n >= 8 ? 2 : n >= 4 ? 1 : 0; };

class Lang {
  constructor(code) { this.code = code; }

  async load() {
    const T = await import('cspell-trie-lib');
    const gz = path.join(__dirname, 'node_modules', '@cspell', 'dict-pt-pt', 'dict', 'Portuguese-European.trie.gz');
    this.trie = T.decodeTrie(zlib.gunzipSync(fs.readFileSync(gz)).toString());
    // nomes próprios que o dicionário já conhece (Ana, Luanda, Felismina…)
    this.proper = new Set(), this.properEx = new Set();
    for (const w of this.trie.words()) if (/^[A-ZÀ-Ý]/.test(w)) { this.proper.add(looseOf(w)); this.properEx.add(exactOf(w)); }
    const dir = this.code;
    this.extra = setPair(readList(dir + '/extra.txt'));
    this.lists = {};
    for (const k of ['pais', 'cor', 'animal', 'fruto', 'nome', 'cidade']) this.lists[k] = setPair(readList(dir + '/' + k + '.txt'));
    this.lists.nome.ex.forEach(w => this.properEx.add(w)); this.lists.nome.lo.forEach(w => this.proper.add(w));
    this.lists.cidade.ex.forEach(w => this.properEx.add(w)); this.lists.cidade.lo.forEach(w => this.proper.add(w));
    // grafia antes do Acordo: pares "antiga actual"
    this.preEx = new Map(); this.preLo = new Map(); this.preKeysEx = new Set(); this.preKeysLo = new Set();
    for (const line of readList(dir + '/preao.txt')) {
      const [old, neu] = line.split(' '); if (!old || !neu || old === neu) continue;
      this.preEx.set(exactOf(old), exactOf(neu)); this.preLo.set(looseOf(old), looseOf(neu));
      let p = 0; while (p < neu.length && old[p] === neu[p]) p++;
      if (old.slice(0, p) + old.slice(p + 1) === neu && 'cp'.includes(old[p])) {
        this.preKeysEx.add(exactOf(old.slice(0, p + 2))); this.preKeysLo.add(looseOf(old.slice(0, p + 2)));
      }
    }
    return this;
  }

  // formas actuais possíveis de uma palavra escrita com a grafia antiga
  preao(w, loose) {
    const map = loose ? this.preLo : this.preEx, keys = loose ? this.preKeysLo : this.preKeysEx, out = [];
    if (map.has(w)) out.push(map.get(w));
    const del = (s, depth) => {
      for (let i = 1; i < s.length - 1; i++) {
        if (!'cp'.includes(s[i]) || !keys.has(s.slice(0, i + 2))) continue;
        const c = s.slice(0, i) + s.slice(i + 1); out.push(c); if (depth) del(c, depth - 1);
      }
    };
    del(w, 1);
    return out;
  }

  // ---- dicionário geral ----
  dictEx(w) {
    if (this.extra.ex.has(w)) return true;
    const t = this.trie, h = w.replace(/ /g, '-');
    if (t.has(w) || t.has(h) || t.has(cap(w)) || t.has(cap(h))) return true;
    const parts = w.split(' ');
    return parts.length > 1 && parts.every(p => p.length < 2 || this.dictEx(p));
  }
  dictLo(k) {
    if (this.extra.lo.has(k)) return true;
    const t = this.trie, h = k.replace(/ /g, '-');
    if (t.has(k) || t.has('~' + k) || t.has(h) || t.has('~' + h)) return true;
    const parts = k.split(' ');
    return parts.length > 1 && parts.every(p => p.length < 2 || this.dictLo(p));
  }
  dictNear(k, max) {
    if ([...this.extra.lo].some(w => w[0] === k[0] && within(k, w, max))) return true;
    for (const word of [k, k.replace(/ /g, '-')]) {
      const s = this.trie.suggestWithCost(word, { numSuggestions: 5, changeLimit: max, ignoreCase: true });
      if (s.some(x => { const v = looseOf(x.word.replace(/^~/, '')); return v[0] === k[0] && within(k, v, max); })) return true;
    }
    const parts = k.split(' ');
    return parts.length > 1 && parts.every(p => p.length < 2 || this.dictLo(p) || this.dictNear(p, maxErrors(p)));
  }

  // ---- listas (com plural simples) ----
  listHas(set, w) {
    if (set.has(w)) return true;
    if (w.endsWith('s') && set.has(w.slice(0, -1))) return true;
    if (w.endsWith('es') && set.has(w.slice(0, -2))) return true;
    if (w.endsWith('oes') && set.has(w.slice(0, -3) + 'ao')) return true;
    if (w.endsWith('ões') && set.has(w.slice(0, -3) + 'ão')) return true;
    if (w.endsWith('ães') && set.has(w.slice(0, -3) + 'ão')) return true; // cães, pães
    if (w.endsWith('aes') && set.has(w.slice(0, -3) + 'ao')) return true;
    if (w.endsWith('ais') && set.has(w.slice(0, -3) + 'al')) return true; // animais
    if (w.endsWith('eis') && set.has(w.slice(0, -3) + 'el')) return true; // papéis
    return false;
  }
  listNear(set, k, max) { for (const w of set) if (w[0] === k[0] && within(k, w, max)) return true; return false; }

  fns(kind) {
    if (kind === 'dict') return { ex: w => this.dictEx(w), lo: k => this.dictLo(k), near: (k, m) => this.dictNear(k, m) };
    if (kind === 'nome' || kind === 'cidade') {
      // nome composto (Maria José, Porto Alegre): cada parte tem de ser conhecida, ou o todo
      const L = this.lists[kind];
      const ex = w => this.listHas(L.ex, w) || this.properEx.has(w) || (kind === 'nome' && w.includes(' ') && w.split(' ').every(p => p.length < 3 || this.properEx.has(p)));
      const lo = k => this.listHas(L.lo, k) || this.proper.has(k) || (kind === 'nome' && k.includes(' ') && k.split(' ').every(p => p.length < 3 || this.proper.has(p)));
      return { ex, lo, near: (k, m) => this.listNear(L.lo, k, m) || this.listNear(this.proper, k, m) };
    }
    const L = this.lists[kind];
    return { ex: w => this.listHas(L.ex, w), lo: k => this.listHas(L.lo, k), near: (k, m) => this.listNear(L.lo, k, m) };
  }

  // Devolve {ok, r} — r é o motivo (curto) quando ok é false.
  check(cat, raw, level) {
    if (!LEVELS.includes(level)) level = 'medio';
    const kind = kindOf(cat);
    if (kind === 'free') return { ok: true, r: '' };
    const w = exactOf(raw), k = looseOf(raw);
    if (!k.replace(/[^a-z]/g, '')) return { ok: false, r: 'resposta vazia' };
    const f = this.fns(kind);
    const ex = x => f.ex(x) || this.preao(x, false).some(f.ex);
    const lo = x => f.lo(x) || this.preao(x, true).some(f.lo);
    if (ex(w)) return { ok: true, r: '' };
    const max = maxErrors(k);
    if (level === 'dificil') {
      if (lo(k)) return { ok: false, r: 'erro nos acentos' };
      if (max && f.near(k, max)) return { ok: false, r: 'erro de ortografia' };
      return { ok: false, r: REASON[kind] };
    }
    if (lo(k)) return { ok: true, r: '' };
    if (max && f.near(k, max)) return level === 'facil' ? { ok: true, r: '' } : { ok: false, r: 'erro de ortografia' };
    return { ok: false, r: REASON[kind] };
  }
}

const langs = new Map();
async function loadLang(code = 'pt') {
  if (!langs.has(code)) langs.set(code, new Lang(code).load());
  return langs.get(code);
}

module.exports = { loadLang, kindOf, LEVELS, exactOf, looseOf, within };
