const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');

const root = __dirname;
const source = fs.readFileSync(path.join(root, 'src/native.js'), 'utf8');
let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log('PASS:', name);
}
function bridge({host = true, throws = false, now = 100000} = {}) {
  const messages = [];
  const clock = {now};
  const window = host ? {webkit: {messageHandlers: {questNative: {
    postMessage(value) {
      if (throws) throw new Error('Native host unavailable');
      messages.push(JSON.parse(JSON.stringify(value)));
    }
  }}}} : {};
  const context = vm.createContext({window, Date: {now: () => clock.now}});
  vm.runInContext(source, context);
  return {api: vm.runInContext('QuestNative', context), messages, clock};
}
const active = (overrides = {}) => ({
  status: 'active', deadline: 400000, index: 0, mode: 'standard',
  tasks: ['人に見せない課題内容'], ...overrides
});

check('The website works without an iPhone host and sends no native requests', () => {
  const {api, messages} = bridge({host: false});
  assert.equal(api.available, false);
  for (const call of [() => api.post('probe'), () => api.speak('案内'),
    () => api.cancelSpeech(), () => api.exportBackup('{}'),
    () => api.importBackup(), () => api.haptic(),
    () => api.syncBattle(active(), true), () => api.syncBattle(null, false)]) {
    assert.equal(call(), false);
  }
  assert.equal(messages.length, 0);
  assert.equal(api._reminderKey, '');
});

check('Native speech, cancellation, backup sharing, file import and haptics use the host', () => {
  const {api, messages} = bridge();
  const json = '{"version":4,"task":"日本語・改行\\nと引用符\\\"を保持"}';
  assert.equal(api.available, true);
  assert.equal(api.speak('残り4分です。'), true);
  assert.equal(api.cancelSpeech(), true);
  assert.equal(api.exportBackup(json), true);
  assert.equal(api.importBackup(), true);
  assert.equal(api.haptic('success'), true);
  assert.deepEqual(messages, [
    {action: 'speak', text: '残り4分です。'},
    {action: 'cancelSpeech'},
    {action: 'export', json},
    {action: 'import'},
    {action: 'haptic', style: 'success'}
  ]);
});

check('Speech input has a bounded size before crossing into iOS', () => {
  const {api, messages} = bridge();
  api.speak('あ'.repeat(600));
  assert.equal(messages[0].text.length, 500);
  api.speak(123);
  assert.equal(messages[1].text, '123');
});

check('A disconnected native handler fails safely and does not record a successful reminder', () => {
  const {api, messages} = bridge({throws: true});
  assert.equal(api.post('probe'), false);
  assert.equal(api.speak('案内'), false);
  assert.equal(api.exportBackup('{}'), false);
  assert.equal(api.importBackup(), false);
  assert.equal(api.syncBattle(active(), true), false);
  assert.equal(api._reminderKey, '');
  assert.equal(messages.length, 0);
});

check('An active task schedules its deadline without exposing the task on the lock screen', () => {
  const {api, messages} = bridge();
  assert.equal(api.syncBattle(active(), true), true);
  assert.equal(messages.length, 1);
  const reminder = messages[0];
  assert.equal(reminder.action, 'scheduleReminder');
  assert.equal(reminder.seconds, 300);
  assert.equal(typeof reminder.title, 'string');
  assert.equal(typeof reminder.body, 'string');
  assert(reminder.title.length && reminder.body.length);
  assert(!JSON.stringify(reminder).includes('人に見せない課題内容'));
});

check('Repeated saves and timer ticks do not duplicate the same notification', () => {
  const {api, messages, clock} = bridge();
  api.syncBattle(active(), true);
  clock.now += 60000;
  for (let i = 0; i < 10; i++) assert.equal(api.syncBattle(active(), true), false);
  assert.equal(messages.length, 1);
});

check('A new task or deadline replaces the reminder instead of reusing an obsolete time', () => {
  const {api, messages} = bridge();
  api.syncBattle(active(), true);
  assert.equal(api.syncBattle(active({index: 1, deadline: 700000}), true), true);
  assert.equal(messages.length, 2);
  assert.equal(messages[1].action, 'scheduleReminder');
  assert.equal(messages[1].seconds, 600);
  assert.equal(api.syncBattle(active({index: 2, deadline: 700000}), true), true);
  assert.equal(messages.length, 3);
});

check('Turning time guidance off cancels reminders and turning it back on reschedules', () => {
  const {api, messages} = bridge();
  api.syncBattle(active(), true);
  assert.equal(api.syncBattle(active(), false), true);
  assert.equal(messages.at(-1).action, 'clearReminders');
  assert.equal(api.syncBattle(active(), false), false);
  assert.equal(api.syncBattle(active(), true), true);
  assert.equal(messages.at(-1).action, 'scheduleReminder');
  assert.equal(messages.length, 3);
});

check('Finishing, retiring, losing, preparing the next tasks or returning home clears reminders', () => {
  for (const battle of [active({status: 'won'}), active({status: 'retired'}),
    active({status: 'lost'}), active({status: 'paused', deadline: null}), null]) {
    const {api, messages} = bridge();
    api.syncBattle(active(), true);
    assert.equal(api.syncBattle(battle, true), true);
    assert.equal(messages.at(-1).action, 'clearReminders');
    assert.equal(api.syncBattle(battle, true), false);
    assert.equal(messages.length, 2);
  }
});

check('Invalid imported deadlines cannot become native notification intervals', () => {
  for (const deadline of [null, undefined, NaN, Infinity, '400000']) {
    const {api, messages} = bridge();
    api.syncBattle(active({deadline}), true);
    assert.deepEqual(messages, [{action: 'clearReminders'}]);
  }
});

check('A deadline reached during an animation never sends a zero or negative interval', () => {
  const {api, messages} = bridge({now: 500000});
  api.syncBattle(active(), true);
  assert.equal(messages[0].seconds, 1);
});

check('A reconnected native host can synchronize the same active task again', () => {
  const {api, messages} = bridge();
  api.syncBattle(active(), true);
  api._reminderKey = '';
  assert.equal(api.syncBattle(active(), true), true);
  assert.equal(messages.length, 2);
});

function app({host = true, browserSpeech = true} = {}) {
  let now = 100000;
  const messages = [], listeners = {}, elements = {}, stored = {}, browserSpoken = [];
  let downloads = 0;
  function element(tag) {
    return {innerHTML: '', textContent: '', value: '', style: {}, hidden: false,
      classList: {toggle() {}, add() {}, remove() {}},
      remove() { if (this.id) delete elements['#' + this.id]; },
      append(...nodes) { for (const node of nodes) if (node.id) elements['#' + node.id] = node; },
      appendChild(node) { if (node.id) elements['#' + node.id] = node; },
      querySelector() { return {focus() {}}; }, focus() {}, setAttribute() {},
      click() { if (tag === 'a') downloads++; }};
  }
  const listen = (type, fn) => (listeners[type] ||= []).push(fn);
  const document = {querySelector(q) { return elements[q] ||= element(); },
    createElement: element, body: element(), addEventListener: listen};
  const window = {addEventListener: listen};
  if (host) window.webkit = {messageHandlers: {questNative: {
    postMessage(message) { messages.push(JSON.parse(JSON.stringify(message))); }
  }}};
  if (browserSpeech) {
    window.speechSynthesis = {cancel() {}, speak(u) { browserSpoken.push(u.text); }};
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  }
  const dimensions = JSON.parse(fs.readFileSync(path.join(root, 'asset-dimensions.json'), 'utf8'));
  const context = vm.createContext({console, document, window,
    SpeechSynthesisUtterance: window.SpeechSynthesisUtterance,
    localStorage: {getItem: k => stored[k] ?? null, setItem(k, v) { stored[k] = v; },
      removeItem(k) { delete stored[k]; }},
    Date: {now: () => now}, setInterval: () => 1, clearInterval() {},
    setTimeout: () => 1, clearTimeout() {}, Blob: class {},
    URL: {createObjectURL: () => 'blob:test-backup', revokeObjectURL() {}},
    ASSETS: {collection0: 'sheet-a', collection1: 'sheet-b',
      sheets: Object.fromEntries(Object.entries(dimensions).map(([name, size]) => [name, {...size, url: name}]))}
  });
  const run = code => vm.runInContext(code, context);
  for (const file of ['native.js', 'catalog.js', 'engine.js', 'art.js', 'sound.js', 'app.js']) {
    run(fs.readFileSync(path.join(root, 'src', file), 'utf8'));
  }
  const dispatch = async (type, event = {}) => {
    for (const fn of listeners[type] || []) await fn(event);
  };
  return {run, messages, stored, browserSpoken, document,
    downloads: () => downloads, setNow: value => { now = value; }, dispatch,
    click: dataset => dispatch('click', {target: {closest: () => ({dataset, disabled: false})}})};
}
async function checkAsync(name, fn) {
  await fn();
  passed++;
  console.log('PASS:', name);
}

(async () => {
  await checkAsync('Application saves mirror the same JSON into iOS and its persistent browser store', async () => {
    const fixture = app();
    const nativeSave = fixture.messages.find(message => message.action === 'save');
    assert(nativeSave);
    assert.equal(nativeSave.json, fixture.stored['quest-forge-v4']);
    assert.equal(JSON.parse(nativeSave.json).version, 4);
    assert(fixture.messages.some(message => message.action === 'clearReminders'));
  });

  await checkAsync('Native export shares a backup while the website retains its download fallback', async () => {
    const native = app();
    await native.click({action: 'export'});
    const message = native.messages.at(-1);
    assert.equal(message.action, 'export');
    assert.deepEqual(JSON.parse(message.json), JSON.parse(native.run('JSON.stringify(s())')));
    assert.equal(native.downloads(), 0);
    const web = app({host: false});
    await web.click({action: 'export'});
    assert.equal(web.downloads(), 1);
    await web.click({action: 'import'});
    assert(web.document.querySelector('#modal').innerHTML.includes('バックアップJSONを貼り付け'));
  });

  await checkAsync('Canceling the native file picker cannot change the current adventure', async () => {
    const fixture = app();
    const before = fixture.run('JSON.stringify(s())');
    const beforeStored = fixture.stored['quest-forge-v4'];
    await fixture.click({action: 'import'});
    assert.equal(fixture.messages.at(-1).action, 'import');
    assert.equal(fixture.run('JSON.stringify(s())'), before);
    assert.equal(fixture.stored['quest-forge-v4'], beforeStored);
  });

  await checkAsync('A selected backup is staged as text until the player explicitly confirms replacement', async () => {
    const fixture = app();
    const json = fixture.run(`(() => {
      const candidate = new QuestEngine(); candidate.choose('leaf');
      candidate.setTask(0, '引用符 " と </textarea><img src=x> を含む課題');
      candidate.s.gems = 23; return JSON.stringify(candidate.s);
    })()`);
    const before = fixture.run('JSON.stringify(s())');
    const beforeStored = fixture.stored['quest-forge-v4'];
    await fixture.dispatch('quest-native-import', {detail: {json}});
    assert.equal(fixture.document.querySelector('#import-text').value, json);
    assert(!fixture.document.querySelector('#modal').innerHTML.includes('<img src=x>'));
    assert.equal(fixture.run('JSON.stringify(s())'), before);
    assert.equal(fixture.stored['quest-forge-v4'], beforeStored);
    fixture.run('ask = async () => false');
    await fixture.click({action: 'import-confirm'});
    assert.equal(fixture.run('JSON.stringify(s())'), before);
    fixture.run('ask = async () => true');
    await fixture.dispatch('quest-native-import', {detail: {json}});
    await fixture.click({action: 'import-confirm'});
    assert.equal(fixture.run('s().gems'), 23);
    assert.equal(fixture.run('s().companion'), 'leaf');
    assert.equal(JSON.parse(fixture.stored['quest-forge-v4']).gems, 23);
    assert(fixture.messages.some(message => message.action === 'cancelSpeech'));
  });

  await checkAsync('Malformed and oversized import events cannot overwrite the saved adventure', async () => {
    const fixture = app();
    const before = fixture.run('JSON.stringify(s())');
    const beforeStored = fixture.stored['quest-forge-v4'];
    await fixture.dispatch('quest-native-import', {detail: {json: '{}'}});
    await fixture.click({action: 'import-confirm'});
    assert.equal(fixture.run('JSON.stringify(s())'), before);
    assert.equal(fixture.stored['quest-forge-v4'], beforeStored);
    const staged = fixture.document.querySelector('#import-text').value;
    for (const json of [null, 123, 'x'.repeat(2 * 1024 * 1024 + 1)]) {
      await fixture.dispatch('quest-native-import', {detail: {json}});
      assert.equal(fixture.document.querySelector('#import-text').value, staged);
      assert.equal(fixture.stored['quest-forge-v4'], beforeStored);
    }
  });

  await checkAsync('Importing an overdue active battle settles elapsed deadlines before saving', async () => {
    const fixture = app();
    const json = fixture.run(`(() => {
      const candidate = new QuestEngine(); candidate.choose('leaf');
      candidate.setTaskCount(2); candidate.setTask(0, '課題A'); candidate.setTask(1, '課題B');
      candidate.start('forest-0', Date.now() - 600000);
      return JSON.stringify(candidate.s);
    })()`);
    fixture.run('ask = async () => true');
    await fixture.dispatch('quest-native-import', {detail: {json}});
    await fixture.click({action: 'import-confirm'});
    assert.equal(fixture.run('s().battle.status'), 'paused');
    assert.equal(fixture.run('s().battle.index'), 2);
    assert.equal(fixture.run('s().battle.turn'), 0);
    assert.equal(fixture.run('s().gems'), 0);
    assert.equal(fixture.run('s().essence'), 0);
    assert.deepEqual(JSON.parse(fixture.run('JSON.stringify(s().battle.taskResults)')),
      {'0': 'timeout', '1': 'timeout'});
    const after = fixture.run('JSON.stringify(s())');
    fixture.run('settleAndRender()');
    assert.equal(fixture.run('JSON.stringify(s())'), after);
  });

  await checkAsync('The native-ready event resynchronizes an active reminder after host reconnection', async () => {
    const fixture = app();
    fixture.run("game = new QuestEngine(); game.choose('leaf'); game.setTask(0, '課題'); game.start('forest-0', Date.now()); save()");
    const before = fixture.messages.filter(message => message.action === 'scheduleReminder').length;
    await fixture.dispatch('quest-native-ready');
    assert.equal(fixture.messages.filter(message => message.action === 'scheduleReminder').length, before + 1);
    const state = fixture.run('JSON.stringify(s())');
    fixture.run('save()');
    assert.equal(fixture.messages.filter(message => message.action === 'scheduleReminder').length, before + 1);
    assert.equal(fixture.run('JSON.stringify(s())'), state);
  });

  await checkAsync('Native speech works when WKWebView has no Web Speech implementation', async () => {
    const fixture = app({browserSpeech: false});
    fixture.run("audio.ready = true; audio.speak('残り4分です。'); audio.cancelSpeech()");
    assert(fixture.messages.some(message => message.action === 'speak' && message.text === '残り4分です。'));
    assert.equal(fixture.messages.at(-1).action, 'cancelSpeech');
    fixture.run("s().audio.voice = false; audio.speak('読まない案内')");
    assert(!fixture.messages.some(message => message.action === 'speak' && message.text === '読まない案内'));
  });

  console.log(`Native bridge and application integration: ${passed} checks passed.`);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
