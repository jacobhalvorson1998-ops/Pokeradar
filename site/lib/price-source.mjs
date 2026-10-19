/* Shared source boundary. Provider series and conditions never get spliced. */
const conditions=['NM','LP','MP','HP','DM'];
const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
export function validateObservation(raw,{asOf=new Date().toISOString().slice(0,10)}={}){
 const required=['cardId','printing','edition','language','source','metricType','observedDate','fetchedAt','termsUrl','provenance','coverageStart'];
 for(const key of required)if(typeof raw?.[key]!=='string'||!raw[key].trim())throw Error('Source observation missing '+key);
 if(raw.language!=='en'||!['market_estimate','sales_average','listing','asking','manual_comp'].includes(raw.metricType))throw Error('Unsupported language or price metric');
 if(raw.condition!==null&&!conditions.includes(raw.condition))throw Error('Condition must be explicit or null for aggregate market data');
 if(raw.verifiedIdentity!==true||!Number.isFinite(raw.price)||raw.price<=0||raw.currency!=='USD')throw Error('Verified exact identity and positive USD value required');
 if(!validDate(raw.observedDate)||!validDate(raw.coverageStart)||raw.observedDate>asOf||raw.coverageStart>raw.observedDate||!Number.isFinite(Date.parse(raw.fetchedAt))||Date.parse(raw.fetchedAt)>Date.parse(asOf+'T23:59:59.999Z'))throw Error('Invalid source observation dates');
 if(!/^https:\/\//.test(raw.termsUrl)||!['verified','manual'].includes(raw.quality))throw Error('Terms provenance and quality required');
 return {...raw,price:Math.round(raw.price*100)/100};
}
export const sameIdentity=(a,b)=>['cardId','printing','edition','language','condition','metricType','currency'].every(k=>a[k]===b[k]);
export function disagreement(observations,{threshold=15}={}){
 const groups=new Map();for(const o of observations){const key=JSON.stringify(['cardId','printing','edition','language','condition','metricType','currency','observedDate'].map(k=>o[k]));if(!groups.has(key))groups.set(key,[]);groups.get(key).push(o);}
 let max=0,sources=[];for(const group of groups.values())for(const a of group)for(const b of group)if(a.source!==b.source){const gap=Math.abs(a.price-b.price)/Math.min(a.price,b.price)*100;if(gap>max){max=gap;sources=[a.source,b.source];}}
 return {status:sources.length?max>=threshold?'conflict':'comparable':'not-comparable',percent:sources.length?Number(max.toFixed(1)):null,sources,threshold};
}
export function tickermintObservation(card,market){
 return validateObservation({cardId:card.baseId||card.id,printing:market.printing,edition:market.edition||card.edition||'Standard',language:market.language,source:'TickerMint',metricType:'market_estimate',condition:null,currency:'USD',price:market.price,observedDate:market.asOf,fetchedAt:market.quoteCheckedAt||market.verifiedAt||market.historyVerifiedAt,termsUrl:'https://tickermint.cards/terms',provenance:market.matchEvidence,coverageStart:'2024-02-08',quality:'verified',verifiedIdentity:market.verifiedMatch===true,url:market.tickermintUrl||null});
}
export class PriceSource {
 constructor({name,termsUrl,authorized=false,commercialApproved=false,coverageVerified=false}={}){this.name=name;this.termsUrl=termsUrl;this.authorized=authorized;this.commercialApproved=commercialApproved;this.coverageVerified=coverageVerified;}
 importSegment(input,{asOf,commercial=false}={}){
  if(!this.authorized||!this.coverageVerified||(commercial&&!this.commercialApproved))throw Error('Provider authorization, verified coverage and applicable licensing are required before import');
  if(!Array.isArray(input)||!input.length)throw Error('No source observations supplied');
  const observations=input.map(o=>validateObservation({...o,source:this.name,termsUrl:this.termsUrl},{asOf}));
  const first=observations[0];if(observations.some(o=>!sameIdentity(first,o)))throw Error('A historical segment must keep exact identity, condition and metric');
  const byDate=new Map();for(const o of observations){if(byDate.has(o.observedDate))throw Error('Duplicate source date');byDate.set(o.observedDate,o);}
  return {source:this.name,label:'Separate provider historical series',identity:{cardId:first.cardId,printing:first.printing,edition:first.edition,language:first.language,condition:first.condition,metricType:first.metricType},coverageStart:first.coverageStart,observations:[...byDate.values()].sort((a,b)=>a.observedDate.localeCompare(b.observedDate)),discontinuity:'Do not join to another provider or condition series.'};
 }
}
