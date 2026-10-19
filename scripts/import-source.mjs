/* Offline import only, following separately approved provider access and terms. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {PriceSource} from '../site/lib/price-source.mjs';
export function importAuthorizedSource(input,approval){
 if(!approval?.approvedByUser||!approval?.authorized||!approval?.coverageVerified||!approval?.termsReviewedAt)throw Error('Explicit provider authorization, coverage verification and user approval required');
 const adapter=new PriceSource(approval);
 const segments=input.segments.map(series=>adapter.importSegment(series,{commercial:!!approval.commercialApproved}));
 return {approvedSources:[approval.name],approval:{name:approval.name,termsUrl:approval.termsUrl,termsReviewedAt:approval.termsReviewedAt,commercialApproved:!!approval.commercialApproved},segments,observations:segments.flatMap(s=>s.observations),validationLog:{segments:segments.length,observations:segments.reduce((n,s)=>n+s.observations.length,0),verifiedAt:new Date().toISOString(),method:'Exact identity, separate provider/condition/metric segments; no interpolation or cross-provider splicing'}};
}
export function mergeSourceArchives(previous,next){
 const groups=new Map();
 for(const segment of [...(previous.segments||[]),...(next.segments||[])]){
  const key=JSON.stringify([segment.source,segment.identity]);
  const current=groups.get(key),byDate=new Map((current?.observations||[]).map(o=>[o.observedDate,o]));
  for(const observation of segment.observations)byDate.set(observation.observedDate,observation);
  groups.set(key,{...segment,observations:[...byDate.values()].sort((a,b)=>a.observedDate.localeCompare(b.observedDate))});
 }
 const segments=[...groups.values()];
 return {...next,approvedSources:[...new Set([...(previous.approvedSources||[]),...next.approvedSources])],segments,observations:segments.flatMap(s=>s.observations),validationLog:{...next.validationLog,previousObservationsRetained:true,observations:segments.reduce((n,s)=>n+s.observations.length,0)}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [input,approval]=process.argv.slice(2);if(!input||!approval)throw Error('Usage: node scripts/import-source.mjs input.json approved-provider.json');
 const imported=importAuthorizedSource(JSON.parse(fs.readFileSync(input)),JSON.parse(fs.readFileSync(approval)));
 const dest=new URL('../data/supplemental_sources.json',import.meta.url);
 const previous=fs.existsSync(dest)?JSON.parse(fs.readFileSync(dest)):{};
 const output=mergeSourceArchives(previous,imported);
 fs.writeFileSync(new URL(dest.href+'.tmp'),JSON.stringify(output)+'\n');fs.renameSync(new URL(dest.href+'.tmp'),dest);
}
