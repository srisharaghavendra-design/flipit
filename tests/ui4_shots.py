import os
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# ui4 screenshots (desktop + mobile). Server on :8787.
import json,urllib.request as U
from playwright.sync_api import sync_playwright
B='http://localhost:8787';S=os.path.join(ROOT, 'shots')+'/'
def api(p,d=None):return json.loads(U.urlopen(U.Request(B+p,data=json.dumps(d).encode() if d is not None else None,method='POST' if d is not None else 'GET')).read())
api('/api/reset',{})
for t,x,w,v in [('T-A101','@mops fix and retry the failed syncs','Srisha R.','Webex'),
 ('T-K1','@mops segment CIOs in India enterprise accounts who opted in and email them about SASE, send it and start a nurture','Srisha R.','Slack'),
 ('T-K1','@mops pipeline by channel','Srisha R.','Meeting'),
 ('T-A141',"@mops who's hot at Acme?",'Seller – Dev Rao','Outlook'),
 ('T-K1','@mops pipeline by region','Finance – Priya N.','Slack')]:api('/api/post',{'threadId':t,'text':x,'who':w,'via':v})
api('/api/autopilot/run',{});api('/api/post',{'threadId':'T-K1','text':'@mops budget request $210K','via':'Outlook'})
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch()
    for name,vp,dsf,mob in [('',{'width':1440,'height':900},2,False),('mobile_',{'width':390,'height':844},3,True)]:
        pg=b.new_page(viewport=vp,device_scale_factor=dsf,is_mobile=mob,has_touch=mob);pg.on('pageerror',lambda e:errs.append(str(e)));pg.on('console',lambda m:m.type=='error' and errs.append(m.text))
        pg.goto(B+'/?intro=30000');pg.wait_for_timeout(1300);pg.screenshot(path=S+f'ui4_{name}01_intro_wake.png')
        pg.wait_for_timeout(1500);pg.screenshot(path=S+f'ui4_{name}02_intro_quarter.png')
        pg.keyboard.press('Escape');pg.wait_for_timeout(2500);pg.screenshot(path=S+f'ui4_{name}03_home.png')
        pg.click('#effb');pg.wait_for_timeout(900);pg.screenshot(path=S+f'ui4_{name}03b_efficiency.png');pg.keyboard.press('Escape');pg.wait_for_timeout(500)
        pg.evaluate("document.getElementById('msgs').scrollTop=document.querySelector('.deck,.clear').offsetTop-30");pg.wait_for_timeout(900);pg.screenshot(path=S+f'ui4_{name}04_decision.png')
        pg.evaluate("document.getElementById('msgs').scrollTop=document.querySelector('.tags').offsetTop-60");pg.wait_for_timeout(900);pg.screenshot(path=S+f'ui4_{name}05_tagged.png')
        pg.evaluate("document.getElementById('msgs').scrollTop=document.querySelector('.cps').offsetTop-60");pg.wait_for_timeout(900);pg.screenshot(path=S+f'ui4_{name}06_campaigns.png')
        pg.evaluate("document.getElementById('live').scrollIntoView({block:'start'});document.getElementById('msgs').scrollTop-=50");pg.wait_for_timeout(3000);pg.screenshot(path=S+f'ui4_{name}07_live_quarter.png')
        pg.locator('.cp').first.click();pg.wait_for_timeout(1400);pg.evaluate("document.getElementById('msgs').scrollTop=0");pg.wait_for_timeout(500);pg.screenshot(path=S+f'ui4_{name}08_journey.png')
        if mob:pg.evaluate("document.getElementById('msgs').scrollTop=0;const j=document.getElementById('jy');j.scrollLeft=0");pg.wait_for_timeout(600);pg.screenshot(path=S+f'ui4_{name}09_journey_start.png')
        pg.goto(B+'/?nointro#T-A141');pg.wait_for_timeout(1200);pg.fill('#tx','@mops push the target list to sellers');pg.click('#send');pg.wait_for_timeout(700);pg.screenshot(path=S+f'ui4_{name}10_thinking.png');pg.wait_for_timeout(1800);pg.screenshot(path=S+f'ui4_{name}11_thread.png')
        pg.locator('.art').last.click();pg.wait_for_timeout(800);pg.screenshot(path=S+f'ui4_{name}12_sheet.png')
        pg.goto(B+'/?nointro');pg.wait_for_timeout(500);pg.click('#theme');pg.wait_for_timeout(2200);pg.screenshot(path=S+f'ui4_{name}13_light.png');pg.click('#theme')
        ov=pg.evaluate("document.documentElement.scrollWidth>innerWidth");print(name,'h-overflow',ov)
        pg.close()
    b.close()
print('errors',errs)
