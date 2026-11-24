import { mkdir, open } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { createServices } from '../server/supabase.mjs';
import { revision } from '../server/data.mjs';
// Strictly GET-only. There is deliberately no restore/migration command.
// Use an owner-supplied backup credential only in this offline command.
if (!process.env.SUPABASE_BACKUP_KEY) throw new Error('Supply an owner-authorized backup key with full SELECT access.');
const services=createServices({ ...process.env, SUPABASE_ANON_KEY:process.env.SUPABASE_BACKUP_KEY });
const first=await services.list(),second=await services.list();
if(revision(first)!==revision(second))throw new Error('Collection changed during backup; retry at a quiet time. No backup written.');
const output=resolve(process.argv[2]||`backups/movies-${new Date().toISOString().replace(/[:.]/g,'-')}.json`);
await mkdir(dirname(output),{recursive:true,mode:0o700});
const file=await open(output,'wx',0o600);
try{await file.writeFile(JSON.stringify({schemaVersion:1,exportedAt:new Date().toISOString(),rowCount:first.length,sha256:revision(first),rows:first},null,2));}finally{await file.close();}
console.log(JSON.stringify({file:output,rowCount:first.length,sha256:revision(first)}));
