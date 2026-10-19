"""Verify real vintage data and local collection flows on deployed HTTPS Pages."""
import json
import os
import sys
import time
import urllib.request
from playwright.sync_api import sync_playwright
base=sys.argv[1].rstrip('/')+'/'
for attempt in range(6):
    try:
        with urllib.request.urlopen(base+'summary.json',timeout=25) as response:snapshot=json.load(response)
        assert snapshot['version']==5 and snapshot['coverage']['verified']>0
        rows=[dict(zip(snapshot['columns'],r)) for r in snapshot['cards']]
        sets={s['id']:s for s in snapshot['sets']};vintage=['base1','base2','base3','base5','neo1','lc','ex1','ex16']
        for sid in vintage:assert any(c['setId']==sid and c['primary'] is not False for c in rows),sid
        assert sum(c['setId']=='base1' and c['primary'] is not False for c in rows)==102
        assert not any(c['setId']=='base1' and 'Reverse' in str(c['printing']) for c in rows)
        with sync_playwright() as p:
            engine=os.environ.get('BROWSER_ENGINE','chromium');browser=getattr(p,engine).launch();page=browser.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True);errors=[]
            page.on('pageerror',lambda error:errors.append(str(error)))
            response=page.goto(base,wait_until='domcontentloaded');assert response.status==200
            page.wait_for_function("document.querySelectorAll('.card').length>0")
            assert page.locator('.card').count()<=18;assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            for sid in vintage:
                page.evaluate('sid=>location.hash="#sets/"+sid',sid)
                page.wait_for_function('name=>document.querySelector("#selectedSet h1")?.textContent===name',arg=sets[sid]['name'])
                page.wait_for_function("document.querySelectorAll('.card').length>0")
                assert page.locator('.card[data-year="'+str(sets[sid]['year'])+'"]').count()>0
            page.evaluate('location.hash="#sets/base1"');page.wait_for_function("document.querySelector('#goalTotal')?.textContent==='102'")
            assert '1999' in page.locator('#selectedSet').inner_text();page.locator('[data-own]').first.click();page.wait_for_function("document.querySelector('#goalOwned').textContent==='1'")
            page.reload(wait_until='domcontentloaded');page.wait_for_function("document.querySelector('#goalOwned')?.textContent==='1'")
            priced=next(c for c in rows if c['setId']=='base1' and c['hasDetail'] and c['primary'] is not False)
            page.locator('#search').fill(priced['name']+' '+sets['base1']['name'])
            page.wait_for_function("document.querySelectorAll('.card').length>0")
            with page.expect_response(lambda r:'/details/'in r.url) as result:page.locator('[data-key='+json.dumps(priced['key'])+'] [data-detail]').first.click()
            assert result.value.status==200;detail=result.value.json();assert detail['key']==priced['key'] and isinstance(detail['history'],list) and detail['risk']
            page.wait_for_selector('#collectionForm');page.wait_for_function("document.querySelector('#modalBody').textContent.includes('Main risk')")
            page.locator('#closeModal').click()
            reverse=next(c for c in rows if c['setId']=='lc' and c['printing']=='Reverse Holofoil' and c['verifiedMatch'] and c['hasDetail'])
            regular=next(c for c in rows if c['baseId']==reverse['baseId'] and c['primary'] is not False)
            assert regular['id']!=reverse['id'] and regular['key']!=reverse['key']
            page.evaluate('location.hash="#sets/lc"');page.wait_for_function("document.querySelector('#goalTotal')?.textContent==='110'")
            page.locator('#setGoal').select_option('master');page.locator('summary').click();page.locator('#printing').select_option('Reverse Holofoil')
            page.locator('#search').fill(reverse['name']+' '+sets['lc']['name'])
            page.wait_for_function("document.querySelectorAll('.card').length>0")
            with page.expect_response(lambda r:'/details/'in r.url) as foil_result:page.locator('[data-key='+json.dumps(reverse['key'])+'] [data-detail]').first.click()
            assert foil_result.value.status==200 and foil_result.value.json()['printing']=='Reverse Holofoil'
            page.wait_for_selector('#collectionForm')
            assert not errors,errors;browser.close()
        print(json.dumps({'publicSite':base,'engine':engine,'catalogCards':snapshot['coverage']['baseCards'],'verified':snapshot['coverage']['verified'],'vintageSetsDisplayed':len(vintage),'collectionPersistence':'passed','separateReverseHistory':'passed'}));break
    except Exception:
        if attempt==5:raise
        time.sleep(10)
