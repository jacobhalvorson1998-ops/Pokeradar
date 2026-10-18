/** Daily, checkpointed English physical-card discovery and printing-verified prices. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {money, validDay, isFreshDay, cleanNumber, normalizedSet, parseTickerHits, parseHistory, parseHistoryForPrinting, parseCSV, verifyTickerProduct, reconcileCatalog, matchFailureReason, createRateLimitedClient, atomicWriteJSON, migrateResolution, resolutionFailure, mergeHistory, BudgetExceeded} from './provider.mjs';
export {parseTickerHits, parseHistory, parseCSV, cleanNumber} from './provider.mjs';
const ROOT = process.env.POKERADAR_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT_URL = 'https://api.tcgdex.net/v2/en';
const PRICE_URL = 'https://api.tickermint.cards';
const CURRENT_YEAR = new Date().getUTCFullYear();
const minYear = 2008;
export const setKey = (name, number) => `${String(name).toLowerCase().trim()}|${String(number).toUpperCase().replace(/\s/g, '')}`;
const read = (file, fallback) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8')); } catch { return fallback; } };
const write = (file, value) => atomicWriteJSON(path.join(ROOT, file), value);
const bounded = (name, fallback, max) => { const value = Number(process.env[name] ?? fallback); return Number.isFinite(value) ? Math.max(0, Math.min(max, Math.floor(value))) : fallback; };
const stamp = () => new Date().toISOString();
const today = () => stamp().slice(0, 10);
export const isPhysicalSet = set => set?.serie?.id !== 'tcgp' && !/^(?:[A-Z]\d+[a-z]?|P-[A-Z])$/.test(set.id || '') && !/jumbo|oversized/i.test(set.name || '');
export async function pooled(items, limit, fn, onError = error => console.warn(error.message)) {
  let next = 0;
  await Promise.all(Array.from({length: Math.min(limit, items.length)}, async () => {
    while (next < items.length) { const item = items[next++]; try { await fn(item); } catch (error) { if (error instanceof BudgetExceeded) { next = items.length; onError(error, item); break; } onError(error, item); } }
  }));
}
const HYPE_NAMES=[[/charizard/i,98],[/pikachu/i,97],[/umbreon/i,98],[/gengar/i,97],[/mewtwo/i,93],[/mew(?!t)/i,94],[/rayquaza/i,94],[/eevee/i,95],[/dragonite/i,92],[/lugia/i,94],[/giratina/i,92],[/espeon/i,92],[/sylveon/i,91],[/leafeon/i,85],[/glaceon/i,86],[/vaporeon/i,89],[/jolteon/i,88],[/flareon/i,87],[/greninja/i,92],[/gyarados/i,90],[/blastoise/i,90],[/venusaur/i,87],[/snorlax/i,89],[/lucario/i,88],[/gardevoir/i,88],[/arceus/i,87],[/latias|latios/i,87],[/magikarp/i,88],[/bulbasaur/i,87],[/squirtle/i,87],[/charmander/i,90],[/psyduck/i,83],[/tyranitar/i,89],[/suicune/i,85],[/entei/i,84],[/raikou/i,83],[/celebi/i,82]];
export const fanProxy=(name)=>HYPE_NAMES.find(([rx])=>rx.test(name))?.[1]??62;
export function classifyRarity(rarity,number='',setName='',year=2026){
 const r=String(rarity??'').toLowerCase().trim();const n=String(number).toUpperCase(),set=String(setName).toLowerCase();
 if(/special illustration|special art rare|s\.?i\.?r\.?/.test(r))return 'SIR';
 if(/illustration rare|illustration art rare|art rare/.test(r))return 'IR';
 if(/^(GG|TG)\d+/i.test(n)||/galarian gallery|trainer gallery/.test(set))return 'Galarian Gallery';
 if(/alternate art|alt art/.test(r))return 'Alt Art';
 if(/rare holo lv\.?x|rare prime|^legend$|shiny rare|shiny ultra rare|secret rare|rare secret|hyper rare|ultra rare|full art|black white rare|amazing rare|radiant rare|mega hyper rare|mega attack rare|gold star|shining|prism star|classic collection|character rare/i.test(r))return 'Other';
 // Numeric secret-numbered illustrations are candidate chase cards but require
 // a trustworthy rarity for classification; don't label all secret numbers IR.
 return null;
}
function fromBrief(card, set, rarity) {
  const year = Number(String(set.releaseDate).slice(0, 4));
  const official = Number(set.cardCount?.official || set.cardCount?.printed || 0);
  const local = String(card.localId || '');
  const prefix = local.match(/^(GG|TG|SV)/i)?.[1] || '';
  // Embedded Radiant Collections have their own denominators; a local ID
  // remains honest until provider metadata supplies the printed denominator.
  const number = /^RC/i.test(local) ? local : official ? `${local}/${prefix}${official}` : local;
  const category = classifyRarity(rarity, local, set.name, year);
  if (!category) return null;
  return {key: setKey(set.name, number), id: card.id, name: card.name, set: set.name, setId: set.id, number, year, releaseDate: set.releaseDate, rarity: category, sourceRarity: rarity, language: 'en', hype: fanProxy(card.name), image: card.image ? `${String(card.image).replace(/\/$/, '')}/low.webp` : ''};
}
/** Bulk rarity membership avoids individual detail requests for ordinary cards. */
export async function discover({client, report}) {
  const sets = await client.get(`${ROOT_URL}/sets`);
  if (!Array.isArray(sets) || !sets.length) throw Error('TCGdex returned no set index');
  const detailCache = read('data/card_details.json', {});
  const setCache = read('data/set_cache.json', {});
  const recent = Date.now() - 45 * 86400000;
  await pooled(sets.filter(set => set?.id && set.name && isPhysicalSet(set)), 6, async set => {
    const cached = setCache[set.id];
    const changedCount = cached?.cardCount?.total !== set.cardCount?.total;
    const refreshRecent = Date.parse(cached?.releaseDate || '') >= recent && cached?.fetchedAt?.slice(0, 10) !== today();
    if (cached?.releaseDate && Array.isArray(cached.cards) && !changedCount && !refreshRecent) return;
    const raw = await client.get(`${ROOT_URL}/sets/${encodeURIComponent(set.id)}`);
    if (!raw?.releaseDate || !Array.isArray(raw.cards)) throw Error(`invalid set response: ${set.id}`);
    setCache[set.id] = {id: set.id, name: raw.name, releaseDate: raw.releaseDate, serie: raw.serie, cardCount: raw.cardCount, fetchedAt: stamp(), cards: raw.cards.map(card => ({id: card.id, localId: card.localId, name: card.name, image: card.image}))};
    report.setsRetrieved++; if (report.setsRetrieved % 10 === 0) write('data/set_cache.json', setCache);
  }, error => { report.discoveryErrors++; console.warn(`set discovery: ${error.message}`); });
  write('data/set_cache.json', setCache);
  const active = Object.values(setCache).filter(set => isPhysicalSet(set) && Number(set.releaseDate?.slice(0, 4)) >= minYear && Number(set.releaseDate?.slice(0, 4)) <= CURRENT_YEAR && set.releaseDate <= today());
  const all = new Map();
  for (const set of active) for (const brief of set.cards || []) all.set(brief.id, {brief, set});
  const rarities = await client.get(`${ROOT_URL}/rarities`);
  if (!Array.isArray(rarities)) throw Error('TCGdex rarity index is malformed');
  const eligibleRarities = rarities.filter(rarity => classifyRarity(rarity));
  const rarityCache = read('data/rarity_cache.json', {});
  await pooled(eligibleRarities, 4, async rarity => {
    if (rarityCache[rarity]?.checkedAt?.slice(0, 10) === today()) return;
    // Official /rarities/:name is a complete, unpaginated brief-card list.
    const raw = await client.get(`${ROOT_URL}/rarities/${encodeURIComponent(rarity)}`);
    if (!Array.isArray(raw?.cards)) throw Error(`invalid bulk rarity response: ${rarity}`);
    rarityCache[rarity] = {checkedAt: stamp(), cards: raw.cards};
    report.rarityListsRetrieved++;
    write('data/rarity_cache.json', rarityCache);
  }, error => { report.discoveryErrors++; console.warn(`bulk rarity discovery: ${error.message}`); });
  const bulkMembership = new Map();
  for (const rarity of eligibleRarities) for (const card of rarityCache[rarity]?.cards || []) if (all.has(card.id)) bulkMembership.set(card.id, {card, rarity});
  for (const [id, {card, rarity}] of bulkMembership) detailCache[id] = {...detailCache[id], name: card.name, rarity, localId: card.localId, image: card.image ?? detailCache[id]?.image, reviewedBy: 'bulk-rarity'};
  write('data/card_details.json', detailCache);
  // Only exceptional secret/gallery numbers absent from bulk lists need details.
  // Missing rarity never implies an eligible card. Commons/uncommons are not scanned.
  const exceptional = [...all.values()].filter(({brief, set}) => {
    if (bulkMembership.has(brief.id) || Object.hasOwn(detailCache, brief.id)) return false;
    const official = Number(set.cardCount?.official || 0);
    return /^(?:GG|TG|SV|SH|RC)\d/i.test(brief.localId || '') || (official > 0 && /^\d+$/.test(brief.localId || '') && Number(brief.localId) > official);
  }).sort((a, b) => a.set.releaseDate.localeCompare(b.set.releaseDate));
  await pooled(exceptional.slice(0, bounded('MAX_DETAILS_PER_RUN', 5000, 10000)), 6, async ({brief}) => {
    const detail = await client.get(`${ROOT_URL}/cards/${encodeURIComponent(brief.id)}`);
    if (detail?.id !== brief.id) throw Error(`invalid card details: ${brief.id}`);
    detailCache[brief.id] = {name: detail.name, rarity: detail.rarity ?? null, localId: detail.localId, image: detail.image, variants: detail.variants, reviewedBy: 'individual-detail', reviewedAt: stamp()};
    report.detailsRetrieved++; if (report.detailsRetrieved % 20 === 0) write('data/card_details.json', detailCache);
  }, error => { report.discoveryErrors++; console.warn(`exception detail: ${error.message}`); });
  write('data/card_details.json', detailCache);
  const cards = [];
  for (const [id, {brief, set}] of all) {
    const cached = detailCache[id]; if (!cached?.rarity && !/^(GG|TG)/i.test(brief.localId || '')) continue;
    const card = fromBrief({...brief, ...cached}, set, cached?.rarity);
    if (card) cards.push(card);
  }
  const bulkComplete = eligibleRarities.every(rarity => rarityCache[rarity]?.checkedAt?.slice(0, 10) === today());
  const detailed = [...all.keys()].filter(id => Object.hasOwn(detailCache, id)).length;
  const reviewed = bulkComplete ? all.size : detailed;
  report.bulkReviewed = reviewed;
  return {cards, progress: {catalogued: reviewed, reviewed, universe: all.size, eligible: cards.length, sets: active.length, detailRecords: detailed, bulkRarityComplete: bulkComplete, discoveryMethod: 'bulk-rarity-membership; exceptional details only'}};
}
function dueResolution(record) { return record.status !== 'matched' && (!record.nextRetryAt || record.nextRetryAt <= stamp()); }
function productFromSet(product, set) { return {...product, set_name: set.name, group_id: set.group_id, game: set.game || 'pokemon'}; }
/** Whole-set identity resolution followed by exact-variant history/quote refresh. */
export async function updatePrices(catalog, {client, report}) {
  const priceStageStarted = Date.now();
  const saved = read('site/prices.json', {version: 4, prices: {}});
  const prices = saved.prices || {};
  const rawIds = read('data/resolved_ids.json', {});
  const ids = Object.fromEntries(Object.entries(rawIds).map(([key, value]) => [key, migrateResolution(value)]));
  const historyStatus = read('data/history_status.json', {});
  const full = read('.cache/pokeradar/full-history.json', {prices: {}});
  full.prices ||= {};
  const checkpoint = () => {
    write('data/resolved_ids.json', ids);
    write('data/history_status.json', historyStatus);
    write('site/prices.json', {version: 4, updatedAt: report.quotesRetrieved ? stamp() : saved.updatedAt, source: 'TickerMint (TCGplayer-derived)', prices});
    write('.cache/pokeradar/full-history.json', full);
  };
  const sorted = [...catalog].sort((a, b) => a.year - b.year || b.hype - a.hype);
  for (const card of sorted) ids[card.key] ||= migrateResolution(null);
  let setIndex = read('data/ticker_index_cache.json', []);
  try {
    const live = await client.get(`${PRICE_URL}/sets?game=pokemon`);
    if (!Array.isArray(live) || !live.length) throw Error('TickerMint returned no set index');
    setIndex = live; write('data/ticker_index_cache.json', live);
  } catch (error) {
    report.priceErrors++; console.warn(`set index unavailable: ${error.message}; using cached identities and continuing existing matches`);
  }
  const groups = new Map();
  for (const set of setIndex) {
    const key = normalizedSet(set.name);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(set);
  }
  const groupsNeeded = new Map();
  for (const card of sorted) {
    if (!dueResolution(ids[card.key])) continue;
    const sets = groups.get(normalizedSet(card.set)) || [];
    if (sets.length === 1) {
      const groupId = Number(sets[0].group_id);
      if (!groupsNeeded.has(groupId)) groupsNeeded.set(groupId, []);
      groupsNeeded.get(groupId).push(card);
    }
  }
  const groupCache = read('data/ticker_set_cache.json', {});
  const maxResolve = bounded('MAX_RESOLVE_PER_RUN', 5000, 15000);
  let attempts = 0;
  // Set endpoint mapping usually resolves hundreds of cards without any search.
  await pooled([...groupsNeeded.entries()], 3, async ([groupId, cards]) => {
    if (attempts >= maxResolve) return;
    let set = groupCache[groupId];
    if (set?.checkedAt?.slice(0, 10) !== today()) {
      set = await client.get(`${PRICE_URL}/sets/${groupId}`);
      if (!Array.isArray(set?.cards)) throw Error(`invalid whole-set pricing response ${groupId}`);
      // Cache identity only, not every common's raw market price.
      set = {group_id: set.group_id, name: set.name, game: set.game, checkedAt: stamp(), cards: set.cards.map(({market, ...product}) => product)};
      groupCache[groupId] = set; report.priceSetsRetrieved++;
      write('data/ticker_set_cache.json', groupCache);
    }
    for (const card of cards) {
      if (attempts++ >= maxResolve) break;
      const candidates = set.cards.map(product => productFromSet(product, set));
      const productId = parseTickerHits(candidates, card);
      if (productId) {
        const product = candidates.find(value => Number(value.product_id) === productId);
        const verification = verifyTickerProduct(product, card);
        ids[card.key] = {status: 'matched', productId, groupId, language: 'en', verifiedAt: stamp(), attempts: 0, matchEvidence: verification.evidence, method: 'whole-set exact identity'};
        report.matches++; console.log(`MATCH ${card.key} -> ${productId} (whole-set English identity)`);
      } else {
        const reason = matchFailureReason(candidates, card);
        ids[card.key] = resolutionFailure(ids[card.key], reason); report.unmatched++;
        console.log(`UNMATCHED ${card.key}: ${reason}`);
      }
    }
    checkpoint();
  }, (error, item) => {
    report.priceErrors++; console.warn(`whole-set mapping: ${error.message}`);
    if (!(error instanceof BudgetExceeded)) for (const card of item?.[1] || []) if (ids[card.key]?.status !== 'matched') ids[card.key] = resolutionFailure(ids[card.key], error.message, {transient: true});
    checkpoint();
  });
  // Only groups absent from the set index need conservative, lower-rate search.
  const searchTargets = sorted.filter(card => dueResolution(ids[card.key]) && !groupsNeeded.has(ids[card.key]?.groupId) && !(groups.get(normalizedSet(card.set)) || []).length);
  const searchQueue = searchTargets.slice(0, Math.min(Math.max(0, maxResolve - attempts), bounded('MAX_SEARCH_PER_RUN', 40, 200)));
  report.deferredSearches = searchTargets.length - searchQueue.length;
  console.log(`Search fallback: ${searchQueue.length} requests queued, ${report.deferredSearches} deferred by per-run cap`);
  await pooled(searchQueue, 2, async card => {
    const previous = ids[card.key];
    try {
      const raw = await client.get(`${PRICE_URL}/products/search?q=${encodeURIComponent(`${card.name} ${card.number}`)}&game=pokemon`, {search: true});
      const productId = parseTickerHits(raw, card);
      if (!productId) { ids[card.key] = resolutionFailure(previous, matchFailureReason(raw, card)); report.unmatched++; }
      else {
        const product = raw.find(value => Number(value.product_id) === productId);
        ids[card.key] = {status: 'matched', productId, groupId: product.group_id, language: 'en', attempts: 0, verifiedAt: stamp(), matchEvidence: verifyTickerProduct(product, card).evidence, method: 'exact identity search'};
        report.matches++;
      }
    } catch (error) {
      if (error instanceof BudgetExceeded) throw error;
      ids[card.key] = resolutionFailure(previous, error.message, {transient: true}); report.priceErrors++;
    } finally { console.log(`SEARCH ${ids[card.key]?.status} ${card.key}: ${ids[card.key]?.reason || ids[card.key]?.productId}`); checkpoint(); }
  }, error => { report.priceErrors++; console.warn(`product search: ${error.message}`); });
  for (const card of sorted) {
    const resolution = ids[card.key];
    const set = groupCache[resolution?.groupId];
    const product = set?.cards?.find(value => Number(value.product_id) === resolution?.productId);
    if (product && /\((?:alternate(?: full)? art|alt art)\)/i.test(product.name || '') && verifyTickerProduct(productFromSet(product, set), card).ok) {
      card.rarity = 'Alt Art';
      card.rarityEvidence = 'Exact matched TickerMint product explicitly identifies Alternate Art';
    }
  }
  // The documented whole-set CSV identifies its representative printing.
  // It can refresh an already verified *same* printing, never resolve a new one.
  const quoteGroups = new Map();
  for (const card of sorted) {
    const record = ids[card.key], previous = prices[card.key];
    if (record?.status !== 'matched' || !record.groupId || !previous?.verifiedMatch || previous.productId !== record.productId || previous.language !== 'en' || !previous.matchEvidence || !['Holofoil', 'Normal'].includes(previous.printing)) continue;
    if (!quoteGroups.has(record.groupId)) quoteGroups.set(record.groupId, []);
    quoteGroups.get(record.groupId).push(card);
  }
  console.log(`Bulk CSV quotes: ${quoteGroups.size} verified-printing sets queued`);
  await pooled([...quoteGroups.entries()].slice(0, bounded('MAX_QUOTE_SETS_PER_RUN', 200, 500)), 3, async ([groupId, cards]) => {
    const csv = await client.get(`${PRICE_URL}/sets/${groupId}.csv`, {format: 'csv'});
    const rows = parseCSV(csv);
    if (!rows.length || !Object.hasOwn(rows[0], 'printing')) throw Error(`set CSV lacks printing metadata: ${groupId}`);
    report.bulkQuoteSetsRetrieved = (report.bulkQuoteSetsRetrieved || 0) + 1;
    const byProduct = new Map(cards.map(card => [ids[card.key].productId, card]));
    for (const row of rows) {
      const productId = Number(row.product_id), card = byProduct.get(productId);
      if (!card) continue;
      const previous = prices[card.key], value = money(row.market_price_usd), day = String(row.date || '');
      if (row.printing !== previous.printing || !value || !validDay(day) || day > today() || day < previous.asOf || !isFreshDay(day) || row.url !== `https://tickermint.cards/card/${productId}`) continue;
      // English was proven when this immutable product ID was bound; CSV's
      // name, set, full collector number, and printing must still match exactly.
      const exact = verifyTickerProduct({...row, product_id: productId, set_name: row.set, card_number: row.number, language: previous.language}, card);
      if (!exact.ok) continue;
      const history = mergeHistory(previous.history || [], [[day, value]]);
      prices[card.key] = {...previous, price: value, asOf: day, verifiedAt: stamp(), quoteCheckedAt: stamp(), quoteMethod: 'whole-set CSV; previously verified exact printing', history: history.slice(-120)};
      const archive = full.prices[card.key];
      if (archive?.printing === previous.printing && archive.productId === productId) full.prices[card.key] = {...prices[card.key], history: mergeHistory(archive.history || [], [[day, value]])};
      report.bulkQuotesRetrieved = (report.bulkQuotesRetrieved || 0) + 1;
      report.quotesRetrieved++; report.freshQuotesRetrieved = (report.freshQuotesRetrieved || 0) + 1;
    }
    checkpoint();
    if (report.bulkQuoteSetsRetrieved % 10 === 0) console.log(`BULK PRICE progress: ${report.bulkQuoteSetsRetrieved}/${quoteGroups.size} sets; ${report.bulkQuotesRetrieved || 0} verified quotes; ${Math.round((Date.now() - priceStageStarted) / 1000)}s pricing elapsed`);
  }, error => { report.priceErrors++; console.warn(`whole-set quote refresh: ${error.message}; saved prices retained`); });
  const needsLegacyVerification = card => prices[card.key]?.price && (!prices[card.key]?.printing || prices[card.key]?.language !== 'en' || !prices[card.key]?.matchEvidence);
  const historyTargets = sorted.filter(card => ids[card.key]?.status === 'matched' && (!historyStatus[card.key]?.nextRetryAt || historyStatus[card.key].nextRetryAt <= stamp()) && (prices[card.key]?.historyChecked !== today() || needsLegacyVerification(card)))
    .sort((a, b) => Number(!!needsLegacyVerification(b)) - Number(!!needsLegacyVerification(a)) || String(prices[a.key]?.historyChecked || '').localeCompare(String(prices[b.key]?.historyChecked || '')) || a.year - b.year);
  if (!historyTargets.length && !report.freshQuotesRetrieved) {
    const confirm = sorted.find(card => ids[card.key]?.status === 'matched' && prices[card.key]?.printing && (!historyStatus[card.key]?.nextRetryAt || historyStatus[card.key].nextRetryAt <= stamp()));
    if (confirm) historyTargets.push(confirm); // Confirm one real quote on an otherwise up-to-date repeat.
  }
  await pooled(historyTargets.slice(0, bounded('MAX_HISTORY_PER_RUN', 2000, 10000)), 4, async card => {
    const resolution = ids[card.key];
    try {
      const raw = await client.get(`${PRICE_URL}/products/${resolution.productId}/prices`);
      const previous = prices[card.key] || {};
      // Existing explicitly verified variant remains fixed; legacy aggregates are re-derived.
      const chosen = parseHistoryForPrinting(raw, previous.printing || null);
      if (!chosen.points.length) { historyStatus[card.key] = resolutionFailure(historyStatus[card.key], chosen.reason); report.priceErrors++; console.warn(`HISTORY ${card.key}: ${chosen.reason}; saved price preserved`); return; }
      const [providerDay, providerPrice] = chosen.points.at(-1);
      const sameVariant = previous.printing === chosen.printing && previous.productId === resolution.productId && previous.verifiedMatch && previous.language === 'en' && previous.matchEvidence;
      // A set CSV may be fresher than the history endpoint. Backfill that same
      // verified printing without replacing its newer quote or claiming freshness.
      const preserveQuote = sameVariant && previous.asOf > providerDay;
      if (providerDay > today() || (previous.asOf > providerDay && !sameVariant)) {
        historyStatus[card.key] = resolutionFailure(historyStatus[card.key], providerDay > today() ? 'provider returned future observation' : 'provider history predates saved quote without a verified identical printing', {transient: true});
        report.priceErrors++; return;
      }
      const asOf = preserveQuote ? previous.asOf : providerDay;
      const price = preserveQuote ? previous.price : providerPrice;
      const archived = full.prices[card.key];
      const sameArchive = archived?.printing === chosen.printing && archived?.productId === resolution.productId;
      const history = mergeHistory(sameArchive ? archived.history || [] : [], mergeHistory(sameVariant ? previous.history || [] : [], chosen.points));
      const market = {...previous, productId: resolution.productId, verifiedMatch: true, language: 'en', printing: chosen.printing, matchEvidence: resolution.matchEvidence, verifiedAt: preserveQuote ? previous.verifiedAt : stamp(), historyVerifiedAt: stamp(), price, asOf, tickermintUrl: `https://tickermint.cards/card/${resolution.productId}`, history: history.slice(-120), historyChecked: today(), listingVolume: null, salesVolume: null};
      prices[card.key] = market;
      full.prices[card.key] = {...market, history};
      historyStatus[card.key] = {status: 'complete', attempts: 0, checkedAt: stamp(), printing: chosen.printing};
      report.historiesRetrieved++;
      if (!preserveQuote) {
        report.quotesRetrieved++;
        if (isFreshDay(providerDay)) report.freshQuotesRetrieved = (report.freshQuotesRetrieved || 0) + 1;
      }
      if (report.historiesRetrieved % 20 === 0) { checkpoint(); console.log(`PRICE progress: ${report.historiesRetrieved}/${historyTargets.length}; ${card.key} $${price} ${chosen.printing} @ ${asOf}`); }
    } catch (error) { if (error instanceof BudgetExceeded) throw error; historyStatus[card.key] = resolutionFailure(historyStatus[card.key], error.message, {transient: true}); report.priceErrors++; console.warn(`price/history failed ${card.key}: ${error.message}; existing verified data preserved`); }
  }, error => { report.priceErrors++; console.warn(`history queue: ${error.message}`); checkpoint(); });
  checkpoint();
  report.matchedTotal = sorted.filter(card => ids[card.key]?.status === 'matched').length;
  const activeMarkets = sorted.map(card => prices[card.key]).filter(Boolean);
  report.verifiedPrices = activeMarkets.filter(price => price.verifiedMatch && price.productId > 0 && price.printing && price.language === 'en' && price.matchEvidence && money(price.price)).length;
  report.historyCards = activeMarkets.filter(price => price.verifiedMatch && price.printing && price.language === 'en' && price.matchEvidence && price.history?.length >= 90).length;
  report.historyDefinition = 'At least 90 printing-specific daily observations; recommendation quality and set-peer gates still apply';
  report.pendingMatches = sorted.filter(card => ids[card.key]?.status !== 'matched').length;
  report.pendingHistories = historyTargets.length - report.historiesRetrieved;
  report.historyRetryDeferred = Object.values(historyStatus).filter(record => record.nextRetryAt > stamp()).length;
  const remaining = sorted.map(card => ids[card.key]).filter(record => record?.status !== 'matched');
  report.retryDeferred = remaining.filter(record => record.status === 'retry' && record.nextRetryAt > stamp()).length;
  report.reviewRequired = remaining.filter(record => record.status === 'review').length;
  report.matchQueueReady = remaining.filter(record => record.status !== 'review' && dueResolution(record)).length;
  report.estimatedRequestMinutesLowerBound = Math.ceil((report.pendingHistories + Math.ceil(report.matchQueueReady / 15)) / 90);
  report.estimateNote = 'Network-time lower bound at 90 reads/minute; excludes retry cooldowns, review cases, unknown language/printing coverage, and daily time/work caps. Not a full-coverage promise';
  report.unmatchedReasons = {};
  for (const record of remaining) report.unmatchedReasons[record.reason || 'not yet matched'] = (report.unmatchedReasons[record.reason || 'not yet matched'] || 0) + 1;
  return {prices, resolutions: ids};
}
export async function main() {
  const started = Date.now();
  const report = {startedAt: stamp(), setsRetrieved: 0, rarityListsRetrieved: 0, detailsRetrieved: 0, discoveryErrors: 0, priceErrors: 0, matches: 0, unmatched: 0, quotesRetrieved: 0, freshQuotesRetrieved: 0, historiesRetrieved: 0, priceSetsRetrieved: 0};
  const deadline = started + bounded('SYNC_BUDGET_MS', 1500000, 1800000);
  const tcgdex = createRateLimitedClient({minInterval: 100, deadline});
  const ticker = createRateLimitedClient({minInterval: 667, searchInterval: 3000, deadline});
  const previous = read('site/catalog.json', {cards: [], progress: {}});
  let discovery = {cards: [], progress: previous.progress || {}};
  try { discovery = await discover({client: tcgdex, report}); }
  catch (error) { report.discoveryErrors++; console.warn(`catalog discovery failed: ${error.message}; previous catalog retained`); }
  const identity = card => `${normalizedSet(card.set)}|${cleanNumber(String(card.number).split('/')[0])}`;
  report.discoverySeconds = Math.round((Date.now() - started) / 1000);
  const byKey = new Map();
  const previousIdentity = new Map();
  const previousPrices = read('site/prices.json', {prices: {}}).prices || {};
  for (const card of previous.cards || []) {
    const duplicate = previousIdentity.get(identity(card));
    if (!duplicate) { byKey.set(card.key, card); previousIdentity.set(identity(card), card); continue; }
    const key = previousPrices[duplicate.key] ? duplicate.key : previousPrices[card.key] ? card.key : card.id ? card.key : duplicate.key;
    const merged = card.id ? {...duplicate, ...card, key} : {...card, ...duplicate, key};
    byKey.delete(duplicate.key); byKey.delete(card.key); byKey.set(key, merged); previousIdentity.set(identity(card), merged);
    report.catalogDuplicatesRemoved = (report.catalogDuplicatesRemoved || 0) + 1;
  }
  for (const card of discovery.cards) {
    const prior = byKey.get(card.key) || previousIdentity.get(identity(card)) || {};
    const key = prior.key || card.key;
    byKey.set(key, {...prior, ...card, key, rarity: prior.rarity === 'Alt Art' && card.rarity === 'Other' ? 'Alt Art' : card.rarity});
  }
  const reconciled = reconcileCatalog([...byKey.values()], read('data/set_cache.json', {}), read('data/card_details.json', {}), previousPrices);
  report.catalogAliasesCollapsed = reconciled.duplicates;
  const cards = reconciled.cards.filter(card => card.year >= minYear && card.year <= CURRENT_YEAR && (!card.language || card.language === 'en')).sort((a, b) => a.year - b.year || a.name.localeCompare(b.name));
  discovery.progress.eligible = cards.length;
  write('site/catalog.json', {version: 4, generatedAt: stamp(), count: cards.length, progress: discovery.progress, cards});
  console.log(`Catalog: ${discovery.progress.reviewed || discovery.progress.catalogued} reviewed of ${discovery.progress.universe} physical cards; ${cards.length} eligible; ${report.detailsRetrieved} exceptional detail requests`);
  const priceStarted = Date.now();
  try { await updatePrices(cards, {client: ticker, report}); }
  catch (error) { report.priceErrors++; console.warn(`price provider failed: ${error.message}; all checkpoints and verified snapshots retained`); }
  // Preserve exact provider-identified Alternate Art labels learned during mapping.
  write('site/catalog.json', {version: 4, generatedAt: stamp(), count: cards.length, progress: discovery.progress, cards});
  report.pricingSeconds = Math.round((Date.now() - priceStarted) / 1000);
  report.finishedAt = stamp(); report.elapsedSeconds = Math.round((Date.now() - started) / 1000);
  report.providers = {tcgdex: tcgdex.stats, tickermint: ticker.stats};
  // Green Actions must include real, printing-specific market observations.
  report.meaningfulSuccess = report.freshQuotesRetrieved > 0;
  report.status = report.meaningfulSuccess ? (report.priceErrors || report.discoveryErrors ? 'partial' : 'success') : 'failed';
  write('data/sync_report.json', report);
  console.log(`Sync report: ${JSON.stringify(report)}`);
  if (!report.meaningfulSuccess) throw Error('No recent verified provider prices retrieved; run is not a successful refresh. Progress was checkpointed.');
  return report;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
