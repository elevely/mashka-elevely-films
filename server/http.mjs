import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
import { createHandler, SECURITY_HEADERS } from './handlers.mjs';

const root=resolve(fileURLToPath(new URL('../public/',import.meta.url)));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'};
export function createServer(services,env,extraFiles={}) {
  const handlers=Object.fromEntries(['movies','auth','search'].map(kind=>[kind,createHandler(kind,services,env)]));
  return http.createServer(async(req,res)=>{
    for(const [key,value] of Object.entries(SECURITY_HEADERS))res.setHeader(key,value);
    let path;
    try {path=decodeURIComponent(new URL(req.url,'http://local').pathname);}catch{res.writeHead(400);res.end('Bad request');return;}
    if(path.startsWith('/api/')) {
      const handler=handlers[path.slice(5)];
      if(Object.hasOwn(handlers,path.slice(5))) await handler(req,res);else{res.writeHead(404,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Маршрут не найден.'}));}
      return;
    }
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'});res.end();return;}
    if(['/','/index.html','/admin','/admin.html'].includes(path))path='/index.html';
    if(extraFiles[path]){res.writeHead(200,{'Content-Type':extraFiles[path].type});res.end(req.method==='HEAD'?undefined:extraFiles[path].body);return;}
    const target=resolve(root,'.'+path);
    if(!target.startsWith(root+sep) || path.split('/').some(part=>part.startsWith('.'))){res.writeHead(404);res.end('Not found');return;}
    try{const body=await readFile(target);res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream'});res.end(req.method==='HEAD'?undefined:body);}catch{res.writeHead(404);res.end('Not found');}
  });
}
