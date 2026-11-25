import { $, esc, openDialog, closeDialog, request, errorBox, submit, toast } from './ui.js';
import { CRITERIA, titleOf, safePoster, calculateRatings, score } from './model.js';

export function account(session, change, next) {
  if (session.authenticated) {
    openDialog(`<h2 id="dialog-title">${esc(session.user?.name || 'Ваш киноклуб')}</h2><p>${session.canWrite ? 'Можно добавлять фильмы и редактировать свои оценки и заметки.' : 'Сейчас коллекция открыта для чтения.'}</p>
      <form id="logout">${errorBox}<button class="button subtle">Выйти</button></form>`);
    submit($('#logout'), async () => { await request('auth','DELETE'); change({...session,authenticated:false,canWrite:false,user:null}); closeDialog(true); });
    return;
  }
  openDialog(`<form id="login" class="login-form"><h2 id="dialog-title">Вход в киноклуб</h2>
    <p class="form-help">Войдите в аккаунт Машки или elevely.</p>
    ${session.demo ? '<p class="access-notice">Тестовый вход: elevely@example.test или mashka@example.test · пароль demo-only</p>' : ''}
    <label class="field">Почта<input name="email" type="email" autocomplete="username" maxlength="254" required></label>
    <label class="field">Пароль<input name="password" type="password" autocomplete="current-password" maxlength="256" required></label>
    ${errorBox}<button class="button primary">Войти</button></form>`);
  submit($('#login'), async data => {
    const user = await request('auth','POST', Object.fromEntries(data));
    change({...session,...user}); closeDialog(true);
    if (user.canWrite && next) next();
  });
}

function own(movie, session) {
  return session.user?.role === 'mashka' ? {name:'Машка',theme:'masha',ratings:movie.girlfriendRatings,note:movie.girlfriendNotes,partner:movie.userRatings} : {name:'elevely',theme:'elevely',ratings:movie.userRatings,note:movie.userNotes,partner:movie.girlfriendRatings};
}
const notesFields = (movie,session) => `<label class="field">Ваша заметка<textarea name="note" maxlength="10000">${esc(own(movie,session).note)}</textarea></label>
  <label class="check-field"><input type="checkbox" name="spoilers" ${movie.hasSpoilers ? 'checked' : ''}>В заметках есть спойлеры (общий флаг фильма)</label>`;
const notesFrom = data => ({note:data.get('note'),hasSpoilers:data.has('spoilers')});
const ratingFields = (movie,session) => {
  const author=own(movie,session);
  return `<fieldset class="rating-fieldset"><legend class="${author.theme}-text">${author.name} · ваши оценки</legend>${CRITERIA.map((c,i) =>
    `<label class="rating-input-row"><span>${esc(c)}</span><input aria-label="${esc(c)}" name="rating-${i}" type="number" step="0.5" min="0" max="10" value="${esc(author.ratings?.[i] ?? '')}" placeholder="—" required></label>`).join('')}</fieldset>`;
};
const ratingsFrom = data => CRITERIA.map((_,i)=>Number(data.get('rating-'+i)));
function preview(form, movie, session) {
  form.addEventListener('input',()=>{
    const data=new FormData(form);
    if(!form.checkValidity()) { $('#preview').textContent='Заполните пять оценок от 0 до 10';return; }
    const mine=ratingsFrom(data),partner=own(movie,session).partner;
    const totals=session.user?.role==='mashka' ? calculateRatings(partner,mine) : calculateRatings(mine,partner);
    $('#preview').textContent=`Машка ${score(totals.girlfriendTotal)} · elevely ${score(totals.userTotal)} · Вместе ${score(totals.finalRating)} / 100`;
  });
}
export function editNotes(movie, onSaved, session) {
  openDialog(`<p class="eyebrow">ВАША РЕЦЕНЗИЯ</p><h2 id="dialog-title">${esc(titleOf(movie))}</h2>
    <form id="notes-form" data-draft>${ratingFields(movie,session)}<p class="preview-total" id="preview">Чужие оценки и заметки сохранятся без изменений</p>
    ${notesFields(movie,session)}${errorBox}
    <p class="form-help">Изменения коснутся только вашей рецензии. Общая оценка появится, когда оценят оба зрителя.</p>
    <div class="dialog-actions"><button class="button primary" name="save-review">Сохранить рецензию</button><button class="button subtle" name="save-note" formnovalidate>Только заметку</button></div></form>`);
  const form=$('#notes-form');preview(form,movie,session);
  submit(form, async (data,event) => {
    const ratings=event.submitter?.name==='save-note' ? {} : {ratings:ratingsFrom(data)};
    const {movie:updated}=await request('movies','PATCH',{id:movie.id,revision:movie.revision,viewer:session.user.role,...ratings,...notesFrom(data)});
    onSaved(updated);toast('Ваша рецензия сохранена');
  });
}

export function chooseMovie(onSaved, session) {
  openDialog(`<h2 id="dialog-title">Что посмотрели?</h2>
    <form id="catalog"><label class="field">Поиск по Кинопоиску<input name="q" type="search" minlength="2" maxlength="120" required></label>
    ${errorBox}<button class="button subtle">Найти фильм</button></form>
    <div id="results" class="search-results" aria-live="polite"></div>
    <details class="manual-details"><summary>Добавить вручную</summary><form id="manual">
    <label class="field">Название<input name="title" required maxlength="500"></label>
    <label class="field">Год (необязательно)<input name="year" type="number" min="1888" max="2100"></label>
    <button class="button primary">Перейти к оценкам</button></form></details>`);
  if(!session.searchAvailable) { $('#catalog').hidden=true; $('.manual-details').open=true; }
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
          if (button.isConnected && $('#modal').open) rateMovie(selected, onSaved, session);
        };
        results.append(button);
      }
    } catch (error) { results.replaceChildren(); throw error; }
  });
  $('#manual').onsubmit = event => {
    event.preventDefault();
    const data = new FormData(event.target), title = data.get('title').trim();
    if (title) rateMovie({nameRu:title,year:Number(data.get('year')) || null},onSaved,session);
  };
}

function rateMovie(movie, onSaved, session) {
  const id = Date.now() * 1000 + crypto.getRandomValues(new Uint16Array(1))[0] % 1000;
  openDialog(`<p class="eyebrow">ПОСЛЕ ПРОСМОТРА</p><h2 id="dialog-title">${esc(titleOf({movie}))}</h2>
    <p class="form-help">Пять ваших оценок от 0 до 10 с шагом 0,5. Послевкусие весит в полтора раза больше остальных критериев. Второй зритель оценит фильм из своего аккаунта.</p>
    <form id="rate" data-draft>${ratingFields({},session)}<p class="preview-total" id="preview">Заполните пять оценок от 0 до 10</p>
    ${notesFields({},session)}${errorBox}<button class="button primary">Сохранить фильм</button></form>`);
  const form = $('#rate');preview(form,{},session);
  submit(form, async data => {
    const result=await request('movies','POST',{id,movie,viewer:session.user.role,ratings:ratingsFrom(data),...notesFrom(data)});
    onSaved(result.movie);toast('Фильм в коллекции · ждём второго зрителя');
  });
}
