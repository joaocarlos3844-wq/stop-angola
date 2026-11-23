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

## Próximo passo pedido pelo utilizador: correr fora da Claude

Objectivo: qualquer pessoa joga por um link, sem conta Claude.

1. `server.js` (Node + Express + Socket.IO): serve `index.html` e implementa salas com o **mesmo modelo** de `room` (join por nome, presence por socket, lista de peers com `peer`, `isMe`, `sameTab`, `presence`; remover o peer ao desligar).
2. `public/claude-shim.js`: define `window.claude.use('room')` e `use('sample')` por cima do Socket.IO e de um endpoint `POST /api/judge`, para o código do jogo ficar praticamente igual. Carregá-lo antes do script principal.
3. `/api/judge` chama a API da Anthropic no servidor, com a chave em `ANTHROPIC_API_KEY` (nunca na página). Deve validar e limitar o tamanho da prompt e o ritmo de pedidos por sala.
4. Alojar num serviço Node (Render, Railway ou Fly.io) e, opcionalmente, transformar em PWA (manifest + ícone) para "instalar" no telemóvel.
5. Manter os testes: adaptar `tests/test_ronda.py` para correr contra o servidor real com 3 browsers.

## Testar agora (versão com mock)

```bash
python3 -m http.server 8765        # na pasta do projecto
pip install playwright && playwright install chromium
python3 tests/test_ronda.py        # resultado esperado: Carla 30, Ana 25, João 5
```
