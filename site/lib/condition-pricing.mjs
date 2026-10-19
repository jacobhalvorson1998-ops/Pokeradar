/* NM/LP is a data boundary, never a discount applied to an aggregate quote. */
import {disagreement,validateObservation} from './price-source.mjs';
export const CONDITIONS=['NM','LP'];
export const CONDITION_GUIDE='https://help.tcgplayer.com/hc/en-us/articles/221430307-Card-Condition-Guide';
const norm=v=>String(v??'').normalize('NFKD').toLowerCase().replace(/[^a-z0-9♀♂]/g,'');
const number=v=>String(v??'').toUpperCase().replace(/\s/g,'').replace(/(^|\/)([A-Z]*)0+(?=\d)/g,'$1$2');
const age=(date,asOf)=>(Date.parse(asOf+'T00:00:00Z')-Date.parse(date+'T00:00:00Z'))/86400000;
export function exactObservation(card,o,condition){
 return card.variantVerified===true&&!card.priceIdentityAmbiguous&&o?.verifiedIdentity===true&&o.quality==='verified'&&o.language==='en'&&o.condition===condition&&o.cardId===(card.baseId||card.id)&&o.setId===card.setId&&norm(o.setName)===norm(card.set)&&norm(o.cardName)===norm(card.name)&&number(o.collectorNumber)===number(card.number)&&o.printing===card.printing&&o.edition===card.edition;
}
export function conditionQuote(card,observations,condition,{asOf=new Date().toISOString().slice(0,10),threshold=20,sourcePreference=[],validationAsOf=asOf}={}){
 if(!CONDITIONS.includes(condition))throw Error('Select NM or LP');
 const accepted=[];for(const raw of observations||[])try{const o=validateObservation(raw,{asOf:validationAsOf});if(o.observedDate<=asOf&&exactObservation(card,o,condition)&&['market_estimate','sales_average'].includes(o.metricType))accepted.push(o);}catch{}
 const groups=new Map();for(const o of accepted){const k=o.source+'|'+o.metricType;if(!groups.has(k)||groups.get(k).observedDate<o.observedDate)groups.set(k,o);}
 const sources=[...groups.values()].sort((a,b)=>b.observedDate.localeCompare(a.observedDate)||((sourcePreference.indexOf(a.source)+1||999)-(sourcePreference.indexOf(b.source)+1||999))||a.source.localeCompare(b.source)||a.metricType.localeCompare(b.metricType));
 const conflict=disagreement(sources,{threshold});
 const reference=sources[0]||null,stale=reference?age(reference.observedDate,asOf)>4:false;
 return {condition,price:reference?.price??null,asOf:reference?.observedDate??null,source:reference?.source??null,metricType:reference?.metricType??null,reference,sources,stale,verified:!!reference&&!stale&&conflict.status!=='conflict',conflict,status:conflict.status==='conflict'?'Price Needs Review':reference?stale?'Stale saved price':'Verified '+condition:condition+' Price Unavailable',method:'Most recent observation; ties use configured source preference then source name. Sources are never averaged or selected by highest price.'};
}
export function conditionHistory(card,observations,quote,{asOf=new Date().toISOString().slice(0,10),validationAsOf=asOf}={}){
 if(!quote.reference)return [];
 const map=new Map();for(const raw of observations||[])try{const o=validateObservation(raw,{asOf:validationAsOf});if(o.observedDate<=asOf&&exactObservation(card,o,quote.condition)&&o.source===quote.source&&o.metricType===quote.metricType)map.set(o.observedDate,o.price);}catch{}
 return [...map].sort((a,b)=>a[0].localeCompare(b[0]));
}
export function printingLabel(card){
 const first=/^First Edition/.test(card.edition||''),shadow=card.edition==='Shadowless'||card.subtype==='shadowless';
 const foil=!card.printing?'Foil unconfirmed':/reverse/i.test(card.printing||'')?'Reverse Holo':/holo/i.test(card.printing||'')?'Holo':'Non-holo';
 return `${first?'First Edition'+(shadow?' Shadowless':''):shadow?'Unlimited Shadowless':card.edition==='Unlimited'?'Unlimited':card.edition||'Unconfirmed'} · ${foil}`;
}
