import { createServer } from './http.mjs';
import { memoryServices, demoPosters } from '../tests/fixtures.mjs';
// No production imports, credentials, fetch calls or persistence. Never deployed as an API.
const port=Number(process.env.DEMO_PORT || 4173);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid demo port');
const env={APP_ORIGIN:`http://localhost:${port}`};
const server=createServer(memoryServices(),env,demoPosters());
server.listen(port,'127.0.0.1',()=>console.log(`Local: http://localhost:${port} — FICTIONAL TEST DATA ONLY; elevely@example.test or mashka@example.test / demo-only`));
