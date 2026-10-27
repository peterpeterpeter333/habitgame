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
const { QuestEngine, DUNGEONS } = vm.runInContext('({ QuestEngine, DUNGEONS })', context);
const json = value => JSON.parse(JSON.stringify(value));
const first = DUNGEONS[0];
const second = DUNGEONS[1];
const advent = DUNGEONS.find(dungeon => dungeon.step === 5);
const adventPrerequisites = DUNGEONS.slice(0, advent.index + 1).map(dungeon => dungeon.id);
let passed = 0;
function test(name, run) {
  run();
  passed++;
  console.log('PASS: ' + name);
}
function prepared(mode = 'standard', { cleared = [], advents = [], gems = 37 } = {}) {
  const game = new QuestEngine();
  game.choose('leaf');
  game.setMode(mode);
  game.setTaskCount(2);
  game.setTask(0, '最初の課題');
  game.setTask(1, '次の課題');
  game.s.cleared = [...cleared];
  game.s.advents = [...advents];
  game.s.gems = gems;
  return game;
}
function readyToWin(mode, dungeon, difficulty, state) {
  const game = prepared(mode, state);
  game.start(dungeon.id, 0, difficulty);
  game.s.battle.floor = 2;
  game.loadEnemy();
  game.s.battle.enemy = 1;
  return game;
}
function win(game) {
  const event = game.complete(0, () => .99);
  assert.equal(event.type, 'win');
  assert.equal(game.s.battle.status, 'won');
  return game;
}

for (const mode of ['standard', 'focus']) {
  test(mode + ': 最初の道の通常初クリア5個、通常再クリア0個', () => {
    const game = readyToWin(mode, first, 'normal');
    const before = game.s.gems;
    win(game);
    assert.equal(game.s.battle.firstClear, true);
    assert.equal(!!game.s.battle.firstAdventClear, false);
    assert.equal(game.s.battle.gemReward, 5);
    assert.equal(game.s.gems, before + 5);
    assert.deepEqual(json(game.s.cleared), [first.id]);
    const repeated = readyToWin(mode, first, 'normal', { cleared: [first.id], gems: game.s.gems });
    win(repeated);
    assert.equal(repeated.s.battle.firstClear, false);
    assert.equal(repeated.s.battle.gemReward, 0);
    assert.equal(repeated.s.gems, game.s.gems);
    assert.deepEqual(json(repeated.s.cleared), [first.id]);
    assert.equal(repeated.s.inventory.bond || 0, 0);
  });

  test(mode + ': その他の道の通常初クリア1個、通常再クリア0個', () => {
    const game = readyToWin(mode, second, 'normal', { cleared: [first.id] });
    const before = game.s.gems;
    win(game);
    assert.equal(game.s.battle.firstClear, true);
    assert.equal(game.s.battle.gemReward, 1);
    assert.equal(game.s.gems, before + 1);
    assert.deepEqual(json(game.s.cleared), [first.id, second.id]);
    assert.equal(game.s.inventory.bond, 1);
    assert(game.s.fragments.includes(second.id));
    const repeated = readyToWin(mode, second, 'normal', { cleared: [first.id, second.id], gems: game.s.gems });
    win(repeated);
    assert.equal(repeated.s.battle.firstClear, false);
    assert.equal(repeated.s.battle.gemReward, 0);
    assert.equal(repeated.s.gems, game.s.gems);
    assert.equal(repeated.s.inventory.bond || 0, 0);
  });

  test(mode + ': 降臨初クリアだけ1個、通常の初クリア報酬とは別に判定する', () => {
    const game = readyToWin(mode, advent, 'advent', { cleared: adventPrerequisites });
    const cleared = json(game.s.cleared);
    const before = game.s.gems;
    win(game);
    assert.equal(game.s.battle.firstClear, false);
    assert.equal(game.s.battle.firstAdventClear, true);
    assert.equal(game.s.battle.gemReward, 1);
    assert.equal(game.s.gems, before + 1);
    assert.deepEqual(json(game.s.cleared), cleared);
    assert.deepEqual(json(game.s.advents), [advent.id]);
    assert.equal(game.s.inventory.bond || 0, 0);
    assert.deepEqual(json(game.s.fragments), []);
    const repeated = readyToWin(mode, advent, 'advent', { cleared, advents: [advent.id], gems: game.s.gems });
    win(repeated);
    assert.equal(repeated.s.battle.firstClear, false);
    assert.equal(!!repeated.s.battle.firstAdventClear, false);
    assert.equal(repeated.s.battle.gemReward, 0);
    assert.equal(repeated.s.gems, game.s.gems);
    assert.deepEqual(json(repeated.s.advents), [advent.id]);
    const normalRepeat = readyToWin(mode, advent, 'normal', { cleared, advents: [advent.id], gems: game.s.gems });
    win(normalRepeat);
    assert.equal(normalRepeat.s.battle.gemReward, 0);
    assert.equal(normalRepeat.s.gems, game.s.gems);
  });

  test(mode + ': 敗北と途中帰還では魔法石を付与しない', () => {
    const lost = prepared(mode);
    lost.start(first.id, 0);
    lost.s.battle.hp = 1;
    const beforeLoss = lost.s.gems;
    const event = lost.complete(lost.s.battle.deadline);
    assert.equal(event.type, 'expired');
    assert.equal(lost.s.battle.status, 'lost');
    assert.equal(lost.s.gems, beforeLoss);
    assert.deepEqual(json(lost.s.cleared), []);
    assert.deepEqual(json(lost.s.advents), []);
    const retired = prepared(mode);
    retired.start(first.id, 0);
    retired.complete(0, () => .99);
    assert.equal(retired.s.battle.status, 'active');
    const beforeRetire = retired.s.gems;
    retired.retire();
    assert.equal(retired.s.battle.status, 'retired');
    assert.equal(retired.s.gems, beforeRetire);
    assert.deepEqual(json(retired.s.cleared), []);
    assert.deepEqual(json(retired.s.advents), []);
  });
}

test('最初の道の5個はダンジョンIDで判定し、踏破配列の件数に依存しない', () => {
  const game = readyToWin('standard', first, 'normal', { cleared: [second.id], gems: 21 });
  win(game);
  assert.equal(game.s.battle.gemReward, 5);
  assert.equal(game.s.gems, 26);
  assert.equal(game.s.cleared.length, 2);
});

test('通常と集中で同じ踏破記録を共有し、モード切替で初回報酬を再取得しない', () => {
  const game = readyToWin('standard', first, 'normal');
  win(game);
  const before = game.s.gems;
  game.s.battle = null;
  game.setMode('focus');
  game.setTask(0, '集中の課題1');
  game.setTask(1, '集中の課題2');
  game.start(first.id, 1000, 'normal');
  game.s.battle.floor = 2;
  game.loadEnemy();
  game.s.battle.enemy = 1;
  const event = game.complete(1000, () => .99);
  assert.equal(event.type, 'win');
  assert.equal(game.s.battle.gemReward, 0);
  assert.equal(game.s.gems, before);
});

test('勝利後の完了連打・時間精算・再読込は魔法石や踏破報酬を二重付与しない', () => {
  for (const [dungeon, difficulty, state] of [
    [first, 'normal', {}],
    [second, 'normal', { cleared: [first.id] }],
    [advent, 'advent', { cleared: adventPrerequisites }]
  ]) {
    const game = readyToWin('standard', dungeon, difficulty, state);
    win(game);
    const before = json(game.s);
    assert.equal(game.complete(1000), null);
    assert.equal(game.complete(2000), null);
    assert.deepEqual(json(game.settle(999999999)), []);
    assert.deepEqual(json(game.s), before);
    const restored = new QuestEngine(json(game.s));
    assert.equal(restored.complete(999999999), null);
    assert.deepEqual(json(restored.s), before);
    const restoredAgain = new QuestEngine(json(restored.s));
    assert.deepEqual(json(restoredAgain.s), before);
  }
});

test('旧active保存の勝利にも新しい初回・再クリア報酬規則を適用する', () => {
  for (const [mode, dungeon, difficulty, state, expected] of [
    ['standard', first, 'normal', {}, 5],
    ['standard', second, 'normal', { cleared: [first.id] }, 1],
    ['focus', second, 'normal', { cleared: [first.id, second.id] }, 0],
    ['standard', advent, 'advent', { cleared: adventPrerequisites }, 1],
    ['focus', advent, 'advent', { cleared: adventPrerequisites, advents: [advent.id] }, 0]
  ]) {
    const current = readyToWin(mode, dungeon, difficulty, state);
    const old = json(current.s);
    delete old.battle.firstAdventClear;
    if (mode === 'standard') delete old.battle.mode;
    const restored = new QuestEngine(old);
    const before = restored.s.gems;
    win(restored);
    assert.equal(restored.s.battle.gemReward, expected);
    assert.equal(restored.s.gems, before + expected);
  }
});

test('既存所持石・通常踏破・降臨踏破と旧クリア結果の既得報酬を移行で変えない', () => {
  const game = readyToWin('standard', second, 'normal', { cleared: [first.id], gems: 137 });
  win(game);
  const old = json(game.s);
  old.gems = 137;
  old.cleared = [first.id, second.id];
  old.advents = [advent.id];
  old.battle.gemReward = 2;
  delete old.battle.firstAdventClear;
  delete old.battle.mode;
  const restored = new QuestEngine(old);
  assert.equal(restored.s.gems, 137);
  assert.deepEqual(json(restored.s.cleared), [first.id, second.id]);
  assert.deepEqual(json(restored.s.advents), [advent.id]);
  assert.equal(restored.s.battle.gemReward, 2);
  assert.equal(restored.s.battle.status, 'won');
  assert.equal(restored.complete(999999999), null);
  assert.equal(restored.s.gems, 137);
  assert.equal(restored.s.battle.gemReward, 2);
  const secondRestore = new QuestEngine(json(restored.s));
  assert.equal(secondRestore.s.gems, 137);
  assert.equal(secondRestore.s.battle.gemReward, 2);
});

console.log(passed + ' gem-reward regression tests passed.');
