import test from 'node:test';
import {marketMetrics} from '../scripts/opportunity.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {verifyTickerProduct, parseTickerHits, parseHistoryForPrinting, createRateLimitedClient, retryAfterMillis, migrateResolution, resolutionFailure, atomicWriteJSON, mergeHistory} from '../scripts/provider.mjs';
import {discover, isPhysicalSet} from '../scripts/sync.mjs';
const card = {id: 'sm12-241', name: 'Pikachu', set: 'Cosmic Eclipse', number: '241/236'};
const product = {product_id: 201352, name: 'Pikachu (Secret)', set_name: 'SM - Cosmic Eclipse', card_number: '241/236', card_id: 'sm12-241', image_url: 'https://assets.tcgdex.net/en/sm/sm12/241/high.webp', game: 'pokemon'};
test('exact identity accepts documented English product and rejects near matches', () => {
  assert.equal(verifyTickerProduct(product, card).ok, true);
  for (const bad of [{name: 'Pikachu VMAX'}, {name: 'Pikachu Libre'}, {set_name: 'Cosmic Eclipse Promos'}, {card_number: '241/240'}, {language: 'ja'}, {card_id: 'sm12-240'}, {image_url: 'https://assets.tcgdex.net/ja/sm/sm12/241/high.webp'}, {name: 'Pikachu (Secret) PSA 10'}]) assert.equal(verifyTickerProduct({...product, ...bad}, card).ok, false, JSON.stringify(bad));
  assert.equal(parseTickerHits([product, {...product, product_id: 2}], card), null);
});
test('unknown language and permissive name prefixes cannot verify a product', () => {
  assert.equal(verifyTickerProduct({...product, image_url: null}, card).ok, false);
  assert.equal(verifyTickerProduct({...product, name: 'Pika'}, card).ok, false);
});
test('normal raw history is independent from foil and reverse pricing', () => {
  const raw = {'Reverse Holofoil': [{snapshot_date: '2026-10-17', market: 900}], Holofoil: [{snapshot_date: '2026-10-17', market: 12}], Normal: [{snapshot_date: '2026-10-17', market: 8}]};
  assert.deepEqual(parseHistoryForPrinting(raw), {printing: 'Holofoil', points: [['2026-10-17', 12]], reason: null});
  assert.equal(parseHistoryForPrinting(raw, 'Normal').points[0][1], 8);
  assert.deepEqual(parseHistoryForPrinting(raw, '1st Edition Holofoil').points, []);
  assert.deepEqual(parseHistoryForPrinting({'Reverse Holofoil': raw['Reverse Holofoil']}).points, []);
});
test('429 honors Retry-After before the next queue request and 503 retries safely', async () => {
  let clock = 0, count = 0; const calls = [], waits = [];
  const client = createRateLimitedClient({minInterval: 100, now: () => clock, sleep: async ms => { waits.push(ms); clock += ms; }, log: () => {}, fetchImpl: async () => {calls.push(clock); count++; return count === 1 ? new Response('', {status: 429, headers: {'retry-after': '5'}}) : count === 2 ? new Response('', {status: 503}) : new Response('{"ok":true}');}});
  assert.deepEqual(await client.get('https://example.test/products/1'), {ok: true});
  assert.ok(calls[1] >= 5000); assert.equal(client.stats.rateLimits, 1); assert.equal(client.stats.retries, 2); assert.ok(waits.length);
  assert.equal(retryAfterMillis('Thu, 01 Jan 1970 00:00:06 GMT', 1000), 5000);
});
test('nonretryable errors stop without wasting requests', async () => {
  const client = createRateLimitedClient({minInterval: 0, fetchImpl: async () => new Response('', {status: 403})});
  await assert.rejects(client.get('https://example.test'), /HTTP 403/); assert.equal(client.stats.requests, 1);
});
test('old unmatched zeros are retried with capped attempt and periodic review timestamps', () => {
  const now = '2026-10-18T12:00:00.000Z';
  let status = migrateResolution(0, now); assert.equal(status.status, 'retry'); assert.equal(status.attempts, 0);
  for (let i = 0; i < 5; i++) status = resolutionFailure(status, 'exact printing missing', {now});
  assert.equal(status.status, 'review'); assert.equal(status.attempts, 5); assert.ok(status.nextRetryAt > now); assert.equal(status.reason, 'exact printing missing');
  assert.equal(migrateResolution(123, now).status, 'legacy');
});
test('atomic checkpoints preserve complete JSON on replacement and history merges preserve old points', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pokeradar-checkpoint-'));
  try { const file = path.join(dir, 'checkpoint.json'); atomicWriteJSON(file, {done: ['a']}); atomicWriteJSON(file, {done: ['a', 'b']}); assert.deepEqual(JSON.parse(fs.readFileSync(file)), {done: ['a', 'b']}); assert.deepEqual(fs.readdirSync(dir), ['checkpoint.json']); }
  finally { fs.rmSync(dir, {recursive: true}); }
  assert.deepEqual(mergeHistory([['2026-10-16', 11], ['2026-10-17', 12]], [['2026-10-17', 13]]), [['2026-10-16', 11], ['2026-10-17', 13]]);
});
test('digital Pocket and jumbo sets are excluded from physical investment universe', () => {
  assert.equal(isPhysicalSet({id: 'A1', name: 'Genetic Apex'}), false);
  assert.equal(isPhysicalSet({id: 'P-A', name: 'Promos-A'}), false);
  assert.equal(isPhysicalSet({id: 'swsh12', name: 'Silver Tempest'}), true);
});
test('dates must be real calendar days', async () => {
  const {validDay} = await import('../scripts/provider.mjs');
  assert.equal(validDay('2026-02-30'), false); assert.equal(validDay('2024-02-29'), true); assert.equal(validDay('2026-10-18'), true);
});
test('bulk rarity discovery checkpoints interrupted work and includes every rarity', async () => {
  const {spawnSync} = await import('node:child_process');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pokeradar-discovery-'));
  const script = `
    import {discover} from ${JSON.stringify(new URL('../scripts/sync.mjs', import.meta.url).href)};
    const calls=[];
    const set={id:'demo',name:'Demo',releaseDate:'2020-01-01',cardCount:{official:2,total:3},cards:[{id:'demo-1',name:'Common',localId:'1'},{id:'demo-2',name:'Chase',localId:'2'},{id:'demo-3',name:'Unknown',localId:'3'}]};
    let interrupted=true;
    const client={get:async url=>{calls.push(url);if(url.endsWith('/sets'))return[{id:'demo',name:'Demo',cardCount:set.cardCount}];if(url.endsWith('/sets/demo'))return set;if(url.endsWith('/rarities'))return['Secret Rare','Ultra Rare'];if(url.endsWith('/rarities/Secret%20Rare'))return{cards:[set.cards[1]]};if(url.endsWith('/rarities/Ultra%20Rare')){if(interrupted)throw Error('interrupted provider request');return{cards:[]}}if(url.endsWith('/cards/demo-3'))return{id:'demo-3',name:'Unknown',localId:'3'};throw Error('Unexpected detail request '+url)}};
    const makeReport=()=>({setsRetrieved:0,rarityListsRetrieved:0,discoveryErrors:0,detailsRetrieved:0});
    const first=await discover({client,report:makeReport()});interrupted=false;
    const second=await discover({client,report:makeReport()});
    console.log(JSON.stringify({first,second,calls}));
  `;
  try {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {env: {...process.env, POKERADAR_ROOT: dir}, encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr);
    const {first, second, calls} = JSON.parse(result.stdout.trim().split('\n').at(-1));
    assert.equal(first.progress.bulkRarityComplete, false); assert.equal(second.progress.bulkRarityComplete, true);
    assert.equal(second.cards.length, 3); assert.equal(second.cards.find(c=>c.name==='Chase').rarity,'Other'); assert.equal(second.cards.find(c=>c.name==='Common').rarity,'Unclassified'); assert.equal(second.cards.find(c=>c.name==='Unknown').rarity,'Unclassified');
    assert.equal(calls.filter(url => url.endsWith('/rarities/Secret%20Rare')).length, 1);
    assert.equal(calls.filter(url => url.endsWith('/cards/demo-3')).length, 1);
    assert.equal(calls.some(url => url.endsWith('/cards/demo-1')), false);
    assert.equal(second.progress.reviewed, 3);
  } finally { fs.rmSync(dir, {recursive: true}); }
});
test('same-day completed run confirms a live quote', async () => {
  const {spawnSync} = await import('node:child_process');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pokeradar-refresh-'));
  const now = new Date().toISOString().slice(0, 10);
  atomicWriteJSON(path.join(dir, 'data/resolved_ids.json'), {[card.id]: {status: 'matched', productId: 201352, language: 'en', matchEvidence: 'fixture exact identity'}});
  const key = card.id;
  atomicWriteJSON(path.join(dir, 'site/prices.json'), {prices: {[key]: {productId: 201352, verifiedMatch: true, printing: 'Holofoil', language: 'en', historyChecked: now, history: [[now, 12]], price: 12, asOf: now}}});
  atomicWriteJSON(path.join(dir, '.cache/pokeradar/full-history.json'), {prices: {[key]: {productId: 201352, printing: 'Holofoil', history: [['2024-02-08', 8], [now, 12]]}}});
  const script = `
    import {updatePrices} from ${JSON.stringify(new URL('../scripts/sync.mjs', import.meta.url).href)};
    const report={quotesRetrieved:0,freshQuotesRetrieved:0,historiesRetrieved:0,priceErrors:0,matches:0,unmatched:0,priceSetsRetrieved:0};
    const calls=[]; const client={get:async url=>{calls.push(url);if(url.includes('/sets?'))return[{name:'Cosmic Eclipse',group_id:1}];return{Holofoil:[{snapshot_date:${JSON.stringify(now)},market:13}]}}};
    await updatePrices([{...${JSON.stringify(card)},key:${JSON.stringify(key)}}],{client,report});console.log(JSON.stringify({report,calls}));
  `;
  try {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {env: {...process.env, POKERADAR_ROOT: dir}, encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr); const parsed = JSON.parse(result.stdout.trim().split('\n').at(-1));
    assert.equal(parsed.report.quotesRetrieved, 1); assert.equal(parsed.report.freshQuotesRetrieved, 1); assert.equal(parsed.calls.filter(url => url.endsWith('/prices')).length, 1);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, '.cache/pokeradar/full-history.json'))).prices[key].history[0][0], '2024-02-08');
  } finally { fs.rmSync(dir, {recursive: true}); }
});
test('legacy product migration checkpoints a strong match and preserves saved prices when history fails', async () => {
  const {spawnSync} = await import('node:child_process');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pokeradar-failed-refresh-'));
  const key = 'cosmic eclipse|241/236';
  const saved = {price: 23, asOf: '2026-10-16', productId: 201352, verifiedMatch: true, history: [['2026-10-16', 23]]};
  atomicWriteJSON(path.join(dir, 'data/resolved_ids.json'), {[key]: 201352});
  atomicWriteJSON(path.join(dir, 'site/prices.json'), {updatedAt: '2026-10-16', prices: {[key]: saved}});
  const script = `
    import {updatePrices} from ${JSON.stringify(new URL('../scripts/sync.mjs', import.meta.url).href)};
    const report={quotesRetrieved:0,historiesRetrieved:0,priceErrors:0,matches:0,unmatched:0,priceSetsRetrieved:0};
    const client={get:async url=>{if(url.includes('/sets?'))return[{name:'Cosmic Eclipse',group_id:1}];if(url.endsWith('/sets/1'))return{group_id:1,name:'Cosmic Eclipse',cards:[${JSON.stringify(product)}]};throw Error('simulated interrupted history request')}};
    await updatePrices([{...${JSON.stringify(card)},key:${JSON.stringify(key)}}],{client,report});
  `;
  try {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {env: {...process.env, POKERADAR_ROOT: dir}, encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr);
    const resolution = JSON.parse(fs.readFileSync(path.join(dir, 'data/resolved_ids.json')))[key];
    assert.equal(resolution.status, 'matched'); assert.equal(resolution.productId, 201352); assert.equal(resolution.language, 'en'); assert.ok(resolution.matchEvidence);
    const actual = JSON.parse(fs.readFileSync(path.join(dir, 'site/prices.json')));
    assert.deepEqual(actual.prices[key], saved); assert.equal(actual.updatedAt, '2026-10-16');
  } finally { fs.rmSync(dir, {recursive: true}); }
});
test('a stale-only provider run fails its success gate and retains a newer saved quote', async () => {
  const {spawnSync} = await import('node:child_process');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pokeradar-stale-run-'));
  const day = new Date().toISOString().slice(0, 10);
  const key = 'cosmic eclipse|241/236';
  const saved = {productId: 201352, price: 23, asOf: '2026-10-16', printing: 'Holofoil', language: 'en', matchEvidence: 'prior verified English printing', verifiedMatch: true, history: [['2026-10-16', 23]], historyChecked: day};
  const set = {id: 'sm12', name: 'Cosmic Eclipse', releaseDate: '2019-11-01', cardCount: {official: 236, total: 271}, cards: [{id: 'sm12-241', name: 'Pikachu', localId: '241', image: 'https://assets.tcgdex.net/en/sm/sm12/241'}]};
  atomicWriteJSON(path.join(dir, 'data/set_cache.json'), {sm12: set});
  atomicWriteJSON(path.join(dir, 'data/rarity_cache.json'), {'Secret Rare': {checkedAt: `${day}T00:00:00Z`, cards: set.cards}});
  atomicWriteJSON(path.join(dir, 'data/resolved_ids.json'), {[key]: {status: 'matched', productId: 201352, language: 'en', matchEvidence: saved.matchEvidence}});
  atomicWriteJSON(path.join(dir, 'site/catalog.json'), {cards: [{...card, key, year: 2019}]});
  atomicWriteJSON(path.join(dir, 'site/prices.json'), {prices: {[key]: saved}});
  const script = `
    import {main} from ${JSON.stringify(new URL('../scripts/sync.mjs', import.meta.url).href)};
    globalThis.fetch=async url=>new Response(JSON.stringify(url.includes('tcgdex.net')?(url.endsWith('/sets')?[{id:'sm12',name:'Cosmic Eclipse',cardCount:${JSON.stringify(set.cardCount)}}]:['Secret Rare']):(url.includes('/sets?')?[{name:'Cosmic Eclipse',group_id:1}]:{Holofoil:[{snapshot_date:'2024-02-08',market:12}]})));
    try {await main();process.exitCode=2;}catch(error){console.log('EXPECTED_FAILURE '+error.message);}
  `;
  try {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {env: {...process.env, POKERADAR_ROOT: dir}, encoding: 'utf8'});
    assert.equal(result.status, 0, result.stdout + result.stderr); assert.match(result.stdout, /EXPECTED_FAILURE No recent verified provider prices retrieved/);
    const report = JSON.parse(fs.readFileSync(path.join(dir, 'data/sync_report.json'))); assert.equal(report.meaningfulSuccess, false); assert.equal(report.status, 'failed');
    const retained = JSON.parse(fs.readFileSync(path.join(dir, 'site/prices.json'))).prices[key]; assert.equal(retained.price, saved.price); assert.equal(retained.asOf, saved.asOf); assert.deepEqual(retained.history.at(-1), saved.history.at(-1)); assert.ok(retained.history.some(([date]) => date === '2024-02-08'), 'older valid provider history should backfill without replacing newer quote');
  } finally { fs.rmSync(dir, {recursive: true}); }
});
test('a 429 pauses workers that were already waiting for their rate slot', async () => {
  const started = Date.now(); const starts = []; let count = 0;
  const client = createRateLimitedClient({minInterval: 30, retries: 0, fetchImpl: async () => {starts.push(Date.now() - started); if (++count === 1) {await new Promise(resolve => setTimeout(resolve, 5)); return new Response('', {status: 429, headers: {'retry-after': '0.12'}});} return new Response('{}');}});
  await Promise.allSettled([client.get('https://example.test/1'), client.get('https://example.test/2')]);
  assert.ok(starts[1] >= 1900, `second worker sent after ${starts[1]}ms before the shared 2s minimum cooldown`);
});
test('whole-set CSV refreshes only previously verified identical printing and identity', async () => {
  const {spawnSync} = await import('node:child_process');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pokeradar-set-quotes-'));
  const day = new Date().toISOString().slice(0, 10);
  const cards = ['Pikachu', 'Gengar', 'Raichu'].map((name, i) => ({...card, key: `card-${i}`, name, number: `${241 + i}/236`}));
  const prices = Object.fromEntries(cards.map((value, i) => [value.key, {productId: 201352 + i, verifiedMatch: true, language: 'en', matchEvidence: 'prior exact English artwork verification', printing: 'Holofoil', price: 12, asOf: day, historyChecked: day, history: [[day, 12]]}]));
  atomicWriteJSON(path.join(dir, 'site/prices.json'), {prices});
  atomicWriteJSON(path.join(dir, 'data/resolved_ids.json'), Object.fromEntries(cards.map((value, i) => [value.key, {status: 'matched', productId: 201352 + i, groupId: 1}])));
  const csv = `date,product_id,name,set,number,printing,market_price_usd,url\n${day},201352,Pikachu,Cosmic Eclipse,241/236,Holofoil,13,https://tickermint.cards/card/201352\n${day},201353,Gengar,Cosmic Eclipse,242/236,Reverse Holofoil,50,https://tickermint.cards/card/201353\n${day},201354,Raichu,Cosmic Eclipse,999/236,Holofoil,20,https://tickermint.cards/card/201354\n`;
  const script = `
    import {updatePrices} from ${JSON.stringify(new URL('../scripts/sync.mjs', import.meta.url).href)};
    const report={quotesRetrieved:0,freshQuotesRetrieved:0,historiesRetrieved:0,priceErrors:0,matches:0,unmatched:0,priceSetsRetrieved:0};
    const calls=[];const client={get:async url=>{calls.push(url);if(url.includes('/sets?'))return[{name:'Cosmic Eclipse',group_id:1}];if(url.endsWith('.csv'))return ${JSON.stringify(csv)};throw Error('unexpected per-card request')}};
    await updatePrices(${JSON.stringify(cards)},{client,report}); console.log(JSON.stringify({report,calls}));
  `;
  try {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {env: {...process.env, POKERADAR_ROOT: dir, MAX_HISTORY_PER_RUN: '0'}, encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr); const {report, calls} = JSON.parse(result.stdout.trim().split('\n').at(-1));
    assert.equal(report.bulkQuotesRetrieved, 1); assert.equal(report.freshQuotesRetrieved, 1); assert.equal(report.historiesRetrieved, 0); assert.equal(calls.some(url => url.endsWith('/prices')), false);
    const actual = JSON.parse(fs.readFileSync(path.join(dir, 'site/prices.json'))).prices;
    assert.equal(actual['card-0'].price, 13); assert.equal(actual['card-1'].price, 12); assert.equal(actual['card-2'].price, 12); assert.equal(actual['card-0'].historyChecked, day);
  } finally { fs.rmSync(dir, {recursive: true}); }
});
test('explicit English set aliases hydrate release dates and collapse identical printing without losing priced key', async () => {
  const {reconcileCatalog, normalizedSet} = await import('../scripts/provider.mjs');
  assert.equal(normalizedSet('SM Base Set'), normalizedSet('Sun & Moon'));
  assert.equal(normalizedSet('SV01: Scarlet & Violet Base Set'), normalizedSet('Scarlet & Violet'));
  assert.notEqual(normalizedSet('Cosmic Eclipse Promos'), normalizedSet('Cosmic Eclipse'));
  const cache = {'sv03.5': {id: 'sv03.5', name: '151', releaseDate: '2023-09-22', cards: [{id: 'sv03.5-173', name: 'Pikachu', localId: '173', image: 'https://assets.tcgdex.net/en/sv/sv03.5/173'}]}};
  const cards = [{key: 'legacy', name: 'Pikachu', set: 'Scarlet & Violet 151', number: '173/165'}, {key: '151|173/165', id: 'sv03.5-173', name: 'Pikachu', set: '151', number: '173/165'}, {key: 'other', name: 'Pikachu', set: '151', number: '174/165'}];
  const actual = reconcileCatalog(cards, cache, {}, {legacy: {price: 20, verifiedMatch: true, printing: 'Holofoil', language: 'en', matchEvidence: 'prior exact identity'}});
  assert.equal(actual.duplicates, 1); assert.equal(actual.cards.length, 2); assert.equal(actual.cards[0].key, 'legacy'); assert.equal(actual.cards[0].releaseDate, '2023-09-22'); assert.equal(actual.cards[0].id, 'sv03.5-173'); assert.equal(actual.cards[0].set, '151');
});
test('provider freshness and recommendation freshness use the same calendar-day boundary', async () => {
  const {isFreshDay} = await import('../scripts/provider.mjs');
  for (const day of ['2026-10-19','2026-10-18','2026-10-14','2026-10-13','2026-02-30']) {
    const metrics = marketMetrics({price: 12, asOf: day}, {asOf: '2026-10-18'});
    assert.equal(isFreshDay(day, '2026-10-18'), !metrics.stale, day);
  }
});
