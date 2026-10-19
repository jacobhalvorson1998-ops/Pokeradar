import test from 'node:test';
import assert from 'node:assert/strict';
import {printingLabel} from '../site/lib/printing.mjs';
import {validateObservation} from '../site/lib/price-source.mjs';
import {verifyTickerProduct,parseHistoryForPrinting,resolveVintagePrinting} from '../scripts/provider.mjs';
import {declaredPrintings,expandCard} from '../scripts/enrich.mjs';
import {validatePriorityRequest} from '../scripts/priority-request.mjs';
import {emptyInventory,validateInventory,saveManualComp,cachedManualComp} from '../site/lib/inventory.mjs';
import {calculateOffer} from '../site/lib/vendor.mjs';
const asOf='2026-10-19',day=i=>new Date(Date.parse('2026-04-01')+i*86400000).toISOString().slice(0,10);
const card={id:'base1-4',baseId:'base1-4',key:'base set|4/102',name:'Charizard',setId:'base1',set:'Base Set',number:'4/102',printing:'Holofoil',edition:'Unlimited',language:'en',variantVerified:true,year:1999,hype:98,rarity:'Holo Rare',tcgplayerProductId:42382};
const observation={cardId:card.id,cardName:card.name,setId:card.setId,setName:card.set,collectorNumber:card.number,printing:card.printing,edition:card.edition,language:'en',condition:'NM',source:'Fixture A',metricType:'market_estimate',currency:'USD',price:100,observedDate:asOf,fetchedAt:asOf+'T12:00:00Z',coverageStart:'2026-04-01',termsUrl:'https://example.test/terms',url:'https://example.test/exact-card',quality:'verified',verifiedIdentity:true,provenance:'TEST ONLY authorized exact identity fixture'};
test('Base Set regression identities preserve product + printing across five holos and Espeon/LC',()=>{
 for(const [number,name,id,special] of [['4','Charizard',42382,106999],['2','Blastoise',42360,106997],['1','Alakazam',42346,106996],['15','Venusaur',42355,107010],['6','Gyarados',42404,107000]]){
 const c={...card,number:number+'/102',name,tcgplayerProductId:id},product={product_id:id,name,set_name:'Base Set',card_number:number+'/102',language:'en',printing:'Holofoil',edition:'Unlimited'};
 assert.equal(verifyTickerProduct(product,c).ok,true);assert.equal(verifyTickerProduct({...product,printing:'Unlimited Holofoil'},c).ok,false);assert.equal(verifyTickerProduct({...product,product_id:special},c).ok,false);
 assert.equal(verifyTickerProduct({...product,edition:'Shadowless'},c).ok,false);
 }
 const raw={'1st Edition Holofoil':[{date:asOf,market:800}],'Unlimited Holofoil':[{date:asOf,market:400}],Holofoil:[{date:asOf,market:100}],'Reverse Holofoil':[{date:asOf,market:600}]};
 for(const [printing,price] of [['1st Edition Holofoil',800],['Unlimited Holofoil',400],['Holofoil',100],['Reverse Holofoil',600]])assert.equal(parseHistoryForPrinting(raw,printing).points[0][1],price);
 assert.match(printingLabel({...card,edition:'First Edition',printing:'1st Edition Holofoil',subtype:'shadowless'}),/First Edition Shadowless/);assert.match(printingLabel({...card,edition:'Shadowless'}),/Unlimited Shadowless/);
 assert.equal(declaredPrintings({variants:{holo:true,reverse:false}}).some(v=>/reverse/i.test(v.printing)),false);
});
test('priority refresh validates exact catalog targets and the hourly rate limit',()=>{
 assert.deepEqual(validatePriorityRequest([card],{setId:'base1'}).keys,[card.key]);assert.throws(()=>validatePriorityRequest([card],{cardKey:card.key,setId:'base1'}));assert.throws(()=>validatePriorityRequest([card],{setId:'missing'}));assert.throws(()=>validatePriorityRequest([card],{cardKey:card.key,previous:{requestedAt:new Date().toISOString()}}),/hour/);
});
test('Buy Now at This Price needs an actual entered offer, fresh exact comp, known trend and profit',()=>{
 const input={identity:{...observation,verified:true},reference:observation,confirmed:true,conditionConfirmed:true,asOf,set30:0,card30:0,liquidity:'normal',volatility:'normal'};
 assert.equal(calculateOffer(input).buyNowAtThisPrice,false);assert.equal(calculateOffer({...input,asked:70,targetProfit:15}).buyNowAtThisPrice,true);assert.equal(calculateOffer({...input,asked:90}).buyNowAtThisPrice,false);assert.equal(calculateOffer({...input,asked:70,set30:null,card30:null}).buyNowAtThisPrice,false);
});

test('Espeon ordinary Unlimited binding requires both declared editions and separate actual provider series',()=>{
 const c={...card,id:'neo2-1',baseId:'neo2-1',key:'neo discovery|1/75',name:'Espeon',number:'1/75',setId:'neo2',set:'Neo Discovery',edition:'Standard',tcgplayerProductId:85316,year:2001};
 const first={...c,primary:false,printing:'1st Edition Holofoil',edition:'First Edition'},raw={'Unlimited Holofoil':[{date:asOf,market:365.17}],'1st Edition Holofoil':[{date:asOf,market:237.5}]};
 const binding=resolveVintagePrinting(c,raw,[c,first]);assert.equal(binding.printing,'Unlimited Holofoil');assert.equal(binding.edition,'Unlimited');assert.equal(resolveVintagePrinting(c,raw,[c]),null);assert.equal(resolveVintagePrinting(c,{'1st Edition Holofoil':raw['1st Edition Holofoil']},[c,first]),null);
 const detail={variants_detailed:[{type:'holo',thirdParty:{tcgplayer:85316}},{type:'holo',stamp:['1st-edition'],thirdParty:{tcgplayer:85316}}]};const expanded=expandCard(c,detail,{},binding);assert.equal(expanded[0].key,c.key);assert.equal(expanded[0].printing,'Unlimited Holofoil');assert.equal(expanded[1].printing,'1st Edition Holofoil');
});

test('offline manual comps preserve exact condition and metadata, require confirmation and survive full backups',()=>{
 const input={condition:'NM',price:100,observedDate:asOf,notes:'TEST ONLY inspected manual comparable sale',identityConfirmed:true,conditionConfirmed:true};
 assert.throws(()=>saveManualComp(emptyInventory(),card,{...input,conditionConfirmed:false}));
 const saved=saveManualComp(emptyInventory(),card,input),restored=validateInventory(JSON.parse(JSON.stringify(saved)));
 assert.equal(cachedManualComp(restored,card,'NM').price,100);assert.equal(cachedManualComp(restored,card,'LP'),null);assert.equal(cachedManualComp(restored,{...card,edition:'Shadowless'},'NM'),null);assert.equal(cachedManualComp(restored,{...card,number:'5/102'},'NM'),null);
 assert.equal(saveManualComp(restored,card,{...input,price:90}).manualComps.length,1);assert.equal(cachedManualComp(saved,card,'NM').price,100);
 const old=saveManualComp(saved,card,{...input,observedDate:'2026-10-01'});assert.equal(cachedManualComp(old,card,'NM').observedDate,'2026-10-01');assert.deepEqual(validateInventory({version:1,lots:[],decisions:[]}).manualComps,[]);
});
