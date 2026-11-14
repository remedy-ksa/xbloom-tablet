// node tests/protocol.test.js  — protocol checks that run without a machine.
const path = require('path');
const assert = require('assert');
const D = path.join(__dirname, '..');
global.window = global; global.self = global;
require(path.join(D, 'js/remedy-recipes.js'));
const XB = require(path.join(D, 'js/protocol.js'));

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('ok  ', name); };
const fr = Math.fround;
// a machine notification (58 02 …) with a correct CRC
function notif(code, ints) { const f = XB.buildFrame(code, ints); f[1] = 2; const c = XB.crc16(f, f.length - 2); f[f.length - 2] = c & 255; f[f.length - 1] = c >> 8; return f; }
const ENJOY = notif(XB.N.ENJOY, [0]);
const WEIGHT = notif(XB.N.WEIGHT, [XB.floatBits(12.5)]);
const BIG = notif(XB.N.ACTIVITY, [1, 2, 3, 4, 5, 6, 7, 8]);
function run(chunks, asm = new XB.Assembler(), step = 50) {
  const out = []; let now = 1000;
  for (const c of chunks) { asm.feed(c, (f) => out.push(XB.frameCode(f)), now); now += step; }
  return { out, asm };
}
const cat = (...a) => new Uint8Array(a.flatMap((x) => Array.from(x)));

t('firmware water gate holds on every Remedy recipe', () => {
  for (const r of window.REMEDY_RECIPES) {
    const blob = XB.encodeRecipeBlob(r), ratio = blob[blob.length - 1];
    const target = Math.trunc(fr(fr(fr(ratio) / 10) * fr(Math.round(r.dose_g))));
    assert(Math.abs(target - XB.totalWater(r)) <= 2, r.uid);
  }
});
t('every Remedy recipe passes validate and names its crop', () => {
  for (const r of window.REMEDY_RECIPES) { assert.strictEqual(XB.validate(r), null, r.uid); assert(r.crop && r.uid.startsWith('r-' + r.crop + '-'), r.uid); }
});
t('ENJOY code is 40512 and parses', () => { assert.strictEqual(XB.N.ENJOY, 40512); assert.strictEqual(XB.parseEvent(ENJOY).code, 40512); });
t('execute frame bytes unchanged', () => assert.strictEqual(XB.toHex(XB.F.execute()), '580101421f0c000000017fcf'));
t('two frames in one notification', () => assert.deepStrictEqual(run([cat(ENJOY, WEIGHT)]).out, [40512, 20501]));
t('frame split 7 + rest', () => assert.deepStrictEqual(run([ENJOY.slice(0, 7), ENJOY.slice(7)]).out, [40512]));
t('frame split 12 + rest', () => assert.deepStrictEqual(run([ENJOY.slice(0, 12), ENJOY.slice(12)]).out, [40512]));
t('long frame split in three', () => assert.deepStrictEqual(run([BIG.slice(0, 5), BIG.slice(5, 20), BIG.slice(20)]).out, [8023]));
// M4 (a)-(d)
t('M4a junk before ENJOY in the same notification', () => assert.deepStrictEqual(run([cat([1, 2, 3], ENJOY)]).out, [40512]));
t('M4b ENJOY, junk, WEIGHT in one notification', () => assert.deepStrictEqual(run([cat(ENJOY, [9, 9], WEIGHT)]).out, [40512, 20501]));
t('M4c lost tail, then ENJOY, then WEIGHT', () => assert.deepStrictEqual(run([BIG.slice(0, 10), ENJOY, WEIGHT]).out, [40512, 20501]));
t('M4d corrupt length 1000, then ENJOY x3', () => {
  const bad = ENJOY.slice(); bad[5] = 0xe8; bad[6] = 0x03;
  assert.deepStrictEqual(run([bad.slice(0, 9), ENJOY, ENJOY, ENJOY]).out, [40512, 40512, 40512]);
});
t('half frame older than 500 ms is dropped', () => {
  const { out, asm } = run([ENJOY.slice(0, 7)]);
  asm.feed(ENJOY.slice(7), (f) => out.push(XB.frameCode(f)), 1000 + 600);
  assert(!out.includes(40512));   // the tail alone is not a frame
  assert.strictEqual(asm.pending.length, 0);
});
t('T1 ENJOY with a bad CRC is dropped', () => { const b = ENJOY.slice(); b[b.length - 1] ^= 0xff; assert.deepStrictEqual(run([b]).out, []); });
t('T1 good frame after a bad one in the same notification', () => { const b = ENJOY.slice(); b[b.length - 1] ^= 0xff; assert.deepStrictEqual(run([cat(b, WEIGHT)]).out, [20501]); });
t('a firmware whose CRCs never match still gets through after 3 frames', () => {
  const b = ENJOY.slice(); b[b.length - 1] ^= 0xff;
  assert.deepStrictEqual(run([b, b, b, b]).out, [40512, 40512]);
});
t('one good CRC keeps checking on', () => {
  const b = ENJOY.slice(); b[b.length - 1] ^= 0xff;
  assert.deepStrictEqual(run([WEIGHT, b, b, b, b]).out, [20501]);
});
t('a notification with no 58 02 frame is handed on whole (echo path)', () => {
  const echo = XB.buildFrame(8002, [0, 0, 0, 0]);   // 58 01 …
  const r = run([echo]); assert.deepStrictEqual(r.out, [8002]);
});
t('pyRound ties to even', () => assert.deepStrictEqual([0.5, 1.5, 2.5, -1.5].map(XB.pyRound).map((x) => x + 0), [0, 2, 2, -2]));
t('T2 negative wait is refused', () => {
  assert(XB.validate({ cup_type: 3, dose_g: 15, grinder_on: false, pours: [{ volume_ml: 200, temp_c: 93, flow: 3, pause_s: -5, pattern: 1 }] }));
});
t('version: sw.js and every ?v= in index.html match', () => {
  const fs = require('fs');
  const v = /const VERSION = (\d+);/.exec(fs.readFileSync(path.join(D, 'sw.js'), 'utf8'))[1];
  const links = fs.readFileSync(path.join(D, 'index.html'), 'utf8').match(/\?v=\d+"/g);
  assert(links.length >= 7 && links.every((l) => l === `?v=${v}"`), links.join(' '));
});
console.log(`\n${pass} passed`);
