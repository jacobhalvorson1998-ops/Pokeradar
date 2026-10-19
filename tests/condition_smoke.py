"""NM/LP boundaries and 100-card browsing on native mobile Chromium/WebKit.
Synthetic provider observations stay in this test HTTP server, never site files.
"""
import functools,gzip,io,json,os,tempfile,threading,time,unittest
import http.server
from pathlib import Path
from playwright.sync_api import sync_playwright
from mobile_smoke import QuietHandler,ROOT
class ConditionHandler(QuietHandler):
    override=None
    def send_head(self):
        if self.override is not None and self.path.split('?')[0].endswith('/summary.json'):
            data=gzip.compress(json.dumps(self.override).encode(),compresslevel=6)
            self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Encoding','gzip');self.send_header('Content-Length',str(len(data)));self.end_headers();return io.BytesIO(data)
        return super().send_head()
class ConditionWorkflow(unittest.TestCase):
    def test_conditions_and_large_pages(self):
        summary=json.loads((ROOT/'site/summary.json').read_text());cols=summary['columns'];rows=[dict(zip(cols,r)) for r in summary['cards']];sets={s['id']:s for s in summary['sets']}
        ConditionHandler.override=None
        server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(ConditionHandler,directory=str(ROOT/'site')));threading.Thread(target=server.serve_forever,daemon=True).start()
        try:
            with sync_playwright() as p,tempfile.TemporaryDirectory(prefix='pokeradar-conditions-') as tmp:
                engine=os.environ.get('BROWSER_ENGINE','chromium');executable=os.environ.get('CHROMIUM_PATH') if engine=='chromium' else None
                browser=getattr(p,engine).launch(**({'executable_path':executable} if executable else {}));context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
                requests=[];context.on('request',lambda r:requests.append(r.url));context.route('**/assets.tcgdex.net/**',lambda r:r.abort());context.route('**/images.pokemontcg.io/**',lambda r:r.abort())
                page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));base=f'http://127.0.0.1:{server.server_port}/'
                page.goto(base,wait_until='domcontentloaded');page.wait_for_function("document.querySelectorAll('.card').length===20")
                self.assertEqual(page.locator('[data-condition="NM"]').get_attribute('aria-pressed'),'true');self.assertIn('NM Price Unavailable',page.locator('.card').first.inner_text())
                before=len(requests);start=time.monotonic();page.locator('#pageSize').select_option('100');page.wait_for_function("document.querySelectorAll('.card').length===100");large=time.monotonic()-start;self.assertLess(large,3)
                self.assertFalse(any('/details/'in r or '/catalog.json'in r or '/prices.json'in r for r in requests[before:]));self.assertLess(sum('assets.tcgdex.net'in r for r in requests[before:]),20,'100 cards must not eagerly download all artwork')
                self.assertTrue(page.evaluate("[...document.querySelectorAll('.card img')].every(i=>i.loading==='lazy')"))
                first=page.locator('.card').first.get_attribute('data-key');page.locator('#moreBtn').click();page.wait_for_function("document.querySelector('#pageLabel').textContent.startsWith('Page 2 ')");self.assertNotEqual(page.locator('.card').first.get_attribute('data-key'),first)
                page.locator('[data-condition="LP"]').click();page.wait_for_function("document.querySelector('#pageLabel').textContent.startsWith('Page 1 ')");self.assertIn('LP Price Unavailable',page.locator('.card').first.inner_text())
                page.locator('#cardView').select_option('compact');page.wait_for_function("document.querySelector('#cardList').classList.contains('compact')");page.locator('.card').nth(99).scroll_into_view_if_needed();self.assertTrue(page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
                page.reload(wait_until='domcontentloaded');page.wait_for_function("document.querySelectorAll('.card').length===100");self.assertEqual(page.locator('#pageSize').input_value(),'100');self.assertEqual(page.locator('[data-condition="LP"]').get_attribute('aria-pressed'),'true');self.assertEqual(page.locator('#cardView').input_value(),'compact')
                page.locator('#search').fill('Pikachu');page.wait_for_function("document.querySelectorAll('.card').length===100&&[...document.querySelectorAll('.card')].every(c=>/pikachu/i.test(c.textContent))");self.assertIn('Page 1 ',page.locator('#pageLabel').inner_text())
                page.locator('[data-nav="opportunities"]').click();page.wait_for_function("document.querySelectorAll('.card').length===100");self.assertIn('experimental',page.locator('#filterExplanation').inner_text().lower())
                page.evaluate("location.hash='#sets/lc'");page.wait_for_function("document.querySelector('#goalTotal')?.textContent==='110'&&document.querySelectorAll('.card').length===100");page.locator('#missingOnly').click();page.wait_for_function("document.querySelectorAll('.card').length===100");page.locator('#setGoal').select_option('master');page.wait_for_function("Number(document.querySelector('#goalTotal').textContent)>110&&document.querySelectorAll('.card').length===100")
                # Collection page also uses the same selected page size.
                owned=rows[:105]
                page.evaluate("cards=>{const records={};for(const c of cards)records[c.key]={status:'owned',quantity:1,condition:'Unknown',printing:c.printing||'Unconfirmed',edition:c.edition||'Unconfirmed',baseId:c.baseId||c.id,purchasePrice:null,purchaseDate:'',notes:'',entryPrice:null};const v={version:1,revision:1,updatedAt:new Date().toISOString(),records,goals:{}};localStorage.setItem('pokeradar_collection_v1',JSON.stringify(v));}",owned)
                page.goto(base+'#collection',wait_until='domcontentloaded');page.reload(wait_until='domcontentloaded');page.wait_for_function("document.querySelectorAll('.card').length===100");self.assertIn('105',page.locator('#showingCount').inner_text())
                # Serve authorized-looking TEST ONLY NM and LP observations for one actual identity.
                fixture=json.loads(json.dumps(summary));fixture['builtAt']='2098-01-01T00:00:00Z';c=next(c for c in rows if c['id']=='base1-4');today=page.evaluate('new Date().toISOString().slice(0,10)')
                o={'cardId':c['baseId'] or c['id'],'cardName':c['name'],'setId':c['setId'],'setName':sets[c['setId']]['name'],'collectorNumber':c['number'],'printing':c['printing'],'edition':c['edition'],'language':'en','source':'TEST Fixture A','metricType':'market_estimate','currency':'USD','observedDate':today,'fetchedAt':today+'T00:00:00Z','coverageStart':today,'termsUrl':'https://example.test/terms','url':'https://example.test/card','quality':'verified','verifiedIdentity':True,'provenance':'TEST ONLY exact condition fixture'}
                model={'category':'Buy Candidate','score':75,'confidence':70,'entryPrice':80,'change7':0,'change30':-5,'change90':-10,'setTrend':0,'reason':'Test own-history value','risk':'Test liquidity unknown','experimental':True}
                row=next(r for r in fixture['cards'] if r[cols.index('key')]==c['key']);row[cols.index('conditionData')]={'NM':{'sources':[{**o,'condition':'NM','price':100}],'opportunity':model},'LP':{'sources':[{**o,'condition':'LP','price':65}],'opportunity':{**model,'entryPrice':52}}};ConditionHandler.override=fixture
                page.goto(base,wait_until='domcontentloaded');page.locator('#refreshBtn').click();page.wait_for_function("!document.querySelector('#refreshBtn').classList.contains('busy')");page.locator('[data-condition="NM"]').click();page.locator('#search').fill('Charizard Base Set 4/102');page.wait_for_function("document.querySelectorAll('.card').length>0&&document.querySelector('.price-line strong').textContent==='$100.00'")
                self.assertIn('Verified NM',page.locator('.price-date').first.inner_text());page.locator('[data-condition="LP"]').click();page.wait_for_function("document.querySelector('.price-line strong').textContent==='$65.00'")
                self.assertNotIn('$100.00',page.locator('.card').first.inner_text());page.locator('[data-tab="investigate"]').first.click();page.wait_for_function("document.querySelectorAll('.card').length===1");self.assertIn('BUY CANDIDATE',page.locator('.card').inner_text())
                # Difference threshold affects the selected condition only.
                row[cols.index('conditionData')]['LP']['sources'].append({**o,'condition':'LP','price':76.05,'source':'TEST Fixture B'});fixture['builtAt']='2099-01-01T00:00:00Z';page.locator('#refreshBtn').click();page.wait_for_function("!document.querySelector('#refreshBtn').classList.contains('busy')");page.locator('[data-tab="all"]').first.click();page.wait_for_function("document.querySelectorAll('.card').length>0");page.locator('#reviewThreshold').select_option('15');page.wait_for_function("document.querySelector('.price-date').textContent==='Price Needs Review'");self.assertNotIn('Verified LP',page.locator('.card').first.inner_text())
                page.screenshot(path='/tmp/pokeradar-conditions-'+engine+'.png',full_page=False);self.assertTrue(page.evaluate('document.documentElement.scrollWidth<=innerWidth'));self.assertEqual(errors,[])
                print(json.dumps({'engine':engine,'hundredCardsSeconds':round(large,3),'passed':'100-card all/search/opportunities/set/missing/collection, compact scrolling, persistent condition and page size, exact NM/LP separation, unavailable and discrepancy states, lazy artwork/history'}));browser.close()
        finally:ConditionHandler.override=None;server.shutdown();server.server_close()
if __name__=='__main__':
    result=unittest.main(exit=False).result
    if not result.wasSuccessful():
        if os.environ.get('GITHUB_ACTIONS'):
            for _,trace in result.failures+result.errors:print('::error title=Condition browser regression::'+trace[-6000:].replace('%','%25').replace('\r','%0D').replace('\n','%0A'))
        raise SystemExit(1)
