/* PokéRadar: precomputed market snapshot, 18-card pages, on-demand histories. */
'use strict';
const $ = id => document.getElementById(id);
const STORE = 'pokeradar_snapshot_v4';
const SAVED = 'pokeradar_saved_mobile';
const PRICE_PREFS='pokeradar_price_prefs_v1';
const PAGE_SIZE = 18;
const SIGNALS = {buy: 'BUY NOW', wait: 'WAIT TO BUY', watch: 'WATCHLIST', pending: 'INSUFFICIENT DATA'};
const state = {
  snapshot: null, cards: [], saved: new Set(), tab: 'all', query: '', rarity: 'all',
  sort: 'score', priceMin: null, priceMax: null, page: 0, updating: false, drawScheduled: false, toastTimer: null,
  filterKey: '', filtered: [], details: new Map(), modalCard: null, returnFocus: null, evaluatedDay: null
};
const moneyFormat = new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD'});
const fmtMoney = value => Number.isFinite(value) ? moneyFormat.format(value) : 'Unavailable';
const fmtDelta = value => Number.isFinite(value) ? `${value > 0 ? '+' : ''}${value.toFixed(1)}%` : 'Unavailable';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const validHttps = value => { try { const url = new URL(value); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; } };
const cardKey = card => String(card.key || card.id);
const tcgLink = card => `https://www.tcgplayer.com/search/pokemon/product?productLineName=pokemon&q=${encodeURIComponent(`${card.name} ${card.number} ${card.set}`)}&view=grid&Condition=Near+Mint&Language=English`;
function fmtDate(value, includeTime = false) {
  const date = new Date(value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00Z` : value);
  return value && Number.isFinite(date.getTime()) ? date.toLocaleString(undefined, {year: 'numeric', month: 'short', day: 'numeric', ...(includeTime ? {hour: 'numeric', minute: '2-digit'} : {})}) : 'Unavailable';
}
function prepareCard(card) {
  const quoteDate = /^\d{4}-\d{2}-\d{2}$/.test(card.asOf || '') ? Date.parse(`${card.asOf}T12:00:00Z`) : Date.parse(card.asOf);
  const stale = card.stale || !Number.isFinite(quoteDate) || Math.floor(Date.now() / 86400000) - Math.floor(quoteDate / 86400000) > 4;
  const expired = stale && card.signal !== 'pending';
  return {...card, stale, ...(expired ? {signal: 'pending', score: null, reason: 'Saved price is stale. A recent verified quote is required before making a recommendation.'} : {}), _key: cardKey(card), _search: `${card.name} ${card.set} ${card.number} ${card.year}`.toLowerCase()};
}
function signalExplanation(card) {
  return card.reason || ({buy: 'Passed the price, history, valuation and stabilization gates. Open for the full analysis.', wait: 'A possible opportunity with weak momentum or unresolved downside. Open for the full analysis.', watch: 'Usable evidence without a qualifying buying signal. Open for the full analysis.', pending: 'More recent prices, history, or reliable comparisons are needed.'}[card.signal] || 'More verified evidence is needed.');
}

function validPriceLimit(value){
 if(value===null||value===undefined||value==='')return null;
 const n=Number(value);return Number.isFinite(n)&&n>=0?Math.min(10000000,Math.round(n*100)/100):null;
}
function priceMatches(card){
 if(state.priceMin===null&&state.priceMax===null)return true;
 if(!Number.isFinite(card.price)||card.price<=0)return false;
 return (state.priceMin===null||card.price>=state.priceMin)&&(state.priceMax===null||card.price<=state.priceMax);
}
function priceLabel(){
 const min=state.priceMin,max=state.priceMax;
 if(min===null&&max===null)return 'All prices (including cards without verified prices)';
 if(min!==null&&max!==null)return fmtMoney(min)+' – '+fmtMoney(max);
 return min!==null?'From '+fmtMoney(min):'Up to '+fmtMoney(max);
}
function updatePriceLabel(){if($('resultsLabel'))$('resultsLabel').textContent='English raw Pokémon cards · all eras · '+priceLabel();}
function markPricePresets(){
 const ranges={all:[null,null],under25:[null,25],range25to100:[25,100],range100to250:[100,250],over250:[250,null]};
 document.querySelectorAll('[data-price-preset]').forEach(button=>{
  const values=ranges[button.dataset.pricePreset];
  button.setAttribute('aria-pressed',String(!!values&&values[0]===state.priceMin&&values[1]===state.priceMax));
 });
}
function loadPricePrefs(){
 try{
  const saved=JSON.parse(localStorage.getItem(PRICE_PREFS)||'null');
  if(saved&&typeof saved==='object'){state.priceMin=validPriceLimit(saved.min);state.priceMax=validPriceLimit(saved.max);}
 }catch{}
 $('priceMin').value=state.priceMin??'';$('priceMax').value=state.priceMax??'';
 markPricePresets();updatePriceLabel();
}
function setPricePrefs(min,max){
 state.priceMin=validPriceLimit(min);state.priceMax=validPriceLimit(max);
 $('priceMin').value=state.priceMin??'';$('priceMax').value=state.priceMax??'';
 try{localStorage.setItem(PRICE_PREFS,JSON.stringify({min:state.priceMin,max:state.priceMax}));}catch{}
 markPricePresets();updatePriceLabel();state.page=0;state.filterKey='';scheduleDraw();
}

function readStore() {
  loadPricePrefs();
  try { const saved = JSON.parse(localStorage.getItem(SAVED) || '[]'); if (Array.isArray(saved)) state.saved = new Set(saved.filter(x => typeof x === 'string')); } catch {}
  try {
    const snapshot = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (snapshot?.version === 4 && Array.isArray(snapshot.cards)) applySnapshot(snapshot, true);
  } catch {}
}
function persistSaved() { try { localStorage.setItem(SAVED, JSON.stringify([...state.saved])); } catch {} }
function persistSnapshot(snapshot) {
  // Store the compact published snapshot only; full price histories never enter localStorage.
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(snapshot)); } catch {} };
  if ('requestIdleCallback' in window) requestIdleCallback(save, {timeout: 1500}); else setTimeout(save, 0);
}
function applySnapshot(snapshot, cached = false) {
  state.snapshot = snapshot;
  state.cards = snapshot.cards.filter(card => card && card.id && card.name)
    .map(prepareCard);
  state.evaluatedDay = Math.floor(Date.now() / 86400000);
  state.filterKey = '';
  const coverage = snapshot.coverage || {};
  const count = value => Number.isFinite(value) ? value.toLocaleString() : '—';
  $('statReviewed').textContent = count(coverage.reviewed);
  $('statUniverse').textContent = Number.isFinite(coverage.universe) ? `${count(coverage.universe)} physical cards checked by rarity` : 'Checking eligible rarities';
  $('statEligible').textContent = count(coverage.eligible);
  $('statVerified').textContent = count(coverage.verified);
  $('statHistory').textContent = count(coverage.historyReady);
  $('allN').textContent = count(state.cards.length);
  for (const signal of Object.keys(SIGNALS)) $(signal === 'pending' ? 'pendingN' : `${signal}N`).textContent = count(state.cards.filter(card => card.signal === signal).length);
  updateSavedCount();
  $('syncTitle').textContent = cached ? 'Saved catalog ready' : 'Latest published snapshot loaded';
  $('syncDescription').textContent = 'Daily updates run in the cloud. Refresh checks the published snapshot; it does not start a provider scan.';
  $('syncDate').textContent = `Last updated: ${fmtDate(snapshot.updatedAt, true)}`;
  updatePriceLabel();
  setStatus(cached ? '' : 'ready', cached ? 'Saved snapshot' : 'Snapshot ready');
  scheduleDraw();
}
function updateSavedCount() { $('savedN').textContent = state.cards.filter(card => state.saved.has(card._key)).length.toLocaleString(); }
function sorted() {
  const filterKey = JSON.stringify([state.tab, state.query, state.rarity, state.sort, state.tab === 'saved' ? [...state.saved] : '',state.priceMin,state.priceMax]);
  if (filterKey === state.filterKey) return state.filtered;
  let cards = state.cards.filter(card => (state.tab === 'all' || (state.tab === 'saved' ? state.saved.has(card._key) : card.signal === state.tab)) && (!state.query || card._search.includes(state.query)) && (state.rarity === 'all' || card.rarity === state.rarity) && priceMatches(card));
  const rank = {buy: 0, wait: 1, watch: 2, pending: 3};
  const scoreOrder = (a, b) => (rank[a.signal] ?? 4) - (rank[b.signal] ?? 4) || (b.score ?? -1) - (a.score ?? -1) || a.year - b.year || a.name.localeCompare(b.name);
  cards.sort((a, b) => {
    if (state.sort === 'oldest') return a.year - b.year || scoreOrder(a, b);
    if (state.sort === 'newest') return b.year - a.year || scoreOrder(a, b);
    if (state.sort === 'alpha') return a.name.localeCompare(b.name) || a.year - b.year;
    if (state.sort === 'price') return (a.price ?? Infinity) - (b.price ?? Infinity) || scoreOrder(a, b);
    if (state.sort === 'dip') return (a.change30 ?? Infinity) - (b.change30 ?? Infinity) || scoreOrder(a, b);
    return scoreOrder(a, b);
  });
  state.filterKey = filterKey;
  state.filtered = cards;
  return cards;
}
function cardHtml(card) {
  const image = validHttps(card.image);
  const signal = SIGNALS[card.signal] ? card.signal : 'pending';
  const price = Number.isFinite(card.price) ? fmtMoney(card.price) : 'Price unavailable';
  const priceNote = card.verifiedMatch ? (card.stale ? 'Saved price · stale' : `Verified ${fmtDate(card.asOf)}`) : 'Match verification needed';
  const change = Number.isFinite(card.change30) ? `<span class="delta ${card.change30 < 0 ? 'down' : 'up'}">${esc(fmtDelta(card.change30))} 30D</span>` : '';
  const saved = state.saved.has(card._key);
  return `<article class="card" data-key="${esc(card._key)}"><div class="card-top"><button type="button" class="art-button" data-detail="${esc(card._key)}" aria-label="View ${esc(card.name)} details">${image ? `<img class="card-image" src="${esc(image)}" alt="${esc(card.name)} card art" width="78" height="109" loading="lazy" decoding="async">` : '<div class="card-placeholder" aria-hidden="true">◈</div>'}</button><div class="card-info"><div class="rarity">${esc(card.rarity === 'Standard' && card.sourceRarity ? card.sourceRarity : card.rarity)}</div><h3><button type="button" data-detail="${esc(card._key)}">${esc(card.name)}</button></h3><div class="set">${esc(card.set)} · ${esc(card.number)} · ${esc(card.year)}</div><div class="price-line"><strong>${esc(price)}</strong>${change}</div><div class="price-date ${card.stale ? 'stale' : ''}">${esc(priceNote)}</div></div></div><div class="signal-row"><span class="signal ${signal}">${SIGNALS[signal]}</span><span class="score">SCORE <b>${Number.isFinite(card.score) ? card.score : '—'}</b><small>/100</small></span></div><p class="card-reason">${esc(signalExplanation(card))}</p><div class="card-links"><a class="tcg-link" href="${esc(tcgLink(card))}" target="_blank" rel="noopener noreferrer">Check Near Mint listings ↗</a><button type="button" class="save-btn ${saved ? 'active' : ''}" aria-label="${saved ? 'Unsave' : 'Save'} ${esc(card.name)}" aria-pressed="${saved}" data-save="${esc(card._key)}">${saved ? '★' : '☆'}</button></div><button class="card-inspect" type="button" data-detail="${esc(card._key)}"><span>History, set comparison &amp; risks</span><span>›</span></button></article>`;
}
function draw() {
  state.drawScheduled = false;
  const all = sorted();
  const pages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
  state.page = Math.min(state.page, pages - 1);
  const start = state.page * PAGE_SIZE;
  const visible = all.slice(start, start + PAGE_SIZE);
  $('cardList').innerHTML = visible.map(cardHtml).join('');
  $('showingCount').textContent = all.length ? `${start + 1}–${start + visible.length} of ${all.length.toLocaleString()} cards` : '0 cards';
  $('empty').hidden = all.length > 0;
  $('pagination').hidden = pages === 1;
  $('prevBtn').disabled = state.page === 0;
  $('moreBtn').disabled = state.page + 1 >= pages;
  $('pageLabel').textContent = `Page ${state.page + 1} of ${pages}`;
  document.querySelectorAll('[data-tab]').forEach(button => { const active = button.dataset.tab === state.tab; button.classList.toggle('active', active); button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1; });
}
function scheduleDraw() { if (!state.drawScheduled) { state.drawScheduled = true; requestAnimationFrame(draw); } }
function setStatus(mode, label) { $('connection').className = `connection ${mode}`; $('connectionText').textContent = label; }
function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(state.toastTimer); state.toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4000); }
async function fetchJSON(file, force = false) {
  const url = new URL(file, location.href);
  if (force) url.searchParams.set('refresh', Date.now());
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, {cache: 'no-cache', signal: controller.signal});
    if (!response.ok) throw new Error(`Snapshot request failed (${response.status})`);
    const data = await response.json();
    if (data && typeof data === 'object') Object.defineProperty(data, '_offlineSnapshot', {value: response.headers.get('X-Pokeradar-Cache') === 'offline'});
    return data;
  } finally { clearTimeout(timeout); }
}
async function runSync(force = false) {
  if (state.updating) return;
  refreshFreshness();
  state.updating = true;
  $('refreshBtn').classList.add('busy'); $('refreshBtn').setAttribute('aria-busy', 'true'); $('retryBtn').disabled = true;
  setStatus('', state.snapshot ? 'Checking updates' : 'Loading snapshot');
  try {
    const snapshot = await fetchJSON('summary.json', force);
    if (snapshot.version !== 4 || !Array.isArray(snapshot.cards)) throw new Error('Published summary has an unsupported format');
    if (state.snapshot && String(snapshot.updatedAt || '') < String(state.snapshot.updatedAt || '')) {
      setStatus('ready', 'Saved snapshot');
      if (force) toast('The saved snapshot is newer than this published response. Keeping saved prices.');
      return;
    }
    const changed = !state.snapshot || state.snapshot.updatedAt !== snapshot.updatedAt || state.snapshot.builtAt !== snapshot.builtAt || state.snapshot.modelVersion !== snapshot.modelVersion;
    const offline = snapshot._offlineSnapshot === true;
    if (changed) { state.details.clear(); persistSnapshot(snapshot); }
    // An unchanged artifact can still contain prices that have expired since the last paint.
    applySnapshot(snapshot, offline);
    if (!changed) setStatus(offline ? 'error' : 'ready', offline ? 'Saved snapshot' : 'Snapshot current');
    if (offline) {
      setStatus('error', 'Saved snapshot');
      $('syncTitle').textContent = 'Showing the last saved snapshot';
      $('syncDescription').textContent = 'The published site could not be reached. Saved prices remain available; reconnect and refresh for updates.';
    }
    if (force) toast(offline ? 'Using saved data. The published snapshot could not be reached.' : changed ? 'Latest published catalog and prices loaded.' : 'You have the latest published snapshot.');
  } catch (error) {
    setStatus('error', state.snapshot ? 'Saved snapshot' : 'Offline');
    $('syncTitle').textContent = state.snapshot ? 'Showing the last saved snapshot' : 'Snapshot could not be loaded';
    $('syncDescription').textContent = state.snapshot ? 'Your saved catalog and prices remain available. Reconnect and tap Refresh to check for updates.' : 'Connect to the internet and tap Refresh to download the published catalog.';
    if (force) toast(state.snapshot ? 'Using saved data. No new snapshot could be reached.' : 'Snapshot unavailable. Please try again when connected.');
    console.warn('Snapshot refresh:', error.message);
  } finally { state.updating = false; $('refreshBtn').classList.remove('busy'); $('refreshBtn').removeAttribute('aria-busy'); $('retryBtn').disabled = false; }
}
function chart(series) {
  const rows = Array.isArray(series) ? series.filter(row => Array.isArray(row) && /^\d{4}-\d{2}-\d{2}$/.test(row[0]) && Number.isFinite(row[1]) && row[1] > 0).slice(-120) : [];
  if (rows.length < 3) return '<p>Not enough verified observations to show a price chart.</p>';
  const min = Math.min(...rows.map(row => row[1])); const max = Math.max(...rows.map(row => row[1])); const range = max - min || 1;
  const dates = rows.map(row => Date.parse(`${row[0]}T12:00:00Z`));
  const duration = dates.at(-1) - dates[0] || 1;
  const points = rows.map((row, i) => [15 + 595 * (dates[i] - dates[0]) / duration, 148 - 110 * (row[1] - min) / range]);
  const path = points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
  return `<svg viewBox="0 0 640 195" role="img" aria-label="${rows.length} observed prices from ${esc(rows[0][0])} to ${esc(rows.at(-1)[0])}"><path d="M15 38 H610 M15 95 H610 M15 152 H610" stroke="#33546a" fill="none" stroke-dasharray="4 5"/><path d="${path}" fill="none" stroke="#a4ecd1" stroke-width="3" stroke-linejoin="round"/><text x="7" y="19" font-size="11" fill="#a9c9c9">${esc(fmtMoney(max))}</text><text x="7" y="173" font-size="11" fill="#a9c9c9">${esc(fmtMoney(min))}</text><text x="15" y="190" font-size="10" fill="#a9c9c9">${esc(rows[0][0])}</text><text x="610" y="190" text-anchor="end" font-size="10" fill="#a9c9c9">${esc(rows.at(-1)[0])}</text></svg><p class="chart-caption">Observed provider prices; lines connect observations across gaps.</p>`;
}
function modal(html) {
  state.returnFocus = document.activeElement;
  $('modalBody').innerHTML = html; $('modalOverlay').hidden = false;
  document.body.style.overflow = 'hidden'; $('closeModal').focus();
}
function closeModal() {
  state.modalCard = null; $('modalOverlay').hidden = true; document.body.style.overflow = '';
  if (state.returnFocus?.isConnected) state.returnFocus.focus();
}
function detailHtml(card) {
  const image = validHttps(card.image); const source = validHttps(card.tickermintUrl); const peers = card.peers || {};
  const warnings = Array.isArray(card.qualityWarnings) ? card.qualityWarnings : [];
  return `<div class="modal-intro">${image ? `<img src="${esc(image)}" alt="${esc(card.name)} artwork" width="100" height="139" loading="lazy">` : '<div class="card-placeholder" aria-hidden="true">◈</div>'}<div><div class="rarity">${esc(card.rarity === 'Standard' && card.sourceRarity ? card.sourceRarity : card.rarity)}</div><h2 id="modalHeading">${esc(card.name)}</h2><div class="set">${esc(card.set)} · ${esc(card.number)} · Released ${esc(card.year)}</div><div class="modal-price">${esc(fmtMoney(card.price))}</div><div class="modal-caption">Last verified: ${esc(card.verifiedMatch ? fmtDate(card.asOf) : 'Unverified match')}${card.stale ? ' · STALE' : ''}<br>English raw market average</div></div></div><div class="detail-signal"><span class="signal ${esc(card.signal)}">${SIGNALS[card.signal] || SIGNALS.pending}</span><b>Opportunity ${Number.isFinite(card.score) ? card.score : '—'}/100</b></div><div class="modal-metrics"><div><small>7-day change</small><b>${esc(fmtDelta(card.change7))}</b></div><div><small>30-day change</small><b>${esc(fmtDelta(card.change30))}</b></div><div><small>90-day change</small><b>${esc(fmtDelta(card.change90))}</b></div></div><div class="chart-wrap" id="detailChart" aria-live="polite"><p>Loading this card’s history…</p></div><div class="modal-comment"><b>Why this category:</b> ${esc(signalExplanation(card))}</div><div class="peer-panel"><h3>Compared with its set</h3><p>${peers.reliable ? `${esc(peers.count)} comparable cards · ${peers.setDeclining ? 'the set is declining' : 'no broad set decline detected'}` : card.peers ? `Insufficient suitable peers (${esc(peers.count || 0)} available). This comparison is not reliable.` : 'Loading the full set comparison…'}</p><dl><div><dt>Peer median · 30 days</dt><dd>${esc(fmtDelta(peers.median30))}</dd></div><div><dt>Peer median · 90 days</dt><dd>${esc(fmtDelta(peers.median90))}</dd></div><div><dt>Card vs. peers · 30 days</dt><dd>${Number.isFinite(peers.relative30) ? `${esc(peers.relative30.toFixed(1))} pp` : 'Unavailable'}</dd></div><div><dt>Card vs. peers · 90 days</dt><dd>${Number.isFinite(peers.relative90) ? `${esc(peers.relative90.toFixed(1))} pp` : 'Unavailable'}</dd></div><div><dt>Broader set · 30-day median</dt><dd>${esc(fmtDelta(peers.setMedian30))}</dd></div><div><dt>Broader set · 90-day median</dt><dd>${esc(fmtDelta(peers.setMedian90))}</dd></div><div><dt>90-day average price</dt><dd>${esc(fmtMoney(card.average90))}</dd></div><div><dt>Current vs. 90-day average</dt><dd>${Number.isFinite(card.belowAverage90) ? card.belowAverage90 === 0 ? 'At average' : `${esc(Math.abs(card.belowAverage90).toFixed(1))}% ${card.belowAverage90 < 0 ? 'below' : 'above'}` : 'Unavailable'}</dd></div><div><dt>Below recent 90-day high</dt><dd>${esc(fmtDelta(card.drop90))}</dd></div><div><dt>Comparable price rank</dt><dd>${Number.isFinite(peers.priceRank) && Number.isFinite(peers.rankTotal) ? `${esc(peers.priceRank)} of ${esc(peers.rankTotal)}` : 'Unavailable'}</dd></div></dl><p class="modal-caption">${Number.isFinite(peers.setCount) ? `Broader-set medians cover ${esc(peers.setCount)} other cards with usable history. ` : ''}Rank describes current price only; 1 is the highest price. It does not measure scarcity or predict returns.</p></div><div class="risk-panel"><b>Main risk</b><p>${esc(card.risk || 'Loading the full risk analysis. Market averages do not guarantee an available Near Mint offer.')}</p></div>${warnings.length ? `<p class="modal-caption data-warnings"><b>Data checks:</b> ${warnings.map(esc).join(' · ')}</p>` : ''}<div class="entry-panel"><span>Suggested entry / watch threshold</span><strong>${esc(fmtMoney(card.entryPrice))}</strong><small>A screening threshold, not a predicted future price.</small></div><dl class="data-availability"><div><dt>Sales volume</dt><dd>Unavailable</dd></div><div><dt>Near Mint listing quality</dt><dd>Unavailable</dd></div><div><dt>Historical observations</dt><dd>${Number.isFinite(card.historyObservations) ? esc(card.historyObservations) : 'Unavailable'}</dd></div></dl><p class="modal-caption">Scores use age (25%), set-relative value (25%), correction (20%), momentum (15%), collector popularity (10%), and liquidity (5%). Popularity is an editorial proxy. Missing liquidity contributes no evidence. Older cards cannot qualify on age alone. The provisional Buy Now threshold is ${Number.isFinite(state.snapshot?.buyThreshold) ? state.snapshot.buyThreshold : 80}; historical results do not establish predictive accuracy. Provider history begins in February 2024, including for older cards.</p><div class="modal-cta"><a href="${esc(tcgLink(card))}" target="_blank" rel="noopener noreferrer">Check actual Near Mint listings ↗</a>${source ? `<a class="secondary" href="${esc(source)}" target="_blank" rel="noopener noreferrer">TickerMint price source ↗</a>` : ''}</div><p class="modal-caption">Confirm the exact printing, English language, raw condition, shipping and fees. The market average is not a verified Near Mint offer.</p>`;
}
async function detail(card) {
  card = prepareCard(card);
  modal(detailHtml(card)); state.modalCard = card._key;
  function renderDetail(record) {
    if (state.modalCard !== card._key) return;
    // Apply the same freshness gate to cached detail files as to the lightweight list.
    const full = prepareCard({...card, ...record});
    $('modalBody').innerHTML = detailHtml(full);
    $('detailChart').innerHTML = chart(record.history);
  }
  if (state.details.has(card.id)) { renderDetail(state.details.get(card.id)); return; }
  try {
    const record = await fetchJSON(`details/${encodeURIComponent(card.id)}.json`);
    state.details.set(card.id, record);
    renderDetail(record);
  } catch {
    if (state.modalCard === card._key && $('detailChart')) $('detailChart').innerHTML = '<p>Detailed history is unavailable right now. The published summary above remains available.</p>';
  }
}
function method() {
  modal(`<div class="modal-method"><div class="section-kicker">HOW THE SCANNER WORKS</div><h2 id="modalHeading">Older cards. Stronger evidence.</h2><p>The cloud updater discovers all English physical Pokémon cards in its set catalog, including earliest English sets, commons, uncommons, rares and chase cards. The price range is optional and saved on this device; all prices are included by default. Unpriced cards remain visible when no range is selected.</p><ol><li><b>BUY NOW:</b> a provisional score of at least ${Number.isFinite(state.snapshot?.buyThreshold) ? state.snapshot.buyThreshold : 80} plus verified recent prices, sufficient history and reliable set peers, a meaningful correction, attractive relative value and stabilization. Age alone cannot qualify a card.</li><li><b>WAIT TO BUY:</b> a potential opportunity whose price is still falling or whose momentum remains weak.</li><li><b>WATCHLIST:</b> a card with usable evidence that does not meet the buying criteria.</li><li><b>INSUFFICIENT DATA:</b> missing or stale prices, unresolved matching, too little history or too few comparable cards. Unknown prices are never $0.</li></ol><p><b>Opportunity Score:</b> age 25%, set-relative value 25%, historical correction 20%, stabilization and momentum 15%, editorial collector popularity 10%, liquidity 5%. The age scores are 100 for 2008–2012, 85 for 2013–2016, 70 for 2017–2019, 50 for 2020–2022, 30 for 2023–2024 and 15 for 2025 onward.</p><p>Peers are drawn from the same set with compatible rarities or price ranges. Median changes reduce the influence of extreme prices. Missing liquidity and listing data are explicitly unavailable. Scores are research screens, not return forecasts. The threshold remains provisional until enough historical out-of-sample evidence exists.</p><p><b>Fast on iPhone:</b> a compact summary opens from browser storage, then refreshes in the background. Only 18 cards render at once. Full histories load when you open a card. Refresh retrieves the latest published snapshot; daily provider checks run through GitHub Actions.</p><p><a href="evaluation.html">View the historical evaluation and failed signals ↗</a>.</p><p>Pricing is <a href="https://tickermint.cards/developers" target="_blank" rel="noopener noreferrer">TickerMint’s TCGplayer-derived data ↗</a>. Available history begins in February 2024; a card’s original release date does not extend its recorded price history.</p></div>`);
}
function installInstructions() {
  modal('<div class="modal-method"><h2 id="modalHeading">Add PokéRadar to your home screen</h2><p><b>iPhone (Safari):</b> Tap <b>Share</b>, then <b>Add to Home Screen</b>.</p><p><b>Android (Chrome):</b> Open the browser menu and select <b>Install app</b> or <b>Add to Home screen</b>.</p><p>The last published catalog and verified prices remain saved after your first visit. Reconnect and tap Refresh for the latest snapshot.</p></div>');
}
function setTab(button) { state.tab = button.dataset.tab; state.page = 0; scheduleDraw(); }
function bind() {
  document.addEventListener('error', event => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement) || (!image.classList.contains('card-image') && !image.closest('.modal-intro'))) return;
    const placeholder = document.createElement('div');
    placeholder.className = 'card-placeholder'; placeholder.textContent = '◈';
    placeholder.setAttribute('role', 'img'); placeholder.setAttribute('aria-label', 'Card artwork unavailable');
    image.replaceWith(placeholder);
  }, true);
  $('tabs').addEventListener('click', event => { const button = event.target.closest('[data-tab]'); if (button) setTab(button); });
  $('tabs').addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const tabs = [...$('tabs').querySelectorAll('[data-tab]')]; const active = tabs.indexOf(document.activeElement);
    if (active < 0) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (active + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    setTab(tabs[next]); tabs[next].focus();
  });
  let searchTimer;
  $('search').addEventListener('input', event => { const query = event.target.value.trim().toLowerCase(); clearTimeout(searchTimer); searchTimer = setTimeout(() => { state.query = query; state.page = 0; scheduleDraw(); }, 100); });
  for (const key of ['rarity', 'sort']) $(key).addEventListener('change', event => { state[key] = event.target.value; state.page = 0; scheduleDraw(); });
  for(const key of ['priceMin','priceMax'])$(key).addEventListener('input',()=>setPricePrefs($('priceMin').value,$('priceMax').value));
  $('pricePresets').addEventListener('click',event=>{
    const button=event.target.closest('[data-price-preset]');if(!button)return;
    const ranges={all:[null,null],under25:[null,25],range25to100:[25,100],range100to250:[100,250],over250:[250,null]};
    const range=ranges[button.dataset.pricePreset];if(range)setPricePrefs(...range);
  });
  function page(direction) { state.page = Math.max(0, state.page + direction); draw(); $('board').scrollIntoView({behavior: 'auto', block: 'start'}); }
  $('moreBtn').addEventListener('click', () => page(1)); $('prevBtn').addEventListener('click', () => page(-1));
  $('cardList').addEventListener('click', event => {
    const save = event.target.closest('[data-save]');
    if (save) {
      const key = save.dataset.save; const saved = !state.saved.has(key);
      if (saved) state.saved.add(key); else state.saved.delete(key);
      persistSaved(); updateSavedCount();
      if (state.tab === 'saved') { state.filterKey = ''; scheduleDraw(); }
      else { save.classList.toggle('active', saved); save.textContent = saved ? '★' : '☆'; save.setAttribute('aria-pressed', String(saved)); const card = state.cards.find(row => row._key === key); save.setAttribute('aria-label', `${saved ? 'Unsave' : 'Save'} ${card?.name || 'card'}`); }
      return;
    }
    const button = event.target.closest('[data-detail]');
    if (button) { const card = state.cards.find(row => row._key === button.dataset.detail); if (card) detail(card); }
  });
  $('howBtn').addEventListener('click', method); $('installHelp').addEventListener('click', installInstructions);
  $('closeModal').addEventListener('click', closeModal); $('modalOverlay').addEventListener('click', event => { if (event.target === $('modalOverlay')) closeModal(); });
  document.addEventListener('keydown', event => {
    if ($('modalOverlay').hidden) return;
    if (event.key === 'Escape') closeModal();
    if (event.key === 'Tab') {
      const items = [...$('modalOverlay').querySelectorAll('button, a[href], input, select, [tabindex="0"]')].filter(item => !item.disabled);
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1).focus(); }
      else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus(); }
    }
  });
  $('refreshBtn').addEventListener('click', () => runSync(true)); $('retryBtn').addEventListener('click', () => runSync(true));
  $('resetFilters').addEventListener('click', () => { clearTimeout(searchTimer); state.tab = 'all'; state.query = ''; state.rarity = 'all'; state.sort = 'score'; state.page = 0; $('search').value = ''; $('rarity').value = 'all'; $('sort').value = 'score'; setPricePrefs(null,null); scheduleDraw(); });
}
function start() {
  bind(); readStore();
  if (!state.snapshot) draw();
  // Let cached cards paint before starting the network request.
  requestAnimationFrame(() => { setTimeout(() => runSync(), 0); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) runSync(); });
  window.addEventListener('pageshow', event => { if (event.persisted) runSync(); });
  setInterval(() => { if (!document.hidden && state.snapshot && state.evaluatedDay !== Math.floor(Date.now() / 86400000)) runSync(); }, 60000);
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js', {updateViaCache: 'none'}).catch(() => {});
}
function refreshFreshness() {
  if (state.snapshot && state.evaluatedDay !== Math.floor(Date.now() / 86400000)) applySnapshot(state.snapshot, true);
}
start();
