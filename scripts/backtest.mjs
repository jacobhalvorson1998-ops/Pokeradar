/**
 * Historical evaluation, never a forecast. Only pre-decision history reaches
 * the screener. Chronological training outcomes must mature before test starts.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {assessCatalog,cleanHistory,dayString,marketMetrics,median,oldRecommendation,MODEL_DEFAULTS,MODEL_VERSION} from './opportunity.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const DAY=86400000;
const epoch=day=>Date.parse(day+'T00:00:00Z');
const iso=time=>new Date(time).toISOString().slice(0,10);
const round=value=>Number.isFinite(value)?Number(value.toFixed(2)):null;
const read=(file,fallback)=>{try{return JSON.parse(fs.readFileSync(file,'utf8'))}catch{return fallback}};

export function summarizeTrades(trades) {
 const returns=trades.map(trade=>trade.returnPct);
 const failures=trades.filter(trade=>trade.returnPct<=0);
 return {
  signals:trades.length,positive:trades.filter(trade=>trade.returnPct>0).length,
  failed:failures.length,flat:trades.filter(trade=>trade.returnPct===0).length,
  hitRate:trades.length?round(trades.filter(trade=>trade.returnPct>0).length/trades.length*100):null,
  averageReturn:trades.length?round(returns.reduce((a,b)=>a+b,0)/trades.length):null,
  medianReturn:round(median(returns)),worstReturn:trades.length?round(Math.min(...returns)):null,
  worstDrawdown:trades.length?round(Math.min(...trades.map(trade=>trade.drawdownPct))):null,
  averageDrawdown:trades.length?round(trades.reduce((sum,trade)=>sum+trade.drawdownPct,0)/trades.length):null,
  uniqueCards:new Set(trades.map(trade=>trade.key)).size,
  failedSignals:failures.slice().sort((a,b)=>a.returnPct-b.returnPct).slice(0,20),
 };
}

function historyExit(history, decisionDay, horizonDays) {
 const target=epoch(decisionDay)+horizonDays*DAY;
 // Read an actual observation on or up to three days AFTER the hold horizon.
 const point=history.find(([day])=>epoch(day)>=target);
 return point && epoch(point[0])-target<=3*DAY ? point : null;
}

function tradeFor(card,history,decisionDay,horizonDays) {
 const exit=historyExit(history,decisionDay,horizonDays);
 if (!exit || !card.price) return null;
 const holding=history.filter(([date])=>date>=decisionDay && date<=exit[0]);
 let peak=card.price,drawdown=0;
 for (const [,price] of holding) {peak=Math.max(peak,price);drawdown=Math.min(drawdown,(price/peak-1)*100)}
 return {key:card.key,name:card.name,set:card.set,signalDate:decisionDay,entryPrice:card.price,exitDate:exit[0],exitPrice:exit[1],returnPct:round((exit[1]/card.price-1)*100),drawdownPct:round(drawdown),score:card.score??null};
}

/**
 * Weekly signal dates, 30-day holds, no overlapping holds for the same card
 * within a strategy. Training/test embargo also prevents shared holding periods.
 */
export function backtest(cards, prices, {asOf=new Date(),horizonDays=30,stepDays=7,trainingShare=.65,minCalibrationSignals=30}={}) {
 const cutoff=dayString(asOf);
 if (!cutoff) throw new RangeError('A valid asOf day is required');
 if (!Number.isInteger(horizonDays) || horizonDays<1 || !Number.isInteger(stepDays) || stepDays<1) throw new RangeError('Hold and step days must be positive integers');
 if (!Number.isFinite(trainingShare) || trainingShare<=0 || trainingShare>=1) throw new RangeError('trainingShare must be between zero and one');
 const markets=prices?.prices??prices??{};
 const histories=new Map(cards.map(card=>[card.key,cleanHistory(markets[card.key]?.history,cutoff)]));
 const candidates=cards.filter(card=>histories.get(card.key)?.length);
 const actualHistories=[...histories.values()].filter(history=>history.length);
 const starts=actualHistories.map(history=>epoch(history[0][0]));
 const ends=actualHistories.map(history=>epoch(history.at(-1)[0]));
 const first=starts.length?Math.min(...starts):null,last=ends.length?Math.min(epoch(cutoff),Math.max(...ends)):null;
 const split=first!==null && last!==null ? first+Math.floor((last-first)*trainingShare/DAY)*DAY : null;
 const splitDay=split===null?null:iso(split);
 const thresholds=[80,85,90];
 const trainingTrades=Object.fromEntries(thresholds.map(threshold=>[threshold,[]]));
 const oldTraining=[],benchmarkTraining=[];
 const testSnapshots=[];
 const lastEntry=new Map();
 const skipped={noOutcome:0,immatureTraining:0,noEligibleCards:0};
 const dates=[];
 if (first!==null) for (let time=first+90*DAY;time<=last-horizonDays*DAY;time+=stepDays*DAY) dates.push(iso(time));
 const getTrade=(card,date,strategy)=>{
  const priorExit=lastEntry.get(`${strategy}|${card.key}`);
  if (priorExit && priorExit>=date) return null;
  const trade=tradeFor(card,histories.get(card.key),date,horizonDays);
  if (!trade) {skipped.noOutcome++;return null}
  lastEntry.set(`${strategy}|${card.key}`,trade.exitDate);
  return trade;
 };
 for (const date of dates) {
  const training=epoch(date)+horizonDays*DAY<=split;
  const testing=epoch(date)>split;
  if (!training && !testing) {skipped.immatureTraining++;continue}
  // Current price snapshots dated after `date` are ignored by marketMetrics.
  // Product identity can be checked now, but historical demand/matching coverage cannot.
  // Fresh eligible rows only use a 90-day window, three reference days and
  // up to four stale days. Older observations cannot affect a decision. Keep
  // the complete series above for exits/drawdowns, and slice features only.
  const lower=iso(epoch(date)-100*DAY),datedMarkets={};
  for(const card of candidates){const history=histories.get(card.key);let first=0,last=history.length;
   while(first<last){const mid=(first+last)>>1;if(history[mid][0]<lower)first=mid+1;else last=mid;}
   let end=first;while(end<history.length&&history[end][0]<=date)end++;
   datedMarkets[card.key]={...markets[card.key],history:history.slice(first,end)};
  }
  const rows=assessCatalog(candidates,datedMarkets,{asOf:date});
  const eligible=rows.filter(card=>card.verifiedMatch && !card.stale && card.historyEnough && card.price>0 && card.year>0 && card.year<=Number(date.slice(0,4)) && !(card.releaseDate && card.releaseDate>date) && card.qualityWarnings.every(warning=>warning.startsWith('Only ')));
  if (!eligible.length) skipped.noEligibleCards++;
  if (testing) {testSnapshots.push({date,rows:eligible});continue}
  for (const card of eligible) {
   for (const threshold of thresholds) if (card.signal==='buy' && card.evidenceScore>=threshold) {
    const trade=getTrade(card,date,`train-new-${threshold}`);
    // Actual exit can be up to three days beyond its target, so enforce maturity again.
    if (trade && trade.exitDate<=splitDay) trainingTrades[threshold].push(trade);
   }
   if (oldRecommendation(card,card,{asOf:date}).signal==='buy') {
    const trade=getTrade(card,date,'train-old');if (trade && trade.exitDate<=splitDay) oldTraining.push(trade);
   }
   const trade=getTrade(card,date,'train-benchmark');if (trade && trade.exitDate<=splitDay) benchmarkTraining.push(trade);
  }
 }
 const calibration=thresholds.map(threshold=>({threshold,...summarizeTrades(trainingTrades[threshold])}));
 const adequate=calibration.filter(result=>result.signals>=minCalibrationSignals && result.uniqueCards>=10);
 // If the available sample cannot support calibration, retain the declared default.
 // Otherwise choose training hit rate, then median return, then the stricter threshold.
 adequate.sort((a,b)=>b.hitRate-a.hitRate || b.medianReturn-a.medianReturn || b.threshold-a.threshold);
 const threshold=adequate[0]?.threshold??MODEL_DEFAULTS.buyThreshold;
 const testNew=[],testOld=[],testBenchmark=[];
 for (const {date,rows} of testSnapshots) for (const card of rows) {
  if (card.signal==='buy' && card.evidenceScore>=threshold) {const trade=getTrade(card,date,'test-new');if(trade)testNew.push(trade)}
  if (oldRecommendation(card,card,{asOf:date}).signal==='buy') {const trade=getTrade(card,date,'test-old');if(trade)testOld.push(trade)}
  const trade=getTrade(card,date,'test-benchmark');if(trade)testBenchmark.push(trade);
 }
 const results={opportunity:summarizeTrades(testNew),previous:summarizeTrades(testOld),benchmark:summarizeTrades(testBenchmark)};
 const enough=results.opportunity.signals>=30 && results.opportunity.uniqueCards>=10;
 return {
  version:1,modelVersion:MODEL_VERSION,generatedAt:new Date().toISOString(),asOf:cutoff,
  status:enough?'limited-historical-evaluation':testBenchmark.length?'insufficient-opportunity-signals':first!==null && last-first>=(90+horizonDays)*DAY?'insufficient-eligible-data':'insufficient-history',
  historyStart:first===null?null:iso(first),historyEnd:last===null?null:iso(last),splitDate:splitDay,
  training:{start:first===null?null:iso(first+90*DAY),outcomesThrough:splitDay,thresholds:calibration,previous:summarizeTrades(oldTraining),benchmark:summarizeTrades(benchmarkTraining)},
  testing:{signalsAfter:splitDay,outcomesThrough:last===null?null:iso(last),...results},
  calibration:{threshold,applied:adequate.length>0,minSignals:minCalibrationSignals,minUniqueCards:10,metric:'market evidence score, independent of age ranking',reason:adequate.length?'Selected only from mature training outcomes; held-out results did not affect selection.':'Too few independent training examples; the 80-point threshold remains provisional.'},
  methodology:{horizonDays,stepDays,trainingShare,universe:cards.length,pricedHistories:actualHistories.length,signalDates:dates.length,decisionHistoryDays:90,minObservations:28,holdOverlap:'No overlapping holds for the same card in each strategy.',benchmark:'Buy every verified, fresh card across all prices with 90 days of usable history, irrespective of score.',previous:'The prior score and Buy rule, evaluated on the verified, fresh, 90-day-history cohort across all eras; the original algorithm retains its original $100 limit; missing set peers do not exclude the prior model or benchmark.',hitDefinition:`A positive market-price change after ${horizonDays} days; unchanged prices count as failed signals.`,drawdownDefinition:'Largest peak-to-trough market-price decline during each hold.',execution:'Signal-day market estimate to first provider observation on or up to three days after the horizon; no fees or slippage deducted.'},
  skipped,
  caveats:[
   'Evaluation covers all qualifying market signals, not a budget-constrained portfolio following preference rankings. Age profiles change ranking, not signal eligibility.',
   'Historical screening is not a promise of future returns. The Opportunity Score is not a hit probability.',
   'The catalog and product matches are known today: survivorship, provider coverage and retrospective-match bias remain. Historical unavailable listings cannot be reconstructed.',
   'TickerMint data begins in February 2024, even for cards released in 2008. Coverage and available history may be much shorter.',
   'Market estimates are not completed sales or executable Near Mint listings; fees, shipping, tax and slippage can eliminate small gains.',
   'Liquidity, listing depth and completed-sales volume are unavailable. Repeated provider prices do not prove actual sales or price stability.',
   'Cards in the same set and market are correlated. Nonoverlapping holds within a card do not make different cards independent.',
   'With fewer than 30 held-out signals across 10 cards, accuracy is too uncertain for validation. Zero Buy Now signals means there is no measurable Buy Now hit rate.',
  ],
 };
}

export function loadBacktestInputs(root=ROOT) {
 const cards=read(path.join(root,'site/catalog.json'),{cards:[]}).cards;
 const saved=read(path.join(root,'site/prices.json'),{prices:{}}).prices;
 const prices={...saved};
 for (const cacheName of ['evaluation-history.json','full-history.json']) {
  const full=read(path.join(root,'.cache/pokeradar',cacheName),{});
  const extra=full.prices??full;
  for (const [key,market] of Object.entries(extra)) {
   const history=market?.history,snapshot=prices[key];
   // Cache entries supply observations only. Their old verification flags must
   // never override a later authoritative matching decision or a changed product.
   if (Array.isArray(history) && snapshot && market.productId===snapshot.productId && typeof market.printing==='string' && snapshot.printing===market.printing) {
    prices[key]={...snapshot,history:[...history,...(snapshot.history??[])]};
   }
  }
 }
 return {cards,prices};
}

if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const {cards,prices}=loadBacktestInputs();
 const report=backtest(cards,prices);
 const output=process.env.BACKTEST_OUTPUT||path.join(ROOT,'site/evaluation.json');
 fs.mkdirSync(path.dirname(output),{recursive:true});
 fs.writeFileSync(output,JSON.stringify(report)+'\n');
 console.log(`Backtest: ${report.historyStart??'no history'} to ${report.historyEnd??'no history'}; chronological split ${report.splitDate??'unavailable'}; ${report.testing.opportunity.signals} held-out new signals, ${report.testing.previous.signals} prior-model signals, ${report.testing.benchmark.signals} benchmark holds. Threshold ${report.calibration.threshold} (${report.calibration.applied?'training calibrated':'provisional'}).`);
 console.log(`Report: ${path.relative(ROOT,output)}; status: ${report.status}.`);
}
