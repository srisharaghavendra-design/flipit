import os
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
from playwright.sync_api import sync_playwright
B='http://localhost:8787';S=os.path.join(ROOT, 'shots')+'/';errs=[]
with sync_playwright() as p:
  b=p.chromium.launch();pg=b.new_page(viewport={'width':1440,'height':1000},device_scale_factor=2);pg.on('pageerror',lambda e:errs.append(str(e)))
  pg.goto(B+'/engine');pg.wait_for_timeout(2500)
  pg.locator('#eoTx').scroll_into_view_if_needed();pg.screenshot(path=S+'engine_enter_once_1_input.png')
  pg.click('#eoGo');pg.wait_for_timeout(2500);pg.locator('#eoOut').scroll_into_view_if_needed();pg.screenshot(path=S+'engine_enter_once_2_artefacts.png')
  pg.locator('#rep').scroll_into_view_if_needed();pg.screenshot(path=S+'engine_enter_once_3_repeat_entry.png')
  bs=pg.locator('#fx button');n=bs.count()
  for i in range(n):
    bs.nth(i).click();pg.wait_for_timeout(2500);pg.locator('#mapOut').scroll_into_view_if_needed();pg.screenshot(path=S+f'engine_mapping_{i+1}.png')
  pg.locator('#eff2').scroll_into_view_if_needed();pg.wait_for_timeout(1500);pg.screenshot(path=S+'efficiency_real_1.png')
  pg.locator('#eff2').screenshot(path=S+'efficiency_real_2_card.png')
  print('fixtures',n,'errors',errs)
