import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {agePriority} from '../scripts/opportunity.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

test('pre-2008 cards get top age priority',()=>{
 assert.equal(agePriority(1999),100);
 assert.equal(agePriority(2007),100);
 assert.equal(agePriority(2026),15);
});

test('published catalog preserves >$100, <$100, and unpriced cards',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'pokeradar-all-'));
 try{
  fs.mkdirSync(path.join(tmp,'site'),{recursive:true});
  const cards=[
   {key:'base set|1/102',id:'base1-1',name:'Alakazam',set:'Base Set',setId:'base1',number:'1/102',printing:'Holofoil',edition:'Unlimited',variantVerified:true,tcgplayerProductId:123,year:1999,rarity:'Standard',sourceRarity:'Rare Holo',hype:75},
   {key:'modern|3/50',id:'sv-test-3',name:'Pikachu',set:'Modern',number:'3/50',year:2026,rarity:'IR',hype:97},
   {key:'old|1/10',id:'old-test-1',name:'Energy',set:'Old',number:'1/10',year:1999,rarity:'Unclassified',hype:45}
  ];
  fs.writeFileSync(path.join(tmp,'site/catalog.json'),JSON.stringify({cards,progress:{reviewed:3,universe:3}}));
  fs.writeFileSync(path.join(tmp,'site/prices.json'),JSON.stringify({updatedAt:'2026-10-18T00:00:00Z',prices:{
   'base set|1/102':{price:225,asOf:'2026-10-18',productId:123,verifiedMatch:true,language:'en',printing:'Holofoil',matchEvidence:'Exact English product fixture'},
   'modern|3/50':{price:12,asOf:'2026-10-18',productId:456,verifiedMatch:true,language:'en',printing:'Holofoil',matchEvidence:'Exact English product fixture'}
  }}));
  execFileSync(process.execPath,[path.join(root,'scripts/build.mjs')],{env:{...process.env,POKERADAR_ROOT:tmp},stdio:'pipe'});
  const output=JSON.parse(fs.readFileSync(path.join(tmp,'site/summary.json'),'utf8'));
  assert.equal(output.cards.length,3);
  const rows=output.cards.map(row=>({...Object.fromEntries(output.columns.map((k,i)=>[k,row[i]])),year:output.sets.find(s=>s.id===row[output.columns.indexOf('setId')]).year}));
  assert.ok(rows.some(c=>c.year===1999&&c.price===225),'1999 pricey card should not be cut');
  assert.ok(rows.some(c=>c.price===12));
  assert.ok(rows.some(c=>c.rarity==='Unclassified'));
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
