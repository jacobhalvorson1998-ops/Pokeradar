"""Aggregate prices, opaque IDs and 100-card browsing on mobile Chromium/WebKit."""
import functools,gzip,io,json,os,tempfile,threading,time,unittest
import http.server
from pathlib import Path
from playwright.sync_api import sync_playwright
from mobile_smoke import QuietHandler,ROOT
class MarketHandler(QuietHandler):
    override=None
    def send_head(self):
        if self.override is not None and self.path.split('?')[0].endswith('/summary.json'):
            data=gzip.compress(json.dumps(self.override).encode(),compresslevel=6)
            self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Encoding','gzip');self.send_header('Content-Length',str(len(data)));self.end_headers();return io.BytesIO(data)
        return super().send_head()
class MarketWorkflow(unittest.TestCase):
    def test_market_prices_and_large_pages(self):
        summary=json.loads((ROOT/'site/summary.json').read_text());cols=summary['columns'];rows=[dict(zip(cols,r)) for r in summary['cards']];sets={s['id']:s for s in summary['sets']}
        MarketHandler.override=None
        server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(MarketHandler,directory=str(ROOT/'site')));threading.Thread(target=server.serve_forever,daemon=True).start()
        try:
            with sync_playwright() as p,tempfile.TemporaryDirectory(prefix='pokeradar-market-') as tmp:
                engine=os.environ.get('BROWSER_ENGINE','chromium');executable=os.environ.get('CHROMIUM_PATH') if engine=='chromium' else None
                browser=getattr(p,engine).launch(**({'executable_path':executable} if executable else {}));context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
                requests=[];context.on('request',lambda r:requests.append(r.url));context.route('**/assets.tcgdex.net/**',lambda r:r.abort());context.route('**/images.pokemontcg.io/**',lambda r:r.abort())
                page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));base=f'http://127.0.0.1:{server.server_port}/'
                page.goto(base,wait_until='domcontentloaded');page.wait_for_function("document.querySelectorAll('.card').length===20")
                self.assertEqual(page.locator('#conditionSelector').count(),0);self.assertIn('market price',page.locator('.card').first.inner_text().lower());self.assertIn('$',page.locator('.price-line strong').first.inner_text());self.assertIn('TickerMint / TCGplayer',page.locator('.price-date').first.inner_text())
                before=len(requests);start=time.monotonic();page.locator('#pageSize').select_option('100');page.wait_for_function("document.querySelectorAll('.card').length===100");large=time.monotonic()-start;self.assertLess(large,3)
                self.assertFalse(any('/details/'in r or '/catalog.json'in r or '/prices.json'in r for r in requests[before:]));self.assertLess(sum('assets.tcgdex.net'in r for r in requests[before:]),20,'100 cards must not eagerly download all artwork')
                self.assertTrue(page.evaluate("[...document.querySelectorAll('.card img')].every(i=>i.loading==='lazy')"))
                first=page.locator('.card').first.get_attribute('data-key');page.locator('#moreBtn').click();page.wait_for_function("document.querySelector('#pageLabel').textContent.startsWith('Page 2 ')");self.assertNotEqual(page.locator('.card').first.get_attribute('data-key'),first)
                page.locator('#cardView').select_option('compact');page.wait_for_function("document.querySelector('#cardList').classList.contains('compact')");page.locator('.card').nth(99).scroll_into_view_if_needed();self.assertTrue(page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
                page.reload(wait_until='domcontentloaded');page.wait_for_function("document.querySelectorAll('.card').length===100");self.assertEqual(page.locator('#pageSize').input_value(),'100');self.assertEqual(page.locator('#cardView').input_value(),'compact')
                page.locator('#search').fill('Pikachu');page.wait_for_function("document.querySelectorAll('.card').length===100&&[...document.querySelectorAll('.card')].every(c=>/pikachu/i.test(c.textContent))");self.assertIn('Page 1 ',page.locator('#pageLabel').inner_text())
                page.locator('[data-nav="opportunities"]').click();page.wait_for_function("document.querySelectorAll('.card').length===100");self.assertIn('market-price research',page.locator('#filterExplanation').inner_text().lower())
                page.evaluate("location.hash='#sets/lc'");page.wait_for_function("document.querySelector('#goalTotal')?.textContent==='110'&&document.querySelectorAll('.card').length===100");page.locator('#missingOnly').click();page.wait_for_function("document.querySelectorAll('.card').length===100");page.locator('#setGoal').select_option('master');page.wait_for_function("Number(document.querySelector('#goalTotal').textContent)>110&&document.querySelectorAll('.card').length===100")
                # Collection page also uses the same selected page size.
                owned=rows[:105]
                page.evaluate("cards=>{const records={};for(const c of cards)records[c.key]={status:'owned',quantity:1,condition:'Unknown',printing:c.printing||'Unconfirmed',edition:c.edition||'Unconfirmed',baseId:c.baseId||c.id,purchasePrice:null,purchaseDate:'',notes:'',entryPrice:null};const v={version:1,revision:1,updatedAt:new Date().toISOString(),records,goals:{}};localStorage.setItem('pokeradar_collection_v1',JSON.stringify(v));}",owned)
                page.goto(base+'#collection',wait_until='domcontentloaded');page.reload(wait_until='domcontentloaded');page.wait_for_function("document.querySelectorAll('.card').length===100");self.assertIn('105',page.locator('#showingCount').inner_text())
                # The two punctuation-bearing Unown IDs must fetch actual histories.
                page.goto(base,wait_until='domcontentloaded');page.locator('#pageSize').select_option('20');page.locator('#cardView').select_option('detailed');page.locator('#search').fill('Unown Unseen Forces')
                page.wait_for_function("document.querySelectorAll('.card').length>0")
                for c in [r for r in rows if r['id'] in ['exu-!','exu-%3F'] and r['hasDetail']]:
                    with page.expect_response(lambda r:'/details/' in r.url) as result:page.locator('[data-key='+json.dumps(c['key'])+'] [data-detail]').first.click()
                    self.assertEqual(result.value.status,200);self.assertEqual(result.value.json()['id'],c['id']);self.assertEqual(result.value.json()['key'],c['key']);page.wait_for_selector('#detailChart svg');page.locator('#closeModal').click()
                # Edition prices come from actual independent exact provider series.
                charizards=[r for r in rows if r['baseId']=='base1-4'];known=[r for r in charizards if r['edition'] in ['Unlimited','First Edition','Shadowless']];self.assertEqual(len(known),3);self.assertEqual(len({(r['productId'],r['printing']) for r in known}),3);self.assertTrue(all(r['price'] is None for r in charizards if not r['verifiedMatch']))
                page.locator('#search').fill('Charizard Base Set 4/102');page.wait_for_function("n=>document.querySelectorAll('.card').length===n",arg=len(charizards))
                for c in charizards:
                    tile=page.locator('[data-key='+json.dumps(c['key'])+']');self.assertIn(c['identityLabel'],tile.inner_text())
                    if c['verifiedMatch'] and c['price'] is not None:self.assertIn('$',tile.locator('.price-line strong').inner_text())
                self.assertEqual(page.locator('#conditionSelector').count(),0)
                page.screenshot(path='/tmp/pokeradar-market-'+engine+'.png',full_page=False);self.assertTrue(page.evaluate('document.documentElement.scrollWidth<=innerWidth'));self.assertEqual(errors,[])
                print(json.dumps({'engine':engine,'hundredCardsSeconds':round(large,3),'passed':'restored aggregate prices, 100-card all/search/opportunities/set/missing/collection, compact scrolling, persistent preferences, exact Charizard editions, punctuation Unown detail paths, lazy artwork/history'}));browser.close()
        finally:MarketHandler.override=None;server.shutdown();server.server_close()
if __name__=='__main__':
    result=unittest.main(exit=False).result
    if not result.wasSuccessful():
        if os.environ.get('GITHUB_ACTIONS'):
            for _,trace in result.failures+result.errors:print('::error title=Market browser regression::'+trace[-6000:].replace('%','%25').replace('\r','%0D').replace('\n','%0A'))
        raise SystemExit(1)
