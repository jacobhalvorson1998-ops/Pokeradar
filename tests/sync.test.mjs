import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyRarity,fromBrief,fanProxy,parseTickerHits,parseHistory,parseCSV,setKey} from '../scripts/sync.mjs';
test('new and vintage rarity categories',()=>{
 assert.equal(classifyRarity('Illustration rare','166','151',2023),'IR');
 assert.equal(classifyRarity('Special illustration rare','198','151',2023),'SIR');
 assert.equal(classifyRarity('Rare PRIME','105','HS',2010),'Other');
 assert.equal(classifyRarity('Rare Holo LV.X','143','Supreme Victors',2009),'Other');
 assert.equal(classifyRarity('LEGEND','112','HeartGold SoulSilver',2010),'Other');
 assert.equal(classifyRarity('Rare Holo','1','Stormfront',2008),null);
 assert.equal(classifyRarity('Full Art Trainer','TG12','Lost Origin',2022),'Trainer Gallery');
});
test('fan appeal is editorial, bounded and stable',()=>{assert.equal(fanProxy('Pikachu'),97);assert.equal(fanProxy('Golduck'),62)});
test('TickerMint id matching insists on printing + set',()=>{
 const card={name:'Pikachu',set:'Cosmic Eclipse',number:'241/236'};
 const rows=[{language:'en',product_id:123,name:'Pikachu - 241/236',set_name:'Cosmic Eclipse',card_number:'241/236'},{language:'en',product_id:456,name:'Pikachu - 241/236',set_name:'Another Set',card_number:'241/236'}];
 assert.equal(parseTickerHits(rows,card),123);
 assert.equal(parseTickerHits([...rows,rows[0]],card),123);
 assert.equal(parseTickerHits(rows.slice(1),card),null);
});
test('CSV parsing and price extraction is not an estimate',()=>{const rows=parseCSV('query,name,market,date,url\n123,"Pikachu, Special",26.50,2026-10-17,https://tickermint.cards/card/123\n');assert.equal(rows[0].market,'26.50')});
test('History chooses foil printing not reverse foil',()=>{
 const rows=parseHistory({Holofoil:[{snapshot_date:'2026-10-01',market:10},{snapshot_date:'2026-10-02',market:12}], 'Reverse Holofoil':[{snapshot_date:'2026-10-01',market:4}]});
 assert.deepEqual(rows,[['2026-10-01',10],['2026-10-02',12]]);
});
test('stable catalog keys preserve published price identities',()=>{assert.equal(setKey('Stormfront','103/100'),'stormfront|103/100')});

test('all English rarities and 1999 Base Set are included',()=>{
 const set={id:'base1',name:'Base Set',releaseDate:'1999-01-09',cardCount:{official:102}};
 const holo=fromBrief({id:'base1-1',localId:'1',name:'Alakazam'},set,'Rare Holo');
 assert.equal(holo.year,1999);assert.equal(holo.number,'1/102');
 assert.equal(holo.rarity,'Standard');assert.equal(holo.sourceRarity,'Rare Holo');
 assert.equal(fromBrief({id:'base1-55',localId:'55',name:'Nidoran'},set,'Common').rarity,'Standard');
 assert.equal(fromBrief({id:'base1-100',localId:'100',name:'Lightning Energy'},set,null).rarity,'Unclassified');
});
test('older holo and shiny subseries never inherit an invented main-set denominator',()=>{
 const set={id:'ecard3',name:'Skyridge',releaseDate:'2003-05-12',cardCount:{official:144}};
 assert.equal(fromBrief({id:'ecard3-H1',localId:'H1',name:'Alakazam'},set,'Rare Holo').number,'H1');
 assert.equal(fromBrief({id:'pl1-SH4',localId:'SH4',name:'Lotad'},set,'Shiny Rare').number,'SH4');
 assert.equal(fromBrief({id:'bw11-RC1',localId:'RC1',name:'Ursaring'},set,'Rare').number,'RC1');
});
