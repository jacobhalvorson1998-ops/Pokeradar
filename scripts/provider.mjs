/** Strict provider boundaries and rate-aware reads; no paid API endpoints. */
import fs from 'node:fs';
import path from 'node:path';
export const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
export const money = value => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && n < 1e7 ? Math.round(n * 100) / 100 : null;
};
export const validDay = value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
// Providers supply calendar dates, not intraday timestamps; share the UI/model boundary.
export const isFreshDay = (value, asOf = new Date().toISOString().slice(0, 10), maxAgeDays = 4) =>
  validDay(value) && validDay(asOf) && value <= asOf &&
  (Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${value}T00:00:00Z`)) / 86400000 <= maxAgeDays;
export const cleanNumber = value => String(value ?? '').toUpperCase().replace(/\s+/g, '').replace(/(^|\/)([A-Z]*)0+(?=\d)/g, '$1$2');
const normalizeSetText = value => String(value ?? '').normalize('NFKD').toLowerCase()
  .replace(/pokémon/g, 'pokemon')
  .replace(/^(?:sv\d*|sm\d*|swsh\d*|me\d*|xy\d*|bw\d*|sword\s*&\s*shield|sun\s*&\s*moon|scarlet\s*&\s*violet|platinum|diamond\s*&\s*pearl)\s*[:–-]\s*/, '')
  .replace(/[^a-z0-9]/g, '');
export const normalizedSet = value => {
  const key = normalizeSetText(value);
  return ({scarletviolet151: '151', scarletvioletbaseset: 'scarletviolet', swordshieldbaseset: 'swordshield', smbaseset: 'sunmoon', xybaseset: 'xy', blackandwhite: 'blackwhite', swshblackstarpromos: 'swordshieldpromocards'})[key] || key;
};
/** Hydrate known cards from the English cache and collapse explicit set aliases. */
export function reconcileCatalog(cards, setCache, detailCache = {}, prices = {}) {
  const sets = Object.values(setCache);
  const score = card => {
    const market = prices[card.key];
    return (market?.verifiedMatch && market.printing && market.language === 'en' && market.matchEvidence ? 30 : market?.price ? 20 : 0) + (card.key?.startsWith(`${String(card.set).toLowerCase()}|`) ? 2 : 0);
  };
  const result = new Map(); let hydrated = 0, duplicates = 0;
  for (const input of cards) {
    const card = {...input};
    const local = cleanNumber(String(card.number).split('/')[0]);
    let target = normalizedSet(card.set);
    if (target === 'crownzenith' && /^GG/i.test(local)) target = 'crownzenithgalariangallery';
    if (target === 'hiddenfates' && /^SV/i.test(local)) target = 'hiddenfatesshinyvault';
    const englishScope = !card.language || ['en', 'english', 'en-us'].includes(String(card.language).toLowerCase());
    const found = (englishScope ? sets : []).filter(set => normalizedSet(set.name) === target).flatMap(set => (set.cards || []).filter(brief => cleanNumber(brief.localId) === local && normalizedName(brief.name) === normalizedName(card.name) && (!card.id || card.id === brief.id)).map(brief => ({set, brief})));
    if (found.length === 1) {
      const {set, brief} = found[0];
      card.id = brief.id; card.set = set.name; card.setId = set.id; card.releaseDate = set.releaseDate; card.language = 'en';
      card.sourceRarity ||= detailCache[brief.id]?.rarity;
      if (!card.image && brief.image) card.image = `${brief.image.replace(/\/$/, '')}/low.webp`;
      hydrated++;
    }
    const identity = card.id || `${normalizedSet(card.set)}|${local}`;
    const previous = result.get(identity);
    if (!previous) { result.set(identity, card); continue; }
    const preferred = score(card) > score(previous) ? card : previous;
    const other = preferred === card ? previous : card;
    const merged = {...other, ...preferred, key: preferred.key, image: preferred.image || other.image || ''};
    if (other.rarityEvidence && !preferred.rarityEvidence) { merged.rarity = other.rarity; merged.rarityEvidence = other.rarityEvidence; }
    result.set(identity, merged); duplicates++;
  }
  return {cards: [...result.values()], hydrated, duplicates};
}
export const normalizedName = value => String(value ?? '').normalize('NFKD').toLowerCase().replace(/[^a-z0-9♀♂]/g, '');
function productName(value, card) {
  let text = String(value ?? '');
  // Explicit English spelling/gender conventions, never fuzzy name matching.
  text=text.replace(/^Nidoran\s*(?:M|♂)$/i,'Nidoran♂').replace(/^Nidoran\s*(?:F|♀)$/i,'Nidoran♀').replace(/^Imposter Professor Oak$/i,'Impostor Professor Oak');
  const collectorSuffix=text.match(/\s*\(([A-Z]*\d+[A-Z]?)\)\s*$/i);
  if(collectorSuffix&&cleanNumber(collectorSuffix[1])===cleanNumber(String(card.number).split('/')[0]))text=text.slice(0,collectorSuffix.index);

  if(['First Edition','Shadowless'].includes(card.edition))text=text.replace(/\s*\((?:1st edition|first edition|shadowless)\)\s*$/ig,'').replace(/\s+-\s*(?:1st edition|first edition|shadowless)\s*$/ig,'');
  text = text.replace(/\s+[-–]\s*[a-z]*\d+\s*\/\s*[a-z]*\d+\s*$/i, '');
  // Only descriptive rarity annotations: gameplay suffixes EX, GX, V, etc. stay.
  const annotation = /\s*\((?:(?:\d+\s+)?(?:secret(?: rare)?|full art|alternate full art|alternate art|alt art|shiny|prime|gold)|supporter|team plasma|\d+)\)\s*$/i;
  while (annotation.test(text)) text = text.replace(annotation, '');
  if (/lv\.?x/i.test(card.sourceRarity || '') && !/^SH/i.test(card.number || '')) text = text.replace(/\s+lv\.?x\s*$/i, '');
  if (/legend/i.test(card.sourceRarity || '')) text = text.replace(/\s+legend(?:\s*\((?:top|bottom)\))?\s*$/i, '');
  return normalizedName(text);
}
function imageCardId(image) {
  const match = String(image ?? '').match(/^https:\/\/assets\.tcgdex\.net\/en\/[^/]+\/([^/]+)\/([^/.]+)(?:\/(?:high|low)\.(?:webp|png|jpg))?\/?$/i);
  return match ? `${match[1]}-${match[2]}` : null;
}
/** A product is a match only with exact identity and affirmative English evidence. */
export function verifyTickerProduct(product, card) {
  if(product?.printing&&card.printing&&product.printing!==card.printing)return {ok:false,reason:'exact printing mismatch'};
  if(product?.edition&&card.edition&&product.edition!==card.edition)return {ok:false,reason:'exact edition mismatch'};
  if(card.priceIdentityAmbiguous)return {ok:false,reason:'provider cannot distinguish these edition prices'};
  if(card.primary===false&&!['Standard','Unlimited'].includes(card.edition)&&!card.tcgplayerProductId)return {ok:false,reason:'special edition lacks an authoritative product binding'};
  if (card.language && !['en', 'english', 'en-us'].includes(String(card.language).toLowerCase())) return {ok: false, reason: 'catalog card is not English'};
  const id = Number(product?.product_id ?? product?.productId ?? product?.id);
  if (!Number.isSafeInteger(id) || id <= 0) return {ok: false, reason: 'missing product id'};
  if(card.tcgplayerProductId && id!==card.tcgplayerProductId)return {ok:false,reason:'authoritative printing product id mismatch'};
  if (product.game && product.game !== 'pokemon') return {ok: false, reason: 'wrong game'};
  if (/japanese|korean|chinese|french|german|italian|spanish|portuguese|\(jp\)/i.test(`${product.name || ''} ${product.set_name || ''}`)) return {ok: false, reason: 'foreign language'};
  const setName = typeof product.set === 'object' ? product.set.name : product.set_name ?? product.set ?? product.group_name;
  if (!setName || normalizedSet(setName) !== normalizedSet(card.set)) return {ok: false, reason: 'set mismatch'};
  const gotNumber = cleanNumber(product.card_number ?? product.number ?? product.collector_number);
  const expectedNumber = cleanNumber(card.number);
  // A full denominator, when available on both sides, must agree as well.
  if (!gotNumber || gotNumber.split('/')[0] !== expectedNumber.split('/')[0] || (gotNumber.includes('/') && expectedNumber.includes('/') && gotNumber !== expectedNumber)) return {ok: false, reason: 'collector number mismatch'};
  if (productName(product.name, card) !== productName(card.name, card)) return {ok: false, reason: 'name mismatch'};
  const language = String(product.language ?? product.lang ?? '').toLowerCase();
  if (language && !['en', 'english', 'en-us'].includes(language)) return {ok: false, reason: 'foreign language'};
  const imageId = imageCardId(product.image_url ?? product.image);
  if ((card.baseId||card.id) && product.card_id && product.card_id !== (card.baseId||card.id)) return {ok: false, reason: 'card printing id mismatch'};
  if ((card.baseId||card.id) && imageId && imageId !== (card.baseId||card.id)) return {ok: false, reason: 'artwork printing mismatch'};
  if (!['en', 'english', 'en-us'].includes(language) && !imageId && !(card.language==='en'&&card.tcgplayerProductId===id)) return {ok: false, reason: 'English printing unverified'};
  if (/\b(?:psa|bgs|cgc|graded|jumbo|oversized|world championship|staff|prerelease)\b/i.test(product.name || '')) return {ok: false, reason: 'unsupported product printing'};
  if(/1st edition|first edition|shadowless/i.test(product.name||'')&&!['First Edition','Shadowless'].includes(card.edition))return {ok:false,reason:'unsupported product printing'};
  if(['First Edition','Shadowless'].includes(card.edition)&&card.tcgplayerProductId!==id)return {ok:false,reason:'edition lacks authoritative product binding'};
  return {ok: true, productId: id, groupId: Number(product.group_id) || null, language: 'en', evidence: imageId ? 'English TCGdex artwork + exact name/set/number' : 'explicit English + exact name/set/number'};
}
export function parseTickerHits(raw, card) {
  const rows = Array.isArray(raw) ? raw : raw?.results ?? raw?.data ?? raw?.products ?? [];
  if (!Array.isArray(rows)) return null;
  const ids = new Set(rows.filter(product => verifyTickerProduct(product, card).ok).map(product => Number(product.product_id ?? product.productId ?? product.id)));
  return ids.size === 1 ? [...ids][0] : null;
}
export function matchFailureReason(products, card) {
  const rows = Array.isArray(products) ? products : [];
  const nearby = rows.filter(product => cleanNumber(product.card_number ?? product.number ?? product.collector_number).split('/')[0] === cleanNumber(card.number).split('/')[0]);
  if (!nearby.length) return 'collector number absent from provider set/search';
  const reasons = [...new Set(nearby.map(product => verifyTickerProduct(product, card)).filter(result => !result.ok).map(result => result.reason))];
  return reasons.length ? `exact identity rejected: ${reasons.sort().join('; ')}` : 'ambiguous multiple exact products';
}
export function parseHistoryForPrinting(raw, requestedPrinting = null) {
  const source = raw?.data ?? raw?.history ?? raw?.prices ?? raw;
  if (!source || Array.isArray(source) || typeof source !== 'object') return {printing: null, points: [], reason: 'missing per-printing history'};
  const variants = Object.entries(source).filter(([, value]) => Array.isArray(value));
  let selected;
  if (requestedPrinting) selected = variants.find(([printing]) => printing.toLowerCase() === requestedPrinting.toLowerCase());
  else {
    // Never substitute a reverse foil/1st-edition price for the ordinary printing.
    selected = variants.find(([printing]) => /^holofoil$/i.test(printing)) ?? variants.find(([printing]) => /^normal$/i.test(printing));
  }
  if (!selected) return {printing: null, points: [], reason: requestedPrinting ? `requested ${requestedPrinting} printing unavailable` : 'standard English raw printing unavailable'};
  const [printing, rows] = selected;
  const dates = new Map();
  for (const row of rows) {
    const day = String(row.snapshot_date ?? row.date ?? row.as_of ?? '').slice(0, 10);
    const price = money(row.market ?? row.market_price ?? row.marketPrice ?? row.price);
    if (validDay(day) && price) dates.set(day, price);
  }
  return {printing, points: [...dates].sort((a, b) => a[0].localeCompare(b[0])), reason: dates.size ? null : 'no valid market observations'};
}
export function parseHistory(raw) { return parseHistoryForPrinting(raw).points.slice(-120); }
export function parseCSV(csv) {
  const rows = []; let row = [], part = '', quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    if (quoted) { if (char === '"' && csv[i + 1] === '"') { part += '"'; i++; } else if (char === '"') quoted = false; else part += char; }
    else if (char === '"') quoted = true;
    else if (char === ',') { row.push(part); part = ''; }
    else if (char === '\n') { row.push(part.replace(/\r$/, '')); rows.push(row); row = []; part = ''; }
    else part += char;
  }
  if (part || row.length) { row.push(part); rows.push(row); }
  const header = (rows.shift() ?? []).map(value => value.toLowerCase().trim());
  return rows.filter(value => value.length > 1).map(value => Object.fromEntries(header.map((key, i) => [key, value[i]])));
}
export function retryAfterMillis(value, now = Date.now()) {
  if (!value) return 0;
  const seconds = Number(value);
  return Number.isFinite(seconds) ? Math.max(0, seconds * 1000) : Math.max(0, Date.parse(value) - now) || 0;
}
export class ProviderError extends Error {
  constructor(message, status = null, retryable = false) { super(message); this.status = status; this.retryable = retryable; }
}
export class BudgetExceeded extends Error {}
/** One shared rate gate per provider, including retries and search requests. */
export function createRateLimitedClient({fetchImpl = globalThis.fetch, minInterval = 667, searchInterval = 3000, retries = 4, timeout = 25000, deadline = Infinity, now = Date.now, sleep = pause, log = console.log} = {}) {
  let gate = Promise.resolve(), nextRead = 0, nextSearch = 0, blockedUntil = 0;
  const stats = {requests: 0, successes: 0, errors: 0, rateLimits: 0, retries: 0};
  async function reserve(search) {
    const slot = gate.then(async () => {
      // Recheck after sleeping: another in-flight worker can receive 429 and
      // extend the shared cooldown while this reservation is waiting.
      for (;;) {
        const due = Math.max(nextRead, blockedUntil, search ? nextSearch : 0);
        if (Math.max(now(), due) >= deadline) throw new BudgetExceeded('sync time budget reached; checkpoint saved');
        if (due <= now()) break;
        await sleep(due - now());
      }
      nextRead = now() + minInterval;
      if (search) nextSearch = now() + searchInterval;
    });
    gate = slot.catch(() => {}); await slot;
  }
  async function get(url, {format = 'json', search = false} = {}) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      await reserve(search); stats.requests++;
      try {
        const response = await fetchImpl(url, {headers: {accept: format === 'json' ? 'application/json' : 'text/csv', 'user-agent': 'PokeRadar/4.0 personal-noncommercial; daily-cache'}, signal: AbortSignal.timeout(timeout)});
        if (!response.ok) {
          const transient = response.status === 429 || response.status === 408 || response.status >= 500;
          if (response.status === 429) { stats.rateLimits++; blockedUntil = Math.max(blockedUntil, now() + Math.max(retryAfterMillis(response.headers.get('retry-after'), now()), Math.min(30000, 2000 * 2 ** attempt))); }
          throw new ProviderError(`HTTP ${response.status} ${new URL(url).pathname}`, response.status, transient);
        }
        const result = format === 'json' ? await response.json() : await response.text(); stats.successes++; return result;
      } catch (error) {
        stats.errors++;
        const retryable = error instanceof ProviderError ? error.retryable : true;
        if (!retryable || attempt === retries) throw error;
        stats.retries++; const backoff = Math.min(30000, 1000 * 2 ** attempt);
        log(`provider retry ${attempt + 1}/${retries}: ${error.message}; backoff ${backoff}ms`);
        if (now() + backoff >= deadline) throw new BudgetExceeded('sync time budget reached during retry');
        await sleep(backoff);
      }
    }
  }
  return {get, stats};
}
export function atomicWriteJSON(file, value) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const temp = `${file}.${process.pid}.tmp`;
  try { fs.writeFileSync(temp, `${JSON.stringify(value)}\n`); fs.renameSync(temp, file); }
  finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}
export const MATCH_POLICY_VERSION = 3;
export function migrateResolution(value, now = new Date().toISOString()) {
  if (value && typeof value === 'object') {
    if (value.status !== 'matched' && value.matchPolicyVersion !== MATCH_POLICY_VERSION) return {...value, status: 'retry', attempts: 0, matchPolicyVersion: MATCH_POLICY_VERSION, nextRetryAt: now, reason: 'matching policy updated; retry exact identity'};
    return value;
  }
  // Old numeric matches must pass the stronger identity checks before reuse.
  if (Number.isSafeInteger(value) && value > 0) return {status: 'legacy', productId: value, attempts: 0, matchPolicyVersion: MATCH_POLICY_VERSION, reason: 'requires exact English printing verification', nextRetryAt: now};
  return {status: 'retry', attempts: 0, matchPolicyVersion: MATCH_POLICY_VERSION, reason: value === 0 ? 'legacy unmatched result; retry enabled' : 'not yet matched', nextRetryAt: now};
}
export function resolutionFailure(previous, reason, {now = new Date().toISOString(), transient = false, maxAttempts = 5} = {}) {
  const attempts = (previous?.attempts ?? 0) + 1;
  const days = attempts >= maxAttempts ? 30 : Math.min(14, 2 ** (attempts - 1));
  const delay = transient ? Math.min(24, 2 ** (attempts - 1)) * 3600000 : days * 86400000;
  return {...previous, status: attempts >= maxAttempts ? 'review' : 'retry', matchPolicyVersion: MATCH_POLICY_VERSION, attempts, lastAttemptAt: now, reason, nextRetryAt: new Date(Date.parse(now) + delay).toISOString()};
}
export function mergeHistory(previous = [], next = []) {
  return [...new Map([...previous, ...next].filter(([day, value]) => validDay(day) && money(value))).entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

/** A shared WotC product may call its ordinary foil "Unlimited Holofoil".
 * Accept only the declared, product-bound pair of First Edition + Unlimited
 * from the actual response. Never fall back to the First Edition series. */
export function resolveVintagePrinting(card,raw,siblings=[]){
 if(!card.variantVerified||card.primary===false||card.edition!=='Standard'||!Number.isInteger(card.year)||card.year<1999||card.year>2002||!['Holofoil','Normal'].includes(card.printing)||!card.tcgplayerProductId)return null;
 const foil=card.printing,first='1st Edition '+foil,unlimited='Unlimited '+foil;
 const declared=siblings.some(c=>(c.baseId||c.id)===(card.baseId||card.id)&&c.edition==='First Edition'&&c.printing===first&&c.tcgplayerProductId===card.tcgplayerProductId&&c.variantVerified);
 if(!declared||parseHistoryForPrinting(raw,foil).points.length||!parseHistoryForPrinting(raw,first).points.length||!parseHistoryForPrinting(raw,unlimited).points.length)return null;
 return {cardId:card.baseId||card.id,name:card.name,setId:card.setId,number:card.number,language:'en',productId:card.tcgplayerProductId,foil,printing:unlimited,edition:'Unlimited',verified:true,verifiedAt:new Date().toISOString(),url:`https://api.tickermint.cards/products/${card.tcgplayerProductId}/prices`,evidence:'TCGdex card-specific English foil + First Edition declarations share exact product; provider returns separate First Edition and Unlimited series and no generic series.'};
}
