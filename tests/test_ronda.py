from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':390,'height':844},locale='pt-PT')
    ctx.add_init_script(path=__import__('os').path.join(__import__('os').path.dirname(__file__),'mock-claude.js'))
    errs=[]; pages=[ctx.new_page() for _ in range(3)]
    for pg in pages: pg.on('pageerror',lambda e:errs.append(str(e))); pg.goto('http://localhost:8765/index.html'); pg.wait_for_timeout(300)
    A,B,C=pages
    A.fill('#myname','Ana'); A.click('[data-a=host]'); A.wait_for_timeout(600)
    code=A.inner_text('.bigcode').strip()
    for pg,n in ((B,'João'),(C,'Carla')):
        pg.fill('#myname',n); pg.fill('#jcode',code); pg.click('[data-a=joinCode]'); pg.wait_for_timeout(600)
    for _ in range(4): A.click('[data-a=rmCat][data-i="3"]'); A.wait_for_timeout(150)
    A.screenshot(path=__import__('os').path.join(__import__('tempfile').gettempdir(),'j0.png'),full_page=True)
    A.click('[data-a=start]'); A.wait_for_timeout(500); A.click('[data-a=pick][data-v=A]'); A.wait_for_timeout(4300)
    for pg,vals in ((A,['Ana','Angola','Ananás']),(B,['Abel','Angola','Azzzz']),(C,['Amélia','Argélia','Abacate'])):
        for i,v in enumerate(vals): pg.fill(f'[data-ans="{i}"]',v)
    C.wait_for_timeout(600); C.click('#stopbtn'); A.wait_for_timeout(3000)
    B.screenshot(path=__import__('os').path.join(__import__('tempfile').gettempdir(),'j1.png'),full_page=True)
    A.wait_for_timeout(1500)
    B.screenshot(path=__import__('os').path.join(__import__('tempfile').gettempdir(),'j2.png'),full_page=True)
    # Ana and Carla contest João's Abel (p=1,c=0)
    A.click('[data-a=vote][data-p="1"][data-c="0"]'); C.click('[data-a=vote][data-p="1"][data-c="0"]'); A.wait_for_timeout(600)
    B.screenshot(path=__import__('os').path.join(__import__('tempfile').gettempdir(),'j3.png'),full_page=True)
    A.click('[data-a=confirm]'); A.wait_for_timeout(600)
    print('C scores:',C.inner_text('.lb').replace('\n',' '))
    print('errors',errs)
