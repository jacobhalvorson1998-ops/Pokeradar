export function printingLabel(card){
 const first=/^First Edition/.test(card.edition||''),shadow=card.edition==='Shadowless'||card.subtype==='shadowless';
 const foil=!card.printing?'Foil unconfirmed':/reverse/i.test(card.printing||'')?'Reverse Holo':/holo/i.test(card.printing||'')?'Holo':'Non-holo';
 return `${first?'First Edition'+(shadow?' Shadowless':''):shadow?'Unlimited Shadowless':card.edition==='Unlimited'?'Unlimited':card.edition||'Unconfirmed'} · ${foil}`;
}
