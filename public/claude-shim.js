// Imita window.claude.use('room') e use('sample') por cima do Socket.IO do nosso servidor,
// para o jogo correr fora da Claude sem mudar o código. Dentro da Claude (ou nos testes com mock)
// window.claude já existe e este ficheiro não faz nada.
(function () {
  if (window.claude && window.claude.use) return;
  if (typeof io !== 'function') return; // sem socket.io: o jogo mostra "Não foi possível ligar"

  let sid = null;
  try { sid = sessionStorage.getItem('stop-sid'); } catch (e) {}
  if (!sid) {
    const a = new Uint8Array(16); crypto.getRandomValues(a);
    sid = [...a].map(x => x.toString(16).padStart(2, '0')).join('');
    try { sessionStorage.setItem('stop-sid', sid); } catch (e) {}
  }

  const socket = io({ auth: { sid }, transports: ['websocket', 'polling'] });
  let ME = null, judgeOn = false;
  const ready = new Promise(res => socket.once('hello', h => { ME = h.peer; judgeOn = !!h.judge; res(); }));
  const handles = new Map(); // nome da sala -> estado

  const call = (ev, msg) => new Promise((res, rej) => {
    socket.timeout(10000).emit(ev, msg, (e, r) => {
      if (e) return rej({ code: 'timeout' });
      if (r && r.error) return rej({ code: r.error });
      res(r);
    });
  });

  function makeRoom(name) {
    const st = { name, mine: {}, list: [], cached: [], hs: [], errs: [], joined: false };
    const snap = () => {
      const now = Date.now();
      const arr = st.list.filter(p => p.peer !== ME).map(p => Object.freeze({ peer: p.peer, by: null, isMe: false, sameTab: false, kind: 'viewer', guest: false, presence: Object.freeze(p.presence || {}), updatedAt: p.updatedAt }));
      arr.unshift(Object.freeze({ peer: ME, by: null, isMe: true, sameTab: true, kind: 'viewer', guest: false, presence: Object.freeze({ ...st.mine }), updatedAt: now }));
      return arr;
    };
    const fire = () => { st.cached = snap(); st.hs.forEach(h => { try { h({ peers: st.cached, joined: [], left: [], updated: [] }); } catch (e) { console.error(e); } }); };
    st.fire = fire;
    const api = {
      name,
      presence: async patch => {
        const o = { ...st.mine };
        for (const k in patch) { if (patch[k] === null) delete o[k]; else o[k] = patch[k]; }
        if (new TextEncoder().encode(JSON.stringify(o)).length > 4096) throw { code: 'invalid_argument' };
        st.mine = o; fire();
        if (st.joined) await call('presence', { room: name, patch });
      },
      peers: () => st.cached,
      onPeers: (h, onErr) => {
        st.hs.push(h); if (onErr) st.errs.push(onErr);
        setTimeout(() => { st.cached = snap(); h({ peers: st.cached, joined: st.cached, left: [], updated: [] }); }, 0);
        return () => { st.hs = st.hs.filter(x => x !== h); };
      },
      leave: async () => { handles.delete(name); st.joined = false; await call('leave', { room: name }).catch(() => {}); },
      join: async n => openRoom(n),
      emit: async () => {}, on: () => () => {}, connected: () => socket.connected
    };
    st.api = api;
    return st;
  }

  async function openRoom(name) {
    await ready;
    const st = makeRoom(name);
    const r = await call('join', { room: name, presence: st.mine });
    st.list = r.peers || []; st.joined = true;
    handles.set(name, st);
    st.fire();
    return st.api;
  }

  socket.on('peers', m => { const st = handles.get(m && m.room); if (st) { st.list = m.peers || []; st.fire(); } });

  // Ao religar, voltar a entrar em todas as salas com a presence que tínhamos.
  socket.on('hello', async h => {
    const old = ME; ME = h.peer; judgeOn = !!h.judge;
    if (!old) return;
    for (const st of handles.values()) {
      try { const r = await call('join', { room: st.name, presence: st.mine }); st.list = r.peers || []; st.joined = true; st.fire(); } catch (e) {}
    }
  });
  socket.on('disconnect', () => { for (const st of handles.values()) st.joined = false; });

  // ---- juiz ----
  function parseJudgePrompt(p) {
    const m = /A letra desta ronda é "([A-Z])"/.exec(p);
    if (!m) return null;
    const items = [];
    const re = /^k=(\d+) \| categoria: ("(?:[^"\\]|\\.)*") \| resposta: ("(?:[^"\\]|\\.)*")$/gm;
    let x;
    while ((x = re.exec(p))) { try { items[+x[1]] = { c: JSON.parse(x[2]), raw: JSON.parse(x[3]) }; } catch (e) { return null; } }
    if (!items.length || items.some(i => !i)) return null;
    const lv = /Nível de exigência: (facil|medio|dificil)/.exec(p);
    const lg = /Língua do jogo: (pt|br|en|fr|it|es)/.exec(p);
    return { L: m[1], items, level: lv ? lv[1] : 'medio', lang: lg ? lg[1] : 'pt' };
  }
  function currentGameRoom() { for (const n of handles.keys()) if (n.startsWith('stop-')) return n; return null; }

  const sample = async (prompt) => {
    // O jogo só usa isto como "aquecimento" para pedir consentimento; aqui não é preciso.
    return { text: 'ok', truncated: false };
  };
  sample.json = async (prompt) => {
    const parsed = parseJudgePrompt(String(prompt || ''));
    if (!parsed) throw { code: 'invalid_argument' };
    const room = currentGameRoom();
    if (!room) throw { code: 'not_joined' };
    const r = await new Promise((res, rej) => {
      socket.timeout(20000).emit('judge', { room, L: parsed.L, items: parsed.items, level: parsed.level, lang: parsed.lang }, (e, r) => {
        if (e) return rej({ code: 'upstream_error' });
        if (r && r.error) return rej({ code: r.error });
        res(r);
      });
    });
    return r.out;
  };

  // Funções que só existem no nosso servidor (fora da Claude).
  window.stopServer = { quick: async (lang, size) => { await ready; return call('quick', { lang, size }); } };

  window.claude = {
    use: async n => {
      if (n === 'room') return openRoom('lobby');
      if (n === 'sample') { await ready; return judgeOn ? sample : null; }
      return null;
    }
  };
})();
