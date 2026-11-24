// Run after npm run demo. The target is intentionally fixed to the local synthetic server.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
const {chromium} = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = 'http://localhost:4173';
const browser = await chromium.launch();
try {
  const page = await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',msg=>{if(msg.type()==='error') errors.push(msg.text());});
  await page.goto(root);
  await page.locator('#demo-banner').waitFor();
  await page.locator('[data-movie]').first().waitFor();
  assert.equal(await page.locator('.movie-card').count(),8);
  await mkdir('test-results',{recursive:true});
  await page.screenshot({path:'test-results/desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'test-results/mobile.png',fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.locator('[data-movie="1700000000000"]').first().click();
  assert.equal(await page.locator('#dialog-title').textContent(),'Там, где свет');
  assert.equal(await page.locator('dialog .accent-text').first().textContent(),'93');
  assert.equal(await page.getByText('Тестовая заметка Машки.',{exact:false}).isVisible(),false);
  await page.locator('.spoiler-details summary').click();
  assert.equal(await page.locator('.note-box script').count(),0);
  assert.match(await page.locator('.notes-grid').innerText(),/<script>/);
  await page.screenshot({path:'test-results/mobile-detail.png'});
  await page.keyboard.press('Escape');
  await page.locator('#collection-search').fill('Последний');
  assert.equal(await page.locator('.movie-card').count(),1);
  await page.locator('#collection-search').fill('');
  await page.locator('[data-view=stats]').click();
  await page.locator('.stat-panel').first().waitFor();
  await page.locator('[data-view=collection]').click();
  await page.locator('#add-button').click();
  await page.locator('[name=email]').fill('demo@example.test');
  await page.locator('[name=password]').fill('demo-only');
  await page.locator('#login button').click();
  await page.locator('[name=q]').fill('Новый');
  await page.locator('#catalog button').click();
  await page.locator('.search-result').first().click();
  await page.locator('#rate').waitFor();
  const criteria = page.locator('#rate input[type=number]');
  assert.equal(await criteria.count(),10);
  for (const field of await criteria.all()) await field.fill('8');
  await page.locator('#rate textarea[name=userNotes]').fill('Только тестовая запись');
  assert.equal(await page.locator('#rate').evaluate(form=>form.checkValidity()),true);
  const [created] = await Promise.all([
    page.waitForResponse(r=>r.url()===root+'/api/movies' && r.request().method()==='POST'),
    page.locator('#rate button').click()
  ]);
  assert.equal(created.status(),201,await created.text());
  await page.locator('#edit-notes').click();
  await page.locator('#notes-form textarea[name=userNotes]').fill('Новая заметка после просмотра');
  await page.locator('#notes-form button').click();
  await page.getByText('Новая заметка после просмотра',{exact:true}).waitFor();
  await page.reload();
  await page.locator('.movie-card').filter({hasText:'Новый тестовый фильм'}).getByRole('button').click();
  assert.equal(await page.getByText('Новая заметка после просмотра',{exact:true}).isVisible(),true);
  assert.deepEqual(errors,[]);
  // Inject a single request failure and verify recovery through the actual UI.
  await page.route('**/api/movies',route=>route.abort(),{times:1});
  await page.reload();
  await page.locator('#retry').click();
  await page.locator('.movie-card').first().waitFor();
  console.log('Browser checks passed: desktop, mobile, scores, spoilers, login, search, insert, notes, reload, network recovery, console.');
} finally { await browser.close(); }
