"""Verify the deployed Pages artifact with normal browser TLS verification."""
import json
import sys
import time
import urllib.request
from playwright.sync_api import sync_playwright

base = sys.argv[1].rstrip('/') + '/'
last_error = None
for attempt in range(6):
    try:
        with urllib.request.urlopen(base + 'summary.json', timeout=20) as response:
            snapshot = json.load(response)
        assert snapshot['version'] == 4 and snapshot['coverage']['verified'] > 0
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            response = page.goto(base, wait_until='domcontentloaded')
            assert response.status == 200
            page.wait_for_function("document.querySelectorAll('.card').length > 0")
            assert page.locator('.card').count() <= 18
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            key = page.locator('.card').first.get_attribute('data-key')
            with page.expect_response(lambda response: '/details/' in response.url and response.status == 200) as detail_response:
                page.locator('[data-detail]').first.click()
            detail = detail_response.value.json()
            assert detail['key'] == key and isinstance(detail['history'], list) and detail['risk']
            page.wait_for_function("document.querySelector('#modalBody').textContent.includes('Main risk')")
            assert not errors, errors
            browser.close()
        print(json.dumps({'publicSite': base, 'catalog': snapshot['coverage']['eligible'],
                          'verified': snapshot['coverage']['verified'], 'mobileBrowser': 'passed'}))
        break
    except Exception as error:
        last_error = error
        if attempt == 5:
            raise
        time.sleep(10)  # Allow the Pages/CDN deployment to propagate.
