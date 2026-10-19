"""Real generated catalog: pulse, diagnostics, manual vendor offers, backup and offline use."""
import functools
import http.server
import gzip
import io
import json
import os
from pathlib import Path
import tempfile
import threading
import unittest
from playwright.sync_api import sync_playwright
from mobile_smoke import QuietHandler,ROOT

class VendorHandler(QuietHandler):
    summary_override=None
    def send_head(self):
        if self.path.split('?')[0]=='/summary.json' and self.summary_override is not None:
            body=self.summary_override
            self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Encoding','gzip');self.send_header('Content-Length',str(len(body)));self.send_header('Cache-Control','no-store');self.end_headers();return io.BytesIO(body)
        return super().send_head()

class VendorWorkflow(unittest.TestCase):
    def test_vendor_market_pulse_inventory_and_offline(self):
        summary=json.loads((ROOT/'site/summary.json').read_text());cols=summary['columns']
        cards=[dict(zip(cols,r)) for r in summary['cards']]
        card=next(c for c in cards if c['setId']=='base1' and c['verifiedMatch'] and c['printing'] and c['edition'] and c['primary'] is not False)
        VendorHandler.summary_override=None
        handler=functools.partial(VendorHandler,directory=str(ROOT/'site'));server=http.server.ThreadingHTTPServer(('127.0.0.1',0),handler)
        threading.Thread(target=server.serve_forever,daemon=True).start()
        try:
            with sync_playwright() as p,tempfile.TemporaryDirectory(prefix='pokeradar-vendor-') as tmp:
                engine=os.environ.get('BROWSER_ENGINE','chromium');executable=os.environ.get('CHROMIUM_PATH') if engine=='chromium' else None
                browser=getattr(p,engine).launch(**({'executable_path':executable} if executable else {}))
                context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,accept_downloads=True)
                context.route('**/assets.tcgdex.net/**',lambda r:r.abort());context.route('**/images.pokemontcg.io/**',lambda r:r.abort())
                page=context.new_page();page.set_default_timeout(15000);errors=[];requests=[]
                page.on('pageerror',lambda error:errors.append(str(error)));page.on('request',lambda r:requests.append(r.url))
                page.goto(f'http://localhost:{server.server_port}/',wait_until='domcontentloaded');page.wait_for_selector('.pulse-card')
                self.assertIn('fixed',page.locator('#pulsePanel').inner_text().lower());self.assertGreater(page.locator('.pulse-values').count(),0)
                self.assertFalse(any('/prices.json' in url or '/details/' in url for url in requests))
                first_id=page.locator('[data-pulse-pin]').first.get_attribute('data-pulse-pin');page.locator('[data-pulse-pin]').first.click();self.assertIn(first_id,page.evaluate("JSON.parse(localStorage.getItem('pokeradar_pulse_pins_v1'))"))
                page.locator('[data-pulse-mode="chase"]').click();page.locator('[data-pulse-detail]').first.click();page.wait_for_selector('#modalHeading');self.assertIn('Set Market Pulse',page.locator('#modalHeading').inner_text());page.locator('#closeModal').click()
                page.locator('[data-nav="settings"]').click();page.wait_for_selector('#healthSignalCounts');self.assertIn(str(summary['health']['signals']['buy'])+' Buy Now',page.locator('#healthSignalCounts').inner_text())
                page.locator('[data-nav="opportunities"]').click();page.locator('[data-tab="investigate"]').first.click();page.wait_for_function("document.querySelectorAll('.card').length===0");self.assertIn('NM historical opportunity research',page.locator('#filterExplanation').inner_text());self.assertIn('Buy Now at This Price',page.locator('#filterExplanation').inner_text())
                # Counts reflect current filters, not the entire unfiltered catalog.
                page.locator('.advanced-filters > summary').click();page.locator('#priceMax').fill('1');page.locator('#priceMax').dispatch_event('change');page.wait_for_function("document.querySelector('#priceMax').value==='1'")
                expected=sum(1 for c in cards if c.get('conditionData',{} ) and (c.get('conditionData') or {}).get('NM',{}).get('verified') and (c.get('conditionData') or {}).get('NM',{}).get('price',999999)<=1)
                page.wait_for_function('n=>Number(document.querySelector("#allN").textContent.replaceAll(",",""))===n',arg=expected)
                page.locator('[data-nav="vendor"]').click();page.wait_for_selector('#vendorSearch');page.locator('#vendorSearch').fill(card['name']+'  '+card['number'])
                page.locator('[data-vendor-card='+json.dumps(card['key'])+']').click();page.wait_for_selector('#vendorForm');self.assertTrue(page.locator('#vendorPurchase').is_disabled());page.locator('.vendor-assumptions > summary').click()
                for id,value in {'vendorReference':'100','vendorCompSource':'Manual exact condition comp inspected at show','vendorSet30':'0','vendorCard30':'0','vendorProfit':'0','vendorConditionRisk':'0','vendorHolding':'0'}.items():page.locator('#'+id).fill(value)
                page.locator('#vendorLiquidity').select_option('normal');page.locator('#vendorVolatility').select_option('normal');page.locator('#vendorConfirm').check();page.locator('#vendorConditionConfirm').check()
                page.wait_for_function("document.querySelector('#vendorMaximum')?.textContent==='$80.00'");self.assertIn('MANUAL CONDITION COMP',page.locator('#vendorOffer').inner_text())
                page.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');self.assertTrue(page.evaluate('document.documentElement.scrollWidth<=innerWidth'),'Native select contents must stay inside the Vendor grid immediately after selection')
                page.locator('#vendorSet30').fill('-15');page.wait_for_function("document.querySelector('#vendorMaximum')?.textContent==='$62.50'")
                page.locator('#vendorSet30').fill('0');page.locator('#vendorFees').fill('15');page.locator('#vendorShipping').fill('5');page.locator('#vendorProfit').fill('15');page.wait_for_function("document.querySelector('#vendorMaximum')?.textContent==='$65.00'")
                page.locator('#vendorAsked').fill('90');page.wait_for_selector('#vendorOverMax');page.locator('#vendorQuantity').fill('2');page.locator('#vendorBundleAdd').click();self.assertIn('$130.00',page.locator('#vendorBundle').inner_text())
                page.locator('#vendorCondition').select_option('LP');self.assertEqual(page.locator('#vendorReference').input_value(),'');self.assertTrue(page.locator('#vendorPurchase').is_disabled())
                page.locator('#vendorReference').fill('100');page.locator('#vendorConditionConfirm').check();page.locator('#vendorCash').fill('80');page.locator('#vendorTrade').fill('60');page.locator('#vendorTradeFactor').fill('0.8');page.locator('#vendorLot').fill('Show bundle, Oct 19');page.locator('#vendorPurchase').click()
                page.wait_for_function("JSON.parse(localStorage.getItem('pokeradar_vendor_v1')||'null')?.lots.length===1")
                lot=page.evaluate("JSON.parse(localStorage.getItem('pokeradar_vendor_v1')).lots[0]");self.assertEqual(lot['unitCost'],64);self.assertEqual(lot['condition'],'LP');self.assertEqual(lot['printing'],card['printing'])
                page.locator('#vendorDeclineButton').click();page.wait_for_function("JSON.parse(localStorage.getItem('pokeradar_vendor_v1')).decisions.length===2")
                with page.expect_download() as download:page.locator('#vendorExport').click()
                csv=Path(tmp)/'inventory.csv';download.value.save_as(csv);self.assertIn('Show bundle, Oct 19',csv.read_text());page.locator('#vendorImport').set_input_files(csv);page.wait_for_function("document.querySelector('#toast').textContent.includes('restored')")
                page.locator('[data-vendor-sell]').first.click();page.locator('#vendorSaleQty').fill('1');page.locator('#vendorSaleProceeds').fill('85');page.locator('#vendorSaleForm button').click();page.wait_for_function("JSON.parse(localStorage.getItem('pokeradar_vendor_v1')).lots[0].sold===1")
                self.assertIn('$21.00',page.locator('#vendorInventory').inner_text())
                # A failed inventory write must preserve prior records.
                before=page.evaluate("localStorage.getItem('pokeradar_vendor_v1')");page.evaluate("()=>{const original=Storage.prototype.setItem;window.restoreVendorStorage=()=>{Storage.prototype.setItem=original;};Storage.prototype.setItem=function(k,v){if(k==='pokeradar_vendor_v1')throw new DOMException('Quota','QuotaExceededError');return original.call(this,k,v)}}")
                page.locator('#vendorDeclineButton').click();self.assertEqual(before,page.evaluate("localStorage.getItem('pokeradar_vendor_v1')"));page.evaluate('window.restoreVendorStorage()')
                page.screenshot(path=str(Path(tmp)/'vendor.png'),full_page=False)
                self.assertTrue(page.evaluate('document.documentElement.scrollWidth<=innerWidth'),page.evaluate("JSON.stringify([...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).slice(0,20).map(e=>({tag:e.tagName,id:e.id,class:e.className,right:e.getBoundingClientRect().right,width:e.getBoundingClientRect().width})))"));self.assertEqual(errors,[])
                revised=json.loads(json.dumps(summary));revised['builtAt']='2099-01-01T00:00:00Z'
                for row in revised['cards']:
                    if row[cols.index('key')]==card['key']:
                        row[cols.index('printing')]='Unconfirmed';row[cols.index('verifiedMatch')]=False;row[cols.index('variantVerified')]=False
                VendorHandler.summary_override=gzip.compress(json.dumps(revised).encode(),compresslevel=6)
                page.locator('#refreshBtn').click();page.wait_for_function("!document.querySelector('#refreshBtn').classList.contains('busy')&&document.querySelector('#vendorReference').value===''")
                self.assertFalse(page.locator('#vendorConfirm').is_checked());self.assertTrue(page.locator('#vendorPurchase').is_disabled())
                self.assertEqual(page.evaluate("JSON.parse(localStorage.getItem('pokeradar_vendor_v1')).lots[0].printing"),card['printing'])
                VendorHandler.summary_override=None
                if engine=='chromium':
                    page.evaluate('Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error("Service worker install timed out")),15000))])');page.wait_for_function('navigator.serviceWorker.controller!==null')
                    page.evaluate("fetch('summary.json',{cache:'no-cache'}).then(r=>r.json())");page.wait_for_function("async()=>Boolean(await caches.match(new URL('summary.json',location.href).href))")
                    context.set_offline(True);page.reload(wait_until='domcontentloaded');page.wait_for_selector('#vendorSearch');page.wait_for_function("document.querySelectorAll('[data-vendor-card]').length>0")
                    self.assertEqual(page.evaluate("JSON.parse(localStorage.getItem('pokeradar_vendor_v1')).lots[0].unitCost"),64)
                    page.locator('#vendorSearch').fill(card['name']+' '+card['number']);page.locator('[data-vendor-card='+json.dumps(card['key'])+']').click();self.assertIn('not a condition',page.locator('#vendorSavedQuote').inner_text())
                print(json.dumps({'engine':engine,'passed':'fixed cohort pulse, data health, filtered counts, distinct near-buy, exact manual condition comp, fees and declines, cash/trade/bundle, purchase/sale, CSV restore, failed-save protection, offline vendor shell'}));browser.close()
        finally:server.shutdown();server.server_close()

if __name__=='__main__':
    result=unittest.main(exit=False).result
    if not result.wasSuccessful():
        if os.environ.get('GITHUB_ACTIONS'):
            for _,trace in result.failures+result.errors:print('::error title=Vendor workflow regression::'+trace[-6000:].replace('%','%25').replace('\r','%0D').replace('\n','%0A'))
        raise SystemExit(1)
