'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert/strict');
const notes = [], targets = [], spoken = [], cleared = [];
const state = { audio: { bgm: true, se: true, voice: true }, battle: { status: 'active', floor: 0, floorCount: 3, region: 'forest', deadline: 400000 } };
let tick;
class AudioContextMock {
  constructor() { this.currentTime = 10; this.destination = { kind: 'destination' }; }
  resume() { return Promise.resolve(); }
  createGain() {
    const gain = { kind: 'gain', peaks: [], connected: null };
    gain.gain = {
      value: 0,
      setValueAtTime(value, time) { gain.peaks.push({ value, time }); },
      exponentialRampToValueAtTime(value, time) { gain.peaks.push({ value, time }); },
      setTargetAtTime(value, time, constant) { targets.push({ gain, value, time, constant }); }
    };
    gain.connect = destination => { gain.connected = destination; };
    return gain;
  }
  createOscillator() {
    const note = { type: 'sine', gain: null };
    note.frequency = { setValueAtTime(frequency, time) { note.f = frequency; note.frequencyTime = time; } };
    note.connect = gain => { note.gain = gain; };
    note.start = time => { note.startAt = time; };
    note.stop = time => { note.stopAt = time; };
    notes.push(note);
    return note;
  }
}
class Utterance { constructor(text) { this.text = text; } }
const context = {
  window: { AudioContext: AudioContextMock, SpeechSynthesisUtterance: Utterance, speechSynthesis: { cancel() {}, speak: utterance => spoken.push(utterance) } },
  SpeechSynthesisUtterance: Utterance,
  s: () => state,
  toast: message => { throw Error(message); },
  Date: { now: () => 100000 },
  setInterval: callback => { tick = callback; return 1; },
  clearInterval: id => cleared.push(id)
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'src/sound.js'), 'utf8'), context);
const Soundscape = vm.runInContext('Soundscape', context);
const sound = new Soundscape();
sound.unlock();
let passed = 0;
function test(name, run) { run(); passed++; console.log('PASS: ' + name); }
function play(kind) {
  notes.length = 0;
  sound.se(kind);
  return [...notes];
}
function signature(cue) {
  return JSON.stringify(cue.map(note => [note.f, note.type, +(note.startAt - 10).toFixed(4), +(note.stopAt - note.startAt).toFixed(4)]));
}
const limits = {
  charge: .30, attack: .20, impact: .25, heavy: .35, break: .40, win: .85,
  'skill-power': .35, 'skill-heal': .45, 'skill-guard': .35,
  'skill-pierce': .20, 'skill-drain': .40, 'skill-revive': .55,
  combo: .20, finisher: .45
};

test('攻撃・衝撃・撃破・勝利と各スキルは別の有限な音を生成する', () => {
  const signatures = new Set();
  for (const [kind, limit] of Object.entries(limits)) {
    const cue = play(kind);
    assert(cue.length > 0 && cue.length <= 10, kind + ': bounded layers');
    for (const note of cue) {
      assert(Number.isFinite(note.f) && note.f >= 20 && note.f < 20000, kind + ': frequency');
      assert(Number.isFinite(note.startAt) && note.startAt >= 10, kind + ': start');
      assert(Number.isFinite(note.stopAt) && note.stopAt > note.startAt, kind + ': stop');
      assert(note.stopAt - 10 <= limit + .00001, kind + ': short cue');
      assert(['sine', 'triangle', 'square', 'sawtooth'].includes(note.type), kind + ': waveform');
      assert(note.gain.peaks.every(peak => Number.isFinite(peak.value) && peak.value > 0 && peak.value <= .05), kind + ': per-layer volume');
    }
    signatures.add(signature(cue));
  }
  assert.equal(signatures.size, Object.keys(limits).length);
});

test('重ねた音の音量を抑え、単独SEの急な音量増大を防ぐ', () => {
  for (const kind of Object.keys(limits)) {
    const cue = play(kind);
    for (let time = 10; time < 11; time += .001) {
      const total = cue.reduce((sum, note) => time >= note.startAt && time <= note.stopAt ? sum + Math.max(...note.gain.peaks.map(peak => peak.value)) : sum, 0);
      assert(total <= .16, kind + ': bounded simultaneous gain ' + total);
    }
  }
});

test('BGMを絞ってもSEはBGM busを経由せず、既存duck/restoreを維持する', () => {
  sound.duck();
  assert.equal(targets.at(-1).value, .12);
  const cue = play('heavy');
  assert(cue.every(note => note.gain.connected === sound.ctx.destination));
  assert(cue.every(note => note.gain.connected !== sound.bus));
  sound.restore();
  assert.equal(targets.at(-1).value, .65);
});

test('SE無効と未開始では発音せず、従来イベントと未知イベントを受け付ける', () => {
  state.audio.se = false;
  assert.equal(play('finisher').length, 0);
  state.audio.se = true;
  const locked = new Soundscape();
  notes.length = 0;
  locked.se('attack');
  assert.equal(notes.length, 0);
  for (const kind of ['enter', 'select', 'bond', 'boss', 'drop', 'rise', 'evolve', 'hurt', 'heal']) {
    const cue = play(kind);
    assert(cue.length > 0, kind);
    assert(cue.every(note => Number.isFinite(note.f) && note.f > 0), kind);
  }
  const attack = signature(play('attack'));
  assert.equal(signature(play('unknown')), attack);
  assert.equal(signature(play('constructor')), attack);
});

test('既存BGMは引き続きmusic busへ発音し、停止できる', () => {
  notes.length = 0;
  tick();
  assert(notes.length > 0);
  assert(notes.every(note => note.gain.connected === sound.bus));
  assert(notes.every(note => Number.isFinite(note.f) && note.f > 0));
  sound.stop();
  assert.equal(sound.loop, null);
  assert(cleared.includes(1));
});

test('日本語の時間案内と音声のBGM音量調整を維持する', () => {
  sound.speak('残り30分です。');
  const utterance = spoken.at(-1);
  assert.equal(utterance.text, '残り30分です。');
  assert.equal(utterance.lang, 'ja-JP');
  assert.equal(utterance.rate, 1.12);
  utterance.onstart();
  assert.equal(targets.at(-1).value, .14);
  utterance.onend();
  assert.equal(targets.at(-1).value, .65);
  state.audio.voice = false;
  const count = spoken.length;
  sound.speak('無効');
  assert.equal(spoken.length, count);
});

console.log(passed + ' sound-fx regression tests passed.');
