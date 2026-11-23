"""Joga uma ronda completa contra o servidor real (server.js), com 3 browsers separados.

    npm install
    python tests/test_servidor.py      # esperado: Carla 30, Ana 25, João 5 (sem juiz: João 15)

Arranca o servidor com STOP_FAKE_JUDGE=1 (o juiz não chama a API: palavras com "zz" são inválidas).
Para testar contra um servidor já a correr: STOP_URL=https://... python tests/test_servidor.py
"""
import os, subprocess, sys, time, urllib.request, tempfile
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = os.environ.get('STOP_URL')
proc = None
if not URL:
    port = '3999'
    env = dict(os.environ, PORT=port, STOP_FAKE_JUDGE='1')
    proc = subprocess.Popen(['node', 'server.js'], cwd=ROOT, env=env)
    URL = 'http://localhost:' + port
    for _ in range(50):
        try:
            urllib.request.urlopen(URL + '/healthz', timeout=1); break
        except Exception:
            time.sleep(0.2)

shots = tempfile.mkdtemp(prefix='stop-')
ok = False
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        errs = []
        pages = []
        for _ in range(3):  # um contexto por "telemóvel"
            ctx = b.new_context(viewport={'width': 390, 'height': 844})
            pg = ctx.new_page()
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.goto(URL + '/')
            pg.wait_for_selector('#myname', timeout=15000)
            pages.append(pg)
        A, B, C = pages
        A.fill('#myname', 'Ana'); A.click('[data-a=host]')
        A.wait_for_selector('.bigcode')
        code = A.inner_text('.bigcode').strip().lower()
        # B entra pela lista "Jogos abertos", C pelo código
        B.fill('#myname', 'João'); B.wait_for_selector(f'[data-a=join][data-v="{code}"]', timeout=5000); B.click(f'[data-a=join][data-v="{code}"]')
        C.fill('#myname', 'Carla'); C.fill('#jcode', code); C.click('[data-a=joinCode]')
        A.wait_for_function("document.querySelectorAll('.chips .chip').length>=3", timeout=8000)
        for _ in range(4): A.click('[data-a=rmCat][data-i="3"]'); A.wait_for_timeout(150)
        A.click('[data-a=start]'); A.wait_for_selector('[data-a=pick][data-v=A]'); A.click('[data-a=pick][data-v=A]')
        for pg in pages: pg.wait_for_selector('[data-ans="0"]:not([disabled])', timeout=10000)
        for pg, vals in ((A, ['Ana', 'Angola', 'Ananás']), (B, ['Abel', 'Angola', 'Azzzz']), (C, ['Amélia', 'Argélia', 'Abacate'])):
            for i, v in enumerate(vals): pg.fill(f'[data-ans="{i}"]', v)
        C.wait_for_timeout(700); C.click('#stopbtn')
        for pg in pages: pg.wait_for_selector('.judge.ok, .judge.off', timeout=15000)
        B.screenshot(path=os.path.join(shots, 'revisao.png'), full_page=True)
        judge_on = A.locator('.judge.ok').count() > 0  # sem juiz, o "Azzzz" do João conta: 15 em vez de 5
        # Ana e Carla contestam o "Abel" do João (p=1, c=0)
        A.click('[data-a=vote][data-p="1"][data-c="0"]'); C.click('[data-a=vote][data-p="1"][data-c="0"]')
        A.wait_for_function("document.body.innerText.includes('Anulada pelos jogadores')", timeout=5000)
        A.click('[data-a=confirm]')
        C.wait_for_selector('.lb', timeout=5000); C.wait_for_timeout(500)
        res = C.inner_text('.lb').replace('\n', ' ')
        print('Pontuação vista pela Carla:', res)
        print('Erros nas páginas:', errs)
        print('Juiz:', 'ligado' if judge_on else 'desligado (só votos)')
        ok = 'Carla' in res and '30' in res and '25' in res and (('+5' in res) if judge_on else ('+15' in res)) and not errs
        print('Capturas em', shots)
        b.close()
finally:
    if proc: proc.terminate()
print('OK' if ok else 'FALHOU')
sys.exit(0 if ok else 1)
