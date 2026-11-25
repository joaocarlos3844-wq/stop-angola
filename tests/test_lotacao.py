"""Lotação: numa sala privada de 2 jogadores, o 3.º vê "Sala cheia"; o anfitrião não pode baixar
o máximo abaixo dos jogadores que já estão na sala.

    python tests/test_lotacao.py
"""
import os, subprocess, sys, time, urllib.request
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = os.environ.get('STOP_URL')
proc = None
if not URL:
    port = '3993'
    proc = subprocess.Popen(['node', 'server.js'], cwd=ROOT, env=dict(os.environ, PORT=port))
    URL = 'http://localhost:' + port
    for _ in range(50):
        try:
            urllib.request.urlopen(URL + '/healthz', timeout=1); break
        except Exception:
            time.sleep(0.2)

ok = True
def check(cond, msg):
    global ok
    print(('ok   ' if cond else 'FALHOU ') + msg)
    ok = ok and bool(cond)

try:
    with sync_playwright() as p:
        b = p.chromium.launch(); errs = []
        def page(nome):
            pg = b.new_context(viewport={'width': 390, 'height': 844}, locale='pt-PT').new_page()
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.goto(URL + '/'); pg.wait_for_selector('#myname', timeout=15000); pg.fill('#myname', nome)
            return pg
        A, B, C = page('Ana'), page('Bela'), page('Caio')
        A.click('[data-a=host]'); A.wait_for_selector('.bigcode'); code = A.inner_text('.bigcode').strip()
        check('Jogadores (1/10)' in A.inner_text('body'), 'sala privada começa com máximo de 10')
        minus = '[data-a=step][data-k=mx][data-d="-1"]'
        for _ in range(9):
            if A.locator(minus).is_enabled(): A.click(minus); A.wait_for_timeout(100)
        check('Jogadores (1/2)' in A.inner_text('body'), 'anfitrião baixa o máximo para 2 (não menos)')
        B.fill('#jcode', code); B.click('[data-a=joinCode]')
        A.wait_for_selector('text=Jogadores (2/2)', timeout=8000)
        check(not A.locator(minus).is_enabled(), 'com 2 jogadores não dá para baixar mais')
        C.fill('#jcode', code); C.click('[data-a=joinCode]')
        C.wait_for_selector('text=Sala cheia', timeout=8000)
        check('Esta sala já tem 2 jogadores.' in C.inner_text('body'), 'o 3.º jogador vê "Sala cheia"')
        check('Jogadores (2/2)' in A.inner_text('body'), 'o 3.º jogador não entrou no roster')
        A.click('[data-a=step][data-k=mx][data-d="1"]')
        C.wait_for_selector('text=Jogadores (3/3)', timeout=8000)
        check(True, 'ao subir o máximo, o 3.º jogador entra sozinho')
        check(not errs, 'sem erros nas páginas ' + str(errs))
        b.close()
finally:
    if proc: proc.terminate()
print('OK' if ok else 'FALHOU')
sys.exit(0 if ok else 1)
