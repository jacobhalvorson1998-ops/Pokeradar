/** Merge a reviewed checkpoint without changing newer current quotes or card identity. */
import {cleanHistory,dayString} from './opportunity.mjs';
const identity=m=>JSON.stringify([m?.productId,m?.printing,m?.edition??'Standard',m?.language]);
export function recoverPrices(current,incoming,cards,{asOf=new Date().toISOString().slice(0,10)}={}){
 const known=new Map(cards.map(c=>[c.key,c])),prices={...current},report={added:0,updated:0,historiesMerged:0,retainedNewer:0,rejected:[]};
 for(const [key,market]of Object.entries(incoming)){
  const c=known.get(key),previous=prices[key];
  const valid=c&&market.verifiedMatch===true&&(!market.matchStatus||['matched','verified'].includes(market.matchStatus))&&market.language==='en'&&Number.isSafeInteger(market.productId)&&market.productId>0&&market.printing===c.printing&&(market.edition===c.edition||!market.edition&&['Standard','Unlimited'].includes(c.edition))&&(!c.tcgplayerProductId||c.tcgplayerProductId===market.productId)&&!c.priceIdentityAmbiguous&&typeof market.matchEvidence==='string'&&market.matchEvidence.length>0&&typeof market.price==='number'&&Number.isFinite(market.price)&&market.price>0&&dayString(market.asOf)===market.asOf&&market.asOf<=asOf&&/^\d{4}-\d{2}-\d{2}$/.test(market.asOf);
  if(!valid){report.rejected.push({key,reason:'Checkpoint is not a verified exact current printing quote.'});continue;}
  if(previous&&identity(previous)!==identity(market)){report.rejected.push({key,reason:'Current and checkpoint product identities differ; requires review.'});continue;}
  if(!previous){prices[key]={...market,history:cleanHistory(market.history,asOf)};report.added++;continue;}
  const newer=(previous.asOf||'')>=(market.asOf||'');
  const latest=newer?previous:market;
  // On same-date observations current data wins; no series is truncated here.
  const history=cleanHistory([...(newer?market.history||[]:previous.history||[]),...(latest.history||[])],asOf);
  prices[key]={...latest,history};if(newer)report.retainedNewer++;else report.updated++;if(history.length>Math.max(previous.history?.length||0,market.history?.length||0))report.historiesMerged++;
 }
 return {prices,report};
}
