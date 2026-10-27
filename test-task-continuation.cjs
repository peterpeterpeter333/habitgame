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
const { QuestEngine } = vm.runInContext('({ QuestEngine })', context);
const json = value => JSON.parse(JSON.stringify(value));
const batch = prefix => Array.from({ length: 10 }, (_, i) => prefix + ' ' + (i + 1));
let passed = 0;
function test(name, run) {
  run();
  passed++;
  console.log('PASS: ' + name);
}
function prepare(nextTask = 9) {
  const game = new QuestEngine();
  game.choose('leaf');
  game.s.tasks = batch('課題');
  game.s.nextTask = nextTask;
  game.start('forest-0', 0);
  return game;
}
function durableEnemy(game) {
  Object.assign(game.s.battle, { enemy: 1000000000, enemyMax: 1000000000, enemyTurns: 99 });
}
function retained(game) {
  const state = json(game.s);
  delete state.tasks;
  delete state.nextTask;
  for (const key of ['tasks', 'index', 'status', 'reason', 'deadline', 'log', 'recoveredTaskLimit']) delete state.battle[key];
  return state;
}
function pause(game) {
  durableEnemy(game);
  game.complete(0, () => .99);
  assert.equal(game.s.battle.status, 'paused');
  return game;
}

test('課題10の期限内達成はHPを保って中断し、課題補充を待つ', () => {
  const game = prepare();
  durableEnemy(game);
  const hp = game.s.battle.hp;
  const enemy = game.s.battle.enemy;
  const event = game.complete(0, () => .99);
  assert.equal(event.type, 'attack');
  assert.equal(game.s.battle.status, 'paused');
  assert.equal(game.s.battle.index, 10);
  assert.equal(game.s.nextTask, 10);
  assert.equal(game.s.battle.deadline, null);
  assert.equal(game.s.battle.hp, hp);
  assert.equal(game.s.battle.enemy, enemy - event.damage);
  assert.equal(game.s.battle.turn, 1);
  assert.equal(game.record('leaf').xp, 15);
  assert.equal(game.s.essence, 1);
});

test('中断中は放置や完了操作でダメージ・報酬・時間を追加しない', () => {
  const game = pause(prepare());
  const before = json(game.s);
  assert.deepEqual(json(game.settle(999999999999)), []);
  assert.equal(game.complete(999999999999), null);
  assert.deepEqual(json(game.s), before);
});

test('中断した冒険は開始・課題リセット・育成で置き換えられない', () => {
  const game = pause(prepare());
  const before = json(game.s);
  for (const action of [() => game.start('forest-0', 1000), () => game.reset(), () => game.reset(true), () => game.editable()]) {
    assert.throws(action);
    assert.deepEqual(json(game.s), before);
  }
});

test('再開課題が不正なら冒険と所持品を一切変更しない', () => {
  const game = pause(prepare());
  const invalid = [null, '課題', {}, batch('短い').slice(1), [...batch('長い'), '11番'],
    batch('空欄').map((value, i) => i === 4 ? '' : value),
    batch('空白').map((value, i) => i === 4 ? ' \n\t ' : value),
    batch('数値').map((value, i) => i === 4 ? 5 : value),
    batch('文字数').map((value, i) => i === 4 ? 'あ'.repeat(121) : value)];
  for (const tasks of invalid) {
    const before = json(game.s);
    assert.throws(() => game.resumeTasks(tasks, 123456));
    assert.deepEqual(json(game.s), before);
  }
});

test('課題補充は戦闘・既存報酬を維持し、次の10課題も一度ずつ進める', () => {
  const game = prepare();
  game.s.battle.enemy = 1;
  const first = game.complete(0, () => 0);
  assert.equal(first.floorClear, true);
  assert.equal(game.s.battle.status, 'paused');
  assert.equal(game.s.battle.floor, 1);
  assert(game.s.battle.loot.gold > 0);
  assert(game.s.battle.loot.eggs.length > 0);
  durableEnemy(game);
  game.s.battle.cooldowns.leaf = 2;
  game.s.battle.shield = true;
  const before = retained(game);
  const priorLog = json(game.s.battle.log);
  const tasks = batch('次の課題');
  tasks[0] = 'あ'.repeat(120);
  game.resumeTasks(tasks, 123456);
  assert.equal(game.s.battle.status, 'active');
  assert.equal(game.s.battle.index, 0);
  assert.equal(game.s.nextTask, 0);
  assert.equal(game.s.battle.deadline, 423456);
  assert.deepEqual(json(game.s.tasks), tasks);
  assert.deepEqual(json(game.s.battle.tasks), tasks);
  assert.deepEqual(retained(game), before);
  assert.equal(game.s.battle.log.length, priorLog.length + 1);
  assert.equal(game.s.battle.log[0], '次の10課題で冒険を再開');
  assert.deepEqual(json(game.s.battle.log.slice(1)), priorLog);
  assert.throws(() => game.resumeTasks(tasks, 123457));
  let damage = 0;
  const enemy = game.s.battle.enemy;
  const gold = game.s.gold;
  const gems = game.s.gems;
  const inventory = json(game.s.inventory);
  const loot = json(game.s.battle.loot);
  for (let i = 0; i < 10; i++) {
    assert.equal(game.s.battle.index, i);
    damage += game.complete(123456 + i * 1000, () => .99).damage;
  }
  assert.equal(game.s.battle.status, 'paused');
  assert.equal(game.s.battle.index, 10);
  assert.equal(game.s.battle.turn, 11);
  assert.equal(game.s.battle.enemy, enemy - damage);
  assert.equal(game.s.essence, before.essence + 10);
  assert.equal(game.record('leaf').xp, before.records.leaf.xp + 150);
  assert.equal(game.s.gold, gold);
  assert.equal(game.s.gems, gems);
  assert.deepEqual(json(game.s.inventory), inventory);
  assert.deepEqual(json(game.s.battle.loot), loot);
  const secondPause = json(game.s);
  assert.equal(game.complete(500000), null);
  assert.deepEqual(json(game.s), secondPause);
});

test('課題10の期限ちょうどは時間切れを一度だけ精算して中断する', () => {
  const game = prepare();
  durableEnemy(game);
  const hp = game.s.battle.hp;
  const enemy = game.s.battle.enemy;
  const event = game.complete(300000);
  assert.equal(event.type, 'expired');
  assert.equal(event.events.length, 1);
  assert.equal(game.s.battle.status, 'paused');
  assert.equal(game.s.battle.index, 10);
  assert.equal(game.s.battle.hp, hp - event.events[0].damage);
  assert.equal(game.s.battle.enemy, enemy);
  assert.equal(game.s.battle.turn, 0);
  assert.equal(game.s.essence, 0);
  assert.equal(game.record('leaf').xp, 0);
  const after = json(game.s);
  game.settle(999999999999);
  assert.deepEqual(json(game.s), after);
});

test('課題10でのボス撃破は勝利し、クリア報酬を重複しない', () => {
  const game = prepare();
  game.s.battle.floor = 2;
  game.loadEnemy();
  game.s.battle.enemy = 1;
  const event = game.complete(0, () => 0);
  assert.equal(event.type, 'win');
  assert.equal(game.s.battle.status, 'won');
  assert.equal(game.s.nextTask, 10);
  assert.equal(game.s.gems, 5);
  assert.equal(game.s.cleared.length, 1);
  const before = json(game.s);
  assert.equal(game.complete(1000), null);
  assert.throws(() => game.resumeTasks(batch('再開不可'), 1000));
  assert.deepEqual(json(game.s), before);
});

test('課題10でもHP0は真の敗北として保存し、補充で復活しない', () => {
  const game = prepare();
  durableEnemy(game);
  game.s.battle.hp = 1;
  const event = game.complete(300000);
  assert.equal(event.type, 'expired');
  assert.equal(game.s.battle.status, 'lost');
  assert.equal(game.s.battle.hp, 0);
  assert.throws(() => game.resumeTasks(batch('復活不可'), 400000));
  const restored = new QuestEngine(json(game.s));
  assert.equal(restored.s.battle.status, 'lost');
  assert.equal(restored.s.battle.hp, 0);
});

test('課題5で途中帰還した後は報酬を増やさず課題6から始める', () => {
  const game = prepare(4);
  const hp = game.s.battle.hp;
  game.retire();
  assert.equal(game.s.battle.status, 'retired');
  assert.equal(game.s.nextTask, 5);
  assert.equal(game.s.essence, 0);
  assert.equal(game.record('leaf').xp, 0);
  assert.equal(game.s.battle.hp, hp);
  game.s.battle = null;
  game.start('forest-0', 5000);
  assert.equal(game.s.battle.index, 5);
  assert.equal(game.s.battle.tasks[5], '課題 6');
  assert.equal(game.s.battle.deadline, 305000);
});

test('中断状態から帰還しても課題10と獲得済み報酬を維持する', () => {
  const game = pause(prepare());
  const gold = game.s.gold;
  const essence = game.s.essence;
  const xp = game.record('leaf').xp;
  game.retire();
  assert.equal(game.s.battle.status, 'retired');
  assert.equal(game.s.nextTask, 10);
  assert.equal(game.s.gold, gold);
  assert.equal(game.s.essence, essence);
  assert.equal(game.record('leaf').xp, xp);
  assert.throws(() => game.resumeTasks(batch('終了済み'), 1000));
});

test('旧v4の課題上限による敗北だけを修復し、再読込でも報酬を再配布しない', () => {
  const game = pause(prepare());
  game.s.gold = 123;
  game.s.gems = 7;
  game.s.inventory.seed = 4;
  const legacy = json(game.s);
  legacy.battle.status = 'lost';
  legacy.battle.reason = '課題を一巡しました。育てた仲間と、また挑めます。';
  legacy.battle.deadline = 300000;
  const repaired = new QuestEngine(json(legacy));
  assert.equal(repaired.s.battle.status, 'paused');
  assert.equal(repaired.s.battle.deadline, null);
  assert.equal(repaired.s.battle.index, 10);
  assert.equal(repaired.s.nextTask, 10);
  assert.deepEqual(retained(repaired), retained(game));
  const second = new QuestEngine(json(repaired.s));
  assert.deepEqual(json(second.s), json(repaired.s));
  for (const change of [
    { status: 'lost', hp: 0 },
    { status: 'lost', reason: 'チームのHPが0になりました。' },
    { status: 'lost', index: 9 },
    { status: 'won' },
    { status: 'retired' }
  ]) {
    const saved = json(legacy);
    Object.assign(saved.battle, change);
    const restored = new QuestEngine(saved);
    assert.equal(restored.s.battle.status, saved.battle.status);
    assert.equal(restored.s.battle.hp, saved.battle.hp);
  }
});

console.log(passed + ' task-continuation regression tests passed.');
