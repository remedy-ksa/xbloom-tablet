// xBloom Studio BLE protocol — frames, recipe encoding, notification parsing.
// JavaScript port of Mesh-one/Xbloom-panel's xbloom_protocol.cpp, which is itself
// ported from xbloom-py (MIT). Unofficial: a machine firmware update can change it.
// Works in the browser and in Node (for the byte-for-byte test).
(function (root) {
  'use strict';

  const SERVICE_HINTS = ['0000e0ff-3c17-d293-8e48-14fe2e4da212', 0xffe0];
  const UUID_TX = '0000ffe1-0000-1000-8000-00805f9b34fb'; // write
  const UUID_RX = '0000ffe2-0000-1000-8000-00805f9b34fb'; // notify
  const NAME_PREFIX = 'XBLOOM';

  const CMD = {
    HANDSHAKE: 8100, BYPASS_DOSE: 8102, SET_CUP: 8104,
    RECIPE_GRIND: 8001, RECIPE_NO_GRIND: 8004,
    EXECUTE: 8002, QUIT_RECIPE: 8017, TARE: 8500,
    BREW_PAUSE: 40518, BREW_RESUME: 40524, BREW_STOP: 40519,
  };
  const N = {
    ACTIVITY: 8023, WEIGHT: 20501, WEIGHT_ALT: 10507, WATER: 40523, BLOOM: 40510,
    ENJOY: 40512, ABANDONED: 40513, MACHINE_INFO: 40521, SLEEPING: 8009, AWAKE: 8011,
    PODS: 40501, FAULT_NO_WATER: 40522, FAULT_NO_BEANS: 40517, FAULT_DOSE_WATER: 8204, FAULT_GEAR: 8203,
  };
  const PAT = { CENTERED: 1, SPIRAL: 2, CIRCULAR: 3 };
  const MAX_POURS = 9;

  // ---- numeric helpers ------------------------------------------------------
  const f32 = new Float32Array(1);
  const u32v = new Uint32Array(f32.buffer);
  function floatBits(x) { f32[0] = x; return u32v[0]; }
  function bitsFloat(u) { u32v[0] = u >>> 0; return f32[0]; }
  // Python round(): nearest, ties to even.
  function pyRound(x) {
    const r = Math.round(x);
    if (Math.abs(x % 1) === 0.5) return 2 * Math.round(x / 2);
    return r;
  }
  const trunc = Math.trunc;
  const fr = Math.fround;

  function totalWater(r) { return r.pours.reduce((t, p) => t + p.volume_ml, 0); }

  const DOSE_MIN = [0, 15, 5, 5, 1], DOSE_MAX = [0, 15, 18, 25, 5];
  function doseRange(cup) { return [DOSE_MIN[cup] || 5, DOSE_MAX[cup] || 25]; }

  // Returns null when the recipe is in the machine's ranges, else a reason (Arabic).
  function validate(r) {
    const n = r.pours.length;
    if (n < 1 || n > MAX_POURS) return 'الوصفة تحتاج من ١ إلى ٩ صبّات';
    if (r.cup_type < 1 || r.cup_type > 4) return 'نوع الكوب غير صحيح';
    if (r.dose_g < DOSE_MIN[r.cup_type] || r.dose_g > DOSE_MAX[r.cup_type])
      return `كمية البن لهذا الكوب لازم بين ${DOSE_MIN[r.cup_type]} و ${DOSE_MAX[r.cup_type]} جرام`;
    if (r.grinder_on) {
      if (r.grind_size < 1 || r.grind_size > 80) return 'درجة الطحن من ١ إلى ٨٠';
      if (r.rpm < 60 || r.rpm > 120) return 'سرعة الطاحونة من ٦٠ إلى ١٢٠';
    }
    for (const p of r.pours) {
      if (p.volume_ml < 0 || p.volume_ml > 240) return 'كمية الصبّة من ٠ إلى ٢٤٠ مل';
      if (p.temp_c < 20 || p.temp_c > 98) return 'الحرارة من ٢٠ إلى ٩٨';
      if (p.flow < 3.0 - 1e-9 || p.flow > 3.5 + 1e-9) return 'سرعة الصب من ٣٫٠ إلى ٣٫٥';
      if (!(p.pause_s >= 0 && p.pause_s <= 59)) return 'الانتظار من ٠ إلى ٥٩ ثانية';
      if (p.pattern < 1 || p.pattern > 3) return 'نمط الصب غير صحيح';
    }
    const w = totalWater(r);
    if (w <= 0) return 'ما فيه ماء في الوصفة';
    const ratio = w / r.dose_g;
    if (ratio < 5 || ratio > 25) return 'النسبة لازم بين ١:٥ و ١:٢٥';
    return null;
  }

  // ---- frames ---------------------------------------------------------------
  function crc16(bytes, len) {
    let crc = 0;
    for (let i = 0; i < len; i++) {
      crc ^= bytes[i];
      for (let k = 0; k < 8; k++) crc = (crc & 1) ? ((crc >>> 1) ^ 0x8408) : (crc >>> 1);
    }
    return crc & 0xffff;
  }
  function putU32(arr, v) { v >>>= 0; for (let i = 0; i < 4; i++) arr.push((v >>> (8 * i)) & 0xff); }

  // 58 01 <type> [code LE16] [total_len LE32] 01 [data] [crc LE16]
  function buildFrame(code, ints, raw, frameType) {
    let body = [];
    if (raw) body = Array.from(raw);
    else if (ints) for (const v of ints) putU32(body, v);
    const f = [0x58, 0x01, frameType == null ? 1 : frameType, code & 0xff, (code >>> 8) & 0xff];
    putU32(f, 12 + body.length);
    f.push(0x01);
    for (const b of body) f.push(b);
    const c = crc16(f, f.length);
    f.push(c & 0xff, c >>> 8);
    return new Uint8Array(f);
  }

  // The firmware only commits a recipe when, in float32,
  //   trunc((ratio_byte / 10) * dose) == sum(pour volumes on the wire).
  function gateVolumes(src, doseI) {
    let total = 0;
    for (const v of src) total += v;
    if (doseI <= 0 || total <= 0 || !src.length) return { vols: src.map(pyRound), ratio: 0 };
    const r0 = pyRound((total / doseI) * 10);
    let chosen = -1, target = -1;
    for (const r of [r0, r0 + 1, r0 - 1, r0 + 2, r0 - 2]) {
      if (r <= 0 || r > 0xff) continue;
      const pd = fr(fr(fr(r) / 10) * fr(doseI));
      if (trunc(pd) === trunc(pd + 0.5)) { chosen = r; target = trunc(pd); break; }
    }
    if (target < 0) {
      chosen = Math.max(1, Math.min(255, r0));
      target = trunc(fr(fr(fr(chosen) / 10) * fr(doseI)));
    }
    const ideal = src.map((v) => (v * target) / total);
    const out = ideal.map((x) => trunc(x));
    let sum = out.reduce((a, b) => a + b, 0);
    const deficit = target - sum;
    if (deficit > 0) {
      const order = src.map((_, i) => i);
      order.sort((a, b) => {  // stable in modern JS
        const da = ideal[a] - out[a], db = ideal[b] - out[b];
        return da > db ? -1 : da < db ? 1 : 0;
      });
      for (let k = 0; k < deficit && k < order.length; k++) out[order[k]] += 1;
    }
    return { vols: out, ratio: chosen & 0xff };
  }

  function patternByte(api) { return api === PAT.CENTERED ? 0 : api === PAT.SPIRAL ? 2 : api === PAT.CIRCULAR ? 1 : 0; }
  function useGrinder(r) { return r.grinder_on && r.grind_size > 0; }

  function encodeRecipeBlob(r) {
    const grind = useGrinder(r);
    const doseI = r.dose_g ? pyRound(r.dose_g) : 0;
    const src = r.pours.map((p) => Math.max(0, p.volume_ml));
    const { vols, ratio } = gateVolumes(src, doseI);
    const parts = [];
    r.pours.forEach((p, i) => {
      const volume = vols[i];
      const temp = trunc(p.temp_c) & 0xff;
      const pat = patternByte(p.pattern);
      const vib = (p.agitate_before ? 1 : 0) | (p.agitate_after ? 2 : 0);
      const flow = pyRound(p.flow * 10) & 0xff;
      if (volume > 127) {
        for (let k = 0; k < trunc(volume / 127); k++) parts.push(127, temp, pat, vib);
        const rem = volume % 127;
        if (rem) parts.push(rem, temp, pat, vib);
      } else {
        parts.push(volume & 0xff, temp, pat, vib);
      }
      const waitNeg = (-trunc(p.pause_s)) & 0xff;
      const rpm = i === 0 && grind ? r.rpm & 0xff : 0;
      parts.push(waitNeg, 0, rpm, flow);
    });
    const gs = grind ? Math.min(r.grind_size, 80) : 0;
    return new Uint8Array([parts.length & 0xff, ...parts, gs & 0xff, ratio & 0xff]);
  }

  // Frames that LOAD a recipe (nothing here starts a brew).
  function buildLoadFrames(r) {
    const out = [];
    out.push(buildFrame(CMD.HANDSHAKE, [185, 1]));
    out.push(buildFrame(CMD.BYPASS_DOSE, [0, 0, pyRound(r.dose_g)]));
    let cmax = 200, cmin = 80;
    if (r.cup_type === 2) { cmax = 110; cmin = 90; }
    out.push(buildFrame(CMD.SET_CUP, [floatBits(cmax), floatBits(cmin)]));
    out.push(buildFrame(useGrinder(r) ? CMD.RECIPE_GRIND : CMD.RECIPE_NO_GRIND, null, encodeRecipeBlob(r)));
    return out;
  }

  const F = {
    execute: () => buildFrame(CMD.EXECUTE),
    quitRecipe: () => buildFrame(CMD.QUIT_RECIPE),
    tare: () => buildFrame(CMD.TARE),
    pause: () => buildFrame(CMD.BREW_PAUSE),
    resume: () => buildFrame(CMD.BREW_RESUME),
    stop: () => buildFrame(CMD.BREW_STOP),
    grinderEnter: (size, rpm) => buildFrame(8006, [size, rpm]),
    grinderStart: (size, rpm) => buildFrame(3500, [1000, size, rpm]),
    grinderStop: () => buildFrame(3505),
    brewerEnter: (pb, t) => buildFrame(8007, [pb, floatBits(t * 10)]),
    brewerStart: (flow, vol, t, pb) =>
      buildFrame(4506, [floatBits(flow * 10), floatBits(vol * 10), floatBits(t * 10), 0, pb]),
    brewerPause: () => buildFrame(8019),
    brewerResume: () => buildFrame(8021),
    brewerStop: () => buildFrame(4507),
    brewerTemp: (t) => buildFrame(4510, [pyRound(t * 10)]),
    brewerPattern: (pb) => buildFrame(8016, [pb]),
    scaleEnter: () => buildFrame(8003),
    quitGrinder: () => buildFrame(8012),
    quitBrewer: () => buildFrame(8013),
    quitScale: () => buildFrame(8014),
    weightUnit: (u) => buildFrame(8005, [u]),  // 1 = g, 0 = ml, 2 = oz
  };
  const UNIT = { G: 1, ML: 0, OZ: 2 };
  function tempDisplayToWire(d) { return d <= 39 ? 20 : d >= 96 ? 98 : d; }

  function frameCode(f) { return f.length < 5 || f[0] !== 0x58 ? 0 : f[3] | (f[4] << 8); }

  // ---- notifications ----------------------------------------------------------
  function rdU32(d, i) { return (d[i] | (d[i + 1] << 8) | (d[i + 2] << 16) | (d[i + 3] << 24)) >>> 0; }

  function parseEvent(d) {
    if (d.length < 10 || d[0] !== 0x58 || d[1] !== 0x02) return null;
    const code = d[3] | (d[4] << 8);
    const payload = d.length > 12 ? d.subarray(10, d.length - 2) : new Uint8Array(0);
    return {
      code, payload,
      hasU32: payload.length >= 4,
      u32: () => (payload.length >= 4 ? rdU32(payload, 0) : 0),
      f32: () => (payload.length >= 4 ? bitsFloat(rdU32(payload, 0)) : 0),
    };
  }

  function refusalCode(f) {
    if (f.length < 12) return 0;
    if (f.length - 12 < 16) return 0;
    const p = 10;
    return ((f[p + 12] << 16) | (f[p + 13] << 8) | f[p + 14]) >>> 0;
  }
  function refusalReason(code) {
    if (!code) return null;
    if (code & 0x000040) return 'ما فيه ماء في الخزان';
    if (code & 0x001800) return 'رجّع المكينة للشاشة الرئيسية وحاول مرة ثانية';
    if (code & 0x100000) return 'المكينة مو جاهزة';
    if (code & 0x200000) return 'المكينة ما خلّصت الاستعادة بعد التشغيل';
    if (code & 0x400000) return 'المكينة رفضت الوصفة';
    if (code & (0x000100 | 0x000200 | 0x000400 | 0x004000 | 0x010000 | 0x020000 | 0x040000 | 0x080000 | 0x800000))
      return 'المكينة مشغولة';
    return null;
  }
  function activityName(a) {
    switch (a) {
      case 1: return 'Home'; case 3: return 'Brewer'; case 65: return 'Auto';
      case 4: case 5: return 'Scale'; case 29: return 'Starting'; case 34: return 'Grinding';
      case 30: case 35: case 16: return 'Brewing'; case 31: return 'Paused'; case 36: return 'Done';
      default: return null;
    }
  }
  function faultName(c) {
    switch (c) {
      case N.FAULT_NO_WATER: return 'الخزان فاضي، عبّه ماء';
      case N.FAULT_NO_BEANS: return 'ما فيه بن';
      case N.FAULT_DOSE_WATER: return 'خطأ في كمية البن أو الماء';
      case N.FAULT_GEAR: return 'خطأ في ترس الطاحونة';
      default: return null;
    }
  }

  // Splits FFE2 notifications into whole, checksum-valid frames.
  //  - finds frame starts (58 02) anywhere, so bytes of junk before or between frames don't hide them
  //  - a frame split over notifications waits at most PENDING_MS, and a new notification that opens a
  //    frame of its own drops a half frame whose tail never came
  //  - frames are checked against their CRC. If a connection only ever sends frames that fail it
  //    (a firmware that computes it differently), it stops checking after LENIENT_AFTER of them and logs it,
  //    so the panel keeps working instead of going deaf.
  //  - a notification with no 58 02 frame in it is handed on whole, as before (echo matching reads its code)
  const MAX_FRAME = 1024, PENDING_MS = 500, LENIENT_AFTER = 3;
  function frameLen(d, i, n) {
    if (n - i < 9 || d[i] !== 0x58 || d[i + 1] !== 0x02) return 0;
    const L = rdU32(d, i + 5);
    return L >= 12 && L <= MAX_FRAME ? L : 0;
  }
  function crcOk(f) {
    if (f.length < 12) return false;
    return crc16(f, f.length - 2) === (f[f.length - 2] | (f[f.length - 1] << 8));
  }
  // could bytes d (from index i) be the start of a frame still arriving?
  function opensFrame(d, i) {
    const n = d.length - i;
    if (n < 1 || d[i] !== 0x58) return false;
    if (n < 2) return true;
    if (d[i + 1] !== 0x02) return false;
    if (n < 9) return true;
    const L = frameLen(d, i, d.length);
    return !!L && L > n;
  }
  class Assembler {
    constructor(log) { this.log = log || null; this.reset(); this.lenient = false; this.good = 0; this.bad = 0; }
    reset() { this.pending = new Uint8Array(0); this.pendingAt = 0; }
    newConnection() { this.reset(); this.lenient = false; this.good = 0; this.bad = 0; }
    check(f) {
      if (this.lenient) return true;
      if (crcOk(f)) { this.good++; return true; }
      this.bad++;
      if (this.log) this.log('bad crc, frame ' + (f[3] | (f[4] << 8)) + ' dropped');
      if (this.good === 0 && this.bad >= LENIENT_AFTER) {
        this.lenient = true;
        if (this.log) this.log('every frame fails its crc: crc check off for this connection');
        return true;
      }
      return false;
    }
    feed(data, onFrame, now = Date.now()) {
      let buf = data;
      if (this.pending.length) {
        const old = this.pending, stale = now - this.pendingAt > PENDING_MS;
        this.reset();
        if (!stale) {
          const joined = new Uint8Array(old.length + data.length);
          joined.set(old); joined.set(data, old.length);
          const L = frameLen(joined, 0, joined.length);
          const newFrame = frameLen(data, 0, data.length) > 0;   // this notification opens a frame of its own
          if (L && L <= joined.length && crcOk(joined.subarray(0, L))) buf = joined;  // the tail arrived
          else if (newFrame) buf = data;                              // tail lost: drop the half frame
          else if (opensFrame(joined, 0)) { this.pending = joined; this.pendingAt = now; return; }
          else buf = joined;
        }
      }
      let i = 0, found = false;
      while (i < buf.length) {
        if (buf[i] !== 0x58) { i++; continue; }
        if (opensFrame(buf, i)) {                 // a frame that continues in the next notification
          this.pending = buf.slice(i); this.pendingAt = now; found = true; break;
        }
        const L = frameLen(buf, i, buf.length);
        if (!L) { i++; continue; }
        found = true;
        const f = buf.slice(i, i + L);
        if (this.check(f)) { onFrame(f); i += L; } else i++;   // bad crc: look for the next start inside it
      }
      if (!found && buf.length) onFrame(buf.slice());
    }
  }

  function toHex(b) { return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(''); }

  const api = {
    SERVICE_HINTS, UUID_TX, UUID_RX, NAME_PREFIX, CMD, N, PAT, UNIT, MAX_POURS,
    floatBits, bitsFloat, pyRound, totalWater, doseRange, validate, crc16, buildFrame,
    encodeRecipeBlob, buildLoadFrames, F, patternByte, tempDisplayToWire, frameCode,
    parseEvent, refusalCode, refusalReason, activityName, faultName, Assembler, crcOk, toHex,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.XB = api;
})(typeof self !== 'undefined' ? self : this);
