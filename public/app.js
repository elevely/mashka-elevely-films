import {$, esc, openDialog, request, download, toast} from './lib/ui.js';
import {selectMovies, statistics, genresOf, safePoster, score, numeric} from './lib/model.js';
import {editNotes, chooseMovie, account} from './lib/editor.js';
import {card, detail, statsView} from './lib/views.js';

let movies = [], loaded = false, limit = 24, session = {}, loading = false;
const query = new URLSearchParams(location.search);
const options = {query:query.get('q') || '', sort:query.get('sort') || 'recent', genre:query.get('genre') || '', filter:query.get('filter') || 'all'};
const ticket = $('#hero-posters').innerHTML;
let ranks = new Map();
function renderSession(next) {
  session = next;
  $('#demo-banner').hidden = !session.demo;
  $('#account-label').textContent = session.authenticated ? (session.user?.name || 'Мой аккаунт') : 'Войти';
  $('.status-dot').classList.toggle('online', Boolean(session.authenticated));
  $('#access-notice').hidden = !session.authenticated || session.canWrite;
  $('#access-notice').textContent = 'Коллекция доступна для чтения. Запись пока отключена.';
  $('#add-button').disabled = !!session.authenticated && !session.canWrite;
}
function openMovie(id) {
  const m = movies.find(row => String(row.id) === String(id));
  if (!m) return;
  openDialog(detail(m, session.canWrite));
  if (session.canWrite) $('#edit-notes').onclick = () => editNotes(m, saved, session);
}
function saved(m) {
  movies = [m, ...movies.filter(row => String(row.id)!==String(m.id))];
  if (loaded) renderAll();
  else loadMovies();
  openMovie(m.id);
}
function renderGrid() {
  if (!loaded) return;
  const visible = selectMovies(movies,options);
  const status = $('#collection-status');
  status.hidden = visible.length > 0;
  if (!visible.length) status.innerHTML = movies.length
    ? '<h3>Совпадений нет</h3><p>Попробуйте другое название, жанр или подборку.</p><button class="button subtle" id="clear">Сбросить фильтры</button>'
    : '<h3>Коллекция пока пуста</h3><p>Добавьте первый фильм после совместного просмотра.</p>';
  $('#movies-grid').innerHTML = visible.slice(0,limit).map(m => card(m,ranks.get(m.id))).join('');
  $('#load-more').hidden = limit >= visible.length;
  for (const button of document.querySelectorAll('[data-filter]')) {
    const selected = button.dataset.filter === options.filter;
    button.classList.toggle('selected',selected); button.setAttribute('aria-pressed',String(selected));
  }
  const url = new URL(location.href);
  for (const [k,v] of Object.entries({q:options.query,genre:options.genre,filter:options.filter==='all'?'':options.filter,sort:options.sort==='recent'?'':options.sort})) {
    if (v) url.searchParams.set(k,v); else url.searchParams.delete(k);
  }
  history.replaceState(null,'',url);
}
function renderAll() {
  const s = statistics(movies);
  const values = [s.count,score(s.mashaAverage),score(s.userAverage),s.closeCount+' / '+s.pairedCount];
  document.querySelectorAll('#summary strong').forEach((el,i) => el.textContent=values[i]);
  $('#summary div:last-child span').textContent = 'разница не больше 10 баллов';
  $('#collection-count').textContent = s.count;
  const sorted = selectMovies(movies,{sort:'rating'}).filter(m=>numeric(m.finalRating)!==null);
  ranks = new Map(sorted.slice(0,10).map((m,i)=>[m.id,i+1]));
  const covers = sorted.filter(m=>safePoster(m.movie)!=='/assets/poster.svg').slice(0,3);
  $('#hero-posters').innerHTML = covers.length===3 ? [covers[1],covers[2],covers[0]].map(m=>`<img class="hero-poster" src="${esc(safePoster(m.movie))}" alt="">`).join('') : ticket;
  const genres = [...new Set(movies.flatMap(genresOf))].sort((a,b)=>a.localeCompare(b,'ru'));
  $('#genre-filter').innerHTML = '<option value="">Все жанры</option>' + genres.map(g=>`<option value="${esc(g)}">${esc(g)}</option>`).join('');
  $('#genre-filter').value = genres.includes(options.genre) ? options.genre : '';
  options.genre = $('#genre-filter').value;
  $('#stats-content').innerHTML = statsView(movies);
  $('#export-button').disabled = !loaded;
  renderGrid();
}
async function loadMovies(quiet = false) {
  if (loading) return;
  loading = true;
  const status = $('#collection-status');
  if (!quiet) { status.hidden = false; status.textContent='Загружаем коллекцию…'; }
  $('#movies-grid').setAttribute('aria-busy','true');
  try {
    const result=await request('movies');
    if (!Array.isArray(result.movies)) throw new Error('Ответ коллекции не распознан.');
    movies=result.movies; loaded=true; $('#demo-banner').hidden=!result.demo; renderAll();
  } catch(error) {
    if (quiet) { toast(error.message);return; }
    status.innerHTML=`<h3>Коллекция недоступна</h3><p>${esc(error.message)}</p><button class="button primary" id="retry">Повторить загрузку</button>`;
    $('#stats-content').innerHTML='<p class="state-panel">Для статистики нужно загрузить коллекцию. <a href="#collection">К коллекции →</a></p>';
  } finally { loading=false; $('#movies-grid').setAttribute('aria-busy','false'); }
}
function changeView() {
  const stats=location.hash==='#stats';
  $('#stats').hidden=!stats; $('#collection').hidden=stats;
  document.querySelectorAll('[data-view]').forEach(a=>a.classList.toggle('active',a.dataset.view===(stats?'stats':'collection')));
}
document.addEventListener('click',event=>{
  const button=event.target.closest('button');
  if (!button) return;
  if (button.dataset.movie) openMovie(button.dataset.movie);
  if (button.dataset.filter) { options.filter=button.dataset.filter; limit=24; renderGrid(); }
  if (button.id==='retry') loadMovies();
  if (button.id==='clear') {
    options.filter='all'; options.genre=''; options.query=''; limit=24;
    $('#collection-search').value=''; $('#genre-filter').value=''; renderGrid();
  }
});
$('#collection-search').value=options.query;
$('#sort-order').value=options.sort;
if (!$('#sort-order').value) $('#sort-order').value=options.sort='recent';
if (!['all','favorites','different'].includes(options.filter)) options.filter='all';
for (const [id,key,event] of [['collection-search','query','input'],['genre-filter','genre','change'],['sort-order','sort','change']]) {
  $('#'+id).addEventListener(event,e=>{options[key]=e.target.value; limit=24; renderGrid();});
}
$('#load-more').onclick=()=>{limit+=24; renderGrid();};
$('#add-button').onclick=()=>session.authenticated ? chooseMovie(saved,session) : account(session,renderSession,()=>chooseMovie(saved,session));
$('#account-button').onclick=()=>account(session,renderSession);
$('#export-button').onclick=async()=>{
  try {
    const data=session.authenticated ? await request('movies?export=1') : {format:'public-collection',exportedAt:new Date().toISOString(),movies};
    download(data); toast('Коллекция экспортирована в JSON');
  } catch(error) { toast(error.message); }
};
window.addEventListener('hashchange',changeView);
changeView();
loadMovies();
request('auth').then(result=>{
  renderSession(result);
  if (['/admin','/admin.html'].includes(location.pathname)) account(session,renderSession);
}).catch(error=>toast(error.message));

// Refresh shared data when returning to a device and periodically while browsing.
// A draft stays intact; its revision detects concurrent changes on save.
async function sync() {
  if (document.hidden || $('#modal').open) return;
  try { renderSession(await request('auth')); } catch(error) { toast(error.message); }
  if(loaded) await loadMovies(true);
}
window.addEventListener('focus',sync);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync();});
setInterval(sync,60000);

window.addEventListener('films-session-expired',()=>renderSession({...session,authenticated:false,canWrite:false,user:null}));
