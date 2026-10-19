import {createHash} from 'node:crypto';
// Provider IDs (e.g. Unown ! and %3F) are opaque identities, not file paths.
// Reserve ~ for encoded IDs so no plain provider ID can collide with one.
export function detailFileId(id){
 if(typeof id!=='string'||!id.length)throw Error('Detail identity is required');
 return /^[A-Za-z0-9_.-]{1,180}$/.test(id)?id:'~'+createHash('sha256').update(id).digest('hex');
}
