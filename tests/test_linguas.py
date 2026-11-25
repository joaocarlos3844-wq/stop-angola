"""Línguas: sala privada em francês com um jogador de interface inglesa, motivos do juiz traduzidos,
troca de língua no ecrã inicial e "Jogar agora" que só junta jogadores da mesma língua.

    python tests/test_linguas.py      # esperado: Ana 30, Carla 30, Bob 20
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
    port = '3995'
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
        b = p.chromium.launch()
        errs = []
        def page(locale):
            pg = b.new_context(viewport={'width': 390, 'height': 844}, locale=locale).new_page()
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.goto(URL + '/'); pg.wait_for_selector('[data-a=hs][data-v=lang]', timeout=15000)
            return pg
        A, B, C = page('fr-FR'), page('en-US'), page('fr-FR')
        check('Bienvenue dans Stop' in A.inner_text('body'), 'boas-vindas em francês')
        check('Welcome to Stop' in B.inner_text('body'), 'boas-vindas em inglês')
        for pg in (A, B, C): entrar(pg, 'priv')
        check('Salon privé' in A.inner_text('body') and 'Private room' in B.inner_text('body'), 'passos traduzidos')
        A.fill('#myname', 'Ana'); A.click('[data-a=host]'); A.wait_for_selector('.bigcode')
        code = A.inner_text('.bigcode').strip()
        check('Prénom' in A.inner_text('body') and 'Couleur' in A.inner_text('body'), 'colunas em francês')
        B.fill('#myname', 'Bob'); B.fill('#jcode', code); B.click('[data-a=joinCode]')
        C.fill('#myname', 'Carla'); C.fill('#jcode', code); C.click('[data-a=joinCode]')
        A.wait_for_function("document.querySelectorAll('.chips .chip').length>=3", timeout=8000)
        B.wait_for_selector('text=Players (3/10)', timeout=8000)
        check('Français' in B.inner_text('body'), 'o Bob vê que o jogo é em francês')
        for _ in range(4): A.click('[data-a=rmCat][data-i="3"]'); A.wait_for_timeout(150)
        A.click('[data-a=start]'); A.wait_for_selector('[data-a=pick][data-v=P]'); A.click('[data-a=pick][data-v=P]')
        for pg in (A, B, C): pg.wait_for_selector('[data-ans="0"]:not([disabled])', timeout=10000)
        for pg, vals in ((A, ['Pierre', 'Portugal', 'Pomme']), (B, ['Paul', 'Pérou', 'Pzzz']), (C, ['Philippe', 'Pologne', 'Poire'])):
            for i, v in enumerate(vals): pg.fill(f'[data-ans="{i}"]', v)
        C.wait_for_timeout(700); C.click('#stopbtn')
        for pg in (A, B, C): pg.wait_for_selector('.judge.ok', timeout=15000)
        check('not a fruit on the list' in B.inner_text('body'), 'motivo em inglês para o Bob')
        check('fruit absent de la liste' in A.inner_text('body'), 'motivo em francês para a Ana')
        A.click('[data-a=confirm]')
        C.wait_for_selector('.lb', timeout=5000); C.wait_for_timeout(500)
        res = ' '.join(C.inner_text('.lb').split())
        print('Classement vu par Carla :', res)
        check('Ana +30' in res and 'Carla (toi) +30' in res and 'Bob +20' in res, 'pontos Ana 30, Carla 30, Bob 20')
        # troca de língua no ecrã inicial
        D = page('pt-PT')
        D.click('[data-a=hs][data-v=lang]'); D.click('[data-a=lang][data-v=es]'); D.wait_for_timeout(300)
        check('¿Cómo quieres jugar?' in D.inner_text('body'), 'escolher espanhol no passo da língua')
        D.reload(); D.wait_for_selector('[data-a=hs][data-v=lang]')
        check('Bienvenido a Stop' in D.inner_text('body'), 'a língua fica guardada')
        entrar(D, 'pub')
        # "Jogar agora" não junta línguas diferentes
        E = page('pt-PT'); entrar(E, 'pub')
        D.fill('#myname', 'Diego'); D.click('[data-a=quick]'); D.wait_for_selector('.bigcode')
        E.fill('#myname', 'Eva'); E.click('[data-a=quick]'); E.wait_for_selector('.bigcode')
        cd, ce = D.inner_text('.bigcode'), E.inner_text('.bigcode')
        check(cd != ce, f'salas públicas diferentes para espanhol e português ({cd} / {ce})')
        check(not errs, 'sem erros nas páginas ' + str(errs))
        b.close()
finally:
    if proc: proc.terminate()
print('OK' if ok else 'FALHOU')
sys.exit(0 if ok else 1)
