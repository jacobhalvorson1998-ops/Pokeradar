import {DEPLOYED_BUY_THRESHOLD} from './model-policy.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {assessCatalog,preferenceScore,PREFERENCE_PROFILES,MODEL_VERSION} from './opportunity.mjs';
import {catalogHealth} from './health.mjs';
import {buildMarketPulse} from './market-pulse.mjs';
import {tickermintObservation,validateObservation,disagreement} from '../site/lib/price-source.mjs';
import {renderEvaluation} from './render-evaluation.mjs';
const root=process.env.POKERADAR_ROOT||path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=(file,fallback)=>{try{return JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}};
const write=(file,value)=>{const dest=path.join(root,file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest+'.tmp',JSON.stringify(value)+'\n');fs.renameSync(dest+'.tmp',dest);};
export function build({asOf=new Date().toISOString().slice(0,10)}={}){
 const catalog=read('site/catalog.json',null),saved=read('site/prices.json',null);
 if(!Array.isArray(catalog?.cards)||!saved?.prices)throw Error('Catalog and prices are required');
 const cards=catalog.cards.map(c=>({...c,id:c.id||'card-'+createHash('sha256').update(c.key).digest('hex').slice(0,16),setId:c.setId||'set-'+createHash('sha256').update(c.set).digest('hex').slice(0,12)}));
 const evaluation=read('site/evaluation.json',null),buyThreshold=DEPLOYED_BUY_THRESHOLD;
 const resolutions=read('data/resolved_ids.json',{}),report=read('data/sync_report.json',{});
 const rows=assessCatalog(cards,saved.prices,{asOf,buyThreshold,resolutions}).map(c=>c.verifiedMatch?c:{...c,price:null,entryPrice:null,change7:null,change14:null,change30:null,change90:null,drop90:null}),progress=catalog.progress||{};
 const coverage={reviewed:progress.reviewed??progress.catalogued??0,universe:progress.universe??cards.filter(c=>c.primary!==false).length,eligible:cards.length,baseCards:cards.filter(c=>c.primary!==false).length,verified:rows.filter(c=>c.verifiedMatch&&!c.stale&&c.price>0).length,historyReady:rows.filter(c=>c.verifiedMatch&&!c.stale&&c.historyEnough).length,comparable:rows.filter(c=>c.verifiedMatch&&!c.stale&&c.historyEnough&&c.peers?.reliable).length,unmatched:cards.filter(c=>resolutions[c.key]?.status!=='matched').length,variantMetadata:cards.filter(c=>c.primary!==false&&c.variantMetadataChecked).length,discoveryComplete:progress.discoveryComplete??progress.bulkRarityComplete??false,reviewMethod:progress.discoveryMethod||'English physical card catalog'};
 const health=catalogHealth(rows,{asOf,buyThreshold}),pulse=buildMarketPulse(rows,saved.prices,{asOf});
 write('site/health.json',health);
 const supplemental=read('data/supplemental_sources.json',{observations:[],approvedSources:[]});
 const sourceExtras=(supplemental.observations||[]).filter(o=>(supplemental.approvedSources||[]).includes(o.source)).flatMap(o=>{try{return [validateObservation(o,{asOf})];}catch{return [];}});
 const sets=read('data/sets.json',[]),bySet=new Map(sets.map(s=>[s.id,{...s}]));
 for(const row of rows)if(!bySet.has(row.setId))bySet.set(row.setId,{id:row.setId,name:row.set,year:row.year,era:'Pokémon TCG',releaseDate:row.releaseDate||null,logo:null});
 const groups=new Map();for(const row of rows){if(!groups.has(row.setId))groups.set(row.setId,[]);groups.get(row.setId).push(row);}
 fs.mkdirSync(path.join(root,'site/details'),{recursive:true});const names=new Set();
 for(const row of rows){
  const history=saved.prices[row.key]?.history||[];row.hasDetail=row.verifiedMatch&&history.length>0;
  row.profiles=row.score===null?null:PREFERENCE_PROFILES.map(p=>{const r=preferenceScore(row,{...p,buyThreshold});return [r.score,r.signal];});
  if(!row.hasDetail)continue;
  if(!/^[\w.-]+$/.test(row.id))throw Error('Unsafe detail id');names.add(row.id+'.json');
  let provenance=[];try{if(row.verifiedMatch)provenance.push(tickermintObservation(row,saved.prices[row.key]));}catch{}
  const relevant=sourceExtras.filter(o=>o.cardId===(row.baseId||row.id)&&o.printing===row.printing&&o.edition===row.edition);
  const latest=new Map();for(const o of relevant){const key=JSON.stringify([o.source,o.condition,o.metricType]);if(!latest.has(key)||latest.get(key).observedDate<o.observedDate)latest.set(key,o);}provenance.push(...latest.values());
  const legacySeries=(supplemental.segments||[]).filter(segment=>(supplemental.approvedSources||[]).includes(segment.source)&&segment.identity.cardId===(row.baseId||row.id)&&segment.identity.printing===row.printing&&segment.identity.edition===row.edition).map(segment=>({...segment,observations:segment.observations.map(o=>validateObservation(o,{asOf}))}));
  write('site/details/'+row.id+'.json',{...row,legacySeries,sources:provenance,sourceDisagreement:disagreement(provenance),history:history.slice(-120)});
 }
 for(const file of fs.readdirSync(path.join(root,'site/details')))if(file.endsWith('.json')&&!names.has(file))fs.unlinkSync(path.join(root,'site/details',file));
 for(const [id,group]of groups){if(!/^[\w.-]+$/.test(id))throw Error('Unsafe set id');const set=bySet.get(id);set.total=group.filter(c=>c.primary!==false).length;set.printings=group.length;set.priced=group.filter(c=>c.verifiedMatch&&!c.stale&&c.price>0).length;set.buy=group.filter(c=>c.signal==='buy').length;set.wait=group.filter(c=>c.signal==='wait').length;set.pulse=pulse.sets[id];set.metadataChecked=group.filter(c=>c.primary!==false&&c.variantMetadataChecked).length;write('site/sets/'+id+'.json',{version:5,set,cards:group.map(({history,...c})=>c)});}
 const columns=['id','key','baseId','name','setId','number','rarity','sourceRarity','printing','edition','primary','variantVerified','price','asOf','productId','verifiedMatch','stale','signal','score','change7','change14','change30','change90','drop90','historyEnough','confidence','entryPrice','hype','art','profiles','hasDetail','primaryFailure','failureReasons','evidenceScore','investigate','nearRank'];
 const compact=rows.map(c=>{const art=String(c.image||'').replace(/^https:\/\/assets.tcgdex.net\/en\//,'@').replace(/\/low\.webp$/,'');return columns.map(k=>k==='art'?art:c[k]??null);});
 const output={version:5,updatedAt:saved.updatedAt||null,catalogUpdatedAt:catalog.generatedAt||null,builtAt:new Date().toISOString(),modelVersion:'market-evidence-v3',buyThreshold,health:{signals:health.signals,funnel:health.funnel,primaryFailures:health.primaryFailures,nonexclusiveFailures:health.nonexclusiveFailures,investigate:health.investigate,labels:health.labels},pulse:{asOf:pulse.asOf,method:pulse.method,gates:pulse.gates},providerPolicy:{commercialPricingEnabled:false,supplementalEnabled:false,note:'Vendor provider-fed pricing is disabled until commercial rights are verified and approved. Manual condition comps are supported.'},profiles:PREFERENCE_PROFILES,coverage,updateStatus:{status:report.status||'unknown',attemptedAt:report.finishedAt||null,errors:(report.priceErrors||0)+(report.discoveryErrors||0)+(report.variantErrors||0),rateLimits:(report.providers?.tickermint?.rateLimits||0)+(report.providers?.tcgdex?.rateLimits||0),pendingHistories:report.pendingHistories??null},sets:[...bySet.values()].sort((a,b)=>a.year-b.year||a.name.localeCompare(b.name)),columns,cards:compact};
 write('site/summary.json',output);if(evaluation)renderEvaluation(evaluation);
 console.log(JSON.stringify({event:'site-built',...coverage,summaryBytes:fs.statSync(path.join(root,'site/summary.json')).size}));return output;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))build();
