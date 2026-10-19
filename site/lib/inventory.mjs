import {parseCSV} from './collection.mjs';
export const emptyInventory=()=>({version:1,revision:0,lots:[],decisions:[],manualComps:[]});
const amount=(v,label)=>{const n=Number(v);if(!Number.isFinite(n)||n<0||n>1e9)throw Error('Invalid '+label);return Math.round(n*100)/100;};
const text=(v,max=400)=>String(v??'').slice(0,max);
const id=()=>globalThis.crypto.randomUUID();
function validateLot(l){
 if(!l.id||!l.cardKey||!l.printing||!l.edition||!['NM','LP','MP','HP','DM'].includes(l.condition))throw Error('Exact inventory identity and condition required');
 const quantity=Number(l.quantity),sold=Number(l.sold||0);if(!Number.isInteger(quantity)||quantity<1||quantity>100000||!Number.isInteger(sold)||sold<0||sold>quantity)throw Error('Invalid inventory quantities');
 return {id:text(l.id),cardKey:text(l.cardKey),name:text(l.name),set:text(l.set),printing:text(l.printing),edition:text(l.edition),condition:l.condition,quantity,sold,unitCost:amount(l.unitCost,'cost basis'),proceeds:amount(l.proceeds||0,'proceeds'),lot:text(l.lot||'Show inventory'),date:text(l.date,30),cash:amount(l.cash||0,'cash'),tradeCredit:amount(l.tradeCredit||0,'trade credit'),tradeCostFactor:amount(l.tradeCostFactor??1,'trade cost factor')};
}
export function validateInventory(value){
 if(value?.version!==1||!Array.isArray(value.lots)||!Array.isArray(value.decisions))throw Error('Unsupported vendor backup');
 const lots=value.lots.map(validateLot);if(new Set(lots.map(l=>l.id)).size!==lots.length)throw Error('Duplicate inventory lot identifier');
 return {version:1,revision:Number.isSafeInteger(value.revision)?value.revision:0,lots,manualComps:(value.manualComps||[]).slice(-200).map(validateManualComp),decisions:value.decisions.map(d=>({id:text(d.id),cardKey:text(d.cardKey),action:['purchase','decline'].includes(d.action)?d.action:'decline',date:text(d.date,30),price:amount(d.price||0,'decision price'),condition:['NM','LP','MP','HP','DM'].includes(d.condition)?d.condition:'NM'}))};
}
export function recordDecision(inventory,card,input){
 const next=validateInventory(inventory),quantity=Number(input.quantity??1),cash=amount(input.cash??0,'cash'),tradeCredit=amount(input.tradeCredit??0,'trade credit'),tradeCostFactor=amount(input.tradeCostFactor??1,'trade cost factor');
 if(tradeCostFactor<=0||tradeCostFactor>5)throw Error('Trade cost factor must be between 0 and 5');
 const date=new Date().toISOString();next.decisions.push({id:id(),cardKey:card.key,action:input.action,date,price:cash+tradeCredit*tradeCostFactor,condition:input.condition});
 if(input.action==='purchase')next.lots.push(validateLot({id:id(),cardKey:card.key,name:card.name,set:card.set,printing:card.printing,edition:card.edition,condition:input.condition,quantity,unitCost:(cash+tradeCredit*tradeCostFactor)/quantity,cash,tradeCredit,tradeCostFactor,lot:input.lot,date,sold:0,proceeds:0}));
 next.revision++;return validateInventory(next);
}
export function sellLot(inventory,lotId,{quantity,netProceeds}){
 const next=validateInventory(inventory),lot=next.lots.find(l=>l.id===lotId);if(!lot)throw Error('Inventory lot not found');
 if(!Number.isInteger(quantity)||quantity<1||quantity>lot.quantity-lot.sold)throw Error('Sale exceeds available quantity');
 lot.sold+=quantity;lot.proceeds=amount(lot.proceeds+amount(netProceeds,'sale proceeds'),'proceeds');next.revision++;return next;
}
export function bundleOffer(items){
 if(!items.length||items.some(i=>!i.offer?.available||!Number.isInteger(i.quantity)||i.quantity<1))return {available:false,totalMax:null};
 return {available:true,totalMax:Math.floor(items.reduce((n,i)=>n+i.offer.maximum*i.quantity,0)*100)/100};
}
const columns=['id','cardKey','name','set','printing','edition','condition','quantity','sold','unitCost','proceeds','lot','date','cash','tradeCredit','tradeCostFactor'];
const cell=v=>'"'+String(v??'').replace(/^[=+@\-\t\r]/,"'$&").replace(/"/g,'""')+'"';
export function inventoryCSV(inventory){return '\uFEFF'+[columns.join(','),...validateInventory(inventory).lots.map(l=>columns.map(k=>cell(l[k])).join(','))].join('\r\n');}
export function importInventoryCSV(text,inventory){
 const [head,...rows]=parseCSV(text);if(!columns.every(c=>head.includes(c))||new Set(head).size!==head.length)throw Error('Use a PokéRadar inventory CSV');
 const imported=rows.filter(r=>r.some(Boolean)).map(row=>{if(row.length!==head.length)throw Error('Invalid CSV row');return validateLot(Object.fromEntries(head.map((k,i)=>[k,row[i].replace(/^'(?=[=+@\-\t\r])/,'')])));});
 const next=validateInventory(inventory),lots=new Map(next.lots.map(l=>[l.id,l]));for(const l of imported)lots.set(l.id,l);return validateInventory({...next,lots:[...lots.values()],revision:next.revision+1});
}

function validateManualComp(c){
 if(c?.manual!==true||c.language!=='en'||!c.cardId||!c.cardKey||!c.setId||!c.number||!c.printing||!c.edition||!['NM','LP','MP','HP','DM'].includes(c.condition)||!c.notes?.trim())throw Error('Exact manual comp identity, condition and source required');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(c.observedDate||'')||!Number.isFinite(Date.parse(c.observedDate))||new Date(c.observedDate).toISOString().slice(0,10)!==c.observedDate||c.observedDate>new Date().toISOString().slice(0,10))throw Error('Invalid manual comp date');
 const price=amount(c.price,'manual comp');if(price<=0)throw Error('Positive manual comp required');
 return {manual:true,language:'en',source:'Manual',verified:false,cardId:text(c.cardId),cardKey:text(c.cardKey),setId:text(c.setId),number:text(c.number),printing:text(c.printing),edition:text(c.edition),condition:c.condition,price,observedDate:c.observedDate,notes:text(c.notes,300),savedAt:text(c.savedAt,40)};
}
export function cachedManualComp(inventory,card,condition){return (inventory.manualComps||[]).find(c=>c.cardId===(card.baseId||card.id)&&c.cardKey===card.key&&c.setId===card.setId&&c.number===card.number&&c.printing===card.printing&&c.edition===card.edition&&c.condition===condition)||null;}
export function saveManualComp(inventory,card,input){
 if(!input.identityConfirmed||!input.conditionConfirmed||!(card.variantVerified||card.verifiedMatch)||!card.printing||card.printing==='Unconfirmed'||!card.edition||card.edition==='Unconfirmed')throw Error('Confirm the printing and inspected condition before saving a manual comp');
 const next=validateInventory(inventory),comp=validateManualComp({...input,manual:true,language:'en',cardId:card.baseId||card.id,cardKey:card.key,setId:card.setId,number:card.number,printing:card.printing,edition:card.edition,savedAt:new Date().toISOString()});
 const old=cachedManualComp(next,card,input.condition);next.manualComps=next.manualComps.filter(c=>c!==old);next.manualComps.push(comp);next.revision++;return validateInventory(next);
}
