import { createHandler } from '../server/handlers.mjs';
import { createServices } from '../server/supabase.mjs';
export default createHandler('auth', createServices());
