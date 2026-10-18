import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const raw=fs.readFileSync(path.join(root,'site/summary.json'));
const summary=JSON.parse(raw);
assert.equal(summary.version,4);
assert(summary.cards.length>0,'No catalog entries');
assert(summary.coverage.verified>0,'No verified prices in published snapshot');
assert(gzipSync(raw).length<800_000,'Compressed summary exceeds 800KB budget');
assert(Number.isFinite(Date.parse(summary.updatedAt)),'Missing actual provider sync timestamp');
const ids=new Set();
for(const card of summary.cards){
 assert(!ids.has(card.id),'Duplicate card id');ids.add(card.id);
 assert(!Object.hasOwn(card,'history'),'Initial summary must not contain history');
 assert(card.year>=2008&&card.year<=new Date().getUTCFullYear());
 assert(['buy','wait','watch','pending','over'].includes(card.signal));
 if(card.signal==='buy'){
  assert(card.verifiedMatch&&!card.stale&&card.price>0&&card.price<100);
  const detail=JSON.parse(fs.readFileSync(path.join(root,'site/details',card.id+'.json')));
  assert(card.score>=summary.buyThreshold&&card.historyEnough&&detail.peers?.reliable);
  assert(card.drop90<=-18&&detail.belowAverage90<=-7&&card.change7>=-3&&card.change7<=4);
  assert(detail.peers.relative30<=-5&&detail.peers.relative90<=-8&&!detail.peers.setDeclining);
  assert(detail.reason&&detail.risk&&detail.entryPrice>0);
 }
 assert(fs.existsSync(path.join(root,'site/details',card.id+'.json')),'Missing lazy detail file');
}
console.log(JSON.stringify({event:'site-verified',cards:summary.cards.length,verified:summary.coverage.verified,summaryGzipBytes:gzipSync(raw).length}));
