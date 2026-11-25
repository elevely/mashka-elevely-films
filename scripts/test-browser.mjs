// Starts a fresh synthetic server for every run; ignores production env and never calls Supabase.
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from '../server/http.mjs';
import {memoryServices,demoPosters} from '../tests/fixtures.mjs';
const env={APP_ORIGIN:''};
const server=createServer(memoryServices(),env,demoPosters());
server.listen(0,'127.0.0.1');await once(server,'listening');
const port=server.address().port;env.APP_ORIGIN=`http://localhost:${port}`;
try {
  const child=spawn(process.execPath,['tests/browser.mjs'],{stdio:'inherit',env:{...process.env,DEMO_PORT:String(port)}});
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
  process.exitCode=code ?? 1;
} finally { await new Promise(resolve=>server.close(resolve)); }
