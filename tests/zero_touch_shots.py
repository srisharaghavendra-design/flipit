import os
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
from playwright.sync_api import sync_playwright
B='http://localhost:8787';S=os.path.join(ROOT, 'shots')+'/';errs=[]
with sync_playwright() as p:
  b=p.chromium.launch();pg=b.new_page(viewport={'width':1440,'height':1000},device_scale_factor=2);pg.on('pageerror',lambda e:errs.append(str(e)))
  pg.goto(B+'/engine');pg.wait_for_timeout(2500);pg.click('#ztNew');pg.wait_for_timeout(1200)
  pg.locator('#ztB').scroll_into_view_if_needed();pg.locator('#zt').screenshot(path=S+'zero_touch_1_budget_draft.png')
  pg.click('#ztOk');pg.wait_for_timeout(1000);pg.locator('#ztB').screenshot(path=S+'zero_touch_2_budget_approved.png')
  pg.fill('#eoTx','@mops ANZ Security Summit, Sydney, 12-13 Nov 2026, Australia, SASE and zero trust, 120 seats, for CISOs at enterprise accounts, budget $90K, cost center CC-4410')
  pg.click('#eoGo');pg.wait_for_timeout(3000);pg.locator('#ztS').screenshot(path=S+'zero_touch_3_sow_prefill_question.png')
  pg.click('#sowAns');pg.wait_for_timeout(1000);pg.locator('#ztS').screenshot(path=S+'zero_touch_4_sow_final_review.png')
  pg.click('#sowSign');pg.wait_for_timeout(1000);pg.locator('#ztS').screenshot(path=S+'zero_touch_5_sow_signed_off.png')
  pg.locator('#fx button').nth(1).click();pg.wait_for_timeout(2500)
  pg.locator('#eff2').scroll_into_view_if_needed();pg.wait_for_timeout(2500);pg.screenshot(path=S+'efficiency_real_v2_1.png');pg.locator('#eff2').screenshot(path=S+'efficiency_real_v2_2_card.png')
  print('errors',errs)
