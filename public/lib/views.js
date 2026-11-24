import {esc} from './ui.js';
import {CRITERIA, score, numeric, titleOf, safePoster, genresOf, selectMovies, statistics, mean} from './model.js';

const meta = m => [m.movie?.year,...genresOf(m).slice(0,2)].filter(Boolean).map(esc).join(' · ');
export function card(m, rank) {
  return `<article class="movie-card"><button class="card-button" data-movie="${esc(m.id)}">
    <div class="poster-wrap"><img class="poster" loading="lazy" decoding="async" src="${esc(safePoster(m.movie))}" alt="">
    ${rank ? '<span class="poster-badge">ТОП ' + rank + '</span>' : ''}
    <div class="poster-rating"><strong>${score(m.finalRating)}</strong><span>/ 100</span></div><span class="poster-open" aria-hidden="true">↗</span></div>
    <div class="card-meta">${meta(m)}</div><h3>${esc(titleOf(m))}</h3>
    <div class="card-scores"><span>Машка <b class="masha-score">${score(m.girlfriendTotal)}</b></span><span>elevely <b class="elevely-score">${score(m.userTotal)}</b></span></div>
    </button></article>`;
}

export function detail(m, canWrite) {
  const spoiler = m.hasSpoilers || /спойлер/i.test([m.girlfriendNotes,m.userNotes].join(' '));
  const notes = `<div class="notes-grid">${[['Машка',m.girlfriendNotes,'masha'],['elevely',m.userNotes,'elevely']].map(([name,n,c]) =>
    `<section class="note-box"><h3 class="${c}-text">${name}</h3><p>${esc(n || 'Пока без заметок.')}</p></section>`).join('')}</div>`;
  const date = m.dateAdded && Date.parse(m.dateAdded);
  return `<div class="detail-header"><img class="detail-poster" src="${esc(safePoster(m.movie))}" alt=""><div>
    <h2 id="dialog-title" class="dialog-title">${esc(titleOf(m))}</h2><p class="muted">${meta(m)}</p>
    <div class="detail-summary">${[['Машка',m.girlfriendTotal,'masha'],['Вместе',m.finalRating,'accent'],['elevely',m.userTotal,'elevely']].map(([n,v,c]) =>
    `<div><strong class="${c}-text">${score(v)}</strong><small>${n}</small></div>`).join('')}</div></div></div>
    ${m.movie?.description ? `<p class="detail-description">${esc(m.movie.description)}</p>` : ''}
    <p class="muted">${date ? 'Добавлен ' + new Date(date).toLocaleDateString('ru-RU') : 'Дата добавления не указана'}${numeric(m.movie?.ratingKinopoisk)===null ? '' : ' · Кинопоиск '+score(m.movie.ratingKinopoisk)}</p>
    <table class="rating-table"><caption>Оценки по критериям</caption><thead><tr><th>Критерий</th><th>Машка</th><th>elevely</th><th>Среднее</th></tr></thead>
    <tbody>${CRITERIA.map((c,i) => {const a=m.girlfriendRatings?.[i],b=m.userRatings?.[i];
      return `<tr><td>${esc(c)}</td><td>${score(a)}</td><td>${score(b)}</td><td>${score(numeric(a)!==null && numeric(b)!==null ? mean([a,b]) : null)}</td></tr>`;}).join('')}</tbody></table>
    <h3 class="small-heading">После титров</h3>${spoiler ? `<details class="spoiler-details"><summary>Показать заметки со спойлерами</summary>${notes}</details>` : notes}
    ${canWrite ? '<button class="button subtle" id="edit-notes">Редактировать заметки</button>' : ''}`;
}

function ranking(movies, sort, label, key) {
  const rows = selectMovies(movies,{sort}).filter(m => numeric(m[key]) !== null).slice(0,5);
  return `<section class="stat-panel"><h3>${label}</h3><div class="stat-list">${rows.map((m,i) =>
    `<button data-movie="${esc(m.id)}"><span class="rank">${i+1}</span><span class="stat-name">${esc(titleOf(m))}</span><strong>${score(m[key])}</strong></button>`).join('') || 'Пока нет оценок.'}</div></section>`;
}
export function statsView(movies) {
  if (!movies.length) return '<p class="state-panel">Статистика появится после первого фильма с оценками.</p>';
  const s=statistics(movies), d=s.mostDifferent;
  const ranked=selectMovies(movies,{sort:'rating'}).filter(m=>numeric(m.finalRating)!==null);
  const last=ranked.at(-1);
  return `<div class="stats-panels"><section class="stat-panel"><h3>Средняя разница между нами</h3><strong class="stat-large">${score(s.averageGap)}</strong><p>баллов из 100 · по ${s.pairedCount} фильмам с двумя оценками</p>
    ${d ? `<p>Больше всего разошлись во мнениях о фильме «${esc(titleOf(d))}» — на ${score(Math.abs(d.userTotal-d.girlfriendTotal))} баллов.</p>` : ''}</section>
    <section class="stat-panel"><h3>Оценки по критериям</h3><table class="rating-table"><thead><tr><th>Критерий</th><th>Машка</th><th>elevely</th></tr></thead><tbody>${CRITERIA.map((c,i)=>`<tr><td>${esc(c)}</td><td>${score(s.criteria[i][1])}</td><td>${score(s.criteria[i][0])}</td></tr>`).join('')}</tbody></table></section>
    ${ranking(movies,'rating','Общий топ','finalRating')}<section class="stat-panel"><h3>Общая оценка</h3><strong class="stat-large">${score(s.average)}</strong><p>среднее из 100</p>
    ${last ? `<p>Самая низкая оценка — ${score(last.finalRating)} у фильма «${esc(titleOf(last))}».</p>` : ''}</section>
    ${ranking(movies,'masha','Топ Машки','girlfriendTotal')}${ranking(movies,'elevely','Топ elevely','userTotal')}</div>`;
}
