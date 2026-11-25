// Juiz por dicionário: valida as respostas do Stop! sem chamar nenhuma IA.
// - Categorias com lista (País, Cor, Animal, Fruto, Nome, Cidade): a resposta tem de estar na lista.
// - Categorias livres (Celebridade, Marca, Filme…): não se verifica, os jogadores decidem por votos.
// - Todas as outras: a palavra tem de existir no dicionário da língua do jogo.
// Níveis: 'dificil' = ortografia exacta (acentos incluídos); 'medio' = ignora acentos e cedilhas;
//         'facil' = ignora acentos e aceita 1 erro (2 em palavras com 8 letras ou mais).
// Línguas: pt (Angola/Portugal, aceita a grafia antes do Acordo), br, en, fr, it, es.
// Os motivos de rejeição são códigos (dict, pais, acentos…) que o jogo traduz.
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const LEVELS = ['facil', 'medio', 'dificil'];
const DATA = path.join(__dirname, 'data');
const NM = path.join(__dirname, 'node_modules', '@cspell');

const LANG_CFG = {
  pt: { tries: ['dict-pt-pt/dict/Portuguese-European.trie.gz'], data: ['pt'], intl: ['pt-PT', 'pt-BR', 'pt-AO'], preao: true },
  // pt-BR: dicionário europeu (o brasileiro gasta ~150 MB) + troca é/ê, ó/ô + palavras do Brasil
  br: { tries: ['dict-pt-pt/dict/Portuguese-European.trie.gz'], data: ['pt', 'br'], intl: ['pt-BR', 'pt-PT'], preao: true, accentSwap: true },
  en: { tries: ['dict-en_us/en_US.trie.gz', 'dict-en-gb/en_GB.trie.gz'], data: ['en'], intl: ['en', 'en-GB'] },
  fr: { tries: ['dict-fr-fr/fr-fr.trie.gz'], data: ['fr'], intl: ['fr'] },
  it: { tries: ['dict-it-it/dict/it-it.trie'], data: ['it'], intl: ['it'] },
  es: { tries: ['dict-es-es/Spanish.trie.gz'], data: ['es'], intl: ['es'] }
};
const LANG_CODES = Object.keys(LANG_CFG);

const strip = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
// forma exacta: minúsculas, acentos mantidos, hífens, apóstrofos e espaços equivalentes
const exactOf = s => String(s || '').normalize('NFC').toLowerCase().replace(/[\s\-–'’.]+/g, ' ').trim();
// forma solta: também sem acentos (œ → oe, æ → ae, ß → ss)
const looseOf = s => strip(exactOf(s)).replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/ß/g, 'ss');
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const capWords = s => s.split(' ').map(cap).join(' ');

// Nomes das categorias nas várias línguas (comparados sem acentos e em minúsculas).
const CAT_KIND = {};
const addKind = (kind, names) => names.split(',').forEach(n => { CAT_KIND[looseOf(n)] = kind; });
addKind('nome', 'nome,nomes,nome proprio,nome de pessoa,pessoa,name,names,first name,nom,prenom,prenoms,nombre,nombres,nome di persona');
addKind('pais', 'pais,paises,nacao,country,countries,nation,pays,paese,paesi,nazione');
addKind('cor', 'cor,cores,colour,colours,color,colors,couleur,couleurs,colore,colori,colores');
addKind('animal', 'animal,animais,bicho,bichos,animals,animaux,animale,animali,animales');
addKind('fruto', 'fruto,frutos,fruta,frutas,fruit,fruits,frutta,frutto,frutti');
addKind('cidade', 'cidade,cidades,capital,capitais,city,cities,town,ville,villes,citta,ciudad,ciudades,capitale,capitales');
// Categorias que nenhum dicionário cobre: os jogadores decidem por votos.
const FREE = new Set(('celebridade,famoso,famosa,famosos,cantor,cantora,artista,marca,filme,novela,serie,banda,musica,jogador,personagem,desenho,' +
  'bairro,clube,equipa,time,programa,carro,livro,escritor,actor,ator,actriz,atriz,politico,apelido,sobrenome,jogo,app,rua,escola,' +
  'celebrity,celebrities,famous,singer,band,brand,movie,film,show,series,song,player,footballer,character,cartoon,club,team,book,writer,actress,' +
  'car,game,street,school,neighbourhood,neighborhood,surname,' +
  'celebrite,celebrites,chanteur,chanteuse,groupe,marque,serie,chanson,joueur,personnage,dessin,equipe,livre,ecrivain,acteur,actrice,voiture,jeu,rue,ecole,quartier,nom de famille,' +
  'celebrita,cantante,gruppo,marchio,canzone,giocatore,personaggio,cartone,squadra,libro,scrittore,attore,attrice,macchina,auto,gioco,strada,scuola,quartiere,cognome,' +
  'celebridad,grupo,pelicula,cancion,personaje,dibujo,equipo,escritor,coche,juego,calle,escuela,barrio,apellido').split(','));

function kindOf(cat) {
  const k = looseOf(cat);
  if (CAT_KIND[k]) return CAT_KIND[k];
  const words = k.split(/[^a-z]+/).filter(Boolean);
  if (words.some(w => FREE.has(w)) || FREE.has(k)) return 'free';
  if (words.length > 1) for (const w of words) if (CAT_KIND[w]) return CAT_KIND[w]; // "Fruto tropical"
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

// Nomes de países a partir do Intl (todas as línguas, sem listas à mão).
const NOT_COUNTRY = new Set(['EU', 'EZ', 'UN', 'QO', 'XA', 'XB', 'ZZ', 'AQ', 'AC', 'CP', 'DG', 'EA', 'IC', 'TA', 'UM']);
function intlCountries(locales) {
  const out = [];
  for (const loc of locales) {
    let dn; try { dn = new Intl.DisplayNames([loc], { type: 'region' }); } catch (e) { continue; }
    for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b);
      if (NOT_COUNTRY.has(code)) continue;
      let name; try { name = dn.of(code); } catch (e) { continue; }
      if (!name || name === code) continue;
      // "Côte d’Ivoire (Costa do Marfim)", "Congo - Kinshasa", "Myanmar (Birmânia)"
      out.push(name);
      for (const part of name.split(/\s*[()]\s*|\s+-\s+|\s*,\s*/)) if (part.length > 2) out.push(part);
    }
  }
  return out;
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

const trieCache = new Map();
async function loadTrie(rel) {
  if (!trieCache.has(rel)) trieCache.set(rel, (async () => {
    const T = await import('cspell-trie-lib');
    const raw = fs.readFileSync(path.join(NM, rel));
    return T.decodeTrie(rel.endsWith('.gz') ? zlib.gunzipSync(raw).toString() : raw.toString());
  })());
  return trieCache.get(rel);
}

class Lang {
  constructor(code) { this.code = code; this.cfg = LANG_CFG[code]; }

  async load() {
    const cfg = this.cfg;
    this.tries = await Promise.all(cfg.tries.map(loadTrie));
    const list = name => cfg.data.flatMap(d => readList(d + '/' + name + '.txt'));
    this.extra = setPair(list('extra'));
    this.lists = {};
    for (const k of ['cor', 'animal', 'fruto', 'nome', 'cidade']) this.lists[k] = setPair(list(k));
    this.lists.pais = setPair([...list('pais'), ...intlCountries(cfg.intl)]);
    // grafia antes do Acordo: pares "antiga actual"
    this.preEx = new Map(); this.preLo = new Map(); this.preKeysEx = new Set(); this.preKeysLo = new Set();
    if (cfg.preao) for (const line of readList('pt/preao.txt')) {
      const [old, neu] = line.split(' '); if (!old || !neu || old === neu) continue;
      this.preEx.set(exactOf(old), exactOf(neu)); this.preLo.set(looseOf(old), looseOf(neu));
      let p = 0; while (p < neu.length && old[p] === neu[p]) p++;
      if (old.slice(0, p) + old.slice(p + 1) === neu && 'cp'.includes(old[p])) {
        this.preKeysEx.add(exactOf(old.slice(0, p + 2))); this.preKeysLo.add(looseOf(old.slice(0, p + 2)));
      }
    }
    return this;
  }

  has(w) { return this.tries.some(t => t.has(w)); }

  // formas actuais possíveis de uma palavra escrita com a grafia antiga (só pt/br)
  preao(w, loose) {
    if (!this.cfg.preao) return [];
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
  // variantes de acentuação (Brasil ↔ Portugal): bebê/bebé, ônibus/ónibus, tênis/ténis
  variants(w) {
    const out = [w];
    if (this.cfg.accentSwap) {
      const a = w.replace(/ê/g, 'é').replace(/ô/g, 'ó'), b = w.replace(/é/g, 'ê').replace(/ó/g, 'ô');
      if (a !== w) out.push(a); if (b !== w) out.push(b);
    }
    return out;
  }

  // ---- dicionário geral ----
  dictEx(w) {
    if (this.extra.ex.has(w)) return true;
    const h = w.replace(/ /g, '-'), a = w.replace(/ /g, "'");
    for (const v of [w, h, a]) if (this.has(v) || this.has(cap(v)) || this.has(v.toUpperCase())) return true;
    const parts = w.split(' ');
    return parts.length > 1 && parts.every(p => p.length < 3 || this.dictEx(p));
  }
  dictLo(k) {
    if (this.extra.lo.has(k)) return true;
    const h = k.replace(/ /g, '-'), a = k.replace(/ /g, "'");
    for (const v of [k, h, a]) if (this.has(v) || this.has('~' + v)) return true;
    const parts = k.split(' ');
    return parts.length > 1 && parts.every(p => p.length < 3 || this.dictLo(p));
  }
  dictNear(k, max) {
    for (const w of this.extra.lo) if (w[0] === k[0] && within(k, w, max)) return true;
    for (const t of this.tries) for (const word of [k, k.replace(/ /g, '-')]) {
      const s = t.suggestWithCost(word, { numSuggestions: 5, changeLimit: max, ignoreCase: true });
      if (s.some(x => { const v = looseOf(x.word.replace(/^~/, '')); return v[0] === k[0] && within(k, v, max); })) return true;
    }
    const parts = k.split(' ');
    return parts.length > 1 && parts.every(p => p.length < 3 || this.dictLo(p) || this.dictNear(p, maxErrors(p)));
  }

  // ---- listas (com plurais simples) ----
  listHas(set, w) {
    if (set.has(w)) return true;
    const tries = [];
    if (w.endsWith('s')) tries.push(w.slice(0, -1));
    if (w.endsWith('es')) tries.push(w.slice(0, -2));
    if (w.endsWith('x')) tries.push(w.slice(0, -1));
    const PL = {
      pt: [['ões', 'ão'], ['oes', 'ao'], ['ães', 'ão'], ['aes', 'ao'], ['ais', 'al'], ['eis', 'el']],
      en: [['ies', 'y'], ['ves', 'f']], fr: [['aux', 'al']], it: [['i', 'o'], ['i', 'e'], ['e', 'a'], ['he', 'a']], es: [['ces', 'z']]
    }[this.code === 'br' ? 'pt' : this.code] || [];
    for (const [a, b] of PL) if (w.endsWith(a)) tries.push(w.slice(0, -a.length) + b);
    return tries.some(x => set.has(x));
  }
  listNear(set, k, max) { for (const w of set) if (w[0] === k[0] && within(k, w, max)) return true; return false; }
  // nome próprio conhecido pelo dicionário (com maiúscula)
  proper(w) { const c = capWords(w); return this.has(c) || this.has(c.replace(/ /g, '-')); }

  fns(kind) {
    if (kind === 'dict') return { ex: w => this.dictEx(w), lo: k => this.dictLo(k), near: (k, m) => this.dictNear(k, m) };
    const L = this.lists[kind];
    if (kind === 'nome' || kind === 'cidade') {
      // nome composto (Maria José, Porto Alegre): o todo, ou cada parte conhecida
      const one = w => this.listHas(L.ex, w) || this.proper(w);
      const ex = w => one(w) || (kind === 'nome' && w.includes(' ') && w.split(' ').every(p => p.length < 3 || one(p)));
      const lo = k => this.listHas(L.lo, k) || (kind === 'nome' && k.includes(' ') && k.split(' ').every(p => p.length < 3 || this.listHas(L.lo, p)));
      return { ex, lo, near: (k, m) => this.listNear(L.lo, k, m) };
    }
    return { ex: w => this.listHas(L.ex, w), lo: k => this.listHas(L.lo, k), near: (k, m) => this.listNear(L.lo, k, m) };
  }

  // Devolve {ok, r} — r é o código do motivo quando ok é false.
  check(cat, raw, level) {
    if (!LEVELS.includes(level)) level = 'medio';
    const kind = kindOf(cat);
    if (kind === 'free') return { ok: true, r: '' };
    const w = exactOf(raw), k = looseOf(raw);
    if (!k.replace(/[^a-z]/g, '')) return { ok: false, r: 'vazia' };
    const f = this.fns(kind);
    const ex = x => this.variants(x).some(v => f.ex(v) || this.preao(v, false).some(f.ex));
    const lo = x => f.lo(x) || this.preao(x, true).some(f.lo);
    if (ex(w)) return { ok: true, r: '' };
    const max = maxErrors(k);
    if (level === 'dificil') {
      if (lo(k)) return { ok: false, r: 'acentos' };
      if (max && f.near(k, max)) return { ok: false, r: 'ortografia' };
      return { ok: false, r: kind };
    }
    if (lo(k)) return { ok: true, r: '' };
    if (max && f.near(k, max)) return level === 'facil' ? { ok: true, r: '' } : { ok: false, r: 'ortografia' };
    return { ok: false, r: kind };
  }
}

const langs = new Map();
async function loadLang(code = 'pt') {
  if (!LANG_CFG[code]) code = 'pt';
  if (!langs.has(code)) langs.set(code, new Lang(code).load());
  return langs.get(code);
}

module.exports = { loadLang, kindOf, LEVELS, LANG_CODES, exactOf, looseOf, within };
