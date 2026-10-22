import os
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Engine room screenshots. Requires `npm run demo` running on :8787.
import json,urllib.request as U,time
from playwright.sync_api import sync_playwright
B='http://localhost:8787';S=os.path.join(ROOT, 'shots')+'/'
def api(p,d=None):return json.loads(U.urlopen(U.Request(B+p,data=json.dumps(d).encode() if d is not None else None,headers={'content-type':'application/json'},method='POST' if d is not None else 'GET')).read())
api('/api/engine/reset',{})
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch();pg=b.new_page(viewport={'width':1440,'height':1000},device_scale_factor=2);pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(B+'/engine');pg.wait_for_timeout(2500);pg.screenshot(path=S+'engine_01_idle.png')
    pg.click('#run');pg.wait_for_timeout(5200);pg.screenshot(path=S+'engine_02_midrun.png')
    pg.wait_for_function("document.querySelectorAll('.st').length>=10",timeout=60000);pg.wait_for_timeout(1500);pg.screenshot(path=S+'engine_03_midrun_sync.png')
    pg.wait_for_function("document.querySelector('#sum').style.display==='block'",timeout=120000);pg.wait_for_timeout(2500);pg.screenshot(path=S+'engine_04_complete.png')
    pg.screenshot(path=S+'engine_05_full_page.png',full_page=True)
    pg.click('text=@mops attribution');pg.wait_for_timeout(1500);pg.locator('.bottom').scroll_into_view_if_needed();pg.wait_for_timeout(400);pg.screenshot(path=S+'engine_06_tag_attribution.png')
    pg.fill('#tx','@mops segment CISOs in Japan who opted in');pg.press('#tx','Enter');pg.wait_for_timeout(1200);pg.screenshot(path=S+'engine_07_tag_segment.png')
    for n,u in [('08_engine_api_docs','/svc/engine/docs'),('09_crm_api_docs','/svc/crm/docs')]:
        pg.goto(B+u);pg.wait_for_timeout(600);pg.screenshot(path=S+f'engine_{n}.png')
    ev=api('/svc/engine/events')[0];pg.goto(B+'/svc/engine/r/'+ev['slug']);pg.wait_for_timeout(500);pg.screenshot(path=S+'engine_10_registration_form.png')
    m=api('/svc/mail/messages')[0];pg.goto(B+f"/svc/mail/messages/{m['id']}/html");pg.wait_for_timeout(500);pg.screenshot(path=S+'engine_11_email_in_sink.png')
    unsub=m['headers']['list-unsubscribe'].strip('<>');pg.goto(unsub);pg.wait_for_timeout(400);pg.screenshot(path=S+'engine_12_unsubscribe.png')
    pg.goto(B+'/engine');pg.wait_for_timeout(2500)
    def at(sel):pg.evaluate(f"document.querySelector('{sel}').scrollIntoView({{block:'start'}});window.scrollBy(0,-20)");pg.wait_for_timeout(700)
    at('.row3');pg.screenshot(path=S+'engine_13_covered_for_you.png')
    pg.locator('.undo').first.click();pg.wait_for_timeout(2500);at('.row3');pg.screenshot(path=S+'engine_14_covered_undo.png')
    pg.click('#load');pg.wait_for_timeout(9000);at('.row3');pg.screenshot(path=S+'engine_15_scale_test_running.png')
    pg.wait_for_function("document.querySelector('#load').textContent.includes('Run 1M')",timeout=180000);pg.wait_for_timeout(2500);at('.row3');pg.screenshot(path=S+'engine_16_scale_test_done.png')
    pg.click('#dmail');pg.wait_for_timeout(1500);pg.click('#dwebex');pg.wait_for_timeout(3500);at('.row4');pg.screenshot(path=S+'engine_17_surfaces_email_webex.png')
    pg.click('#inject');pg.wait_for_timeout(9000);at('.row4');pg.screenshot(path=S+'engine_18_self_heal_detecting.png')
    pg.wait_for_function("document.querySelector('#inc').textContent.includes('healed in')",timeout=90000);pg.wait_for_timeout(2500);at('.row4');pg.screenshot(path=S+'engine_19_self_healed.png')
    at('.bottom');pg.screenshot(path=S+'engine_20_event_stream.png')
    rep=[m for m in api('/svc/mail/messages?rcpt=srisha') if m['headers'].get('x-mops-surface')=='reply'][0];pg.goto(B+f"/svc/mail/messages/{rep['id']}/html");pg.wait_for_timeout(500);pg.screenshot(path=S+'engine_21_emailed_reply.png')
    pg.goto(B+'/?nointro#T-K1');pg.wait_for_timeout(2500);pg.screenshot(path=S+'engine_22_app_thread_shows_email_action.png')
    b.close()
print('errors',errs)
