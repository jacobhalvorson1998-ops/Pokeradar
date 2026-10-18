/* PokéRadar Mobile v2 — first paint from static catalog, prices only from verified sources. */
'use strict';
const $=id=>document.getElementById(id);
const STORE='pokeradar_mobile_v3', SAVED='pokeradar_saved_mobile';
const state={coverage:null,catalog:[],market:{},saved:new Set(),tab:'all',query:'',rarity:'all',sort:'oldest',limit:18,updating:false,progress:0,total:0,connected:false,toastTimer:null,drawScheduled:false};
const fmtMoney=n=>Number.isFinite(n)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n):'—';
const fmtDelta=n=>Number.isFinite(n)?`${n>0?'+':''}${n.toFixed(1)}%`:'—';
const esc=s=>String(s??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
const validHttps=s=>{try{const u=new URL(s);return u.protocol==='https:'?u.href:''}catch{return ''}};
const tcgLink=c=>`https://www.tcgplayer.com/search/pokemon/product?productLineName=pokemon&q=${encodeURIComponent(`${c.name} ${c.number} ${c.set}`)}&view=grid`;
const ageDays=s=>s?Math.max(0,(Date.now()-Date.parse(s+'T12:00:00Z'))/86400000):Infinity;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function readStore(){try{const s=JSON.parse(localStorage.getItem(STORE)||'{}');if(s&&s.version===3&&s.market&&typeof s.market==='object')state.market=s.market}catch{}try{state.saved=new Set(JSON.parse(localStorage.getItem(SAVED)||'[]'))}catch{}}
let storeTimer;function persist(){clearTimeout(storeTimer);storeTimer=setTimeout(()=>{try{localStorage.setItem(STORE,JSON.stringify({version:3,market:state.market,savedAt:new Date().toISOString()}));localStorage.setItem(SAVED,JSON.stringify([...state.saved]))}catch(e){console.warn('Browser storage limit reached',e)}},250)}
function nearest(series,days){if(!Array.isArray(series)||series.length<3)return null;const today=Date.parse(series.at(-1)[0]+'T12:00:00Z');const target=today-days*86400000;let best=null,dist=Infinity;for(let i=0;i<series.length-1;i++){const diff=Math.abs(Date.parse(series[i][0]+'T12:00:00Z')-target);if(diff<dist){dist=diff;best=series[i][1]}}return dist<=Math.max(3,days*.25)*86400000?best:null}
function metrics(m){const series=Array.isArray(m.history)?m.history.filter(x=>Array.isArray(x)&&Number.isFinite(x[1])&&x[1]>0):[];
 let p=Number.isFinite(m.price)&&ageDays(m.asOf)<=4?m.price:null;
 let asOf=m.asOf||null;
 if(p===null&&series.length){p=series.at(-1)[1];asOf=series.at(-1)[0]}
 const stale=!Number.isFinite(ageDays(asOf))||ageDays(asOf)>4;
 const cs=series.slice(-120);if(cs.length&&p!==null&&asOf>=cs.at(-1)[0]){if(asOf===cs.at(-1)[0])cs[cs.length-1]=[asOf,p];else cs.push([asOf,p])}
 const delta=days=>{const ref=nearest(cs,days);return ref&&p!==null?Math.round((p/ref-1)*1000)/10:null};
 const past90=cs.filter(x=>ageDays(x[0])<=90);const hi=past90.length?Math.max(...past90.map(x=>x[1])):null;
 return {price:p,asOf,stale,days:cs.length,change7:delta(7),change30:delta(30),change90:delta(90),drop90:hi&&p?Math.round((p/hi-1)*1000)/10:null};
}
function recommendation(c,d){
 if(!c.productId||!c.verifiedMatch||d.price===null||d.stale)return {signal:'pending',score:null,reason:'Waiting for a recent, correctly matched card price.'};
 if(d.price>100)return {signal:'over',score:null,reason:'Above the $100 raw-market budget.'};
 if(d.change7===null||d.change30===null||d.drop90===null||d.days<28)return {signal:'pending',score:null,reason:'Verified price available; collecting 7- and 30-day history before making a recommendation.'};
 const decline=Math.min(100,Math.max(0,-d.drop90)*3.1);
 const trend=d.change7>=-3&&d.change7<=4?95:d.change7< -3?35:60;
 const ageStrength=Math.min(100,20+Math.max(0,new Date().getFullYear()-c.year)*4);
 // Older cards receive 28% of the opportunity score, increased from 10%.
 const score=Math.round(.31*decline+.19*c.hype+.22*trend+.28*ageStrength);
 if(d.drop90<=-18&&d.change30<=-7&&d.change7>=-3&&d.change7<=4&&c.hype>=75)return {signal:'buy',score,reason:'Price corrected meaningfully and the last week stabilized. Verify a Near Mint listing and actual inventory.'};
 if((d.drop90<=-12||d.change30<=-10)&&(d.change7< -3||(d.change30< -16&&d.change7<0)))return {signal:'wait',score,reason:'The price is still sliding; watch for stabilization.'};
 return {signal:'watch',score,reason:'No strong pullback-plus-stabilization signal yet.'};
}
function enrich(c){const m=state.market[c.key]||{},d=metrics(m),s=recommendation({...c,...m},d);return {...c,...m,...d,...s}}
function observed(c){return c.verifiedMatch&&c.price!==null&&!c.stale}
function qualified(c){return observed(c)&&c.price<=100&&c.price>0}
function sorted(){let list=state.catalog.map(enrich).filter(c=>!observed(c)||c.price<=100);const all=list.filter(qualified),buys=all.filter(c=>c.signal==='buy'),waits=all.filter(c=>c.signal==='wait'),watches=all.filter(c=>c.signal==='watch'||c.signal==='pending');
 $('statEligible').textContent=all.length;$('statBuy').textContent=buys.length;$('statWait').textContent=waits.length;
 const biggest=all.filter(c=>Number.isFinite(c.change30)).sort((a,b)=>a.change30-b.change30)[0];$('statDip').textContent=biggest?fmtDelta(biggest.change30):'—';$('statDipName').textContent=biggest?biggest.name:'Awaiting verified history';
 $('allN').textContent=list.length;$('buyN').textContent=buys.length;$('waitN').textContent=waits.length;$('watchN').textContent=watches.length;$('savedN').textContent=state.saved.size;
 if(state.tab==='buy')list=buys;else if(state.tab==='wait')list=waits;else if(state.tab==='watch')list=watches;else if(state.tab==='saved')list=list.filter(c=>state.saved.has(c.key));
 if(state.query){const q=state.query.toLowerCase();list=list.filter(c=>`${c.name} ${c.set} ${c.number}`.toLowerCase().includes(q))}
 if(state.rarity!=='all')list=list.filter(c=>c.rarity===state.rarity);
 const pendingRank=c=>c.signal==='buy'?0:c.signal==='wait'?1:c.signal==='watch'?2:c.signal==='pending'?3:4;
 list.sort((a,b)=>state.sort==='oldest'?a.year-b.year:state.sort==='newest'?b.year-a.year:state.sort==='alpha'?a.name.localeCompare(b.name):state.sort==='hype'?b.hype-a.hype:state.sort==='price'?(a.price??1e10)-(b.price??1e10):state.sort==='dip'?(a.change30??1e10)-(b.change30??1e10):(a.score!==null&&b.score===null?-1:b.score!==null&&a.score===null?1:0)||pendingRank(a)-pendingRank(b)||(b.score??-1)-(a.score??-1)||a.year-b.year||b.hype-a.hype);
 return list;
}
function cardHtml(c){const priceText=observed(c)?fmtMoney(c.price):'Price pending', sig=c.price>100&&observed(c)?'over':c.signal;
 const badge={buy:'● BUY NOW',wait:'● WAIT TO BUY',watch:'◉ WATCH',pending:'◷ VERIFYING',over:'OVER $100'}[sig]||'VERIFYING';
 const delta=qualified(c)&&Number.isFinite(c.change30)?`<span class="delta ${c.change30<=0?'down':'up'}">${esc(fmtDelta(c.change30))} 30D</span>`:'';
 const img=validHttps(c.image);const imgHtml=img?`<img class="card-image" src="${esc(img)}" alt="${esc(c.name)} card art" loading="lazy" decoding="async">`:`<div class="card-placeholder" aria-hidden="true">◈</div>`;
 const tcg=tcgLink(c);const mint=validHttps(c.tickermintUrl);const sourceLink=observed(c)&&mint?`<a href="${esc(mint)}" target="_blank" rel="noopener noreferrer" title="Verified price source on TickerMint" class="mini-source">price source ↗</a>`:'';
 return `<article class="card" data-key="${esc(c.key)}"><div class="card-top"><a href="${esc(tcg)}" target="_blank" rel="noopener noreferrer" title="Find the card on TCGplayer">${imgHtml}</a><div class="card-info"><div class="rarity">${esc(c.rarity)}</div><h3><a href="${esc(tcg)}" target="_blank" rel="noopener noreferrer">${esc(c.name)} ↗</a></h3><div class="set">${esc(c.set)} · ${esc(c.number)}<br>${c.year}</div><div class="price-line"><strong>${priceText}</strong>${delta}</div>${sourceLink}</div></div><div class="signal-row"><span class="signal ${sig==='over'?'pending':sig}">${badge}</span><span class="score">FAN <b>${c.hype}</b> · SCORE <b>${Number.isFinite(c.score)?c.score:'—'}</b></span></div><div class="card-links"><a class="tcg-link" href="${esc(tcg)}" target="_blank" rel="noopener noreferrer">Check TCGplayer ↗</a><button class="save-btn ${state.saved.has(c.key)?'active':''}" aria-label="${state.saved.has(c.key)?'Unsave':'Save'} ${esc(c.name)}" data-save="${esc(c.key)}">${state.saved.has(c.key)?'★':'☆'}</button></div><button class="card-inspect" type="button" data-detail="${esc(c.key)}"><span>Price history &amp; buy/wait reasoning</span><span>›</span></button></article>`;
}
function draw(){state.drawScheduled=false;const all=sorted(),visible=all.slice(0,state.limit);$('cardList').innerHTML=visible.map(cardHtml).join('');$('showingCount').textContent=`Showing ${visible.length} of ${all.length} cards`; $('resultsLabel').textContent=`${state.catalog.length.toLocaleString()} discovered chase cards (2008–now) · ${state.catalog.filter(c=>observed(enrich(c))).length} recent price quotes · scans expand daily`;
 $('empty').hidden=all.length!==0;$('moreBtn').hidden=state.limit>=all.length;document.querySelectorAll('[data-tab]').forEach(b=>{b.classList.toggle('active',b.dataset.tab===state.tab);b.setAttribute('aria-selected',String(b.dataset.tab===state.tab))})}
function scheduleDraw(){if(state.drawScheduled)return;state.drawScheduled=true;requestAnimationFrame(draw)}
function setStatus(mode,label){$('connection').className='connection '+mode;$('connectionText').textContent=label}
function syncProgress(done,total,title,description){$('syncTitle').textContent=title;$('syncDescription').textContent=description;$('syncProgress').style.width=(total?Math.round(done/total*100):0)+'%';$('syncPercent').textContent=(total?Math.round(done/total*100):0)+'%';const recent=Object.values(state.market).map(x=>x.asOf).filter(Boolean).sort().at(-1);$('syncDate').textContent=recent?`Latest provider quote: ${recent} · prices may vary by condition`:'No verified market snapshot yet'}
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(state.toastTimer);state.toastTimer=setTimeout(()=>$('toast').hidden=true,3500)}
async function fetchJSON(file){const url=new URL(file,location.href);url.searchParams.set('t',String(Date.now()));const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),20000);try{const r=await fetch(url.toString(),{cache:'no-store',signal:ctrl.signal});if(!r.ok)throw Error(`${r.status} ${file}`);return await r.json()}finally{clearTimeout(timer)}}
async function runSync(force=false){
 if(state.updating)return;state.updating=true;$('refreshBtn').classList.add('busy');$('retryBtn').disabled=true;setStatus('','Checking');
 try{
  const catalog=await fetchJSON('catalog.json');if(!Array.isArray(catalog.cards))throw Error('The catalog file is missing cards');
  state.catalog=catalog.cards;state.coverage=catalog.progress||null;scheduleDraw();
  syncProgress(1,2,'Card list updated',`${state.catalog.length.toLocaleString()} cards discovered; retrieving saved daily price snapshots…`);
  const snapshot=await fetchJSON('prices.json');if(snapshot.prices&&typeof snapshot.prices==='object'){
   for(const [key,record] of Object.entries(snapshot.prices)){
    const old=state.market[key];
    if(!old||String(record.asOf||'')>=String(old.asOf||''))state.market[key]=record;
   }
  }
  persist();scheduleDraw();setStatus('ready',`${state.catalog.filter(c=>observed(enrich(c))).length} priced`);
  const covered=state.coverage?.universe?`${state.coverage.catalogued.toLocaleString()} / ${state.coverage.universe.toLocaleString()} cards reviewed for rarity`:'Catalog scan begins after publication';
  syncProgress(2,2,'Latest saved market snapshot loaded',`${covered} · New prices publish from the daily GitHub Action.`);
  $('syncDate').textContent=snapshot.updatedAt?`Price file refreshed ${new Date(snapshot.updatedAt).toLocaleString()}`:'No live price snapshot published yet';
  if(force)toast('Checked newest published data. GitHub updates the source daily.');
 }catch(e){setStatus('error','Cached');$('syncTitle').textContent='Showing saved card data';$('syncDescription').textContent='The published data could not be reached. Existing cached information remains available. '+e.message;toast('No new snapshot available; using cached data.');}
 finally{state.updating=false;$('refreshBtn').classList.remove('busy');$('retryBtn').disabled=false;scheduleDraw()}
}
function chart(series){if(!Array.isArray(series)||series.length<3)return '<p>Historical chart becomes available when price history is verified.</p>';const rows=series.filter(p=>Array.isArray(p)&&Number.isFinite(p[1])).slice(-90);if(rows.length<3)return '<p>Not enough historical observations yet.</p>';const prices=rows.map(x=>x[1]),min=Math.min(...prices),max=Math.max(...prices),range=max-min||1;const coords=prices.map((v,i)=>[15+i*595/(prices.length-1),148-110*(v-min)/range]);const path=coords.map(([x,y],i)=>`${i?'L':'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');const area=path+` L${coords.at(-1)[0].toFixed(2)} 152 L15 152 Z`;return `<svg viewBox="0 0 640 190" preserveAspectRatio="none" role="img" aria-label="Last ${rows.length} observed prices"><defs><linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#87e7ce" stop-opacity=".28"/><stop offset="1" stop-color="#87e7ce" stop-opacity="0"/></linearGradient></defs><path d="M15 38 H610 M15 95 H610 M15 152 H610" stroke="#33546a" fill="none" stroke-dasharray="4 5"/><path d="${area}" fill="url(#chartFill)"/><path d="${path}" fill="none" stroke="#a4ecd1" stroke-width="3" stroke-linejoin="round"/><circle cx="${coords.at(-1)[0]}" cy="${coords.at(-1)[1]}" r="4" fill="#d1ffe4"/><text x="7" y="19" font-size="11" fill="#a9c9c9">${esc(fmtMoney(max))}</text><text x="7" y="176" font-size="11" fill="#a9c9c9">${esc(fmtMoney(min))}</text><text x="610" y="176" text-anchor="end" font-size="10" fill="#a9c9c9">${esc(rows.at(-1)[0])}</text></svg>`}
function modal(html){$('modalBody').innerHTML=html;$('modalOverlay').hidden=false;document.body.style.overflow='hidden';$('closeModal').focus()}
function closeModal(){$('modalOverlay').hidden=true;document.body.style.overflow=''}
function detail(c){const link=tcgLink(c),img=validHttps(c.image);const price=observed(c)?fmtMoney(c.price):'Price pending';const mint=validHttps(c.tickermintUrl);
 modal(`<div class="modal-intro">${img?`<img src="${esc(img)}" alt="${esc(c.name)} artwork" loading="lazy">`:'<div class="card-placeholder">◈</div>'}<div><div class="rarity">${esc(c.rarity)}</div><h2 id="modalHeading">${esc(c.name)}</h2><div class="set">${esc(c.set)} · ${esc(c.number)} · ${c.year}</div><div class="modal-price">${price}</div><div class="modal-caption">${esc(c.asOf||'No verified market date')} · Raw market average</div></div></div><div class="modal-metrics"><div><small>7D movement</small><b>${fmtDelta(c.change7)}</b></div><div><small>30D movement</small><b>${fmtDelta(c.change30)}</b></div><div><small>90D pullback</small><b>${fmtDelta(c.drop90)}</b></div></div><div class="chart-wrap">${chart(c.history)}</div><div class="modal-comment"><b>${esc(c.signal.toUpperCase())} · Why:</b> ${esc(c.reason)}</div><p class="modal-caption"><b>Fan appeal:</b> ${c.hype}/100 is a subjective popularity estimate, not a measured search or sales index. <b>Opportunity score:</b> ${c.score===null?'Not available':c.score+'/100'} (heuristic, not backtested). Historical observations may start in 2024 even for older sets.</p><div class="modal-cta"><a href="${esc(link)}" target="_blank" rel="noopener noreferrer">Check on TCGplayer ↗</a>${mint?`<a class="secondary" href="${esc(mint)}" target="_blank" rel="noopener noreferrer">Price source: TickerMint ↗</a>`:''}</div><p class="modal-caption">The price source does not confirm Near Mint condition or that a listing can be bought for this amount. Check the exact printing and final delivered price before purchasing.</p>`)}
function method(){modal(`<div class="modal-method"><div class="section-kicker">HOW THE SCANNER WORKS</div><h2 id="modalHeading">Older cards get priority.</h2><p>PokéRadar continuously discovers English cards from 2008 onward, rather than relying on a fixed 153-card list. Eligible rarities include IR, SIR, alternate art, Gallery, and older secret/ultra/legend/prime/LV.X rarities. The initial catalog may be incomplete while background discovery processes the remaining sets.</p><ol><li><b>BUY NOW:</b> ≥18% below the rolling 90-day high, at least 7% lower over 30 days, with the last 7 days relatively stable and high collector appeal.</li><li><b>WAIT:</b> significant recent correction but the price is still declining.</li><li><b>WATCH:</b> other verified cards under $100 without a clear entry signal.</li><li><b>Price pending:</b> the card is not yet matched or lacks sufficient, recent history. Unknown prices are never treated as $0.</li><li><b>Vintage priority:</b> age contributes <b>28%</b> of the opportunity score (previously 10%); you can also sort by oldest.</li><li><b>Popularity:</b> fan appeal is an editorial proxy, not search volume, social analytics, or actual sales activity.</li><li><b>Daily updates:</b> GitHub Actions checks in the cloud, publishes a new snapshot, and progressively catalogs older sets. Tapping Refresh downloads the latest published data immediately.</li></ol><p>Pricing is TCGplayer-derived from <a href="https://tickermint.cards/developers" target="_blank" rel="noopener noreferrer">TickerMint ↗</a>. Its historical series starts in February 2024, even for 2008 cards. Market price is <b>not a verified Near Mint offer</b>. Scores are heuristics, not price forecasts.</p></div>`)}
function installInstructions(){modal(`<div class="modal-method"><h2 id="modalHeading">Add PokéRadar to your home screen</h2><p><b>iPhone (Safari):</b> Open your published PokéRadar URL, tap <b>Share</b>, and choose <b>Add to Home Screen</b>.</p><p><b>Android (Chrome):</b> Open the same URL, tap the browser menu <b>⋮</b>, then choose <b>Install app</b> or <b>Add to Home screen</b>.</p><p>When installed, it opens like an app. Your interface stays cached after the first visit, and the latest price snapshot is refreshed from GitHub Pages when you reconnect.</p></div>`)}
function bind(){
 $('tabs').addEventListener('click',e=>{const b=e.target.closest('[data-tab]');if(!b)return;state.tab=b.dataset.tab;state.limit=18;scheduleDraw()});
 $('search').addEventListener('input',e=>{state.query=e.target.value.trim();state.limit=18;scheduleDraw()});
 $('rarity').addEventListener('change',e=>{state.rarity=e.target.value;state.limit=18;scheduleDraw()});
 $('sort').addEventListener('change',e=>{state.sort=e.target.value;scheduleDraw()});
 $('moreBtn').addEventListener('click',()=>{state.limit+=18;scheduleDraw()});
 $('cardList').addEventListener('click',e=>{const save=e.target.closest('[data-save]');if(save){const key=save.dataset.save;state.saved.has(key)?state.saved.delete(key):state.saved.add(key);persist();scheduleDraw();return}const detailBtn=e.target.closest('[data-detail]');if(detailBtn){const card=state.catalog.find(x=>x.key===detailBtn.dataset.detail);if(card)detail(enrich(card))}});
 $('howBtn').addEventListener('click',method);$('installHelp').addEventListener('click',installInstructions);
 $('closeModal').addEventListener('click',closeModal);$('modalOverlay').addEventListener('click',e=>{if(e.target===$('modalOverlay'))closeModal()});document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal()});
 $('refreshBtn').addEventListener('click',()=>runSync(true));$('retryBtn').addEventListener('click',()=>runSync(true));
 $('resetFilters').addEventListener('click',()=>{state.tab='all';state.query='';state.rarity='all';state.sort='oldest';state.limit=18;$('search').value='';$('rarity').value='all';$('sort').value='oldest';scheduleDraw()});
}
async function start(){readStore();bind();try{const r=await fetch('catalog.json',{cache:'force-cache'});if(!r.ok)throw Error('Roster unavailable');const d=await r.json();if(!Array.isArray(d.cards))throw Error('Invalid roster');state.catalog=d.cards;state.total=d.cards.length;scheduleDraw();const n=state.catalog.filter(c=>observed(enrich(c))).length;setStatus('',`${n} cached`);syncProgress(0,1,'Cards are ready',n?`${n} saved prices visible. Checking current market prices…`:'Your card list is ready. Verifying prices for the first time…');
  runSync(false);
 }catch(e){setStatus('error','Offline');syncProgress(0,1,'Could not open the card catalog','Reopen the app with an internet connection. '+e.message)}
 if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('sw.js').catch(()=>{});
}
start();
