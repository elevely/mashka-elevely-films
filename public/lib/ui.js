export const $ = selector => document.querySelector(selector);
export const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
})[char]);

let refreshing;
async function refreshSession() {
  if (!refreshing) {
    const run = () => request('auth','PUT',undefined,undefined,false);
    refreshing = (navigator.locks ? navigator.locks.request('films-auth-refresh',run) : run()).finally(()=>{refreshing=undefined;});
  }
  return refreshing;
}
export async function request(path, method = 'GET', body, signal, retry = true) {
  let response;
  try {
    response = await fetch('/api/' + path, {
      method, credentials: 'same-origin', cache: 'no-store',
      headers: body ? {'Content-Type':'application/json'} : {},
      body: body ? JSON.stringify(body) : undefined,
      signal: signal || AbortSignal.timeout(22000)
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error('Нет ответа от сервера. Проверьте соединение и повторите попытку.');
  }
  const result = await response.json().catch(() => { throw new Error('Сервер вернул нечитаемый ответ.'); });
  if (retry && ((response.status === 401 && path !== 'auth') || (path === 'auth' && method === 'GET' && !result.authenticated && result.hasSession))) {
    await refreshSession();
    return request(path,method,body,signal,false);
  }
  if (!response.ok && response.status===401 && !(path==='auth' && method==='POST')) window.dispatchEvent(new Event('films-session-expired'));
  if (!response.ok) throw Object.assign(new Error(result.error || 'Не удалось выполнить запрос.'), {status:response.status});
  return result;
}

const modal = $('#modal');
let dirty = false;
let pending = false;
export const markDirty = () => { dirty = true; };
export function openDialog(html) {
  dirty = false;
  $('#dialog-content').innerHTML = html;
  if (!modal.open) modal.showModal();
  modal.scrollTop = 0;
  $('#dialog-title')?.setAttribute('tabindex', '-1');
  $('#dialog-title')?.focus({preventScroll:true});
}
export function closeDialog(force = false) {
  if (!force && (pending || (dirty && !confirm('Закрыть форму и потерять несохранённые изменения?')))) return;
  dirty = false;
  modal.close();
}
$('[data-close]').onclick = () => closeDialog();
modal.addEventListener('cancel', event => { event.preventDefault(); closeDialog(); });
modal.addEventListener('input', event => { if (event.target.closest('[data-draft]')) markDirty(); });
window.addEventListener('beforeunload', event => { if (dirty) {event.preventDefault(); event.returnValue='';} });
export const errorBox = '<p class="form-error" role="alert" hidden></p>';
export function submit(form, save) {
  form.onsubmit = async event => {
    event.preventDefault();
    if (pending) return;
    pending = true;
    const error = form.querySelector('[role=alert]');
    const fields = [...form.elements].filter(el => !el.disabled);
    const data = new FormData(form);
    fields.forEach(el => el.disabled = true);
    error.hidden = true;
    try { await save(data,event); }
    catch (cause) { error.textContent = cause.message;
      if (cause.status === 401 && form.hasAttribute('data-draft')) {
        error.textContent += ' Откройте вход в новой вкладке, затем вернитесь к этой форме и повторите сохранение.';
      }
      error.hidden = false; }
    finally { fields.forEach(el => el.disabled = false); pending = false; }
  };
}
let timer;
export function toast(message) {
  const target = $('#toast');
  target.textContent = message; target.hidden = false;
  clearTimeout(timer); timer = setTimeout(() => target.hidden = true, 5000);
}
export function download(data) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data,null,2)], {type:'application/json'}));
  const a = document.createElement('a');
  a.href = url; a.download = 'mashka-elevely-' + new Date().toISOString().slice(0,10) + '.json';
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500);
}
document.addEventListener('error', event => {
  if (event.target instanceof HTMLImageElement && !event.target.src.endsWith('/assets/poster.svg')) event.target.src = '/assets/poster.svg';
}, true);
