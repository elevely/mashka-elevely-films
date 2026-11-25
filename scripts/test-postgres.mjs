// Only disposable, explicitly named databases. Never reads the application's .env.
import {readFile} from 'node:fs/promises';
import {execFileSync,spawn} from 'node:child_process';
if (!/^films_test(?:_[a-z0-9_]+)?$/.test(process.env.PGDATABASE || '')) throw new Error('PGDATABASE must name a disposable films_test database.');
const fixture=await readFile(new URL('../tests/owners-postgres.sql',import.meta.url),'utf8');
const migration=(await readFile(new URL('../docs/owner-writes.sql',import.meta.url),'utf8'))
  .replaceAll('REPLACE_ELEVELY_UUID','11111111-1111-4111-8111-111111111111')
  .replaceAll('REPLACE_MASHKA_UUID','22222222-2222-4222-8222-222222222222');
execFileSync('psql',['-X','-v','ON_ERROR_STOP=1'],{input:fixture.replace('-- INSTALL_OWNER_GUARDS',()=>migration),stdio:['pipe','inherit','inherit']});

async function sql(input) {
  return new Promise((resolve,reject)=>{
    let output='';const child=spawn('psql',['-X','-qAt','-v','ON_ERROR_STOP=1']);
    child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);
    child.on('error',reject);child.on('close',code=>resolve({code,output}));child.stdin.end(input);
  });
}
const start="begin;set local role authenticated;select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);";
const first=sql(start+`insert into public.movies(id,movie_data,user_ratings) values(6001,'{"nameRu":"Concurrent fixture","year":2026}','[8,8,8,8,8]');select pg_sleep(0.3);commit;`);
await new Promise(resolve=>setTimeout(resolve,50));
const second=sql(start+`insert into public.movies(id,movie_data,user_ratings) values(6002,'{"nameRu":"Concurrent fixture","year":2026}','[8,8,8,8,8]');commit;`);
const inserts=await Promise.all([first,second]);
if(inserts.filter(r=>r.code===0).length!==1 || !inserts.some(r=>r.output.includes('Film already exists')))throw new Error('Concurrent duplicate guard failed');
const previous=execFileSync('psql',['-X','-qAt','-c','select to_jsonb(m) from public.movies m where id=202'],{encoding:'utf8'}).trim();
const update = note => start+`select count(*) from public.films_update_review(202,$expected$${previous}$expected$::jsonb,'{"user_notes":"${note}"}');select pg_sleep(0.3);commit;`;
const edits=await Promise.all([sql(update('first concurrent note')),sql(update('second concurrent note'))]);
const counts=edits.map(r=>r.output.split('\n').filter(line=>/^[01]$/.test(line))).flat().sort();
if(edits.some(r=>r.code!==0) || counts.join(',')!=='0,1')throw new Error('Concurrent review CAS failed');
console.log('Real concurrent PostgreSQL checks passed: one duplicate insert denied, one stale review denied.');
