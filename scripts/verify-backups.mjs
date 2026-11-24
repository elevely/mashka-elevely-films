import { readFile } from 'node:fs/promises';
import { revision } from '../server/data.mjs';
if(process.argv.length!==4)throw new Error('Usage: npm run verify-backups -- before.json after.json');
const [before,after]=await Promise.all(process.argv.slice(2).map(async p=>JSON.parse(await readFile(p,'utf8'))));
if(!Array.isArray(before.rows)||!Array.isArray(after.rows))throw new Error('Both inputs must be full row exports.');
const keyed=rows=>new Map(rows.map(row=>[String(row.id),row]));
const a=keyed(before.rows),b=keyed(after.rows);
if(a.size!==before.rows.length||b.size!==after.rows.length)throw new Error('Duplicate IDs in export.');
let missing=0,changed=0;for(const [id,row] of a){if(!b.has(id))missing++;else if(revision(row)!==revision(b.get(id)))changed++;}
const added=[...b.keys()].filter(id=>!a.has(id)).length;
console.log(JSON.stringify({before:a.size,after:b.size,missing,changed,added,identical:!missing&&!changed&&!added}));
if(missing||changed||added)process.exitCode=1;
