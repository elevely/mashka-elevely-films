// Explicitly isolated loopback demo; never accepts a production URL or credentials.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
const {chromium} = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const port=process.env.DEMO_PORT || '4173';
assert.match(port,/^\d{4,5}$/);
const root=`http://localhost:${port}`;
const browser=await chromium.launch();
const errors=[];
const track=page=>page.on('pageerror',error=>errors.push(error.message));
async function login(page,role) {
  await page.locator('#account-button').click();
  await page.locator('[name=email]').fill(role+'@example.test');
  await page.locator('[name=password]').fill('demo-only');
  await page.locator('#login button').click();
  await page.locator('#modal').waitFor({state:'hidden'});
  assert.equal(await page.locator('#account-label').textContent(),role==='mashka'?'Машка':'elevely');
}
async function logout(page) {
  await page.locator('[data-close]').click();
  await page.locator('#account-button').click();
  await page.locator('#logout button').click();
  await page.locator('#modal').waitFor({state:'hidden'});
  assert.equal(await page.locator('#account-label').textContent(),'Войти');
}
async function rate(page,value) {
  await page.locator('form [name=rating-4]').waitFor();
  const fields=page.locator('form input[type=number]');assert.equal(await fields.count(),5);
  for(const field of await fields.all())await field.fill(value);
}
try {
  const e=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1});
  const page=await e.newPage();track(page);
  await page.goto(root);await page.locator('.movie-card').first().waitFor();
  const initial=await (await page.request.get(root+'/api/movies')).json();assert.equal(initial.demo,true);
  assert.equal(await page.locator('.movie-card').count(),8);
  await mkdir('test-results',{recursive:true});
  await page.screenshot({path:'test-results/desktop.png',fullPage:true});
  for(const width of [320,390,768,1440]) {
    await page.setViewportSize({width,height:844});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Overflow at ${width}`);
  }
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'test-results/mobile.png',fullPage:true});
  await page.locator('[data-movie="1700000000000"]').first().click();
  assert.equal(await page.locator('#dialog-title').textContent(),'Там, где свет');
  assert.equal(await page.locator('dialog .accent-text').first().textContent(),'93');
  assert.equal(await page.locator('#edit-notes').count(),0);
  assert.equal(await page.getByText('Тестовая заметка Машки.',{exact:false}).isVisible(),false);
  await page.locator('.spoiler-details summary').click();assert.equal(await page.locator('.note-box script').count(),0);
  assert.match(await page.locator('.notes-grid').innerText(),/<script>/);
  await page.screenshot({path:'test-results/mobile-detail.png'});
  await page.keyboard.press('Escape');
  await page.locator('#collection-search').fill('Последний');assert.equal(await page.locator('.movie-card').count(),1);
  await page.locator('#collection-search').fill('');
  await page.locator('#genre-filter').selectOption('фантастика');assert.equal(await page.locator('.movie-card').count(),2);
  await page.locator('#genre-filter').selectOption('');
  await page.locator('[data-filter=favorites]').click();assert.equal(await page.locator('.movie-card').count(),2);
  await page.locator('[data-filter=all]').click();
  await page.locator('#sort-order').selectOption('rating');assert.match(await page.locator('.movie-card').first().innerText(),/Там, где свет/);
  await page.locator('[data-view=stats]').click();await page.locator('.stat-panel').first().waitFor();
  await page.locator('[data-view=collection]').click();
  await page.locator('#account-button').click();
  await page.locator('[name=email]').fill('elevely@example.test');await page.locator('[name=password]').fill('wrong');
  await page.locator('#login button').click();await page.locator('#login [role=alert]').waitFor();
  await page.locator('[name=password]').fill('demo-only');await page.locator('#login button').click();
  await page.locator('#modal').waitFor({state:'hidden'});
  await page.locator('#add-button').click();await page.locator('[name=q]').fill('Новый');await page.locator('#catalog button').click();
  await page.locator('.search-result').first().click();await page.locator('#rate').waitFor();
  await rate(page,'8');await page.locator('#rate textarea[name=note]').fill('Только тестовая запись');
  const [created]=await Promise.all([page.waitForResponse(r=>r.url()===root+'/api/movies'&&r.request().method()==='POST'),page.locator('#rate button').click()]);
  assert.equal(created.status(),201,await created.text());const added=(await created.json()).movie;
  assert.equal(added.userTotal,80);assert.equal(added.girlfriendTotal,null);assert.equal(added.finalRating,null);
  await page.locator('#edit-notes').click();await page.locator('#notes-form textarea[name=note]').fill('Новая заметка после просмотра');
  await page.locator('[name=save-note]').click();await page.getByText('Новая заметка после просмотра',{exact:true}).waitFor();
  await page.reload();await page.locator('#account-label').filter({hasText:'elevely'}).waitFor();
  await page.locator(`[data-movie="${added.id}"]`).first().click();assert.equal(await page.getByText('Новая заметка после просмотра',{exact:true}).isVisible(),true);
  await logout(page);await login(page,'elevely');
  await page.locator(`[data-movie="${added.id}"]`).first().click();assert.equal(await page.getByText('Новая заметка после просмотра',{exact:true}).isVisible(),true);
  await page.locator('[data-close]').click();
  // Simulate an expired access cookie while retaining this device's HttpOnly refresh cookie.
  await e.clearCookies({name:'films_session'});await page.reload();await page.locator('#account-label').filter({hasText:'elevely'}).waitFor();
  const cookies=await e.cookies();assert.ok(cookies.filter(c=>c.name.startsWith('films_')).every(c=>c.httpOnly&&c.sameSite==='Strict'));

  const m=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const mobile=await m.newPage();track(mobile);await mobile.goto(root);await mobile.locator('.movie-card').first().waitFor();
  await login(mobile,'mashka');await mobile.locator(`[data-movie="${added.id}"]`).first().click();await mobile.locator('#edit-notes').click();
  assert.match(await mobile.locator('.rating-fieldset legend').innerText(),/Машка/);
  await rate(mobile,'10');await mobile.locator('[name=note]').fill('Машка: моя отдельная заметка');
  await mobile.locator('[name=save-review]').click();await mobile.getByText('Машка: моя отдельная заметка',{exact:true}).waitFor();
  assert.equal(await mobile.locator('dialog .accent-text').textContent(),'90');
  // Refresh on another device, then verify own editing keeps Mashka's fields intact.
  await page.reload();await page.locator(`[data-movie="${added.id}"]`).first().click();assert.equal(await page.locator('dialog .accent-text').textContent(),'90');
  await page.locator('#edit-notes').click();await rate(page,'9');await page.locator('[name=save-review]').click();
  await page.locator('#edit-notes').waitFor();assert.equal(await page.locator('dialog .accent-text').textContent(),'95');
  await page.screenshot({path:'test-results/mobile-shared-review.png'});
  // A stale draft from the other device receives 409 and keeps the written text.
  await mobile.locator('#edit-notes').click();await mobile.locator('[name=note]').fill('Несохранённый черновик');
  await mobile.locator('[name=save-note]').click();await mobile.locator('#notes-form [role=alert]').waitFor();
  assert.match(await mobile.locator('#notes-form [role=alert]').innerText(),/другой вкладке/);
  assert.equal(await mobile.locator('[name=note]').inputValue(),'Несохранённый черновик');
  mobile.once('dialog',d=>d.accept());await mobile.locator('[data-close]').click();
  // Duplicate catalog additions fail without creating a second film.
  await page.locator('[data-close]').click();await page.locator('#add-button').click();
  await page.locator('[name=q]').fill('Новый');await page.locator('#catalog button').click();await page.locator('.search-result').first().click();
  await rate(page,'8');await page.locator('#rate button').click();await page.locator('#rate [role=alert]').waitFor();
  assert.match(await page.locator('#rate [role=alert]').innerText(),/уже есть/);
  page.once('dialog',d=>d.accept());await page.locator('[data-close]').click();
  // Manual addition and failed writes preserve the draft for retry.
  await page.locator('#add-button').click();await page.locator('.manual-details summary').click();
  await page.locator('#manual [name=title]').fill('Ручной тестовый фильм');await page.locator('#manual button').click();await rate(page,'7.5');
  await page.route('**/api/movies',route=>route.abort(),{times:1});await page.locator('#rate button').click();await page.locator('#rate [role=alert]').waitFor();
  assert.equal(await page.locator('[name=rating-0]').inputValue(),'7.5');
  await page.locator('#rate button').click();await page.locator('#edit-notes').waitFor();await page.locator('[data-close]').click();
  // Read recovery and export work after reconnecting.
  await page.route('**/api/movies',route=>route.abort(),{times:1});await page.reload();await page.locator('#retry').click();await page.locator('.movie-card').first().waitFor();
  const download=page.waitForEvent('download');await page.locator('#export-button').click();assert.match((await download).suggestedFilename(),/mashka-elevely/);
  const final=await (await page.request.get(root+'/api/movies')).json();assert.equal(final.movies.length,10);
  for(const original of initial.movies)assert.deepEqual(final.movies.find(r=>r.id===original.id),original,'Historic synthetic record changed');
  const result=final.movies.find(r=>r.id===added.id);assert.equal(result.userTotal,90);assert.equal(result.girlfriendTotal,100);assert.equal(result.finalRating,95);assert.equal(result.girlfriendNotes,'Машка: моя отдельная заметка');
  assert.deepEqual(errors,[]);
  console.log('Browser passed: 4 widths, guest/read, XSS, search/filter/sort, statistics, both logins, wrong password, search/add, own rating/note edits, logout/re-login, cookie refresh, two devices, conflicts, duplicate refusal, manual add, network retries, export, historical integrity.');
} finally { await browser.close(); }
