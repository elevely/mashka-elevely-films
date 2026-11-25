import { mkdir, open, realpath, unlink } from 'node:fs/promises';
import { resolve, dirname, relative, sep, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServices } from '../server/supabase.mjs';
import { revision } from '../server/data.mjs';

const repo = resolve(fileURLToPath(new URL('..',import.meta.url)));
const defaultFile = 'movies-' + new Date().toISOString().replace(/[:.]/g,'-') + '.json';
const output = resolve(process.argv[2] || resolve(repo,'backups',defaultFile));
function checkDestination(directory) {
  const path = relative(repo,directory);
  const external = isAbsolute(path) || path === '..' || path.startsWith('..'+sep);
  if (!external && path !== 'backups' && !path.startsWith('backups'+sep)) {
    throw new Error('Inside the project, private exports must be saved under ignored backups/.');
  }
}
checkDestination(dirname(output));
if (!process.env.SUPABASE_BACKUP_KEY) {
  throw new Error('Supply an owner-authorized backup key with full SELECT access.');
}

const services = createServices({...process.env,SUPABASE_ANON_KEY:process.env.SUPABASE_BACKUP_KEY},fetch,{backupOnly:true});
const first = await services.list();
const sha256 = revision(first);
if (sha256 !== revision(await services.list())) {
  throw new Error('Collection changed during backup. Retry at a quiet time.');
}
await mkdir(dirname(output),{recursive:true,mode:0o700});
checkDestination(await realpath(dirname(output)));
const file = await open(output,'wx',0o600);
try {
  await file.writeFile(JSON.stringify({
    schemaVersion:1, exportedAt:new Date().toISOString(), rowCount:first.length, sha256, rows:first
  },null,2));
  await file.sync();
} catch(error) {
  await unlink(output);
  throw error;
} finally { await file.close(); }
console.log(JSON.stringify({file:output,rowCount:first.length,sha256}));
