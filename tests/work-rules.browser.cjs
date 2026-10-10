/* Local browser checks only. No live Google account or external requests. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const originalHtml = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
// Historical account-specific bootstrap data is deliberately excluded from this
// isolated UI harness. The generic work-rule migration and all forms/renderers
// execute unchanged, with synthetic storage fixtures only.
const legacyStart = originalHtml.indexOf('// 旧版が件名の単語');
const genericStart = originalHtml.indexOf('// v8.4.87: Preserve every record');
assert.ok(legacyStart > 0 && genericStart > legacyStart);
const html = originalHtml.slice(0, legacyStart) + originalHtml.slice(genericStart);
const origin = 'http://127.0.0.1:43127';
(async () => {
  const browser = await chromium.launch({headless: true, ...(process.env.CHROMIUM_PATH ? {executablePath: process.env.CHROMIUM_PATH} : {})});
  try {
    for (const viewport of [{width: 1280, height: 900}, {width: 390, height: 844}]) {
      const context = await browser.newContext({viewport, timezoneId: 'Asia/Tokyo', serviceWorkers: 'block'});
      const page = await context.newPage();
      await page.clock.install({time: new Date('2026-10-10T03:00:00Z')});
      page.setDefaultTimeout(10000);
      const errors = [], dialogs = [];
      const capture = async name => { assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Page should not overflow horizontally'); if (process.env.SCREENSHOT_DIR) { fs.mkdirSync(process.env.SCREENSHOT_DIR, {recursive: true}); await page.screenshot({path: path.join(process.env.SCREENSHOT_DIR, `${viewport.width}-${name}.png`), fullPage: true}); } };
      page.on('pageerror', error => errors.push(error.message));
      page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin === origin && url.pathname === '/') return route.fulfill({status: 200, contentType: 'text/html', body: html});
        if (url.origin === origin) return route.fulfill({status: 200, contentType: 'application/json', body: '{}'});
        return route.abort();
      });
      await page.addInitScript(() => {
        if (localStorage.getItem('synthetic_ui_seeded') === '1') return;
        localStorage.setItem('synthetic_ui_seeded', '1');
        const date = new Date(), today = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        localStorage.setItem('toshi_v5', JSON.stringify({items: [
          {title: 'Synthetic historical work', type: 'todo', start: '2026-10-01', end: '', done: true, custom: 'preserved'},
          {title: 'Synthetic appointment', type: 'event', date: today, allDay: true, project: 'TOSHI', done: false},
          {title: 'Synthetic opening-date ToDo', type: 'todo', start: today, date: today, endDate: today, end: '', source: 'google', hubTodo: true, project: 'TASK', done: false},
          {title: 'Synthetic timed task', type: 'task', date: today, endDate: today, start: today, end: '', time: '14:30', allDay: false, source: 'google', hubTodo: true, project: 'TASK', done: false}
        ], money: []}));
      });
      await page.goto(origin + '/');
      await page.waitForFunction(() => document.getElementById('todayLabel').textContent.length > 0);
      const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('toshi_v5')));
      const first = (await stored()).items[0];
      assert.equal(first.type, 'task'); assert.equal(first.done, true); assert.equal(first.custom, 'preserved');
      assert.equal((await stored()).items.length, 4);
      await page.locator('[data-go="todos"]').click();
      const openingRow = page.locator('#todoRows .row').filter({hasText: 'Synthetic opening-date ToDo'});
      assert.match(await openingRow.innerText(), /期限日未設定/);
      assert.doesNotMatch(await openingRow.innerText(), /期限なし/);
      assert.match(await page.locator('#todoRows .row').filter({hasText: 'Synthetic timed task'}).innerText(), /14:30/);
      await page.locator('[data-go="calendar"]').click();
      assert.equal(await page.locator('#weekList .weekevent').filter({hasText: 'Synthetic opening-date ToDo'}).locator('.weektime').innerText(), 'ToDo');
      assert.equal(await page.locator('#weekList .weekevent').filter({hasText: 'Synthetic timed task'}).locator('.weektime').innerText(), '14:30');
      await page.locator('[data-go="todos"]').click();
      await page.locator('#plus').click();
      await page.locator('#title').fill('Synthetic cancelled work');
      await page.locator('#close').click();
      assert.equal(await page.locator('#modal').isVisible(), false);
      assert.equal((await stored()).items.length, 4);
      await page.locator('#plus').click();
      assert.equal(await page.locator('#workKind').inputValue(), 'task');
      assert.equal(await page.locator('#todoEnd').isDisabled(), true);
      assert.equal(await page.locator('#deadlineFields').isVisible(), false);
      await capture('task-form');
      await page.locator('#title').fill('Synthetic undated task');
      await page.locator('#todoStart').fill('');
      await page.locator('#form').evaluate(form => { form.requestSubmit(); form.requestSubmit(); });
      let item = (await stored()).items[0];
      assert.equal(item.type, 'task'); assert.equal(item.end, ''); assert.equal(item.date, '');
      assert.equal(item.syncState, undefined); assert.equal(item.hubGoogleId, undefined);
      assert.equal((await stored()).items.filter(x => x.title === 'Synthetic undated task').length, 1);
      await page.locator('[data-filter="none"]').click();
      assert.match(await page.locator('#todoRows').innerText(), /Synthetic undated task/);
      await page.locator('#todoRows .row').filter({hasText: 'Synthetic undated task'}).locator('[data-toggle]').click();
      assert.equal((await stored()).items.find(x => x.title === 'Synthetic undated task').done, true);
      await page.reload();
      assert.equal((await stored()).items.find(x => x.title === 'Synthetic undated task').done, true);
      await page.locator('[data-go="todos"]').click();
      await page.locator('[data-filter="all"]').click();
      await page.locator('#plus').click();
      await page.locator('#title').fill('Synthetic explicit deadline');
      await page.locator('#workKind').selectOption('todo');
      assert.equal(await page.locator('#todoEnd').inputValue(), '');
      assert.equal(await page.locator('#todoEnd').isDisabled(), false);
      assert.equal(await page.locator('#todoEnd').evaluate(el => el.required), true);
      const before = (await stored()).items.length;
      await page.locator('#form button.save').click();
      assert.equal((await stored()).items.length, before);
      assert.equal(await page.locator('#modal').isVisible(), true);
      // An invalid range is rejected, then a valid date is retained exactly.
      await page.locator('#todoStart').fill('2026-10-20');
      await page.locator('#todoEnd').fill('2026-10-19');
      await page.locator('#form button.save').click();
      assert.equal((await stored()).items.length, before);
      assert.ok(dialogs.some(message => message.includes('期限日は開始日以降')));
      await page.locator('#todoEnd').fill('2026-10-21');
      await page.locator('#deadlineTime').fill('16:30');
      await capture('todo-form');
      await page.locator('#form button.save').click();
      item = (await stored()).items[0];
      assert.equal(item.type, 'todo'); assert.equal(item.end, '2026-10-21'); assert.equal(item.deadlineTime, '16:30');
      assert.equal(item.syncState, 'pending'); assert.match(item.hubGoogleId, /^hub/);
      await page.locator('[data-filter="deadline"]').click();
      assert.match(await page.locator('#todoRows').innerText(), /Synthetic explicit deadline/);
      assert.doesNotMatch(await page.locator('#todoRows').innerText(), /Synthetic undated task/);
      await page.locator('#plus').click();
      assert.equal(await page.locator('#workKind').inputValue(), 'task');
      assert.equal(await page.locator('#todoEnd').inputValue(), '');
      assert.equal(await page.locator('#deadlineTime').inputValue(), '');
      // Switching from a required deadline to an event must disable the hidden input.
      await page.locator('#workKind').selectOption('todo');
      await page.locator('#form [data-type="event"]').click();
      assert.equal(await page.locator('#todoEnd').isDisabled(), true);
      await page.locator('#title').fill('Synthetic new appointment');
      await page.locator('#form button.save').click();
      assert.equal((await stored()).items[0].type, 'event');
      assert.equal(await page.locator('#modal').isVisible(), false);
      // Switching to money must not retain hidden required deadline validation.
      await page.locator('[data-go="todos"]').click();
      await page.locator('#plus').click();
      await page.locator('#workKind').selectOption('todo');
      await page.locator('#form [data-type="money"]').click();
      assert.equal(await page.locator('#todoEnd').isDisabled(), true);
      await page.locator('#title').fill('Synthetic money entry');
      await page.locator('#amount').fill('100');
      const itemCount = (await stored()).items.length;
      await page.locator('#form button.save').click();
      assert.equal((await stored()).items.length, itemCount);
      assert.equal((await stored()).money.length, 1);
      // Reusing a modal after entering and then removing a deadline creates a task.
      await page.locator('[data-go="todos"]').click();
      await page.locator('#plus').click();
      await page.locator('#title').fill('Synthetic dated task');
      await page.locator('#todoStart').fill('2026-10-22');
      await page.locator('#workKind').selectOption('todo');
      await page.locator('#todoEnd').fill('2026-10-23');
      await page.locator('#deadlineTime').fill('09:00');
      await page.locator('#workKind').selectOption('task');
      await page.locator('#form button.save').click();
      item = (await stored()).items[0];
      assert.equal(item.type, 'task'); assert.equal(item.end, ''); assert.equal(item.deadlineTime, '');
      assert.equal(item.date, '2026-10-22'); assert.equal(item.endDate, '2026-10-22'); assert.equal(item.syncState, 'pending');
      await page.locator('[data-filter="all"]').click();
      await capture('work-list');
      // Calendar week/month and Gantt paths render tasks without exceptions.
      await page.locator('[data-go="calendar"]').click();
      await page.evaluate(() => { showDay('2026-10-22'); renderCal(); });
      assert.match(await page.locator('#weekList').innerText(), /Synthetic dated task/);
      await page.locator('#monthViewBtn').click();
      assert.match(await page.locator('#cal').innerText(), /Synthetic dated task/);
      await capture('month-view');
      await page.locator('[data-go="gantt"]').click();
      assert.equal(await page.locator('#ganttGrid').isVisible(), true);
      assert.match(await page.locator('#ganttGrid').innerText(), /Synthetic dated task/);
      assert.deepEqual(errors, []);
      console.log(`PASS ${viewport.width}px: synthetic migration, task/deadline forms, validation, completion, filters, type switching, calendar/Gantt render`);
      await context.close();
    }
    // Full unmodified startup smoke: never print content or capture screenshots.
    const smokeContext = await browser.newContext({timezoneId: 'Asia/Tokyo', serviceWorkers: 'block'});
    const smoke = await smokeContext.newPage();
    await smoke.clock.install({time: new Date('2026-10-10T03:00:00Z')});
    let startupErrors = 0;
    smoke.on('pageerror', () => startupErrors++);
    await smokeContext.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === origin && url.pathname === '/') return route.fulfill({status: 200, contentType: 'text/html', body: originalHtml});
      if (url.origin === origin) return route.fulfill({status: 200, contentType: 'application/json', body: '{}'});
      return route.abort();
    });
    await smoke.goto(origin + '/');
    await smoke.waitForFunction(() => document.getElementById('todayLabel').textContent.length > 0);
    await smoke.waitForFunction(() => document.getElementById('weekList').children.length > 0);
    assert.equal(startupErrors, 0, 'Full startup JavaScript error count');
    console.log(`PASS full unchanged startup: ${startupErrors} JavaScript errors; external network blocked`);
    await smokeContext.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
