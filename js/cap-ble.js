// Web Bluetooth على تطبيق ريمدي في الآيفون (المالك ١٤ نوفمبر ٢٠٢٦: «أبي أجرب الاكس بلوم بالآيفون»).
// سفاري وكل متصفحات الآيفون ما فيها navigator.bluetooth، فداخل التطبيق (Capacitor) نبني نفس الواجهة
// فوق إضافة @capacitor-community/bluetooth-le، وble.js يشتغل بدون أي تغيير.
// في المتصفح العادي (Chrome، Bluefy) هالملف ما يسوي شي.
(function () {
  const Cap = window.Capacitor;
  if (!Cap || !Cap.isNativePlatform || !Cap.isNativePlatform() || navigator.bluetooth) return;
  const BLE = (Cap.Plugins && Cap.Plugins.BluetoothLe) || (Cap.registerPlugin && Cap.registerPlugin('BluetoothLe'));
  if (!BLE) return;

  const toHex = (bytes) => Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes.buffer || bytes, bytes.byteOffset || 0, bytes.byteLength))
    .map((b) => b.toString(16).padStart(2, '0')).join('');
  const toView = (v) => {
    if (v instanceof DataView) return v;
    const s = String(v || '').replace(/[^0-9a-f]/gi, '');
    const out = new Uint8Array(s.length >> 1);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(s.substr(i * 2, 2), 16);
    return new DataView(out.buffer);
  };
  const full = (u) => {
    if (typeof u === 'number') return `0000${u.toString(16).padStart(4, '0')}-0000-1000-8000-00805f9b34fb`;
    const x = String(u).toLowerCase();
    return x.length === 4 ? `0000${x}-0000-1000-8000-00805f9b34fb` : x;
  };

  let ready = null;
  const init = () => (ready = ready || BLE.initialize({ androidNeverForLocation: true }));

  class Target {
    constructor() { this.l = {}; }
    addEventListener(t, f) { (this.l[t] = this.l[t] || []).push(f); }
    removeEventListener(t, f) { this.l[t] = (this.l[t] || []).filter((x) => x !== f); }
    emit(t, e) { for (const f of this.l[t] || []) { try { f(e); } catch (_) {} } }
  }

  class Char extends Target {
    constructor(dev, svc, c) {
      super();
      this.dev = dev; this.service = svc; this.uuid = full(c.uuid);
      const p = c.properties || {};
      this.properties = { write: !!p.write, writeWithoutResponse: !!p.writeWithoutResponse, notify: !!p.notify, indicate: !!p.indicate, read: !!p.read };
      this.value = null;
    }
    base() { return { deviceId: this.dev.id, service: this.service.uuid, characteristic: this.uuid }; }
    writeValueWithoutResponse(b) { return BLE.writeWithoutResponse({ ...this.base(), value: toHex(b) }); }
    writeValueWithResponse(b) { return BLE.write({ ...this.base(), value: toHex(b) }); }
    writeValue(b) { return this.properties.writeWithoutResponse ? this.writeValueWithoutResponse(b) : this.writeValueWithResponse(b); }
    async startNotifications() {
      const b = this.base();
      if (this.sub) await this.sub.remove();
      this.sub = await BLE.addListener(`notification|${b.deviceId}|${b.service}|${b.characteristic}`, (ev) => {
        this.value = toView(ev && ev.value);
        this.emit('characteristicvaluechanged', { target: this });
      });
      await BLE.startNotifications(b);
      return this;
    }
    async stopNotifications() { if (this.sub) { await this.sub.remove(); this.sub = null; } await BLE.stopNotifications(this.base()); return this; }
  }

  class Service {
    constructor(dev, s) { this.dev = dev; this.uuid = full(s.uuid); this.raw = s; this.isPrimary = true; }
    async getCharacteristics() { return (this.raw.characteristics || []).map((c) => new Char(this.dev, this, c)); }
    async getCharacteristic(u) { const c = (await this.getCharacteristics()).find((x) => x.uuid === full(u)); if (!c) throw new Error('NotFoundError'); return c; }
  }

  class Gatt {
    constructor(dev) { this.device = dev; this.connected = false; }
    async connect() {
      await init();
      const id = this.device.id;
      await BLE.connect({ deviceId: id });
      if (!this.dsub) {
        this.dsub = await BLE.addListener(`disconnected|${id}`, () => { this.connected = false; this.device.emit('gattserverdisconnected', { target: this.device }); });
      }
      this.connected = true;
      return this;
    }
    disconnect() { this.connected = false; BLE.disconnect({ deviceId: this.device.id }).catch(() => {}); }
    async getPrimaryServices() { const r = await BLE.getServices({ deviceId: this.device.id }); return (r.services || []).map((s) => new Service(this.device, s)); }
    async getPrimaryService(u) { const s = (await this.getPrimaryServices()).find((x) => x.uuid === full(u)); if (!s) throw new Error('NotFoundError'); return s; }
  }

  class Device extends Target {
    constructor(d) { super(); this.id = d.deviceId; this.name = d.name || ''; this.gatt = new Gatt(this); }
    forget() { return Promise.resolve(); }
  }

  navigator.bluetooth = {
    async getAvailability() { await init(); return true; },
    async requestDevice(opts = {}) {
      await init();
      const f = (opts.filters || []);
      const prefix = (f.find((x) => x.namePrefix) || {}).namePrefix;
      const services = [...new Set([...(f.flatMap((x) => x.services || [])), ...(opts.optionalServices || [])].map(full))];
      const d = await BLE.requestDevice({ namePrefix: prefix ? prefix.toUpperCase() : undefined, optionalServices: services });
      return new Device(d);
    },
  };
})();
