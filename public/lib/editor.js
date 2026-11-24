import { $, esc, openDialog, closeDialog, request, errorBox, submit, toast } from './ui.js';
import { CRITERIA, titleOf, safePoster, calculateRatings, score } from './model.js';

export function account(session, change, next) {
  if (session.authenticated) {
    openDialog(`<h2 id="dialog-title">Ваш киноклуб</h2><p>${session.canWrite ? 'Можно добавлять фильмы и редактировать заметки.' : 'Сейчас коллекция открыта для чтения.'}</p>
      <form id="logout">${errorBox}<button class="button subtle">Выйти</button></form>`);
    submit($('#logout'), async () => { await request('auth','DELETE'); change({...session,authenticated:false,canWrite:false}); closeDialog(true); });
    return;
  }
  openDialog(`<form id="login" class="login-form"><h2 id="dialog-title">Вход в киноклуб</h2>
    <p class="form-help">Войдите в аккаунт Машки или elevely.</p>
    ${session.demo ? '<p class="access-notice">Тестовый вход: demo@example.test / demo-only</p>' : ''}
    <label class="field">Почта<input name="email" type="email" autocomplete="username" maxlength="254" required></label>
    <label class="field">Пароль<input name="password" type="password" autocomplete="current-password" maxlength="256" required></label>
    ${errorBox}<button class="button primary">Войти</button></form>`);
  submit($('#login'), async data => {
    const user = await request('auth','POST', Object.fromEntries(data));
    change({...session,...user}); closeDialog(true);
    if (user.canWrite && next) next();
  });
}

const notesFields = movie => `<div class="notes-grid">
  <label class="field masha-text">Заметки Машки<textarea name="girlfriendNotes" maxlength="10000">${esc(movie.girlfriendNotes)}</textarea></label>
  <label class="field elevely-text">Заметки elevely<textarea name="userNotes" maxlength="10000">${esc(movie.userNotes)}</textarea></label></div>
  <label class="check-field"><input type="checkbox" name="spoilers" ${movie.hasSpoilers ? 'checked' : ''}>В заметках есть спойлеры</label>`;
const notesFrom = data => ({ userNotes:data.get('userNotes'), girlfriendNotes:data.get('girlfriendNotes'), hasSpoilers:data.has('spoilers') });

export function editNotes(movie, onSaved) {
  openDialog(`<p class="eyebrow">ЗАМЕТКИ ПОСЛЕ ПРОСМОТРА</p><h2 id="dialog-title">${esc(titleOf(movie))}</h2>
    <form id="notes-form" data-draft>${notesFields(movie)}${errorBox}
    <div class="dialog-actions"><button class="button primary">Сохранить заметки</button></div></form>`);
  submit($('#notes-form'), async data => {
    const {movie:updated} = await request('movies','PATCH',{id:movie.id, revision:movie.revision, ...notesFrom(data)});
    onSaved(updated); toast('Заметки сохранены');
  });
}

export function chooseMovie(onSaved) {
  openDialog(`<h2 id="dialog-title">Что посмотрели?</h2>
    <form id="catalog"><label class="field">Поиск по Кинопоиску<input name="q" type="search" minlength="2" maxlength="120" required></label>
    ${errorBox}<button class="button subtle">Найти фильм</button></form>
    <div id="results" class="search-results" aria-live="polite"></div>
    <details class="manual-details"><summary>Добавить вручную</summary><form id="manual">
    <label class="field">Название<input name="title" required maxlength="500"></label>
    <label class="field">Год (необязательно)<input name="year" type="number" min="1888" max="2100"></label>
    <button class="button primary">Перейти к оценкам</button></form></details>`);
  const results = $('#results');
  submit($('#catalog'), async data => {
    results.textContent = 'Ищем…';
    try {
      const {movies} = await request('search?q=' + encodeURIComponent(data.get('q').trim()));
      results.textContent = movies.length ? '' : 'Ничего не найдено. Попробуйте другое название.';
      for (const movie of movies) {
        const button = document.createElement('button');
        button.className = 'search-result';
        button.innerHTML = `<img src="${esc(safePoster(movie))}" alt=""><span><strong>${esc(titleOf({movie}))}</strong><small>${esc(movie.year)}</small></span>`;
        button.onclick = async () => {
          const buttons = [...results.querySelectorAll('button')];
          buttons.forEach(b => b.disabled = true);
          let selected = movie;
          try {
            const id = movie.filmId || movie.kinopoiskId;
            if (id) selected = (await request('search?id=' + encodeURIComponent(id))).movie;
          } catch { toast('Подробности недоступны. Использованы сведения из поиска.'); }
          finally { buttons.forEach(b => b.disabled = false); }
          if (button.isConnected && $('#modal').open) rateMovie(selected, onSaved);
        };
        results.append(button);
      }
    } catch (error) { results.replaceChildren(); throw error; }
  });
  $('#manual').onsubmit = event => {
    event.preventDefault();
    const data = new FormData(event.target), title = data.get('title').trim();
    if (title) rateMovie({nameRu:title,year:Number(data.get('year')) || null},onSaved);
  };
}

function rateMovie(movie, onSaved) {
  const id = Date.now() * 1000 + crypto.getRandomValues(new Uint16Array(1))[0] % 1000;
  const columns = [['girlfriendRatings','Машка','masha'],['userRatings','elevely','elevely']].map(([name, author, theme]) =>
    `<fieldset class="rating-fieldset"><legend class="${theme}-text">${author}</legend>${CRITERIA.map((c,i) =>
      `<label class="rating-input-row"><span>${esc(c)}</span><input name="${name}-${i}" type="number" step="0.5" min="0" max="10" placeholder="—" required></label>`).join('')}</fieldset>`).join('');
  openDialog(`<p class="eyebrow">ОЦЕНКИ ПОСЛЕ ПРОСМОТРА</p><h2 id="dialog-title">${esc(titleOf({movie}))}</h2>
    <p class="form-help">Поставьте десять оценок от 0 до 10 с шагом 0,5. Послевкусие весит в полтора раза больше остальных критериев.</p>
    <form id="rate" data-draft><div class="form-grid">${columns}</div><p class="preview-total" id="preview">Заполните оценки обоих зрителей</p>
    ${notesFields({})}${errorBox}<p class="form-help">Проверьте оценки перед сохранением. Позже можно редактировать заметки.</p>
    <button class="button primary">Сохранить фильм</button></form>`);
  const form = $('#rate');
  const ratings = (data,key) => CRITERIA.map((_,i) => Number(data.get(key+'-'+i)));
  form.oninput = () => {
    const data = new FormData(form);
    if (!form.checkValidity()) { $('#preview').textContent = 'Заполните оценки обоих зрителей'; return; }
    const totals = calculateRatings(ratings(data,'userRatings'),ratings(data,'girlfriendRatings'));
    $('#preview').textContent = `Машка ${score(totals.girlfriendTotal)} · elevely ${score(totals.userTotal)} · Вместе ${score(totals.finalRating)} / 100`;
  };
  submit(form, async data => {
    const result = await request('movies','POST',{id,movie,userRatings:ratings(data,'userRatings'),girlfriendRatings:ratings(data,'girlfriendRatings'),...notesFrom(data)});
    onSaved(result.movie); toast('Фильм в коллекции');
  });
}
