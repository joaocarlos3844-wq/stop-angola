# Stop! — o jogo das letras (Angola)

Jogo multijogador de "Stop" (Adedonha) para telemóvel. Cada jogador joga no seu telemóvel, um STOP pára todos e há um juiz automático (dicionário no servidor; dentro da Claude, a Claude) mais votação. A interface base está em **português de Angola** ("telemóvel", "objecto", "facto") e deve continuar assim; há também português do Brasil, inglês, francês, italiano e espanhol.

## Estado actual

- `index.html` é a app inteira (HTML + CSS + JS num só ficheiro, sem build). Foi publicada como artifact na Claude e depende de duas capacidades que só existem dentro da Claude:
  - `await window.claude.use('room')`: salas em tempo real (presence + peers).
  - `await window.claude.use('sample')`: pedidos à Claude, usados pelo juiz (`sampleFn.json(prompt, {modelTier:'default', effort:'low'})`).
- Os testes usam `tests/mock-claude.js`, que imita as duas APIs com BroadcastChannel (vários separadores = vários telemóveis), e `tests/test_ronda.py`, que joga uma ronda completa com Playwright e 3 jogadores.

## Como funciona o código

- **Protocolo só com presence** (`room.join('stop-<codigo>')`, `presence(patch)`, `peers()`, `onPeers(fn)`, `leave()`). Cada peer publica `{name, ans, an, f, stop, pick, vt}`. O anfitrião publica também `game` (o estado autoritativo `G`) e, no lobby, `hosting:{code,name,ph,np}` para a lista "Jogos abertos". O limite da presence é de 4 KiB, por isso `publishGame()` encurta as respostas e os motivos se for preciso.
- **O anfitrião manda** (`isHost`): `hostTick()` sincroniza o roster (até 10 jogadores, religa por nome quando alguém recarrega a página), aceita a letra do jogador da vez, detecta o `stop` e recolhe as respostas 2,5 s depois (`compile()`).
- **Fases** (`G.ph`): `lobby → pick → play → stop → review → scores → final`. `G.n` nunca volta a zero (os campos `stop`/`pick`/`vt` vêm marcados com `n`). O número da ronda mostrado é `G.hist.length+1`.
- **Pontos** (`score(g, votesMap(g))`): 10 para resposta única, 5 para repetida, 0 se vazia, se não começa pela letra (os acentos não contam, ver `norm()`), se o juiz a anulou (`G.jz[i][c]==='0'`) ou se foi invertida por votos. Metade dos pontos (arredondado para cima) se houver **empate nos votos** (`x.tie`: metade dos que podem votar contestou) e outra metade se o jogador escreveu **a mesma palavra em várias colunas** (`x.dup`, comparada sem acentos).
- **Votação**: um jogador contesta respostas dos outros (`vt.k = ["i.c", ...]`). Com o juiz activo é preciso `max(2, maioria dos outros presentes)`; sem juiz basta a maioria. Nas próprias respostas não se vota.
- **Juiz** (`runJudge()`): corre só no dispositivo do anfitrião. Deduplica (categoria + resposta) e envia uma única prompt JSON. O pedido de "aquecimento" em `hostStart()` faz a Claude pedir o consentimento no clique.
- O render usa uma `key` por ecrã para não redesenhar (nem perder o foco) enquanto se escreve.
- **Quem dirige** é `G.ro[G.h]` (não é sempre o índice 0). Se essa pessoa desaparecer da sala durante mais de 4,5 s, `tryTakeOver()` passa a direcção ao primeiro jogador presente pela ordem do roster, que retoma a fase em que estava (temporizador, recolha das respostas, juiz). Se o antigo anfitrião voltar e "continuar o jogo", ao ver outro anfitrião passa a jogador.
- **Lotação** (`G.mx`, 2 a 10, `cap(G)`): nas privadas o anfitrião escolhe em "Regras da casa" (nunca abaixo dos jogadores presentes); no "Jogar agora" cada jogador escolhe o tamanho (`wantSize`, guardado em `localStorage['stop-size']`) e o servidor só junta quem quer o mesmo tamanho e a mesma língua. Quem não cabe vê `vFull()` (nas públicas volta a procurar sala).
- **Salas públicas** (`G.pub`): regras fixas (colunas por omissão, 1:30, 5 rondas, nível Médio), e `autoPlan()` avança sozinho: começa 5 s depois de encher, ou mais tarde quanto mais vazia estiver (até 60 s com 2 jogadores), sorteia a letra ao fim de 15 s, confirma os pontos ao fim de 30 s e passa à ronda seguinte ao fim de 12 s. O tempo que falta vai em `G.au` e os ecrãs mostram-no em `[data-auto]`. Só as salas públicas publicam `hosting` no lobby (lista "Salas públicas abertas"); as **privadas** só se encontram pelo código.

## Versão pública (fora da Claude): feita

- `server.js` (Express + Socket.IO): serve `index.html` e `public/` e implementa as salas com o mesmo modelo de `room`. Cada separador guarda um `sid` secreto em `sessionStorage`, e o servidor deriva dele o `peer`, por isso o id mantém-se ao religar. No `lobby` o servidor só envia os peers com `hosting` (no máximo 40). Presence até 4 KiB, salas até 16 peers, limites de ritmo por socket.
- `public/claude-shim.js`: define `window.claude.use('room'|'sample')` só se ainda não existir (dentro da Claude e nos testes com mock não faz nada). O `sample.json()` extrai a letra e os itens da prompt do jogo e envia-os pelo evento de socket `judge`. Não há `POST /api/judge`, porque o socket já identifica a sala e o anfitrião.
- Juiz por dicionário (`dict.js`, sem IA nem custos). O servidor só aceita pedidos do anfitrião (o peer que publica `game`) e valida cada resposta com `check(categoria, resposta, nível)`:
  - Categorias com lista em `data/pt/*.txt` (País, Cor, Animal, Fruto, Nome, Cidade e sinónimos, ver `CAT_KIND`): a resposta tem de estar na lista (aceita plural simples). Nome e Cidade também aceitam nomes próprios do dicionário.
  - Categorias livres (`FREE`: Celebridade, Marca, Filme, Bairro…): não se verificam, os jogadores votam.
  - Todas as outras: a palavra tem de existir no dicionário pt-PT do LibreOffice (`@cspell/dict-pt-pt`, ~1,4 milhões de formas, carregado com `cspell-trie-lib`) ou em `data/pt/extra.txt` (palavras angolanas).
  - Níveis (`G.lv`): `facil` ignora acentos e aceita 1 erro (2 com 8+ letras); `medio` ignora acentos; `dificil` exige ortografia exacta.
  - Grafia anterior ao Acordo (objecto, acção, director) aceite sempre, a partir de `data/pt/preao.txt` (gerado por `scripts/gerar-preao.js`).
  - O nível vai na prompt do juiz (linha `Nível de exigência: …`), que o shim lê e envia no evento `judge`. Dentro da Claude a mesma prompt vai para a Claude.
  - O juiz Claude no servidor foi removido (está no histórico do git, commit 7f55a3a).
- PWA: `public/manifest.webmanifest`, ícones e `sw.js` (rede primeiro; só é registado em https).
- Alojamento: `render.yaml` (Render, plano free), sem variáveis obrigatórias. Cada `git push` para `main` volta a publicar.
- "Jogar agora": `window.stopServer.quick()` (só existe no shim) chama o evento `quick`; `quickMatch()` no servidor escolhe a sala pública com lugar (primeiro as que estão à espera, as mais cheias primeiro, e as acabadas de criar em `reserved`) ou devolve um código novo e quem pediu passa a anfitrião. Se o jogo não aparecer em 9 s, o cliente volta a procurar (até 3 vezes).
- **Línguas** (`pt` Angola/Portugal, `br`, `en`, `fr`, `it`, `es`):
  - Interface: `t(chave, ...)`/`tn()` no `index.html`. O português está em `S.pt` dentro do `index.html` (para continuar a funcionar dentro da Claude); as outras línguas estão em `public/i18n.js` (`window.STOP_I18N`), com as mesmas chaves. Uma chave que falte aparece em português. A língua da interface (`UI`) vem de `localStorage['stop-lang']` ou do browser e escolhe-se no ecrã inicial.
  - Jogo: `G.lg` é a língua do jogo (dicionário, colunas `DEFCATS`/`SUGG`). As salas públicas usam a língua de quem carrega em "Jogar agora" e o servidor só junta jogadores da mesma língua; nas privadas o anfitrião escolhe (mudar repõe as colunas).
  - Juiz: `dict.js` tem `LANG_CFG` com os dicionários `@cspell/dict-*` de cada língua e listas em `data/<língua>/`. Os países vêm do `Intl.DisplayNames` (não há listas à mão, só extras em `pais.txt`). O `br` usa o dicionário europeu, troca é/ê e ó/ô e junta `data/br/` (o dicionário brasileiro do cspell gastava ~150 MB). Os motivos de rejeição são códigos (`dict`, `pais`, `acentos`, …) traduzidos no jogo pelas chaves `r_*`. Todas as línguas carregadas gastam ~240 MB.
  - A língua e o nível vão na prompt do juiz (`Língua do jogo: …`, `Nível de exigência: …`), que o shim lê.

## Testes

```bash
npm install
pip install playwright && python -m playwright install chromium
node tests/test_dicionario.js      # juiz por dicionário: 50 respostas x 3 níveis
python tests/test_servidor.py      # sala privada: servidor real + 3 browsers, juiz por dicionário
python tests/test_publico.py       # sala pública: emparelhamento, início automático e troca de anfitrião (~1,5 min)
python tests/test_pontos.py        # metade dos pontos: empate nos votos e palavra repetida em duas colunas
python tests/test_lotacao.py       # sala privada cheia e máximo de jogadores
python tests/test_linguas.py       # sala em francês com jogador em inglês, motivos traduzidos, salas públicas por língua
python -m http.server 8765         # noutro terminal, para o teste com mock:
python tests/test_ronda.py
# resultado esperado nos dois: Carla 30, Ana 25, João 5
```

`STOP_URL=https://stop-angola.onrender.com python tests/test_servidor.py` joga contra o servidor publicado.

Nota: ao escrever ficheiros com ferramentas, os escapes unicode nas regex (barra + u + 4 dígitos) podem ficar como caracteres literais, e o U+2028 parte a linha. Confirmar sempre com `node --check`.
