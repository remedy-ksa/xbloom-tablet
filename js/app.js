// xBloom tablet panel — screens, recipe library, brew flow.
(function () {
  'use strict';
  const XB = window.XB;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  // ---------------------------------------------------------------- storage
  let storeWarned = false;
  const store = {
    get(k, d = null) { try { const v = localStorage.getItem('xbp.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) {
      try { localStorage.setItem('xbp.' + k, JSON.stringify(v)); return true; } catch (e) {
        if (!storeWarned && typeof toast === 'function') { storeWarned = true; setTimeout(() => toast('ما قدرت أحفظ في التابلت (المساحة ممتلية). نزّل نسخة احتياطية من الإعدادات.'), 0); }
        return false;
      }
    },
  };
  const prefs = Object.assign({ awake: true, idleMin: 3, sim: false, machineAwake: true, hopper: false }, store.get('prefs', {}));
  const savePrefs = () => store.set('prefs', prefs);
  const SIM = new URLSearchParams(location.search).has('sim') || prefs.sim;

  // ---------------------------------------------------------------- recipes
  // the six line colours (screen versions), Remedy's sweet green and the Din cream
  const CARD_COLORS = ['#DE9457', '#CE94CC', '#EE7A84', '#E86C8D', '#F4C700', '#2FA8D5', '#A9CBA7', '#EFEBE2'];
  const DEFAULT_COLOR = '#A9CBA7';
  const PAT_NAME = { 1: 'وسط', 2: 'حلزوني', 3: 'دائري' };
  const CUP_NAME = { 1: 'xPod', 2: 'Omni', 3: 'Other', 4: 'Tea' };
  const KIND_NAME = { mine: 'وصفاتي', shared: 'مشتركة', starter: 'أساسية', remedy: 'ريمدي' };
  const BUILTIN = (p) => p.kind === 'starter' || p.kind === 'remedy' || !!p.pinned;   // shipped with the app, not saved
  const REMEDY = window.REMEDY_RECIPES || [];
  const P = (ml, temp, pattern, pause, agitate = false, flow = 3.0) =>
    ({ name: '', volume_ml: ml, temp_c: temp, pattern, pause_s: pause, agitate_before: false, agitate_after: agitate, flow });
  const STARTERS = [
    { uid: 's1', kind: 'starter', name: 'Daily Pour Over', cup_type: 3, dose_g: 15, grind_size: 45, rpm: 90, grinder_on: true, color: '#E2DBA6',
      pours: [P(45, 93, 1, 30), P(95, 93, 2, 10), P(100, 93, 2, 0)] },
    { uid: 's2', kind: 'starter', name: 'Light Roast', cup_type: 3, dose_g: 15, grind_size: 42, rpm: 100, grinder_on: true, color: '#E4A3A4',
      pours: [P(50, 96, 1, 35), P(105, 96, 2, 10), P(100, 96, 2, 0, false, 3.5)] },
    { uid: 's3', kind: 'starter', name: 'Dark Roast', cup_type: 3, dose_g: 16, grind_size: 52, rpm: 80, grinder_on: true, color: '#E6C3A0',
      pours: [P(40, 88, 1, 30), P(100, 88, 3, 10), P(100, 88, 3, 0)] },
    { uid: 's4', kind: 'starter', name: 'Iced Pour Over', cup_type: 3, dose_g: 20, grind_size: 38, rpm: 90, grinder_on: true, color: '#B0BDE0',
      pours: [P(50, 94, 1, 35), P(80, 94, 2, 10, true), P(70, 94, 1, 0)] },
  ];
  // The owner's two everyday recipes (from the xBloom app, Auto Mode A and B), pinned first on the home screen.
  // They are his own ("وصفاتي"), not Remedy recipes: the "ريمدي" tab is only the 26 published ones.
  // BP (boiling point) is sent as 98, the machine's top temperature.
  const PINNED = [
    { uid: 'h-cold-sweet', kind: 'mine', pinned: true, crop: null, name: 'cold sweet 15 Grinder', cup_type: 2, dose_g: 15, grind_size: 15, rpm: 120, grinder_on: true, color: '#2FA8D5',
      pours: [P(5, 98, 1, 10), P(35, 98, 3, 59), P(35, 98, 2, 20), P(30, 98, 2, 5)] },
    { uid: 'h-jelly', kind: 'mine', pinned: true, crop: null, name: 'jelly', cup_type: 2, dose_g: 18, grind_size: 40, rpm: 120, grinder_on: true, color: '#F4C700',
      pours: [P(35, 90, 3, 15), P(40, 90, 2, 20), P(42, 90, 2, 5)] },
  ];
  let lib = [];
  function newUid() { return 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function loadLib() {
    const saved = store.get('lib', null);
    const favStarters = new Set(store.get('favStarters', []));
    lib = (saved || []).filter((p) => !BUILTIN(p));
    for (const s of [...PINNED, ...REMEDY, ...STARTERS]) lib.push(Object.assign(JSON.parse(JSON.stringify(s)), { favorite: favStarters.has(s.uid) }));
  }
  function saveLib() {
    store.set('lib', lib.filter((p) => !BUILTIN(p)));
    store.set('favStarters', lib.filter((p) => BUILTIN(p) && p.favorite).map((p) => p.uid));
  }
  const find = (uid) => lib.find((p) => p.uid === uid);
  const totalWater = (p) => p.pours.reduce((t, q) => t + q.volume_ml, 0);
  /* النسبة على الكوب كله: ماء المكينة + الثلج (المالك ١٤ نوفمبر: الباردة كانت تطلع ١:٧) */
  const ratio = (p) => (p.dose_g > 0 ? Math.round(((totalWater(p) + (Number(p.ice_g) || 0)) / p.dose_g) * 10) / 10 : 0);
  const fmtNum = (x) => (Math.round(x * 10) / 10).toString();
  // forBrew: apply the quick "without grinding" switch (pre-ground coffee) without touching the saved recipe
  function toMachine(p, forBrew = false) {
    return { dose_g: p.dose_g, grind_size: p.grind_size, rpm: p.rpm, cup_type: p.cup_type, grinder_on: p.grinder_on && !(forBrew && prefs.noGrind),
      pours: p.pours.map((q) => ({ volume_ml: q.volume_ml, temp_c: q.temp_c, pattern: q.pattern, flow: q.flow, pause_s: q.pause_s,
        agitate_before: q.agitate_before, agitate_after: q.agitate_after })) };
  }
  function pourName(p, i) { return (p.pours[i] && p.pours[i].name) || (i === 0 ? 'الترطيب' : `الصبّة ${i + 1}`); }

  // ---------------------------------------------------------------- link + account
  const link = SIM ? new XBLink.SimLink() : new XBLink.BleLink(store);
  const acct = new XBCloud.Account(store);
  let syncing = false, lastSync = store.get('lastSync', 0), syncErr = '';
  // background sync: every 15 min when it works; after a failure wait 1, 2, 4 … 30 min; stop when the session ends
  let syncFails = 0, nextSync = lastSync + 15 * 60000;

  // ---------------------------------------------------------------- state
  const S = {
    screen: 'home', tab: 'home', seg: 'remedy', cur: null,
    flow: 'idle', active: null, weight: 0, water: 0, pourIdx: -1, brewStart: 0, activity: 0,
    grinding: false, pouring: false, pourStart: 0,
    lastTouch: Date.now(), wakeRef: 0, lastWaterAt: 0, lastWater: 0, linkSince: Date.now(),
  };
  const busy = () => S.flow !== 'idle' || S.grinding || S.pouring || sw.running;

  // ---------------------------------------------------------------- generic UI
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 4000);
  }
  $('#toast').addEventListener('click', () => ($('#toast').hidden = true));
  // dialogs: focus moves into the dialog and goes back to where it was when it closes
  const modalReturn = new Map();
  function openModal(sel, focusSel) {
    const m = $(sel);
    if (!m.hidden) return;
    modalReturn.set(m, document.activeElement);
    m.hidden = false;
    const f = focusSel ? $(focusSel) : m.querySelector('.btn.primary') || m.querySelector('button, input');
    if (f) setTimeout(() => f.focus({ preventScroll: true }), 30);
  }
  function closeModal(sel) {
    const m = $(sel);
    if (m.hidden) return;
    m.hidden = true;
    const r = modalReturn.get(m); modalReturn.delete(m);
    if (r && r.focus && document.contains(r)) r.focus({ preventScroll: true });
  }
  function confirmBox(title, body, ok, action) {
    $('#cf-title').textContent = title; $('#cf-body').textContent = body; $('#cf-yes').textContent = ok;
    openModal('#md-confirm');
    $('#cf-yes').onclick = () => { closeModal('#md-confirm'); action(); };
    $('#cf-no').onclick = () => closeModal('#md-confirm');
  }
  // the three machine drawings in the home tiles: drawn only while the home page is on screen
  let tileFx = [];
  function tilesOn(on) {
    if (!on) { tileFx.forEach((f) => f.stop()); tileFx = []; return; }
    if (tileFx.length) return;
    const o = { bg: 'none', fps: 10, mascot: false, tile: true, full: true, cx: 0.5 };
    tileFx = [
      Dots.grinder($('#tile-grinder'), () => ({ grinding: false }), Object.assign({ level: 0.55 }, o)),
      Dots.brew($('#tile-brewer'), Object.assign({ level: 0.55 }, o, { zoom: 1.22 })),
      Dots.scale($('#tile-scale'), () => 18, Object.assign({}, o, { cx: 0.52 })),
    ];
  }
  const homeVisible = () => S.screen === 'home' && S.tab === 'home' && $('#ov-clock').hidden && $('#ov-brew').hidden && $('#ov-finish').hidden;
  function show(screen) {
    $$('.screen').forEach((s) => s.classList.toggle('active', s.id === 'scr-' + screen));
    S.screen = screen;
    tilesOn(homeVisible());
    updateConnectCard();
  }
  // floating bar: the notch and the yellow circle spring to the chosen tab and hop a little
  const tb = { x: -1, vx: 0, y: 0, vy: 0, raf: 0, last: 0, target: 0 };
  function moveTabDot(jump) {
    const holder = $('#tb-holder'), btn = $(`.tb-row button[data-tab="${S.tab}"]`);
    if (!holder || !btn || !holder.offsetWidth) return;
    const hr = holder.getBoundingClientRect(), br = btn.getBoundingClientRect();
    tb.target = br.left - hr.left + br.width / 2;
    $('#tb-dot use').setAttribute('href', btn.querySelector('use').getAttribute('href'));
    const dot = parseFloat(getComputedStyle(holder).getPropertyValue('--tb-dot')) || 50;
    const notch = parseFloat(getComputedStyle(holder).getPropertyValue('--tb-notch')) || 33;
    const paint = () => {
      const m = `radial-gradient(circle ${notch}px at ${tb.x}px -4px, transparent 95%, #000 100%)`;
      for (const el of [$('#tb-glass'), $('#tb-shade')]) { el.style.maskImage = m; el.style.webkitMaskImage = m; }
      $('#tb-dot').style.transform = `translate(${tb.x - dot / 2}px, ${tb.y}px)`;
    };
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    cancelAnimationFrame(tb.raf);
    if (tb.x < 0 || still || !jump) { tb.x = tb.target; tb.y = 0; tb.vx = 0; tb.vy = 0; paint(); return; }
    tb.vy -= 380; tb.last = performance.now();
    const step = (now) => {
      const dt = Math.min(0.032, (now - tb.last) / 1000); tb.last = now;
      tb.vx += (-140 * (tb.x - tb.target) - 18 * tb.vx) * dt; tb.x += tb.vx * dt;
      tb.vy += (-200 * tb.y - 16 * tb.vy) * dt; tb.y += tb.vy * dt;
      paint();
      if (Math.abs(tb.x - tb.target) < 0.3 && Math.abs(tb.vx) < 3 && Math.abs(tb.y) < 0.3 && Math.abs(tb.vy) < 3) { tb.x = tb.target; tb.y = 0; paint(); return; }
      tb.raf = requestAnimationFrame(step);
    };
    tb.raf = requestAnimationFrame(step);
  }
  addEventListener('resize', () => moveTabDot(false));
  function setTab(tab) {
    const jump = S.tab !== tab;
    S.tab = tab;
    $$('.tb-row button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    requestAnimationFrame(() => moveTabDot(jump));
    tilesOn(homeVisible());
    $$('.page').forEach((p) => p.classList.toggle('active', p.id === 'page-' + tab));
    if (tab === 'recipes') renderRecipes();
    if (tab === 'settings') renderSettings();
    if (tab === 'home') renderHome();
    updateConnectCard();
  }
  $$('.tabbar button').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
  $$('[data-go-tab]').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.goTab)));

  // write only when the value changed (the 500 ms tick runs all day)
  function setText(el, v) { v = String(v); if (el.textContent !== v) el.textContent = v; }
  function setHidden(el, h) { if (el.hidden !== h) el.hidden = h; }
  // ---------------------------------------------------------------- status bar
  function renderStatus() {
    const st = link.state;
    const dot = $('#sb-dot');
    const cls = 'dot' + (st === 'connected' ? ' ok' : st === 'connecting' || st === 'searching' ? ' busy' : '');
    if (dot.className !== cls) dot.className = cls;
    setText($('#sb-name'), link.name || 'XBLOOM');
    setText($('#sb-state'), st === 'connected' ? (S.flow === 'brewing' ? 'يحضّر' : 'متصلة')
      : st === 'connecting' ? 'يتصل…' : st === 'searching' ? 'يبحث…' : 'غير مربوطة');
    setText($('#sb-sync'), syncing ? 'يزامن…' : '');
  }
  function tickClock() {
    const d = new Date();
    setText($('#sb-clock'), d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
  }

  // ---------------------------------------------------------------- cards
  const LATIN = (s) => !/[\u0600-\u06FF]/.test(s || '');
  // text into an element; Latin-only names (cup types, older recipe names) get the English face, Concert One
  function setName(el, s) { el.textContent = s; el.classList.toggle('en', LATIN(s)); }
  function cardEl(p) {
    const b = document.createElement('button');
    b.className = 'card' + (S.active === p.uid && S.flow !== 'idle' ? ' active-brew' : '');
    b.style.background = p.color || DEFAULT_COLOR;
    b.innerHTML = `<div class="c-name"></div><div class="c-meta"><span class="c-tag"></span> · <span class="num"></span><span class="c-ng"></span></div>`
      + (p.favorite ? '<svg class="c-heart" role="img" aria-label="مفضلة"><use href="#i-heart-fill"/></svg>' : '')
      + (p.dirty ? '<span class="c-dirty" title="مو محفوظة في الحساب"></span>' : '');
    setName(b.querySelector('.c-name'), p.name);
    setName(b.querySelector('.c-tag'), p.line || CUP_NAME[p.cup_type] || '');
    b.querySelector('.c-meta .num').textContent = `${fmtNum(p.dose_g)}g · 1:${fmtNum(ratio(p))}` + (p.grinder_on ? ` · G${Number(p.grind_size)}` : '');
    b.querySelector('.c-ng').textContent = p.grinder_on ? '' : ' · بدون طحن';
    /* علبة المحصول 3D على بطاقة وصفة ريمدي (المالك ١٤ نوفمبر) */
    if (p.crop && p.kind === 'remedy') {
      const img = document.createElement('img');
      img.className = 'c-box'; img.src = `icons/boxes/${p.crop}.webp`; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
      b.appendChild(img); b.classList.add('has-box');
      /* البطاقة ضيّقة مع العلبة: الخط معروف من العلبة ولونها، فيبقى سطر الأرقام */
      b.querySelector('.c-meta').textContent = `${fmtNum(p.dose_g)}g · 1:${fmtNum(ratio(p))}` + (p.grinder_on ? ` · G${Number(p.grind_size)}` : ' · بدون طحن');
    }
    b.addEventListener('click', () => openDetail(p.uid));
    return b;
  }
  // cups brewed from this panel today, written on the sober doctor's board on the home screen
  const dayKey = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
  const today = Object.assign({ d: dayKey(), n: 0 }, store.get('today', {}));
  function renderToday() {
    if (today.d !== dayKey()) { today.d = dayKey(); today.n = 0; store.set('today', today); }
    const n = today.n;
    $('#today-n').textContent = n;
    $('#today-w').textContent = n === 1 ? 'كوب' : n === 2 ? 'كوبين' : n >= 3 && n <= 10 ? 'أكواب' : 'كوب';
  }
  // A cup counts when the machine says ENJOY (brew finished), and only then (the owner's rule).
  // Each brew started here gets a brew id, kept in storage with the recipe, so a reload, a dropped
  // Bluetooth link or a repeated ENJOY never counts it twice. An ENJOY from a brew started on the
  // machine itself (no brew id) counts once, with a 20 s guard that also survives a reload.
  const PENDING_MAX_MS = 30 * 60000;
  let pending = store.get('pendingBrew', null);   // {brew_id, uid, name, crop, dose_g, ground, startedAt, grindSeen}
  if (pending && !(Date.now() - pending.startedAt < PENDING_MAX_MS)) { pending = null; store.set('pendingBrew', null); }
  function newPending(p) {
    pending = { brew_id: 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), uid: p.uid, name: p.name,
      crop: p.crop || null, dose_g: p.dose_g, ground: !!(p.grinder_on && !prefs.noGrind), startedAt: Date.now(), grindSeen: false };
    store.set('pendingBrew', pending);
  }
  function endPending() { if (pending) { pending = null; store.set('pendingBrew', null); } }
  let lastCounted = store.get('lastCounted', { id: '', at: 0 });
  function countCup() {
    const id = pending ? pending.brew_id : '';
    if (id ? id === lastCounted.id : Date.now() - lastCounted.at < 20000) return false;
    lastCounted = { id: id || 'm' + Date.now().toString(36), at: Date.now() };
    renderToday();                      // rolls the day over first
    today.n += 1;
    if (!SIM) { store.set('lastCounted', lastCounted); store.set('today', today); counter.cups += 1; saveCounter(); }
    link.log && link.log('cup counted (' + (id || 'brew started on the machine') + '), today ' + today.n);
    renderToday();
    if (S.tab === 'settings') renderCounter();
    return true;
  }
  function renderHome() {
    renderToday();
    const row = $('#fav-row');
    row.innerHTML = '';
    let list = lib.filter((p) => p.pinned).concat(lib.filter((p) => p.favorite && !p.pinned));
    if (!list.length) list = lib.filter((p) => p.kind === 'mine').concat(lib.filter((p) => p.kind !== 'mine')).slice(0, 6);
    list.forEach((p) => row.appendChild(cardEl(p)));
  }
  function renderRecipes() {
    $$('#rec-seg button').forEach((b) => b.classList.toggle('on', b.dataset.seg === S.seg));
    const g = $('#rec-grid');
    g.innerHTML = '';
    const list = lib.filter((p) => p.kind === S.seg);
    if (!list.length) {
      const e = document.createElement('div');
      e.className = 'rec-empty';
      e.textContent = S.seg === 'shared' ? 'ما فيه وصفات مشتركة في حسابك.'
        : acct.signedIn ? 'ما فيه وصفات. سوّ وصفة جديدة أو زامن من الإعدادات.'
          : 'سجّل دخول بحساب اكس بلوم من الإعدادات عشان تنزل وصفاتك، أو سوّ وصفة جديدة.';
      g.appendChild(e);
    }
    list.forEach((p) => g.appendChild(cardEl(p)));
  }
  $$('#rec-seg button').forEach((b) => b.addEventListener('click', () => { S.seg = b.dataset.seg; renderRecipes(); }));

  // ---------------------------------------------------------------- detail
  function openDetail(uid) {
    S.cur = uid;
    show('detail');
    buildDetail();
  }
  function shade(hex, f) {
    const n = parseInt(hex.replace('#', ''), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => Math.round(x * f));
    return `rgb(${c.join(',')})`;
  }
  function buildDetail() {
    const p = find(S.cur);
    if (!p) return;
    const col = p.color || DEFAULT_COLOR;
    $('#d-left').style.background = col;
    $('#scr-detail').style.setProperty('--fill', col);
    $('#d-kind').innerHTML = `${esc(KIND_NAME[p.kind] || '')} · <span class="${LATIN(p.line || CUP_NAME[p.cup_type]) ? 'en' : ''}">${esc(p.line || CUP_NAME[p.cup_type] || '')}</span>`;
    setName($('#d-name'), p.name);
    $('#d-sub').innerHTML = `<span class="num">${Number(totalWater(p))} ml · 1:${fmtNum(ratio(p))}</span> · ${p.pours.length} صبّات`;
    /* الثلج سطر لحاله: «حط ١٢٠ جم ثلج في الكوب» تعليمة للزبون، مو رقم وسط الأرقام */
    const ice = $('#d-ice'); ice.hidden = !p.ice_g; if (p.ice_g) ice.innerHTML = `حط <span class="num">${Number(p.ice_g)}g</span> ثلج في الكوب`;
    $('#d-fav use').setAttribute('href', p.favorite ? '#i-heart-fill' : '#i-heart');
    $('#d-dawam').hidden = !prefs.dawamiKey;
    $('#d-dawam').classList.toggle('on', prefs.dawamiRecipe === p.uid);
    const box = $('#d-box');
    if (p.crop && p.kind === 'remedy') { box.src = `icons/boxes/${p.crop}.webp`; box.alt = 'علبة ' + p.name.split(' · ')[0]; box.hidden = false; }
    else { box.hidden = true; box.removeAttribute('src'); }
    $('.d-head').classList.toggle('has-box', !box.hidden);
    /* وصفات ريمدي ما تتعدّل من اللوحة (المالك ١٤ نوفمبر) */
    $('#d-edit').hidden = p.kind === 'remedy';
    const max = Math.max(...p.pours.map((q) => q.volume_ml), 1);
    const chart = $('#d-chart');
    chart.innerHTML = '';
    let cum = 0;
    p.pours.forEach((q, i) => {
      const c = document.createElement('div');
      c.className = 'col';
      c.innerHTML = `<div class="vol">${Number(q.volume_ml)}</div><div class="bar" style="height:${Math.max(10, (Number(q.volume_ml) / max) * 80)}%"><div class="fill"></div></div><div class="lbl">${i + 1}</div>`;
      c.dataset.cum = cum; c.dataset.vol = q.volume_ml;
      cum += q.volume_ml;
      chart.appendChild(c);
    });
    const list = $('#d-pours');
    list.innerHTML = '';
    p.pours.forEach((q, i) => {
      const r = document.createElement('div');
      r.className = 'pour-row';
      r.innerHTML = `<span class="pi">${i + 1}</span><div><div class="pn"></div><div class="pd"><span class="num">${q.temp_c >= 96 ? 'غليان' : Number(q.temp_c) + '°C'} · ${Number(q.flow).toFixed(1)} ml/s${q.pause_s ? ' · ' + Number(q.pause_s) + 's' : ''}</span> · ${PAT_NAME[q.pattern] || ''}${q.agitate_before || q.agitate_after ? ' · رجّ' : ''}</div></div><span class="pv num">${Number(q.volume_ml)} ml</span>`;
      r.querySelector('.pn').textContent = pourName(p, i);
      list.appendChild(r);
    });
    refreshDetail();
  }
  const esc = (x) => String(x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function fmtMS(ms) { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
  function setStat(i, l, v, u) { $('#ds-l' + i).textContent = l; $('#ds-v' + i).textContent = v; $('#ds-u' + i).textContent = u; }
  function refreshDetail() {
    const p = find(S.cur);
    if (!p || S.screen !== 'detail') return;
    const mine = S.active === S.cur;
    const brewing = mine && (S.flow === 'brewing' || S.flow === 'paused');
    if (brewing) {
      setStat(0, 'الميزان', S.weight.toFixed(1), 'g');
      setStat(1, 'الماء', Math.round(S.water), 'ml');
      setStat(2, 'الوقت', fmtMS(S.brewStart ? Date.now() - S.brewStart : 0), '');
    } else {
      setStat(0, 'البن', fmtNum(p.dose_g), 'g');
      const grind = p.grinder_on && !prefs.noGrind;
      $$('#d-grind button').forEach((x) => { x.classList.toggle('on', (x.dataset.g === '1') === grind); x.disabled = !p.grinder_on; });
      setStat(1, 'الطحن', grind ? p.grind_size : 'بدون', '');
      setStat(2, 'RPM', grind ? p.rpm : 'بدون', '');
    }
    $$('#d-chart .col').forEach((c) => {
      const f = brewing ? Math.max(0, Math.min(1, (S.water - +c.dataset.cum) / +c.dataset.vol)) : 0;
      c.querySelector('.fill').style.height = f * 100 + '%';
    });
    $$('#d-pours .pour-row').forEach((r, i) => {
      r.classList.toggle('now', brewing && i === S.pourIdx);
      r.classList.toggle('done', brewing && i < S.pourIdx);
    });
    let label = 'ابدأ', icon = 'play';
    const otherBusy = S.active && !mine && S.flow !== 'idle';
    if (mine) {
      label = { loading: 'يحمّل…', loaded: 'جاهز', starting: 'يبدأ…', brewing: 'وقّف مؤقت', paused: 'كمّل' }[S.flow] || 'ابدأ';
      icon = { loading: 'spin', starting: 'spin', brewing: 'pause' }[S.flow] || 'play';
    } else if (otherBusy) label = 'المكينة مشغولة';
    $('#d-start-lbl').textContent = label;
    useIcon($('#d-start-ic'), icon);
    $('#d-stop').hidden = !brewing;
    $('#d-start').classList.toggle('dim', !link.connected || otherBusy);
  }
  $('#d-start').addEventListener('click', async () => {
    if (!link.connected) return toast('المكينة مو متصلة');
    if (S.active === S.cur) {
      if (S.flow === 'brewing') return cmdResult('pause', await link.pause());
      if (S.flow === 'paused') return cmdResult('resume', await link.resume());
      if (S.flow === 'loaded') { startLoaded(); return; }
      return;
    }
    if (S.flow !== 'idle') return toast('فيه وصفة ثانية على المكينة');
    const p = find(S.cur);
    if (!p) return;
    /* الخزان مليان (المالك ٢١ نوفمبر: «اعبي الخزان قهوه ويصير الطحن تقريبي … ما يصير اوفر فلو»): نطحن قبل الوصفة
       بأمر الطاحونة اليدوي ونوقف لما يزيد الميزان قد جرعة الوصفة، وبعدين الوصفة بلا طحن. الباقي يبقى في الخزان */
    let ground = false;
    if (prefs.hopper && p.grinder_on && !prefs.noGrind) {
      if (S.hopperBusy) return;
      S.hopperBusy = true;
      let e;
      try { e = await hopperGrind(p); } finally { S.hopperBusy = false; }
      if (e) return toast(e);
      if (S.flow !== 'idle') return;
      ground = true;
    }
    const keepNG = prefs.noGrind;
    if (ground) prefs.noGrind = true;
    const err = XB.validate(toMachine(p, true));
    if (err) return toast(err);
    S.active = S.cur; S.flow = 'loading';
    refreshDetail(); renderStatus();
    const frames = toMachine(p, true);
    prefs.noGrind = keepNG;
    cmdResult('load', await link.load(frames));
  });

  /* طحن بالوقت من الخزان (المالك ٢١ نوفمبر: «الميزان ما يقدر يقيس كم القهوه الي نزلت»): الطاحونة تطحن قد ثواني
     محسوبة من «معدّل الطاحونة» (جرام بالثانية) اللي ينحفظ لكل درجة طحن بالمعايرة من الإعدادات، فما يطفح الخزان.
     الدرجة اللي ما لها معايرة تاخذ أقرب درجة معايرة، وبلا معايرة أبد ما نطحن ونقول له يعايرها */
  const rates = () => store.get('grindRates', {});            // { "<درجة>": جرام/ثانية }
  function rateFor(size) {
    const r = rates(), keys = Object.keys(r).map(Number).filter((k) => r[k] > 0);
    if (!keys.length) return null;
    const k = keys.sort((a, b) => Math.abs(a - size) - Math.abs(b - size))[0];
    return { rate: r[k], from: k };
  }
  async function hopperGrind(p) {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const rf = rateFor(p.grind_size);
    if (!rf) return 'الخزان مليان: عاير الطاحونة من الإعدادات أول';
    const secs = Math.min(60, p.dose_g / rf.rate);
    toast(`أطحن ${p.dose_g} جرام من الخزان (${secs.toFixed(1)} ثانية)`);
    let e = await link.cmd('grinderEnter', p.grind_size, p.rpm);
    if (e) return e;
    await wait(800);
    e = await link.cmd('grinderStart', p.grind_size, p.rpm);
    if (e) { await link.cmd('quitGrinder'); return e; }
    const t0 = Date.now(); let why = null;
    while (Date.now() - t0 < secs * 1000) { await wait(100); if (!link.connected) { why = 'انقطعت المكينة وقت الطحن'; break; } }
    await link.cmd('grinderStop');
    await wait(1200);
    await link.cmd('quitGrinder');
    await wait(800);
    return why;
  }
  /** المعايرة: تطحن ١٠ ثواني بالدرجة اللي يختارها، يوزن الطحين على أي ميزان ويكتب الجرامات */
  async function calibrateGrind() {
    if (!link.connected) return toast('المكينة مو متصلة');
    const size = Number(prompt('درجة الطحن اللي تعايرها (مثل 40 للتقطير):', String(mod.gSize))) || 0;
    if (!(size >= 1 && size <= 80)) return;
    if (!confirm(`حط كوب أو فلتر فاضي تحت الطاحونة. بتطحن ١٠ ثواني بالدرجة ${size} من الخزان. نبدأ؟`)) return;
    await link.cmd('grinderEnter', size, mod.gRpm);
    await new Promise((r) => setTimeout(r, 800));
    await link.cmd('grinderStart', size, mod.gRpm);
    await new Promise((r) => setTimeout(r, 10000));
    await link.cmd('grinderStop');
    await new Promise((r) => setTimeout(r, 1200));
    await link.cmd('quitGrinder');
    const g = Number(String(prompt('كم جرام طلع؟ (وزنه على أي ميزان)', '') || '').replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
    if (!(g > 0 && g < 200)) return toast('ما انحفظت المعايرة');
    const r = rates(); r[size] = g / 10; store.set('grindRates', r);
    toast(`انحفظت: الدرجة ${size} تطحن ${(g / 10).toFixed(2)} جرام بالثانية`);
  }
  $('#d-stop').addEventListener('click', async () => cmdResult('stop', await link.stop()));
  // quick switch: grind in the machine, or brew pre-ground coffee (remembered for next time)
  $$('#d-grind button').forEach((b) => b.addEventListener('click', () => {
    if (S.active === S.cur && S.flow !== 'idle') return toast('غيّرها قبل ما تحمّل الوصفة');
    prefs.noGrind = b.dataset.g === '0'; savePrefs(); refreshDetail();
  }));
  $('#d-fav').addEventListener('click', () => {
    const p = find(S.cur); if (!p) return;
    p.favorite = !p.favorite; saveLib();
    $('#d-fav use').setAttribute('href', p.favorite ? '#i-heart-fill' : '#i-heart');
  });
  $('#d-edit').addEventListener('click', () => openEditor(S.cur));
  $('#d-dawam').addEventListener('click', () => {
    const p = find(S.cur); if (!p) return;
    prefs.dawamiRecipe = prefs.dawamiRecipe === p.uid ? null : p.uid; savePrefs();
    $('#d-dawam').classList.toggle('on', prefs.dawamiRecipe === p.uid);
    toast(prefs.dawamiRecipe ? `☕ ${p.name} تتحضّر لحالها قبل الدوام بنص ساعة` : 'شلت قهوة الدوام');
  });
  $('[data-back]').addEventListener('click', () => { show('home'); setTab(S.tab); });

  async function quitLoaded(msg) {
    closeModal('#md-cup');
    S.flow = 'idle'; S.active = null; endPending(); refreshDetail(); renderStatus();
    if (msg) toast(msg);
    await link.quitRecipe();
  }
  $('#cup-cancel').addEventListener('click', () => quitLoaded());
  /* «ابدأ» يبدأ التحضير على طول (المالك ١٤ نوفمبر): بلا نافذة «حط الكوب وبعدين ابدأ التحضير» */
  async function startLoaded() {
    closeModal('#md-cup');
    const p = find(S.active);
    if (p) newPending(p);
    S.flow = 'starting'; refreshDetail();
    cmdResult('execute', await link.execute());  // the only path that starts a recipe brew
  }
  $('#cup-go').addEventListener('click', startLoaded);

  const LOADED_MAX_MS = 2 * 60000;   // a loaded recipe nobody starts is taken off the machine
  function cmdResult(type, err) {
    if (err) {
      toast(err);
      if (type === 'load') { brewEnded(); endPending(); }
      // a late answer must not undo a brew the machine started anyway (activity already moved us on)
      if (type === 'execute' && S.flow === 'starting') { S.flow = 'loaded'; S.loadedAt = Date.now(); }
      refreshDetail(); renderStatus();
      return;
    }
    if (type === 'load') {
      S.flow = 'loaded'; S.loadedAt = Date.now();
      refreshDetail(); renderStatus();
      startLoaded();                         // انحملت الوصفة: نبدأ على طول
      return;
    } else if (type === 'execute') {
      if (S.flow !== 'brewing') { S.flow = 'brewing'; S.water = 0; S.brewStart = Date.now(); brewStarted(); }
    } else if (type === 'stop') { brewEnded(); endPending(); }
    refreshDetail(); renderStatus();
  }

  // ---------------------------------------------------------------- brew overlay
  let brewFx = null, finishFx = null, finishTimer;
  function brewStarted() {
    const p = find(S.active);
    if (!p || !$('#ov-brew').hidden) return;
    wake();
    S.lastWater = 0; S.lastWaterAt = 0; S.pourIdx = -1;
    $('#bw-name').textContent = p.name;
    $('#bw-total').textContent = `/ ${totalWater(p)} ml`;
    $('#ov-brew').hidden = false;
    tilesOn(false);
    if (brewFx) brewFx.stop();
    brewFx = Dots.brew($('#brew-canvas'));
    updateBrew();
  }
  function updateBrew() {
    if ($('#ov-brew').hidden) return;
    const p = find(S.active);
    if (!p) return;
    if (S.water > S.lastWater + 0.4) { S.lastWater = S.water; S.lastWaterAt = Date.now(); }
    const pouring = S.lastWaterAt && Date.now() - S.lastWaterAt < 1500;
    const i = S.pourIdx >= 0 && S.pourIdx < p.pours.length ? S.pourIdx : -1;
    let title, sub;
    if (S.activity === 34) { title = 'يطحن'; sub = `${fmtNum(p.dose_g)} g · G${p.grind_size} · ${p.rpm} rpm`; }
    else if (i < 0) { title = 'جاري البدء'; sub = `${p.pours.length} صبّات · ${totalWater(p)} ml`; }
    else { const q = p.pours[i]; title = pourName(p, i); sub = `${q.temp_c}°C · ${PAT_NAME[q.pattern]} · \u2066${i + 1} / ${p.pours.length}\u2069`; }
    $('#bw-title').textContent = title;
    $('#bw-sub').textContent = sub;
    $('#bw-g').textContent = S.weight.toFixed(1);
    $('#bw-ml').textContent = Math.round(S.water);
    $('#bw-t').textContent = fmtMS(S.brewStart ? Date.now() - S.brewStart : 0);
    useIcon($('#bw-pause .ic'), S.flow === 'paused' ? 'play' : 'pause');
    $('#ov-brew').classList.toggle('paused', S.flow === 'paused');
    brewFx.view = { progress: Math.min(1, S.water / Math.max(1, totalWater(p))), pouring, grinding: S.activity === 34, paused: S.flow === 'paused' };
  }
  function hideBrew() { if ($('#ov-brew').hidden) return; $('#ov-brew').hidden = true; if (brewFx) brewFx.stop(); tilesOn(homeVisible()); }
  $('#bw-pause').addEventListener('click', async () => {
    if (S.flow === 'paused') cmdResult('resume', await link.resume());
    else if (S.flow === 'brewing') cmdResult('pause', await link.pause());
  });
  $('#bw-stop').addEventListener('click', () => confirmBox('توقف التحضير؟', 'المكينة بتوقف الوصفة الحين.', 'وقّف', async () => cmdResult('stop', await link.stop())));

  // screen state only; the stored brew (pending) is cleared by the callers that know the brew is over
  function brewEnded() {
    hideBrew();
    S.flow = 'idle'; S.active = null; S.brewStart = 0; S.pourIdx = -1;
    refreshDetail(); renderStatus();
    if (S.screen === 'home') renderHome();
  }
  function showFinish(name, g, ml, ms) {
    $('#fn-name').textContent = name;
    $('#fn-g').textContent = g.toFixed(1) + ' g';
    $('#fn-ml').textContent = Math.round(ml) + ' ml';
    $('#fn-t').textContent = fmtMS(ms);
    $('#ov-finish').hidden = false;
    tilesOn(false);
    if (finishFx) finishFx.stop();
    finishFx = Dots.finish($('#finish-canvas'));
    clearTimeout(finishTimer);
    finishTimer = setTimeout(hideFinish, 90 * 1000);
  }
  function hideFinish() { clearTimeout(finishTimer); if ($('#ov-finish').hidden) return; $('#ov-finish').hidden = true; if (finishFx) finishFx.stop(); tilesOn(homeVisible()); }
  $('#ov-finish').addEventListener('click', hideFinish);

  // ---------------------------------------------------------------- value cards (modules)
  function holdRepeat(btn, fn, done) {
    let t1, t2;
    const stop = () => { clearTimeout(t1); clearInterval(t2); if (t1 || t2) done(); t1 = t2 = 0; };
    btn.addEventListener('pointerdown', (e) => {
      e.stopPropagation(); e.preventDefault();
      fn();
      t1 = setTimeout(() => { t2 = setInterval(fn, 70); }, 380);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => btn.addEventListener(ev, stop));
  }
  function valueCard(el, o, onChange) {
    let v = o.value;
    const dec = o.step < 1 ? 1 : 0;
    el.innerHTML = `<div class="vl"><span>${o.label}</span><small>${o.unitLabel || ''}</small></div>
      <button class="step minus">−</button><div class="vv"><span class="n"></span><span class="vx">${o.unit || ''}</span></div><button class="step plus">+</button>
      ${o.hint ? '<div class="hint"></div>' : ''}`;
    const n = el.querySelector('.n'), h = el.querySelector('.hint');
    const render = () => { n.textContent = v.toFixed(dec); if (h) h.textContent = o.hint(v); };
    const set = (nv, rel) => {
      nv = Math.min(o.max, Math.max(o.min, Math.round(nv / o.step) * o.step));
      nv = +nv.toFixed(dec);
      if (nv !== v) { v = nv; render(); onChange(v, false); }
      if (rel) onChange(v, true);
    };
    holdRepeat(el.querySelector('.plus'), () => set(v + o.step), () => onChange(v, true));
    holdRepeat(el.querySelector('.minus'), () => set(v - o.step), () => onChange(v, true));
    // drag across the card to change quickly
    let sx = null, sv = 0;
    el.addEventListener('pointerdown', (e) => { sx = e.clientX; sv = v; el.setPointerCapture(e.pointerId); });
    el.addEventListener('pointermove', (e) => { if (sx == null) return; set(sv + Math.round((e.clientX - sx) / 22) * o.step); });
    el.addEventListener('pointerup', () => { if (sx != null && v !== sv) onChange(v, true); sx = null; });
    el.addEventListener('pointercancel', () => (sx = null));
    render();
    return { get: () => v, set: (x) => { v = x; render(); } };
  }

  // ---------------------------------------------------------------- grinder
  const mod = Object.assign({ gSize: 40, gRpm: 90, bVol: 200, bTemp: 93, bFlow: 3.0, bPat: 2, unit: 'g' }, store.get('mod', {}));
  const saveMod = () => store.set('mod', mod);
  const grindUse = (s) => (s <= 12 ? 'إسبريسو' : s <= 24 ? 'موكا بوت' : s <= 32 ? 'إيروبرس' : s <= 55 ? 'تقطير / V60' : s <= 70 ? 'فرنش برس' : 'كولد برو');
  valueCard($('#gr-size'), { label: 'درجة الطحن', unitLabel: 'Level', min: 1, max: 80, step: 1, value: mod.gSize, hint: grindUse }, (v, rel) => {
    mod.gSize = v; saveMod(); if (rel && S.screen === 'grinder') link.cmd('grinderEnter', mod.gSize, mod.gRpm);
  });
  valueCard($('#gr-rpm'), { label: 'سرعة الطاحونة', unitLabel: 'RPM', min: 60, max: 120, step: 10, value: mod.gRpm }, (v, rel) => {
    mod.gRpm = v; saveMod(); if (rel && S.screen === 'grinder') link.cmd('grinderEnter', mod.gSize, mod.gRpm);
  });
  // big start/stop capsules on the module screens: icon + word, never a bare glyph
  function useIcon(svg, name) { svg.querySelector('use').setAttribute('href', '#i-' + name); svg.classList.toggle('spin', name === 'spin'); }
  function actState(btn, on, idle, busy) {
    btn.classList.toggle('on', on);
    useIcon(btn.querySelector('.ic'), on ? 'stop' : 'play');
    btn.querySelector('span').textContent = on ? busy : idle;
  }
  function setGrinding(on) { S.grinding = on; actState($('#gr-play'), on, 'اطحن', 'وقّف الطحن'); }
  $('#gr-play').addEventListener('click', async () => {
    if (!link.connected) return toast('المكينة مو متصلة');
    const on = !S.grinding;
    setGrinding(on);
    const err = await (on ? link.cmd('grinderStart', mod.gSize, mod.gRpm) : link.cmd('grinderStop'));
    if (err) { toast(err); if (on) setGrinding(false); }
  });

  // ---------------------------------------------------------------- brewer
  valueCard($('#br-vol'), { label: 'الكمية', unit: 'ml', min: 30, max: 500, step: 5, value: mod.bVol }, (v) => { mod.bVol = v; saveMod(); });
  valueCard($('#br-temp'), { label: 'الحرارة', unit: '°C', min: 39, max: 96, step: 1, value: mod.bTemp,
    hint: (v) => (v <= 39 ? 'حرارة الغرفة' : v >= 96 ? 'غليان' : '') }, (v, rel) => {
    mod.bTemp = v; saveMod(); if (rel && S.screen === 'brewer') link.cmd('brewerTemp', XB.tempDisplayToWire(v));
  });
  valueCard($('#br-flow'), { label: 'سرعة الصب', unit: 'ml/s', min: 3.0, max: 3.5, step: 0.1, value: mod.bFlow }, (v) => { mod.bFlow = v; saveMod(); });
  function setPattern(p, send) {
    mod.bPat = p; saveMod();
    $$('#br-pattern button').forEach((b) => b.classList.toggle('on', +b.dataset.pat === p));
    if (send) link.cmd('brewerPattern', XB.patternByte(p));
  }
  $$('#br-pattern button').forEach((b) => b.addEventListener('click', () => setPattern(+b.dataset.pat, true)));
  setPattern(mod.bPat, false);
  function setPouring(on) {
    S.pouring = on; if (on) { S.pourStart = Date.now(); if (artFx && artFx.view) artFx.view.progress = 0; }
    actState($('#br-play'), on, 'ابدأ', 'وقّف');
  }
  $('#br-play').addEventListener('click', async () => {
    if (!link.connected) return toast('المكينة مو متصلة');
    const on = !S.pouring;
    setPouring(on);
    const err = await (on ? link.cmd('brewerStart', mod.bFlow, mod.bVol, XB.tempDisplayToWire(mod.bTemp), XB.patternByte(mod.bPat)) : link.cmd('brewerStop'));
    if (err) { toast(err); if (on) setPouring(false); }
  });

  // ---------------------------------------------------------------- scale
  const sw = { running: false, start: 0, elapsed: 0 };
  function renderScale() {
    const g = Math.abs(S.weight) < 0.05 ? 0 : S.weight;   // بلا «-0.0» لما الميزان فاضي
    $('#sc-val').textContent = mod.unit === 'oz' ? (g / 28.3495).toFixed(2) : g.toFixed(1);
    $('#sc-unit').textContent = mod.unit;
    $('#gr-weight').textContent = g.toFixed(1) + 'g';
    $('#br-weight').textContent = g.toFixed(1) + 'g';
  }
  function setUnit(u, send) {
    mod.unit = u; saveMod();
    $$('#sc-units button').forEach((b) => b.classList.toggle('on', b.dataset.unit === u));
    renderScale();
    if (send) link.cmd('weightUnit', { g: XB.UNIT.G, oz: XB.UNIT.OZ, ml: XB.UNIT.ML }[u]);
  }
  $$('#sc-units button').forEach((b) => b.addEventListener('click', () => setUnit(b.dataset.unit, true)));
  setUnit(mod.unit, false);
  $('#sc-tare').addEventListener('click', async () => { const e = await link.cmd('tare'); if (e) toast(e); });
  $('#sc-sw').addEventListener('click', () => {
    if (sw.running) { sw.elapsed += Date.now() - sw.start; sw.running = false; }
    else { sw.elapsed = 0; sw.start = Date.now(); sw.running = true; }
    useIcon($('#sc-sw .ic'), sw.running ? 'pause' : 'play');
  });
  const fmtSW = (ms) => { const s = Math.floor(ms / 1000); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

  // ---------------------------------------------------------------- open / close modules
  // a Remedy drawing on each machine screen: grinder, dripper + server (fills while it pours), scale
  let artFx = null;
  function startArt(m) {
    if (artFx) artFx.stop();
    artFx = m === 'grinder' ? Dots.grinder($('#gr-art'), () => ({ grinding: S.grinding }))
      : m === 'scale' ? Dots.scale($('#sc-art'), () => S.weight)
      : Dots.brew($('#br-art'), { full: true });
  }
  function stopArt() { if (artFx) { artFx.stop(); artFx = null; } }
  function openModule(m) {
    if (S.flow !== 'idle') return toast('فيه وصفة شغالة على المكينة');
    show(m);
    startArt(m);
    if (!link.connected) { toast('المكينة مو متصلة'); return; }
    if (m === 'grinder') link.cmd('grinderEnter', mod.gSize, mod.gRpm);
    if (m === 'brewer') { link.cmd('brewerEnter', XB.patternByte(mod.bPat), XB.tempDisplayToWire(mod.bTemp)); }
    if (m === 'scale') link.cmd('scaleEnter');
  }
  function closeModule(m) {
    if (m === 'grinder') { if (S.grinding) link.cmd('grinderStop'); setGrinding(false); link.cmd('quitGrinder'); }
    if (m === 'brewer') { if (S.pouring) link.cmd('brewerStop'); setPouring(false); link.cmd('quitBrewer'); }
    if (m === 'scale') link.cmd('quitScale');
    stopArt();
    show('home'); setTab(S.tab);
  }
  $$('[data-open]').forEach((b) => b.addEventListener('click', () => openModule(b.dataset.open)));
  $$('[data-mod-back]').forEach((b) => b.addEventListener('click', () => closeModule(b.dataset.modBack)));

  // ---------------------------------------------------------------- editor
  let ed = null;  // working copy
  function miniStepper(el, o, get, set) {
    const dec = o.step < 1 ? 1 : 0;
    el.innerHTML = `<div class="ml">${o.label}</div><div class="mrow"><button class="m-">−</button><span class="mv"><span class="n"></span><small>${o.unit || ''}</small></span><button class="m+">+</button></div>`;
    const n = el.querySelector('.n');
    const render = () => (n.textContent = o.fmt ? o.fmt(get()) : get().toFixed(dec));
    const step = (d) => { let v = Math.min(o.max, Math.max(o.min, +(get() + d * o.step).toFixed(dec))); set(v); render(); edSummary(); };
    holdRepeat(el.querySelector('.m\\+'), () => step(1), () => {});
    holdRepeat(el.querySelector('.m-'), () => step(-1), () => {});
    render();
  }
  function openEditor(uid) {
    if (uid && find(uid)?.kind === 'remedy') return; // وصفات ريمدي ما تتعدّل (المالك ١٤ نوفمبر)
    const src = uid ? find(uid) : null;
    ed = src ? JSON.parse(JSON.stringify(src)) : {
      uid: null, kind: 'mine', id: '', name: 'وصفة جديدة', cup_type: 3, dose_g: 15, grind_size: 45, rpm: 90, grinder_on: true,
      color: CARD_COLORS[lib.length % CARD_COLORS.length], pours: [P(45, 93, 1, 30), P(105, 93, 2, 10), P(100, 93, 2, 0)],
    };
    ed.srcUid = uid;
    $('#ed-title').textContent = uid ? 'تعديل الوصفة' : 'وصفة جديدة';
    $('#ed-delete').hidden = !(src && src.kind === 'mine' && !BUILTIN(src));
    $('#ed-name').value = ed.name;
    $('#ed-colors').innerHTML = '';
    CARD_COLORS.forEach((c) => {
      const b = document.createElement('button');
      b.style.background = c;
      b.className = c.toLowerCase() === (ed.color || '').toLowerCase() ? 'on' : '';
      b.onclick = () => { ed.color = c; $$('#ed-colors button').forEach((x) => x.classList.toggle('on', x === b)); };
      $('#ed-colors').appendChild(b);
    });
    $$('#ed-cup button').forEach((b) => {
      b.classList.toggle('on', +b.dataset.cup === ed.cup_type);
      b.onclick = () => {
        ed.cup_type = +b.dataset.cup;
        const [lo, hi] = XB.doseRange(ed.cup_type);
        ed.dose_g = Math.min(hi, Math.max(lo, ed.dose_g));
        $$('#ed-cup button').forEach((x) => x.classList.toggle('on', x === b));
        buildEdSteppers(); edSummary();
      };
    });
    $('#ed-grinder').checked = ed.grinder_on;
    buildEdSteppers();
    renderPours();
    edSummary();
    show('editor');
  }
  function buildEdSteppers() {
    const [lo, hi] = XB.doseRange(ed.cup_type);
    miniStepper($('#ed-dose'), { label: 'البن', unit: 'g', min: lo, max: hi, step: 0.5, fmt: fmtNum }, () => ed.dose_g, (v) => (ed.dose_g = v));
    miniStepper($('#ed-grind'), { label: 'الطحن', min: 1, max: 80, step: 1 }, () => ed.grind_size, (v) => (ed.grind_size = v));
    miniStepper($('#ed-rpm'), { label: 'RPM', min: 60, max: 120, step: 10 }, () => ed.rpm, (v) => (ed.rpm = v));
    $('#ed-grind').classList.toggle('off', !ed.grinder_on);
    $('#ed-rpm').classList.toggle('off', !ed.grinder_on);
  }
  $('#ed-grinder').addEventListener('change', (e) => { ed.grinder_on = e.target.checked; buildEdSteppers(); edSummary(); });
  $('#ed-name').addEventListener('input', (e) => (ed.name = e.target.value));
  function renderPours() {
    const box = $('#ed-pours');
    box.innerHTML = '';
    ed.pours.forEach((q, i) => {
      const d = document.createElement('div');
      d.className = 'pour-ed';
      d.innerHTML = `<div class="pe-head"><span class="pi num">${i + 1}</span><input class="pe-name" maxlength="20" placeholder="${pourName({ pours: [] }, i)}"><b></b>
        <button class="btn small ghost danger pe-del">احذف</button></div>
        <div class="pe-grid"><div class="mini pe-vol"></div><div class="mini pe-temp"></div><div class="mini pe-pause"></div><div class="mini pe-flow"></div></div>
        <div class="pe-opts">${[1, 3, 2].map((pt) => `<button class="chip pe-pat${q.pattern === pt ? ' on' : ''}" data-p="${pt}">${PAT_NAME[pt]}</button>`).join('')}
        <span class="muted">·</span>
        <button class="chip pe-ab${q.agitate_before ? ' on' : ''}">رجّ قبل</button><button class="chip pe-aa${q.agitate_after ? ' on' : ''}">رجّ بعد</button></div>`;
      const nm = d.querySelector('.pe-name');
      nm.value = q.name || '';
      nm.addEventListener('input', () => (q.name = nm.value));
      miniStepper(d.querySelector('.pe-vol'), { label: 'الكمية', unit: 'ml', min: 0, max: 240, step: 5 }, () => q.volume_ml, (v) => (q.volume_ml = v));
      miniStepper(d.querySelector('.pe-temp'), { label: 'الحرارة', unit: '°', min: 20, max: 98, step: 1 }, () => q.temp_c, (v) => (q.temp_c = v));
      miniStepper(d.querySelector('.pe-pause'), { label: 'انتظار', unit: 's', min: 0, max: 59, step: 5 }, () => q.pause_s, (v) => (q.pause_s = v));
      miniStepper(d.querySelector('.pe-flow'), { label: 'الصب', unit: 'ml/s', min: 3.0, max: 3.5, step: 0.1 }, () => q.flow, (v) => (q.flow = v));
      d.querySelectorAll('.pe-pat').forEach((b) => (b.onclick = () => { q.pattern = +b.dataset.p; d.querySelectorAll('.pe-pat').forEach((x) => x.classList.toggle('on', x === b)); }));
      d.querySelector('.pe-ab').onclick = (e) => { q.agitate_before = !q.agitate_before; e.target.classList.toggle('on', q.agitate_before); };
      d.querySelector('.pe-aa').onclick = (e) => { q.agitate_after = !q.agitate_after; e.target.classList.toggle('on', q.agitate_after); };
      d.querySelector('.pe-del').onclick = () => { if (ed.pours.length > 1) { ed.pours.splice(i, 1); renderPours(); edSummary(); } };
      box.appendChild(d);
    });
    $('#ed-add-pour').disabled = ed.pours.length >= 9;
  }
  $('#ed-add-pour').addEventListener('click', () => {
    if (ed.pours.length >= 9) return;
    const last = ed.pours[ed.pours.length - 1] || P(60, 93, 2, 0);
    ed.pours.push(Object.assign({}, last, { name: '', pause_s: 0 }));
    renderPours(); edSummary();
    $('#ed-pours').lastElementChild.scrollIntoView({ behavior: 'smooth' });
  });
  function edSummary() {
    if (!ed) return;
    const err = XB.validate(toMachine(ed));
    $('#ed-summary').innerHTML = `${totalWater(ed)} ml · 1:${fmtNum(ratio(ed))}` + (err ? ` · <span style="color:var(--red)">${err}</span>` : '');
  }
  $('#ed-cancel').addEventListener('click', () => { ed = null; S.cur && find(S.cur) ? openDetail(S.cur) : (show('home'), setTab(S.tab)); });
  $('#ed-save').addEventListener('click', async () => {
    ed.name = ($('#ed-name').value || '').trim() || 'بدون اسم';
    const err = XB.validate(toMachine(ed));
    if (err) return toast(err);
    let p;
    const src = ed.srcUid ? find(ed.srcUid) : null;
    if (src && src.kind === 'mine' && !BUILTIN(src)) {
      Object.assign(src, ed, { srcUid: undefined, uid: src.uid, kind: 'mine' });
      p = src;
    } else {
      p = Object.assign({}, ed, { uid: newUid(), kind: 'mine', id: '', favorite: false, srcUid: undefined, color_src: '' });
      if (src) { p.name = src.name === ed.name ? ed.name + ' (نسخة)' : ed.name; p.extra = undefined; toast('انحفظت كنسخة في وصفاتي'); }
      lib.unshift(p);
    }
    delete p.srcUid;
    p.dirty = acct.signedIn;
    saveLib();
    ed = null;
    openDetail(p.uid);
    if (acct.signedIn) pushRecipe(p);
  });
  $('#ed-delete').addEventListener('click', () => {
    const src = ed && find(ed.srcUid);
    if (!src) return;
    confirmBox('تحذف الوصفة؟', acct.signedIn && src.id ? 'بتنحذف من التابلت ومن حسابك في اكس بلوم.' : 'بتنحذف من التابلت.', 'احذف', async () => {
      if (acct.signedIn && src.id) {
        try { await acct.remove(src.id); } catch (e) {
          return toast((isExpired(e) ? 'انتهت جلسة اكس بلوم، سجّل دخول وجرّب' : 'ما انحذفت من الحساب: ' + e.message) + '. الوصفة باقية.');
        }
      }
      lib = lib.filter((p) => p !== src); saveLib();
      ed = null; S.cur = null; show('home'); setTab('recipes');
    });
  });

  // ---------------------------------------------------------------- account sync
  const isExpired = (e) => e instanceof XBCloud.Expired;
  async function pushRecipe(p) {
    try {
      const id = await acct.push(p);
      p.id = id; p.dirty = false; saveLib();
      if (S.screen === 'detail') buildDetail();
    } catch (e) {
      toast(isExpired(e) ? 'انتهت جلسة اكس بلوم. الوصفة محفوظة هنا، وبتنرفع للحساب بعد ما تسجّل دخول.' : 'ما انحفظت في حساب اكس بلوم: ' + e.message);
      renderSettings();
    }
  }
  function askLogin() { $('#lg-err').textContent = ''; $('#lg-email').value = acct.email || ''; openModal('#md-login', '#lg-email'); }
  async function sync(manual) {
    if (!acct.signedIn || syncing) return;
    if (acct.expired) { syncErr = 'انتهت الجلسة'; if (manual) askLogin(); return; }
    if (!navigator.onLine) { if (manual) toast('ما فيه إنترنت'); return; }
    syncing = true; syncErr = ''; renderStatus(); renderSettings();
    try {
      for (const p of lib.filter((x) => x.dirty)) {   // unsaved edits go up first; one failed recipe doesn't stop the rest
        try { p.id = await acct.push(p); p.dirty = false; saveLib(); } catch (e) { if (isExpired(e)) throw e; }
      }
      const list = await acct.sync();
      mergeAccount(list);
      lastSync = Date.now(); store.set('lastSync', lastSync);
      syncFails = 0; nextSync = lastSync + 15 * 60000;
      if (manual) toast(`تمت المزامنة: ${list.length} وصفة`);
    } catch (e) {
      syncFails += 1;
      nextSync = Date.now() + Math.min(30, 2 ** (syncFails - 1)) * 60000;
      syncErr = isExpired(e) ? 'انتهت الجلسة' : e.message;
      if (manual) { if (isExpired(e)) askLogin(); else toast('ما زبطت المزامنة: ' + e.message); }
    }
    syncing = false;
    renderStatus(); renderSettings();
    if (S.screen === 'home') { renderHome(); if (S.tab === 'recipes') renderRecipes(); }
  }
  function mergeAccount(list) {
    const old = new Map(lib.filter((p) => p.id).map((p) => [p.id, p]));
    const fresh = list.map((c) => {
      const o = old.get(c.id);
      if (o && o.dirty) return o;
      c.uid = o ? o.uid : newUid();
      c.favorite = o ? o.favorite : false;
      c.dirty = false;
      return c;
    });
    const localOnly = lib.filter((p) => p.kind === 'mine' && !p.id && !BUILTIN(p));
    const starters = lib.filter(BUILTIN);
    lib = [...localOnly, ...fresh, ...starters];
    saveLib();
    if (S.cur && !find(S.cur) && S.screen === 'detail') { show('home'); setTab(S.tab); }
  }

  // ---------------------------------------------------------------- settings + login
  // ---------------------------------------------------------------- machine counter
  // Starts at zero on a new tablet and adds every brew this panel finishes. Tap "update" to start
  // from the numbers in the xBloom app (cups made, days in use); brews started from the machine's
  // knobs or the phone while the panel isn't connected are not seen here. A tablet that already
  // saved its numbers keeps them.
  const counter = Object.assign({ cups: 0, days: 0, at: Date.now(), fromApp: false }, store.get('counter', {}));
  if (store.get('counter', null) && !('fromApp' in store.get('counter'))) counter.fromApp = true;   // saved before this version
  const saveCounter = () => store.set('counter', counter);
  if (!store.get('counter', null)) saveCounter();
  const counterDays = () => counter.days + Math.max(0, Math.floor((Date.now() - counter.at) / 86400000));
  function renderCounter() {
    const days = counterDays();
    const perDay = days > 0 ? counter.cups / days : 0;
    const one = (x) => (Math.round(x * 10) / 10).toString();
    setText($('#ct-cups'), counter.cups.toLocaleString('en-US'));
    setText($('#ct-days'), days.toLocaleString('en-US'));
    setText($('#ct-day'), one(perDay));
    setText($('#ct-week'), one(perDay * 7));
    setText($('#ct-month'), Math.round(perDay * 30.44).toString());   // average month
    setText($('#ct-note'), counter.fromApp ? 'من أرقام تطبيق xBloom، ويزيد مع كل كوب من اللوحة' : 'يعدّ من أول ما ركّبت اللوحة. دخّل أرقام تطبيق xBloom عشان يبدأ منها.');
    setText($('#btn-counter'), counter.fromApp ? 'حدّث من تطبيق xBloom' : 'دخّل أرقام تطبيق xBloom');
  }
  $('#btn-counter').addEventListener('click', () => {
    $('#cn-cups').value = counter.fromApp ? counter.cups : '';
    $('#cn-days').value = counter.fromApp ? counterDays() : '';
    $('#cn-err').textContent = '';
    openModal('#md-counter', '#cn-cups');
  });
  $('#cn-cancel').addEventListener('click', () => closeModal('#md-counter'));
  $('#counter-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const c = parseInt($('#cn-cups').value, 10), d = parseInt($('#cn-days').value, 10);
    if (!(c >= 0) || !(d > 0)) { $('#cn-err').textContent = 'اكتب عدد الأكواب وعدد الأيام بالأرقام'; return; }
    Object.assign(counter, { cups: c, days: d, at: Date.now(), fromApp: true }); saveCounter(); renderCounter();
    closeModal('#md-counter');
  });

  // ---------------------------------------------------------------- recipes kept on this device
  // Recipes live in this browser's storage. Ask Chrome to keep it (so Android does not clear it
  // when space runs low), and offer a backup file that can be restored here or on another device.
  let persisted = null;
  async function askPersist() {
    try {
      if (!navigator.storage || !navigator.storage.persist) { persisted = false; return; }
      persisted = (await navigator.storage.persisted()) || (await navigator.storage.persist());
    } catch (e) { persisted = false; }
    if (S.tab === 'settings') renderSettings();
  }
  askPersist();
  const mine = () => lib.filter((p) => !BUILTIN(p));
  const WEEK = 7 * 86400000;
  const backupDue = () => mine().length > 0 && Date.now() - store.get('lastBackup', 0) > WEEK;
  function renderBackup() {
    setText($('#st-persist'), persisted == null ? '…' : persisted ? 'محمي، ما ينمسح لحاله' : 'عادي، يضيع لو انمسحت بيانات المتصفح');
    const n = mine().length, last = store.get('lastBackup', 0);
    const age = last ? Math.floor((Date.now() - last) / 86400000) : -1;
    setText($('#st-mine'), (n ? `· ${n} وصفة` : '· ما عندك وصفات خاصة') + (n ? (age < 0 ? ' · ما نزّلت نسخة للحين' : age === 0 ? ' · آخر نسخة اليوم' : ` · آخر نسخة قبل ${age} يوم`) : ''));
    $('#btn-export').classList.toggle('primary', backupDue());
  }
  // once a week, if there are recipes of your own and no backup this week: a reminder (M11)
  function backupNudge() {
    if (!backupDue() || Date.now() - store.get('backupNudged', 0) < WEEK) return;
    store.set('backupNudged', Date.now());
    toast('صار لك أسبوع بدون نسخة احتياطية لوصفاتك. نزّلها من الإعدادات.');
  }
  // A backup file is outside data: every recipe is rebuilt field by field, numbers as numbers, and
  // must pass the machine's own ranges, or it is skipped (M12: nothing from the file reaches the page as HTML).
  const HEX = /^#[0-9a-f]{6}$/i;
  function cleanRecipe(p) {
    if (!p || typeof p !== 'object' || !Array.isArray(p.pours) || !p.pours.length || !p.name) return null;
    const n = (v, d = 0) => { const x = Number(v); return Number.isFinite(x) ? x : d; };
    const str = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, '').slice(0, max);
    const r = {
      uid: str(p.uid, 40) || newUid(), kind: p.kind === 'shared' ? 'shared' : 'mine', id: p.id ? str(p.id, 40) : '',
      name: str(p.name, 40).trim() || 'بدون اسم', cup_type: n(p.cup_type, 3), dose_g: n(p.dose_g, 15),
      grind_size: Math.round(n(p.grind_size, 45)), rpm: n(p.rpm, 90), grinder_on: !!p.grinder_on,
      color: HEX.test(p.color) ? p.color : DEFAULT_COLOR, color_src: HEX.test(p.color_src) ? p.color_src : '',
      favorite: !!p.favorite, dirty: !!p.dirty, crop: typeof p.crop === 'string' && /^[a-z]{2,20}$/.test(p.crop) ? p.crop : null,
      pours: p.pours.slice(0, 9).map((q) => ({
        name: str(q && q.name, 20), volume_ml: n(q && q.volume_ml), temp_c: n(q && q.temp_c, 93),
        pattern: [1, 2, 3].includes(n(q && q.pattern)) ? n(q.pattern) : 2, pause_s: n(q && q.pause_s), flow: n(q && q.flow, 3),
        agitate_before: !!(q && q.agitate_before), agitate_after: !!(q && q.agitate_after),
      })),
    };
    if (p.extra && typeof p.extra === 'object') {
      const x = p.extra;
      r.extra = { bypass: !!x.bypass, bypassTemp: n(x.bypassTemp, 85), bypassVolume: n(x.bypassVolume, 5), adaptedModel: n(x.adaptedModel, 1),
        createTimeStamp: n(x.createTimeStamp, 0), isShortcuts: n(x.isShortcuts, 0), subSetType: n(x.subSetType, 0), theSubsetId: n(x.theSubsetId, 0) };
    }
    return XB.validate(r) ? null : r;
  }
  $('#btn-export').addEventListener('click', () => {
    const data = {
      app: 'remedy-xbloom-panel', v: 1, at: new Date().toISOString(),
      recipes: mine(),
      favorites: lib.filter((p) => BUILTIN(p) && p.favorite).map((p) => p.uid),
      counter, today, prefs: { noGrind: !!prefs.noGrind },
    };
    const d = new Date(), stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
    a.download = `remedy-xbloom-${stamp}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    store.set('lastBackup', Date.now()); renderBackup();
    toast('نزّلت النسخة في التنزيلات');
  });
  $('#btn-import').addEventListener('click', () => $('#file-import').click());
  $('#file-import').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    let data;
    try { data = JSON.parse(await file.text()); } catch (err) { return toast('الملف مو نسخة من اللوحة'); }
    if (!data || data.app !== 'remedy-xbloom-panel' || !Array.isArray(data.recipes)) return toast('الملف مو نسخة من اللوحة');
    const ok = data.recipes.filter((p) => p && !BUILTIN(p)).map(cleanRecipe).filter(Boolean);
    const skipped = data.recipes.filter((p) => p && !BUILTIN(p)).length - ok.length;
    let added = 0, updated = 0;
    for (const p of ok) {
      const i = lib.findIndex((q) => q.uid === p.uid);
      if (i >= 0) { lib[i] = p; updated++; } else { lib.unshift(p); added++; }
    }
    const fav = new Set((Array.isArray(data.favorites) ? data.favorites : []).map(String));
    lib.forEach((p) => { if (BUILTIN(p) && fav.has(p.uid)) p.favorite = true; });
    // counter, today and the grind switch come back too, when they are sane
    const c = data.counter || {};
    if (Number.isFinite(c.cups) && Number.isFinite(c.days) && Number.isFinite(c.at) && c.cups >= 0 && c.days >= 0 && c.cups >= counter.cups) {
      Object.assign(counter, { cups: c.cups, days: c.days, at: c.at, fromApp: c.fromApp !== false }); saveCounter();
    }
    const td = data.today || {};
    if (td.d === dayKey() && Number.isFinite(td.n) && td.n > today.n && td.n < 100) { today.n = td.n; store.set('today', today); }
    if (data.prefs && typeof data.prefs.noGrind === 'boolean') { prefs.noGrind = data.prefs.noGrind; savePrefs(); }
    saveLib(); renderSettings(); renderHome();
    toast(`رجّعت ${added} وصفة جديدة${updated ? ` وحدّثت ${updated}` : ''}${skipped ? ` وتركت ${skipped} ما تنفع للمكينة` : ''}`);
  });

  function renderSettings() {
    /* رقم النسخة من رابط app.js (?v=)، عشان نعرف وش يشغّل الجوال (المالك ١٥ نوفمبر: «للحين ما تعدل») */
    const vs = (document.querySelector('script[src*="app.js"]') || {}).src || '';
    setText($('#st-ver'), (vs.match(/v=(\d+)/) || [])[1] || '?');
    renderCounter();
    renderBackup();
    $('#st-machine').textContent = link.connected ? link.name : { connecting: 'يتصل…', searching: 'يبحث عن ' + (link.name || 'المكينة') + '…' }[link.state] || 'غير مربوطة';
    $('#btn-forget').hidden = !link.name;
    $('#st-acct').textContent = acct.signedIn ? acct.email + (acct.expired ? ' · انتهت الجلسة' : '') : 'غير مسجّل';
    $('#btn-login').hidden = acct.signedIn && !acct.expired;
    $('#btn-logout').hidden = !acct.signedIn;
    $('#btn-sync').hidden = !acct.signedIn || acct.expired;
    $('#btn-sync').disabled = syncing;
    $('#st-sync').textContent = syncing ? 'يزامن…' : syncErr ? 'خطأ: ' + syncErr
      : lastSync ? 'آخر مزامنة ' + new Date(lastSync).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
    $('#st-awake').checked = prefs.awake;
    $('#st-machine').checked = prefs.machineAwake;
    $('#st-hopper').checked = prefs.hopper;
    $('#st-sim').checked = SIM;
    $$('#st-idle button').forEach((b) => b.classList.toggle('on', +b.dataset.idle === prefs.idleMin));
    $$('#st-write button').forEach((b) => b.classList.toggle('on', b.dataset.write === (link.writeMode || 'auto')));
  }
  $('#btn-connect').addEventListener('click', connectTap);
  $('#cc-btn').addEventListener('click', () => {
    if (!link.supported) { location.href = 'https://apps.apple.com/app/bluefy-web-ble-browser/id1492822055'; return; }
    connectTap();
  });
  async function connectTap() {
    try { await link.pick(); } catch (e) {
      if (e && e.name === 'NotFoundError') return;  // user closed the chooser
      toast(e.message || 'ما قدرت أتصل');
    }
    renderSettings();
  }
  $('#btn-forget').addEventListener('click', () => confirmBox('تفصل المكينة؟', 'بتحتاج تربطها من جديد بعدين.', 'افصل', () => { link.forget(); renderSettings(); updateConnectCard(); }));
  $('#btn-sync').addEventListener('click', () => sync(true));
  $('#btn-login').addEventListener('click', askLogin);
  $('#lg-cancel').addEventListener('click', () => closeModal('#md-login'));
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#lg-go').disabled = true; $('#lg-err').textContent = '';
    try {
      await acct.login($('#lg-email').value.trim(), $('#lg-pass').value);
      closeModal('#md-login'); $('#lg-pass').value = '';
      syncFails = 0; syncErr = '';
      renderSettings();
      await sync(true);
    } catch (err) { $('#lg-err').textContent = err.message; $('#lg-pass').value = ''; }
    $('#lg-go').disabled = false;
  });
  $('#btn-logout').addEventListener('click', () => confirmBox('تطلع من الحساب؟', 'وصفات الحساب بتنشال من التابلت.', 'اطلع', () => {
    acct.signOut(); lib = lib.filter((p) => BUILTIN(p) || (p.kind === 'mine' && !p.id)); saveLib(); lastSync = 0; store.set('lastSync', 0); renderSettings();
  }));
  $('#st-awake').addEventListener('change', (e) => { prefs.awake = e.target.checked; savePrefs(); keepAwake(); });
  $('#st-machine').addEventListener('change', (e) => { prefs.machineAwake = e.target.checked; savePrefs(); });
  $('#st-hopper').addEventListener('change', (e) => { prefs.hopper = e.target.checked; savePrefs(); toast(prefs.hopper ? (rateFor(40) ? 'الخزان مليان: أطحن قد الجرعة بالوقت' : 'شغّلته. عاير الطاحونة من «عاير الطاحونة» تحته') : 'الطحن من الوصفة نفسها'); });
  $('#st-calib').addEventListener('click', calibrateGrind);
  $('#st-sim').addEventListener('change', (e) => { prefs.sim = e.target.checked; savePrefs(); location.reload(); });
  $$('#st-idle button').forEach((b) => b.addEventListener('click', () => { prefs.idleMin = +b.dataset.idle; savePrefs(); renderSettings(); }));
  $$('#st-write button').forEach((b) => b.addEventListener('click', () => { link.setWriteMode(b.dataset.write); renderSettings(); }));
  $('#btn-fullscreen').addEventListener('click', () => document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => {}));
  $('#btn-log').addEventListener('click', () => { $('#log-pre').textContent = link.logLines.join('\n') || '(فاضي)'; openModal('#md-log'); });
  $('#log-close').addEventListener('click', () => closeModal('#md-log'));
  $('#log-copy').addEventListener('click', () => { navigator.clipboard && navigator.clipboard.writeText(link.logLines.join('\n')).then(() => toast('انسخ')); });
  $('#btn-new-recipe').addEventListener('click', () => openEditor(null));

  function updateConnectCard() {
    const card = $('#connect-card');
    const stuck = link.state === 'searching' && Date.now() - S.linkSince > 20000;
    const want = S.screen === 'home' && S.tab === 'home' && (link.state === 'idle' || stuck);
    card.hidden = !want;
    /* الآيفون والآيباد: أبل تمنع البلوتوث على كل متصفحاتها، فنودّيه لـBluefy (متصفح مجاني يدعمه)
       لين يطلع تطبيق ريمدي (المالك ١٤ نوفمبر: «أنا أبي الناس تجربه») */
    const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const btn = $('#cc-btn');
    btn.textContent = !link.supported && ios ? 'حمّل Bluefy' : 'اربط';
    btn.hidden = !link.supported && !ios;
    if (!link.supported && ios) $('#cc-sub').textContent = 'الربط من الآيفون يحتاج تطبيق ريمدي. ولين ينزل في App Store، افتحها في Bluefy.';
    else if (!link.supported) $('#cc-sub').textContent = 'هذا المتصفح ما يدعم البلوتوث. افتح الصفحة في Google Chrome.';
    else if (stuck) $('#cc-sub').textContent = 'ما لقيت المكينة. تأكد إنها شغالة وقريبة، واضغط اربط.';
    else $('#cc-sub').textContent = 'شغّل المكينة وقرّب الجهاز منها، وبعدين اضغط اربط.';
  }

  // ---------------------------------------------------------------- link events
  link.on('link', (st) => {
    S.linkSince = Date.now();
    if (st !== 'connected') {
      if (S.flow !== 'idle') brewEnded();     // the stored brew stays: when the link comes back mid-brew it picks up again
      setGrinding(false); setPouring(false);
    }
    renderStatus(); renderSettings(); refreshDetail(); updateConnectCard();
  });
  link.on('weight', (g) => {
    S.weight = g; S.weightAt = Date.now();
    if (Math.abs(g - S.wakeRef) >= 2) { S.wakeRef = g; wake(); }
    renderScale();
  });
  link.on('water', (ml) => (S.water = ml));
  link.on('pour', (i) => (S.pourIdx = i));
  let endTimer = 0;
  link.on('activity', (a) => {
    S.activity = a;
    wake();
    const brewing = a === 34 || a === 30 || a === 35 || a === 16;
    if (a === 34 && pending && !pending.grindSeen) { pending.grindSeen = true; store.set('pendingBrew', pending); }
    if (brewing || a === 31) clearTimeout(endTimer);
    if (brewing && S.active && (S.flow === 'loaded' || S.flow === 'starting')) {
      closeModal('#md-cup');
      S.flow = 'brewing';
      if (!S.brewStart) S.brewStart = (pending && pending.startedAt) || Date.now();
      brewStarted();
    } else if ((brewing || a === 31) && S.flow === 'idle' && pending && find(pending.uid)) {
      // the link dropped mid-brew, or the page reloaded: the machine is still brewing our recipe (M7)
      S.active = pending.uid; S.flow = a === 31 ? 'paused' : 'brewing'; S.brewStart = pending.startedAt;
      link.log && link.log('brew picked up again (' + pending.brew_id + ')');
      brewStarted();
    } else if (a === 1 && S.flow === 'idle' && pending && Date.now() - pending.startedAt > 60000) {
      endPending();                           // back home without us seeing the end: that brew is over
    }
    // Home / Done: keep the recipe for 3 s, the machine may send ENJOY just after (M8; its order on the real
    // machine isn't logged yet). ENJOY inside the 3 s ends it properly; otherwise it ends here.
    if ((a === 1 || a === 36) && S.active && (S.flow === 'brewing' || S.flow === 'paused')) {
      clearTimeout(endTimer);
      endTimer = setTimeout(() => { if (S.flow === 'brewing' || S.flow === 'paused') { brewEnded(); endPending(); } }, 3000);
    }
    refreshDetail(); renderStatus();
  });
  link.on('done', () => {
    clearTimeout(endTimer);
    const counted = countCup();
    const p = find(S.active) || (pending && find(pending.uid));
    const name = p ? p.name : pending ? pending.name : 'قهوتك';
    const ml = S.water > 0 ? S.water : p ? totalWater(p) : 0;
    const start = S.brewStart || (pending && pending.startedAt) || 0;
    if (counted || $('#ov-finish').hidden) showFinish(name, S.weight, ml, start ? Date.now() - start : 0);
    wake();
    brewEnded(); endPending();
  });
  link.on('abandoned', () => { brewEnded(); endPending(); });
  link.on('paused', () => { if (S.flow === 'brewing') S.flow = 'paused'; refreshDetail(); });
  link.on('resumed', () => { if (S.flow === 'paused') S.flow = 'brewing'; refreshDetail(); });
  link.on('fault', (m) => { toast(m); wake(); });
  link.on('pod', () => wake());

  // ---------------------------------------------------------------- idle: clock, go home, wake lock
  let clockFx = null, wakeLock = null, reloadWanted = false;
  function wake() { S.lastTouch = Date.now(); hideClock(); }
  function showClock() {
    if (!$('#ov-clock').hidden) return;
    $('#ov-clock').hidden = false;
    tilesOn(false);
    clockFx = Dots.clock($('#clock-canvas'));
    tickIdleClock();
  }
  function hideClock() { if ($('#ov-clock').hidden) return; $('#ov-clock').hidden = true; if (clockFx) clockFx.stop(); tilesOn(homeVisible()); }
  function tickIdleClock() {
    if (!clockFx) return;
    const d = new Date();
    clockFx.set(d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
    clockFx.date = d.toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { weekday: 'long', day: 'numeric', month: 'long' });
  }
  $('#ov-clock').addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); wake(); });
  ['pointerdown', 'keydown', 'input'].forEach((ev) => document.addEventListener(ev, () => { S.lastTouch = Date.now(); }, true));
  const typing = () => S.screen === 'editor' || !$('#md-login').hidden || !$('#md-counter').hidden;

  function goHomeIdle() {
    hideFinish();
    $$('.modal').forEach((m) => { if (m.id !== 'md-cup') m.hidden = true; });
    if (['grinder', 'brewer', 'scale'].includes(S.screen)) closeModule(S.screen);
    else if (S.screen !== 'home') show('home');
    setTab('home');
  }
  async function keepAwake() {
    try {
      if (prefs.awake && 'wakeLock' in navigator && document.visibilityState === 'visible') {
        if (!wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => (wakeLock = null)); }
      } else if (!prefs.awake && wakeLock) { await wakeLock.release(); wakeLock = null; }
    } catch (e) { /* not allowed right now; retry on next visibility change */ }
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { keepAwake(); if (link.state === 'idle' && link.restore) link.restore(); else if (link.state !== 'connected' && link.tryReconnect) link.tryReconnect(0); } });

  setInterval(() => {
    tickClock();
    if (today.d !== dayKey()) renderToday();
    renderStatus();
    if (S.screen === 'detail' && S.active === S.cur) refreshDetail();
    updateBrew();
    setText($('#br-timer'), fmtSW(S.pouring ? Date.now() - S.pourStart : 0));
    const pourP = S.pouring ? Math.min(1, (Date.now() - S.pourStart) / (mod.bVol / mod.bFlow * 1000)) : 0;
    if (S.screen === 'brewer') $('#br-play').style.setProperty('--p', pourP.toFixed(3));
    if (artFx && S.screen === 'brewer') { if (S.pouring) artFx.view.progress = pourP * 0.85; artFx.view.pouring = S.pouring; }
    setText($('#sc-timer'), fmtSW(sw.elapsed + (sw.running ? Date.now() - sw.start : 0)));
    if (S.pouring && Date.now() - S.pourStart > (mod.bVol / mod.bFlow + 8) * 1000) setPouring(false);
    const idle = Date.now() - S.lastTouch;
    if (S.flow === 'loaded' && Date.now() - S.loadedAt > LOADED_MAX_MS) quitLoaded('ألغيت الوصفة من المكينة لأن التحضير ما بدأ');   // M6
    if (!busy() && !typing() && idle > 30000) {
      const atHome = S.screen === 'home' && S.tab === 'home' && $('#ov-finish').hidden;
      if (!atHome) goHomeIdle();
    }
    if (!busy() && !typing() && prefs.idleMin > 0 && idle > prefs.idleMin * 60000) showClock();
    if (reloadWanted && !busy() && !typing() && $('#ov-finish').hidden && S.screen === 'home') location.reload();   // M13
    if (!$('#ov-clock').hidden) tickIdleClock();
    if (acct.signedIn && !acct.expired && !syncing && Date.now() >= nextSync && !busy()) sync(false);
    updateConnectCard();
  }, 500);

  // first touch: go full screen (browsers only allow it from a tap)
  document.addEventListener('pointerdown', function fsOnce() {
    document.removeEventListener('pointerdown', fsOnce, true);
    if (!document.fullscreenElement && !matchMedia('(display-mode: fullscreen)').matches && document.documentElement.requestFullscreen)
      document.documentElement.requestFullscreen().catch(() => {});
    keepAwake();
  }, true);

  // ---------------------------------------------------------------- قهوة الدوام (دوامي)
  // تابلت البيت بس: ينربط مرة بفتح الرابط ?dawami=<الرمز> (من صفحة الإدارة في دوامي). بعدها يسأل خادم دوامي
  // كل ٣٠ ثانية، وقبل الدوام بنص ساعة يرد «go <المفتاح>»، فتتحضّر الوصفة المختارة بزر الساعة في صفحتها.
  const DAWAMI = 'https://rawan.remedylab.dev/api/coffee';
  (() => {
    const q = new URLSearchParams(location.search), k = q.get('dawami');
    if (!k || !/^[0-9a-f]{32}$/.test(k)) return;
    prefs.dawamiKey = k; savePrefs(); q.delete('dawami');
    history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash);
    setTimeout(() => toast('انربطت بدوامي ☕ اختر وصفة القهوة من زر الساعة في صفحتها'), 500);
  })();
  let dawamiBusy = '';
  async function dawamiPoll() {
    if (!prefs.dawamiKey || dawamiBusy || SIM) return;
    let t = '';
    try { t = (await (await fetch(`${DAWAMI}?k=${prefs.dawamiKey}`, { cache: 'no-store' })).text()).trim(); } catch { return; }
    if (!t.startsWith('go ')) return;
    /* «go <المفتاح> [الوصفة]»: الوصفة من الجوال (صفحة إدارة دوامي، المالك ٢١ نوفمبر: «خلني اقدر اختار الوصفه»)،
       وإلا اللي عليها زر الساعة، وإلا jelly */
    const [id, uid] = t.slice(3).trim().split(/\s+/);
    const p = find(uid) || find(prefs.dawamiRecipe) || find('h-jelly');
    if (!p) return toast('قهوة الدوام: اختر الوصفة من زر الساعة في صفحتها');
    if (!link.connected || S.flow !== 'idle') return;   // نعيد بعد ٣٠ ثانية
    /* حماية الكوب ١ (المالك ٢١ نوفمبر): الميزان مصفّر والكوب عليه، فالصفر = الكوب موجود. السالب (تحت −٢٠ جرام)
       = أحد شال الكوب بعد التصفير: ما نحضّر، ونعيد نسأل كل ٣٠ ثانية لين يرجع الكوب أو تخلص نافذة الوقت */
    if (S.weightAt && Date.now() - S.weightAt < 15_000 && S.weight <= -20) {
      return toast('قهوة الدوام: الكوب مو على المكينة، رجّعه وتبدأ لحالها');
    }
    dawamiBusy = id;
    /* قهوة الدوام تطحن دايمًا (المالك ٢١ نوفمبر: «المفروض قهوه الدوام دايم مع طحن»): زر «بدون طحن» المحفوظ ما يمشي
       عليها. نرجّع اختيار الزر بعد ما يبدأ التحضير، وما نحفظ التغيير */
    const keepNoGrind = prefs.noGrind;
    prefs.noGrind = false;
    try {
      wake(); openDetail(p.uid); $('#d-start').click();
      for (let i = 0; i < 240 && S.flow !== 'brewing'; i++) await new Promise((r) => setTimeout(r, 1000));   // مع طحن الخزان ياخذ أطول
      if (S.flow === 'brewing' && S.active === p.uid) {
        await fetch(`${DAWAMI}/done?k=${prefs.dawamiKey}&id=${encodeURIComponent(id)}`, { method: 'POST' }).catch(() => {});
        prefs.noGrind = keepNoGrind;
        /* حماية الكوب ٢: لما يصب ٣٠ مل والميزان ما زاد ١٠ جرام، الماء مو نازل في كوب: نوقف التحضير على طول */
        const w0 = S.weight;
        for (let i = 0; i < 360 && S.flow === 'brewing' && S.active === p.uid; i++) {
          if (S.water >= 30 && S.weight - w0 < 10) {
            toast('قهوة الدوام وقفت: الماء ما نزل في كوب');
            await link.stop();
            await fetch(`${DAWAMI}/done?k=${prefs.dawamiKey}&id=${encodeURIComponent(id)}&fail=nocup`, { method: 'POST' }).catch(() => {});
            break;
          }
          if (S.water >= 30) break;              // الماء نازل والوزن يزيد: الكوب موجود
          await new Promise((r) => setTimeout(r, 500));
        }
      }
    } finally { prefs.noGrind = keepNoGrind; dawamiBusy = ''; refreshDetail(); }
  }
  setInterval(dawamiPoll, 30000);
  setTimeout(dawamiPoll, 3000);

  /* قائمة الوصفات لصفحة إدارة دوامي: عشان عبدالرحمن يختار من جواله وش تتحضّر (الاسم والرقم بس) */
  let sentList = '';
  async function dawamiRecipes() {
    if (!prefs.dawamiKey || SIM) return;
    const list = lib.map((p) => ({ uid: p.uid, name: String(p.name || '').slice(0, 60) })).slice(0, 200);
    const body = JSON.stringify(list);
    if (body === sentList) return;
    try {
      const r = await fetch(`${DAWAMI}/recipes?k=${prefs.dawamiKey}`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body });
      if (r.ok) sentList = body;
    } catch { /* نعيد بعدين */ }
  }
  setTimeout(dawamiRecipes, 5000);
  setInterval(dawamiRecipes, 10 * 60000);

  /* المكينة ما تنام (المالك ٢١ نوفمبر: «اعطيها اوامر وهميه ما تسوي شي كل شوي»): كل دقيقتين وهي فاضية نرسل لها
     وحدة الميزان نفسها اللي عليها (ما يطحن ولا يصب ولا يغيّر شي). يتطفّى من الإعدادات */
  setInterval(() => {
    if (!prefs.machineAwake || SIM || !link.connected || S.flow !== 'idle') return;
    link.cmd('weightUnit', { g: XB.UNIT.G, oz: XB.UNIT.OZ, ml: XB.UNIT.ML }[mod.unit] ?? XB.UNIT.G).catch?.(() => {});
  }, 2 * 60000);

  // ---------------------------------------------------------------- start
  loadLib();
  setTab('home');
  tickClock();
  renderStatus();
  keepAwake();
  link.restore();
  if (acct.signedIn && !acct.expired) setTimeout(() => sync(false), 1500);
  /* داخل تطبيق ريمدي (Capacitor) بلا service worker: كان يقدّم نسخة قديمة من الكاش (اللوحة ٤٢ والمنشور ٤٦، ١٥ نوفمبر).
     والمسجّل من قبل ينشال مع كاشه، فالجوال ياخذ الحي على طول */
  // زر «الموقع»: يطلع لما اللوحة انفتحت من remedy.sa (المتصفح أو تطبيق ريمدي)، ومو في تابلت المحل المثبّت.
  (() => {
    const b = document.getElementById('sb-back'); if (!b) return;
    let fromSite = false;
    try { fromSite = document.referrer && new URL(document.referrer).origin === location.origin && !new URL(document.referrer).pathname.startsWith('/xbloom'); } catch (_) {}
    try { if (fromSite) sessionStorage.setItem('xb-from-site', '1'); else fromSite = sessionStorage.getItem('xb-from-site') === '1'; } catch (_) {}
    const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    const onSite = location.hostname === 'remedy.sa' || location.hostname === 'www.remedy.sa';
    if (!fromSite && !(onSite && !standalone && !window.Capacitor)) return;
    b.hidden = false;
    b.addEventListener('click', (e) => { if (fromSite && history.length > 1) { e.preventDefault(); history.back(); } });
  })();
  const inApp = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  if (inApp && 'serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
    if (window.caches) caches.keys().then((ks) => ks.forEach((k) => caches.delete(k))).catch(() => {});
  }
  if (!inApp && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) reloadWanted = true; });
    /* تحديث تلقائي (المالك ١٥ نوفمبر: «التابلت لازم أسكر الصفحة وأفتحها»): نشيّك على نسخة جديدة كل دقيقتين
       وكل ما رجعت الشاشة، وأول ما تتركّب تعيد الصفحة نفسها لما تكون فاضية (مو وقت تحضير ولا كتابة) */
    navigator.serviceWorker.register('sw.js').then((r) => {
      const check = () => r.update().catch(() => {});
      setInterval(check, 2 * 60000);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
      addEventListener('focus', check);
      addEventListener('online', check);
    }).catch(() => {});
  }
  setTimeout(backupNudge, 8000);
  if (new URLSearchParams(location.search).has('debug')) window.__panel = { S, link, lib: () => lib };  // console debugging, ?debug=1 only
})();
