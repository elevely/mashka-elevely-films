export const CRITERIA = ['Эмоции', 'Сюжет и структура', 'Идейная глубина', 'Эстетика и стиль', 'Послевкусие ×1,5'];
export const numeric = value => value !== null && value !== '' && value !== undefined && Number.isFinite(Number(value)) ? Number(value) : null;
export const titleOf = entry => entry.movie?.nameRu || entry.movie?.nameEn || entry.movie?.nameOriginal || 'Без названия';
export const genresOf = entry => Array.isArray(entry.movie?.genres) ? entry.movie.genres.map(g => typeof g === 'string' ? g : g?.genre).filter(g => typeof g === 'string' && g.length > 0) : [];
export const score = value => numeric(value) === null ? '—' : new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(Number(value));
export const mean = values => { const valid = values.map(numeric).filter(v => v !== null); return valid.length ? valid.reduce((a,b) => a+b, 0) / valid.length : null; };
export function rawRating(ratings) {
  if (!Array.isArray(ratings) || ratings.length !== 5 || !ratings.every(v => typeof v === 'number' && Number.isFinite(v))) return null;
  return ratings.reduce((sum, value, i) => sum + value * (i === 4 ? 1.5 : 1), 0) / 5.5 * 10;
}
export function calculateRatings(user, masha) {
  const a = rawRating(user), b = rawRating(masha);
  return { userTotal: a === null ? null : Math.round(a), girlfriendTotal: b === null ? null : Math.round(b), finalRating: a === null || b === null ? null : Math.round((a+b)/2) };
}
export function sameFilm(a, b) {
  const provider = m => String(m?.kinopoiskId || m?.filmId || '');
  if (provider(a) && provider(b) && provider(a) === provider(b)) return true;
  const title = m => String(m?.nameRu || m?.nameEn || m?.nameOriginal || '').trim().toLocaleLowerCase('ru-RU').replace(/\s+/g, ' ');
  return !!title(a) && title(a) === title(b) && String(a?.year || '') === String(b?.year || '');
}
export function statistics(movies) {
  const pairs = movies.filter(m => numeric(m.userTotal) !== null && numeric(m.girlfriendTotal) !== null);
  const gap = m => Math.abs(Number(m.userTotal) - Number(m.girlfriendTotal));
  return {
    count: movies.length,
    userAverage: mean(movies.map(m => m.userTotal)),
    mashaAverage: mean(movies.map(m => m.girlfriendTotal)),
    average: mean(movies.map(m => m.finalRating)),
    averageGap: mean(pairs.map(gap)),
    closeCount: pairs.filter(m => gap(m) <= 10).length,
    pairedCount: pairs.length,
    mostDifferent: [...pairs].sort((a,b) => gap(b) - gap(a))[0] ?? null,
    criteria: CRITERIA.map((_,i) => [mean(movies.map(m => m.userRatings?.[i])), mean(movies.map(m => m.girlfriendRatings?.[i]))])
  };
}
export function selectMovies(movies, { query = '', genre = '', filter = 'all', sort = 'recent' } = {}) {
  const q = query.trim().toLocaleLowerCase('ru-RU');
  const filtered = movies.filter(m => {
    const pair = numeric(m.userTotal) !== null && numeric(m.girlfriendTotal) !== null;
    return (!q || [titleOf(m), m.movie?.nameEn, m.movie?.nameOriginal, m.movie?.year].join(' ').toLocaleLowerCase('ru-RU').includes(q))
      && (!genre || genresOf(m).includes(genre))
      && (filter !== 'favorites' || (pair && Number(m.userTotal) >= 80 && Number(m.girlfriendTotal) >= 80))
      && (filter !== 'different' || (pair && Math.abs(Number(m.userTotal) - Number(m.girlfriendTotal)) >= 20));
  });
  const value = m => sort === 'title' ? titleOf(m) : sort === 'recent' ? (Date.parse(m.dateAdded) || 0) : numeric(m[{rating:'finalRating',masha:'girlfriendTotal',elevely:'userTotal'}[sort]]) ?? -Infinity;
  return filtered.sort((a,b) => sort === 'title' ? value(a).localeCompare(value(b), 'ru') : value(b) - value(a) || String(a.id).localeCompare(String(b.id)));
}
export function safePoster(movie) {
  for (const value of [movie?.posterUrl, movie?.posterUrlPreview]) {
    if (typeof value === 'string' && /^\/assets\/demo-[0-7]\.svg$/.test(value)) return value;
    try { const url = new URL(value); if (url.protocol === 'https:' && !url.username && !url.password) return url.href; } catch { /* local fallback */ }
  }
  return '/assets/poster.svg';
}
