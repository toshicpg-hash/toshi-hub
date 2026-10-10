const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
function block(from, to) { return html.slice(html.indexOf(from), html.indexOf(to, html.indexOf(from))); }
const code = block('function nextDate(', '\nlet savedGoogleSyncFrom=') + '\n' +
  block('function previousDate(', '\ndata.items.forEach(x=>{') + '\n' +
  block('function classifyUndatedLocalWork(', '\nclassifyUndatedLocalWork(data.items);') + '\n' +
  block('function spansDay(', '\nfunction moneyRow(') + '\n' +
  block('function renderTodos(', '\nfunction renderMoney(');
function setup(events = [], items = []) {
  const writes = [];
  const ctx = vm.createContext({
    Date, Map, Set, console, TODAY: '2026-10-10', N: new Date('2026-10-10T12:00:00Z'),
    data: {items, money: []}, googleAccessToken: 'synthetic-test-token',
    googleSyncing: false, googleSyncQueued: false, googleStatus: {},
    googleTokenClient: null, filter: 'all', todoRows: {},
    document: {getElementById: () => ({value: '2020-01-01'})},
    localStorage: {getItem: () => null, setItem: () => {}},
    cachedGoogleStatus: () => '', save: () => {},
    fetch: async (url, options = {}) => {
      if (options.method) { writes.push({url, ...options, body: JSON.parse(options.body)}); return {ok: true, status: 200, json: async () => ({})}; }
      if (url.includes('calendarList')) return {ok: true, json: async () => ({items: [{id: 'synthetic-calendar', summary: 'TASK'}]})};
      if (url.includes('?')) return {ok: true, json: async () => ({items: events})};
      return {ok: true, json: async () => events.find(e => url.endsWith('/' + e.id))};
    }
  });
  vm.runInContext(code, ctx);
  return {ctx, writes};
}
function event(id, summary, props = {}) {
  return {id, summary, start: {date: '2026-10-10'}, end: {date: '2026-10-11'}, ...props};
}
test('all inline scripts, service worker and JSON manifest parse; visible/cache versions agree', () => {
  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
  const sw = fs.readFileSync(require('node:path').join(__dirname, '../sw.js'), 'utf8');
  new vm.Script(sw);
  const manifest = JSON.parse(fs.readFileSync(require('node:path').join(__dirname, '../manifest.json'), 'utf8'));
  const version = html.match(/<title>TOSHI HUB (v[\d.]+)<\/title>/)[1];
  assert.ok(sw.includes(version)); assert.ok(manifest.description.includes(version));
});
test('explicit task marker beats stale todo metadata and preserves completed history', async () => {
  const original = event('synthetic-task', '✅【タスク】Example work', {description: 'Original history', extendedProperties: {private: {toshiHubType: 'todo', toshiHubEnd: '2026-10-10', toshiHubDone: 'false', custom: 'keep'}}});
  const {ctx, writes} = setup([original]);
  await ctx.loadGoogleCalendar();
  const x = ctx.data.items[0];
  assert.equal(x.type, 'task'); assert.equal(x.done, true); assert.equal(x.title, 'Example work');
  assert.equal(x.end, ''); assert.equal(x.deadlineTime, '');
  assert.equal(x.date, '2026-10-10'); assert.equal(x.endDate, '2026-10-10');
  assert.equal(x.googleDescription, 'Original history'); assert.equal(x.googlePrivateProperties.custom, 'keep');
  assert.equal(writes.length, 0);
});
test('calendar dates and opening dates are not deadlines; true todo with unknown date stays todo', async () => {
  const {ctx} = setup([event('opening', '【ToDo】Example approval opening'), event('appointment', '✅ Example appointment')]);
  await ctx.loadGoogleCalendar();
  const [todo, appointment] = ctx.data.items;
  assert.equal(todo.type, 'todo'); assert.equal(todo.end, ''); assert.equal(todo.date, '2026-10-10');
  assert.match(ctx.itemRow(todo, 0), /期限日未設定/);
  assert.equal(appointment.type, 'event'); assert.equal(appointment.done, false);
  assert.equal(ctx.spansDay(todo, '2026-10-10'), true);
});
test('explicit deadline date is independent of calendar opening date', async () => {
  const {ctx} = setup([event('deadline', '【ToDo】Example submission', {extendedProperties: {private: {toshiHubType: 'todo', toshiHubDeadlineDate: '2026-10-20'}}})]);
  await ctx.loadGoogleCalendar();
  assert.equal(ctx.data.items[0].date, '2026-10-10'); assert.equal(ctx.data.items[0].end, '2026-10-20');
});
test('task payload separates calendar placement from deadline and uses explicit marker', () => {
  const {ctx} = setup();
  const body = ctx.googleTodoBody({type: 'task', title: 'Example task', date: '2026-10-12', endDate: '2026-10-13', done: true, end: 'old-deadline', deadlineTime: '09:00'});
  assert.equal(body.summary, '✅【タスク】Example task'); assert.equal(body.start.date, '2026-10-12');
  assert.equal(body.end.date, '2026-10-14'); assert.equal(body.extendedProperties.private.toshiHubDeadlineDate, '');
  assert.equal(body.extendedProperties.private.toshiHubEnd, ''); assert.equal(body.extendedProperties.private.toshiHubDone, 'true');
});
test('todo payload retains explicit deadline time and date', () => {
  const {ctx} = setup();
  const body = ctx.googleTodoBody({type: 'todo', title: 'Example deadline', start: '2026-10-10', end: '2026-10-20', deadlineTime: '16:30'});
  assert.equal(body.summary, '【ToDo】Example deadline');
  assert.equal(body.extendedProperties.private.toshiHubDeadlineDate, '2026-10-20');
  assert.equal(body.start.dateTime, '2026-10-20T16:30:00+09:00');
});
test('completion sync reads current classification and never restores stale ToDo prefix', async () => {
  const current = event('changed', '【タスク】Renamed task', {extendedProperties: {private: {toshiHubType: 'todo', toshiHubDeadlineDate: '2026-10-10', custom: 'preserve'}}});
  const pending = {type: 'todo', title: 'Old title', source: 'google', hubTodo: true, externalTodo: true, done: true, syncState: 'pendingDone', googleId: 'changed', googleCalendarId: 'synthetic-calendar'};
  const {ctx, writes} = setup([current], [pending]);
  await ctx.flushGoogleTodos('synthetic-calendar');
  assert.equal(writes.length, 1); const patch = writes[0].body;
  assert.equal(patch.summary, '✅【タスク】Renamed task');
  assert.equal(patch.extendedProperties.private.toshiHubType, 'task');
  assert.equal(patch.extendedProperties.private.toshiHubDeadlineDate, '');
  assert.equal(patch.extendedProperties.private.custom, 'preserve');
  assert.equal(patch.start, undefined); assert.equal(patch.end, undefined);
  assert.equal(pending.done, true); assert.equal(pending.type, 'task'); assert.equal(pending.syncState, 'synced');
});
test('completion sync stops safely if source was changed into an ordinary appointment', async () => {
  const pending = {type: 'todo', title: 'Example', done: true, syncState: 'pendingDone', googleId: 'ordinary', googleCalendarId: 'synthetic-calendar'};
  const {ctx, writes} = setup([event('ordinary', 'Ordinary appointment')], [pending]);
  await ctx.flushGoogleTodos('synthetic-calendar');
  assert.equal(writes.length, 0); assert.equal(pending.done, true); assert.equal(pending.syncState, 'conflict'); assert.equal(pending.completionConflict.done, true);
});
test('local reclassification is idempotent, preserves all records/completion, and does not rewrite older history', () => {
  const {ctx} = setup();
  const items = [{type: 'todo', start: '2026-10-01', end: '', done: true, custom: 'keep'}, {type: 'todo', start: '2026-08-01', end: '', done: true}, {type: 'todo', end: '2026-10-20', done: false}, {type: 'event', date: '2026-10-10'}, {type: 'todo', source: 'google', done: true, end: ''}];
  const count = items.length; ctx.classifyUndatedLocalWork(items); const once = JSON.stringify(items); ctx.classifyUndatedLocalWork(items);
  assert.equal(items.length, count); assert.equal(JSON.stringify(items), once);
  assert.equal(items[0].type, 'task'); assert.equal(items[0].done, true); assert.equal(items[0].custom, 'keep'); assert.equal(items[0].date, '2026-10-01');
  assert.equal(items[1].type, 'todo'); assert.equal(items[2].type, 'todo'); assert.equal(items[3].type, 'event'); assert.equal(items[4].type, 'todo');
});
test('task filters and calendar spans use task dates, not deadline fields', () => {
  const {ctx} = setup([], [{type: 'task', title: 'Example task', date: '2026-10-10', endDate: '2026-10-12', end: '', done: false}, {type: 'todo', title: 'Example todo', end: '2026-10-10', done: false}]);
  ctx.filter = 'none'; ctx.renderTodos(); assert.match(ctx.todoRows.innerHTML, /Example task/); assert.doesNotMatch(ctx.todoRows.innerHTML, /Example todo/);
  ctx.filter = 'today'; ctx.renderTodos(); assert.doesNotMatch(ctx.todoRows.innerHTML, /Example task/); assert.match(ctx.todoRows.innerHTML, /Example todo/);
  assert.equal(ctx.spansDay(ctx.data.items[0], '2026-10-11'), true); assert.equal(ctx.spansDay(ctx.data.items[0], '2026-10-13'), false);
});
test('a classification-only title change never clears an existing completed metadata flag', () => {
  const {ctx} = setup();
  const state = ctx.googleWorkState(event('completed', '【タスク】Example completed work', {extendedProperties: {private: {toshiHubType: 'todo', toshiHubDone: 'true'}}}), 'TASK');
  assert.equal(state.type, 'task'); assert.equal(state.done, true);
});
test('multi-day todo without a deadline preserves every calendar day of its historical span', async () => {
  const {ctx} = setup([event('span', '✅【ToDo】Example historical work', {end: {date: '2026-10-14'}})]);
  await ctx.loadGoogleCalendar(); const x = ctx.data.items[0];
  assert.equal(x.end, ''); assert.equal(x.done, true);
  for (const day of ['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13']) assert.equal(ctx.spansDay(x, day), true);
  assert.equal(ctx.spansDay(x, '2026-10-14'), false);
});

test('an ordinary-event completion conflict does not block calendar refresh or discard local completion', async () => {
  const pending = {type: 'todo', title: 'Example', source: 'google', done: true, syncState: 'pendingDone', googleId: 'ordinary', googleCalendarId: 'synthetic-calendar'};
  const {ctx, writes} = setup([event('ordinary', 'Ordinary appointment'), event('other', '【タスク】Another work item')], [pending]);
  await ctx.loadGoogleCalendar();
  assert.equal(writes.length, 0); assert.equal(ctx.data.items.length, 2);
  const conflict = ctx.data.items.find(x => x.googleId === 'ordinary');
  assert.equal(conflict.type, 'event'); assert.equal(conflict.done, true); assert.equal(conflict.completionConflict.done, true);
  assert.equal(conflict.syncState, 'conflict'); assert.match(ctx.googleStatus.textContent, /保留/);
});
test('bare completion emoji without a work marker does not override metadata on reopen', () => {
  const {ctx} = setup();
  const state = ctx.googleWorkState(event('bare', '✅ Example title', {extendedProperties: {private: {toshiHubType: 'task', toshiHubDone: 'false'}}}), 'TASK');
  assert.equal(state.type, 'task'); assert.equal(state.done, false);
});
test('completion sync does not reinterpret markers in non-TASK calendars', async () => {
  const current = event('elsewhere', '【ToDo】Example title', {extendedProperties: {private: {toshiHubType: 'task', toshiHubDone: 'false'}}});
  const pending = {type: 'task', title: 'Example title', done: true, syncState: 'pendingDone', googleId: 'elsewhere', googleCalendarId: 'other-calendar'};
  const {ctx, writes} = setup([current], [pending]);
  await ctx.flushGoogleTodos('synthetic-calendar');
  assert.equal(writes[0].body.extendedProperties.private.toshiHubType, 'task'); assert.equal(writes[0].body.summary, undefined);
});
test('failed sync leaves the complete cached dataset intact', async () => {
  const items = [{type: 'task', title: 'Cached example', done: true, source: 'google', googleId: 'cached', date: '2026-10-10', endDate: '2026-10-10'}];
  const {ctx} = setup([], items); const before = JSON.stringify(ctx.data);
  ctx.fetch = async () => ({ok: false, status: 503});
  await ctx.loadGoogleCalendar();
  assert.equal(JSON.stringify(ctx.data), before); assert.match(ctx.googleStatus.textContent, /同期失敗/);
});
test('a repeated completion change while the request is in flight remains pending for retry', async () => {
  const pending = {type: 'task', title: 'Example repeated toggle', done: true, syncState: 'pendingDone', googleId: 'repeat', googleCalendarId: 'synthetic-calendar'};
  const {ctx, writes} = setup([event('repeat', '【タスク】Example repeated toggle')], [pending]);
  const fetch = ctx.fetch;
  ctx.fetch = async (url, options) => { const result = await fetch(url, options); if (options?.method === 'PATCH') pending.done = false; return result; };
  await ctx.flushGoogleTodos('synthetic-calendar');
  assert.equal(writes[0].body.summary, '✅【タスク】Example repeated toggle');
  assert.equal(pending.done, false); assert.equal(pending.syncState, 'pendingDone');
});
test('completed marker-only task can be reopened by clearing both marker and private completion', async () => {
  const pending = {type: 'task', title: 'Completed work', done: false, syncState: 'pendingDone', googleId: 'reopen', googleCalendarId: 'synthetic-calendar'};
  const {ctx, writes} = setup([event('reopen', '✅【タスク】Completed work')], [pending]);
  await ctx.flushGoogleTodos('synthetic-calendar');
  assert.equal(writes[0].body.summary, '【タスク】Completed work');
  assert.equal(writes[0].body.extendedProperties.private.toshiHubDone, 'false');
});
test('new-entry Close binds the DOM button explicitly, not the native window.close function', () => {
  assert.match(html, /document\.getElementById\('close'\)\.onclick=\(\)=>modal\.style\.display='none'/);
  assert.doesNotMatch(html, /[;}](?:\s*)close\.onclick/);
});
