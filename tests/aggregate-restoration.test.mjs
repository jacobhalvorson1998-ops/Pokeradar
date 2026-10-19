import test from 'node:test';import assert from 'node:assert/strict';
import {assessMarketCatalog,OPPORTUNITY_WEIGHTS,rankPreference} from '../scripts/aggregate-model.mjs';
import {summarizeTrades,backtest} from '../scripts/backtest.mjs';
import {detailFileId} from '../scripts/detail-path.mjs';
import {recoverPrices} from '../scripts/recover-progress.mjs';
import {priorityOrder} from '../scripts/priority.mjs';
const day=i=>new Date(Date.UTC(2025,0,1)+i*86400000).toISOString().slice(0,10),asOf=day(200);
const cards=Array.from({length:12},(_,i)=>({id:'test-'+i,baseId:'test-'+i,key:'test|'+i,setId:'test',set:'Test',name:'Card '+i,number:String(i),year:1999,releaseDate:'1999-01-01',rarity:i===0?'Shining':'Holo Rare',sourceRarity:i===0?'Shining':'Rare Holo',hype:95,printing:'Holofoil',edition:'Unlimited',variantVerified:true,primary:true}));
const quote=(c,fn=i=>i<155?150:100)=>({productId:100+Number(c.number),verifiedMatch:true,matchStatus:'matched',language:'en',matchEvidence:'TEST ONLY verified exact product and printing',printing:c.printing,edition:c.edition,asOf,price:fn(200),history:Array.from({length:201},(_,i)=>[day(i),fn(i)])});
const prices=()=>Object.fromEntries(cards.map(c=>[c.key,quote(c,c===cards[0]?undefined:()=>100)]));
test('aggregate prices and own-history value survive missing same-rarity peers, with separate confidence',()=>{
 const rows=assessMarketCatalog(cards,prices(),{asOf}),r=rows[0];assert.equal(r.price,100);assert.equal(r.peers.reliable,false);assert.ok(r.score>=70);assert.ok(['buy','investigate'].includes(r.signal));assert.equal(r.components.liquidity,0);assert.deepEqual(OPPORTUNITY_WEIGHTS,{value:35,downside:25,set:15,collector:15,liquidity:10});assert.ok(r.confidence<85);assert.ok(r.entryPrice<r.price);assert.match(r.reason,/own 90-day/);
 const ranked=rankPreference(r,{ageWeight:35});assert.equal(ranked.signal,r.signal);assert.ok(ranked.score>r.score);
});
test('age without value cannot qualify; sharp declines, stale and wrong editions veto buying but preserve valid saved prices',()=>{
 let p=prices();for(const c of cards)p[c.key]=quote(c,()=>100);const r=assessMarketCatalog(cards,p,{asOf})[0];assert.equal(r.signal,'watch');assert.equal(r.buyEligible,false);
 p=prices();p[cards[0].key]=quote(cards[0],i=>i<180?150:150-(i-180)*4);const falling=assessMarketCatalog(cards,p,{asOf})[0];assert.equal(falling.signal,'wait');assert.equal(falling.buyEligible,false);
 const stale=assessMarketCatalog(cards,prices(),{asOf:day(207)})[0];assert.equal(stale.signal,'pending');assert.equal(stale.price,100);
 p=prices();p[cards[0].key].edition='First Edition';const wrong=assessMarketCatalog(cards,p,{asOf})[0];assert.equal(wrong.verifiedMatch,false);assert.equal(wrong.score,null);
});
test('300,000 backtest holds summarize without argument stack overflow or discarding failures',()=>{
 const trades=Array.from({length:300000},(_,i)=>({key:'card-'+i,returnPct:i===299999?-99:1,drawdownPct:i===299999?-98:-1}));const result=summarizeTrades(trades);assert.equal(result.signals,300000);assert.equal(result.worstReturn,-99);assert.equal(result.worstDrawdown,-98);assert.equal(result.failed,1);assert.equal(result.uniqueCards,300000);
});
test('opaque Unown and traversal-like source identities map to distinct safe filenames without changing IDs',()=>{
 const inputs=['exu-!','exu-%3F','../x','a/b','a\\b','~encoded','normal-id','x'.repeat(1000)],outputs=inputs.map(detailFileId);assert.equal(new Set(outputs).size,inputs.length);for(const out of outputs){assert.match(out,/^[A-Za-z0-9_.~-]+$/);assert.ok(out.length<=180);assert.ok(!out.includes('/'));}assert.equal(detailFileId('exu-!'),outputs[0]);assert.equal(detailFileId('normal-id'),'normal-id');
});
test('checkpoint recovery retains newer current quote and unions history; different product/edition is quarantined',()=>{
 const c=cards[0],current=quote(c),older={...current,asOf:day(199),price:200,history:[[day(0),75],[day(199),200]]};current.history=[[day(200),100]];
 const recovered=recoverPrices({[c.key]:current},{[c.key]:older},[c],{asOf});assert.equal(recovered.prices[c.key].price,100);assert.equal(recovered.prices[c.key].asOf,asOf);assert.equal(recovered.prices[c.key].history.length,3);assert.equal(recovered.report.retainedNewer,1);
 for(const patch of [{productId:999},{printing:'Reverse Holofoil'},{edition:'First Edition'},{verifiedMatch:false},{asOf:'2027-01-01'}]){const result=recoverPrices({[c.key]:current},{[c.key]:{...older,...patch}},[c],{asOf});assert.equal(result.report.rejected.length,1);assert.deepEqual(result.prices[c.key],current);}
});
test('aggregate replay ignores future observations and reports unchanged research thresholds',()=>{
 const a=backtest(cards,prices(),{asOf}),p=prices();for(const m of Object.values(p))m.history.push(['2027-01-01',999999]);const b=backtest(cards,p,{asOf});assert.deepEqual(a.aggregateResearch,b.aggregateResearch);assert.deepEqual(a.aggregateResearch.bands.map(b=>b.threshold),[70,75,80]);
});
test('coverage priority places vintage holos and editions ahead of personal modern requests',()=>{
 const vintage=cards[0],edition={...cards[1],key:'edition',year:2001,rarity:'Common',hype:10,edition:'First Edition'},wanted={...cards[2],key:'wanted',year:2025,hype:50,rarity:'Common'},chase={...cards[3],key:'chase',year:2025,hype:95},ordinary={...cards[4],key:'ordinary',year:2025,hype:10,rarity:'Common'};assert.deepEqual(priorityOrder([ordinary,chase,wanted,edition,vintage],{},['wanted'],asOf).map(c=>c.key),[vintage.key,'edition','wanted','chase','ordinary']);
});
