import { cp, mkdir, rm, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import { resolve } from 'node:path';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
async function check(dir){for(const item of await readdir(dir,{withFileTypes:true})){const path=resolve(dir,item.name);if(item.isDirectory())await check(path);else if(/\.(m?js)$/.test(path))execFileSync(process.execPath,['--check',path],{stdio:'inherit'});}}
for(const dir of ['api','server','public','scripts'])await check(resolve(root,dir));
const config=JSON.parse(await readFile(resolve(root,'vercel.json'),'utf8'));
if(config.outputDirectory!=='dist'||config.rewrites.some(r=>r.source.includes('(.*)')))throw new Error('Unsafe deployment routing');
await rm(resolve(root,'dist'),{recursive:true,force:true});
await mkdir(resolve(root,'dist'),{recursive:true});
await cp(resolve(root,'public'),resolve(root,'dist'),{recursive:true});
console.log('Build ready: dist/ + 3 Vercel API functions. No database access performed.');
