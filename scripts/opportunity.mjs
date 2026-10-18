/**
 * Deterministic, conservative opportunity screening, calculated in the daily job.
 * Scores express the owner's preferences, not a probability or return forecast.
 * Every price and peer observation is restricted to the requested evaluation day.
 */
export const MODEL_VERSION = 4;
export const MODEL_WEIGHTS = Object.freeze({age:25,relativeValue:25,correction:20,momentum:15,popularity:10,liquidity:5});
export const MODEL_DEFAULTS = Object.freeze({buyThreshold:80,minPeers:3,minObservations:28,minHistoryDays:90,maxStaleDays:4});
export const MODEL_NOTES = [
 'Opportunity Score is a preference-based screen, not a predicted return or probability.',
 'The 80-point Buy Now threshold is provisional unless a sufficiently large held-out backtest supports calibration.',
 'Liquidity, sales volume and listing quality are unavailable; their 5% contribution is zero, so the available-data score is capped at 95.',
 'Collector popularity is an editorial species proxy, not measured demand or sales.',
 'TickerMint history begins in February 2024; release year does not imply a long price history.',
 'Market estimates do not establish the price or condition of an actual Near Mint listing.'
];
const DAY = 86400000;
// Daily provider series share the same dates across thousands of cards. These
// bounded parsing caches remove repeated UTC parsing during historical replay.
const parsedDays = new Map(),dayEpochs = new Map();
const memoize = (cache,key,value) => {
 if (cache.size>=8192) cache.clear();
 cache.set(key,value);return value;
};
const clamp = n => Math.max(0, Math.min(100, n));
const rounded = (n, digits=1) => Number.isFinite(n) ? Number(n.toFixed(digits)) : null;
const positive = n => typeof n === 'number' && Number.isFinite(n) && n > 0;

/** Calendar validation rejects impossible dates instead of silently rolling over. */
export function dayString(value) {
 const candidate = value instanceof Date ? (Number.isFinite(value.getTime()) ? value.toISOString().slice(0,10) : '') : String(value ?? '').slice(0,10);
 if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return null;
 if (parsedDays.has(candidate)) return parsedDays.get(candidate);
 const epoch = Date.parse(candidate+'T00:00:00Z');
 return memoize(parsedDays,candidate,Number.isFinite(epoch) && new Date(epoch).toISOString().slice(0,10) === candidate ? candidate : null);
}
const epoch = day => dayEpochs.has(day) ? dayEpochs.get(day) : memoize(dayEpochs,day,Date.parse(day+'T00:00:00Z'));
export function median(values) {
 const sorted = values.filter(Number.isFinite).sort((a,b)=>a-b);
 if (!sorted.length) return null;
 const middle = Math.floor(sorted.length/2);
 return sorted.length % 2 ? sorted[middle] : (sorted[middle-1]+sorted[middle])/2;
}
export function agePriority(year) {
 if (!Number.isInteger(year) || year < 2008) return 0;
 return year <= 2012 ? 100 : year <= 2016 ? 85 : year <= 2019 ? 70 : year <= 2022 ? 50 : year <= 2024 ? 30 : 15;
}

/** Deduplicate actual daily observations; never interpolate or carry a future quote backwards. */
export function cleanHistory(history, asOf) {
 const cutoff = dayString(asOf);
 if (!cutoff) throw new RangeError('A valid asOf day is required');
 const byDay = new Map();
 for (const point of Array.isArray(history) ? history : []) {
  if (!Array.isArray(point)) continue;
  const day = dayString(point[0]);
  if (day && day <= cutoff && positive(point[1])) byDay.set(day,point[1]);
 }
 return [...byDay].sort(([a],[b])=>a.localeCompare(b));
}

/** Returns the last observation on or before the target, never one after it. */
export function historicalReference(history, target, toleranceDays=3) {
 const day = dayString(target);
 if (!day) return null;
 let result = null;
 for (const point of history) {
  if (point[0] > day) break;
  result = point;
 }
 return result && epoch(day)-epoch(result[0]) <= toleranceDays*DAY ? result : null;
}

export function marketMetrics(market={}, {asOf=new Date(),maxStaleDays=MODEL_DEFAULTS.maxStaleDays}={}) {
 const cutoff = dayString(asOf);
 if (!cutoff) throw new RangeError('A valid asOf day is required');
 const history = cleanHistory(market.history,cutoff);
 const quoteDay = dayString(market.asOf);
 if (quoteDay && quoteDay <= cutoff && positive(market.price)) {
  const last = history.at(-1);
  if (!last || quoteDay >= last[0]) {
   if (last?.[0] === quoteDay) history[history.length-1] = [quoteDay,market.price];
   else history.push([quoteDay,market.price]);
  }
 }
 const last = history.at(-1);
 const price = last?.[1] ?? null, priceDay = last?.[0] ?? null;
 const staleness = priceDay ? (epoch(cutoff)-epoch(priceDay))/DAY : null;
 const series = priceDay ? history.filter(([date])=>epoch(priceDay)-epoch(date)<=93*DAY) : [];
 const delta = days => {
  if (!priceDay) return null;
  const target = new Date(epoch(priceDay)-days*DAY).toISOString().slice(0,10);
  const ref = historicalReference(history,target,3);
  return ref ? (price/ref[1]-1)*100 : null;
 };
 const recent90 = priceDay ? history.filter(([date])=>epoch(priceDay)-epoch(date)<=90*DAY) : [];
 const high90 = recent90.length ? Math.max(...recent90.map(([,value])=>value)) : null;
 const mean90 = recent90.length ? recent90.reduce((total,[,value])=>total+value,0)/recent90.length : null;
 const median90 = median(recent90.map(([,value])=>value));
 const historyDays = series.length > 1 ? Math.floor((epoch(priceDay)-epoch(series[0][0]))/DAY) : 0;
 const historyObservations = series.length;
 let maxGap = 0;
 for (let i=1;i<series.length;i++) maxGap = Math.max(maxGap,(epoch(series[i][0])-epoch(series[i-1][0]))/DAY);
 const historyEnough = historyDays>=MODEL_DEFAULTS.minHistoryDays && historyObservations>=MODEL_DEFAULTS.minObservations && maxGap<=14 && [7,30,90].every(days=>Number.isFinite(delta(days)));
 return {
  price,asOf:priceDay,stale:staleness===null || staleness>maxStaleDays,stalenessDays:staleness,
  change7:rounded(delta(7)),change30:rounded(delta(30)),change90:rounded(delta(90)),
  drop90:high90 && price ? rounded((price/high90-1)*100) : null,
  average90:rounded(mean90,2),medianPrice90:rounded(median90,2),high90:rounded(high90,2),
  belowAverage90:mean90 && price ? rounded((price/mean90-1)*100) : null,
  historyDays,historyObservations,historyEnough,maxHistoryGapDays:maxGap,
 };
}

function identityWarningsFor(card,market) {
 const warnings = [];
 if (market.verifiedMatch!==true || !Number.isSafeInteger(market.productId) || market.productId<1) warnings.push('Card and printing have not been verified against a provider product.');
 if (market.matchStatus && !['matched','verified'].includes(market.matchStatus)) warnings.push('Product matching needs review.');
 const language = String(market.language ?? '').toLowerCase();
 if (!['en','english'].includes(language)) warnings.push('English-language product identity has not been verified.');
 if (market.condition && !/^(raw|nm|near mint)$/i.test(market.condition)) warnings.push('Price condition does not match raw Near Mint screening.');
 if (!['Holofoil','Normal'].includes(market.printing)) warnings.push('An exact standard printing price has not been verified.');
 if (typeof market.matchEvidence!=='string' || !market.matchEvidence.trim()) warnings.push('Exact product-matching evidence has not been recorded.');
 return warnings;
}

function warningsFor(card,market,metrics,evaluationDay) {
 const warnings = identityWarningsFor(card,market);
 if (!Number.isInteger(card.year) || card.year<2008 || card.year>Number(evaluationDay.slice(0,4))) warnings.push('Release year is outside the supported catalog.');
 if (card.releaseDate && (!dayString(card.releaseDate) || dayString(card.releaseDate)>evaluationDay)) warnings.push('Card had not been released at the evaluation date.');
 if (metrics.price===null) warnings.push('No verified market price is available.');
 else if (metrics.stale) warnings.push('Latest saved price is more than four days old.');
 if (!metrics.historyEnough) warnings.push('Need 90 calendar days, at least 28 observations, 7/30/90-day reference prices and no gap over 14 days.');
 if (Array.isArray(market.qualityWarnings)) for (const warning of market.qualityWarnings) if (typeof warning==='string' && warning.trim()) warnings.push(warning);
 return [...new Set(warnings)];
}

const rarityGroup = rarity => {
 if (['IR','Galarian Gallery','Trainer Gallery'].includes(rarity)) return 'illustration';
 if (['SIR','Alt Art'].includes(rarity)) return 'premium-illustration';
 return String(rarity || 'unknown');
};

export function comparePeers(card, rows, {minPeers=MODEL_DEFAULTS.minPeers}={}) {
 // Same-set/rarity peers in a 4x band avoid comparing a $5 illustration with a $500 chase card.
 const sameSet = rows.filter(row=>row.key!==card.key && row.set===card.set && row.verifiedMatch && !row.stale && row.historyEnough && row.baseQualityWarnings.length===0 && positive(row.price));
 const peers = sameSet.filter(row=>rarityGroup(row.rarity)===rarityGroup(card.rarity) && row.price>=card.price/4 && row.price<=card.price*4);
 const median30 = median(peers.map(row=>row.change30));
 const median90 = median(peers.map(row=>row.change90));
 const setMedian30 = median(sameSet.map(row=>row.change30));
 const setMedian90 = median(sameSet.map(row=>row.change90));
 const reliable = peers.length>=minPeers && Number.isFinite(median30) && Number.isFinite(median90);
 const ranked = [card,...peers].sort((a,b)=>b.price-a.price);
 return {
  count:peers.length,reliable,median30:rounded(median30),median90:rounded(median90),
  relative30:reliable ? rounded(card.change30-median30) : null,
  relative90:reliable ? rounded(card.change90-median90) : null,
  setCount:sameSet.length,setMedian30:rounded(setMedian30),setMedian90:rounded(setMedian90),
  setDeclining:sameSet.length>=minPeers ? setMedian30<=-7 || (setMedian90<=-10 && setMedian30<0) : null,
  priceRank:reliable ? ranked.findIndex(row=>row.key===card.key)+1 : null,
  rankTotal:reliable ? ranked.length : null,
  method:'Same set, similar rarity, price between one quarter and four times the card price; excludes the card itself.'
 };
}

function scoreComponents(card) {
 const relativeValue = card.peers.reliable ? clamp(35 + Math.max(0,-card.peers.relative30)*2 + Math.max(0,-card.peers.relative90)*1.2) : null;
 const correction = card.drop90!==null && card.belowAverage90!==null ? clamp(Math.max(0,-card.drop90)*2.5 + Math.max(0,-card.belowAverage90)*1.5) : null;
 const momentum = card.change7===null ? null : card.change7 < -3 ? clamp(35+(card.change7+3)*3) : card.change7 <= 4 ? 95 : clamp(75-(card.change7-4)*4);
 return {age:agePriority(card.year),relativeValue:rounded(relativeValue),correction:rounded(correction),momentum:rounded(momentum),popularity:Number.isFinite(card.hype) ? clamp(card.hype) : 50,liquidity:null};
}

export function assessCatalog(cards, prices, {asOf=new Date(),buyThreshold=MODEL_DEFAULTS.buyThreshold}={}) {
 const evaluationDay = dayString(asOf);
 if (!evaluationDay) throw new RangeError('A valid asOf day is required');
 if (!Number.isFinite(buyThreshold) || buyThreshold<80 || buyThreshold>100) throw new RangeError('buyThreshold must be between 80 and 100');
 const markets = prices?.prices ?? prices ?? {};
 const rows = cards.map(card=>{
  const market = markets[card.key] ?? {};
  const metrics = marketMetrics(market,{asOf:evaluationDay});
  const baseQualityWarnings = warningsFor(card,market,metrics,evaluationDay);
  return {...card,...metrics,productId:market.productId??null,verifiedMatch:identityWarningsFor(card,market).length===0,printing:market.printing??null,tickermintUrl:market.tickermintUrl??null,baseQualityWarnings};
 });
 const bySet = new Map();
 for (const row of rows) {
  if (!bySet.has(row.set)) bySet.set(row.set,[]);
  bySet.get(row.set).push(row);
 }
 return rows.map(row=>{
  const peers = comparePeers(row,bySet.get(row.set));
  const qualityWarnings = [...row.baseQualityWarnings];
  if (!peers.reliable) qualityWarnings.push(`Only ${peers.count} suitable same-set peers; at least ${MODEL_DEFAULTS.minPeers} are required.`);
  const card = {...row,peers,qualityWarnings};
  const components = scoreComponents(card);
  // No credit is invented for unavailable liquidity/listing data and weights are never rescaled.
  const score = row.historyEnough && row.verifiedMatch && !row.stale && peers.reliable && row.baseQualityWarnings.length===0
   ? Math.round(Object.entries(MODEL_WEIGHTS).reduce((total,[key,weight])=>total+(components[key]??0)*weight/100,0)) : null;
  const meaningfulCorrection = row.drop90<=-18 && row.belowAverage90<=-7;
  const relativeValue = peers.reliable && peers.relative30<=-5 && peers.relative90<=-8;
  const stable = row.change7>=-3 && row.change7<=4;
  const falling = row.change7<-3 || (row.change30<-16 && row.change7<0);
  let signal='watch',reason='Monitor for stronger relative value and a better entry.',risk='Market estimates can differ from actual Near Mint listings; demand and liquidity are unmeasured.';
  if (qualityWarnings.length) {
   signal='pending';reason=qualityWarnings[0];risk='Missing or unreliable data prevents a trustworthy buying recommendation.';
  } else if (row.price>=100) {
   signal='over';reason='At or above the $100 raw-market budget.';
  } else if (meaningfulCorrection && relativeValue && stable && !falling && !peers.setDeclining && score>=buyThreshold) {
   signal='buy';
   reason=`${Math.abs(row.drop90).toFixed(1)}% below its 90-day high; ${Math.abs(peers.relative30).toFixed(1)} points weaker than comparable cards over 30 days, with a stable last week.`;
   risk='Relative underperformance may reflect weaker demand rather than a bargain. Listing depth and completed sales are unavailable.';
  } else if ((meaningfulCorrection || relativeValue || row.change30<=-10) && (falling || peers.setDeclining)) {
   signal='wait';reason=peers.setDeclining ? 'The wider set is declining; wait for a steadier market and card price.' : 'The correction may be attractive, but the card is still falling; wait for stabilization.';
   risk='A falling market can continue falling even after a large historical correction.';
  } else if (score>=buyThreshold && (!meaningfulCorrection || !relativeValue)) {
   reason='High preference score, but the required correction and peer-value gates are not both met.';
  }
  const entryPrice = positive(row.price) ? rounded(Math.min(row.price,(row.average90??row.price)*0.9,99.99),2) : null;
  const {baseQualityWarnings,...compact} = card;
  return {...compact,signal,score,components,reason,risk,entryPrice,entryNote:signal==='wait'?'Watch threshold only; wait for stabilization before considering an entry.':'Watch threshold only; verify actual Near Mint listings and fees.',liquidity:'Unavailable',listings:'Unavailable',salesVolume:'Unavailable',modelVersion:MODEL_VERSION};
 });
}

/** Prior repository algorithm, retained solely as an honest backtest comparator. */
export function oldRecommendation(card, metrics, {asOf=new Date()}={}) {
 const {price,change7,change30,drop90,historyObservations,stale}=metrics;
 if (!positive(price) || stale || price>=100 || change7===null || change30===null || drop90===null || historyObservations<28) return {signal:'pending',score:null};
 const year=Number(dayString(asOf)?.slice(0,4));
 const legacy=Math.min(100,20+Math.max(0,Math.min(20,year-card.year))*4);
 const stable=change7>=-3 && change7<=4 ? 95 : change7<-3 ? 35 : 60;
 const hype=Number.isFinite(card.hype)?clamp(card.hype):62;
 const score=Math.round(clamp(Math.max(0,-drop90)*3.1)*.31+hype*.19+stable*.22+legacy*.28);
 const signal=drop90<=-18 && change30<=-7 && change7>=-3 && change7<=4 && hype>=75 ? 'buy' : (drop90<=-12 || change30<=-10) && (change7<-3 || (change30<-16 && change7<0)) ? 'wait' : 'watch';
 return {signal,score};
}
