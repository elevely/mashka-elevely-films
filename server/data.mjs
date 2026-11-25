import { createHash } from 'node:crypto';
import { calculateRatings } from '../public/lib/model.js';
import { assert } from './errors.mjs';

export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
export const revision = row => createHash('sha256').update(JSON.stringify(canonical(row))).digest('hex');
export function mapRow(row) {
  return {
    id: row.id, movie: row.movie_data, userRatings: row.user_ratings, girlfriendRatings: row.girlfriend_ratings,
    userTotal: row.user_total, girlfriendTotal: row.girlfriend_total, finalRating: row.final_rating,
    dateAdded: row.date_added, userNotes: row.user_notes, girlfriendNotes: row.girlfriend_notes,
    hasSpoilers: row.has_spoilers, revision: revision(row)
  };
}
export function onlyKeys(body, keys) {
  assert(body && typeof body === 'object' && !Array.isArray(body), 'Ожидался JSON-объект.');
  assert(Object.keys(body).every(key => keys.includes(key)), 'Запрос содержит недопустимые поля.');
}
export function validId(id) { assert((typeof id === 'string' && /^\d{1,16}$/.test(id) && Number(id) > 0 && Number.isSafeInteger(Number(id))) || (Number.isSafeInteger(id) && id > 0), 'Некорректный идентификатор.'); return String(id); }
export function validateRatings(ratings) {
  assert(Array.isArray(ratings) && ratings.length === 5 && ratings.every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 10 && Number.isInteger(v*2)), 'Нужно пять оценок от 0 до 10 с шагом 0,5.');
}
function ownFields(actor) {
  assert(['elevely','mashka'].includes(actor?.role), 'Аккаунт зрителя не настроен.', 403);
  return actor.role === 'elevely' ? ['user_ratings','user_notes','user_total'] : ['girlfriend_ratings','girlfriend_notes','girlfriend_total'];
}
function validateNote(body) {
  assert(typeof body.note === 'string' && body.note.length <= 10000, 'Заметка должна содержать не более 10 000 символов.');
  assert(typeof body.hasSpoilers === 'boolean', 'Укажите наличие спойлеров.');
}
export function reviewPatch(body, row, actor) {
  onlyKeys(body, ['id','revision','ratings','note','hasSpoilers','viewer']); validId(body.id);
  assert(typeof body.revision === 'string' && /^[a-f0-9]{64}$/.test(body.revision), 'Обновите страницу перед редактированием.', 409);
  validateNote(body);
  assert(body.viewer===actor?.role,'Аккаунт изменился. Войдите под автором этой рецензии.',409);
  const [ratingsKey,noteKey,totalKey] = ownFields(actor);
  const patch = {[noteKey]:body.note,has_spoilers:body.hasSpoilers};
  if (body.ratings !== undefined) {
    validateRatings(body.ratings);
    // Saving notes must never recalculate historical totals, even if the form sent unchanged ratings.
    if (JSON.stringify(row[ratingsKey]) !== JSON.stringify(body.ratings)) {
      patch[ratingsKey] = body.ratings;
      const merged = {...row,...patch}, totals = calculateRatings(merged.user_ratings,merged.girlfriend_ratings);
      patch[totalKey] = totalKey === 'user_total' ? totals.userTotal : totals.girlfriendTotal;
      patch.final_rating = totals.finalRating;
    }
  }
  return patch;
}
export function newRow(body, now = new Date(), actor) {
  onlyKeys(body, ['id','movie','ratings','note','hasSpoilers','viewer']); validId(body.id);
  validateRatings(body.ratings); validateNote(body);
  assert(body.viewer===actor?.role,'Аккаунт изменился. Войдите под автором этой рецензии.',409);
  const [ratingsKey,noteKey] = ownFields(actor);
  const m = body.movie;
  assert(m && typeof m === 'object' && !Array.isArray(m), 'Выберите фильм.');
  assert(typeof (m.nameRu || m.nameEn || m.nameOriginal) === 'string' && (m.nameRu || m.nameEn || m.nameOriginal).trim().length > 0, 'Укажите название фильма.');
  assert(JSON.stringify(m).length <= 30000, 'Слишком много информации о фильме.');
  for (const field of ['nameRu','nameEn','nameOriginal','description']) if (m[field] !== undefined && m[field] !== null) assert(typeof m[field] === 'string' && m[field].length <= (field === 'description' ? 10000 : 500), 'Некорректные сведения о фильме.');
  if (m.year != null) assert(Number.isInteger(Number(m.year)) && Number(m.year) >= 1888 && Number(m.year) <= 2100, 'Проверьте год фильма.');
  if (m.genres != null) assert(Array.isArray(m.genres) && m.genres.every(g => typeof g === 'string' || typeof g?.genre === 'string'), 'Проверьте жанры фильма.');
  for (const key of ['kinopoiskId','filmId']) if (m[key] != null) assert(/^\d{1,10}$/.test(String(m[key])), 'Некорректный ID Кинопоиска.');
  const row = { id: Number(body.id), movie_data: m, user_ratings: null, girlfriend_ratings: null,
    user_notes:'',girlfriend_notes:'',has_spoilers:body.hasSpoilers,date_added:now.toISOString(),[ratingsKey]:body.ratings,[noteKey]:body.note };
  const totals = calculateRatings(row.user_ratings,row.girlfriend_ratings);
  return {...row,user_total:totals.userTotal,girlfriend_total:totals.girlfriendTotal,final_rating:totals.finalRating};
}
