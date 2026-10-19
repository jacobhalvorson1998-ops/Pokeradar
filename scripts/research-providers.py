"""Read official documentation only. No accounts, API keys, pricing calls or scraping of card charts."""
import concurrent.futures
import datetime
import hashlib
import html.parser
import json
import os
from pathlib import Path
import re
import urllib.error
import urllib.request

URLS={
    'TickerMint developers':'https://tickermint.cards/developers',
    'TickerMint terms':'https://tickermint.cards/terms',
    'TickerMint store repricing':'https://tickermint.cards/developers/for/store-repricing',
    'Scrydex price history':'https://scrydex.com/docs/pokemon/price-history',
    'Scrydex prices':'https://scrydex.com/docs/getting-started/prices',
    'Scrydex terms':'https://scrydex.com/terms',
    'JustTCG changelog':'https://justtcg.com/docs/changelog',
    'PriceCharting API':'https://www.pricecharting.com/api-documentation',
    'TCGplayer developer access':'https://docs.tcgplayer.com/docs/getting-started',
    'TCGplayer market definition':'https://help.tcgplayer.com/hc/en-us/articles/213588017-TCGplayer-Market-Price',
}
class Text(html.parser.HTMLParser):
    def __init__(self):super().__init__();self.parts=[];self.skip=0
    def handle_starttag(self,tag,attrs):
        if tag in ('script','style','noscript'):self.skip+=1
        if tag in ('p','li','h1','h2','h3','tr','br'):self.parts.append('\n')
    def handle_endtag(self,tag):
        if tag in ('script','style','noscript'):self.skip=max(0,self.skip-1)
    def handle_data(self,data):
        if not self.skip:self.parts.append(data)

def probe(item):
    name,url=item
    try:
        with urllib.request.urlopen(url,timeout=25) as response:
            raw=response.read(3_000_000);parser=Text();parser.feed(raw.decode('utf-8',errors='replace'))
            text='\n'.join(' '.join(line.split()) for line in ''.join(parser.parts).splitlines() if line.strip())
            words=re.compile(r'commercial|licens|\$|history|historical|Feb|2024|2025|condition|variant|bulk|rate limit|api key|per month|plan|tier|resale',re.I)
            snippets=[line[:1800] for line in text.splitlines() if words.search(line)][:45]
            return {'name':name,'url':url,'status':response.status,'finalUrl':response.url,'sha256':hashlib.sha256(raw).hexdigest(),'snippets':snippets,'note':'Public documentation only; authorized API history coverage and commercial rights are NOT established by a page fetch.'}
    except (urllib.error.URLError,TimeoutError) as error:return {'name':name,'url':url,'status':getattr(error,'code',None),'error':str(error),'note':'Access failed; no verification bypass or paid API request was attempted.'}

if __name__=='__main__':
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:results=list(pool.map(probe,URLS.items()))
    report={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sources':results,'credentialsUsed':False,'paidRequests':0,'registrations':0}
    dest=Path(os.environ.get('PROVIDER_RESEARCH_OUTPUT','/tmp/pokeradar-provider-research.json'));dest.write_text(json.dumps(report,indent=2))
    for item in results:
        message=json.dumps(item,ensure_ascii=False)
        print(message)
        if os.environ.get('GITHUB_ACTIONS'):
            escaped=message.replace('%','%25').replace('\r','%0D').replace('\n','%0A')
            print('::notice title=Official provider documentation::'+escaped)
