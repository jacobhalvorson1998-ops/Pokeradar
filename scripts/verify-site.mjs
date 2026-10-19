import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),raw=fs.readFileSync(path.join(root,'site/summary.json')),s=JSON.parse(raw);
assert.equal(s.version,5);assert.equal(s.modelVersion,'market-evidence-v3');assert(s.cards.length>0);assert(s.coverage.verified>0);assert(gzipSync(raw).length<2_000_000,'Summary must stay below 2 MB gzip');
assert(Number.isFinite(Date.parse(s.updatedAt)));assert(Number.isFinite(Date.parse(s.catalogUpdatedAt)));
const sourceCatalog=JSON.parse(fs.readFileSync(path.join(root,'site/catalog.json')));
assert.equal(sourceCatalog.cards.length,s.cards.length,'Published summary dropped catalog records');
const sets=new Map(s.sets.map(v=>[v.id,v])),rows=s.cards.map(row=>Object.fromEntries(s.columns.map((k,i)=>[k,row[i]]))),ids=new Set(),keys=new Set();
for(const card of rows){assert(!ids.has(card.id));ids.add(card.id);assert(!keys.has(card.key));keys.add(card.key);assert(!Object.hasOwn(card,'history'));assert(sets.has(card.setId));assert(sets.get(card.setId).year===null||sets.get(card.setId).year>0);assert(['buy','wait','watch','pending'].includes(card.signal));
 if(card.signal==='buy'){assert(card.verifiedMatch&&!card.stale&&card.price>0);const d=JSON.parse(fs.readFileSync(path.join(root,'site/details',card.id+'.json')));assert(d.evidenceScore>=s.buyThreshold&&card.historyEnough&&d.peers?.reliable);assert(card.drop90<=-18&&d.belowAverage90<=-7&&card.change7>=-3&&card.change7<=4&&card.change14>=-6&&card.change14<=8);assert(d.peers.relative30<=-5&&d.peers.relative90<=-8&&!d.peers.setDeclining);assert(d.reason&&d.risk&&d.entryPrice>0);}
 if(card.hasDetail)assert(fs.existsSync(path.join(root,'site/details',card.id+'.json')));
}
for(const id of ['base1','base2','base3','base5','neo1','lc','ex1','ex16']){assert(rows.some(c=>c.setId===id&&c.primary!==false),'Missing vintage set '+id);assert(fs.existsSync(path.join(root,'site/sets',id+'.json')));}
assert(!rows.some(c=>c.setId==='base1'&&/reverse/i.test(c.printing||'')),'Original Base Set cannot have reverse holo records');
console.log(JSON.stringify({event:'site-verified',cards:rows.length,baseCards:s.coverage.baseCards,verified:s.coverage.verified,vintageSetsVerified:8,summaryGzipBytes:gzipSync(raw).length}));

const health=JSON.parse(fs.readFileSync(path.join(root,'site/health.json')));
assert.deepEqual(health.signals,s.health.signals);assert.equal(health.funnel[0].count,rows.length);assert.equal(health.funnel.at(-1).count,rows.filter(c=>c.signal==='buy').length);
assert(health.funnel.every((x,i)=>i===0||x.count<=health.funnel[i-1].count));
assert.equal(Object.values(health.primaryFailures).reduce((a,b)=>a+b,0),rows.filter(c=>c.signal!=='buy').length);
assert.equal(s.buyThreshold,90,'Preserve the strict threshold deployed at the start of Issue #2');
for(const set of s.sets)if(set.pulse){for(const basket of ['all','chase']){const p=set.pulse[basket];for(const days of [7,30,90]){const w=p.windows[days];if(w.status==='eligible'){assert(w.samples>=p.required);assert(p.coverage>=p.coverageRequired);assert(Number.isFinite(w.change));}else assert.equal(w.change,null);}}}
assert.equal(s.providerPolicy.commercialPricingEnabled,false);assert.equal(s.providerPolicy.supplementalEnabled,false);
const html=fs.readFileSync(path.join(root,'site/index.html'),'utf8'),sw=fs.readFileSync(path.join(root,'site/sw.js'),'utf8');
for(const url of [...html.matchAll(/(?:src|href)="((?:app\.js|styles\.css)\?v=\d+)"/g)].map(x=>x[1]))assert(sw.includes(url),'The offline shell must cache the actual current version: '+url);
console.log(JSON.stringify({event:'vendor-and-pulse-verified',pulseSets:s.sets.filter(x=>x.pulse?.all.windows[30].status==='eligible').length,signals:health.signals,investigate:health.investigate,providerFedVendor:false}));

for(const card of rows)if(card.score!==null){assert(Array.isArray(card.profileScores));assert.equal(card.profileScores.length,s.profiles.length);assert(card.profileScores.every(Number.isFinite));const index=s.profiles.findIndex(p=>p.ageWeight===25&&p.significance==='collectible');assert.equal(card.profileScores[index],card.score);}
