'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert/strict');
const context = {};
vm.createContext(context);
for (const name of ['catalog', 'engine']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'src', name + '.js'), 'utf8'), context);
}
const { QuestEngine, QUEST_MODES } = vm.runInContext('({ QuestEngine, QUEST_MODES })', context);
const json = value => JSON.parse(JSON.stringify(value));
const tasks = (count, prefix = '課題') => Array.from({ length: count }, (_, i) => prefix + (i + 1));
let passed = 0;
function test(name, run) {
  run();
  passed++;
  console.log('PASS: ' + name);
}
function prepared(mode = 'standard', count = mode === 'focus' ? 2 : 1) {
  const game = new QuestEngine();
  game.choose('leaf');
  game.setMode(mode);
  game.setTaskCount(count);
  tasks(count).forEach((text, index) => game.setTask(index, text));
  return game;
}
function active(mode = 'standard', count = mode === 'focus' ? 2 : 1) {
  const game = prepared(mode, count);
  game.start('forest-0', 0);
  Object.assign(game.s.battle, { enemy: 1000000000, enemyMax: 1000000000 });
  return game;
}
function finishBatch(game) {
  const count = game.s.battle.tasks.length - game.s.battle.index;
  for (let i = 0; i < count; i++) game.complete(i * 1000, () => .99);
  assert.equal(game.s.battle.status, 'paused');
}
function retained(game) {
  const state = json(game.s);
  for (const key of ['tasks', 'nextTask', 'focusTasks', 'focusNextTask']) delete state[key];
  for (const key of ['tasks', 'taskResults', 'index', 'status', 'reason', 'deadline', 'log']) delete state.battle[key];
  return state;
}

test('初期値は通常1課題・集中2課題で、それぞれ5分と30分を維持する', () => {
  const game = new QuestEngine();
  assert.equal(QUEST_MODES.standard.count, 1);
  assert.equal(QUEST_MODES.focus.count, 2);
  assert.equal(game.plan().count, 1);
  assert.equal(game.plan().seconds, 300);
  assert.deepEqual(json(game.s.tasks), ['']);
  game.setMode('focus');
  assert.equal(game.plan().count, 2);
  assert.equal(game.plan().seconds, 1800);
  assert.deepEqual(json(game.s.focusTasks), ['', '']);
});

test('保存済みの可変長bankと進捗を保持し、配列外の入力は初期数へ戻す', () => {
  const game = new QuestEngine({ version: 4, tasks: tasks(7), nextTask: 5, focusTasks: tasks(3, '集中'), focusNextTask: 2 });
  assert.equal(game.plan('standard').count, 7);
  assert.equal(game.modeInfo('standard').count, 7);
  assert.equal(game.s.nextTask, 5);
  assert.equal(game.plan('focus').count, 3);
  assert.equal(game.s.focusNextTask, 2);
  for (const count of [1, 100]) {
    const restored = new QuestEngine({ version: 4, tasks: tasks(count), focusTasks: tasks(count), nextTask: count, focusNextTask: count });
    assert.equal(restored.plan('standard').count, count);
    assert.equal(restored.plan('focus').count, count);
    assert.equal(restored.s.nextTask, count);
    assert.equal(restored.s.focusNextTask, count);
  }
  for (const invalid of [undefined, null, '課題', [], tasks(101)]) {
    const restored = new QuestEngine({ version: 4, tasks: invalid, focusTasks: invalid });
    assert.equal(restored.s.tasks.length, 1);
    assert.equal(restored.s.focusTasks.length, 2);
  }
});

test('課題数変更は入力の先頭を保持し、追加を空欄にして進捗を上限内に収める', () => {
  const game = prepared('standard', 7);
  game.s.nextTask = 6;
  game.setTaskCount(9);
  assert.deepEqual(json(game.s.tasks), [...tasks(7), '', '']);
  assert.equal(game.s.nextTask, 6);
  game.setTaskCount(3);
  assert.deepEqual(json(game.s.tasks), tasks(3));
  assert.equal(game.s.nextTask, 3);
  game.setMode('focus');
  game.setTaskCount(3);
  tasks(3, '集中').forEach((text, index) => game.setTask(index, text));
  game.s.focusNextTask = 2;
  game.setTaskCount(1);
  assert.deepEqual(json(game.s.focusTasks), ['集中1']);
  assert.equal(game.s.focusNextTask, 1);
  assert.deepEqual(json(game.s.tasks), tasks(3));
  assert.equal(game.s.nextTask, 3);
  for (const count of [0, -1, 101, 1.5, NaN, Infinity, '3', null]) {
    const before = json(game.s);
    assert.throws(() => game.setTaskCount(count));
    assert.deepEqual(json(game.s), before);
  }
});

test('通常7課題は7件目で準備待ちになり、時間内達成だけの報酬を得る', () => {
  const game = active('standard', 7);
  const hp = game.s.battle.hp;
  for (let i = 0; i < 7; i++) {
    const event = game.complete(i * 1000, () => .99);
    assert.equal(event.incoming, 0);
    assert.equal(game.s.battle.hp, hp);
    assert.equal(game.s.battle.index, i + 1);
    if (i < 6) assert.equal(game.s.battle.deadline, i * 1000 + 300000);
  }
  assert.equal(game.s.battle.status, 'paused');
  assert.equal(game.s.battle.deadline, null);
  assert.equal(game.s.nextTask, 7);
  assert.equal(game.s.battle.turn, 7);
  assert.equal(game.s.essence, 7);
  assert.equal(game.record('leaf').xp, 105);
  assert.deepEqual(json(game.s.battle.taskResults), Object.fromEntries(tasks(7).map((_, index) => [index, 'complete'])));
});

test('集中3課題でも各30分を設定し、威力は通常モードと同じ倍率になる', () => {
  const game = active('focus', 3);
  const standard = active('standard', 7);
  assert.equal(game.s.battle.deadline, 1800000);
  assert.deepEqual(json(game.preview(1800)), json(standard.preview(300)));
  for (let i = 0; i < 3; i++) {
    game.complete(600000 + i * 1000, () => .99);
    if (i < 2) assert.equal(game.s.battle.deadline, 2400000 + i * 1000);
  }
  assert.equal(game.s.battle.status, 'paused');
  assert.equal(game.s.focusNextTask, 3);
  assert.equal(game.s.nextTask, 0);
  assert.equal(game.s.essence, 3);
});

test('冒険中の課題数はsnapshotで固定し、bank長が異なっても終了条件を変えない', () => {
  const game = active('standard', 7);
  for (const action of [() => game.setTaskCount(1), () => game.setTask(0, '変更'), () => game.setMode('focus'), () => game.repeatTasks(1000)]) {
    const before = json(game.s);
    assert.throws(action);
    assert.deepEqual(json(game.s), before);
  }
  game.s.tasks = ['別のbank'];
  game.complete(0, () => .99);
  assert.equal(game.s.battle.status, 'active');
  assert.equal(game.s.battle.tasks.length, 7);
  assert.equal(game.s.battle.index, 1);
  game.retire();
  assert.equal(game.s.nextTask, 2);
  const restored = new QuestEngine(json(game.s));
  assert.equal(restored.s.battle.tasks.length, 7);
});

test('準備待ちから課題数を変更しても敵・HP・スキル・報酬を維持する', () => {
  for (const [mode, oldCount, newCount] of [['standard', 7, 3], ['focus', 3, 1]]) {
    const game = active(mode, oldCount);
    finishBatch(game);
    game.s.battle.hp -= 10;
    game.s.battle.cooldowns.leaf = 2;
    game.s.battle.shield = true;
    const before = retained(game);
    const replacement = tasks(newCount, '変更');
    game.resumeTasks(replacement, 123456);
    assert.equal(game.s.battle.tasks.length, newCount);
    assert.equal(game.plan().count, newCount);
    assert.equal(game.modeInfo().count, newCount);
    assert.equal(game.s.battle.index, 0);
    assert.equal(game.plan().nextTask, 0);
    assert.equal(game.s.battle.deadline, 123456 + (mode === 'focus' ? 1800000 : 300000));
    assert.deepEqual(json(game.s.battle.taskResults), {});
    assert.deepEqual(retained(game), before);
  }
});

test('可変長の継続入力は1〜100件の非空文字列だけを受け入れる', () => {
  const game = active();
  finishBatch(game);
  for (const input of [null, {}, [], tasks(101), Array(2), ['', '課題'], ['  '], [7], ['あ'.repeat(121)]]) {
    const before = json(game.s);
    assert.throws(() => game.resumeTasks(input, 1000));
    assert.deepEqual(json(game.s), before);
  }
  game.resumeTasks(tasks(100), 1000);
  assert.equal(game.plan().count, 100);
  assert.equal(game.s.battle.tasks.length, 100);
});

test('同じ課題のワンクリック継続はHPも報酬も増やさず次のタイマーだけを始める', () => {
  for (const [mode, count] of [['standard', 1], ['focus', 3]]) {
    const game = active(mode, count);
    game.s.battle.enemy = 1;
    game.complete(0, () => 0);
    if (game.s.battle.status === 'active') {
      Object.assign(game.s.battle, { enemy: 1000000000, enemyMax: 1000000000 });
      finishBatch(game);
    }
    game.s.battle.hp -= 12;
    game.s.battle.revive = true;
    const before = retained(game);
    const priorTasks = json(game.s.battle.tasks);
    game.repeatTasks(9000);
    assert.equal(game.s.battle.status, 'active');
    assert.equal(game.s.battle.index, 0);
    assert.deepEqual(json(game.s.battle.tasks), priorTasks);
    assert.equal(game.s.battle.deadline, 9000 + (mode === 'focus' ? 1800000 : 300000));
    assert.deepEqual(json(game.s.battle.taskResults), {});
    assert.deepEqual(retained(game), before);
  }
});

test('冒険外の再使用は選択bankだけを先頭に戻し、所持品を変更しない', () => {
  const game = prepared('standard', 7);
  game.s.nextTask = 7;
  game.s.gold = 123;
  game.s.essence = 5;
  game.s.gems = 4;
  game.s.inventory.seed = 3;
  game.s.focusTasks = tasks(3, '集中');
  game.s.focusNextTask = 2;
  const before = json(game.s);
  game.repeatTasks(1000);
  assert.equal(game.s.nextTask, 0);
  assert.equal(game.s.focusNextTask, 2);
  assert.deepEqual(json(game.s.tasks), before.tasks);
  const expected = { ...before, nextTask: 0 };
  assert.deepEqual(json(game.s), expected);
  game.setTask(0, '');
  const invalid = json(game.s);
  assert.throws(() => game.repeatTasks(2000));
  assert.deepEqual(json(game.s), invalid);
});

test('リセットと新規入力は選択中の課題数を保ち、もう一方のbankを維持する', () => {
  const game = prepared('standard', 7);
  game.s.nextTask = 5;
  game.s.focusTasks = tasks(3, '集中');
  game.s.focusNextTask = 2;
  game.reset();
  assert.equal(game.s.tasks.length, 7);
  assert.deepEqual(json(game.s.tasks), tasks(7));
  assert.equal(game.s.nextTask, 0);
  game.reset(true);
  assert.deepEqual(json(game.s.tasks), Array(7).fill(''));
  assert.deepEqual(json(game.s.focusTasks), tasks(3, '集中'));
  assert.equal(game.s.focusNextTask, 2);
  game.setMode('focus');
  game.reset(true);
  assert.deepEqual(json(game.s.focusTasks), Array(3).fill(''));
  assert.equal(game.s.focusNextTask, 0);
  assert.equal(game.s.tasks.length, 7);
});

test('旧10課題の実行中保存は入力・進捗・期限を変えず、旧上限敗北だけを復元する', () => {
  const game = prepared('standard', 10);
  game.s.nextTask = 7;
  game.start('forest-0', 5000);
  Object.assign(game.s.battle, { enemy: 1000000000, enemyMax: 1000000000 });
  const old = json(game.s);
  delete old.mode;
  delete old.focusTasks;
  delete old.focusNextTask;
  delete old.battle.mode;
  const restored = new QuestEngine(old);
  assert.equal(restored.s.tasks.length, 10);
  assert.equal(restored.s.battle.tasks.length, 10);
  assert.equal(restored.s.nextTask, 7);
  assert.equal(restored.s.battle.index, 7);
  assert.equal(restored.s.battle.deadline, 305000);
  restored.complete(6000, () => .99);
  assert.equal(restored.s.battle.status, 'active');
  assert.equal(restored.s.nextTask, 8);
  const legacy = json(restored.s);
  Object.assign(legacy.battle, { index: 10, status: 'lost', reason: '課題を一巡しました。育てた仲間と、また挑めます。' });
  legacy.nextTask = 10;
  const repaired = new QuestEngine(legacy);
  assert.equal(repaired.s.battle.status, 'paused');
  assert.equal(repaired.s.battle.deadline, null);
  assert.equal(repaired.s.tasks.length, 10);
  assert.equal(repaired.s.nextTask, 10);
  const saved = json(repaired.s);
  assert.deepEqual(json(new QuestEngine(saved).s), saved);
  assert.equal(repaired.s.essence, 1);
  assert.equal(repaired.record('leaf').xp, 15);
});

test('可変課題の期限切れは実数だけ精算し、達成扱いや追加報酬を与えない', () => {
  for (const mode of ['standard', 'focus']) {
    const game = active(mode, 3);
    const duration = mode === 'focus' ? 1800000 : 300000;
    const hp = game.s.battle.hp;
    const event = game.complete(duration);
    assert.equal(event.type, 'expired');
    assert.equal(event.events.length, 1);
    assert.equal(game.s.battle.status, 'active');
    assert.equal(game.s.battle.deadline, duration * 2);
    assert.equal(game.s.battle.index, 1);
    assert.deepEqual(json(game.s.battle.taskResults), { 0: 'timeout' });
    assert.equal(game.s.essence, 0);
    const rest = game.settle(999999999);
    assert.equal(rest.length, 2);
    assert.equal(game.s.battle.status, 'paused');
    assert.equal(game.s.battle.hp, hp - event.events[0].damage * 3);
    assert.equal(game.s.battle.index, 3);
    assert.equal(game.s.essence, 0);
    assert.equal(game.record('leaf').xp, 0);
    const paused = json(game.s);
    assert.deepEqual(json(new QuestEngine(paused).s), paused);
  }
});

test('最終課題でのボス撃破は勝利し、再使用でもクリア報酬を再配布しない', () => {
  const game = prepared('standard', 1);
  game.start('forest-0', 0);
  game.s.battle.floor = 2;
  game.loadEnemy();
  game.s.battle.enemy = 1;
  game.complete(0, () => 0);
  assert.equal(game.s.battle.status, 'won');
  assert.equal(game.s.gems, 5);
  const gold = game.s.gold;
  const essence = game.s.essence;
  const xp = game.record('leaf').xp;
  game.repeatTasks(1000);
  assert.equal(game.s.battle, null);
  assert.equal(game.s.nextTask, 0);
  assert.equal(game.s.gems, 5);
  assert.equal(game.s.gold, gold);
  assert.equal(game.s.essence, essence);
  assert.equal(game.record('leaf').xp, xp);
});

console.log(passed + ' flexible-task regression tests passed.');
