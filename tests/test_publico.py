"""Sala pública: 3 jogadores carregam em "Jogar agora", ficam na mesma sala e a partida começa sozinha.
Depois de uma ronda, quem dirige o jogo sai e outro jogador passa a dirigir; a ronda seguinte continua.

    python tests/test_publico.py
    STOP_URL=https://... python tests/test_publico.py
"""
import os, subprocess, sys, time, urllib.request
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = os.environ.get('STOP_URL')
proc = None
if not URL:
    port = '3997'
    proc = subprocess.Popen(['node', 'server.js'], cwd=ROOT, env=dict(os.environ, PORT=port))
    URL = 'http://localhost:' + port
    for _ in range(50):
        try:
            urllib.request.urlopen(URL + '/healthz', timeout=1); break
        except Exception:
            time.sleep(0.2)

ok = False
def code_of(pg):
    return pg.inner_text('.bigcode').strip().lower()
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        errs, pages = [], []
        for nome in ('Ana', 'João', 'Carla'):
            ctx = b.new_context(viewport={'width': 390, 'height': 844}, locale='pt-PT')
            pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.goto(URL + '/'); pg.wait_for_selector('#myname', timeout=15000)
            pg.fill('#myname', nome); pages.append(pg)
        A, B, C = pages
        # sala privada de outra pessoa não pode apanhar ninguém do "Jogar agora"
        for pg in pages:
            pg.click('[data-a=quick]'); pg.wait_for_selector('.bigcode', timeout=15000); pg.wait_for_timeout(400)
        codes = {code_of(pg) for pg in pages}
        print('Salas:', codes)
        assert len(codes) == 1, 'os 3 deviam estar na mesma sala'
        A.wait_for_function("document.querySelectorAll('.chips .chip').length>=3", timeout=8000)
        assert 'A partida começa em' in A.inner_text('body')
        # começa sozinha (3 jogadores: 20 s)
        t = time.time()
        for pg in pages: pg.wait_for_selector('.bigletter', timeout=30000)
        print('Começou sozinha em %.0f s' % (time.time() - t))
        # ninguém escolhe a letra: é sorteada sozinha (15 s)
        for pg in pages: pg.wait_for_selector('[data-ans="0"]:not([disabled])', timeout=30000)
        L = A.inner_text('.lbadge').strip()
        print('Letra sorteada:', L)
        for pg in pages:
            for i in range(7): pg.fill(f'[data-ans="{i}"]', L + 'xx')
        B.click('#stopbtn')
        for pg in pages: pg.wait_for_selector('.judge.ok, .judge.off', timeout=15000)
        # quem dirige (Ana) sai a meio da correcção
        host = next(pg for pg in pages if pg.locator('[data-a=confirm]').count())
        others = [pg for pg in pages if pg is not host]
        host.close()
        print('Quem dirigia saiu.')
        others[0].wait_for_timeout(8000)
        for pg in others: print('---', ' | '.join(pg.inner_text('body')[:300].splitlines()))
        for pg in others: pg.wait_for_selector('text=Pontuação', timeout=60000)  # nova dirigente confirma (sozinha em 30 s)
        dirige = [pg for pg in others if pg.locator('text=Continua sozinho em').count() or pg.locator('[data-a=next]').count()]
        print('Jogadores a dirigir agora:', len(dirige))
        # e a ronda 2 começa sozinha
        for pg in others: pg.wait_for_selector('text=Ronda 2', timeout=30000)
        print('Ronda 2 começou.')
        print('Erros nas páginas:', errs)
        ok = len(dirige) == 1 and not errs
        b.close()
finally:
    if proc: proc.terminate()
print('OK' if ok else 'FALHOU')
sys.exit(0 if ok else 1)
