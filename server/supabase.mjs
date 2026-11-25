import { identities } from './identity.mjs';
import { HttpError, assert } from './errors.mjs';

export function createServices(env = process.env, fetcher = fetch, {backupOnly=false} = {}) {
  const base = env.SUPABASE_URL?.replace(/\/$/, '');
  const anon = env.SUPABASE_ANON_KEY;
  let keyRole;
  try { keyRole=JSON.parse(Buffer.from((anon || '').split('.')[1], 'base64url').toString()).role; } catch {}
  const privileged=anon?.startsWith('sb_secret_') || keyRole==='service_role';
  const accounts = identities(env);
  const canWrite = !backupOnly && !privileged && env.ENABLE_WRITES === 'true' && env.RLS_VERIFIED === 'true' && accounts.configured;
  // Supabase's newer sb_* keys are opaque API keys, not JWT bearer tokens.
  function authorization(token) {
    return token && !token.startsWith('sb_') ? { Authorization:`Bearer ${token}` } : {};
  }
  async function upstream(url, options = {}) {
    let response;
    try { response = await fetcher(url, { ...options, signal: AbortSignal.timeout(12000) }); }
    catch { throw new HttpError(503, 'Сервис временно недоступен. Попробуйте ещё раз.'); }
    let data;
    try { data = await response.json(); } catch { throw new HttpError(502, 'Сервис вернул некорректный ответ.'); }
    return { response, data };
  }
  function ready() { assert(backupOnly || !privileged,'Для приложения нужен publishable / anon ключ. Секретный ключ разрешён только локальному экспорту.',503); assert(base && /^https:\/\/[^/]+\.supabase\.co$/.test(base) && anon, 'Подключение к коллекции ещё не настроено.', 503); }
  async function db(params, options = {}, token = anon, endpoint = 'movies') {
    ready();
    assert(!backupOnly || !options.method || options.method==='GET','Резервное подключение допускает только чтение.',403);
    const { response, data } = await upstream(`${base}/rest/v1/${endpoint}?${new URLSearchParams(params)}`, {
      ...options, headers: { apikey: anon, ...authorization(token), 'Content-Type': 'application/json', Prefer: 'return=representation,count=exact', ...options.headers }
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new HttpError(403, 'Supabase отклонил доступ. Проверьте роль и политики таблицы.');
      }
      if (response.status === 409) throw new HttpError(409, 'Фильм уже существует в коллекции.');
      throw new HttpError(503, 'Не удалось обратиться к коллекции. Проверьте подключение и права доступа.');
    }
    assert(Array.isArray(data), 'Сервис вернул некорректный список фильмов.', 502);
    return { rows: data, range: response.headers.get('content-range') };
  }
  function sessionResult(data) {
    return {token:data.access_token,refreshToken:data.refresh_token,expires:Math.max(1,Math.min(Number(data.expires_in)||3600,3600)),user:accounts.find(data.user.id)};
  }
  return {
    canWrite, demo: false, searchAvailable: Boolean(env.KINOPOISK_API_KEY),
    async list(token = anon) {
      const rows = []; let total;
      do {
        const page = await db({ select: '*', order: 'id.asc', offset: String(rows.length), limit: '1000' }, {}, token);
        const count = page.range?.split('/')[1];
        if (count && count !== '*') {
          const nextTotal = Number(count);
          assert(total === undefined || total === nextTotal, 'Коллекция изменилась во время загрузки. Обновите страницу.', 409);
          total = nextTotal;
        }
        if (!page.rows.length) { assert(total === undefined || rows.length === total, 'Получена неполная коллекция. Повторите загрузку.', 503); break; }
        rows.push(...page.rows);
        assert(rows.length <= 50000, 'Коллекция слишком велика для одного экспорта.', 413);
      } while (total === undefined || rows.length < total);
      assert(new Set(rows.map(r => String(r.id))).size === rows.length, 'Коллекция изменилась во время загрузки. Повторите загрузку.', 409);
      return rows;
    },
    async get(id, token) { return (await db({ select:'*', id:`eq.${id}`, limit:'1' }, {}, token)).rows[0] ?? null; },
    async insert(row, token) { return (await db({}, { method:'POST', body:JSON.stringify(row) }, token)).rows[0]; },
    async updateReview(row, patch, token) {
      const { rows: result } = await db({}, { method:'POST', body:JSON.stringify({film_id:row.id,previous_row:row,changes:patch}) }, token, 'rpc/films_update_review');
      assert(result.length === 1, 'Фильм изменился в другой вкладке. Обновите его перед сохранением.', 409);
      return result[0];
    },
    async user(token) {
      ready(); if (!token) return null;
      const { response, data } = await upstream(`${base}/auth/v1/user`, { headers:{ apikey:anon, Authorization:`Bearer ${token}` } });
      if ([401,403].includes(response.status)) return null;
      assert(response.ok, 'Не удалось проверить вход. Повторите попытку.', 503);
      return accounts.find(data?.id);
    },
    async login(email, password) {
      ready();
      const {response,data} = await upstream(`${base}/auth/v1/token?grant_type=password`, { method:'POST', headers:{apikey:anon,'Content-Type':'application/json'},body:JSON.stringify({email,password}) });
      if (response.status === 429) throw new HttpError(429, 'Слишком много попыток. Подождите и попробуйте снова.');
      assert(response.status < 500, 'Вход временно недоступен. Повторите попытку.',503);
      assert(response.ok && accounts.find(data.user?.id) && data.access_token && data.refresh_token, 'Не удалось войти. Проверьте данные и доступ к коллекции.', 401);
      return sessionResult(data);
    },
    async refresh(refreshToken) {
      ready();
      const {response,data}=await upstream(`${base}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:{apikey:anon,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:refreshToken})});
      if (response.status===429) throw new HttpError(429,'Подождите немного перед повторным входом.');
      assert(response.status < 500, 'Вход временно недоступен. Повторите попытку.',503);
      assert(response.ok && accounts.find(data.user?.id) && data.access_token && data.refresh_token,'Сессия истекла. Войдите снова.',401);
      return sessionResult(data);
    },
    async logout(token) {
      ready();
      const response=await fetcher(`${base}/auth/v1/logout?scope=local`,{method:'POST',headers:{apikey:anon,Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(12000)}).catch(()=>{throw new HttpError(503,'Не удалось завершить сессию. Повторите выход.');});
      assert(response.ok || [401,403,404].includes(response.status),'Не удалось завершить сессию. Повторите выход.',503);
    },
    async search(params) {
      assert(env.KINOPOISK_API_KEY, 'Поиск по Кинопоиску пока не настроен. Фильм можно добавить вручную.', 503);
      const id=params.get('id'), q=params.get('q')?.trim();
      assert(id ? /^\d{1,10}$/.test(id) : q?.length >= 2 && q.length <= 120, 'Введите название от 2 до 120 символов.');
      const url = id ? `https://kinopoiskapiunofficial.tech/api/v2.2/films/${id}` : `https://kinopoiskapiunofficial.tech/api/v2.1/films/search-by-keyword?keyword=${encodeURIComponent(q)}&page=1`;
      const {response,data} = await upstream(url, { headers:{'X-API-KEY':env.KINOPOISK_API_KEY} });
      assert(response.ok, response.status === 429 ? 'Лимит поиска исчерпан. Попробуйте позже или добавьте фильм вручную.' : 'Кинопоиск временно недоступен. Можно добавить фильм вручную.', 503);
      return id ? { movie:data } : { movies:Array.isArray(data.films) ? data.films.slice(0,20) : [] };
    }
  };
}
