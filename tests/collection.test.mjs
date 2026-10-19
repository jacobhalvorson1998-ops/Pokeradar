import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyCollection,updateRecord,completion,goalCards,rankSet,exportCSV,importCSV,validateCollection} from '../site/lib/collection.mjs';
import {declaredPrintings,expandCard,rarityLabel} from '../scripts/enrich.mjs';
import {verifyTickerProduct,parseHistoryForPrinting} from '../scripts/provider.mjs';
import {assessCatalog,preferenceScore} from '../scripts/opportunity.mjs';
const base={id:'base1-1',key:'base set|1/102',setId:'base1',set:'Base Set',name:'Alakazam',number:'1/102',year:1999,rarity:'Holo Rare',language:'en'};
test('vintage holo rarity, ex, Gold Star, Shining and modern classifications remain distinct',()=>{
 assert.equal(rarityLabel('Rare Holo'),'Holo Rare');assert.equal(rarityLabel('Common'),'Common');assert.equal(rarityLabel('Rare Holo Star','Mewtwo ☆'),'Gold Star');assert.equal(rarityLabel('Rare','Shining Charizard'),'Shining Pokémon');assert.equal(rarityLabel('Rare Holo EX','Gardevoir',['ex']),'Vintage ex / LV.X');assert.equal(rarityLabel('Special illustration rare'),'SIR');
});
test('card-specific metadata separates unlimited, shadowless and first edition without inventing Base reverse',()=>{
 const d={variants:{normal:false,holo:true,reverse:false},variants_detailed:[{type:'holo',subtype:'unlimited',size:'standard',thirdParty:{tcgplayer:123}},{type:'holo',subtype:'shadowless',stamp:['1st-edition'],size:'standard',thirdParty:{tcgplayer:456}},{type:'holo',subtype:'shadowless',size:'standard',thirdParty:{tcgplayer:456}}]};
 const rows=expandCard(base,d);assert.equal(rows.length,3);assert.equal(rows[0].edition,'Unlimited');assert.equal(rows[1].printing,'1st Edition Holofoil');assert.equal(rows[2].printing,'Unlimited Holofoil');assert(!rows.some(c=>c.printing==='Reverse Holofoil'));assert.equal(new Set(rows.map(c=>c.key)).size,3);
 assert.equal(declaredPrintings({variants:{firstEdition:true}}).length,0,'Edition boolean alone cannot create foil combinations');
});
test('holo and reverse prices and first/unlimited histories never substitute for one another',()=>{
 const raw={Holofoil:[{date:'2026-10-18',market:100}],'Reverse Holofoil':[{date:'2026-10-18',market:20}],'1st Edition Holofoil':[{date:'2026-10-18',market:900}],'Unlimited Holofoil':[{date:'2026-10-18',market:200}]};
 assert.equal(parseHistoryForPrinting(raw,'Holofoil').points[0][1],100);assert.equal(parseHistoryForPrinting(raw,'Reverse Holofoil').points[0][1],20);assert.equal(parseHistoryForPrinting(raw,'1st Edition Holofoil').points[0][1],900);assert.equal(parseHistoryForPrinting(raw,'Unlimited Holofoil').points[0][1],200);assert.equal(parseHistoryForPrinting(raw,'1st Edition Normal').points.length,0);
 const product={product_id:456,name:'Alakazam (1st Edition)',set_name:'Base Set',card_number:'1/102',language:'en'};
 assert.equal(verifyTickerProduct(product,{...base,edition:'First Edition',tcgplayerProductId:456}).ok,true);
 assert.equal(verifyTickerProduct(product,{...base,edition:'Unlimited',tcgplayerProductId:123}).ok,false);
});
test('Standard and Master progress count exact ownership once, with honest partial costs',()=>{
 const cards=[{...base,primary:true,printing:'Holofoil',edition:'Unlimited',price:100,verifiedMatch:true,stale:false},{...base,key:'reverse',id:'r',primary:false,printing:'Reverse Holofoil',edition:'Standard',variantVerified:true,price:null},{...base,key:'first',id:'f',primary:false,printing:'1st Edition Holofoil',edition:'First Edition',variantVerified:true,price:900,verifiedMatch:true,stale:false}];
 let c=emptyCollection();c=updateRecord(c,'reverse',{quantity:4,status:'owned',condition:'LP'});
 assert.equal(completion(cards,c,'standard').owned,0);const p=completion(cards,c,'master');assert.equal(p.total,2);assert.equal(p.owned,1);assert.equal(p.cost,100);assert.equal(p.unpriced,0);assert.equal(goalCards(cards,'first').length,1);
 c=updateRecord(c,'reverse',{quantity:0,status:'want'});assert.equal(completion(cards,c,'master').unpriced,1);c=updateRecord(c,base.key,{quantity:2,status:'owned'});assert.equal(completion(cards,c,'standard').percent,100);assert.equal(completion(cards,c,'master').owned,1);
});
test('set buying ranks exclude owned cards, respect signals and keep high-price opportunities',()=>{
 const cards=[{...base,key:'b',signal:'buy',price:300,score:90},{...base,key:'a',signal:'buy',price:5,score:82},{...base,key:'w',signal:'wait',price:20,score:85},{...base,key:'u',signal:'pending',price:null}];let c=updateRecord(emptyCollection(),'b',{quantity:1});assert.deepEqual(rankSet(cards,c,'buy').map(c=>c.key),['a']);assert.deepEqual(rankSet(cards,c,'wait').map(c=>c.key),['w']);assert.equal(rankSet(cards,c,'cheapest')[0].key,'a');assert.equal(rankSet(cards,emptyCollection(),'buy')[0].price,300);
});
test('CSV round-trip preserves quantity, condition, multiline notes, quotes, desired price and exact key',()=>{
 const c=updateRecord(emptyCollection(),base.key,{quantity:3,status:'owned',condition:'LP',purchasePrice:22.5,purchaseDate:'2026-10-18',notes:'=SUM(1,2)\n"Favorite", Pokémon',entryPrice:30});const csv=exportCSV(c,[base]);assert(csv.includes("'=SUM"),'Spreadsheet formula must be neutralized');const restored=importCSV(csv,emptyCollection()).collection;assert.deepEqual(restored.records,c.records);assert.equal(validateCollection(restored).records[base.key].quantity,3);
 assert.throws(()=>importCSV('key,status,quantity\nx,owned,-1',c));assert.equal(c.records[base.key].quantity,3);assert.throws(()=>importCSV('key,status,quantity\n__proto__,owned,1',c));
});
test('ordinary vintage commons get less age credit; custom weights never bypass evidence gates',()=>{
 const old={...base,key:'x',sourceRarity:'Common',rarity:'Common'},premium={...old,key:'y',sourceRarity:'Rare Holo',rarity:'Holo Rare'};
 const rows=assessCatalog([old,premium],{}, {asOf:'2026-10-18'});assert(rows[0].components.age<rows[1].components.age);assert.equal(rows[0].confidence,0);assert.equal(preferenceScore(rows[1],{ageWeight:35,significance:'age'}).signal,'pending');
});
test('the actual opportunity algorithm accepts qualifying prices above $100 and checks 14-day stabilization',()=>{
 const cards=['target','p1','p2','p3'].map(id=>({...base,key:id,id,sourceRarity:'Rare Holo',hype:98,printing:'Holofoil',edition:'Unlimited',variantVerified:true}));
 const start=Date.UTC(2026,5,1),day=i=>new Date(start+i*86400000).toISOString().slice(0,10),markets={};
 for(const [index,c]of cards.entries()){const history=Array.from({length:131},(_,i)=>[day(i),index?400+index*10:i<105?600:300]);markets[c.key]={productId:100+index,verifiedMatch:true,matchEvidence:'Exact English set/name/number and declared unlimited foil',language:'en',printing:'Holofoil',edition:'Unlimited',history,price:history.at(-1)[1],asOf:day(130)};}
 const row=assessCatalog(cards,markets,{asOf:day(130)})[0];assert.equal(row.signal,'buy');assert.equal(row.price,300);assert(row.entryPrice>100);assert(row.confidence>row.score-20);assert.notEqual(row.confidence,row.score);
 const falling={...markets,target:{...markets.target,history:markets.target.history.map(([d,p],i)=>[d,i>=120?300:i>=110?350:p])}};
 const wait=assessCatalog(cards,falling,{asOf:day(130)})[0];assert.equal(wait.change7,0);assert(wait.change14 < -6);assert.equal(wait.signal,'wait');
});
test('special copyright and stamp variants cannot borrow a standard printing price',()=>{
 const special={...base,primary:false,variantVerified:true,edition:'1999-2000-copyright',printing:'Holofoil'};
 const product={product_id:123,name:'Alakazam',set_name:'Base Set',card_number:'1/102',language:'en'};
 assert.equal(verifyTickerProduct(product,special).ok,false);
 const sameId={variants_detailed:[{type:'holo',subtype:'unlimited',thirdParty:{tcgplayer:123}},{type:'holo',subtype:'copyright-variant',thirdParty:{tcgplayer:123}}]};
 assert(expandCard(base,sameId).every(c=>c.priceIdentityAmbiguous));
});
test('metadata changes cannot silently transfer ownership to a different printing',()=>{
 const card={...base,printing:'Holofoil',edition:'Unlimited'};
 const c=updateRecord(emptyCollection(),base.key,{quantity:2,printing:'Normal',edition:'Unlimited'});
 assert.equal(completion([card],c,'standard').owned,0);assert.equal(c.records[base.key].quantity,2);
});
test('corrected authoritative metadata releases old ambiguous printing flags',()=>{
 const old={...base,priceIdentityAmbiguous:true,tcgplayerProductId:999};
 const fixed=expandCard(old,{variants_detailed:[{type:'holo',subtype:'unlimited',thirdParty:{tcgplayer:123}}]});
 assert.equal(fixed[0].priceIdentityAmbiguous,false);assert.equal(fixed[0].tcgplayerProductId,123);
});
test('unpriced cards with unconfirmed printing can be owned without inventing variant evidence',()=>{
 const card={...base,printing:null,edition:'Unconfirmed',variantVerified:false};
 const c=updateRecord(emptyCollection(),card.key,{quantity:1,printing:'Unconfirmed',edition:'Unconfirmed'});
 assert.equal(completion([card],c,'standard').owned,1);assert.equal(completion([card],c,'standard').cost,0);assert.equal(c.records[card.key].quantity,1);
 assert.equal(completion([{...card,printing:'Holofoil',edition:'Unlimited'}],c,'standard').owned,0,'Later printing confirmation requires review rather than silent reassignment');
});
