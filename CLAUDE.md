# Stop! — o jogo das letras (Angola)

Jogo multijogador de "Stop" (Adedonha) para telemóvel. Cada jogador joga no seu telemóvel, um STOP pára todos e há um juiz automático (Claude) mais votação. Toda a interface está em **português de Angola** ("telemóvel", "objecto", "facto"), e deve continuar assim.

## Estado actual

- `index.html` é a app inteira (HTML + CSS + JS num só ficheiro, sem build). Foi publicada como artifact na Claude e depende de duas capacidades que só existem dentro da Claude:
  - `await window.claude.use('room')`: salas em tempo real (presence + peers).
  - `await window.claude.use('sample')`: pedidos à Claude, usados pelo juiz (`sampleFn.json(prompt, {modelTier:'default', effort:'low'})`).
- Os testes usam `tests/mock-claude.js`, que imita as duas APIs com BroadcastChannel (vários separadores = vários telemóveis), e `tests/test_ronda.py`, que joga uma ronda completa com Playwright e 3 jogadores.

## Como funciona o código

- **Protocolo só com presence** (`room.join('stop-<codigo>')`, `presence(patch)`, `peers()`, `onPeers(fn)`, `leave()`). Cada peer publica `{name, ans, an, f, stop, pick, vt}`. O anfitrião publica também `game` (o estado autoritativo `G`) e, no lobby, `hosting:{code,name,ph,np}` para a lista "Jogos abertos". O limite da presence é de 4 KiB, por isso `publishGame()` encurta as respostas e os motivos se for preciso.
- **O anfitrião manda** (`isHost`): `hostTick()` sincroniza o roster (até 10 jogadores, religa por nome quando alguém recarrega a página), aceita a letra do jogador da vez, detecta o `stop` e recolhe as respostas 2,5 s depois (`compile()`).
- **Fases** (`G.ph`): `lobby → pick → play → stop → review → scores → final`. `G.n` nunca volta a zero (os campos `stop`/`pick`/`vt` vêm marcados com `n`). O número da ronda mostrado é `G.hist.length+1`.
- **Pontos** (`score(g, votesMap(g))`): 10 para resposta única, 5 para repetida, 0 se vazia, se não começa pela letra (os acentos não contam, ver `norm()`), se o juiz a anulou (`G.jz[i][c]==='0'`) ou se foi invertida por votos.
- **Votação**: um jogador contesta respostas dos outros (`vt.k = ["i.c", ...]`). Com o juiz activo é preciso `max(2, maioria dos outros presentes)`; sem juiz basta a maioria. Nas próprias respostas não se vota.
- **Juiz** (`runJudge()`): corre só no dispositivo do anfitrião. Deduplica (categoria + resposta) e envia uma única prompt JSON. O pedido de "aquecimento" em `hostStart()` faz a Claude pedir o consentimento no clique.
- O render usa uma `key` por ecrã para não redesenhar (nem perder o foco) enquanto se escreve.

## Versão pública (fora da Claude): feita

- `server.js` (Express + Socket.IO): serve `index.html` e `public/` e implementa as salas com o mesmo modelo de `room`. Cada separador guarda um `sid` secreto em `sessionStorage`, e o servidor deriva dele o `peer`, por isso o id mantém-se ao religar. No `lobby` o servidor só envia os peers com `hosting` (no máximo 40). Presence até 4 KiB, salas até 16 peers, limites de ritmo por socket.
- `public/claude-shim.js`: define `window.claude.use('room'|'sample')` só se ainda não existir (dentro da Claude e nos testes com mock não faz nada). O `sample.json()` extrai a letra e os itens da prompt do jogo e envia-os pelo evento de socket `judge`. Não há `POST /api/judge`, porque o socket já identifica a sala e o anfitrião.
- Juiz: o servidor volta a montar a prompt (o cliente não pode enviar uma prompt qualquer) e só aceita pedidos do anfitrião (o peer que publica `game`), com pelo menos 5 s entre pedidos, 40 por hora por sala e `MAX_JUDGE_PER_DAY` no total. Modelo `claude-opus-5-5` (ou `ANTHROPIC_MODEL`), effort `low`, com `fallbacks: "default"` em caso de recusa. Sem `ANTHROPIC_API_KEY` o juiz fica desligado e decide-se por votos.
- PWA: `public/manifest.webmanifest`, ícones e `sw.js` (rede primeiro; só é registado em https).
- Alojamento: `render.yaml` (Render, plano free). Variáveis: `ANTHROPIC_API_KEY` (secreta) e `MAX_JUDGE_PER_DAY`.

## Testes

```bash
npm install
pip install playwright && python -m playwright install chromium
python tests/test_servidor.py      # servidor real + 3 browsers, juiz falso (STOP_FAKE_JUDGE=1)
python -m http.server 8765         # noutro terminal, para o teste com mock:
python tests/test_ronda.py
# resultado esperado nos dois: Carla 30, Ana 25, João 5
```

`STOP_URL=https://<app>.onrender.com python tests/test_servidor.py` joga contra o servidor publicado (com o juiz verdadeiro, os pontos podem variar).

Nota: ao escrever ficheiros com ferramentas, os escapes unicode nas regex (barra + u + 4 dígitos) podem ficar como caracteres literais, e o U+2028 parte a linha. Confirmar sempre com `node --check`.
