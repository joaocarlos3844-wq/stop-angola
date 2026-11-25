// Stop! — servidor para jogar fora da Claude.
// Serve a página, implementa as salas em tempo real (mesmo modelo do window.claude 'room')
// e o juiz por dicionário (dict.js), que valida as respostas aqui no servidor.
'use strict';
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const PORT = +process.env.PORT || 3000;
const PRESENCE_MAX = 4096;          // igual ao limite da Claude
const ROOM_MAX_PEERS = 16;          // 10 jogadores + folga para quem recarrega
const LOBBY_LIST_MAX = 40;          // jogos mostrados em "Jogos abertos"
const ROOM_RE = /^(lobby|stop-[a-z0-9]{3,8})$/;
const PUB_MAX = 8;                  // jogadores por sala pública

// Caracteres de controlo e invisíveis (escritos como escapes ASCII de propósito).
const CTRL_RE = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f\\u00ad\\u200b-\\u200f\\u2028-\\u202e\\u2060-\\u206f\\ufeff]', 'g');

// Juiz por dicionário (ver dict.js). O servidor só começa a aceitar ligações depois de o carregar.
const { loadLang, LEVELS } = require('./dict');
let dict = null;

/* ================= HTTP ================= */
const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'no-referrer');
  next();
});
const ROOT = __dirname;
app.get(['/', '/index.html'], (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.sendFile(path.join(ROOT, 'index.html'));
});
app.use(express.static(path.join(ROOT, 'public'), { maxAge: '1h', index: false }));
app.get('/healthz', (req, res) => res.json({ ok: true, judge: !!dict }));

const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 64 * 1024, pingInterval: 20000, pingTimeout: 20000 });

/* ================= salas ================= */
// rooms: nome -> Map(peer -> {presence, updatedAt})
const rooms = new Map();
const livePeers = new Map(); // peer -> socket.id
const pending = new Set();
function bucket(rate, burst) { return { t: burst, last: Date.now(), rate, burst }; }
function take(b, n = 1) {
  const now = Date.now();
  b.t = Math.min(b.burst, b.t + (now - b.last) / 1000 * b.rate); b.last = now;
  if (b.t < n) return false; b.t -= n; return true;
}
function size(o) { return Buffer.byteLength(JSON.stringify(o), 'utf8'); }

function listFor(name) {
  const r = rooms.get(name); if (!r) return [];
  let arr = [...r.entries()].map(([peer, v]) => ({ peer, presence: v.presence, updatedAt: v.updatedAt }));
  if (name === 'lobby') {
    // No lobby só interessam os anfitriões (cada cliente junta-se a si próprio).
    arr = arr.filter(p => p.presence && p.presence.hosting).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, LOBBY_LIST_MAX);
  }
  return arr;
}
function schedule(name) {
  if (pending.has(name)) return;
  pending.add(name);
  setTimeout(() => {
    pending.delete(name);
    io.to(name).emit('peers', { room: name, peers: listFor(name) });
  }, name === 'lobby' ? 250 : 15);
}
function removeFromRoom(name, peer) {
  const r = rooms.get(name); if (!r) return;
  if (r.delete(peer)) { if (!r.size) rooms.delete(name); schedule(name); }
}

io.on('connection', socket => {
  // Identidade estável por separador: o cliente guarda um segredo (sid) e volta a usá-lo ao religar.
  const sid = typeof socket.handshake.auth?.sid === 'string' ? socket.handshake.auth.sid.slice(0, 64) : '';
  let peer = sid.length >= 16 ? 'p' + crypto.createHash('sha256').update(sid).digest('hex').slice(0, 14) : '';
  if (!peer || (livePeers.has(peer) && io.sockets.sockets.get(livePeers.get(peer))?.connected)) {
    peer = 'p' + crypto.randomBytes(7).toString('hex');
  }
  livePeers.set(peer, socket.id);
  const mine = new Set();
  const presB = bucket(15, 40), joinB = bucket(0.5, 10), judgeB = bucket(0.5, 5);
  socket.emit('hello', { peer, judge: !!dict });

  socket.on('join', (msg, ack) => {
    if (typeof ack !== 'function') return;
    const name = String(msg && msg.room || '');
    if (!ROOM_RE.test(name)) return ack({ error: 'invalid_argument' });
    if (!take(joinB)) return ack({ error: 'rate_limited' });
    if (!mine.has(name) && mine.size >= 3) return ack({ error: 'too_many_rooms' });
    let r = rooms.get(name);
    if (!r) { r = new Map(); rooms.set(name, r); }
    if (!r.has(peer) && name !== 'lobby' && r.size >= ROOM_MAX_PEERS) return ack({ error: 'room_full' });
    let presence = msg && msg.presence && typeof msg.presence === 'object' ? msg.presence : {};
    if (size(presence) > PRESENCE_MAX) presence = {};
    r.set(peer, { presence, updatedAt: Date.now() });
    mine.add(name); socket.join(name); schedule(name);
    ack({ ok: true, peers: listFor(name) });
  });

  socket.on('presence', (msg, ack) => {
    const done = typeof ack === 'function' ? ack : () => {};
    const name = String(msg && msg.room || '');
    const r = rooms.get(name);
    if (!mine.has(name) || !r || !r.has(peer)) return done({ error: 'not_joined' });
    if (!take(presB)) return done({ error: 'rate_limited' });
    const patch = msg && msg.patch;
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return done({ error: 'invalid_argument' });
    const cur = { ...r.get(peer).presence };
    for (const k of Object.keys(patch).slice(0, 20)) { if (patch[k] === null) delete cur[k]; else cur[k] = patch[k]; }
    if (size(cur) > PRESENCE_MAX) return done({ error: 'invalid_argument' });
    r.set(peer, { presence: cur, updatedAt: Date.now() });
    schedule(name);
    done({ ok: true });
  });

  socket.on('leave', (msg, ack) => {
    const name = String(msg && msg.room || '');
    if (mine.delete(name)) { socket.leave(name); removeFromRoom(name, peer); }
    if (typeof ack === 'function') ack({ ok: true });
  });

  // "Jogar agora": escolhe uma sala pública com lugar ou cria uma nova (quem a cria é o anfitrião).
  socket.on('quick', (msg, ack) => {
    if (typeof ack !== 'function') return;
    if (!take(joinB)) return ack({ error: 'rate_limited' });
    ack(quickMatch());
  });

  socket.on('judge', async (msg, ack) => {
    if (typeof ack !== 'function') return;
    try {
      const out = await judge(socket, peer, mine, judgeB, msg);
      ack({ ok: true, out });
    } catch (e) {
      ack({ error: e && e.code || 'upstream_error' });
    }
  });

  socket.on('disconnect', () => {
    for (const name of mine) removeFromRoom(name, peer);
    mine.clear();
    if (livePeers.get(peer) === socket.id) livePeers.delete(peer);
  });
});

/* ================= salas públicas ================= */
const reserved = new Map(); // código -> {t, n}: salas acabadas de criar, ainda sem jogo publicado
function publicGame(name) {
  const r = rooms.get(name); if (!r) return null;
  for (const v of r.values()) { const g = v.presence && v.presence.game; if (g && g.pub) return g; }
  return null;
}
function newCode() {
  const a = 'abcdefghjkmnpqrstuvwxyz23456789'; let c;
  do { c = ''; for (let i = 0; i < 4; i++) c += a[crypto.randomInt(a.length)]; } while (rooms.has('stop-' + c) || reserved.has(c));
  return c;
}
function quickMatch() {
  const now = Date.now();
  let best = null, bestScore = -1;
  for (const name of rooms.keys()) {
    if (!name.startsWith('stop-')) continue;
    const g = publicGame(name); if (!g) continue;
    const np = Array.isArray(g.ro) ? g.ro.length : 0, mr = +g.mr || 0, done = Array.isArray(g.hist) ? g.hist.length : 0;
    if (np >= PUB_MAX || g.ph === 'final' || (mr && done >= mr - 1)) continue;
    const score = (g.ph === 'lobby' ? 100 : 0) + np; // primeiro as salas à espera, as mais cheias primeiro
    if (score > bestScore) { best = name.slice(5); bestScore = score; }
  }
  for (const [c, v] of reserved) {
    if (now - v.t > 20000 || publicGame('stop-' + c)) { reserved.delete(c); continue; }
    if (v.n < PUB_MAX && 100 + v.n > bestScore) { best = c; bestScore = 100 + v.n; }
  }
  if (best) { const v = reserved.get(best); if (v) v.n++; return { ok: true, code: best, host: false }; }
  const code = newCode();
  reserved.set(code, { t: now, n: 1 });
  return { ok: true, code, host: true };
}

/* ================= juiz (dicionário) ================= */
const err = code => Object.assign(new Error(code), { code });
const cleanStr = (s, n) => String(s == null ? '' : s).replace(CTRL_RE, '').replace(/\s+/g, ' ').trim().slice(0, n);
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

async function judge(socket, peer, mine, b, msg) {
  if (!dict) throw err('not_granted');
  const name = String(msg && msg.room || '');
  const r = rooms.get(name);
  // Só o anfitrião de um jogo (quem publica 'game' na sala) pode pedir o juiz.
  if (!name.startsWith('stop-') || !mine.has(name) || !r || !r.get(peer)?.presence?.game) throw err('not_granted');
  const L = String(msg.L || '');
  if (L.length !== 1 || !LETTERS.includes(L)) throw err('invalid_argument');
  if (!Array.isArray(msg.items) || !msg.items.length || msg.items.length > 100) throw err('invalid_argument');
  const items = msg.items.map(it => ({ c: cleanStr(it && it.c, 20), raw: cleanStr(it && it.raw, 22) }));
  if (items.some(it => !it.c || !it.raw)) throw err('invalid_argument');
  const level = LEVELS.includes(msg.level) ? msg.level : 'medio';
  if (!take(b)) throw err('rate_limited');
  return items.map((it, k) => {
    const v = dict.check(it.c, it.raw, level);
    return { k, ok: v.ok, r: v.r };
  });
}

loadLang('pt')
  .then(d => { dict = d; })
  .catch(e => console.error('Erro a carregar o dicionário (o juiz fica desligado):', e))
  .finally(() => server.listen(PORT, () => {
    console.log(`Stop! a correr em http://localhost:${PORT} · juiz: ${dict ? 'dicionário' : 'desligado'}`);
  }));
