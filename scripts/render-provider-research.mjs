import fs from 'node:fs';
import path from 'node:path';
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const inline=s=>escape(s).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/`([^`]+)`/g,'<code>$1</code>');
export function renderProviderResearch(root){
 const source=path.join(root,'PROVIDER_RESEARCH.md');if(!fs.existsSync(source))return;
 const blocks=fs.readFileSync(source,'utf8').trim().split(/\n\n+/).map(block=>{
  if(block.startsWith('|')){const rows=block.split('\n').filter(row=>!/^\|[\s:|-]+\|$/.test(row));return '<div class="scroll"><table>'+rows.map((row,i)=>'<tr>'+row.slice(1,-1).split('|').map(cell=>`<${i?'td':'th'}>${inline(cell.trim())}</${i?'td':'th'}>`).join('')+'</tr>').join('')+'</table></div>';}
  if(block.startsWith('#')){const match=block.match(/^(#{1,3}) (.*)$/);if(match)return `<h${match[1].length}>${inline(match[2])}</h${match[1].length}>`;}
  if(block.startsWith('- https://'))return '<ul>'+block.split('\n').map(line=>{const url=line.slice(2);return `<li><a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(url)}</a></li>`;}).join('')+'</ul>';
  return '<p>'+inline(block)+'</p>';
 }).join('\n');
 fs.writeFileSync(path.join(root,'site/provider-research.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PokéRadar · Provider coverage and rights</title><style>body{font:15px/1.7 system-ui;background:#081713;color:#e3f3e8;max-width:1000px;margin:auto;padding:24px}a{color:#b4f1b5}h1,h2{line-height:1.3}p,td{overflow-wrap:anywhere}table{border-collapse:collapse;min-width:700px;font-size:13px}th,td{padding:15px;border:1px solid #355547;text-align:left;vertical-align:top}.scroll{overflow-x:auto}code{font-size:12px;color:#c7edb4}li{margin:8px 0}.status{padding:16px;background:#242414;border:1px solid #75623b;border-radius:12px}</style><a href="./#vendor">← PokéRadar Vendor</a><p class="status"><strong>Manual comps only.</strong> Provider-fed resale pricing and supplemental history remain disabled. No commercial subscription or service registration has been changed.</p>${blocks}</html>`);
}
