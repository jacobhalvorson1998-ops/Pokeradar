/* Proposed 35/25/15/15/10 model. Research labels are not actionable offers. */
import {marketMetrics,median} from './opportunity.mjs';
export const PROPOSED_WEIGHTS={value:35,downside:25,set:15,collector:15,liquidity:10};
const clamp=(v,min=0,max=1)=>Math.min(max,Math.max(min,v));
const valid=n=>typeof n==='number'&&Number.isFinite(n);
export function scoreCondition({card,quote,history=[],peers=[],setTrend=null,liquidity=null,asOf}){
 const m=marketMetrics({price:quote.price,asOf:quote.asOf,history},{asOf});
 const unavailable=reason=>({category:'Insufficient Data',score:null,confidence:0,entryPrice:null,reason,risk:reason,condition:quote.condition,change7:null,change30:null,change90:null,setTrend:null,experimental:true});
 if(!quote.verified)return unavailable(quote.status);
 if(!m.historyEnough)return unavailable('Need at least 90 days and 28 actual observations for this exact condition, provider and printing.');
 const suitable=peers.filter(p=>p.key!==card.key&&(p.baseId||p.id)!==(card.baseId||card.id)&&p.setId===card.setId&&p.printing===card.printing&&p.edition===card.edition&&p.rarity===card.rarity&&p.quote?.condition===quote.condition&&p.quote?.verified&&p.quote.source===quote.source&&p.quote.metricType===quote.metricType&&p.quote.price>=quote.price/4&&p.quote.price<=quote.price*4&&p.metrics?.historyEnough);
 const peer30=median(suitable.map(p=>p.metrics.change30)),relative=valid(peer30)?m.change30-peer30:null;
 // Either personal-history discount OR suitable peer-relative value can qualify.
 const ownValue=clamp(-m.belowAverage90/20),peerValue=suitable.length>=3?clamp(-relative/15):null;
 const value=Math.max(ownValue,peerValue??0),stable=valid(m.change7)&&m.change7>=-3&&m.change7<=5;
 const downside=stable?clamp(1-Math.max(0,-m.change30-5)/30):clamp(.35-Math.abs(m.change7||0)/50);
 const set=valid(setTrend)?clamp(.6+setTrend/25):0;
 const vintage=(card.year||9999)<=2012,collectible=/holo|gold|shining|crystal|ex|lv.x/i.test(card.rarity||'')||/First Edition|Shadowless/.test(card.edition||'');
 const collector=clamp((card.hype||0)/100*.6+(vintage&&collectible?.4:0));
 const liquid=valid(liquidity)?clamp(liquidity):0;
 const score=Math.round(35*value+25*downside+15*set+15*collector+10*liquid);
 const severe=valid(setTrend)&&setTrend< -10||m.change7< -10||m.change30< -25;
 const category=severe?'Wait / Avoid':score>=80?'Strong Opportunity':score>=70?'Buy Candidate':score>=55?'Watch for Dip':'Wait / Avoid';
 const entryPrice=Math.floor(Math.min(quote.price*.8,m.average90*.8)*100)/100;
 return {category,score,confidence:Math.min(85,55+(suitable.length>=3?15:0)+(valid(setTrend)?10:0)+(valid(liquidity)?5:0)),entryPrice,reason:value>0?`${ownValue>=(peerValue??0)?'Below its own 90-day average':'Underperformed suitable condition-matched peers'}; ${stable?'short-term stabilization':'stabilization remains uncertain'}.`:'No meaningful verified discount.',risk:severe?'Declining card or set market.':!valid(setTrend)?'Condition-specific set trend unavailable.':!valid(liquidity)?'Sales and liquidity evidence unavailable.':'Historical patterns can fail.',condition:quote.condition,change7:m.change7,change30:m.change30,change90:m.change90,setTrend,historicalRelative:m.belowAverage90,peerRelative:relative,peerCount:suitable.length,experimental:true,weights:PROPOSED_WEIGHTS};
}
