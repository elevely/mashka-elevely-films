import { HttpError, assert } from './errors.mjs';
import { sameFilm } from '../public/lib/model.js';
import { mapRow, newRow, reviewPatch, revision, validId, canonical, onlyKeys } from './data.mjs';

export const SECURITY_HEADERS = {
  'Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'no-referrer',
  'X-Frame-Options':'DENY',
  'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"
};
export function cookieFrom(req, name) {
  const value = (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith(name+'='))?.slice(name.length+1) || '';
  return /^[A-Za-z0-9._~-]{1,4096}$/.test(value) ? value : '';
}
export const tokenFrom = req => cookieFrom(req,'films_session');
export async function bodyOf(req) {
  if (req.body !== undefined) {
    assert(Buffer.byteLength(typeof req.body === 'string' ? req.body : JSON.stringify(req.body)) <= 65536, 'Запрос слишком большой.', 413);
    if (typeof req.body !== 'string' && !Buffer.isBuffer(req.body)) return req.body;
    try { return JSON.parse(req.body.toString()); } catch { throw new HttpError(400,'Некорректный JSON.'); }
  }
  let size=0; const chunks=[];
  for await (const chunk of req) { size += chunk.length; assert(size <= 65536, 'Запрос слишком большой.', 413); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString()); } catch { throw new HttpError(400,'Некорректный JSON.'); }
}
export function createHandler(kind, services, env = process.env) {
  const appOrigin = () => env.APP_ORIGIN || (env.VERCEL_ENV==='preview' && /^[a-z0-9.-]+\.vercel\.app$/.test(env.VERCEL_URL || '') ? `https://${env.VERCEL_URL}` : '');
  function origin(req) {
    assert(appOrigin() && req.headers.origin === appOrigin(), 'Запрос с этого адреса не разрешён.', 403);
    assert(!req.headers['sec-fetch-site'] || ['same-origin','none'].includes(req.headers['sec-fetch-site']), 'Межсайтовый запрос запрещён.', 403);
  }
  const sessionCookie = (token, maxAge, name='films_session') => `${name}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${appOrigin().startsWith('https:') || env.VERCEL ? '; Secure' : ''}`;
  const clearCookies = res => res.setHeader('Set-Cookie',[sessionCookie('',0),sessionCookie('',0,'films_refresh')]);
  const setCookies = (res,result) => res.setHeader('Set-Cookie',[sessionCookie(result.token,result.expires),sessionCookie(result.refreshToken || '',result.refreshToken ? 60*60*24*30 : 0,'films_refresh')]);
  const authView = user => ({authenticated:Boolean(user),user:user ? {role:user.role,name:user.name} : null,canWrite:Boolean(user && services.canWrite),demo:services.demo,searchAvailable:services.searchAvailable});
  async function admin(req) { const user=await services.user(tokenFrom(req)); assert(user, 'Войдите в аккаунт владельца коллекции.', 401); return user; }
  return async (req,res) => {
    for (const [key,value] of Object.entries(SECURITY_HEADERS)) res.setHeader(key,value);
    res.setHeader('Content-Type','application/json; charset=utf-8');
    const send=(status,data) => { res.statusCode=status;res.end(JSON.stringify(data)); };
    try {
      const method=req.method;
      const token=tokenFrom(req);
      const params=new URL(req.url,'http://local').searchParams;
      if (kind === 'auth') {
        if (method==='GET') { const user=tokenFrom(req) ? await services.user(tokenFrom(req)) : null; return send(200,{...authView(user),hasSession:Boolean(cookieFrom(req,'films_refresh'))}); }
        if (method==='DELETE') {
          origin(req);
          // Revoke this device's refresh session before clearing its cookies; retry remains possible on network failure.
          if (token) await services.logout(token);
          else if (cookieFrom(req,'films_refresh')) {
            try { const fresh=await services.refresh(cookieFrom(req,'films_refresh')); await services.logout(fresh.token); }
            catch(error) { if(error.status !== 401) throw error; }
          }
          clearCookies(res);return send(200,{success:true});
        }
        if (method==='PUT') {
          origin(req);assert(cookieFrom(req,'films_refresh'),'Сессия истекла. Войдите снова.',401);
          try {
            const result=await services.refresh(cookieFrom(req,'films_refresh'));setCookies(res,result);
            return send(200,authView(result.user));
          } catch(error) { if(error.status===401)clearCookies(res);throw error; }
        }
        if (method==='POST') {
          origin(req);assert(req.headers['content-type']?.startsWith('application/json'),'Ожидался application/json.',415);
          const body=await bodyOf(req);onlyKeys(body,['email','password']);
          assert(typeof body.email==='string' && body.email.length <= 254 && typeof body.password==='string' && body.password.length >= 1 && body.password.length <= 256,'Укажите почту и пароль.');
          const result=await services.login(body.email.trim(),body.password);
          setCookies(res,result);return send(200,authView(result.user));
        }
      }
      if (kind==='search' && method==='GET') { await admin(req);return send(200,await services.search(params)); }
      if (kind==='movies') {
        if (method==='GET') {
          if (params.get('export')==='1') { await admin(req);return send(200,{schemaVersion:1,exportedAt:new Date().toISOString(),rows:await services.list(token)}); }
          return send(200,{movies:(await services.list()).map(mapRow),demo:services.demo});
        }
        if (['POST','PATCH','PUT'].includes(method)) {
          origin(req);const actor=await admin(req);assert(services.canWrite,'Коллекция доступна для чтения. Запись включается после проверки доступа к базе.',503);
          assert(req.headers['content-type']?.startsWith('application/json'),'Ожидался application/json.',415);
          const body=await bodyOf(req);
          if (method==='POST') {
            const row=newRow(body,new Date(),actor);
            const equivalent = existing => {
              const {date_added,...a}=existing, {date_added:ignored,...b}=row;
              // Only compare fields this request owns; preserve unrelated legacy columns.
              return JSON.stringify(canonical(Object.fromEntries(Object.keys(b).map(k=>[k,a[k]])))) === JSON.stringify(canonical(b));
            };
            const prior=await services.get(validId(row.id), token);
            if (prior) { assert(equivalent(prior),'Этот идентификатор уже занят другим фильмом.',409);return send(200,{movie:mapRow(prior),alreadySaved:true}); }
            assert(!(await services.list(token)).some(r=>sameFilm(r.movie_data,row.movie_data)), 'Этот фильм уже есть в коллекции. Найдите его по названию и откройте свою рецензию.',409);
            try { return send(201,{movie:mapRow(await services.insert(row, token))}); }
            catch (error) {
              if (error.status!==409) throw error;
              const saved=await services.get(validId(row.id), token);
              assert(saved && equivalent(saved),'Этот идентификатор уже занят другим фильмом.',409);
              return send(200,{movie:mapRow(saved),alreadySaved:true});
            }
          }
          const existing=await services.get(validId(body?.id), token);
          assert(existing,'Фильм не найден.',404);
          const patch=reviewPatch(body,existing,actor);
          assert(revision(existing)===body.revision,'Фильм изменился в другой вкладке. Сначала обновите его.',409);
          return send(200,{movie:mapRow(await services.updateReview(existing,patch, token))});
        }
      }
      res.setHeader('Allow',kind==='auth'?'GET, POST, PUT, DELETE':kind==='search'?'GET':'GET, POST, PATCH, PUT');
      throw new HttpError(405,'Эта операция не поддерживается. Удаление фильмов запрещено.');
    } catch (error) { send(error instanceof HttpError ? error.status : 500,{error:error instanceof HttpError ? error.message : 'Не удалось выполнить запрос. Попробуйте ещё раз.'}); }
  };
}
