"""Pontos a metade: empate nos votos e a mesma palavra em duas colunas.

Colunas Nome, Fruto, Comida, letra A, 3 jogadores:
  Ana:   Ana,    Abacate, Abacate  -> a mesma palavra em 2 colunas: 10 + 5 + 5 = 20
  João:  Abel,   Ananás,  Arroz    -> só a Ana contesta o "Abel" (1 de 2 votos = empate): 5 + 10 + 10 = 25
  Carla: Amélia, Amora,   Atum     -> 30

    python tests/test_pontos.py
"""
import os, subprocess, sys, time, urllib.request
from playwright.sync_api import sync_playwright

def entrar(pg, modo, lingua=None):
    """Percorre o ecrã inicial: boas-vindas -> língua (a escolhida ou a do browser) -> sala pública/privada."""
    pg.wait_for_selector('[data-a=hs][data-v=lang]', timeout=15000); pg.click('[data-a=hs][data-v=lang]')
    pg.click(f'[data-a=lang][data-v={lingua}]' if lingua else '.choice.on')
    pg.click(f'[data-a=hs][data-v={modo}]'); pg.wait_for_selector('#myname')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = os.environ.get('STOP_URL')
proc = None
if not URL:
    port = '3992'
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
            pg.goto(URL + '/'); entrar(pg, 'priv'); pg.fill('#myname', nome)
            return pg
        A, B, C = page('Ana'), page('João'), page('Carla')
        A.click('[data-a=host]'); A.wait_for_selector('.bigcode'); code = A.inner_text('.bigcode').strip()
        for pg in (B, C): pg.fill('#jcode', code); pg.click('[data-a=joinCode]')
        A.wait_for_function("document.querySelectorAll('.chips .chip').length>=3", timeout=8000)
        # colunas: Nome, Fruto, Comida
        A.click('[data-a=rmCat][data-i="1"]'); A.wait_for_timeout(150)
        for _ in range(4): A.click('[data-a=rmCat][data-i="2"]'); A.wait_for_timeout(150)
        A.click('[data-a=sugCat][data-v="Comida"]'); A.wait_for_timeout(300)
        A.click('[data-a=start]'); A.wait_for_selector('[data-a=pick][data-v=A]'); A.click('[data-a=pick][data-v=A]')
        for pg in (A, B, C): pg.wait_for_selector('[data-ans="0"]:not([disabled])', timeout=10000)
        for pg, vals in ((A, ['Ana', 'Abacate', 'Abacate']), (B, ['Abel', 'Ananás', 'Arroz']), (C, ['Amélia', 'Amora', 'Atum'])):
            for i, v in enumerate(vals): pg.fill(f'[data-ans="{i}"]', v)
        C.wait_for_timeout(700); C.click('#stopbtn')
        for pg in (A, B, C): pg.wait_for_selector('.judge.ok', timeout=15000)
        A.click('[data-a=vote][data-p="1"][data-c="0"]')  # só a Ana contesta o "Abel"
        A.wait_for_function("document.body.innerText.includes('empate nos votos')", timeout=5000)
        body = A.inner_text('body')
        check('½ empate nos votos' in body, 'o "Abel" mostra o empate')
        check(body.count('½ repetida noutra coluna') == 2, 'os dois "Abacate" mostram a repetição')
        A.click('[data-a=confirm]')
        C.wait_for_selector('.lb', timeout=5000); C.wait_for_timeout(500)
        res = ' '.join(C.inner_text('.lb').split())
        print('Pontuação:', res)
        check('Carla (tu) +30' in res and 'João +25' in res and 'Ana +20' in res, 'Carla 30, João 25, Ana 20')
        check(not errs, 'sem erros nas páginas ' + str(errs))
        b.close()
finally:
    if proc: proc.terminate()
print('OK' if ok else 'FALHOU')
sys.exit(0 if ok else 1)
