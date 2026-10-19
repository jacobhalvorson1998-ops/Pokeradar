/** Aggregate printing research. Scores are evidence summaries, never probabilities. */
import {assessCatalog,collectorSignificance,agePriority,collectibleAge,median} from './opportunity.mjs';
export const AGGREGATE_MODEL='aggregate-opportunity-v1';
export const OPPORTUNITY_WEIGHTS=Object.freeze({value:35,downside:25,set:15,collector:15,liquidity:10});
export const OPPORTUNITY_POLICY=Object.freeze({strong:80,candidate:70,watch:55,minOwnDiscount:5,minHighCorrection:10,minPeerUnderperformance:5,historyDays:90,minObservations:28});
const clamp=v=>Math.max(0,Math.min(100,v));
const finite=Number.isFinite;
const round=v=>finite(v)?Number(v.toFixed(2)):null;
export function rankPreference(row,{ageWeight=25,significance='collectible'}={}){
 if(row.score===null)return {score:null,signal:row.signal};
 const age=significance==='age'?agePriority(row.year):collectibleAge(agePriority(row.year),collectorSignificance(row));
 return {score:round(row.score+(ageWeight-25)*age/100),signal:row.signal};
}
export function scoreMarketRows(rows,{strong=80,candidate=70,setTotals=null}={}){
 const groups=new Map();for(const r of rows){if(!groups.has(r.setId||r.set))groups.set(r.setId||r.set,[]);groups.get(r.setId||r.set).push(r);}
 const trends=new Map();for(const [key,group]of groups){const base=group.filter(r=>r.primary!==false),valid=base.filter(r=>r.verifiedMatch&&!r.stale&&r.historyEnough&&r.price>0),total=setTotals?.get(key)??base.length,small=total<10,required=small?3:10,coverage=valid.length/Math.max(1,total),supported=valid.length>=required&&coverage>=(small?.6:.3);trends.set(key,{count:valid.length,total,coverage:round(coverage*100),supported,change7:supported?round(median(valid.map(r=>r.change7))):null,change30:supported?round(median(valid.map(r=>r.change30))):null,change90:supported?round(median(valid.map(r=>r.change90))):null});}
 return rows.map(row=>{
  const setTrend=trends.get(row.setId||row.set),peerValue=row.peers.reliable?clamp(-row.peers.relative30/15*100):0,ownValue=finite(row.belowAverage90)?clamp(-row.belowAverage90/20*100):0;
  const stable=finite(row.change7)&&finite(row.change14)&&row.change7>=-3&&row.change7<=5&&row.change14>=-6&&row.change14<=8;
  const valueGate=row.drop90<=-10&&(row.belowAverage90<=-5||row.peers.reliable&&row.peers.relative30<=-5);
  const severe=row.change7< -10||row.change30< -25||setTrend.change30< -10&&setTrend.change30!==null;
  const falling=row.change7< -3||row.change14< -6||row.change30< -16&&row.change7<0||setTrend.change30!==null&&setTrend.change30< -7;
  // No sales counts are present in the existing feed. Do not award proxy liquidity.
  const components={value:round(Math.max(ownValue,peerValue)),downside:round(stable?clamp(100-Math.max(0,-row.change30-5)*2-Math.abs(row.change7)*2):clamp(35-Math.abs(row.change7||0)*2)),set:setTrend.supported?round(clamp(60+setTrend.change30*3)):0,collector:round(clamp(collectorSignificance(row)*.5+(finite(row.hype)?row.hype:0)*.3+agePriority(row.year)*.2)),liquidity:0};
  // Legacy assessCatalog removes baseQualityWarnings after assessment. Its warning
  // list differs only by an optional peer warning; all other checks remain hard.
  const qualityWarnings=(row.qualityWarnings||[]).filter(w=>!w.startsWith('Only '));
  const eligible=row.verifiedMatch&&!row.stale&&row.historyEnough&&qualityWarnings.length===0;
  const score=eligible?Math.round(Object.entries(OPPORTUNITY_WEIGHTS).reduce((sum,[k,w])=>sum+components[k]*w/100,0)):null;
  const buyEligible=eligible&&valueGate&&stable&&!falling&&!severe&&setTrend.supported;
  let signal='pending',reason=qualityWarnings[0]||'Verified identity and 90 days of usable history are required.';
  if(eligible){if(severe||falling){signal='wait';reason='The card or supported set market is declining; wait for stabilization.';}else if(buyEligible&&score>=strong){signal='buy';reason='Meaningful historical value, short-term stabilization and a supported set trend.';}else if(buyEligible&&score>=candidate){signal='investigate';reason='Historical value and stabilization support further buying research.';}else{signal='watch';reason=!setTrend.supported?'Card history is usable; broader set coverage is not yet sufficient.':!valueGate?'No meaningful historical or comparable-card discount yet.':!stable?'Value is visible; wait for steadier short-term prices.':'Historical evidence remains below the buying categories.';}}
  if(eligible&&valueGate&&!falling)reason+=` ${ownValue>=peerValue?'Below its own 90-day average by '+Math.abs(row.belowAverage90).toFixed(1)+'%.':'Underperformed suitable peers by '+Math.abs(row.peers.relative30).toFixed(1)+' points over 30 days.'}`;
  const gates={matched:row.gates.matched,identity:row.verifiedMatch,fresh:row.price>0&&!row.stale,history:row.historyEnough,value:valueGate,stabilization:stable&&!falling&&!severe,setMarket:setTrend.supported&&!falling&&!severe,evidence:finite(score)&&score>=candidate};
  const failures=Object.entries(gates).filter(([,pass])=>!pass).map(([k])=>k);
  let primaryFailure=failures[0]||null;if(!row.gates.matched)primaryFailure='unmatched';else if(row.priceIdentityAmbiguous||row.standardPrintingUnsupported)primaryFailure='variant';else if(!row.price)primaryFailure='quote';else if(!row.verifiedMatch)primaryFailure='identity';
  const confidence=!row.verifiedMatch?0:Math.min(85,35+(!row.stale?15:0)+(row.historyEnough?20:0)+(row.peers.reliable?10:0)+(setTrend.supported?5:0));
  return {...row,score,evidenceScore:score,components,signal,category:({buy:'Strong Opportunity',investigate:'Buy Candidate',watch:'Watch for Dip',wait:'Wait / Avoid',pending:'Insufficient Data'})[signal],gates,failureReasons:failures,primaryFailure,investigate:signal==='investigate',nearRank:signal==='investigate'?score:null,buyEligible,reason,risk:severe||falling?'Further declines can outweigh an apparent discount.':!setTrend.supported?'Set trend is unavailable; sales volume and executable listing prices are also unknown.':'Aggregate estimates can differ from actual inspected-condition sales; liquidity is unmeasured and fees can erase gains.',entryPrice:eligible?round(Math.min(row.price*.9,(row.average90||row.price)*.8)):null,confidence,confidenceLabel:confidence>=80?'Higher':confidence>=50?'Medium':'Low',setTrend,qualityWarnings,modelVersion:AGGREGATE_MODEL};
 });
}
export function assessMarketCatalog(cards,prices,options={}){return scoreMarketRows(assessCatalog(cards,prices,options));}
