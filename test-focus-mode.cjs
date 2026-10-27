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
const focusTasks = ['教科書の章を読む', '演習問題を解く'];
let passed = 0;
function test(name, run) {
  run();
  passed++;
  console.log('PASS: ' + name);
}
function prepared(mode = 'focus') {
  const game = new QuestEngine();
  game.choose('leaf');
  for (let i = 0; i < 10; i++) game.setTask(i, '通常の課題 ' + (i + 1));
  game.s.nextTask = 4;
  game.setMode(mode);
  if (mode === 'focus') focusTasks.forEach((text, i) => game.setTask(i, text));
  return game;
}
function startFocus() {
  const game = prepared();
  game.start('forest-0', 0);
  Object.assign(game.s.battle, { enemy: 1000000000, enemyMax: 1000000000 });
  return game;
}
function combatAndRewards(game) {
  const state = json(game.s);
  delete state.focusTasks;
  delete state.focusNextTask;
  for (const key of ['tasks', 'taskResults', 'index', 'status', 'reason', 'deadline', 'log']) delete state.battle[key];
  return state;
}

test('集中モードは30分を2回、旧保存は通常10課題5分を維持する', () => {
  assert.deepEqual(json(QUEST_MODES.focus), { count: 2, seconds: 1800, label: '集中モード' });
  const game = prepared('standard');
  const saved = json(game.s);
  delete saved.mode;
  delete saved.focusTasks;
  delete saved.focusNextTask;
  const restored = new QuestEngine(saved);
  assert.equal(restored.s.mode, 'standard');
  assert.equal(restored.plan().count, 10);
  assert.equal(restored.plan().seconds, 300);
  assert.equal(restored.s.nextTask, 4);
  assert.deepEqual(json(restored.s.tasks), saved.tasks);
  restored.start('forest-0', 1000);
  assert.equal(restored.s.battle.mode, 'standard');
  assert.equal(restored.s.battle.deadline, 301000);
  const oldActive = json(restored.s);
  delete oldActive.battle.mode;
  const activeRestored = new QuestEngine(oldActive);
  assert.equal(activeRestored.s.battle.mode, 'standard');
  assert.equal(activeRestored.s.battle.deadline, 301000);
  assert.equal(activeRestored.s.battle.index, 4);
});

test('モード切替とリセットはもう一方の課題・進行を変更しない', () => {
  const game = prepared();
  game.s.focusNextTask = 1;
  const standard = json(game.plan('standard'));
  game.setMode('standard');
  assert.equal(game.plan().nextTask, 4);
  game.setTask(4, '通常の編集');
  game.setMode('focus');
  assert.equal(game.plan().nextTask, 1);
  assert.deepEqual(json(game.plan().tasks), focusTasks);
  game.reset();
  assert.equal(game.s.focusNextTask, 0);
  assert.deepEqual(json(game.s.focusTasks), focusTasks);
  assert.equal(game.s.nextTask, standard.nextTask);
  assert.equal(game.s.tasks[4], '通常の編集');
  game.reset(true);
  assert.deepEqual(json(game.s.focusTasks), ['', '']);
  assert.equal(game.s.tasks.length, 10);
  assert.equal(game.s.tasks[4], '通常の編集');
});

test('不正モードと不正入力は拒否し、prototype名を保存から受け入れない', () => {
  const game = prepared();
  for (const mode of ['unknown', 'constructor', 'toString', '__proto__', null]) {
    const before = json(game.s);
    assert.throws(() => game.setMode(mode));
    assert.throws(() => game.modeInfo(mode));
    assert.deepEqual(json(game.s), before);
    const saved = json(game.s);
    saved.mode = mode;
    assert.equal(new QuestEngine(saved).s.mode, 'standard');
  }
  for (const [index, text] of [[-1, '課題'], [2, '課題'], [.5, '課題'], [0, null], [0, 'あ'.repeat(121)]]) {
    const before = json(game.s);
    assert.throws(() => game.setTask(index, text));
    assert.deepEqual(json(game.s), before);
  }
  game.setTask(0, '');
  assert.throws(() => game.start('forest-0', 0));
});

test('集中課題の達成ごとに次の30分を設定し、時間内には被弾しない', () => {
  const game = startFocus();
  const hp = game.s.battle.hp;
  assert.equal(game.s.battle.mode, 'focus');
  assert.equal(game.s.battle.deadline, 1800000);
  assert.deepEqual(json(game.s.battle.tasks), focusTasks);
  const event = game.complete(600000, () => .99);
  assert.equal(event.type, 'attack');
  assert.equal(event.incoming, 0);
  assert.equal(game.s.battle.hp, hp);
  assert.equal(game.s.battle.index, 1);
  assert.equal(game.s.focusNextTask, 1);
  assert.equal(game.s.nextTask, 4);
  assert.equal(game.s.battle.deadline, 2400000);
  assert.deepEqual(json(game.s.battle.taskResults), { 0: 'complete' });
  assert.equal(game.s.essence, 1);
  assert.equal(game.record('leaf').xp, 15);
});

test('集中30分の最大攻撃と半分の残り時間は通常5分と同じ威力になる', () => {
  const standard = prepared('standard');
  standard.start('forest-0', 0);
  const focus = startFocus();
  for (const ratio of [1, .5, .1, 0]) {
    assert.deepEqual(json(focus.preview(1800 * ratio)), json(standard.preview(300 * ratio)));
  }
});

test('集中2課題の達成で準備待ちになり、次の2課題で同じ戦闘を継続する', () => {
  const game = startFocus();
  game.s.battle.enemy = 1;
  game.complete(1000, () => 0);
  assert.equal(game.s.battle.floor, 1);
  Object.assign(game.s.battle, { enemy: 1000000000, enemyMax: 1000000000 });
  game.complete(2000, () => .99);
  assert.equal(game.s.battle.status, 'paused');
  assert.equal(game.s.battle.index, 2);
  assert.equal(game.s.focusNextTask, 2);
  assert.equal(game.s.battle.deadline, null);
  assert.deepEqual(json(game.s.battle.taskResults), { 0: 'complete', 1: 'complete' });
  assert(game.s.battle.loot.gold > 0);
  const before = combatAndRewards(game);
  for (const tasks of [[], Array(2), ['1件だけ'], ['1', '2', '3'], ['', '2'], ['1', ' '.repeat(3)], ['あ'.repeat(121), '2']]) {
    const snapshot = json(game.s);
    assert.throws(() => game.resumeTasks(tasks, 5000));
    assert.deepEqual(json(game.s), snapshot);
  }
  const nextTasks = ['次の読書', '次の演習'];
  game.resumeTasks(nextTasks, 5000);
  assert.equal(game.s.battle.status, 'active');
  assert.equal(game.s.battle.index, 0);
  assert.equal(game.s.focusNextTask, 0);
  assert.equal(game.s.nextTask, 4);
  assert.equal(game.s.battle.deadline, 1805000);
  assert.deepEqual(json(game.s.focusTasks), nextTasks);
  assert.deepEqual(json(game.s.battle.tasks), nextTasks);
  assert.deepEqual(json(game.s.battle.taskResults), {});
  assert.deepEqual(combatAndRewards(game), before);
});

test('集中課題の期限ちょうどは時間切れを記録し、次の30分へ進む', () => {
  const game = startFocus();
  const hp = game.s.battle.hp;
  const event = game.complete(1800000);
  assert.equal(event.type, 'expired');
  assert.equal(event.events.length, 1);
  assert(event.events[0].damage > 0);
  assert.equal(game.s.battle.hp, hp - event.events[0].damage);
  assert.equal(game.s.battle.status, 'active');
  assert.equal(game.s.battle.index, 1);
  assert.equal(game.s.battle.deadline, 3600000);
  assert.equal(game.s.essence, 0);
  assert.equal(game.record('leaf').xp, 0);
  assert.deepEqual(json(game.s.battle.taskResults), { 0: 'timeout' });
  game.complete(1801000, () => .99);
  assert.equal(game.s.battle.status, 'paused');
  assert.deepEqual(json(game.s.battle.taskResults), { 0: 'timeout', 1: 'complete' });
  assert.equal(game.s.essence, 1);
  assert.equal(game.record('leaf').xp, 15);
});

test('集中モードの長期放置は2回の時間切れまで精算し、準備待ちで停止する', () => {
  const game = startFocus();
  const hp = game.s.battle.hp;
  const damage = game.s.battle.enemyAttack;
  const events = game.settle(999999999);
  assert.equal(events.length, 2);
  assert.equal(game.s.battle.hp, hp - damage * 2);
  assert.equal(game.s.battle.status, 'paused');
  assert.equal(game.s.focusNextTask, 2);
  assert.equal(game.s.battle.index, 2);
  assert.equal(game.s.battle.deadline, null);
  assert.deepEqual(json(game.s.battle.taskResults), { 0: 'timeout', 1: 'timeout' });
  assert.equal(game.s.essence, 0);
  const before = json(game.s);
  assert.deepEqual(json(game.settle(9999999999)), []);
  assert.deepEqual(json(game.s), before);
  const lethal = startFocus();
  lethal.s.battle.hp = 1;
  assert.equal(lethal.settle(999999999).length, 1);
  assert.equal(lethal.s.battle.status, 'lost');
  assert.equal(lethal.s.battle.hp, 0);
  assert.equal(lethal.s.focusNextTask, 1);
});

test('実行中と準備待ちはモード切替・課題編集・リセットを拒否する', () => {
  const game = startFocus();
  for (const paused of [false, true]) {
    if (paused) game.settle(999999999);
    const before = json(game.s);
    for (const action of [() => game.setMode('standard'), () => game.setTask(0, '変更'), () => game.reset(), () => game.editable(), () => game.start('forest-0', 0)]) {
      assert.throws(action);
      assert.deepEqual(json(game.s), before);
    }
  }
});

test('集中の保存復元は実行中の絶対期限と準備待ちの報酬を保持する', () => {
  const game = startFocus();
  game.complete(600000, () => .99);
  let restored = new QuestEngine(json(game.s));
  assert.deepEqual(json(restored.s), json(game.s));
  assert.equal(restored.s.battle.deadline, 2400000);
  assert.equal(restored.s.battle.mode, 'focus');
  restored.complete(700000, () => .99);
  assert.equal(restored.s.battle.status, 'paused');
  const paused = json(restored.s);
  restored = new QuestEngine(paused);
  assert.deepEqual(json(restored.s), paused);
  assert.deepEqual(json(restored.settle(999999999)), []);
  assert.equal(restored.s.essence, 2);
  assert.equal(restored.record('leaf').xp, 30);
});

test('集中課題の帰還は次の課題から再開し、通常の進行を保つ', () => {
  const game = startFocus();
  game.retire();
  assert.equal(game.s.battle.status, 'retired');
  assert.equal(game.s.focusNextTask, 1);
  assert.equal(game.s.nextTask, 4);
  assert.equal(game.s.essence, 0);
  game.s.battle = null;
  game.start('forest-0', 5000);
  assert.equal(game.s.battle.index, 1);
  assert.equal(game.s.battle.tasks[1], focusTasks[1]);
  assert.equal(game.s.battle.deadline, 1805000);
  game.retire();
  assert.equal(game.s.focusNextTask, 2);
  assert.throws(() => game.start('forest-0', 6000));
  game.reset();
  assert.equal(game.s.focusNextTask, 0);
  assert.deepEqual(json(game.s.focusTasks), focusTasks);
  assert.equal(game.s.nextTask, 4);
});

test('集中1課題目で勝利した後は次の道で2課題目に新しい30分を設定する', () => {
  const game = prepared();
  game.start('forest-0', 0);
  game.s.battle.floor = 2;
  game.loadEnemy();
  game.s.battle.enemy = 1;
  game.complete(900000, () => 0);
  assert.equal(game.s.battle.status, 'won');
  assert.equal(game.s.focusNextTask, 1);
  const gems = game.s.gems;
  const essence = game.s.essence;
  game.s.battle = null;
  game.start('forest-1', 1000000);
  assert.equal(game.s.battle.mode, 'focus');
  assert.equal(game.s.battle.index, 1);
  assert.equal(game.s.battle.deadline, 2800000);
  assert.equal(game.s.gems, gems);
  assert.equal(game.s.essence, essence);
  assert.equal(game.s.nextTask, 4);
});

test('集中の2課題目でボス撃破しても準備待ちに変えず、報酬は一度だけ', () => {
  const game = prepared();
  game.s.focusNextTask = 1;
  game.start('forest-0', 0);
  game.s.battle.floor = 2;
  game.loadEnemy();
  game.s.battle.enemy = 1;
  const event = game.complete(1000, () => 0);
  assert.equal(event.type, 'win');
  assert.equal(game.s.battle.status, 'won');
  assert.equal(game.s.focusNextTask, 2);
  assert.equal(game.s.nextTask, 4);
  assert.equal(game.s.gems, 5);
  const before = json(game.s);
  assert.equal(game.complete(2000), null);
  assert.throws(() => game.resumeTasks(focusTasks, 2000));
  assert.deepEqual(json(game.s), before);
});

console.log(passed + ' focus-mode regression tests passed.');
