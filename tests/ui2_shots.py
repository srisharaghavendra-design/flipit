import os
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Screenshots of the v4 feed UI (desktop + mobile). Server on :8787.
import json,urllib.request as U
from playwright.sync_api import sync_playwright
B='http://localhost:8787';S=os.path.join(ROOT, 'shots')+'/'
def api(p,d=None):return U.urlopen(U.Request(B+p,data=json.dumps(d).encode() if d is not None else None,method='POST' if d is not None else 'GET')).read()
api('/api/reset',{})
for t,x in [('T-A101','@mops fix and retry the failed syncs'),('T-K1','@mops segment CIOs in India enterprise accounts who opted in and email them about SASE, send it and start a nurture'),('T-K1','@mops pipeline by channel')]:api('/api/post',{'threadId':t,'text':x})
api('/api/autopilot/run',{});api('/api/post',{'threadId':'T-K1','text':'@mops budget request $210K'})
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch()
    for theme in ['dark']:
        pg=b.new_page(viewport={'width':1440,'height':900},device_scale_factor=2);pg.on('pageerror',lambda e:errs.append(str(e)))
        pg.goto(B+'/');pg.wait_for_timeout(1500);pg.screenshot(path=S+'ui2_01_brief_feed.png')
        pg.locator('.need').first.scroll_into_view_if_needed();pg.evaluate("document.getElementById('msgs').scrollTop=170");pg.wait_for_timeout(300);pg.screenshot(path=S+'ui2_02_needs_you.png')
        pg.locator('.art[data-kind="Insight"]').first.click();pg.wait_for_timeout(900);pg.screenshot(path=S+'ui2_03_artifact_sheet.png')
        pg.keyboard.press('Escape');pg.wait_for_timeout(400)
        pg.goto(B+'/#T-A141');pg.wait_for_timeout(1200)
        pg.fill('#tx',"@mops who's hot at Acme?");pg.click('#send');pg.wait_for_timeout(750);pg.screenshot(path=S+'ui2_04_thinking.png')
        pg.wait_for_timeout(1500);pg.screenshot(path=S+'ui2_05_thread_result.png')
        pg.click('#theme');pg.goto(B+'/');pg.wait_for_timeout(1200);pg.screenshot(path=S+'ui2_06_light.png');pg.click('#theme')
        pg.close()
    m=b.new_page(viewport={'width':390,'height':844},device_scale_factor=3,is_mobile=True,has_touch=True);m.on('pageerror',lambda e:errs.append(str(e)))
    m.goto(B+'/');m.wait_for_timeout(1500);m.screenshot(path=S+'ui2_07_mobile_feed.png')
    m.locator('.r .art[data-kind="Insight"]').first.click();m.wait_for_timeout(800);m.screenshot(path=S+'ui2_08_mobile_sheet.png')
    b.close()
print('errors',errs)
