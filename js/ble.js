// Bluetooth link to the xBloom Studio (Web Bluetooth), plus a simulated machine
// for trying the panel without one (?sim=1). Same command timing as Xbloom-panel.
(function (root) {
  'use strict';
  const XB = root.XB;

  class Emitter {
    constructor() { this._h = {}; }
    on(ev, fn) { (this._h[ev] = this._h[ev] || []).push(fn); return this; }
    emit(ev, ...a) { (this._h[ev] || []).forEach((f) => { try { f(...a); } catch (e) { console.error(e); } }); }
  }

  const STEP_TIMEOUT_MS = 3000, STEP_ATTEMPTS = 2;
  // The machine's main service is a custom 128-bit UUID (FFE1 write / FFE2 notify live inside it).
  // Chrome only shows a page the services listed here, so it must be on the list.
  const XB_SERVICE = '0000e0ff-3c17-d293-8e48-14fe2e4da212';
  const OPTIONAL_SERVICES = [XB_SERVICE, 0xffe0, 0xfff0, 0xffe5, 0x18f0, 0xfee7];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Shared: frame handling, echo waiting, command queue.
  class BaseLink extends Emitter {
    constructor() {
      super();
      this.state = 'idle';
      this.name = '';
      this.asm = new XB.Assembler();
      this.sleeping = false;
      this.wait = null;  // {code, resolve}
      this.queue = Promise.resolve();
      this.logLines = [];
    }
    log(s) {
      const line = new Date().toLocaleTimeString('en-GB') + '  ' + s;
      this.logLines.push(line);
      if (this.logLines.length > 300) this.logLines.shift();
      this.emit('log', line);
    }
    setState(s, name) {
      this.state = s;
      if (name) this.name = name;
      this.emit('link', s, this.name);
    }
    get connected() { return this.state === 'connected'; }

    onNotify(bytes) { this.asm.feed(bytes, (f) => this.handleFrame(f)); }

    handleFrame(frame) {
      const code = XB.frameCode(frame);
      if (this.wait && code === this.wait.code) {
        const w = this.wait; this.wait = null;
        w.resolve(XB.refusalCode(frame));
      }
      const ev = XB.parseEvent(frame);
      if (!ev) return;
      const N = XB.N;
      switch (ev.code) {
        case N.WEIGHT: case N.WEIGHT_ALT: if (ev.hasU32) this.emit('weight', ev.f32()); break;
        case N.WATER: if (ev.hasU32) { const v = ev.f32(); this.emit('water', v > 5000 ? v / 1000 : v); } break;
        case N.ACTIVITY: if (ev.hasU32) { const a = ev.u32(); this.log('activity ' + a + ' ' + (XB.activityName(a) || '')); this.emit('activity', a); } break;
        case N.BLOOM: if (ev.hasU32) this.emit('pour', ev.u32()); break;
        case N.ENJOY: this.log('brew done'); this.emit('done'); break;
        case N.ABANDONED: this.emit('abandoned'); break;
        case 40515: case 9009: case 9010: this.emit('paused'); break;
        case 40516: case 9011: this.emit('resumed'); break;
        case N.SLEEPING: this.sleeping = true; this.emit('sleep', true); break;
        case N.AWAKE: this.sleeping = false; this.emit('sleep', false); break;
        case N.PODS: this.emit('pod', new TextDecoder().decode(ev.payload).replace(/[^\x20-\x7e]/g, '')); break;
        default: {
          const f = XB.faultName(ev.code);
          if (f) { this.log('fault ' + ev.code); this.emit('fault', f); }
        }
      }
    }

    waitEcho(code, ms) {
      return new Promise((resolve) => {
        const t = setTimeout(() => { if (this.wait && this.wait.code === code) this.wait = null; resolve(null); }, ms);
        this.wait = { code, resolve: (r) => { clearTimeout(t); resolve(r); } };
      });
    }

    // Write one frame and wait for the machine to echo its code. null = ok, else reason.
    async sendConfirmed(frame) {
      if (!this.connected) return 'المكينة مو متصلة';
      const code = XB.frameCode(frame);
      for (let attempt = 0; attempt < STEP_ATTEMPTS; attempt++) {
        const echo = this.waitEcho(code, STEP_TIMEOUT_MS);
        try { await this.write(frame); } catch (e) { this.wait = null; this.log('write failed ' + e.message); return 'فشل الإرسال بالبلوتوث'; }
        const refusal = await echo;
        if (refusal !== null) {
          const why = XB.refusalReason(refusal);
          if (!why) return null;
          if (attempt > 0 && (refusal & (0x800000 | 0x200000))) return null;
          this.log(`refused ${code}: 0x${refusal.toString(16)}`);
          return why;
        }
        this.log(`no echo for ${code} (attempt ${attempt + 1})`);
        if (await this.noEcho(frame)) attempt--;  // write mode changed: try again in the new mode
      }
      return 'المكينة ما ردّت';
    }

    // One-shot command: re-send only while the machine is asleep.
    async sendCommand(frame) {
      if (!this.connected) return 'المكينة مو متصلة';
      const code = XB.frameCode(frame);
      for (let attempt = 0; attempt < 3; attempt++) {
        const echo = this.waitEcho(code, 1500);
        try { await this.write(frame); } catch (e) { this.wait = null; return 'فشل الإرسال بالبلوتوث'; }
        const refusal = await echo;
        if (refusal !== null) return XB.refusalReason(refusal);
        if (!this.sleeping) return null;
      }
      return 'المكينة نايمة، شغّلها';
    }
    async noEcho() { return false; }

    // Commands run one at a time, in order.
    run(fn) {
      const p = this.queue.then(fn, fn);
      this.queue = p.catch(() => {});
      return p;
    }

    load(recipe) {
      return this.run(async () => {
        const err = XB.validate(recipe);
        if (err) return err;
        for (const f of XB.buildLoadFrames(recipe)) { const e = await this.sendConfirmed(f); if (e) return e; }
        return null;
      });
    }
    execute() { return this.run(() => this.sendConfirmed(XB.F.execute())); }
    pause() { return this.run(() => this.sendConfirmed(XB.F.pause())); }
    resume() { return this.run(() => this.sendConfirmed(XB.F.resume())); }
    stop() { return this.run(() => this.sendConfirmed(XB.F.stop())); }
    quitRecipe() { return this.run(() => this.sendConfirmed(XB.F.quitRecipe())); }
    cmd(name, ...args) { return this.run(() => this.sendCommand(XB.F[name](...args))); }
  }

  // ---- real machine ---------------------------------------------------------------
  class BleLink extends BaseLink {
    constructor(store) {
      super();
      this.store = store;
      this.device = null; this.tx = null; this.rx = null;
      this.writeMode = store.get('writeMode') || 'auto';  // auto | whole | chunk
      this.autoTried = false;
      this.reconnectTimer = null;
      this.supported = typeof navigator !== 'undefined' && !!navigator.bluetooth;
    }

    // Called on start: reconnect to a machine this browser already allowed.
    async restore() {
      if (!this.supported || !navigator.bluetooth.getDevices) { this.setState('idle'); return false; }
      try {
        const devs = await navigator.bluetooth.getDevices();
        const d = devs.find((x) => (x.name || '').toUpperCase().startsWith(XB.NAME_PREFIX)) || devs[0];
        if (!d) { this.setState('idle'); return false; }
        this.attach(d);
        this.setState('searching', d.name);
        this.tryReconnect(0);
        return true;
      } catch (e) { this.log('getDevices: ' + e.message); this.setState('idle'); return false; }
    }

    // Needs a tap (browser rule).
    async pick() {
      if (!this.supported) throw new Error('هذا المتصفح ما يدعم البلوتوث. استخدم Chrome.');
      const d = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: 'XBLOOM' }, { namePrefix: 'xBloom' }, { namePrefix: 'Xbloom' }, { namePrefix: 'xbloom' }, { namePrefix: 'XBloom' }, { services: [XB_SERVICE] }],
        optionalServices: OPTIONAL_SERVICES,
      });
      this.attach(d);
      this.setState('connecting', d.name);
      await this.connect();
    }

    attach(d) {
      if (this.device === d) return;
      this.device = d;
      d.addEventListener('gattserverdisconnected', () => {
        this.log('disconnected');
        this.tx = this.rx = null;
        if (this.wait) { const w = this.wait; this.wait = null; w.resolve(null); }
        this.setState('searching');
        this.tryReconnect(1500);
      });
      d.addEventListener('advertisementreceived', () => {
        if (this.state !== 'connected' && this.state !== 'connecting') this.connect().catch(() => {});
      });
    }

    tryReconnect(delay) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(async () => {
        if (!this.device || this.state === 'connected' || this.state === 'connecting') return;
        try { await this.connect(); } catch (e) {
          this.setState('searching');
          if (this.device.watchAdvertisements && !this.device.watchingAdvertisements) {
            try { await this.device.watchAdvertisements(); } catch (_) {}
          }
          this.tryReconnect(4000);
        }
      }, delay);
    }

    async connect() {
      const d = this.device;
      this.setState('connecting', d.name);
      // Android often fails the first GATT connect; try three times
      let server;
      for (let i = 0; ; i++) {
        try { server = await d.gatt.connect(); break; } catch (e) {
          this.log('gatt connect ' + (i + 1) + ': ' + e.message);
          if (i >= 2) throw new Error('المكينة ما ردّت. تأكد إن تطبيق xBloom مقفول في الجوال (المكينة تقبل جهاز واحد بس) وجرب مرة ثانية.');
          await sleep(800);
        }
      }
      let tx = null, rx = null;
      let services = [];
      try { services = await server.getPrimaryServices(); } catch (e) { this.log('services: ' + e.message); }
      if (!services.some((s) => s.uuid === XB_SERVICE)) {
        try { services.unshift(await server.getPrimaryService(XB_SERVICE)); } catch (e) { this.log('e0ff: ' + e.message); }
      }
      // match FFE1 / FFE2 by their short id, whatever base UUID the firmware uses
      const short = (u) => u.slice(4, 8).toLowerCase();
      const seen = [];
      for (const s of services) {
        try {
          for (const c of await s.getCharacteristics()) {
            seen.push(short(s.uuid) + '/' + short(c.uuid));
            if (short(c.uuid) === 'ffe1' && !tx) tx = c;
            if (short(c.uuid) === 'ffe2' && !rx) rx = c;
          }
        } catch (e) { seen.push(short(s.uuid) + '/!' + e.name); }
      }
      this.log('services: ' + (seen.join(' ') || 'none'));
      if (!tx || !rx) {
        // Usually an old permission from before the service was on the list: drop it so the next tap asks again.
        d.gatt.disconnect();
        clearTimeout(this.reconnectTimer);
        if (d.forget) d.forget().catch(() => {});
        this.device = null; this.setState('idle', '');
        throw new Error('ما قدرت أوصل لقناة المكينة (v8: ' + (seen.join(' ') || 'ما فيه خدمات') + '). اضغط «اربط» مرة ثانية واختر المكينة.');
      }
      rx.addEventListener('characteristicvaluechanged', (e) => {
        const v = e.target.value;
        this.onNotify(new Uint8Array(v.buffer, v.byteOffset, v.byteLength));
      });
      await rx.startNotifications();
      this.tx = tx; this.rx = rx;
      this.asm.reset();
      await sleep(300);  // let the notify stream settle before writing
      this.log('connected to ' + d.name + ' (write ' + this.writeMode + ')');
      this.setState('connected', d.name);
    }

    forget() {
      clearTimeout(this.reconnectTimer);
      const d = this.device; this.device = null;
      if (d) { try { d.gatt.disconnect(); } catch (_) {} if (d.forget) d.forget().catch(() => {}); }
      this.setState('idle', '');
    }

    setWriteMode(m) { this.writeMode = m; this.autoTried = false; this.store.set('writeMode', m); }

    async rawWrite(bytes) {
      const c = this.tx;
      if (!c) throw new Error('not connected');
      if (c.properties.writeWithoutResponse && c.writeValueWithoutResponse) return c.writeValueWithoutResponse(bytes);
      if (c.writeValueWithResponse) return c.writeValueWithResponse(bytes);
      return c.writeValue(bytes);
    }
    async write(frame) {
      const chunk = this.writeMode === 'chunk' || (this.writeMode === 'auto' && this.autoChunk);
      if (!chunk || frame.length <= 20) {
        try { return await this.rawWrite(frame); } catch (e) {
          if (this.writeMode !== 'auto' || frame.length <= 20) throw e;
          this.log('whole write failed, switching to 20-byte chunks');
          this.autoChunk = true;
          this.store.set('writeMode', 'chunk'); this.writeMode = 'chunk';
        }
      }
      for (let i = 0; i < frame.length; i += 20) {
        await this.rawWrite(frame.slice(i, i + 20));
        if (i + 20 < frame.length) await sleep(15);
      }
    }
    // Auto mode: a long frame that got no echo may have been cut by a small MTU; try chunks.
    async noEcho(frame) {
      if (this.writeMode === 'auto' && !this.autoChunk && !this.autoTried && frame.length > 20) {
        this.autoTried = true;
        this.autoChunk = true;
        this.log('no echo for a long frame, trying 20-byte chunks');
        return true;
      }
      return false;
    }
  }

  // ---- simulated machine ---------------------------------------------------------
  // Answers frames like the real machine (echoes + events) so the whole panel can be tried.
  class SimLink extends BaseLink {
    constructor() {
      super();
      this.supported = true;
      this.weight = 0; this.loaded = null; this.brewTimer = null; this.paused = false;
      this.unitScale = 1;
    }
    async restore() { setTimeout(() => this.connectSim(), 400); return true; }
    load(recipe) { this.simRecipe = recipe; return super.load(recipe); }
    async pick() { this.connectSim(); }
    connectSim() {
      this.setState('connecting', 'XBLOOM 381');
      setTimeout(() => {
        this.setState('connected', 'XBLOOM 381');
        this.log('connected to simulated machine');
        this.notify(XB.N.ACTIVITY, [1]);
        clearInterval(this.noise);
        this.noise = setInterval(() => this.notifyF(XB.N.WEIGHT, this.weight + (Math.random() - 0.5) * 0.08), 1000);
      }, 900);
    }
    forget() { clearInterval(this.noise); this.setState('idle', ''); }
    setWriteMode() {}

    frameOut(code, ints) {
      const f = XB.buildFrame(code, ints);
      f[1] = 0x02;
      const c = XB.crc16(f, f.length - 2);
      f[f.length - 2] = c & 0xff; f[f.length - 1] = c >> 8;
      return f;
    }
    notify(code, ints) {
      const f = this.frameOut(code, ints);
      setTimeout(() => this.onNotify(f), 5);
    }
    notifyF(code, x) { this.notify(code, [XB.floatBits(x)]); }

    async write(frame) {
      await sleep(30);
      const code = XB.frameCode(frame);
      this.notify(code, [0, 0, 0, 0]);  // echo, no refusal
      const F = (cb, ms) => setTimeout(cb, ms);
      switch (code) {
        case XB.CMD.RECIPE_GRIND: case XB.CMD.RECIPE_NO_GRIND: this.loaded = this.simRecipe; break;
        case XB.CMD.EXECUTE: this.startBrew(); break;
        case XB.CMD.BREW_PAUSE: this.paused = true; this.notify(40515, [0]); this.notify(XB.N.ACTIVITY, [31]); break;
        case XB.CMD.BREW_RESUME: this.paused = false; this.notify(40516, [0]); this.notify(XB.N.ACTIVITY, [30]); break;
        case XB.CMD.BREW_STOP: this.endBrew(false); break;
        case XB.CMD.TARE: this.weight = 0; this.notifyF(XB.N.WEIGHT, 0); break;
        case 3500: this.grindTimer = setInterval(() => { this.weight += 0.4; this.notifyF(XB.N.WEIGHT, this.weight); }, 300); break;
        case 3505: clearInterval(this.grindTimer); break;
        case 4506: {
          const vol = XB.bitsFloat(frame[14] | (frame[15] << 8) | (frame[16] << 16) | (frame[17] << 24)) / 10;
          let poured = 0;
          clearInterval(this.pourTimer);
          this.pourTimer = setInterval(() => {
            poured += 3.2; this.weight += 3.1;
            this.notifyF(XB.N.WATER, Math.min(poured, vol)); this.notifyF(XB.N.WEIGHT, this.weight);
            if (poured >= vol) clearInterval(this.pourTimer);
          }, 1000);
          break;
        }
        case 4507: clearInterval(this.pourTimer); break;
        default: F(() => {}, 0);
      }
    }
    startBrew() {
      const rec = this.loaded || { pours: [{ volume_ml: 200, pause_s: 0 }], grinder_on: true };
      const r = { grind: rec.grinder_on, pours: rec.pours.map((p) => ({ vol: p.volume_ml, wait: p.pause_s })) };
      const steps = [];
      let t = 0;
      if (r.grind) { steps.push([t, () => this.notify(XB.N.ACTIVITY, [34])]); t += 4000; }
      steps.push([t, () => this.notify(XB.N.ACTIVITY, [30])]);
      let water = 0;
      r.pours.forEach((p, i) => {
        steps.push([t, () => this.notify(XB.N.BLOOM, [i])]);
        const secs = Math.max(1, Math.round(p.vol / 9));  // ~3x real speed
        for (let s = 1; s <= secs; s++) {
          const w = water + (p.vol * s) / secs;
          steps.push([t + s * 330, () => { this.notifyF(XB.N.WATER, w); this.weight = w * 0.92; this.notifyF(XB.N.WEIGHT, this.weight); }]);
        }
        water += p.vol;
        t += secs * 330 + (p.wait * 1000) / 3;
      });
      steps.push([t + 1500, () => this.endBrew(true)]);
      this.brewStart = Date.now();
      this.brewSteps = steps.map(([at, fn]) => ({ at, fn, done: false }));
      this.brewClock = 0;
      clearInterval(this.brewTimer);
      this.brewTimer = setInterval(() => {
        if (this.paused) return;
        this.brewClock += 100;
        for (const s of this.brewSteps) if (!s.done && s.at <= this.brewClock) { s.done = true; s.fn(); }
      }, 100);
    }
    endBrew(done) {
      clearInterval(this.brewTimer);
      if (done) this.notify(XB.N.ENJOY, [0]);
      this.notify(XB.N.ACTIVITY, [1]);
      this.loaded = null; this.paused = false;
    }
  }

  root.XBLink = { BleLink, SimLink };
})(typeof self !== 'undefined' ? self : this);
