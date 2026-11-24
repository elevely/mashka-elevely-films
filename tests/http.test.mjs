import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from '../server/http.mjs';
import { memoryServices } from './fixtures.mjs';

test('real HTTP: static routes, authenticated writes, reload persistence and forbidden paths',async t=>{
 const services=memoryServices(),env={APP_ORIGIN:''},server=createServer(services,env);
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());
 const base=`http://127.0.0.1:${server.address().port}`;env.APP_ORIGIN=base;
 for(const route of ['/','/admin','/admin.html','/style.css','/app.js','/lib/model.js'])assert.equal((await fetch(base+route)).status,200,route);
 for(const route of ['/server/supabase.mjs','/.env','/tests/fixtures.mjs','/api/missing'])assert.equal((await fetch(base+route)).status,404,route);
 const initial=await (await fetch(base+'/api/movies')).json();assert.equal(initial.movies.length,8);
 const login=await fetch(base+'/api/auth',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({email:'demo@example.test',password:'demo-only'})});
 assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
 const first=initial.movies[0];
 const saved=await fetch(base+'/api/movies',{method:'PATCH',headers:{Origin:base,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({id:first.id,revision:first.revision,userNotes:'Saved through real HTTP',girlfriendNotes:first.girlfriendNotes,hasSpoilers:true})});assert.equal(saved.status,200);
 const reloaded=await (await fetch(base+'/api/movies')).json();assert.equal(reloaded.movies[0].userNotes,'Saved through real HTTP');assert.equal(reloaded.movies[0].finalRating,first.finalRating);
 const removed=await fetch(base+'/api/movies',{method:'DELETE',headers:{Origin:base,Cookie:cookie}});assert.equal(removed.status,405);assert.equal((await services.list()).length,8);
});
