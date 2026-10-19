import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMarketPulse} from '../scripts/market-pulse.mjs';
import {assessCatalog} from '../scripts/opportunity.mjs';
import {catalogHealth} from '../scripts/health.mjs';
import {mergeSourceArchives,importAuthorizedSource} from '../scripts/import-source.mjs';
import {priorityOrder} from '../scripts/priority.mjs';
import {PriceSource,validateObservation,disagreement} from '../site/lib/price-source.mjs';
import {calculateOffer,trendBand} from '../site/lib/vendor.mjs';
import {emptyInventory,recordDecision,sellLot,inventoryCSV,importInventoryCSV,bundleOffer} from '../site/lib/inventory.mjs';
const day=i=>new Date(Date.UTC(2025,0,1)+i*86400000).toISOString().slice(0,10),asOf=day(120);
const identity={cardId:'base1-4',printing:'Holofoil',edition:'Unlimited',language:'en',condition:'NM',verified:true};
const observation={...identity,source:'Fixture',metricType:'sales_average',price:100,currency:'USD',observedDate:asOf,fetchedAt:asOf+'T12:00:00Z',coverageStart:day(0),termsUrl:'https://example.test/terms',provenance:'Authorized fixture; exact printed card and condition',quality:'verified',verifiedIdentity:true};
const base={identity,reference:observation,confirmed:true,conditionConfirmed:true,asOf,set30:0,card30:0,liquidity:'normal',volatility:'normal'};
const cards=n=>Array.from({length:n},(_,i)=>({id:'base1-'+i,baseId:'base1-'+i,key:'base|'+i,setId:'base1',set:'Base',name:'Card '+i,number:''+i,rarity:'Holo Rare',sourceRarity:'Rare Holo',year:1999,printing:'Holofoil',edition:'Unlimited',variantVerified:true,primary:true,verifiedMatch:true,stale:false,price:100,hype:90}));
const price=(c,fn=()=>100)=>({productId:100+Number(c.number),verifiedMatch:true,matchEvidence:'Verified English printing fixture',language:'en',printing:'Holofoil',edition:'Unlimited',asOf,price:fn(120),history:Array.from({length:121},(_,i)=>[day(i),fn(i)])});

test('vendor stable $100 baseline is 80% before costs; age never changes an offer',()=>{
 const a=calculateOffer(base);assert.equal(a.maximum,80);assert.equal(a.opening,72);assert.equal(a.walkAway,80);
 assert.equal(calculateOffer({...base,year:1999}).maximum,calculateOffer({...base,year:2026}).maximum);
});
test('declining card or set lowers the offer; -15% moderate and sharp defaults match bands',()=>{
 assert.equal(calculateOffer({...base,set30:-15}).maximum,62.5);assert.equal(calculateOffer({...base,card30:-25}).maximum,55);assert.equal(calculateOffer({...base,set30:-7}).maximum,70);
 assert.equal(trendBand({}).unknown,true);assert.ok(calculateOffer({...base,set30:null,card30:null}).maximum<=60);
});
test('selling fees, shipping and profit cap lower max, clamp zero, and explain downside',()=>{
 const r=calculateOffer({...base,feePct:15,shipping:5,targetProfit:15});assert.equal(r.maximum,65);assert.equal(r.costCap,65);assert.equal(r.netMargin,15);assert.equal(r.breakEvenResale,82.35);
 assert.equal(calculateOffer({...base,targetProfit:150}).maximum,0);assert.equal(calculateOffer({...base,shipping:200}).netMargin,-100);assert.ok(calculateOffer({...base,scenario:'conservative'}).maximum<80);
 assert.ok(calculateOffer({...base,conditionRiskPct:20,holdingPct:10,targetProfit:10}).maximum<=60);
 assert.throws(()=>calculateOffer({...base,feePct:-1}));
});
test('identity confirmation, exact edition and condition are mandatory; averages never become NM comps',()=>{
 assert.equal(calculateOffer({...base,identity:{...identity,verified:false}}).available,false);assert.equal(calculateOffer({...base,confirmed:false}).available,false);
 assert.equal(calculateOffer({...base,reference:{...observation,printing:'Reverse Holofoil'}}).available,false);assert.equal(calculateOffer({...base,reference:{...observation,edition:'First Edition'}}).available,false);
 assert.equal(calculateOffer({...base,reference:{...observation,condition:null,metricType:'market_estimate'}}).available,false);assert.equal(calculateOffer({...base,identity:{...identity,condition:'LP'}}).available,false);
 assert.equal(calculateOffer({...base,reference:{...observation,condition:'LP'},identity:{...identity,condition:'LP'}}).maximum,80);
});
test('stale, thin/volatile and conflicting references reserve more; manual comp stays labeled',()=>{
 const stale=calculateOffer({...base,reference:{...observation,observedDate:day(110)}});assert.equal(stale.stale,true);assert.ok(stale.maximum<80);
 const observations=[observation,{...observation,source:'Other',price:125}];const conflict=calculateOffer({...base,observations});assert.equal(conflict.conflict.status,'conflict');assert.ok(conflict.maximum<80);
 assert.ok(calculateOffer({...base,liquidity:'thin',volatility:'high',scarceVintage:true}).maximum<80);
 assert.equal(calculateOffer({...base,reference:{...observation,source:'Manual',metricType:'manual_comp'}}).referenceType,'MANUAL CONDITION COMP');
});
test('cash/trade/bundle math stays explicit and variant inventory round-trips',()=>{
 const r=calculateOffer({...base,quantity:3,tradeMultiplier:.8,asked:90});assert.equal(r.totalMax,240);assert.equal(r.tradeCreditMax,100);assert.equal(r.overMax,true);
 assert.equal(bundleOffer([{quantity:2,offer:r},{quantity:1,offer:calculateOffer({...base,set30:-15})}]).totalMax,222.5);assert.equal(bundleOffer([{quantity:1,offer:{available:false}}]).available,false);
 const card={key:'base|4',name:'=Charizard',set:'Base',printing:'Holofoil',edition:'First Edition'};
 const inventory=recordDecision(emptyInventory(),card,{action:'purchase',quantity:2,condition:'LP',cash:100,tradeCredit:50,tradeCostFactor:.8,lot:'Show, lot\nOne'});
 assert.equal(inventory.lots[0].unitCost,70);const restored=importInventoryCSV(inventoryCSV(inventory),emptyInventory());assert.deepEqual(restored.lots,inventory.lots);
 const sold=sellLot(restored,restored.lots[0].id,{quantity:1,netProceeds:85});assert.equal(sold.lots[0].sold,1);assert.equal(sold.lots[0].proceeds,85);assert.throws(()=>sellLot(sold,sold.lots[0].id,{quantity:2,netProceeds:1}));
 const declined=recordDecision(sold,card,{action:'decline',condition:'LP'});assert.equal(declined.lots.length,1);assert.equal(declined.decisions.at(-1).action,'decline');
});
test('supplemental history requires authorization and stays source/condition separated',()=>{
 assert.throws(()=>new PriceSource({name:'Scrydex'}).importSegment([observation]),/authorization/);
 const source=new PriceSource({name:'Scrydex',termsUrl:'https://example.test/terms',authorized:true,coverageVerified:true});
 const segment=source.importSegment([observation],{asOf});assert.equal(segment.source,'Scrydex');assert.equal(segment.observations[0].condition,'NM');
 assert.throws(()=>source.importSegment([observation,{...observation,condition:'LP'}],{asOf}));assert.throws(()=>source.importSegment([observation],{asOf,commercial:true}));
 assert.throws(()=>validateObservation({...observation,observedDate:day(121)},{asOf}));assert.throws(()=>validateObservation({...observation,language:'ja'},{asOf}));
 assert.equal(disagreement([observation,{...observation,source:'B',condition:'LP',price:50}]).status,'not-comparable');assert.equal(disagreement([observation,{...observation,source:'B',observedDate:day(119),price:50}]).status,'not-comparable');
 assert.equal(disagreement([observation,{...observation,source:'B',price:125}]).status,'conflict');
});
test('set pulse uses fixed exact-printing cohorts, not changing priced totals',()=>{
 const c=cards(20),p=Object.fromEntries(c.slice(0,10).map(x=>[x.key,price(x,i=>i<=90?100:90)]));
 for(const x of c.slice(10)){x.verifiedMatch=false;x.price=null;}
 const pulse=buildMarketPulse(c,p,{asOf}).sets.base1.all;assert.equal(pulse.windows[30].change,-10);assert.equal(pulse.windows[30].samples,10);assert.equal(pulse.coverage,50);
 // Newly priced cards lack the old endpoint and cannot inflate the cohort return.
 c[10].verifiedMatch=true;c[10].price=10000;p[c[10].key]={...price(c[10]),history:[[asOf,10000]]};
 const more=buildMarketPulse(c,p,{asOf}).sets.base1.all;assert.equal(more.windows[30].change,-10);assert.equal(more.windows[30].samples,10);
 c.push({...c[0],id:'reverse',key:'reverse',printing:'Reverse Holofoil',primary:false,price:500});p.reverse=price(c[0],()=>500);
 assert.equal(buildMarketPulse(c,p,{asOf}).sets.base1.all.total,20);
});
test('pulse handles stable/chase, sparse vintage, small sets, stale history and future values',()=>{
 const c=cards(10),p=Object.fromEntries(c.map(x=>[x.key,price(x)]));const pulse=buildMarketPulse(c,p,{asOf});assert.equal(pulse.sets.base1.all.windows[90].change,0);assert.equal(pulse.sets.base1.chase.windows[30].samples,10);
 const sparse=buildMarketPulse(c.slice(0,9),p,{asOf,minSamples:10});assert.equal(sparse.sets.base1.all.smallSetRule,true);
 assert.equal(buildMarketPulse(c,{}, {asOf}).sets.base1.all.windows[30].change,null);
 assert.equal(buildMarketPulse(c.slice(0,2),p,{asOf}).sets.base1.all.windows[7].change,null);
 for(const x of c)p[x.key].history.push([day(121),100000]);assert.equal(buildMarketPulse(c,p,{asOf}).sets.base1.all.windows[30].change,0);
 for(const x of c)x.stale=true;assert.equal(buildMarketPulse(c,p,{asOf}).sets.base1.all.windows[7].change,null);
});
test('diagnostic funnel separates matched-without-quote from unmatched and near misses never become Buy',()=>{
 const c=cards(5),p=Object.fromEntries(c.slice(0,4).map(x=>[x.key,price(x,i=>x.number==='0'?(i<86?150:i<106?120:90):100)]));
 const rows=assessCatalog(c,p,{asOf,buyThreshold:100,resolutions:{[c[4].key]:{status:'matched'}}}),h=catalogHealth(rows,{asOf,buyThreshold:100});
 assert.equal(rows[4].primaryFailure,'quote');assert.equal(h.funnel.find(x=>x.gate==='matched').count,5);assert.equal(h.signals.buy,0);assert.ok(rows[0].investigate);assert.equal(rows[0].signal,'watch');assert.ok(rows[0].failureReasons.includes('evidence'));
 assert.equal(Object.values(h.primaryFailures).reduce((a,b)=>a+b,0),5);assert.ok(h.funnel.every((x,i)=>!i||x.count<=h.funnel[i-1].count));assert.equal(h.funnel.at(-1).count,h.signals.buy);
 const unmatched=assessCatalog(c,{}, {asOf});assert.ok(unmatched.every(x=>x.primaryFailure==='unmatched'&&!x.investigate));
});
test('priority queue puts explicit personal keys then missing prices and chase coverage first',()=>{
 const c=cards(4);c[0].hype=20;c[1].hype=98;const order=priorityOrder(c,{[c[1].key]:{verifiedMatch:true,price:100,asOf}},[c[0].key],asOf);assert.equal(order[0].key,c[0].key);assert.equal(order.at(-1).key,c[1].key);
});


test('authorized supplemental imports retain earlier good observations and distinct legacy segments',()=>{
 const approval={name:'Approved fixture',termsUrl:'https://example.test/terms',approvedByUser:true,authorized:true,coverageVerified:true,termsReviewedAt:asOf};
 const old=importAuthorizedSource({segments:[[{...observation,observedDate:day(110)}]]},approval);
 const next=importAuthorizedSource({segments:[[{...observation,observedDate:day(120)}],[{...observation,condition:'LP',price:70}]]},approval);
 const merged=mergeSourceArchives(old,next);assert.equal(merged.observations.length,3);assert.equal(merged.segments.length,2);assert.equal(merged.validationLog.previousObservationsRetained,true);
 assert.throws(()=>importAuthorizedSource({segments:[[observation]]},{...approval,approvedByUser:false}));
});
