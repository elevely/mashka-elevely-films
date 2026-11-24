import { createServer } from './http.mjs';
import { memoryServices, demoPosters } from '../tests/fixtures.mjs';
// No production imports, credentials, fetch calls or persistence. Never deployed as an API.
const env={APP_ORIGIN:'http://localhost:4173'};
const server=createServer(memoryServices(),env,demoPosters());
server.listen(4173,'127.0.0.1',()=>console.log('Local: http://localhost:4173 — FICTIONAL TEST DATA ONLY; demo@example.test / demo-only'));
