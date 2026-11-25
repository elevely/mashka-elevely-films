import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {revision} from '../server/data.mjs';
import {fixtures} from './fixtures.mjs';

test('private snapshot verification detects modifications, omissions and corrupt checksums',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'films-snapshot-test-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const rows=fixtures();
  const before=join(directory,'before.json'),after=join(directory,'after.json');
  const snapshot=rows=>JSON.stringify({rowCount:rows.length,sha256:revision(rows),rows});
  await writeFile(before,snapshot(rows));await writeFile(after,snapshot(structuredClone(rows)));
  const run=()=>spawnSync(process.execPath,['scripts/verify-backups.mjs',before,after],{encoding:'utf8'});
  assert.equal(run().status,0);assert.equal(JSON.parse(run().stdout).identical,true);
  const modified=structuredClone(rows);modified[0].user_ratings[0]=0;
  await writeFile(after,snapshot(modified));assert.equal(run().status,1);assert.equal(JSON.parse(run().stdout).changed,1);
  await writeFile(after,snapshot(rows.slice(1)));assert.equal(run().status,1);assert.equal(JSON.parse(run().stdout).missing,1);
  const corrupt=JSON.parse(snapshot(rows));corrupt.sha256='bad';await writeFile(after,JSON.stringify(corrupt));
  assert.equal(run().status,1);assert.match(run().stderr,/checksum/);
});
test('backup refuses public destinations before making any database request',()=>{
  const result=spawnSync(process.execPath,['scripts/backup.mjs','public/unsafe.json'],{encoding:'utf8',env:{...process.env,SUPABASE_BACKUP_KEY:''}});
  assert.equal(result.status,1);assert.match(result.stderr,/ignored backups/);
});
