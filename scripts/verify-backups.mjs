import { readFile } from 'node:fs/promises';
import { revision } from '../server/data.mjs';

if (process.argv.length !== 4) throw new Error('Usage: npm run verify-backups -- before.json after.json');
async function readRows(file) {
  const snapshot = JSON.parse(await readFile(file,'utf8'));
  if (!Array.isArray(snapshot.rows)) throw new Error('Expected a full row export.');
  if (snapshot.rowCount !== undefined && snapshot.rowCount !== snapshot.rows.length) throw new Error('Row count mismatch.');
  if (snapshot.sha256 !== undefined && snapshot.sha256 !== revision(snapshot.rows)) throw new Error('Snapshot checksum mismatch.');
  const rows = new Map();
  for (const row of snapshot.rows) {
    if (row.id == null || rows.has(String(row.id))) throw new Error('Missing or duplicate IDs in export.');
    rows.set(String(row.id),row);
  }
  return rows;
}
const [before,after] = await Promise.all(process.argv.slice(2).map(readRows));
let missing = 0, changed = 0;
for (const [id,row] of before) {
  if (!after.has(id)) missing++;
  else if (revision(row) !== revision(after.get(id))) changed++;
}
const added = [...after.keys()].filter(id => !before.has(id)).length;
const identical = !missing && !changed && !added;
console.log(JSON.stringify({before:before.size,after:after.size,missing,changed,added,identical}));
if (!identical) process.exitCode=1;
