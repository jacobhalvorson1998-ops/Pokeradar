/** Daily exact-printing batch quotes already extend saved history. Spend full
 * history requests on coverage gaps, with periodic rechecks for corrections. */
import {marketMetrics,dayString} from './opportunity.mjs';
const DAY=86400000;
export function shouldRefreshHistory(market,{asOf,startedAt,identityReview=false}={}){
 if(identityReview||market?.verifiedMatch!==true)return true;
 const checked=dayString(market.historyChecked),day=dayString(asOf);
 if(!checked||!day||checked>day||Date.parse(day)-Date.parse(checked)>=7*DAY)return true;
 const bulk=Date.parse(market.quoteCheckedAt),start=Date.parse(startedAt);
 if(market.quoteMethod!=='whole-set CSV; previously verified exact printing'||!Number.isFinite(start)||!Number.isFinite(bulk)||bulk<start||bulk>=Date.parse(day)+DAY)return true;
 const metrics=marketMetrics(market,{asOf:day});
 return metrics.stale||!metrics.historyEnough;
}
