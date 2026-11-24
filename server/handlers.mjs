import { HttpError, assert } from './errors.mjs';
import { mapRow, newRow, notePatch, revision, validId, canonical, onlyKeys } from './data.mjs';

export const SECURITY_HEADERS = {
  'Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'no-referrer',
  'X-Frame-Options':'DENY',
  'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"
};
export function tokenFrom(req) {
  const cookie = (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith('films_session='));
  return cookie?.slice('films_session='.length) || '';
}
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
  function origin(req) {
    assert(env.APP_ORIGIN && req.headers.origin === env.APP_ORIGIN, 'Запрос с этого адреса не разрешён.', 403);
    assert(!req.headers['sec-fetch-site'] || ['same-origin','none'].includes(req.headers['sec-fetch-site']), 'Межсайтовый запрос запрещён.', 403);
  }
  const sessionCookie = (token, maxAge) => `films_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${env.APP_ORIGIN?.startsWith('https:') || env.VERCEL ? '; Secure' : ''}`;
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
        if (method==='GET') { const user=tokenFrom(req) ? await services.user(tokenFrom(req)) : null; return send(200,{authenticated:Boolean(user),canWrite:Boolean(user && services.canWrite),demo:services.demo,searchAvailable:services.searchAvailable}); }
        if (method==='DELETE') { origin(req);res.setHeader('Set-Cookie',sessionCookie('',0));return send(200,{success:true}); }
        if (method==='POST') {
          origin(req);assert(req.headers['content-type']?.startsWith('application/json'),'Ожидался application/json.',415);
          const body=await bodyOf(req);onlyKeys(body,['email','password']);
          assert(typeof body.email==='string' && body.email.length <= 254 && typeof body.password==='string' && body.password.length >= 1 && body.password.length <= 256,'Укажите почту и пароль.');
          const result=await services.login(body.email.trim(),body.password);
          res.setHeader('Set-Cookie',sessionCookie(result.token,result.expires));return send(200,{authenticated:true,canWrite:services.canWrite});
        }
      }
      if (kind==='search' && method==='GET') { await admin(req);return send(200,await services.search(params)); }
      if (kind==='movies') {
        if (method==='GET') {
          if (params.get('export')==='1') { await admin(req);return send(200,{schemaVersion:1,exportedAt:new Date().toISOString(),rows:await services.list(token)}); }
          return send(200,{movies:(await services.list()).map(mapRow),demo:services.demo});
        }
        if (['POST','PATCH','PUT'].includes(method)) {
          origin(req);await admin(req);assert(services.canWrite,'Коллекция доступна для чтения. Запись включается после проверки доступа к базе.',503);
          assert(req.headers['content-type']?.startsWith('application/json'),'Ожидался application/json.',415);
          const body=await bodyOf(req);
          if (method==='POST') {
            const row=newRow(body);
            const equivalent = existing => {
              const {date_added,...a}=existing, {date_added:ignored,...b}=row;
              // Only compare fields this request owns; preserve unrelated legacy columns.
              return JSON.stringify(canonical(Object.fromEntries(Object.keys(b).map(k=>[k,a[k]])))) === JSON.stringify(canonical(b));
            };
            const prior=await services.get(validId(row.id), token);
            if (prior) { assert(equivalent(prior),'Этот идентификатор уже занят другим фильмом.',409);return send(200,{movie:mapRow(prior),alreadySaved:true}); }
            try { return send(201,{movie:mapRow(await services.insert(row, token))}); }
            catch (error) {
              if (error.status!==409) throw error;
              const saved=await services.get(validId(row.id), token);
              assert(saved && equivalent(saved),'Этот идентификатор уже занят другим фильмом.',409);
              return send(200,{movie:mapRow(saved),alreadySaved:true});
            }
          }
          const patch=notePatch(body), existing=await services.get(validId(body.id), token);
          assert(existing,'Фильм не найден.',404);assert(revision(existing)===body.revision,'Фильм изменился в другой вкладке. Сначала обновите его.',409);
          return send(200,{movie:mapRow(await services.updateNotes(existing,patch, token))});
        }
      }
      res.setHeader('Allow',kind==='auth'?'GET, POST, DELETE':kind==='search'?'GET':'GET, POST, PATCH, PUT');
      throw new HttpError(405,'Эта операция не поддерживается. Удаление фильмов и изменение сохранённых оценок запрещены.');
    } catch (error) { send(error instanceof HttpError ? error.status : 500,{error:error instanceof HttpError ? error.message : 'Не удалось выполнить запрос. Попробуйте ещё раз.'}); }
  };
}
