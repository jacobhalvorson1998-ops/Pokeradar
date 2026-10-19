import {cleanHistory,historicalReference,median,dayString} from './opportunity.mjs';
const DAY=86400000,round=x=>Number.isFinite(x)?Number(x.toFixed(1)):null;
const at=(asOf,days)=>new Date(Date.parse(asOf+'T00:00:00Z')-days*DAY).toISOString().slice(0,10);
export const isChase=c=>!['Common','Uncommon','Regular Rare','Energy','Unclassified','Standard','Other'].includes(c.rarity)&&!!c.rarity;
function cohortPulse(cards,prices,asOf,{minSamples=10,minCoverage=.3}={}){
 const total=cards.length,small=total<10,required=small?Math.max(3,Math.ceil(total*.6)):minSamples,coverageRequired=small?.6:minCoverage;
 const histories=new Map(cards.map(c=>[c.key,cleanHistory(prices[c.key]?.history,asOf)]));
 const current=cards.filter(c=>c.verifiedMatch&&!c.stale&&c.price>0&&historicalReference(histories.get(c.key),asOf,4));
 const coverage=total?current.length/total:0,windows={};
 for(const days of [7,30,90]){
  const target=at(asOf,days),cohort=current.filter(c=>historicalReference(histories.get(c.key),target,3));
  const enough=coverage>=coverageRequired&&cohort.length>=required;
  const value=enough?median(cohort.map(c=>{const h=histories.get(c.key);return (historicalReference(h,asOf,4)[1]/historicalReference(h,target,3)[1]-1)*100;})):null;
  windows[days]={change:round(value),trend:value===null?'insufficient':value>1?'up':value< -1?'down':'flat',samples:cohort.length,status:enough?'eligible':'insufficient',from:target};
 }
 // One fixed cohort must have a real observation at every sparkline date.
 const days=windows[90].status==='eligible'?90:30,offsets=Array.from({length:7},(_,i)=>Math.round(days*(6-i)/6));
 const sparkCohort=current.filter(c=>offsets.every(n=>historicalReference(histories.get(c.key),at(asOf,n),n===0?4:3)));
 const sparkline=coverage>=coverageRequired&&sparkCohort.length>=required?offsets.map(n=>[at(asOf,n),round(median(sparkCohort.map(c=>{const h=histories.get(c.key);return historicalReference(h,at(asOf,n),n===0?4:3)[1]/historicalReference(h,at(asOf,days),3)[1]*100;})))]):[];
 return {total,priced:current.length,coverage:round(coverage*100),required,coverageRequired:coverageRequired*100,smallSetRule:small,windows,sparkline,sparkSamples:sparkCohort.length};
}
export function buildMarketPulse(rows,prices,{asOf=new Date().toISOString().slice(0,10),minSamples=10,minCoverage=.3}={}){
 if(!dayString(asOf)||!Number.isInteger(minSamples)||minSamples<3||minCoverage<0||minCoverage>1)throw Error('Invalid pulse gates');
 const groups=new Map();
 // A basket contains one default exact printing per base card. Never sum editions.
 for(const row of rows)if(row.primary!==false){if(!groups.has(row.setId))groups.set(row.setId,[]);groups.get(row.setId).push(row);}
 return {version:1,asOf,method:'Median individual printing return on a fixed like-for-like endpoint cohort. One default printing per base card, no price totals. Each window has its own fixed cohort. Sparkline uses one cohort at every point; no interpolation.',gates:{minSamples,minCoverage:100*minCoverage,smallSets:'Fewer than 10 cards: at least 3 samples and 60% coverage, also at least 60% of cards sampled.'},sets:Object.fromEntries([...groups].map(([id,cards])=>[id,{all:cohortPulse(cards,prices,asOf,{minSamples,minCoverage}),chase:cohortPulse(cards.filter(isChase),prices,asOf,{minSamples,minCoverage})}]))};
}
