/** English metadata and printing declarations. No guessed variants or prices. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {atomicWriteJSON,createRateLimitedClient} from './provider.mjs';
const root=process.env.POKERADAR_ROOT||path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=(file,fallback)=>{try{return JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));}catch{return fallback;}};
const write=(file,value)=>atomicWriteJSON(path.join(root,file),value);
const slug=s=>String(s).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
export function rarityLabel(rarity='',name='',subtypes=[]){
 const text=String(rarity).toLowerCase(),sub=subtypes.join(' ').toLowerCase();
 if(/gold star|holo star/.test(text)||/☆/.test(name))return 'Gold Star';
 if(/shining/.test(text)||/^shining /i.test(name))return 'Shining Pokémon';
 if(/crystal/.test(text))return 'Crystal Pokémon';
 if(/lv\.?x/i.test(text+' '+sub))return 'Vintage ex / LV.X';
 if(/prime|legend/.test(text+' '+sub))return 'PRIME / LEGEND';
 if(subtypes.includes('ex'))return 'Vintage ex / LV.X';
 if(/special illustration|special art rare/.test(text))return 'SIR';
 if(/illustration rare|art rare/.test(text))return 'IR';
 if(/alternate/.test(text))return 'Alt Art';
 if(/secret|hyper/.test(text))return 'Secret Rare';
 if(/full art|ultra/.test(text))return 'Full Art';
 if(/holo/.test(text))return 'Holo Rare';
 if(/^common$/.test(text))return 'Common';
 if(/^uncommon$/.test(text))return 'Uncommon';
 if(/^rare$/.test(text))return 'Regular Rare';
 if(/promo/.test(text))return 'Promo / Other';
 return rarity||'Unclassified';
}
export function declaredPrintings(detail={}){
 const found=new Map();
 const add=(printing,edition='Standard',extra={})=>{const key=printing+'|'+edition;if(!found.has(key))found.set(key,{printing,edition,variantVerified:true,variantEvidence:'TCGdex English card-specific printing declaration',...extra});};
 for(const entry of detail.variants_detailed||[]){
  if(entry.size&&entry.size!=='standard')continue;
  const type={normal:'Normal',holo:'Holofoil',reverse:'Reverse Holofoil'}[entry.type];if(!type)continue;
  const stamps=Array.isArray(entry.stamp)?entry.stamp:entry.stamp?[entry.stamp]:[];
  const first=stamps.includes('1st-edition'),otherStamps=stamps.filter(s=>s!=='1st-edition');
  const edition=otherStamps.length?(first?'First Edition · ':'Stamped: ')+otherStamps.join(' + '):first?'First Edition':entry.subtype==='shadowless'?'Shadowless':entry.subtype==='unlimited'?'Unlimited':entry.subtype&&entry.subtype!=='standard'?entry.subtype:'Standard';
  const printing=first?`1st Edition ${type}`:edition==='Shadowless'?`Unlimited ${type}`:type;
  add(printing,edition,{foil:type,tcgplayerProductId:Number(entry.thirdParty?.tcgplayer)||null,stamps,subtype:entry.subtype||null});
 }
 // Boolean flags prove individual foil treatments; they do not prove edition combinations.
 for(const [flag,printing]of [['normal','Normal'],['holo','Holofoil'],['reverse','Reverse Holofoil']]){
  if(detail.variants?.[flag]!==true)continue;
  if(![...found.values()].some(v=>(v.foil===printing||v.printing===printing)))add(printing,'Standard',{foil:printing});
 }
 return [...found.values()];
}
export function expandCard(card,detail={},market={}){
 const canonical={...card,printing:null,edition:'Unconfirmed',variantVerified:false,variantEvidence:null,priceIdentityAmbiguous:false,tcgplayerProductId:null,foil:null,subtype:null,stamps:[],standardPrintingUnsupported:false};
 const declarations=declaredPrintings(detail);
 for(const v of declarations)if(v.tcgplayerProductId&&declarations.some(other=>other!==v&&other.tcgplayerProductId===v.tcgplayerProductId&&other.printing===v.printing&&other.edition!==v.edition))v.priceIdentityAmbiguous=true;
 const eligible=declarations.filter(v=>['Standard','Unlimited'].includes(v.edition));
 const primary=eligible.find(v=>v.printing===market.printing)||eligible.find(v=>v.printing==='Holofoil')||eligible.find(v=>v.printing==='Normal')||eligible[0]||(declarations.length===1?declarations[0]:null);
 const base={...canonical,standardPrintingUnsupported:declarations.length>0&&!primary,baseId:card.id,baseKey:card.key,primary:true,...(primary||{printing:null,edition:'Unconfirmed',variantVerified:false,variantEvidence:null}),variantMetadataChecked:!!detail.checkedAt};
 const variants=[base];
 for(const variant of declarations){if(variant===primary)continue;const suffix=slug(variant.edition+'-'+variant.printing);variants.push({...canonical,...variant,id:card.id+'--'+suffix,key:card.key+'::'+suffix,baseId:card.id,baseKey:card.key,primary:false,variantMetadataChecked:true});}
 return variants;
}
export async function enrichCatalog(cards,{client,report={}}={}){
 const setCache=read('data/set_cache.json',{}),english=read('data/english_metadata.json',{sets:{},cards:{}}),variants=read('data/variant_cache.json',{});
 const github=createRateLimitedClient({minInterval:100,retries:2,deadline:Date.now()+120000,log:()=>{}});
 try{
  const index=await github.get('https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master/sets/en.json');
  const supported=new Map(index.map(s=>[s.id,s]));let next=0;const pending=Object.values(setCache).filter(s=>supported.has(s.id)&&(!english.sets[s.id]||Date.parse(english.sets[s.id].checkedAt||'')<Date.now()-30*86400000||(['ecard2','ecard3'].includes(s.id)&&english.sets[s.id].metadataVersion!==2)));
  await Promise.all(Array.from({length:4},async()=>{while(next<pending.length){const set=pending[next++];try{const rows=await github.get(`https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master/cards/en/${encodeURIComponent(set.id)}.json`);for(const c of rows)english.cards[c.id]={rarity:c.rarity||null,subtypes:c.subtypes||[],crystal:(c.abilities||[]).some(a=>/crystal type/i.test(a.name||'')),image:c.images?.small||null};const meta=supported.get(set.id);english.sets[set.id]={logo:meta.images?.logo||null,serie:meta.series,metadataVersion:2,checkedAt:new Date().toISOString()};if(next%20===0){write('data/english_metadata.json',english);console.log(`English rarity metadata ${next}/${pending.length} sets`);}}catch(e){console.warn('English metadata retained: '+e.message);}}}));
  write('data/english_metadata.json',english);
 }catch(e){console.warn('Using saved English metadata: '+e.message);}
 const originals=cards.filter(c=>c.primary!==false);
 const personalInput=read('data/priority_keys.json',[]),personal=new Set((Array.isArray(personalInput)?personalInput:[]).filter(k=>typeof k==='string').map(k=>k.split('::')[0]));
 const saved=read('site/prices.json',{prices:{}}).prices;
 const fresh=c=>saved[c.key]?.verifiedMatch&&saved[c.key]?.asOf&&Date.now()-Date.parse(saved[c.key].asOf+'T00:00:00Z')<=4*86400000;
 const priorities=new Set(['base1','base2','base3','base5','neo1','lc','ex1','ex16']);
 const pending=originals.filter(c=>!variants[c.id]?.checkedAt||Date.parse(variants[c.id].checkedAt)<Date.now()-30*86400000).sort((a,b)=>Number(personal.has(b.key))-Number(personal.has(a.key))||Number(!!fresh(a))-Number(!!fresh(b))||Number(!!variants[a.id]?.checkedAt)-Number(!!variants[b.id]?.checkedAt)||Number((b.hype||0)>=85)-Number((a.hype||0)>=85)||Number(priorities.has(b.setId))-Number(priorities.has(a.setId))||a.year-b.year||b.hype-a.hype);
 const cap=Math.max(0,Math.min(5000,Number(process.env.MAX_VARIANT_DETAILS??1500)));
 if(client){let next=0,done=0;await Promise.all(Array.from({length:5},async()=>{while(next<Math.min(pending.length,cap)){const c=pending[next++];try{const d=await client.get(`https://api.tcgdex.net/v2/en/cards/${encodeURIComponent(c.id)}`);if(d.id!==c.id)throw Error('Card identity differs');variants[c.id]={variants:d.variants||{},variants_detailed:(d.variants_detailed||[]).map(v=>({type:v.type,subtype:v.subtype,size:v.size,stamp:v.stamp,thirdParty:{tcgplayer:v.thirdParty?.tcgplayer}})),checkedAt:new Date().toISOString()};done++;if(done%50===0){write('data/variant_cache.json',variants);console.log(`Printing metadata ${done}/${Math.min(pending.length,cap)} cards`);}}catch(e){report.variantErrors=(report.variantErrors||0)+1;console.warn(`Printing metadata deferred ${c.id}: ${e.message}`);if(/budget/.test(e.message)){next=cap;break;}}}}));report.variantDetailsRetrieved=done;write('data/variant_cache.json',variants);}
 const details=read('data/card_details.json',{});
 const expanded=originals.flatMap(c=>{
  const meta=english.cards[c.id]||{},detail=variants[c.id]||details[c.id]||{};
  let rarity=rarityLabel(meta.rarity||c.sourceRarity||'',c.name,meta.subtypes||[]);
  // Provider-verified alternate artwork and gallery labels retain their evidence.
  if(['Alt Art','Galarian Gallery','Trainer Gallery'].includes(c.rarity))rarity=c.rarity;
  if(meta.crystal)rarity='Crystal Pokémon';
  return expandCard({...c,...(c.setId==='miscp'?{year:null,releaseDate:null}:{}),rarity,sourceRarity:meta.rarity||c.sourceRarity,language:'en'},detail,saved[c.key]);
 });
 const sets=Object.values(setCache).filter(s=>originals.some(c=>c.setId===s.id)).map(s=>({id:s.id,name:s.name,releaseDate:s.id==='miscp'?null:s.releaseDate,year:s.id==='miscp'?null:Number(s.releaseDate.slice(0,4)),era:english.sets[s.id]?.serie||s.serie?.name||'Pokémon TCG',logo:english.sets[s.id]?.logo||(s.logo?String(s.logo)+'.webp':null),total:originals.filter(c=>c.setId===s.id).length,metadataChecked:originals.filter(c=>c.setId===s.id&&variants[c.id]?.checkedAt).length}));
 write('data/sets.json',sets);report.variantMetadataPending=pending.length-(report.variantDetailsRetrieved||0);return expanded;
}
async function main(){
 const {discover}=await import('./sync.mjs');
 const client=createRateLimitedClient({minInterval:100,deadline:Date.now()+12*60000});
 const report={setsRetrieved:0,rarityListsRetrieved:0,detailsRetrieved:0,discoveryErrors:0};
 const discovered=await discover({client,report});
 const old=read('site/catalog.json',{cards:[]}),byId=new Map(old.cards.filter(c=>c.primary!==false).map(c=>[c.baseId||c.id,c]));
 const base=discovered.cards.map(c=>({...byId.get(c.id),...c,key:byId.get(c.id)?.key||c.key}));
 const cards=await enrichCatalog(base,{client,report});
 write('site/catalog.json',{version:5,generatedAt:new Date().toISOString(),count:cards.length,progress:{...discovered.progress,discoveryComplete:discovered.progress.bulkRarityComplete},cards});
 console.log(JSON.stringify({event:'catalog-enriched',cards:cards.length,baseCards:base.length,...report}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e);process.exitCode=1;});
