import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyRarity,fanProxy,parseTickerHits,parseHistory,parseCSV,priceSignal,setKey} from '../scripts/sync.mjs';
test('new and vintage rarity categories',()=>{
 assert.equal(classifyRarity('Illustration rare','166','151',2023),'IR');
 assert.equal(classifyRarity('Special illustration rare','198','151',2023),'SIR');
 assert.equal(classifyRarity('Rare PRIME','105','HS',2010),'Other');
 assert.equal(classifyRarity('Rare Holo LV.X','143','Supreme Victors',2009),'Other');
 assert.equal(classifyRarity('LEGEND','112','HeartGold SoulSilver',2010),'Other');
 assert.equal(classifyRarity('Rare Holo','1','Stormfront',2008),null);
 assert.equal(classifyRarity('Full Art Trainer','TG12','Lost Origin',2022),'Galarian Gallery');
});
test('fan appeal is editorial, bounded and stable',()=>{assert.equal(fanProxy('Pikachu'),97);assert.equal(fanProxy('Golduck'),62)});
test('TickerMint id matching insists on printing + set',()=>{
 const card={name:'Pikachu',set:'Cosmic Eclipse',number:'241/236'};
 const rows=[{product_id:123,name:'Pikachu - 241/236',set_name:'Cosmic Eclipse',card_number:'241/236'},{product_id:456,name:'Pikachu - 241/236',set_name:'Another Set',card_number:'241/236'}];
 assert.equal(parseTickerHits(rows,card),123);
 assert.equal(parseTickerHits([...rows,rows[0]],card),123);
 assert.equal(parseTickerHits(rows.slice(1),card),null);
});
test('CSV parsing and price extraction is not an estimate',()=>{const rows=parseCSV('query,name,market,date,url\n123,"Pikachu, Special",26.50,2026-10-17,https://tickermint.cards/card/123\n');assert.equal(rows[0].market,'26.50')});
test('History chooses foil printing not reverse foil',()=>{
 const rows=parseHistory({Holofoil:[{snapshot_date:'2026-10-01',market:10},{snapshot_date:'2026-10-02',market:12}], 'Reverse Holofoil':[{snapshot_date:'2026-10-01',market:4}]});
 assert.deepEqual(rows,[['2026-10-01',10],['2026-10-02',12]]);
});
test('Older printing receives larger vintage weighting when price pattern matches',()=>{
 const today=new Date(); const end=new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),today.getUTCDate()));
 const history=Array.from({length:101},(_,i)=>{const d=new Date(end.getTime()-(100-i)*864e5).toISOString().slice(0,10);return [d,i<80?50:38]});
 const market={price:38,asOf:end.toISOString().slice(0,10),history};
 const old=priceSignal({year:2008,name:'Pikachu'},market);
 const newer=priceSignal({year:2025,name:'Pikachu'},market);
 assert.equal(old.signal,'buy');
 assert.ok(old.score>newer.score,`${old.score} versus ${newer.score}`);
 const stale={...market,asOf:'2020-01-01'};
 assert.equal(priceSignal({year:2008,name:'Pikachu'},stale).signal,'pending');
 assert.equal(setKey('Stormfront','103/100'),'stormfront|103/100');
});
