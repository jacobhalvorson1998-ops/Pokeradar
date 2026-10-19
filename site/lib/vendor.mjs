/* Illustrative negotiation scenarios, not calibrated investment recommendations. */
import {sameIdentity,disagreement} from './price-source.mjs';
const signed=n=>Math.round(n*100)/100;
const finite=v=>typeof v==='number'&&Number.isFinite(v),money=n=>Math.floor(Math.max(0,n)*100+1e-7)/100;
const num=(v,name,min=0,max=1e7)=>{if(!finite(v)||v<min||v>max)throw Error('Invalid '+name);return v;};
export function trendBand({set30=null,card30=null}={}){
 const observed=[set30,card30].filter(finite),worst=observed.length?Math.min(...observed):null;
 return worst===null?{fraction:.6,stress:.1,band:'Unknown market',unknown:true}:worst< -20?{fraction:.55,stress:.15,band:'Sharp decline'}:worst<=-10?{fraction:.625,stress:.1,band:'Moderate decline'}:worst<=-5?{fraction:.7,stress:.05,band:'Mild decline'}:{fraction:.8,stress:0,band:'Stable / rising'};
}
export function calculateOffer(input){
 const {identity,reference,confirmed=false,conditionConfirmed=false,asOf=new Date().toISOString().slice(0,10)}=input;
 const blocked=reason=>({available:false,reason,maximum:null,opening:null,walkAway:null});
 if(!confirmed||!conditionConfirmed||!identity?.verified||!identity.cardId||!identity.printing||!identity.edition||identity.edition==='Unconfirmed'||identity.printing==='Unconfirmed'||!['NM','LP','MP','HP','DM'].includes(identity.condition)||identity.language!=='en')return blocked('Confirm the exact card, printing, edition and inspected condition. Verified printing identity is required.');
 if(!reference||!sameIdentity({...identity,metricType:reference.metricType,currency:'USD'},reference)||!finite(reference.price)||reference.price<=0||!reference.verifiedIdentity)return blocked('Use a condition-matched reference or a clearly labeled manual comp for this exact printing. Aggregate market prices cannot set an offer.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(reference.observedDate||'')||!Number.isFinite(Date.parse(reference.observedDate))||new Date(reference.observedDate).toISOString().slice(0,10)!==reference.observedDate)return blocked('Reference date is invalid.');
 const age=(Date.parse(asOf+'T00:00:00Z')-Date.parse(reference.observedDate+'T00:00:00Z'))/86400000;
 if(!finite(age)||age<0)return blocked('Reference date is invalid.');
 const sources=input.observations||[reference],conflict=disagreement(sources),band=trendBand(input);
 const quantity=num(input.quantity??1,'quantity',1,100000);if(!Number.isInteger(quantity))throw Error('Quantity must be a whole number');
 const fee=num(input.feePct??0,'fee percent',0,99)/100,shipping=num(input.shipping??0,'shipping'),handling=num(input.handling??0,'handling');
 const conditionRisk=num(input.conditionRiskPct??0,'condition uncertainty',0,100)/100,holding=num(input.holdingPct??0,'holding reserve',0,100)/100,target=num(input.targetProfit??0,'target profit');
 const conservative=input.scenario==='conservative';
 const trendShock=[input.set7,input.card7].some(v=>finite(v)&&v< -10)||[input.set90,input.card90].some(v=>finite(v)&&v< -25)?.05:0;
 const additionalRisk=trendShock+(input.liquidity==='unknown'?.025:input.liquidity==='thin'?.05:0)+(input.volatility==='high'?.05:input.volatility==='unknown'?.025:0)+(input.scarceVintage?.05:0)+(age>4?.1:0)+(conflict.status==='conflict'?.1:0);
 const fraction=Math.max(0,Math.min(1,(input.buyFraction===undefined?band.fraction:num(input.buyFraction,'buy fraction',0,1))-additionalRisk-(conservative?.05:0)));
 const stress=Math.min(.9,(input.declinePct===undefined?band.stress:num(input.declinePct,'further decline',0,100)/100)+additionalRisk+(conservative?.05:0));
 const stressedResale=reference.price*(1-stress)*(1-conditionRisk),net=stressedResale*(1-fee)-shipping-handling-reference.price*holding;
 const trendCap=reference.price*fraction,costCap=Math.max(0,net-target),maximum=money(Math.min(trendCap,costCap)),opening=money(maximum*.9);
 const tradeMultiplier=num(input.tradeMultiplier??1,'trade credit multiplier',.01,5),asked=num(input.asked??0,'asking price');
 return {available:true,buyNowAtThisPrice:asked>0&&asked<=maximum&&net-asked>=target&&age<=4&&conflict.status!=='conflict'&&!band.unknown,referenceType:reference.metricType==='manual_comp'?'MANUAL CONDITION COMP':reference.source+' · '+reference.condition,referencePrice:reference.price,asOf:reference.observedDate,stale:age>4,band:band.band,unknownMarket:!!band.unknown,buyFraction:fraction,stress,trendCap:money(trendCap),costCap:money(costCap),stressedResale:money(stressedResale),netResale:signed(net),maximum,opening,walkAway:maximum,netMargin:signed(net-maximum),marginAtAsked:Number((net-asked).toFixed(2)),breakEvenResale:money((maximum+shipping+handling+reference.price*holding)/(1-fee)),quantity,totalMax:money(maximum*quantity),tradeCreditMax:money(maximum/tradeMultiplier),tradeMultiplier,overMax:asked>maximum,conflict,notes:['Default bands are illustrative and need calibration; they are not guaranteed optimal.', 'Condition is already reflected in the reference; the condition reserve covers uncertainty only.', 'Cash value of trade credit equals credit multiplied by your entered redemption cost.']};
}
