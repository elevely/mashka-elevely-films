import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRatings, statistics, selectMovies, safePoster, numeric } from '../public/lib/model.js';
import { mapRow, revision, newRow } from '../server/data.mjs';
import { createHandler } from '../server/handlers.mjs';
import { createServices } from '../server/supabase.mjs';
import { fixtures, memoryServices } from './fixtures.mjs';

const origin='http://localhost:4173';
async function call(kind,services,{method='GET',body,headers={},url=`/api/${kind}`}={}){
 if(body && typeof body==='object' && kind==='movies' && ['POST','PATCH','PUT'].includes(method) && body.viewer===undefined) body={...body,viewer:headers.cookie==='films_session=demo-mashka-session'?'mashka':'elevely'};
 const req={method,url,body,headers:{'content-type':'application/json',origin,cookie:'films_session=demo-session',...headers}};
 const res={headers:{},statusCode:200,setHeader(k,v){this.headers[k]=v;},end(value){this.body=JSON.parse(value);}};
 await createHandler(kind,services,{APP_ORIGIN:origin})(req,res);return res;
}
function addition(){return {id:1800000000000,movie:{nameRu:'New test film'},ratings:[9,8,7,6,5],note:'Note E',hasSpoilers:false};}

test('the historic weighted formula uses unrounded values for the common total',()=>{
 assert.deepEqual(calculateRatings([0,0,0,0,0],[10,10,10,10,10]),{userTotal:0,girlfriendTotal:100,finalRating:50});
 assert.deepEqual(calculateRatings([8,8,8,8,10],[8,8,8,8,10]),{userTotal:85,girlfriendTotal:85,finalRating:85});
 const row=fixtures()[0],view=mapRow(row);assert.equal(view.finalRating,row.final_rating);assert.equal(view.userTotal,row.user_total);assert.deepEqual(view.userRatings,row.user_ratings);
});
test('statistics exclude missing ratings and handle an empty collection',()=>{
 assert.equal(numeric(null),null);assert.equal(numeric(''),null);assert.equal(numeric(0),0);
 assert.equal(statistics([]).averageGap,null);
 const stats=statistics([{userTotal:null,girlfriendTotal:80,finalRating:null},{userTotal:0,girlfriendTotal:20,finalRating:10}]);
 assert.equal(stats.userAverage,0);assert.equal(stats.mashaAverage,50);assert.equal(stats.averageGap,20);assert.equal(stats.pairedCount,1);
});
test('filters and ranking do not mutate input or mistake missing ratings for zero',()=>{
 const rows=fixtures().map(mapRow),copy=structuredClone(rows);
 assert.equal(selectMovies(rows,{query:'ТАМ, ГДЕ'}).length,1);
 assert.equal(selectMovies(rows,{genre:'фантастика'}).length,2);
 assert.ok(selectMovies(rows,{filter:'favorites'}).every(m=>m.userTotal>=80&&m.girlfriendTotal>=80));
 assert.ok(selectMovies(rows,{filter:'different'}).every(m=>Math.abs(m.userTotal-m.girlfriendTotal)>=20));
 selectMovies(rows,{sort:'rating'});assert.deepEqual(rows,copy);
});
test('untrusted poster protocols are rejected',()=>{
 for(const url of ['javascript:alert(1)','data:image/svg+xml,unsafe','http://example.test/poster.jpg','https://user:password@example.test/poster.jpg'])assert.equal(safePoster({posterUrl:url}),'/assets/poster.svg');
 assert.equal(safePoster({posterUrl:'https://example.test/p.jpg'}),'https://example.test/p.jpg');
});
test('GET preserves all historical ratings, notes and dates without writes',async()=>{
 const services=memoryServices(),before=await services.list(),res=await call('movies',services);
 assert.equal(res.statusCode,200);assert.deepEqual(res.body.movies,before.map(mapRow));assert.deepEqual(await services.list(),before);
 assert.equal(res.headers['Cache-Control'],'no-store');assert.ok(res.headers['Content-Security-Policy'].includes("script-src 'self'"));
});
test('raw export preserves unknown legacy columns and requires authorization',async()=>{
 const services=memoryServices();let res=await call('movies',services,{url:'/api/movies?export=1'});
 assert.deepEqual(res.body.rows,await services.list());
 res=await call('movies',services,{url:'/api/movies?export=1',headers:{cookie:''}});assert.equal(res.statusCode,401);
});
test('DELETE is unconditionally denied and never mutates data',async()=>{
 const services=memoryServices(),before=await services.list();const result=await call('movies',services,{method:'DELETE',body:{id:before[0].id}});
 assert.equal(result.statusCode,405);assert.deepEqual(await services.list(),before);
});
test('anonymous, cross-origin and read-only writes fail closed',async()=>{
 const services=memoryServices(),before=await services.list();
 assert.equal((await call('movies',services,{method:'POST',body:addition(),headers:{cookie:''}})).statusCode,401);
 assert.equal((await call('movies',services,{method:'POST',body:addition(),headers:{origin:'https://evil.test'}})).statusCode,403);
 assert.equal((await call('movies',services,{method:'POST',body:addition(),headers:{origin:undefined}})).statusCode,403);
 assert.equal((await call('movies',services,{method:'POST',body:addition(),headers:{'sec-fetch-site':'cross-site'}})).statusCode,403);
 services.canWrite=false;assert.equal((await call('movies',services,{method:'POST',body:addition()})).statusCode,503);
 assert.deepEqual(await services.list(),before);
});
test('creation calculates server-side scores and retries do not duplicate rows',async()=>{
 const services=memoryServices(),before=await services.list(),body=addition();
 const first=await call('movies',services,{method:'POST',body});assert.equal(first.statusCode,201);
 assert.equal(first.body.movie.finalRating,calculateRatings(body.ratings,null).finalRating);
 const retry=await call('movies',services,{method:'POST',body});assert.equal(retry.statusCode,200);assert.equal(retry.body.alreadySaved,true);
 assert.equal((await services.list()).length,before.length+1);
 for(const row of before)assert.deepEqual(await services.get(row.id),row);
 const conflict=await call('movies',services,{method:'POST',body:{...body,note:'different'}});assert.equal(conflict.statusCode,409);
});
test('invalid rating arrays, forged totals and oversized requests are rejected',async()=>{
 const services=memoryServices();for(const ratings of [[1,2],[1,2,3,4,11],[1,2,3,4,-1],[1,2,3,4,'5'],[1,2,3,4,5.2]])assert.equal((await call('movies',services,{method:'POST',body:{...addition(),ratings}})).statusCode,400);
 assert.equal((await call('movies',services,{method:'POST',body:{...addition(),finalRating:100}})).statusCode,400);
 assert.equal((await call('movies',services,{method:'POST',body:'not-json'})).statusCode,400);
 assert.equal((await call('movies',services,{method:'POST',body:{...addition(),note:'x'.repeat(70000)}})).statusCode,413);
 assert.throws(()=>newRow({...addition(),id:'1 OR 1=1'},new Date(),{role:'elevely'}));
});
test('notes update only notes, preserve unknown columns, and reject stale edits',async()=>{
 const services=memoryServices(),before=await services.get(fixtures()[0].id);
 const body={id:before.id,revision:revision(before),note:'<img onerror=alert(1)>',hasSpoilers:true};
 const saved=await call('movies',services,{method:'PATCH',body});assert.equal(saved.statusCode,200);
 const after=await services.get(before.id);assert.deepEqual(after,{...before,user_notes:body.note,has_spoilers:true});
 assert.equal((await call('movies',services,{method:'PATCH',body})).statusCode,409);
 assert.equal((await call('movies',services,{method:'PATCH',body:{...body,finalRating:100}})).statusCode,400);
 assert.equal((await call('movies',services,{method:'PATCH',body:{...body,dateAdded:'2000-01-01'}})).statusCode,400);
});
test('login uses HttpOnly same-site cookies; logout clears them',async()=>{
 const services=memoryServices();assert.equal((await call('auth',services,{method:'POST',body:{email:'wrong',password:'wrong'}})).statusCode,401);
 const login=await call('auth',services,{method:'POST',body:{email:'elevely@example.test',password:'demo-only'}});assert.equal(login.statusCode,200);assert.match(login.headers['Set-Cookie'][0],/HttpOnly; SameSite=Strict/);
 const logout=await call('auth',services,{method:'DELETE'});assert.match(logout.headers['Set-Cookie'][0],/Max-Age=0/);
});
test('search is server-side and authenticated',async()=>{
 const services=memoryServices();assert.equal((await call('search',services,{url:'/api/search?q=film',headers:{cookie:''}})).statusCode,401);
 assert.equal((await call('search',services,{url:'/api/search?q=film'})).body.movies.length,1);
});
test('Supabase pagination respects an upstream cap smaller than requested',async()=>{
 const original=fixtures(),calls=[];
 const fetcher=async(url,options)=>{calls.push({url,options});const offset=Number(new URL(url).searchParams.get('offset'));const rows=original.slice(offset,offset+3);return new Response(JSON.stringify(rows),{headers:{'content-range':`${offset}-${offset+rows.length-1}/${original.length}`}});};
 const services=createServices({SUPABASE_URL:'https://test.supabase.co',SUPABASE_ANON_KEY:'test-key'},fetcher);
 assert.deepEqual(await services.list(),original);assert.equal(calls.length,3);assert.ok(calls.every(c=>!c.options.method));
});
test('Supabase pagination refuses a changing collection',async()=>{
 let n=0;const services=createServices({SUPABASE_URL:'https://test.supabase.co',SUPABASE_ANON_KEY:'test'},async()=>new Response(JSON.stringify([fixtures()[n++]]),{headers:{'content-range':`0-0/${n===1?3:4}`}}));
 await assert.rejects(()=>services.list(),/изменилась/);
});
test('upstream failures never leak raw database or credential messages',async()=>{
 const services=createServices({SUPABASE_URL:'https://test.supabase.co',SUPABASE_ANON_KEY:'secret-test'},async()=>new Response(JSON.stringify({message:'private-db-secret'}),{status:500}));
 const result=await call('movies',services);assert.equal(result.statusCode,503);assert.ok(!JSON.stringify(result).includes('private-db-secret'));
});

test('public reads use publishable credentials and note RPC runs as the owner with a body',async()=>{
  const calls=[];
  const row=fixtures()[0];
  const backend=createServices({
    SUPABASE_URL:'https://test.supabase.co',
    SUPABASE_ANON_KEY:'sb_publishable_fixture',
    SUPABASE_SERVICE_ROLE_KEY:'never-use-this'
  }, async (url, options)=>{
    calls.push({url,options});
    return new Response(JSON.stringify([row]),{headers:{'content-range':'0-0/1'}});
  });
  await backend.list();
  assert.equal(calls[0].options.headers.apikey,'sb_publishable_fixture');
  assert.equal(calls[0].options.headers.Authorization,undefined);
  const notes={user_notes:'Тест с кавычками " и переносом\nстроки',girlfriend_notes:'',has_spoilers:false};
  await backend.updateReview(row,notes,'owner-test-token');
  const rpc=calls[1];
  assert.equal(new URL(rpc.url).pathname,'/rest/v1/rpc/films_update_review');
  assert.equal(new URL(rpc.url).search,'');
  assert.equal(rpc.options.headers.Authorization,'Bearer owner-test-token');
  assert.deepEqual(JSON.parse(rpc.options.body),{
    film_id:row.id,previous_row:row,changes:notes
  });
  assert.equal(JSON.stringify(calls).includes('never-use-this'),false);
});

test('each account edits only its own review; note-only saves preserve historic totals',async()=>{
  const services=memoryServices(),original=await services.get(fixtures()[0].id);
  const first=await call('movies',services,{method:'PATCH',body:{id:original.id,revision:revision(original),ratings:[10,10,10,10,10],note:'E only',hasSpoilers:false}});
  assert.equal(first.statusCode,200);
  let row=await services.get(original.id);
  assert.deepEqual(row.girlfriend_ratings,original.girlfriend_ratings);assert.equal(row.girlfriend_notes,original.girlfriend_notes);assert.equal(row.girlfriend_total,original.girlfriend_total);
  assert.equal(row.user_total,100);assert.equal(row.final_rating,calculateRatings(row.user_ratings,row.girlfriend_ratings).finalRating);
  const second=await call('movies',services,{method:'PATCH',headers:{cookie:'films_session=demo-mashka-session'},body:{id:row.id,revision:revision(row),ratings:[0,0,0,0,0],note:'M only',hasSpoilers:true}});
  assert.equal(second.statusCode,200);row=await services.get(row.id);assert.equal(row.girlfriend_total,0);assert.equal(row.user_total,100);assert.equal(row.user_notes,'E only');assert.equal(row.final_rating,50);
  const unchanged=await call('movies',services,{method:'PATCH',body:{id:row.id,revision:revision(row),ratings:row.user_ratings,note:'Note only',hasSpoilers:true}});
  assert.equal(unchanged.statusCode,200);
  assert.deepEqual(await services.get(row.id),{...row,user_notes:'Note only'});
  const legacy=await services.get(fixtures()[1].id);
  await call('movies',services,{method:'PATCH',body:{id:legacy.id,revision:revision(legacy),ratings:legacy.user_ratings,note:'keep old totals',hasSpoilers:false}});
  assert.deepEqual(await services.get(legacy.id),{...legacy,user_notes:'keep old totals'});
});
test('foreign fields, incomplete reviews and totals are rejected; duplicates include catalog and manual entries',async()=>{
  const services=memoryServices();
  for(const forged of [{userRatings:[1,1,1,1,1]},{girlfriendRatings:[1,1,1,1,1]},{girlfriendNotes:'attack'},{finalRating:100}]) {
    assert.equal((await call('movies',services,{method:'POST',body:{...addition(),...forged}})).statusCode,400);
    const row=await services.get(fixtures()[0].id);
    assert.equal((await call('movies',services,{method:'PATCH',body:{id:row.id,revision:revision(row),note:'x',hasSpoilers:false,...forged}})).statusCode,400);
  }
  assert.equal((await call('movies',services,{method:'POST',body:{...addition(),ratings:null}})).statusCode,400);
  const payload={...addition(),movie:{nameRu:'Test',year:2020,kinopoiskId:999}};
  assert.equal((await call('movies',services,{method:'POST',body:payload})).statusCode,201);
  assert.equal((await call('movies',services,{method:'POST',body:{...payload,id:1800000000001,movie:{nameRu:'Another title',kinopoiskId:999}}})).statusCode,409);
  assert.equal((await call('movies',services,{method:'POST',body:{...payload,id:1800000000002,movie:{nameRu:'  TEST  ',year:2020}}})).statusCode,409);
});
test('first reviewer leaves partner ratings empty, second can complete the film from another device',async()=>{
  const services=memoryServices();
  const saved=await call('movies',services,{method:'POST',body:addition()});
  assert.equal(saved.statusCode,201);assert.equal(saved.body.movie.girlfriendTotal,null);assert.equal(saved.body.movie.finalRating,null);assert.equal(saved.body.movie.girlfriendRatings,null);
  const movie=saved.body.movie;
  const completed=await call('movies',services,{method:'PATCH',headers:{cookie:'films_session=demo-mashka-session'},body:{id:movie.id,revision:movie.revision,ratings:[8,8,8,8,8],note:'second device',hasSpoilers:false}});
  assert.equal(completed.statusCode,200);assert.equal(completed.body.movie.girlfriendTotal,80);assert.equal(completed.body.movie.finalRating,calculateRatings(addition().ratings,[8,8,8,8,8]).finalRating);
});
test('refresh cookies rotate, return the correct identity, and logout revokes the local session',async()=>{
  const services=memoryServices();
  for (const role of ['elevely','mashka']) {
    const login=await call('auth',services,{method:'POST',body:{email:role+'@example.test',password:'demo-only'}});
    assert.equal(login.body.user.role,role);assert.equal(login.body.authenticated,true);
    const cookies=login.headers['Set-Cookie'].map(s=>s.split(';')[0]).join('; ');
    const refreshCookie=login.headers['Set-Cookie'][1];assert.match(refreshCookie,/HttpOnly; SameSite=Strict/);assert.match(refreshCookie,/Max-Age=2592000/);
    const refreshed=await call('auth',services,{method:'PUT',headers:{cookie:cookies}});
    assert.equal(refreshed.body.user.role,role);assert.notDeepEqual(refreshed.headers['Set-Cookie'],login.headers['Set-Cookie']);
    assert.equal((await call('auth',services,{method:'PUT',headers:{cookie:cookies,origin:'https://evil.test'}})).statusCode,403);
    const current=refreshed.headers['Set-Cookie'].map(s=>s.split(';')[0]).join('; ');
    await call('auth',services,{method:'DELETE',headers:{cookie:current}});
    assert.equal((await call('auth',services,{headers:{cookie:current}})).body.authenticated,false);
    const denied=await call('auth',services,{method:'PUT',headers:{cookie:current}});assert.equal(denied.statusCode,401);assert.ok(denied.headers['Set-Cookie'].every(c=>c.includes('Max-Age=0')));
  }
});
test('production cookies require HTTPS; arbitrary metadata and allowlists cannot select a viewer role',async()=>{
  const e='11111111-1111-4111-8111-111111111111',m='22222222-2222-4222-8222-222222222222';
  const env={SUPABASE_URL:'https://test.supabase.co',SUPABASE_ANON_KEY:'sb_publishable_test',ELEVELY_USER_ID:e,MASHKA_USER_ID:m,ENABLE_WRITES:'true',RLS_VERIFIED:'true'};
  let id=e;
  const services=createServices(env,async()=>new Response(JSON.stringify({id,user_metadata:{role:'mashka'}})));
  assert.equal(services.canWrite,true);assert.deepEqual(await services.user('token'),{id:e,role:'elevely',name:'elevely'});
  id='33333333-3333-4333-8333-333333333333';assert.equal(await services.user('token'),null);
  assert.equal(createServices({...env,MASHKA_USER_ID:e}).canWrite,false);
  const req={method:'POST',url:'/api/auth',headers:{origin:'https://films.test','content-type':'application/json'},body:{email:'elevely@example.test',password:'demo-only'}};
  const res={headers:{},setHeader(k,v){this.headers[k]=v},end(){}};
  await createHandler('auth',memoryServices(),{APP_ORIGIN:'https://films.test'})(req,res);
  assert.ok(res.headers['Set-Cookie'].every(c=>c.includes('; Secure')));
});
test('Supabase refresh and sign-out use server-only credentials; network outages preserve recoverability',async()=>{
  const e='11111111-1111-4111-8111-111111111111',calls=[];
  const env={SUPABASE_URL:'https://test.supabase.co',SUPABASE_ANON_KEY:'sb_publishable_test',ELEVELY_USER_ID:e,MASHKA_USER_ID:'22222222-2222-4222-8222-222222222222'};
  const backend=createServices(env,async(url,options)=>{
    calls.push({url,options});if(url.includes('logout'))return new Response(null,{status:204});
    return new Response(JSON.stringify({access_token:'next-token',refresh_token:'next-refresh',expires_in:3600,user:{id:e}}));
  });
  const result=await backend.refresh('old-refresh');assert.equal(result.user.role,'elevely');assert.equal(result.refreshToken,'next-refresh');
  assert.match(calls[0].url,/grant_type=refresh_token/);assert.deepEqual(JSON.parse(calls[0].options.body),{refresh_token:'old-refresh'});
  await backend.logout(result.token);assert.match(calls[1].url,/logout\?scope=local/);assert.equal(calls[1].options.headers.Authorization,'Bearer next-token');
  const services=memoryServices();services.refresh=async()=>{throw Object.assign(new Error('Unavailable'),{status:503});};
  const res=await call('auth',services,{method:'PUT',headers:{cookie:'films_refresh=valid'}});assert.equal(res.headers['Set-Cookie'],undefined);
});

test('simultaneous edits cannot overwrite a newer review; account switches reject a stale author',async()=>{
  const services=memoryServices(),row=await services.get(fixtures()[0].id);
  const base={id:row.id,revision:revision(row),note:'one',hasSpoilers:false,viewer:'elevely'};
  const results=await Promise.all([call('movies',services,{method:'PATCH',body:base}),call('movies',services,{method:'PATCH',body:{...base,note:'two'}})]);
  assert.deepEqual(results.map(r=>r.statusCode).sort(),[200,409]);
  const current=await services.get(row.id);
  assert.equal((await call('movies',services,{method:'PATCH',headers:{cookie:'films_session=demo-mashka-session'},body:{...base,revision:revision(current)}})).statusCode,409);
  assert.equal((await call('movies',services,{method:'POST',headers:{cookie:'films_session=demo-mashka-session'},body:{...addition(),viewer:'elevely'}})).statusCode,409);
});
test('privileged keys fail closed in the app and are read-only in the local backup client',async()=>{
  let calls=0;
  const fetcher=async()=>{calls++;return new Response('[]',{headers:{'content-range':'*/0'}});};
  const base={SUPABASE_URL:'https://test.supabase.co'};
  const jwt='header.'+Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')+'.signature';
  for(const key of ['sb_secret_synthetic',jwt]) {
    const client=createServices({...base,SUPABASE_ANON_KEY:key},fetcher);await assert.rejects(()=>client.list(),/publishable/);assert.equal(client.canWrite,false);
  }
  assert.equal(calls,0);
  const backup=createServices({...base,SUPABASE_ANON_KEY:'sb_secret_synthetic'},fetcher,{backupOnly:true});
  assert.deepEqual(await backup.list(),[]);assert.equal(calls,1);
  await assert.rejects(()=>backup.insert({},'token'),/только чтение/);assert.equal(calls,1);
});
test('catalog validates IDs and queries, handles missing keys, limits and invalid upstream responses',async()=>{
  const env={SUPABASE_URL:'https://test.supabase.co',SUPABASE_ANON_KEY:'test',KINOPOISK_API_KEY:'fixture-key'};
  for(const query of ['q=x','q='+ 'x'.repeat(121),'id=1%20OR%201=1']) await assert.rejects(()=>createServices(env).search(new URLSearchParams(query)),/от 2/);
  await assert.rejects(()=>createServices({...env,KINOPOISK_API_KEY:''}).search(new URLSearchParams('q=film')),/вручную/);
  await assert.rejects(()=>createServices(env,async()=>new Response('{}',{status:429})).search(new URLSearchParams('q=film')),/Лимит/);
  await assert.rejects(()=>createServices(env,async()=>new Response('invalid',{status:200})).search(new URLSearchParams('q=film')),/некорректный/);
  await assert.rejects(()=>createServices(env,async()=>{throw new Error('private network details');}).search(new URLSearchParams('q=film')),/временно/);
});
test('preview origin uses trusted Vercel metadata; request Host cannot authorize CSRF',async()=>{
  const services=memoryServices(),res={headers:{},setHeader(k,v){this.headers[k]=v;},end(s){this.body=JSON.parse(s);}};
  const handler=createHandler('auth',services,{VERCEL_ENV:'preview',VERCEL_URL:'films-branch.vercel.app'});
  await handler({method:'POST',url:'/api/auth',headers:{origin:'https://films-branch.vercel.app','content-type':'application/json'},body:{email:'elevely@example.test',password:'demo-only'}},res);
  assert.equal(res.statusCode,200);assert.equal(res.body.user.role,'elevely');assert.ok(res.headers['Set-Cookie'][0].includes('; Secure'));
  await handler({method:'DELETE',url:'/api/auth',headers:{origin:'https://evil.test',host:'evil.test'}},res);assert.equal(res.statusCode,403);
});
