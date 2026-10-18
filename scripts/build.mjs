import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {assessCatalog} from './opportunity.mjs';
import {renderEvaluation} from './render-evaluation.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=(name,fallback)=>{try{return JSON.parse(fs.readFileSync(path.join(root,name),'utf8'))}catch(e){if(e.code==='ENOENT')return fallback;throw e}};
const write=(name,value)=>{
 const dest=path.join(root,name);fs.mkdirSync(path.dirname(dest),{recursive:true});
 fs.writeFileSync(dest+'.tmp',JSON.stringify(value)+'\n');fs.renameSync(dest+'.tmp',dest);
};

export function build({asOf=new Date().toISOString().slice(0,10)}={}){
 const catalog=read('site/catalog.json',null),snapshot=read('site/prices.json',null);
 if(!Array.isArray(catalog?.cards)||!snapshot?.prices)throw Error('Catalog and saved prices are required');
 const cards=catalog.cards.map(c=>({...c,id:c.id||'card-'+createHash('sha256').update(c.key).digest('hex').slice(0,16)}));
 const evaluation=read('site/evaluation.json',null);
 const buyThreshold=evaluation?.calibration?.applied?evaluation.calibration.threshold:80;
 const assessed=assessCatalog(cards,snapshot.prices,{asOf,buyThreshold});
 const progress=catalog.progress||{};
 const rows=assessed;
 const coverage={
  reviewed:progress.reviewed??progress.catalogued??0,universe:progress.universe??0,
  eligible:cards.length,verified:rows.filter(c=>c.verifiedMatch&&!c.stale&&c.price>0).length,
  historyReady:rows.filter(c=>c.verifiedMatch&&!c.stale&&c.historyEnough).length,
  comparable:rows.filter(c=>c.verifiedMatch&&!c.stale&&c.historyEnough&&c.peers?.reliable).length,
  underBudget:rows.filter(c=>c.verifiedMatch&&!c.stale&&c.price>0&&c.price<100).length,
  discoveryComplete:progress.discoveryComplete??progress.bulkRarityComplete??false,
  reviewMethod:progress.discoveryMethod??'individual card details',
 };
 for(const c of rows){
  if(!/^[\w.-]+$/.test(c.id))throw Error('Unsafe detail filename: '+c.id);
  const market=snapshot.prices[c.key]||{};
  write('site/details/'+c.id+'.json',{...c,printing:market.printing??'Unconfirmed',history:(market.history||[]).slice(-120)});
 }
 // Remove details only for cards no longer in this build; never touch other site files.
 const names=new Set(rows.map(c=>c.id+'.json'));
 for(const name of fs.readdirSync(path.join(root,'site/details')))if(name.endsWith('.json')&&!names.has(name))fs.unlinkSync(path.join(root,'site/details',name));
 const listFields=['key','id','name','set','number','year','rarity','hype','image','price','asOf','productId','verifiedMatch','stale','signal','score','change7','change30','change90','drop90','historyEnough'];
 const compact=rows.filter(c=>!Number.isFinite(c.price)||c.price<100).map(c=>Object.fromEntries(listFields.filter(key=>c[key]!==undefined).map(key=>[key,c[key]])));
 const output={version:4,updatedAt:snapshot.updatedAt??null,builtAt:new Date().toISOString(),modelVersion:'set-relative-v1',buyThreshold,coverage,cards:compact};
 write('site/summary.json',output);
 if(evaluation)renderEvaluation(evaluation);
 console.log(JSON.stringify({event:'site-built',...coverage,summaryBytes:fs.statSync(path.join(root,'site/summary.json')).size}));
 return output;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))build();
