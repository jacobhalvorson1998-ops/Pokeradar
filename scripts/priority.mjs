// Personal lists are imported explicitly; private browser records are never uploaded automatically.
export function priorityOrder(cards,prices={},personalKeys=[]){
 const wanted=new Set(personalKeys);
 const rank=c=>[wanted.has(c.key)?0:1,prices[c.key]?.verifiedMatch&&prices[c.key]?.price>0?1:0,c.variantVerified?0:1,(c.hype||0)>=85?0:1,-(c.hype||0),c.year||9999];
 return cards.slice().sort((a,b)=>{const x=rank(a),y=rank(b);for(let i=0;i<x.length;i++)if(x[i]!==y[i])return x[i]-y[i];return a.key.localeCompare(b.key);});
}
