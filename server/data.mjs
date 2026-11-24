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
function notes(body) {
  for (const field of ['userNotes','girlfriendNotes']) assert(typeof body[field] === 'string' && body[field].length <= 10000, 'Заметка должна содержать не более 10 000 символов.');
  assert(typeof body.hasSpoilers === 'boolean', 'Укажите наличие спойлеров.');
  return { user_notes: body.userNotes, girlfriend_notes: body.girlfriendNotes, has_spoilers: body.hasSpoilers };
}
export function notePatch(body) {
  onlyKeys(body, ['id','revision','userNotes','girlfriendNotes','hasSpoilers']); validId(body.id);
  assert(typeof body.revision === 'string' && /^[a-f0-9]{64}$/.test(body.revision), 'Обновите страницу перед редактированием.', 409);
  return notes(body);
}
export function newRow(body, now = new Date()) {
  onlyKeys(body, ['id','movie','userRatings','girlfriendRatings','userNotes','girlfriendNotes','hasSpoilers']); validId(body.id);
  for (const key of ['userRatings','girlfriendRatings']) assert(Array.isArray(body[key]) && body[key].length === 5 && body[key].every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 10 && Number.isInteger(v*2)), 'Нужно пять оценок от 0 до 10 с шагом 0,5.');
  const m = body.movie;
  assert(m && typeof m === 'object' && !Array.isArray(m), 'Выберите фильм.');
  assert(typeof (m.nameRu || m.nameEn || m.nameOriginal) === 'string' && (m.nameRu || m.nameEn || m.nameOriginal).trim().length > 0, 'Укажите название фильма.');
  assert(JSON.stringify(m).length <= 30000, 'Слишком много информации о фильме.');
  for (const field of ['nameRu','nameEn','nameOriginal','description']) if (m[field] !== undefined && m[field] !== null) assert(typeof m[field] === 'string' && m[field].length <= (field === 'description' ? 10000 : 500), 'Некорректные сведения о фильме.');
  if (m.genres != null) assert(Array.isArray(m.genres) && m.genres.every(g => typeof g === 'string' || typeof g?.genre === 'string'), 'Проверьте жанры фильма.');
  const totals = calculateRatings(body.userRatings, body.girlfriendRatings);
  return { id: Number(body.id), movie_data: m, user_ratings: body.userRatings, girlfriend_ratings: body.girlfriendRatings,
    user_total: totals.userTotal, girlfriend_total: totals.girlfriendTotal, final_rating: totals.finalRating,
    date_added: now.toISOString(), ...notes(body) };
}
