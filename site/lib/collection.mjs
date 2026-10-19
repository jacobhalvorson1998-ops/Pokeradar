/** Versioned, provider-independent collection records; no account credentials. */
export const COLLECTION_VERSION=1;
export const emptyCollection=()=>({version:1,revision:0,records:{},goals:{},updatedAt:null});
const safeText=(v,max=2000)=>String(v??'').slice(0,max);
const amount=v=>v===''||v===null||v===undefined?null:Number.isFinite(Number(v))&&Number(v)>=0?Math.round(Number(v)*100)/100:null;
export function normalizeRecord(input={}){
 const quantity=Number(input.quantity??0);
 if(!Number.isInteger(quantity)||quantity<0||quantity>100000)throw Error('Quantity must be a whole number from 0 to 100,000.');
 const status=quantity>0?'owned':input.status==='want'?'want':'missing';
 const condition=['Unknown','NM','LP','MP','HP','Damaged'].includes(input.condition)?input.condition:'Unknown';
 const purchaseDate=input.purchaseDate?String(input.purchaseDate):'';
 if(purchaseDate&&(!/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate)||new Date(purchaseDate+'T00:00:00Z').toISOString().slice(0,10)!==purchaseDate))throw Error('Enter a valid purchase date.');
 return {status,quantity,condition,printing:input.printing?safeText(input.printing,100):null,edition:input.edition?safeText(input.edition,100):null,baseId:input.baseId?safeText(input.baseId,100):null,purchasePrice:amount(input.purchasePrice),purchaseDate,notes:safeText(input.notes),entryPrice:amount(input.entryPrice),updatedAt:input.updatedAt||new Date().toISOString()};
}
export function validateCollection(value){
 if(value?.version!==1||!value.records||Array.isArray(value.records))throw Error('Unsupported collection backup.');
 const result=emptyCollection();
 for(const [key,record]of Object.entries(value.records)){
  if(!key||key.length>400||['__proto__','constructor','prototype'].includes(key))throw Error('Invalid collection identifier.');
  result.records[key]=normalizeRecord(record);
 }
 result.goals=Object.fromEntries(Object.entries(value.goals||{}).filter(([key,v])=>key.length<100&&['standard','master','first','shadowless','special'].includes(v)));
 result.revision=Number.isSafeInteger(value.revision)?value.revision:0;result.updatedAt=value.updatedAt||null;return result;
}
export function updateRecord(collection,key,input){
 if(!key||['__proto__','constructor','prototype'].includes(key))throw Error('Invalid card identifier.');
 return {...collection,revision:collection.revision+1,records:{...collection.records,[key]:normalizeRecord({...input,updatedAt:new Date().toISOString()})},updatedAt:new Date().toISOString()};
}
export const owned=(collection,card)=>{const r=collection.records[card.key];return (r?.quantity||0)>0&&(!r.printing||r.printing===(card.printing||'Unconfirmed'))&&(!r.edition||r.edition===(card.edition||'Unconfirmed'));};
export function goalCards(cards,goal='standard'){
 if(goal==='standard')return cards.filter(c=>c.primary!==false);
 if(goal==='master')return cards.filter(c=>c.primary!==false||(c.variantVerified&&['Standard','Unlimited'].includes(c.edition)&&['Normal','Holofoil','Reverse Holofoil'].includes(c.printing)));
 if(goal==='first')return cards.filter(c=>c.variantVerified&&c.edition==='First Edition');
 if(goal==='shadowless')return cards.filter(c=>c.variantVerified&&c.edition==='Shadowless');
 return cards.filter(c=>c.variantVerified&&!['Standard','Unlimited'].includes(c.edition));
}
export function completion(cards,collection,goal='standard'){
 const target=goalCards(cards,goal),missing=target.filter(c=>!owned(collection,c));
 const priced=missing.filter(c=>c.verifiedMatch&&!c.stale&&Number.isFinite(c.price)&&c.price>0);
 const cost=priced.reduce((sum,c)=>sum+c.price,0);
 return {total:target.length,owned:target.length-missing.length,missing:missing.length,percent:target.length?Math.round((target.length-missing.length)/target.length*100):0,cost:Math.round(cost*100)/100,priced:priced.length,unpriced:missing.length-priced.length,coverage:target.filter(c=>c.verifiedMatch&&!c.stale&&c.price>0).length};
}
export function rankSet(cards,collection,view='all'){
 let rows=cards.filter(c=>!['buy','wait','cheapest','expensive'].includes(view)||!owned(collection,c));
 if(view==='buy'||view==='wait')rows=rows.filter(c=>c.signal===view);
 const compare={buy:(a,b)=>(b.score??-1)-(a.score??-1),wait:(a,b)=>(b.score??-1)-(a.score??-1),declines:(a,b)=>(a.change30??Infinity)-(b.change30??Infinity),popular:(a,b)=>(b.hype??0)-(a.hype??0),cheapest:(a,b)=>(a.price??Infinity)-(b.price??Infinity),expensive:(a,b)=>(b.price??-1)-(a.price??-1)}[view];
 return rows.slice().sort(compare||((a,b)=>String(a.number).localeCompare(String(b.number),undefined,{numeric:true})||Number(b.primary!==false)-Number(a.primary!==false)||String(a.printing).localeCompare(String(b.printing))));
}
const columns=['key','name','set','number','baseId','printing','edition','status','quantity','condition','purchasePrice','purchaseDate','notes','entryPrice','updatedAt'];
const csvCell=v=>{const s=String(v??'');return '"'+(/^[=+@\-\t\r]/.test(s)?"'":'')+s.replace(/"/g,'""')+'"';};
export function exportCSV(collection,cards=[]){
 const index=new Map(cards.map(c=>[c.key,c]));
 return '\uFEFF'+[columns.join(','),...Object.entries(collection.records).map(([key,record])=>{const card=index.get(key)||{};return columns.map(col=>csvCell(col==='key'?key:record[col]??card[col]??'')).join(',');})].join('\r\n');
}
export function parseCSV(text){
 const lines=[];let row=[],part='',quote=false;
 text=String(text).replace(/^\uFEFF/,'');
 for(let i=0;i<text.length;i++){const ch=text[i];if(quote){if(ch==='"'&&text[i+1]==='"'){part+='"';i++;}else if(ch==='"')quote=false;else part+=ch;}else if(ch==='"')quote=true;else if(ch===','){row.push(part);part='';}else if(ch==='\n'){row.push(part.replace(/\r$/,''));lines.push(row);row=[];part='';}else part+=ch;}
 if(quote)throw Error('CSV contains an unclosed quote.');if(part||row.length){row.push(part.replace(/\r$/,''));lines.push(row);}return lines;
}
export function importCSV(text,collection){
 if(text.length>10_000_000)throw Error('Backup exceeds 10 MB.');
 const rows=parseCSV(text),header=rows.shift()||[];
 if(new Set(header).size!==header.length||!['key','quantity','status'].every(k=>header.includes(k)))throw Error('Use a PokéRadar collection CSV with key, status and quantity columns.');
 const records={...collection.records};let count=0;
 for(const row of rows){if(row.every(v=>!v.trim()))continue;if(row.length!==header.length)throw Error('CSV column count does not match its header.');const input=Object.fromEntries(header.map((k,i)=>[k,row[i].replace(/^'(?=[=+@\-\t\r])/,'')]));if(!input.key||input.key.length>400||['__proto__','constructor','prototype'].includes(input.key))throw Error('Invalid card key in CSV.');records[input.key]=normalizeRecord(input);count++;}
 return {collection:validateCollection({...collection,records,revision:collection.revision+1,updatedAt:new Date().toISOString()}),count};
}
