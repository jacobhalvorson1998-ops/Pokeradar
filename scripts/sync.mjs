/**
 * PokéRadar community catalog + price updater.
 * Node 22+. GitHub Actions runs daily; no phone-side API requests needed.
 * No hard coded card limit: every English card released >= 2008 is eventually
 * inspected for rarity. Per-run API work is bounded and resumes next run.
 * Data access is personal/noncommercial; TickerMint attribution required.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const ROOT_URL='https://api.tcgdex.net/v2/en';
const PRICE_URL='https://api.tickermint.cards';
const CURRENT_YEAR=new Date().getUTCFullYear();
const minYear=2008;
const ensure=(p)=>fs.mkdirSync(path.dirname(p),{recursive:true});
const read=(f,fallback)=>{try{return JSON.parse(fs.readFileSync(path.join(ROOT,f),'utf8'))}catch{return fallback}};
const write=(f,data)=>{const dest=path.join(ROOT,f);ensure(dest);fs.writeFileSync(dest,JSON.stringify(data,null,0)+'\n')};
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const digits=(n)=>String(n??'').match(/\d+/)?.[0]||'';
const norm=(s)=>String(s??'').toLowerCase().replace(/pokémon/g,'pokemon').replace(/^(sv|sm|swsh|sword & shield|sun & moon|scarlet & violet)\s*:\s*/,'').replace(/[^a-z0-9]/g,'');
const rate=(n,max=100)=>Math.max(0,Math.min(max,n));
const money=(n)=>{const x=Number(n);return Number.isFinite(x)&&x>0&&x<1e7?Math.round(x*100)/100:null};
const validDay=(s)=>/^\d{4}-\d{2}-\d{2}$/.test(String(s??'').slice(0,10));
export const setKey=(name,number)=>`${String(name).toLowerCase().trim()}|${String(number).toUpperCase().replace(/\s/g,'')}`;
export const cleanNumber=(value)=>String(value??'').toUpperCase().replace(/\s+/g,'').replace(/^(SV|GG|TG)?0+(?=\d)/,'$1');
const HYPE_NAMES=[[/charizard/i,98],[/pikachu/i,97],[/umbreon/i,98],[/gengar/i,97],[/mewtwo/i,93],[/mew(?!t)/i,94],[/rayquaza/i,94],[/eevee/i,95],[/dragonite/i,92],[/lugia/i,94],[/giratina/i,92],[/espeon/i,92],[/sylveon/i,91],[/leafeon/i,85],[/glaceon/i,86],[/vaporeon/i,89],[/jolteon/i,88],[/flareon/i,87],[/greninja/i,92],[/gyarados/i,90],[/blastoise/i,90],[/venusaur/i,87],[/snorlax/i,89],[/lucario/i,88],[/gardevoir/i,88],[/arceus/i,87],[/latias|latios/i,87],[/magikarp/i,88],[/bulbasaur/i,87],[/squirtle/i,87],[/charmander/i,90],[/psyduck/i,83],[/tyranitar/i,89],[/suicune/i,85],[/entei/i,84],[/raikou/i,83],[/celebi/i,82]];
export const fanProxy=(name)=>HYPE_NAMES.find(([rx])=>rx.test(name))?.[1]??62;
export function classifyRarity(rarity,number='',setName='',year=2026){
 const r=String(rarity??'').toLowerCase().trim();const n=String(number).toUpperCase(),set=String(setName).toLowerCase();
 if(/special illustration|special art rare|s\.?i\.?r\.?/.test(r))return 'SIR';
 if(/illustration rare|illustration art rare|art rare/.test(r))return 'IR';
 if(/^(GG|TG)\d+/i.test(n)||/galarian gallery|trainer gallery/.test(set))return 'Galarian Gallery';
 if(/alternate art|alt art/.test(r))return 'Alt Art';
 if(/rare holo lv\.?x|rare prime|^legend$|shiny rare|shiny ultra rare|secret rare|rare secret|hyper rare|ultra rare|full art|black white rare|amazing rare|radiant rare|mega hyper rare|mega attack rare|gold star|shining|prism star|classic collection|character rare/i.test(r))return 'Other';
 // Numeric secret-numbered illustrations are candidate chase cards but require
 // a trustworthy rarity for classification; don't label all secret numbers IR.
 return null;
}
export function priceSignal(card,market){
 const age=(d)=>d?Math.max(0,(Date.now()-Date.parse(d+'T12:00:00Z'))/86400000):Infinity;
 const list=(market?.history||[]).filter(p=>Array.isArray(p)&&validDay(p[0])&&money(p[1]));
 const p=money(market?.price);if(!p||!validDay(market?.asOf)||age(market.asOf)>4)return {signal:'pending',score:null,reason:'Awaiting a recent verified price'};
 if(p>100)return {signal:'over',score:null,reason:'Over $100 raw-market budget'};
 const nearest=(days)=>{const date=Date.parse(market.asOf+'T12:00:00Z')-days*864e5;let best=null,dist=Infinity;for(const [t,v] of list){const d=Math.abs(Date.parse(t+'T12:00:00Z')-date);if(d<dist){dist=d;best=v}}return dist<=Math.max(3,days*.24)*864e5?best:null};
 const r7=nearest(7),r30=nearest(30),recent=list.filter(([date])=>age(date)<=90),hi=recent.length?Math.max(...recent.map(([,v])=>v)):null;
 if(!r7||!r30||!hi||list.length<28)return {signal:'pending',score:null,reason:'Not enough verified history'};
 const d7=(p/r7-1)*100,d30=(p/r30-1)*100,down=(p/hi-1)*100,yearsOld=rate(CURRENT_YEAR-(card.year||CURRENT_YEAR),20);
 const legacy=Math.min(100,20+yearsOld*4),stable=d7>=-3&&d7<=4?95:d7<-3?35:60;
 // Explicitly 28% older-card bonus, compared with 10% previously.
 const score=Math.round(rate(Math.max(0,-down)*3.1)*.31 + fanProxy(card.name)*.19 + stable*.22 + legacy*.28);
 if(down<=-18&&d30<=-7&&d7>=-3&&d7<=4&&fanProxy(card.name)>=75)return {signal:'buy',score,reason:'Pullback with more stable 7-day pricing; inspect listings'};
 if((down<=-12||d30<=-10)&&(d7<-3||(d30<-16&&d7<0)))return {signal:'wait',score,reason:'Still falling; wait for stabilization'};
 return {signal:'watch',score,reason:'Monitor for a better entry price'};
}
export function parseTickerHits(raw,card){
 const hits=Array.isArray(raw)?raw:(raw?.results||raw?.data||raw?.products||[]);if(!Array.isArray(hits))return null;
 const expectedName=norm(card.name),expectedSet=norm(card.set),expectedLocal=cleanNumber(String(card.number).split('/')[0]);
 const hitsFound=[];
 for(const h of hits){const id=Number(h?.product_id??h?.productId??h?.id);if(!Number.isSafeInteger(id)||id<1)continue;
  const gotSet=norm(typeof h?.set==='object'?h.set.name:(h?.set_name??h?.set??h?.group_name));
  const gotName=norm(String(h?.name??'').replace(/\s*[-–]\s*\w*\d+\s*\/\s*\w*\d+.*$/,''));
  const gotNum=cleanNumber(String(h?.card_number??h?.number??h?.collector_number??'').split('/')[0]);
  if(!gotSet||!(gotSet===expectedSet||gotSet.includes(expectedSet)||expectedSet.includes(gotSet)))continue;
  if(!gotNum||gotNum!==expectedLocal)continue;
  if(!(gotName===expectedName||gotName.startsWith(expectedName)||expectedName.startsWith(gotName)))continue;
  hitsFound.push(id);
 }
 return [...new Set(hitsFound)].length===1?hitsFound[0]:null;
}
export function parseHistory(raw){const g=raw?.data||raw?.history||raw?.prices||raw;
 const choices=[];for(const [printing,pts] of Object.entries(Array.isArray(g)?{Holofoil:g}:g||{})){
  if(/reverse|non.?holo|normal/i.test(printing)||!Array.isArray(pts))continue;
  const dates=new Map();for(const p of pts){const date=String(p.snapshot_date||p.date||p.as_of||'').slice(0,10),val=money(p.market??p.market_price??p.marketPrice??p.price);if(validDay(date)&&val)dates.set(date,val)}
  if(dates.size)choices.push({printing,points:[...dates].sort((a,b)=>a[0].localeCompare(b[0])).slice(-120)});
 }
 choices.sort((a,b)=>/holofoil/i.test(b.printing)-/holofoil/i.test(a.printing)||b.points.length-a.points.length);
 return choices[0]?.points||[];
}
export function parseCSV(csv){let rows=[],row=[],part='',q=false;for(let i=0;i<csv.length;i++){
 const c=csv[i];if(q){if(c==='"'&&csv[i+1]==='"'){part+='"';i++}else if(c==='"')q=false;else part+=c}
 else if(c==='"')q=true;else if(c===','){row.push(part);part=''}else if(c==='\n'){row.push(part.replace(/\r$/,''));rows.push(row);row=[];part=''}else part+=c
 }if(part||row.length){row.push(part);rows.push(row)}const hdr=(rows.shift()||[]).map(x=>x.toLowerCase().trim());return rows.filter(r=>r.length>1).map(r=>Object.fromEntries(hdr.map((h,i)=>[h,r[i]])))}
async function get(url,format='json',retries=2){for(let t=0;t<=retries;t++){
 try{const signal=AbortSignal.timeout(25000);const r=await fetch(url,{headers:{'accept':format==='json'?'application/json':'text/csv','user-agent':'PokeRadar-collector/3.0 noncommercial'},signal});if(!r.ok)throw Error(`${r.status} ${url}`);return format==='json'?await r.json():await r.text()}
 catch(e){if(t===retries)throw e;await sleep(1200*(t+1))}
 }}
async function pooled(items,limit,fn){let i=0;const jobs=Array.from({length:Math.min(items.length,limit)},async()=>{while(i<items.length){let idx=i++;try{await fn(items[idx],idx)}catch(e){console.log('Skipping',items[idx]?.id||items[idx],String(e.message).slice(0,100))}}});await Promise.all(jobs)}
function fromDetail(card,set){const year=Number(String(set.releaseDate).slice(0,4));const official=Number(set.cardCount?.official||set.cardCount?.printed||0);const local=String(card.localId||'');
 const no=official?`${local}/${official}`:local;
 const rarity=classifyRarity(card.rarity,local,set.name,year);if(!rarity)return null;
 const image=card.image?String(card.image).replace(/\/$/,'')+'/low.webp':'';
 return {key:setKey(set.name,no),id:card.id,name:card.name,set:set.name,number:no,year,rarity,hype:fanProxy(card.name),image};
}
async function discover(){const sets=await get(`${ROOT_URL}/sets`);const detailCache=read('data/card_details.json',{});const setCache=read('data/set_cache.json',{});let active=[];
 const targets=sets.filter(s=>s?.id&&s.name);
 await pooled(targets,9,async s=>{
  const cached=setCache[s.id];if(cached?.releaseDate&&Array.isArray(cached.cards)){const y=Number(cached.releaseDate.slice(0,4));if(y>=minYear&&y<=CURRENT_YEAR)active.push(cached);return}
  const details=await get(`${ROOT_URL}/sets/${encodeURIComponent(s.id)}`);if(!details?.releaseDate||!Array.isArray(details.cards))return;
  setCache[s.id]={id:s.id,name:details.name,releaseDate:details.releaseDate,cardCount:details.cardCount,cards:details.cards.map(c=>({id:c.id,localId:c.localId,name:c.name,image:c.image}))};
  const y=Number(details.releaseDate.slice(0,4));if(y>=minYear&&y<=CURRENT_YEAR)active.push(setCache[s.id]);
 });
 write('data/set_cache.json',setCache);
 const all=new Map();for(const s of active)for(const c of s.cards||[])all.set(c.id,{brief:c,set:s});
 const nowDone=new Set(Object.keys(detailCache));
 // Prioritize identified chase rarities to expose the full set quickly,
 // then inspect EVERY remaining card over time. There is no total card cap.
 const rarities=['Illustration rare','Special illustration rare','Secret Rare','Ultra Rare','Rare PRIME','Rare Holo LV.X','LEGEND','Shiny Ultra Rare','Full Art Trainer'];
 const first=new Set();await pooled(rarities,3,async rarity=>{
  try{const list=await get(`${ROOT_URL}/cards?rarity=${encodeURIComponent('eq:'+rarity)}`);if(Array.isArray(list)&&list.length<6500)for(const c of list)if(all.has(c.id))first.add(c.id)}catch{}
 });
 const candidate=[...all.values()].filter(x=>{
  const official=Number(x.set.cardCount?.official||0),num=Number(digits(x.brief.localId));return first.has(x.brief.id)||(/^(GG|TG|SV)/i.test(String(x.brief.localId)))||(num>official&&official>0)
 });
 const years=(a,b)=>Number(a.set.releaseDate.slice(0,4))-Number(b.set.releaseDate.slice(0,4));
 const pendingPriority=candidate.filter(x=>!nowDone.has(x.brief.id)).sort(years);
 const prioritizedIds=new Set(pendingPriority.map(x=>x.brief.id));
 const pendingRest=[...all.values()].filter(x=>!nowDone.has(x.brief.id)&&!prioritizedIds.has(x.brief.id)).sort(years);
 const max=Number(process.env.MAX_DETAILS_PER_RUN||650);
 const fetchQueue=[...pendingPriority,...pendingRest].slice(0,max);
 console.log(`TCGdex: ${active.length} sets since ${minYear}; ${all.size} total cards; ${nowDone.size} detail records cached. Fetching ${fetchQueue.length} details.`);
 let added=0;
 await pooled(fetchQueue,10,async x=>{const detail=await get(`${ROOT_URL}/cards/${encodeURIComponent(x.brief.id)}`);if(detail&&detail.id){detailCache[x.brief.id]={name:detail.name,rarity:detail.rarity,localId:detail.localId,image:detail.image};added++}});
 write('data/card_details.json',detailCache);
 const result=[];for(const {brief,set} of all.values()){const cached=detailCache[brief.id];if(!cached)continue;const c=fromDetail({...brief,...cached},set);if(c)result.push(c)}
 return {cards:result,progress:{catalogued:nowDone.size+added,universe:all.size,eligible:result.length,sets:active.length}};
}
async function updatePrices(catalog){const saved=read('site/prices.json',{version:3,prices:{}});const prices=saved.prices||{};
 const ids=read('data/resolved_ids.json',{});
 const sorted=[...catalog].sort((a,b)=>a.year-b.year||b.hype-a.hype);
 const todo=sorted.filter(c=>!Object.hasOwn(ids,c.key));
 const max=Number(process.env.MAX_RESOLVE_PER_RUN||65);
 let resolved=0,unmatched=0;
 for(const c of todo.slice(0,max)){
  try{const q=encodeURIComponent(`${c.name} ${c.number}`);const raw=await get(`${PRICE_URL}/products/search?q=${q}&game=pokemon`);const id=parseTickerHits(raw,c);
   ids[c.key]=id||0;if(id)resolved++;else unmatched++;
  }catch(e){console.log('TickerMint resolve failure for',c.key,e.message)}
  await sleep(1250);
 }
 write('data/resolved_ids.json',ids);
 const mapped=sorted.filter(c=>Number(ids[c.key])>0);const activeIds=mapped.map(c=>ids[c.key]);
 let priced=0;
 for(let i=0;i<activeIds.length;i+=50){const batch=activeIds.slice(i,i+50);
  try{const qs=batch.map(id=>'q='+encodeURIComponent(String(id))).join('&');const csv=await get(`${PRICE_URL}/sheets/prices?${qs}`,'csv');
   for(const row of parseCSV(csv)){
    const id=Number(row.query||row.id||row.product_id),card=mapped.find(c=>ids[c.key]===id);
    if(!card)continue;const value=money(row.market||row.market_price_usd||row.price),date=String(row.date||'').slice(0,10);
    const url=String(row.url||'');if(!value||!validDay(date)||!url.startsWith(`https://tickermint.cards/card/${id}`))continue;
    prices[card.key]={...prices[card.key],productId:id,verifiedMatch:true,price:value,asOf:date,tickermintUrl:url};priced++;
   }
  }catch(e){console.log('Price batch error',e.message)}
  await sleep(250);
 }
 const historyTargets=mapped.filter(c=>prices[c.key]?.price&&prices[c.key]?.asOf).sort((a,b)=>a.year-b.year||b.hype-a.hype);
 const maxHist=Number(process.env.MAX_HISTORY_PER_RUN||65);
 // Refresh cards with oldest history first, so coverage grows automatically.
 historyTargets.sort((a,b)=>String(prices[a.key]?.historyChecked||'').localeCompare(String(prices[b.key]?.historyChecked||''))||a.year-b.year);
 let gotHistory=0;
 for(const card of historyTargets.slice(0,maxHist)){
  try{const raw=await get(`${PRICE_URL}/products/${ids[card.key]}/prices`);const h=parseHistory(raw);
   if(h.length){prices[card.key]={...prices[card.key],history:h,historyChecked:new Date().toISOString().slice(0,10)};gotHistory++}
  }catch(e){console.log('History failed:',card.key,e.message)}
  await sleep(250);
 }
 write('site/prices.json',{version:3,updatedAt:new Date().toISOString(),source:'TickerMint (TCGplayer-derived)',prices});
 console.log(`Price sync: ${resolved} newly identified; ${unmatched} not matched; ${priced} market quotes; ${gotHistory} histories; ${mapped.length} matched total`);
}
async function main(){const previous=read('site/catalog.json',{cards:[]});const previousByKey=new Map((previous.cards||[]).map(c=>[c.key,c]));
 let found={cards:[],progress:{universe:0,catalogued:0,eligible:0,sets:0}};
 try{found=await discover()}catch(e){console.warn('Catalog API unavailable; preserving existing known cards',e.message)}
 const byKey=new Map([...previousByKey]);for(const c of found.cards){const previous=byKey.get(c.key)||{};byKey.set(c.key,{...previous,...c,rarity:previous.rarity==='Alt Art'&&c.rarity==='Other'?'Alt Art':c.rarity,hype:fanProxy(c.name)})}
 const all=[...byKey.values()].filter(c=>c.year>=minYear&&c.year<=CURRENT_YEAR).sort((a,b)=>a.year-b.year||a.name.localeCompare(b.name));
 write('site/catalog.json',{version:3,generatedAt:new Date().toISOString(),count:all.length,progress:found.progress,cards:all});
 console.log('Eligible catalog:',all.length,'cards (not capped).');
 try{await updatePrices(all)}catch(e){console.warn('Price updater failed. Existing verified snapshots preserved.',e.message)}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){main().catch(e=>{console.error(e);process.exitCode=1})}
