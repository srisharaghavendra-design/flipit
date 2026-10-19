import os
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Screenshots of the v5 ambient UI (desktop + mobile). Server on :8787.
import json,urllib.request as U
from playwright.sync_api import sync_playwright
B='http://localhost:8787';S=os.path.join(ROOT, 'shots')+'/'
def api(p,d=None):return json.loads(U.urlopen(U.Request(B+p,data=json.dumps(d).encode() if d is not None else None,method='POST' if d is not None else 'GET')).read())
api('/api/reset',{})
for t,x in [('T-A101','@mops fix and retry the failed syncs'),('T-K1','@mops segment CIOs in India enterprise accounts who opted in and email them about SASE, send it and start a nurture'),('T-K1','@mops pipeline by channel')]:api('/api/post',{'threadId':t,'text':x})
api('/api/autopilot/run',{});api('/api/post',{'threadId':'T-K1','text':'@mops budget request $210K'})
errs=[]
def chk(pg,tag):
    n=pg.locator('.dc').count();print(tag,'decision cards',n);assert n<=3
    ov=pg.evaluate("document.documentElement.scrollWidth>innerWidth");print(tag,'h-overflow',ov)
with sync_playwright() as p:
    b=p.chromium.launch()
    pg=b.new_page(viewport={'width':1440,'height':900},device_scale_factor=2);pg.on('pageerror',lambda e:errs.append(str(e)));pg.on('console',lambda m:m.type=='error' and errs.append(m.text))
    pg.add_init_script("localStorage.clear()")
    pg.goto(B+'/');pg.wait_for_timeout(2600);chk(pg,'desk');pg.screenshot(path=S+'ui3_01_home.png')
    print('story:',pg.inner_text('.story'));print('state:',pg.inner_text('#stl'))
    pg.evaluate("document.getElementById('msgs').scrollTop=document.querySelector('.deck,.clear').offsetTop-40");pg.wait_for_timeout(800);pg.screenshot(path=S+'ui3_02_decision.png')
    pg.click('.dc .whyb');pg.wait_for_timeout(500);pg.screenshot(path=S+'ui3_03_why.png');pg.click('.dc .why')
    pg.evaluate("document.getElementById('live').scrollIntoView({block:'start'});document.getElementById('msgs').scrollTop-=40");pg.wait_for_timeout(5200);pg.screenshot(path=S+'ui3_04_live_quarter.png')
    # drag-to-approve
    pg.evaluate("document.getElementById('msgs').scrollTop=document.querySelector('.deck').offsetTop-40");pg.wait_for_timeout(300)
    bb=pg.locator('.dc').first.bounding_box();pg.mouse.move(bb['x']+bb['width']/2,bb['y']+60);pg.mouse.down();pg.mouse.move(bb['x']+bb['width']/2+90,bb['y']+70,steps=8);pg.wait_for_timeout(100);pg.screenshot(path=S+'ui3_05_swipe.png')
    pg.mouse.move(bb['x']+bb['width']/2+220,bb['y']+80,steps=8);pg.mouse.up();pg.wait_for_timeout(2500)
    print('after approve state:',pg.inner_text('#stl'),'cards',pg.locator('.dc').count())
    pg.evaluate("document.getElementById('msgs').scrollTop=0");pg.wait_for_timeout(1500);pg.screenshot(path=S+'ui3_06_calm.png')
    pg.click('#mic');pg.wait_for_timeout(400);pg.screenshot(path=S+'ui3_07_voice.png');pg.click('#listen');pg.wait_for_timeout(500)
    pg.goto(B+'/#T-A141');pg.wait_for_timeout(1200);pg.fill('#tx',"@mops who's hot at Acme?");pg.click('#send');pg.wait_for_timeout(800);pg.screenshot(path=S+'ui3_08_thinking.png');pg.wait_for_timeout(1600);pg.screenshot(path=S+'ui3_09_thread.png')
    pg.click('#theme');pg.goto(B+'/');pg.wait_for_timeout(2500);pg.screenshot(path=S+'ui3_10_light.png');pg.click('#theme');pg.close()
    api('/api/post',{'threadId':'T-K1','text':'@mops budget request $240K'})
    m=b.new_page(viewport={'width':390,'height':844},device_scale_factor=3,is_mobile=True,has_touch=True);m.on('pageerror',lambda e:errs.append(str(e)))
    m.goto(B+'/');m.wait_for_timeout(2600);chk(m,'mob');m.screenshot(path=S+'ui3_11_mobile_home.png')
    m.evaluate("document.getElementById('msgs').scrollTop=document.querySelector('.deck,.clear').offsetTop-20");m.wait_for_timeout(700);m.screenshot(path=S+'ui3_12_mobile_decision.png')
    m.evaluate("document.getElementById('live').scrollIntoView({block:'start'})");m.wait_for_timeout(3000);m.screenshot(path=S+'ui3_13_mobile_live.png')
    m.locator('.handled .art').first.click();m.wait_for_timeout(800);m.screenshot(path=S+'ui3_14_mobile_sheet.png')
    b.close()
print('errors',errs)
