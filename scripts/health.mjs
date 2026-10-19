export const GATE_LABELS=Object.freeze({matched:'Provider product matched',fresh:'Recent nonzero quote',identity:'Exact English printing / eligible raw condition',history:'90-day usable history',peers:'Suitable same-set peers',correction:'Correction and discount',relativeValue:'Relative underperformance',stabilization:'7/14-day stabilization',setMarket:'No broad set decline',evidence:'Evidence threshold'});
export const FAILURE_LABELS=Object.freeze({...GATE_LABELS,unmatched:'No verified API product match',quote:'Matched, but no usable quote',variant:'Printing or edition unverified / ambiguous',condition:'Unsuitable source condition'});
export function catalogHealth(rows,{asOf,buyThreshold}={}){
 const signals={buy:0,wait:0,watch:0,pending:0},primaryFailures={},nonexclusiveFailures={};let survivors=rows;
 const funnel=[{gate:'all',label:'All printing records',count:rows.length}];
 for(const [gate,label]of Object.entries(GATE_LABELS)){survivors=survivors.filter(row=>row.gates[gate]);funnel.push({gate,label,count:survivors.length});nonexclusiveFailures[gate]=rows.filter(row=>!row.gates[gate]).length;}
 for(const row of rows){signals[row.signal]++;if(row.primaryFailure)primaryFailures[row.primaryFailure]=(primaryFailures[row.primaryFailure]||0)+1;}
 const nearest=rows.filter(c=>c.investigate).sort((a,b)=>b.nearRank-a.nearRank||a.key.localeCompare(b.key)).slice(0,30).map(c=>({key:c.key,id:c.id,name:c.name,set:c.set,printing:c.printing,edition:c.edition,signal:c.signal,evidenceScore:c.evidenceScore,confidence:c.confidence,failures:c.failureReasons,rank:c.nearRank}));
 return {version:1,asOf,buyThreshold,signals,funnel,primaryFailures,nonexclusiveFailures,investigate:rows.filter(c=>c.investigate).length,nearest,labels:FAILURE_LABELS,notes:['Failure counts overlap; the funnel is sequential. Primary reasons are mutually exclusive.', 'Worth Investigating is a lower-confidence research tier. It never overrides a failed Buy gate.', 'Raw printing market averages are not condition-matched listing offers.']};
}

export function marketHealth(rows,{asOf}={}){
 const labels={matched:'Provider product matched',identity:'Exact English product, printing and edition',fresh:'Recent nonzero quote',history:'90-day usable history',value:'Own-history or suitable-peer value',stabilization:'Short-term stabilization / downside checks',setMarket:'Supported set trend / no sharp decline',evidence:'At least 70 points of historical evidence'};
 let survivors=rows;const funnel=[{gate:'all',label:'All printing records',count:rows.length}],nonexclusiveFailures={};
 for(const [gate,label]of Object.entries(labels)){survivors=survivors.filter(r=>r.gates[gate]);funnel.push({gate,label,count:survivors.length});nonexclusiveFailures[gate]=rows.filter(r=>!r.gates[gate]).length;}
 const signals={buy:0,investigate:0,wait:0,watch:0,pending:0},primaryFailures={};for(const r of rows){signals[r.signal]++;if(r.primaryFailure)primaryFailures[r.primaryFailure]=(primaryFailures[r.primaryFailure]||0)+1;}
 return {version:2,asOf,signals,funnel,primaryFailures,nonexclusiveFailures,investigate:signals.investigate,labels:{...FAILURE_LABELS,...labels},notes:['Counts overlap; funnel counts are sequential. Both buying categories require verified history, value, stabilization and a supported set trend.','Missing peers do not hide prices or prevent own-history research. Missing liquidity earns zero points.']};
}
