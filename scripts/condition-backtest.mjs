/* Chronological holdouts for the proposed condition-only model. No aggregate fallback. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {conditionQuote,conditionHistory} from '../site/lib/condition-pricing.mjs';
import {scoreCondition,PROPOSED_WEIGHTS} from './condition-model.mjs';
import {marketMetrics,median} from './opportunity.mjs';
const epoch=s=>Date.parse(s+'T00:00:00Z'),iso=n=>new Date(n).toISOString().slice(0,10),DAY=86400000;
export function evaluateConditions(cards,observations,{asOf=new Date().toISOString().slice(0,10)}={}){
 const baseTotals=new Map();for(const c of cards)if(c.primary!==false)baseTotals.set(c.setId,(baseTotals.get(c.setId)||0)+1);
 const bands=[{label:'80+',min:80,max:100},{label:'70–79',min:70,max:79},{label:'55–69',min:55,max:69}],results={};
 for(const condition of ['NM','LP']){
  const input=observations.filter(o=>o.condition===condition&&o.observedDate<=asOf),dates=[...new Set(input.map(o=>o.observedDate))].sort(),split=dates.length?iso(epoch(dates[0])+(epoch(dates.at(-1))-epoch(dates[0]))*.65):null;
  const output={condition,observations:input.length,split,bands:bands.map(b=>({...b,training:[],heldOut:[]})),eligibleDecisions:0};
  const byCard=new Map();for(const o of input){if(!byCard.has(o.cardId))byCard.set(o.cardId,[]);byCard.get(o.cardId).push(o);}
  const last=new Map();
  // Weekly decisions; never read an observation after the decision into features.
  for(let time=dates.length?epoch(dates[0])+93*DAY:Infinity;time<=Math.min(epoch(asOf),epoch(dates.at(-1)||asOf))-30*DAY;time+=7*DAY){
   const decision=iso(time),rows=cards.filter(c=>byCard.has(c.baseId||c.id)).map(card=>{const source=byCard.get(card.baseId||card.id),quote=conditionQuote(card,source,condition,{asOf:decision,validationAsOf:asOf}),history=conditionHistory(card,source,quote,{asOf:decision,validationAsOf:asOf});return {...card,quote,history,metrics:marketMetrics({price:quote.price,asOf:quote.asOf,history},{asOf:decision})};});
   for(const card of rows){if(!card.quote.verified||!card.metrics.historyEnough)continue;output.eligibleDecisions++;const cohort=rows.filter(c=>c.setId===card.setId&&c.quote.verified&&c.quote.source===card.quote.source&&c.quote.metricType===card.quote.metricType),setSamples=cohort.filter(c=>c.primary!==false&&c.metrics.historyEnough),setTrend=setSamples.length>=10&&setSamples.length/(baseTotals.get(card.setId)||Infinity)>=.3?median(setSamples.map(c=>c.metrics.change30)):null;
    const score=scoreCondition({card,quote:card.quote,history:card.history,peers:cohort,setTrend,asOf:decision});if(score.category==='Wait / Avoid'||score.category==='Insufficient Data')continue;
    const full=conditionHistory(card,byCard.get(card.baseId||card.id),card.quote,{asOf}),exit=full.find(([d])=>epoch(d)>=time+30*DAY);if(!exit||epoch(exit[0])>time+33*DAY)continue;
    const segment=exit[0]<split?'training':decision>=split?'heldOut':null;if(!segment)continue;
    const band=output.bands.find(b=>score.score>=b.min&&score.score<=b.max);if(!band)continue;
    const key=card.key+'|'+band.label+'|'+segment;if(time<(last.get(key)||0))continue;last.set(key,epoch(exit[0]));
    band[segment].push({key:card.key,date:decision,exit:exit[0],score:score.score,returnPct:Number(((exit[1]/card.quote.price-1)*100).toFixed(2))});
   }
  }
  for(const band of output.bands)for(const segment of ['training','heldOut']){const trades=band[segment];band[segment]={signals:trades.length,positive:trades.filter(t=>t.returnPct>0).length,medianReturn:median(trades.map(t=>t.returnPct)),worstReturn:trades.length?Math.min(...trades.map(t=>t.returnPct)):null,failures:trades.filter(t=>t.returnPct<=0).sort((a,b)=>a.returnPct-b.returnPct).slice(0,10)};}
  output.status=output.eligibleDecisions?'experimental; no production promotion':'blocked: no usable authorized condition history';results[condition]=output;
 }
 return {asOf,model:'condition-value-research-v1',weights:PROPOSED_WEIGHTS,productionApproved:false,results,method:'Weekly decisions, 93-day feature warmup, 30-day holds, 65/35 chronological split; training holds must mature before holdout; no overlapping holds per card/band/partition. Fixed proposed bands, no held-out retuning. One exact condition/provider/metric/printing per series.',limitations:['Aggregate printing histories cannot validate NM or LP.', 'Historical price changes exclude fees and executable offers.', 'Present-day identity matches and catalog introduce survivorship bias.', 'No weights or bands have been validated as optimal.']};
}
export function runConditionBacktest(root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')){
 const read=(f,fallback)=>{try{return JSON.parse(fs.readFileSync(path.join(root,f)));}catch{return fallback;}};
 const archive=read('data/supplemental_sources.json',{observations:[],approvedSources:[]}),report=evaluateConditions(read('site/catalog.json',{cards:[]}).cards,(archive.observations||[]).filter(o=>(archive.approvedSources||[]).includes(o.source)));
 fs.writeFileSync(path.join(root,'site/condition-evaluation.json'),JSON.stringify(report)+'\n');return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const r=runConditionBacktest();console.log(JSON.stringify({event:'condition-backtest',NM:r.results.NM.status,LP:r.results.LP.status,productionApproved:r.productionApproved}));}
