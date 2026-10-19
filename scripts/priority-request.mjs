/* Only repository-authorized workflow_dispatch may invoke this; no public endpoint. */
import fs from 'node:fs';
import {atomicWriteJSON} from './provider.mjs';
export function validatePriorityRequest(cards,{cardKey='',setId='',previous=null,now=Date.now()}={}){
 if(!!cardKey===!!setId)throw Error('Supply exactly one exact card key or set ID.');
 if(cardKey.length>500||setId.length>100)throw Error('Priority input too long');
 if(previous?.requestedAt&&now-Date.parse(previous.requestedAt)<3600000)throw Error('Priority refresh is limited to one request per hour.');
 const matches=cards.filter(c=>cardKey?c.key===cardKey:c.setId===setId);
 if(!matches.length||matches.length>5000)throw Error('Unknown card/set or request exceeds 5,000 printing records.');
 return {keys:[...new Set(matches.map(c=>c.key))],requestedAt:new Date(now).toISOString(),cardKey:cardKey||null,setId:setId||null,note:'Refresh verified aggregate prices and exact printing histories.'};
}
if(process.argv[1]?.endsWith('/priority-request.mjs')){
 const cardKey=(process.env.PRIORITY_CARD||'').trim(),setId=(process.env.PRIORITY_SET||'').trim();if(cardKey||setId){
 const cards=JSON.parse(fs.readFileSync('site/catalog.json')).cards;
 let previous=null;try{previous=JSON.parse(fs.readFileSync('data/priority_refresh.json'));}catch{}
 const request=validatePriorityRequest(cards,{cardKey,setId,previous});atomicWriteJSON('data/priority_keys.json',request.keys);atomicWriteJSON('data/priority_refresh.json',request);console.log('Accepted bounded priority refresh for '+request.keys.length+' exact printing records.');
 }
}
