import os
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# End-to-end: API + UI (Playwright). Run with server on :8787 in rule mode.
import json,urllib.request as U,re,sys
from playwright.sync_api import sync_playwright
B='http://localhost:8787';S=os.path.join(ROOT, 'shots')+'/';fails=[]
def api(p,d=None):
    r=U.urlopen(U.Request(B+p,data=json.dumps(d).encode() if d is not None else None,method='POST' if d is not None else 'GET'));return r.read()
def post(t,x,csv=None):
    m=json.loads(api('/api/post',{'threadId':t,'text':x,'csv':csv}))['messages'][-1];return m['artifacts']
def ok(c,msg):
    print(('PASS ' if c else 'FAIL ')+msg); c or fails.append(msg)
api('/api/reset',{})
# API tests
a=post('T-K1','@mops segment IT Directors in India and email them about zero trust, send it')
ok(a[0]['data']['count']>0 and a[2]['data']['suppressed']>0,'email: segment + consent suppression (%s suppressed)'%a[2]['data'].get('suppressed'))
out=json.loads(api('/api/outbox'));d=json.loads(api('/api/data'))
cons={c[0]:c[1] for c in d['consent']}
ok(all('@' in m['to'] for m in out) and len(out)==a[2]['data']['sent'],'email: outbox count matches sent')
a=post('T-K1','@mops segment CIOs in India enterprise accounts who opted in and email them about SASE, send it and start a nurture')
ok(a[0]['data']['count']>0 and a[2]['data']['suppressed']==0 and a[3]['kind']=='Nurture scheduled','email: opted-in segment, send, nurture')
n=json.loads(api('/api/nurture/run',{}));ok(n['stepsSent']>=1,'email: nurture step fast-forward')
a=post('T-K1','@mops pipeline by channel');ok(a[0]['chart'] and a[0]['data']['total']>0 and a[0]['cites'],'insight: computed pipeline + chart + cites')
st=json.load(open(os.path.join(ROOT, 'data.json')));tot=sum(l['pipeline'] for l in st['leads']);ok(tot==a[0]['data']['total'],'insight: total matches raw data (%d)'%tot)
a=post('T-K7','@mops create a campaign code');ok(re.match(r'FY27Q2-ANZ-DIG-\d+',a[0]['title']),'ops: campaign code '+a[0]['title'])
a2=post('T-K7','@mops create a campaign code');ok('reused' in a2[0]['body'],'ops: code not re-created')
a=post('T-K5','@mops budget request $200K');ok(a[0]['data']['status']=='pending_approval','ops: >150K needs approval')
bid=a[0]['data']['budgetId'];r=json.loads(api('/api/budget/%s/approve'%bid,{}));ok('approved' in r['title'],'ops: approve flow')
a=post('T-K5','@mops budget request $60K');ok(a[0]['data']['status']=='auto_approved','ops: <=150K auto-approved')
a=post('T-K5','@mops SOW with Lotus Events Pvt Ltd');doc=U.urlopen(B+a[0]['link']['href']);body=doc.read().decode()
ok('Statement of Work' in body and 'msword' in doc.headers['content-type'],'ops: SOW .doc download')
a=post('T-K4','@mops upload this attendee list',open(os.path.join(ROOT, 'tests', 'sample_attendees.csv')).read())
ok(a[0]['title'].startswith('3 loaded') and len(a[0]['table2']['rows'])==3,'ops: CSV clean/dedupe/match: '+a[0]['title'])
a=post('T-K3','@mops MDF status');ok('MDF-311' in json.dumps(a),'ops: MDF status')
# ---- v3: tags #6 #7 #8 #10 ----
a=post('T-A101',"@mops why didn't these leads reach SFDC?");ok(a[0]['kind']=='Sync doctor' and a[0]['data']['failed']>0 and len(a[0]['table']['rows'])==5,'sync: diagnose %s failures, 5 causes'%a[0]['data'].get('failed'))
nf=a[0]['data']['failed']
a=post('T-A101','@mops fix and retry the failed syncs');ok(a[0]['data']['fixed']+a[0]['data']['human']==nf and a[0]['data']['human']>0,'sync: fixed %d, %d escalated to human (no guessing)'%(a[0]['data']['fixed'],a[0]['data']['human']))
a=post('T-A101',"@mops why didn't these leads reach SFDC?");ok(a[0]['data']['failed']==0 and a[0]['data']['human']>0,'sync: re-check shows 0 failed, human queue visible')
st2=json.load(open(os.path.join(ROOT, 'data.json')));ok(not [x for x in st2['syncLog'] if x['status']=='failed'],'sync: no silent failures left in log')
a=post('T-A141',"@mops who's hot at Acme?");r0=a[0]['table']['rows'];ok(a[0]['kind']=='Lead score' and r0[0][0]=='Neha Kapoor' and r0[0][3]=='Hot' and r0[-1][2]<r0[0][2],'score: Neha top & hot, ranked')
ok(len([s for s in json.load(open(os.path.join(ROOT, 'data.json')))['crm']['leadScores'] if s['contactId'].startswith('C13')])==6,'score: written to mock CRM')
a=post('T-K2',"@mops who's hot at Acme?");ok(a[0].get('data',{}).get('accountId')=='A141','score: account resolved by name from another thread')
a=post('T-A141','@mops credit the roundtable on this opp');ok(a[0]['data']['credited'] and a[0]['data']['oppId']=='OPP-9001' and 'Neha Kapoor' in a[0]['body'],'attribution: roundtable credited with evidence: '+a[0]['title'])
o=[x for x in json.load(open(os.path.join(ROOT, 'data.json')))['opps'] if x['id']=='OPP-9001'][0];ok(abs(sum(i['pct'] for i in o['influence'])-100)<1,'attribution: influence sums to 100%')
a=post('T-A141','@mops credit the Sydney Security Summit on OPP-9001');ok(not a[0]['data']['credited'],'attribution: refuses credit without evidence')
a=post('T-K1','@mops push the target list to sellers');ok(a[0]['data']['created']==10 and a[0]['data']['notified']==1,'sellers: 10 tasks + seller notified')
d3=json.load(open(os.path.join(ROOT, 'data.json')));ok(len(d3['crm']['tasks'])==10 and d3['notifications'][-1]['to'].startswith('dev.rao'),'sellers: tasks in mock CRM, Webex notice')
a=post('T-K1','@mops push the target list to sellers');ok(a[0]['data']['created']==0 and a[0]['data']['skipped']==10,'sellers: no duplicate tasks on re-push')
a=post('T-K10','@mops set up the event for 60 guests');ok(a[0]['kind']=='Event' and 'link' in a[0],'event: created '+a[0]['title'])
slug=a[0]['link']['href']
with sync_playwright() as p:
    b=p.chromium.launch();pg=b.new_page(viewport={'width':1500,'height':920})
    pg.goto(B+slug);pg.screenshot(path=S+'05_event_registration_page.png')
    pg.fill('[name=name]','Hiro Sato');pg.fill('[name=email]',st['contacts'][14]['email']);pg.fill('[name=company]','x');pg.check('[name=consent]');pg.click('button')
    ok('registered' in pg.inner_text('#ok'),'event: registration submitted');pg.screenshot(path=S+'05b_registration_done.png')
    a=post('T-K10','@mops who registered?');ok('1/60' in a[0]['title'],'event: registration in data layer')
    # UI tests
    pg.goto(B+'/#T-K1');pg.wait_for_selector('canvas');pg.wait_for_timeout(800)
    pg.locator('.art[data-kind="Segment"]').last.scroll_into_view_if_needed();pg.screenshot(path=S+'01_email_agent.png')
    pg.locator('canvas').last.scroll_into_view_if_needed();pg.wait_for_timeout(600);pg.screenshot(path=S+'02_insight_agent.png')
    pg.fill('#tx','@mops pipeline by region');pg.click('#send');pg.wait_for_timeout(1500)
    ok(pg.locator('canvas').count()>=2,'UI: typed @mops renders chart');pg.screenshot(path=S+'02b_insight_region.png')
    pg.goto(B+'/#T-K5');pg.wait_for_selector('.art');pg.fill('#tx','@mops budget request $175K');pg.click('#send');pg.wait_for_timeout(1200)
    pg.screenshot(path=S+'03_ops_budget_approval.png');pg.locator('button:has-text("Approve")').last.click();pg.wait_for_timeout(1200)
    ok('approved' in pg.locator('.art[data-kind="Budget decision"]').last.inner_text(),'UI: approve button');pg.screenshot(path=S+'03b_ops_budget_sow.png')
    pg.goto(B+'/#T-K4');pg.wait_for_selector('.art');pg.set_input_files('#csv',os.path.join(ROOT, 'tests', 'sample_attendees.csv'));pg.wait_for_timeout(1500)
    ok('exceptions' in pg.inner_text('#msgs').lower(),'UI: CSV upload exceptions');pg.locator('.art').last.scroll_into_view_if_needed();pg.screenshot(path=S+'04_ops_csv_upload.png')
    for th,txt,fn in [('T-A101',"@mops why didn't these leads reach SFDC?",'10_sync_diagnose.png'),('T-A101','@mops fix and retry the failed syncs','10b_sync_fixed.png'),('T-A141',"@mops who's hot at Acme?",'11_lead_score.png'),('T-A141','@mops credit the roundtable on this opp','12_attribution.png'),('T-K6','@mops push the target list to sellers','13_target_list.png')]:
        pg.goto(B+'/#'+th);pg.reload();pg.wait_for_selector('#tx');pg.wait_for_timeout(500);pg.fill('#tx',txt);pg.click('#send');pg.wait_for_timeout(1500)
        pg.locator('.art').last.scroll_into_view_if_needed();pg.screenshot(path=S+fn);ok(pg.locator('.art').count()>0,'UI: '+fn)
    pg.click('#more');pg.wait_for_timeout(400);pg.click('[data-t=stack]');pg.wait_for_timeout(300);pg.screenshot(path=S+'06_stack_replaced.png')
    pg.click('[data-t=data]');pg.wait_for_timeout(600);pg.screenshot(path=S+'07_data_layer.png')
    pg.click('[data-t=outbox]');pg.wait_for_timeout(600);pg.screenshot(path=S+'08_outbox.png')
    pg.goto(B+'/sow/SOW-001.html');pg.screenshot(path=S+'09_sow_document.png')
    # ---- autopilot (fresh data) ----
    api('/api/reset',{});u=json.loads(api('/api/autopilot/run',{}));ok(u['updated']>=5,'autopilot: %d campaigns updated'%u['updated'])
    th=json.loads(api('/api/thread/T-K5'));ap=[m for m in th['messages'] if m.get('mode')=='autopilot'][-1];kinds=[x['kind'] for x in ap['artifacts']]
    ok(ap['artifacts'][0]['data']['auto']>=1 and 'Recommendation' in kinds,'autopilot: K5 low-risk ops auto-done + recommendation: '+ap['text'])
    dd=json.load(open(os.path.join(ROOT, 'data.json')));ok(not [x for x in dd['syncLog'] if x['status']=='failed'],'autopilot: sync failures auto-fixed')
    ok(all(c['code'] for c in dd['campaigns']) and all(c.get('state') for c in dd['campaigns']),'autopilot: every campaign has code + live state')
    ok(any('in-market' in x['title'] for t in dd['threads'] for m in t['messages'] if m.get('mode')=='autopilot' for x in m['artifacts']),'autopilot: 6sense in-market recommendation')
    fu=[x for x in ap['artifacts'] if x.get('data',{}).get('followupId')][0]['data']['followupId']
    n0=len(dd['crm']['tasks']);a=post('T-K5','@mops approve '+fu);ok(a[0]['kind']=='Approved' and len(json.load(open(os.path.join(ROOT, 'data.json')))['crm']['tasks'])>n0,'autopilot: approve follow-ups -> CRM tasks')
    a=post('T-K5','@mops approve '+fu);ok('already' in (a[0].get('error') or ''),'autopilot: no double approval')
    u2=json.loads(api('/api/autopilot/run',{}));u3=json.loads(api('/api/autopilot/run',{}));ok(u3['updated']==0,'autopilot: quiet when nothing changes (no spam)')
    pg.goto(B+'/#T-K5');pg.reload();pg.wait_for_timeout(1200);pg.locator('.art[data-kind="Autopilot"]').last.scroll_into_view_if_needed();pg.screenshot(path=S+'14_autopilot.png')
    pg.locator('.art').last.scroll_into_view_if_needed();pg.screenshot(path=S+'14b_autopilot_approved.png')
    pg.goto(B+'/#T-K7');pg.reload();pg.wait_for_timeout(1200);pg.locator('.art').last.scroll_into_view_if_needed();pg.screenshot(path=S+'15_autopilot_recs.png')
    errs=[];pg.on('pageerror',lambda e:errs.append(str(e)));pg.goto(B+'/#T-K1');pg.wait_for_timeout(1000);ok(not errs,'UI: no JS errors')
    b.close()
print('FAILS:',fails);sys.exit(1 if fails else 0)
