import { createServer } from './http.mjs';
import { createServices } from './supabase.mjs';
const port=Number(process.env.PORT)||4173;
const server=createServer(createServices(),process.env);
server.listen(port,'127.0.0.1',()=>console.log(`Local: http://localhost:${port}`));
