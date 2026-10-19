import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {agePriority,assessCatalog,marketMetrics,cleanHistory,dayString,MODEL_WEIGHTS} from '../scripts/opportunity.mjs';
import {backtest,summarizeTrades,loadBacktestInputs} from '../scripts/backtest.mjs';

const DAY=86400000;
const date=index=>new Date(Date.UTC(2025,0,1)+index*DAY).toISOString().slice(0,10);
const card=(key,extra={})=>({key,name:key,set:'Test set',year:2010,rarity:'Other',sourceRarity:'Rare Holo',hype:98,...extra});
const history=(count,fn)=>Array.from({length:count},(_,i)=>[date(i),fn(i)]);
const quote=(points,extra={})=>({productId:100,verifiedMatch:true,language:'en',printing:'Holofoil',matchEvidence:'Test fixture exact name, set, collector number and English-language match',price:points.at(-1)[1],asOf:points.at(-1)[0],history:points,...extra});
const fallingThenFlat=i=>i<86?80:i<106?60:45;
function fixture(count=121) {
 const cards=[card('target'),card('a'),card('b'),card('c')];
 const prices={target:quote(history(count,fallingThenFlat))};
 for (const [index,key] of ['a','b','c'].entries()) prices[key]=quote(history(count,()=>65+index*5),{productId:101+index});
 return {cards,prices};
}

test('age preferences match the requested periods, and cannot alone create Buy Now',()=>{
 assert.deepEqual([2008,2012,2013,2016,2017,2019,2020,2022,2023,2024,2025,2026].map(agePriority),[100,100,85,85,70,70,50,50,30,30,15,15]);
 assert.equal(Object.values(MODEL_WEIGHTS).reduce((sum,x)=>sum+x,0),100);
 const {cards,prices}=fixture();
 const old=assessCatalog(cards,prices,{asOf:date(120)})[0];
 const modern=assessCatalog(cards.map(c=>c.key==='target'?{...c,year:2025}:c),prices,{asOf:date(120)})[0];
 assert.equal(old.signal,'buy');assert.ok(old.score>=80);
 assert.equal(modern.signal,'buy');assert.ok(old.score>modern.score);assert.equal(old.evidenceScore,modern.evidenceScore);
 const flat=assessCatalog(cards,Object.fromEntries(cards.map(c=>[c.key,quote(history(121,()=>50))])),{asOf:date(120)});
 assert.ok(flat.every(c=>c.signal==='watch'));
});

test('same-set peer medians are robust and do not silently substitute unrelated cards',()=>{
 const {cards,prices}=fixture();
 cards.push(card('outlier'));
 prices.outlier=quote(history(121,i=>i<100?7000:70));
 const row=assessCatalog(cards,prices,{asOf:date(120)})[0];
 assert.equal(row.peers.count,4);assert.equal(row.peers.median30,0);
 assert.ok(row.peers.relative30<=-5);assert.ok(row.peers.relative90<=-8);
 const unrelated=cards.map(c=>c.key==='target'?c:{...c,set:'Other set'});
 const missing=assessCatalog(unrelated,prices,{asOf:date(120)})[0];
 assert.equal(missing.signal,'pending');assert.equal(missing.score,null);assert.equal(missing.peers.reliable,false);
 const noRarityPeers=assessCatalog(cards.map(c=>c.key==='target'?{...c,rarity:'SIR'}:c),prices,{asOf:date(120)})[0];
 assert.equal(noRarityPeers.signal,'pending');
});

test('a large correction still falling is WAIT; a stable relative correction can be BUY',()=>{
 const {cards,prices}=fixture();
 assert.equal(assessCatalog(cards,prices,{asOf:date(120)})[0].signal,'buy');
 prices.target=quote(history(121,i=>i===120?40:fallingThenFlat(i)));
 const waiting=assessCatalog(cards,prices,{asOf:date(120)})[0];
 assert.equal(waiting.signal,'wait');assert.ok(waiting.change7<-3);
});

test('declining whole-set markets veto Buy Now despite stabilization',()=>{
 const {cards,prices}=fixture();
 for (const key of ['a','b','c']) prices[key]=quote(history(121,i=>i<100?80:70));
 const row=assessCatalog(cards,prices,{asOf:date(120)})[0];
 assert.equal(row.peers.setDeclining,true);assert.equal(row.signal,'wait');
});

test('a sharp recent set decline vetoes Buy Now even when the set remains up over 90 days',()=>{
 const {cards,prices}=fixture();
 prices.target=quote(history(121,i=>i<86?80:i<106?60:45));
 const healthySet=assessCatalog(cards,prices,{asOf:date(120)})[0];
 assert.equal(healthySet.signal,'buy');
 for (const key of ['a','b','c']) prices[key]=quote(history(121,i=>i<60?50:i<100?80:70));
 const row=assessCatalog(cards,prices,{asOf:date(120)})[0];
 assert.ok(row.peers.setMedian90>0);assert.ok(row.peers.setMedian30<=-7);
 assert.ok(row.score>=80);assert.ok(row.peers.relative30<=-5);assert.ok(row.peers.relative90<=-8);
 assert.equal(row.change7,0);assert.equal(row.peers.setDeclining,true);assert.equal(row.signal,'wait');
});

test('strict metadata, staleness and history coverage prevent misleading recommendations',()=>{
 const {cards,prices}=fixture();
 const legacy={...prices.target};delete legacy.language;delete legacy.printing;
 const unverified=assessCatalog(cards,{...prices,target:legacy},{asOf:date(120)})[0];
 assert.equal(unverified.signal,'pending');assert.ok(unverified.qualityWarnings.some(s=>s.includes('printing')));
 assert.equal(assessCatalog(cards,{...prices,target:{...prices.target,verifiedMatch:false}},{asOf:date(120)})[0].signal,'pending');
 assert.equal(assessCatalog(cards,{...prices,target:{...prices.target,language:'ja'}},{asOf:date(120)})[0].signal,'pending');
 assert.equal(assessCatalog(cards,{...prices,target:{...prices.target,printing:'Reverse Holofoil'}},{asOf:date(120)})[0].signal,'pending');
 assert.equal(assessCatalog(cards,Object.fromEntries(Object.entries(prices).map(([k,v])=>[k,{...v,printing:'Normal'}])),{asOf:date(120)})[0].signal,'buy');
 assert.equal(assessCatalog(cards,{...prices,target:{...prices.target,matchEvidence:''}},{asOf:date(120)})[0].signal,'pending');
 const stale=assessCatalog(cards,prices,{asOf:date(125)})[0];
 assert.equal(stale.signal,'pending');assert.equal(stale.stale,true);assert.equal(stale.price,45);assert.equal(stale.entryPrice,null);
 const short=quote(history(29,()=>50));
 const insufficient=assessCatalog(cards,{...prices,target:short},{asOf:date(28)})[0];
 assert.equal(insufficient.signal,'pending');assert.equal(insufficient.historyDays,28);
 const sparse=quote(history(121,fallingThenFlat).filter((_,i)=>i<30||i>100));
 assert.equal(marketMetrics(sparse,{asOf:date(120)}).historyEnough,false);
});

test('missing liquidity remains unavailable, contributes no invented credit, and score is capped at 95',()=>{
 const {cards,prices}=fixture();
 const row=assessCatalog(cards,prices,{asOf:date(120)})[0];
 assert.equal(row.liquidity,'Unavailable');assert.equal(row.listings,'Unavailable');assert.equal(row.components.liquidity,null);
 assert.ok(row.score<=95);assert.ok(row.entryPrice<=row.price);assert.ok(row.risk.includes('unavailable'));
});

test('past decisions ignore future quotes and observations, and inputs are never mutated',()=>{
 const {cards,prices}=fixture(181);
 const original=JSON.stringify(prices);
 const past=assessCatalog(cards,prices,{asOf:date(120)})[0];
 const truncated=Object.fromEntries(Object.entries(prices).map(([key,p])=>[key,{...p,price:1,asOf:date(200),history:p.history.filter(([day])=>day<=date(120))}]));
 const samePast=assessCatalog(cards,truncated,{asOf:date(120)})[0];
 assert.deepEqual(past,samePast);assert.equal(JSON.stringify(prices),original);
 assert.equal(past.asOf,date(120));
});

test('same-year cards released after the decision date cannot signal or enter historical holds',()=>{
 const {cards,prices}=fixture(181);
 const futureCards=cards.map(c=>({...c,year:2025,releaseDate:date(160)}));
 const beforeRelease=assessCatalog(futureCards,prices,{asOf:date(120)});
 assert.ok(beforeRelease.every(c=>c.signal==='pending'));
 assert.ok(beforeRelease.every(c=>c.qualityWarnings.some(warning=>warning.includes('had not been released'))));
 const report=backtest(futureCards,prices,{asOf:date(180)});
 assert.equal(report.testing.opportunity.signals,0);
 assert.equal(report.testing.previous.signals,0);
 assert.equal(report.testing.benchmark.signals,0);
});

test('date parsing, malformed observations and duplicate days are handled without rollover or NaN',()=>{
 assert.equal(dayString('2025-02-30'),null);assert.equal(dayString('nonsense'),null);
 assert.throws(()=>assessCatalog([],{}, {asOf:'nonsense'}),RangeError);
 assert.deepEqual(cleanHistory([['2025-02-30',5],['2025-01-01',5],['2025-01-01',6],['2025-01-02',NaN],['2025-01-03',-1],['2025-01-10',10]],'2025-01-05'),[['2025-01-01',6]]);
 const {cards,prices}=fixture();
 assert.throws(()=>assessCatalog(cards,prices,{asOf:date(120),buyThreshold:70}),RangeError);
});

test('backtest uses chronological split, embargoes immature training outcomes and reports failed flat signals',()=>{
 const {cards,prices}=fixture(181);
 const original=JSON.stringify(prices);
 const report=backtest(cards,prices,{asOf:date(180)});
 assert.equal(report.calibration.applied,false);assert.equal(report.calibration.threshold,80);
 assert.ok(report.testing.opportunity.signals>0);
 assert.equal(report.testing.opportunity.hitRate,0);
 assert.ok(report.testing.opportunity.failed>0);
 for (const failed of report.testing.opportunity.failedSignals) {
  assert.ok(failed.signalDate>report.splitDate);assert.ok(failed.exitDate<=date(180));
  assert.equal(failed.returnPct,0);
 }
 for (const failed of report.training.benchmark.failedSignals) assert.ok(failed.exitDate<=report.splitDate);
 assert.ok(report.testing.benchmark.signals>=report.testing.opportunity.signals);
 assert.equal(JSON.stringify(prices),original);
});

test('held-out future returns cannot influence threshold calibration',()=>{
 const {cards,prices}=fixture(400);
 const report=backtest(cards,prices,{asOf:date(399)});
 const changed=Object.fromEntries(Object.entries(prices).map(([key,q])=>[key,{...q,history:q.history.map(([day,p])=>[day,day>report.splitDate?p*1.5:p])}]));
 const altered=backtest(cards,changed,{asOf:date(399)});
 assert.deepEqual(report.training,altered.training);assert.deepEqual(report.calibration,altered.calibration);
});

test('empty history has no fabricated hit rate; losing trades expose return and drawdown',()=>{
 const report=backtest([card('empty')],{}, {asOf:date(120)});
 assert.equal(report.testing.opportunity.hitRate,null);assert.equal(report.testing.benchmark.signals,0);
 assert.equal(report.status,'insufficient-history');
 const stats=summarizeTrades([{key:'a',returnPct:5,drawdownPct:-2},{key:'b',returnPct:-20,drawdownPct:-25},{key:'c',returnPct:0,drawdownPct:0}]);
 assert.equal(stats.hitRate,33.33);assert.equal(stats.failed,2);assert.equal(stats.worstReturn,-20);assert.equal(stats.worstDrawdown,-25);
});

test('historical cache cannot restore rejected matches or attach another product or printing',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pokeradar-backtest-'));
 try {
  fs.mkdirSync(path.join(root,'site'));
  fs.mkdirSync(path.join(root,'.cache/pokeradar'),{recursive:true});
  fs.writeFileSync(path.join(root,'site/catalog.json'),JSON.stringify({cards:[card('a'),card('b')]}));
  const current={a:quote([['2025-01-02',10]],{verifiedMatch:false}),b:quote([['2025-01-02',20]],{productId:200})};
  fs.writeFileSync(path.join(root,'site/prices.json'),JSON.stringify({prices:current}));
  const cached={a:quote([['2025-01-01',9]],{verifiedMatch:true}),b:quote([['2025-01-01',1]],{productId:999})};
  fs.writeFileSync(path.join(root,'.cache/pokeradar/full-history.json'),JSON.stringify({prices:cached}));
  const {prices}=loadBacktestInputs(root);
  assert.equal(prices.a.verifiedMatch,false);
  assert.deepEqual(prices.a.history,[['2025-01-01',9],['2025-01-02',10]]);
  assert.deepEqual(prices.b.history,current.b.history);
  assert.equal(prices.b.productId,200);
 } finally {fs.rmSync(root,{recursive:true,force:true})}
});
