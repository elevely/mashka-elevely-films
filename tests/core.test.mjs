import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRatings, statistics, selectMovies, safePoster, numeric } from '../public/lib/model.js';
import { mapRow, revision, newRow } from '../server/data.mjs';
import { createHandler } from '../server/handlers.mjs';
import { createServices } from '../server/supabase.mjs';
import { fixtures, memoryServices } from './fixtures.mjs';

const origin='http://localhost:4173';
async function call(kind,services,{method='GET',body,headers={},url=`/api/${kind}`}={}){
 const req={method,url,body,headers:{'content-type':'application/json',origin,cookie:'films_session=demo-session',...headers}};
 const res={headers:{},statusCode:200,setHeader(k,v){this.headers[k]=v;},end(value){this.body=JSON.parse(value);}};
 await createHandler(kind,services,{APP_ORIGIN:origin})(req,res);return res;
}
function addition(){return {id:1800000000000,movie:{nameRu:'New test film'},userRatings:[9,8,7,6,5],girlfriendRatings:[8,7,6,5,4],userNotes:'Note E',girlfriendNotes:'Note M',hasSpoilers:false};}

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
 assert.equal(first.body.movie.finalRating,calculateRatings(body.userRatings,body.girlfriendRatings).finalRating);
 const retry=await call('movies',services,{method:'POST',body});assert.equal(retry.statusCode,200);assert.equal(retry.body.alreadySaved,true);
 assert.equal((await services.list()).length,before.length+1);
 for(const row of before)assert.deepEqual(await services.get(row.id),row);
 const conflict=await call('movies',services,{method:'POST',body:{...body,userNotes:'different'}});assert.equal(conflict.statusCode,409);
});
test('invalid rating arrays, forged totals and oversized requests are rejected',async()=>{
 const services=memoryServices();for(const ratings of [[1,2],[1,2,3,4,11],[1,2,3,4,-1],[1,2,3,4,'5'],[1,2,3,4,5.2]])assert.equal((await call('movies',services,{method:'POST',body:{...addition(),userRatings:ratings}})).statusCode,400);
 assert.equal((await call('movies',services,{method:'POST',body:{...addition(),finalRating:100}})).statusCode,400);
 assert.equal((await call('movies',services,{method:'POST',body:'not-json'})).statusCode,400);
 assert.equal((await call('movies',services,{method:'POST',body:{...addition(),userNotes:'x'.repeat(70000)}})).statusCode,413);
 assert.throws(()=>newRow({...addition(),id:'1 OR 1=1'}));
});
test('notes update only notes, preserve unknown columns, and reject stale edits',async()=>{
 const services=memoryServices(),before=await services.get(fixtures()[0].id);
 const body={id:before.id,revision:revision(before),userNotes:'<img onerror=alert(1)>',girlfriendNotes:'New note',hasSpoilers:true};
 const saved=await call('movies',services,{method:'PATCH',body});assert.equal(saved.statusCode,200);
 const after=await services.get(before.id);assert.deepEqual(after,{...before,user_notes:body.userNotes,girlfriend_notes:body.girlfriendNotes,has_spoilers:true});
 assert.equal((await call('movies',services,{method:'PATCH',body})).statusCode,409);
 assert.equal((await call('movies',services,{method:'PATCH',body:{...body,finalRating:100}})).statusCode,400);
 assert.equal((await call('movies',services,{method:'PATCH',body:{...body,dateAdded:'2000-01-01'}})).statusCode,400);
});
test('login uses HttpOnly same-site cookies; logout clears them',async()=>{
 const services=memoryServices();assert.equal((await call('auth',services,{method:'POST',body:{email:'wrong',password:'wrong'}})).statusCode,401);
 const login=await call('auth',services,{method:'POST',body:{email:'demo@example.test',password:'demo-only'}});assert.equal(login.statusCode,200);assert.match(login.headers['Set-Cookie'],/HttpOnly; SameSite=Strict/);
 const logout=await call('auth',services,{method:'DELETE'});assert.match(logout.headers['Set-Cookie'],/Max-Age=0/);
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
