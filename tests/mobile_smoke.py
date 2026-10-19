"""Mobile regression checks with actual generated data, run in Chromium and WebKit."""
import functools
import gzip
import http.server
import io
import json
import os
from pathlib import Path
import tempfile
import threading
import time
import unittest
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
class QuietHandler(http.server.SimpleHTTPRequestHandler):
    compressed={}
    def log_message(self,*_):pass
    def send_head(self):
        path=Path(self.translate_path(self.path.split('?')[0]))
        if path.is_file() and path.suffix in ('.json','.js','.mjs','.css') and 'gzip' in self.headers.get('Accept-Encoding',''):
            body=self.compressed.get(str(path.resolve()))
            if body is None:body=gzip.compress(path.read_bytes(),compresslevel=6)
            self.send_response(200);self.send_header('Content-Type',self.guess_type(str(path)));self.send_header('Content-Encoding','gzip');self.send_header('Content-Length',str(len(body)));self.end_headers();return io.BytesIO(body)
        return super().send_head()
class MobileWorkflow(unittest.TestCase):
    def test_mobile_catalog_collection_and_loading(self):
        summary=json.loads((ROOT/'site/summary.json').read_text());self.assertEqual(summary['version'],5)
        self.assertLess(len(gzip.compress((ROOT/'site/summary.json').read_bytes())),2_000_000)
        # Pages serves precompressed cached assets; do not time Python compression as browser work.
        QuietHandler.compressed={str((ROOT/'site'/name).resolve()):gzip.compress((ROOT/'site'/name).read_bytes(),compresslevel=6) for name in ['summary.json','app.js','styles.css','lib/collection.mjs']}
        handler=functools.partial(QuietHandler,directory=str(ROOT/'site'));server=http.server.ThreadingHTTPServer(('127.0.0.1',0),handler)
        threading.Thread(target=server.serve_forever,daemon=True).start()
        try:
            with sync_playwright() as p, tempfile.TemporaryDirectory(prefix='pokeradar-test-') as tmp:
                engine=os.environ.get('BROWSER_ENGINE','chromium');executable=os.environ.get('CHROMIUM_PATH') if engine=='chromium' else None
                browser=getattr(p,engine).launch(**({'executable_path':executable} if executable else {}))
                context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,accept_downloads=True)
                context.route('**/assets.tcgdex.net/**',lambda route:route.abort())
                context.route('**/images.pokemontcg.io/**',lambda route:route.abort())
                page=context.new_page();errors=[];requests=[]
                page.on('pageerror',lambda error:errors.append(str(error)));page.on('request',lambda r:requests.append(r.url))
                if engine=='chromium':
                    cdp=context.new_cdp_session(page);cdp.send('Network.enable');cdp.send('Network.emulateNetworkConditions',{'offline':False,'latency':80,'downloadThroughput':1_000_000,'uploadThroughput':500_000});cdp.send('Emulation.setCPUThrottlingRate',{'rate':4})
                base=f'http://127.0.0.1:{server.server_port}/';started=time.monotonic();page.goto(base,wait_until='domcontentloaded');page.wait_for_function("document.querySelectorAll('.card').length > 0")
                cold=time.monotonic()-started;self.assertLess(cold,4,'First cards must paint within four seconds');self.assertLessEqual(page.locator('.card').count(),18)
                self.assertTrue(page.evaluate('document.documentElement.scrollWidth <= innerWidth'))
                self.assertFalse(any('/details/'in r or '/prices.json'in r or '/catalog.json'in r for r in requests))
                page.screenshot(path=str(Path(tmp)/'home.png'),full_page=False)
                page.locator('[data-nav="sets"]').click();page.locator('[data-open-set="base1"]').click();page.wait_for_function("document.querySelector('#goalTotal')?.textContent==='102'")
                self.assertIn('1999',page.locator('#selectedSet').inner_text());self.assertTrue(page.locator('.card[data-year="1999"]').count()>0);self.assertIn('Holo',page.locator('.card').first.inner_text())
                self.assertNotIn('Reverse',page.locator('#cardList').inner_text());key=page.locator('.card').first.get_attribute('data-key')
                page.locator('[data-own]').first.click();page.wait_for_function("document.querySelector('#goalOwned').textContent==='1'")
                before=page.evaluate("localStorage.getItem('pokeradar_collection_v1')");page.evaluate("()=>{const original=Storage.prototype.setItem;window.restoreCollectionStorage=()=>{Storage.prototype.setItem=original;};Storage.prototype.setItem=function(k,v){if(k==='pokeradar_collection_v1')throw new DOMException('Quota exceeded','QuotaExceededError');return original.call(this,k,v)}}");page.locator('[data-own]').first.click();self.assertEqual(page.evaluate("localStorage.getItem('pokeradar_collection_v1')"),before);page.evaluate('window.restoreCollectionStorage()')
                page.locator('#setGoal').select_option('master');page.wait_for_function("document.querySelector('#setGoal').value==='master'");self.assertEqual(page.locator('#goalTotal').inner_text(),'102')
                page.locator('#missingOnly').click();page.wait_for_function("!document.querySelector('[data-key='+CSS.escape("+json.dumps(key)+")+']')")
                page.locator('#missingOnly').click();page.wait_for_function("document.querySelectorAll('.card').length > 0")
                page.locator('[data-detail]').first.click();page.wait_for_selector('#collectionForm');page.locator('#recordStatus').select_option('owned');page.locator('#recordQuantity').fill('2');page.locator('[name="condition"]').select_option('LP');page.locator('[name="purchasePrice"]').fill('23.5');page.locator('[name="purchaseDate"]').fill('2026-10-18');page.locator('[name="entryPrice"]').fill('40');page.locator('[name="notes"]').fill('Favorite vintage card\nBackup, with commas');page.evaluate("document.dispatchEvent(new Event('visibilitychange'))");page.wait_for_function("!document.querySelector('#refreshBtn').classList.contains('busy')");self.assertEqual(page.locator('[name="notes"]').input_value(),'Favorite vintage card\nBackup, with commas');page.locator('#collectionForm button[type="submit"]').click();page.wait_for_function("document.querySelector('#modalOverlay').hidden")
                record=page.evaluate("key=>JSON.parse(localStorage.getItem('pokeradar_collection_v1')).records[key]",key);self.assertEqual(record['quantity'],2);self.assertEqual(record['condition'],'LP');self.assertEqual(record['entryPrice'],40)
                page.locator('#setGoal').select_option('first');page.wait_for_function("document.querySelector('#setGoal').value==='first'");self.assertTrue(page.locator('.card[data-printing*="1st Edition"]').count()>0);self.assertEqual(page.locator('#goalOwned').inner_text(),'0')
                page.evaluate("location.hash='#sets/lc'");page.wait_for_function("document.querySelector('#goalTotal')?.textContent==='110'");page.locator('#setGoal').select_option('master');page.wait_for_function("Number(document.querySelector('#goalTotal').textContent)>110")
                unknown=next(dict(zip(summary['columns'],r)) for r in summary['cards'] if not r[summary['columns'].index('printing')] and not r[summary['columns'].index('verifiedMatch')] and r[summary['columns'].index('primary')] is not False and (next(s['year'] for s in summary['sets'] if s['id']==r[summary['columns'].index('setId')]) or 0)>=2013)
                unknown_set=next(s for s in summary['sets'] if s['id']==unknown['setId'])
                page.evaluate('sid=>location.hash="#sets/"+sid',unknown['setId']);page.wait_for_function('name=>document.querySelector("#selectedSet h1")?.textContent===name',arg=unknown_set['name'])
                page.locator('#search').fill(unknown['name']+' '+unknown_set['name']+' '+unknown['number'])
                page.locator('[data-key='+json.dumps(unknown['key'])+'] [data-own]').click();page.wait_for_function("document.querySelector('#goalOwned').textContent==='1'")
                page.locator('[data-nav="settings"]').click();page.locator('#ageWeight').select_option('35');page.locator('#significance').select_option('age');
                with page.expect_download() as download:page.locator('#settingsPanel [data-action="export"]').click()
                csv=Path(tmp)/'backup.csv';download.value.save_as(csv);self.assertIn('Favorite vintage card',csv.read_text());page.locator('#csvImport').set_input_files(csv);page.wait_for_function("document.querySelector('#toast').textContent.includes('Imported')")
                page.reload(wait_until='domcontentloaded');page.wait_for_function("document.querySelector('#ageWeight').value==='35'");self.assertEqual(page.locator('#significance').input_value(),'age');self.assertEqual(page.evaluate("key=>JSON.parse(localStorage.getItem('pokeradar_collection_v1')).records[key].quantity",key),2)
                page.locator('[data-nav="home"]').click();page.locator('summary').click();page.locator('#priceMin').fill('100');page.locator('#priceMin').dispatch_event('change');page.locator('#priceMax').fill('250');page.locator('#priceMax').dispatch_event('change');page.wait_for_function("document.querySelectorAll('.card').length>0");self.assertTrue(page.evaluate("[...document.querySelectorAll('.price-line strong')].every(n=>{const v=Number(n.textContent.replace(/[$,]/g,''));return v>=100&&v<=250})"))
                page.locator('#resetFilters').click();page.wait_for_function("document.querySelectorAll('.card').length>0")
                page.locator('#search').fill('Pikachu');page.wait_for_function("document.querySelectorAll('.card').length>0&&[...document.querySelectorAll('.card')].every(e=>/pikachu/i.test(e.textContent))")
                page.locator('#search').fill('');page.wait_for_timeout(200)
                # Open a real priced card and fetch just its history.
                detail_card=next(dict(zip(summary['columns'],r)) for r in summary['cards'] if r[summary['columns'].index('hasDetail')])
                page.locator('#search').fill(detail_card['name']+' '+next(s['name'] for s in summary['sets'] if s['id']==detail_card['setId']));page.wait_for_function("document.querySelectorAll('.card').length>0")
                page.locator('[data-key='+json.dumps(detail_card['key'])+'] [data-detail]').first.click();page.wait_for_function("document.querySelector('#detailChart svg')!==null");self.assertTrue(any('/details/'in r for r in requests));page.locator('#closeModal').click()
                # Same artifact must expire recommendations in a long-lived tab.
                revised=json.loads(json.dumps(summary));cols=revised['columns'];r=revised['cards'][0];today=page.evaluate("new Date().toISOString().slice(0,10)")
                for k,v in {'signal':'buy','score':90,'verifiedMatch':True,'stale':False,'price':25,'asOf':today,'profiles':[[90,'buy'] for _ in revised['profiles']]}.items():r[cols.index(k)]=v
                for value in revised['cards']:
                    if value[cols.index('key')]==unknown['key']:
                        value[cols.index('printing')]='Normal';value[cols.index('edition')]='Standard';value[cols.index('variantVerified')]=True
                revised['builtAt']='2099-01-01T00:00:00Z'
                page.route('**/summary.json*',lambda route:route.fulfill(status=200,content_type='application/json',body=json.dumps(revised)))
                page.locator('#search').fill('');page.wait_for_function("!document.querySelector('#refreshBtn').classList.contains('busy')");page.locator('#refreshBtn').click();page.wait_for_function("Number(document.querySelector('#buyN').textContent)>0");page.wait_for_function("!document.querySelector('#refreshBtn').classList.contains('busy')")
                page.evaluate('sid=>location.hash="#sets/"+sid',unknown['setId']);page.wait_for_function("document.querySelector('#goalOwned')?.textContent==='0'")
                page.locator('#search').fill(unknown['name']+' '+unknown_set['name']+' '+unknown['number'])
                review_button=page.locator('[data-key='+json.dumps(unknown['key'])+'] [data-own]');review_button.wait_for();self.assertEqual(review_button.inner_text(),'Review copy');review_button.click();page.wait_for_selector('#collectionForm')
                self.assertEqual(page.evaluate("key=>JSON.parse(localStorage.getItem('pokeradar_collection_v1')).records[key].quantity",unknown['key']),1);page.locator('#closeModal').click();page.locator('[data-nav="home"]').click()
                page.evaluate("()=>{const later=Date.now()+6*86400000;Date.now=()=>later}");page.locator('#refreshBtn').click();page.wait_for_function("Number(document.querySelector('#buyN').textContent)===0")
                page.wait_for_function("!document.querySelector('#refreshBtn').classList.contains('busy')");page.wait_for_timeout(250);page.route('**/summary.json*',lambda route:route.abort());started=time.monotonic();page.reload(wait_until='domcontentloaded');page.wait_for_function("document.querySelectorAll('.card').length>0");cached=time.monotonic()-started;self.assertLess(cached,2)
                self.assertEqual(errors,[]);self.assertTrue(page.evaluate('document.documentElement.scrollWidth <= innerWidth'))
                print(json.dumps({'engine':engine,'firstCardsSeconds':round(cold,3),'cachedCardsSeconds':round(cached,3),'summaryGzipBytes':len(gzip.compress((ROOT/'site/summary.json').read_bytes())),'cpuSlowdown':4 if engine=='chromium' else 1,'passed':'vintage display, exact printing, collection, goals, CSV, preferences, prices, stale data'}))
                if engine=='chromium':
                    installed=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True);installed.route('**/assets.tcgdex.net/**',lambda route:route.abort());installed.route('**/images.pokemontcg.io/**',lambda route:route.abort());off=installed.new_page();off.goto(f'http://localhost:{server.server_port}/',wait_until='domcontentloaded');off.wait_for_function("document.querySelectorAll('.card').length>0&&localStorage.getItem('pokeradar_preview_v5')");off.evaluate('navigator.serviceWorker.ready');off.wait_for_function('navigator.serviceWorker.controller!==null');off.evaluate("fetch('summary.json',{cache:'no-cache'}).then(r=>r.json())");off.wait_for_function("async()=>Boolean(await caches.match(new URL('summary.json',location.href).href))");installed.set_offline(True);off.reload(wait_until='domcontentloaded');off.wait_for_function("document.querySelectorAll('.card').length>0");self.assertEqual(off.evaluate("fetch('summary.json').then(r=>r.headers.get('X-Pokeradar-Cache'))"),'offline');installed.close()
                browser.close()
        finally:server.shutdown();server.server_close()
if __name__=='__main__':
    result=unittest.main(exit=False).result
    if not result.wasSuccessful():
        if os.environ.get('GITHUB_ACTIONS'):
            for _,trace in result.failures+result.errors:
                escaped=trace[-6000:].replace('%','%25').replace('\r','%0D').replace('\n','%0A')
                print('::error title=Mobile browser regression::'+escaped)
        raise SystemExit(1)
