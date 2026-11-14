// Your xBloom account: sign in, download recipes (Created + Shared), save edits back.
// Unofficial API, as worked out in xbloom-py and used by Xbloom-panel; it may change.
(function (root) {
  'use strict';
  const API = 'https://client-api.xbloom.com/';

  // xBloom's public RSA key (1024-bit, e = 65537), the one every xBloom client uses.
  const N_HEX =
    'B82C5E34199EF649D84CCA5EFAE4AFE2E2763908F707CF643520A58A67D4BBF7198AEC6F295216D57F81192EF9CD175FBD22F385' +
    '414295E59ED934DBE2A92A67AA5F6D013FBCF89FC77B447BA5C8ABBD54B181DAF68BD57F0BF826A80119E6A553CD19DDDEE59D16' +
    '82B33DD101C4FD08A68AC9D5505B0AFF74C8148E855C4EF9';
  const N = BigInt('0x' + N_HEX), E = 65537n, K = 128, CHUNK = 117;

  const cryptoObj = (typeof crypto !== 'undefined' && crypto.getRandomValues) ? crypto : require('crypto').webcrypto;

  function modPow(b, e, m) {
    let r = 1n; b %= m;
    while (e > 0n) { if (e & 1n) r = (r * b) % m; e >>= 1n; b = (b * b) % m; }
    return r;
  }
  function nonZeroRandom(n) {
    const out = new Uint8Array(n);
    let i = 0;
    while (i < n) {
      const buf = new Uint8Array(n);
      cryptoObj.getRandomValues(buf);
      for (const b of buf) if (b !== 0 && i < n) out[i++] = b;
    }
    return out;
  }
  // PKCS#1 v1.5 (type 2) on one block.
  function rsaBlock(msg) {
    const ps = nonZeroRandom(K - 3 - msg.length);
    const em = new Uint8Array(K);
    em[0] = 0; em[1] = 2; em.set(ps, 2); em[2 + ps.length] = 0; em.set(msg, 3 + ps.length);
    let m = 0n;
    for (const b of em) m = (m << 8n) | BigInt(b);
    let c = modPow(m, E, N);
    const out = new Uint8Array(K);
    for (let i = K - 1; i >= 0; i--) { out[i] = Number(c & 0xffn); c >>= 8n; }
    return out;
  }
  function b64(bytes) {
    if (typeof btoa !== 'undefined') {
      let s = '';
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      return btoa(s);
    }
    return Buffer.from(bytes).toString('base64');
  }
  // JSON -> UTF-8 -> 117-byte chunks -> RSA each -> concat -> base64
  function encryptBody(plain) {
    const data = new TextEncoder().encode(plain);
    const out = new Uint8Array(Math.ceil(data.length / CHUNK) * K);
    for (let off = 0, j = 0; off < data.length; off += CHUNK, j++) out.set(rsaBlock(data.subarray(off, off + CHUNK)), j * K);
    return b64(out);
  }

  class Expired extends Error {}

  async function post(endpoint, body, attempt = 0) {
    let res;
    try {
      res = await fetch(API + endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    } catch (e) {
      if (attempt === 0) { await new Promise((r) => setTimeout(r, 1500)); return post(endpoint, body, 1); }
      throw new Error('ما قدرت أوصل لسيرفر اكس بلوم، تأكد من الإنترنت');
    }
    const text = await res.text();
    if (res.status !== 200 || !text) {
      // xBloom answers a stale session token with a bare 500: treat it as "sign in again".
      if (res.status === 500 && endpoint.startsWith('tu')) throw new Expired('انتهت الجلسة');
      if (attempt === 0) { await new Promise((r) => setTimeout(r, 1500)); return post(endpoint, body, 1); }
      throw new Error(`سيرفر اكس بلوم رد بـ ${res.status}`);
    }
    try { return JSON.parse(text); } catch (e) { throw new Error('رد غير مفهوم من اكس بلوم'); }
  }

  function envelope(session, extra) {
    const d = { interfaceVersion: 20240918, skey: 'testskey', clientType: 2, phoneType: 'Android', languageType: 0 };
    if (session) { d.memberId = session.memberId; d.token = session.token; }
    return Object.assign(d, extra || {});
  }

  function codeOf(o) {
    for (const k of ['code', 'errorCode', 'resultCode', 'result', 'status']) {
      const v = o[k];
      if (v == null) continue;
      const n = typeof v === 'string' ? (/^-?\d+$/.test(v) ? parseInt(v, 10) : NaN) : Number(v);
      if (!isNaN(n)) return n;
    }
    return -1;
  }
  function msgOf(o) {
    for (const k of ['msg', 'message', 'errorMsg', 'errorMessage', 'error', 'reason', 'tips', 'info'])
      if (typeof o[k] === 'string' && o[k]) return o[k];
    return 'الطلب ما نجح';
  }
  function check(o) {
    if (o && o.result === 'success') return o;
    const c = codeOf(o || {});
    if (c === 10001 || c === 20003 || c === 2000) throw new Expired(msgOf(o || {}));
    throw new Error(msgOf(o || {}));
  }

  const num = (v, d = 0) => {
    if (v == null || v === '') return d;
    if (typeof v === 'boolean') return v ? 1 : 0;
    const n = Number(v);
    return isNaN(n) ? d : n;
  };

  // Account JSON -> our recipe object
  function fromCloud(r, kind) {
    if (r.tableId == null || r.theName == null) return null;
    const p = {
      id: String(r.tableId), kind, name: String(r.theName).trim(),
      dose_g: num(r.dose), grind_size: Math.round(num(r.grinderSize)), grinder_on: num(r.isSetGrinderSize, 1) === 1,
      rpm: num(r.rpm, 90), cup_type: num(r.cupType, 3),
      color: r.theColor || '#C9D5B8', color_src: r.theColor || '',
      extra: {
        bypass: num(r.isEnableBypassWater, 2) === 1, bypassTemp: num(r.bypassTemp, 85), bypassVolume: num(r.bypassVolume, 5),
        adaptedModel: num(r.adaptedModel, 1), createTimeStamp: num(r.createTimeStamp, 0),
        isShortcuts: num(r.isShortcuts, 0), subSetType: num(r.subSetType, 0), theSubsetId: num(r.theSubsetId, 0),
      },
      pours: [],
    };
    let list = r.pourList;
    if (!Array.isArray(list) && typeof r.pourDataJSONStr === 'string') { try { list = JSON.parse(r.pourDataJSONStr); } catch (e) {} }
    for (const q of list || []) {
      if (p.pours.length >= 9) break;
      p.pours.push({
        name: q.theName || '', volume_ml: num(q.volume), temp_c: num(q.temperature, 92), pattern: num(q.pattern, 2),
        flow: num(q.flowRate, 3.0), pause_s: num(q.pausing, 0),
        agitate_before: num(q.isEnableVibrationBefore, 2) === 1, agitate_after: num(q.isEnableVibrationAfter, 2) === 1,
      });
    }
    return p;
  }

  function ratioDen(p) {
    const w = p.pours.reduce((t, q) => t + q.volume_ml, 0);
    return p.dose_g > 0 ? Math.round((w / p.dose_g) * 10) / 10 : 16;
  }
  function pourName(p, i) { return (p.pours[i] && p.pours[i].name) || (i === 0 ? 'Bloom' : `Pour ${i + 1}`); }

  // our recipe -> create/update body fields
  function toCloud(p, session, tableId) {
    const x = p.extra || {};
    const d = envelope(session, {});
    if (tableId) d.tableId = tableId;
    Object.assign(d, {
      theName: p.name.trim(), dose: p.dose_g, grandWater: ratioDen(p), grinderSize: p.grind_size, rpm: p.rpm,
      cupType: p.cup_type, adaptedModel: x.adaptedModel || 1, isEnableBypassWater: x.bypass ? 1 : 2,
      isSetGrinderSize: p.grinder_on ? 1 : 2,
      theColor: p.color_src && p.color_src.toLowerCase() === p.color.toLowerCase() ? p.color_src : p.color,
      theSubsetId: x.theSubsetId || 0, subSetType: x.subSetType || 2, appPlace: [4],
      createTimeStamp: x.createTimeStamp || Date.now(), isShortcuts: x.isShortcuts || 2,
    });
    if (x.bypass) { d.bypassTemp = x.bypassTemp; d.bypassVolume = x.bypassVolume; }
    d.pourDataJSONStr = JSON.stringify(p.pours.map((q, i) => ({
      theName: pourName(p, i), volume: q.volume_ml, temperature: q.temp_c, flowRate: q.flow, pattern: q.pattern,
      pausing: q.pause_s, isEnableVibrationBefore: q.agitate_before ? 1 : 2, isEnableVibrationAfter: q.agitate_after ? 1 : 2,
    })));
    return d;
  }

  // The password is sent once to sign in and never stored: only the session (memberId + token) is kept.
  // When xBloom ends the session, the account is marked expired and the panel asks for the password again.
  class Account {
    constructor(store) {
      this.store = store;               // {get(k), set(k,v)}
      this.s = store.get('acct') || null; // {email, memberId, token, expired?}
      if (this.s && 'password' in this.s) { delete this.s.password; this.save(); }  // older versions kept it
    }
    get signedIn() { return !!(this.s && this.s.email); }
    get expired() { return !!(this.s && (this.s.expired || !this.s.token)); }
    get email() { return this.s ? this.s.email : ''; }
    save() { this.store.set('acct', this.s); }

    async login(email, password) {
      const r = await post('tMemberLogin.thtml', JSON.stringify(envelope(null, { email, password })));
      if (!r || r.result !== 'success') throw new Error((r && msgOf(r)) || 'الإيميل أو كلمة المرور غلط');
      const id = r.member && r.member.tableId;
      if (id == null || !r.token) throw new Error('اكس بلوم ما رجّع جلسة دخول');
      this.s = { email, memberId: Number(id), token: r.token };
      this.save();
    }
    signOut() { this.s = null; this.save(); }

    async withRelogin(fn) {
      if (!this.s) throw new Error('سجّل دخول أول');
      if (this.expired) throw new Expired('انتهت الجلسة، سجّل دخول من جديد');
      try { return await fn(); } catch (e) {
        if (e instanceof Expired) { this.s.expired = true; this.save(); }
        throw e;
      }
    }
    async encrypted(endpoint, obj) { return post(endpoint, '"' + encryptBody(JSON.stringify(obj)) + '"'); }

    async fetchList(endpoint, kind) {
      const r = check(await this.encrypted(endpoint, envelope(this.s, { pageNumber: 1, countPerPage: 100, adaptedModel: 1 })));
      return (r.list || []).map((x) => fromCloud(x, kind)).filter(Boolean);
    }
    async sync() {
      return this.withRelogin(async () => {
        const mine = await this.fetchList('tuMyTeaRecipeCreated.tuhtml', 'mine');
        try {
          const shared = await this.fetchList('tuMyRecipeShared.tuhtml', 'shared');
          for (const s of shared) if (!mine.some((m) => m.id === s.id)) mine.push(s);
        } catch (e) { if (e instanceof Expired) throw e; }  // a failed Shared list alone isn't fatal
        return mine;
      });
    }
    async push(p) {
      return this.withRelogin(async () => {
        const create = !p.id;
        const r = check(await this.encrypted(create ? 'tuRecipeAdd.tuhtml' : 'tuRecipeUpdate.tuhtml', toCloud(p, this.s, create ? null : p.id)));
        return create ? String(r.tableId) : p.id;
      });
    }
    async remove(id) {
      return this.withRelogin(async () => { check(await this.encrypted('tuRecipeDelete.tuhtml', envelope(this.s, { tableId: id }))); });
    }
  }

  const api = { Account, encryptBody, fromCloud, toCloud, envelope, post, Expired };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.XBCloud = api;
})(typeof self !== 'undefined' ? self : this);
