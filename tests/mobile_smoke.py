"""Real browser checks: python tests/mobile_smoke.py (Playwright + Chromium required)."""
import functools
import gzip
import http.server
import json
import os
from pathlib import Path
import threading
import time
import unittest
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass


class MobileWorkflow(unittest.TestCase):
    def test_cached_mobile_workflow_and_loading_budget(self):
        summary = (ROOT / 'site/summary.json').read_bytes()
        self.assertLess(len(gzip.compress(summary)), 800_000, 'Compressed summary exceeds mobile budget')
        handler = functools.partial(QuietHandler, directory=str(ROOT / 'site'))
        server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            with sync_playwright() as p:
                engine = os.environ.get('BROWSER_ENGINE', 'chromium')
                executable = os.environ.get('CHROMIUM_PATH') if engine == 'chromium' else None
                browser = getattr(p, engine).launch(**({'executable_path': executable} if executable else {}))
                context = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
                page = context.new_page()
                errors, requests = [], []
                page.on('pageerror', lambda e: errors.append(str(e)))
                page.on('request', lambda r: requests.append(r.url))
                page.route('**/assets.tcgdex.net/**', lambda route: route.abort())
                if engine == 'chromium':
                    cdp = context.new_cdp_session(page)
                    cdp.send('Network.enable')
                    cdp.send('Network.emulateNetworkConditions', {
                        'offline': False, 'latency': 80, 'downloadThroughput': 1_000_000,
                        'uploadThroughput': 500_000,
                    })
                    cdp.send('Emulation.setCPUThrottlingRate', {'rate': 4})
                started = time.monotonic()
                page.goto(f'http://127.0.0.1:{server.server_port}/', wait_until='domcontentloaded')
                page.wait_for_function("document.querySelectorAll('.card').length > 0")
                elapsed = time.monotonic() - started
                self.assertLess(elapsed, 4, 'Mobile first card exceeds four-second budget')
                self.assertLessEqual(page.locator('.card').count(), 18)
                self.assertTrue(page.evaluate('document.documentElement.scrollWidth <= innerWidth'))
                self.assertFalse(any('/details/' in r or '/prices.json' in r or '/catalog.json' in r for r in requests))
                page.locator('#search').fill('Pikachu')
                page.wait_for_function("document.querySelectorAll('.card').length > 0 && [...document.querySelectorAll('.card')].every(e => /Pikachu/i.test(e.textContent))")
                page.locator('.save-btn').first.click()
                page.locator('[data-tab="saved"]').click()
                page.wait_for_function("document.querySelectorAll('.card').length === 1")
                page.locator('[data-detail]').first.click()
                self.assertTrue(page.locator('#modalOverlay').is_visible())
                page.wait_for_function("document.querySelector('#modalBody').textContent.includes('Unavailable')")
                page.wait_for_timeout(400)
                self.assertTrue(any('/details/' in r for r in requests))
                page.locator('#closeModal').click()
                # New analysis/catalog revisions must refresh even when the last quote timestamp is unchanged.
                revised = json.loads(summary)
                revised['builtAt'] = '2026-01-01T00:00:00.000Z'
                revised['coverage']['eligible'] += 1
                # A synthetic fresh backend Buy row exercises expiration even on zero-signal days.
                revised['cards'][0].update(signal='buy', score=90, verifiedMatch=True, stale=False,
                                           price=25, asOf=revised['updatedAt'][:10])
                page.route('**/summary.json*', lambda route: route.fulfill(
                    status=200, content_type='application/json', body=json.dumps(revised)))
                page.wait_for_function("!document.querySelector('#refreshBtn').classList.contains('busy')")
                page.locator('#refreshBtn').click()
                expected = revised['coverage']['eligible']
                page.wait_for_function("expected => Number(document.querySelector('#statEligible').textContent.replace(/,/g, '')) === expected", arg=expected)
                page.wait_for_function("Number(document.querySelector('#buyN').textContent) > 0")
                page.evaluate("updated => {const later = Date.parse(updated) + 6 * 86400000; Date.now = () => later;}", revised['updatedAt'])
                page.wait_for_function("!document.querySelector('#refreshBtn').classList.contains('busy')")
                page.locator('#refreshBtn').click()
                page.wait_for_function("Number(document.querySelector('#buyN').textContent) === 0")
                page.wait_for_function("!document.querySelector('#refreshBtn').classList.contains('busy')")
                self.assertEqual(page.locator('#buyN').inner_text(), '0')
                # Saved summary must paint when the background refresh cannot reach the server.
                page.wait_for_timeout(300)
                page.route('**/summary.json*', lambda route: route.abort())
                cached_started = time.monotonic()
                page.reload(wait_until='domcontentloaded')
                page.wait_for_function("document.querySelectorAll('.card').length > 0")
                cached_elapsed = time.monotonic() - cached_started
                self.assertLess(cached_elapsed, 2, 'Saved cards should paint without a successful data request')
                page.locator('[data-tab="saved"]').click()
                page.wait_for_function("document.querySelectorAll('.card').length === 1")
                self.assertEqual(errors, [])
                print(json.dumps({'engine': engine, 'mobileFirstCardsSeconds': round(elapsed, 3), 'summaryBytes': len(summary),
                                  'summaryGzipBytes': len(gzip.compress(summary)), 'cpuSlowdown': 4 if engine == 'chromium' else 1,
                                  'networkBytesPerSecond': 1_000_000 if engine == 'chromium' else None,
                                  'networkLatencyMs': 80 if engine == 'chromium' else None,
                                  'cachedCardsSeconds': round(cached_elapsed, 3)}))
                if engine == 'chromium':
                    # Exercise the actual installed shell, not just the data-error fallback.
                    installed = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
                    installed.route('**/assets.tcgdex.net/**', lambda route: route.abort())
                    offline_page = installed.new_page()
                    offline_page.goto(f'http://localhost:{server.server_port}/', wait_until='domcontentloaded')
                    offline_page.wait_for_function("document.querySelectorAll('.card').length > 0 && localStorage.getItem('pokeradar_snapshot_v4')")
                    offline_page.evaluate('navigator.serviceWorker.ready')
                    offline_page.wait_for_function('navigator.serviceWorker.controller !== null')
                    offline_page.evaluate("fetch('summary.json', {cache: 'no-cache'}).then(response => response.json())")
                    offline_page.wait_for_function("async () => Boolean(await caches.match(new URL('summary.json', location.href).href))")
                    installed.set_offline(True)
                    offline_page.reload(wait_until='domcontentloaded')
                    offline_page.wait_for_function("document.querySelectorAll('.card').length > 0")
                    self.assertLessEqual(offline_page.locator('.card').count(), 18)
                    self.assertTrue(offline_page.evaluate('document.documentElement.scrollWidth <= innerWidth'))
                    self.assertEqual(offline_page.evaluate("fetch('summary.json').then(response => response.headers.get('X-Pokeradar-Cache'))"), 'offline')
                    installed.close()
                browser.close()
        finally:
            server.shutdown()
            server.server_close()


if __name__ == '__main__':
    unittest.main()
