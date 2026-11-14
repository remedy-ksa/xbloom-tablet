// xBloom tablet panel — screens, recipe library, brew flow.
(function () {
  'use strict';
  const XB = window.XB;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  // ---------------------------------------------------------------- storage
  const store = {
    get(k, d = null) { try { const v = localStorage.getItem('xbp.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('xbp.' + k, JSON.stringify(v)); } catch (e) {} },
  };
  const prefs = Object.assign({ awake: true, idleMin: 3, sim: false }, store.get('prefs', {}));
  const savePrefs = () => store.set('prefs', prefs);
  const SIM = new URLSearchParams(location.search).has('sim') || prefs.sim;

  // ---------------------------------------------------------------- recipes
  const CARD_COLORS = ['#DE9457', '#CE94CC', '#EE7A84', '#E86C8D', '#F4C700', '#2FA8D5', '#A9C99A', '#EFEBE2'];
  const PAT_NAME = { 1: 'وسط', 2: 'حلزوني', 3: 'دائري' };
  const CUP_NAME = { 1: 'xPod', 2: 'Omni', 3: 'Other', 4: 'Tea' };
  const KIND_NAME = { mine: 'وصفاتي', shared: 'مشتركة', starter: 'أساسية', remedy: 'ريمدي' };
  const BUILTIN = (p) => p.kind === 'starter' || p.kind === 'remedy';   // shipped with the app, not saved
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
  // BP (boiling point) is sent as 98, the machine's top temperature.
  const PINNED = [
    { uid: 'h-cold-sweet', kind: 'remedy', pinned: true, name: 'cold sweet 15 Grinder', cup_type: 2, dose_g: 15, grind_size: 15, rpm: 120, grinder_on: true, color: '#2FA8D5',
      pours: [P(5, 98, 1, 10), P(35, 98, 3, 59), P(35, 98, 2, 20), P(30, 98, 2, 5)] },
    { uid: 'h-jelly', kind: 'remedy', pinned: true, name: 'jelly', cup_type: 2, dose_g: 18, grind_size: 40, rpm: 120, grinder_on: true, color: '#F4C700',
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
  const ratio = (p) => (p.dose_g > 0 ? Math.round((totalWater(p) / p.dose_g) * 10) / 10 : 0);
  const fmtNum = (x) => (Math.round(x * 10) / 10).toString();
  // forBrew: apply the quick "without grinding" switch (pre-ground coffee) without touching the saved recipe
  function toMachine(p, forBrew = false) {
    return { dose_g: p.dose_g, grind_size: p.grind_size, rpm: p.rpm, cup_type: p.cup_type, grinder_on: p.grinder_on && !(forBrew && prefs.noGrind),
      pours: p.pours.map((q) => ({ volume_ml: q.volume_ml, temp_c: q.temp_c, pattern: q.pattern, flow: q.flow, pause_s: q.pause_s,
        agitate_before: q.agitate_before, agitate_after: q.agitate_after })) };
  }
  function pourName(p, i) { return (p.pours[i] && p.pours[i].name) || (i === 0 ? 'Bloom' : `Pour ${i + 1}`); }

  // ---------------------------------------------------------------- link + account
  const link = SIM ? new XBLink.SimLink() : new XBLink.BleLink(store);
  const acct = new XBCloud.Account(store);
  let syncing = false, lastSync = store.get('lastSync', 0), syncErr = '';

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
  function confirmBox(title, body, ok, action) {
    $('#cf-title').textContent = title; $('#cf-body').textContent = body; $('#cf-yes').textContent = ok;
    $('#md-confirm').hidden = false;
    $('#cf-yes').onclick = () => { $('#md-confirm').hidden = true; action(); };
    $('#cf-no').onclick = () => ($('#md-confirm').hidden = true);
  }
  function show(screen) {
    $$('.screen').forEach((s) => s.classList.toggle('active', s.id === 'scr-' + screen));
    S.screen = screen;
    updateConnectCard();
  }
  function setTab(tab) {
    S.tab = tab;
    $$('.tabbar button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    $$('.page').forEach((p) => p.classList.toggle('active', p.id === 'page-' + tab));
    if (tab === 'recipes') renderRecipes();
    if (tab === 'settings') renderSettings();
    if (tab === 'home') renderHome();
    updateConnectCard();
  }
  $$('.tabbar button').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
  $$('[data-go-tab]').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.goTab)));

  // ---------------------------------------------------------------- status bar
  function renderStatus() {
    const st = link.state;
    const dot = $('#sb-dot');
    dot.className = 'dot' + (st === 'connected' ? ' ok' : st === 'connecting' || st === 'searching' ? ' busy' : '');
    $('#sb-name').textContent = link.name || 'XBLOOM';
    $('#sb-state').textContent = st === 'connected' ? (S.flow === 'brewing' ? 'يحضّر' : 'متصلة')
      : st === 'connecting' ? 'يتصل…' : st === 'searching' ? 'يبحث…' : 'غير مربوطة';
    $('#sb-sync').textContent = syncing ? 'يزامن…' : '';
  }
  function tickClock() {
    const d = new Date();
    $('#sb-clock').textContent = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }

  // ---------------------------------------------------------------- cards
  function cardEl(p) {
    const b = document.createElement('button');
    b.className = 'card' + (S.active === p.uid && S.flow !== 'idle' ? ' active-brew' : '');
    b.style.background = p.color || '#C9D5B8';
    b.innerHTML = `<div class="c-top"><span>${p.line || CUP_NAME[p.cup_type] || ''} · ${KIND_NAME[p.kind]}</span><span class="c-heart">${p.favorite ? '♥' : ''}</span></div>
      <div class="c-name"></div>
      <div class="c-meta">${fmtNum(p.dose_g)}g · 1:${fmtNum(ratio(p))} · ${p.grinder_on ? 'G' + p.grind_size : 'no grind'}</div>
      ${p.dirty ? '<span class="c-dirty" title="مو محفوظة في الحساب"></span>' : ''}`;
    b.querySelector('.c-name').textContent = p.name;
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
  // A cup counts when the machine says ENJOY (brew finished), and only then.
  let lastCup = 0;
  function countCup(why) {
    if (Date.now() - lastCup < 20000) return;
    lastCup = Date.now();
    renderToday();                      // rolls the day over first
    today.n += 1;
    if (!SIM) { store.set('today', today); counter.cups += 1; saveCounter(); }
    link.log && link.log('cup counted (' + why + '), today ' + today.n);
    renderToday();
    if (S.screen === 'settings' || S.tab === 'settings') renderCounter();
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
    const col = p.color || '#C9D5B8';
    $('#d-left').style.background = col;
    $('#scr-detail').style.setProperty('--fill', col);
    $('#d-kind').textContent = `${KIND_NAME[p.kind]} · ${p.line || CUP_NAME[p.cup_type]}`;
    $('#d-name').textContent = p.name;
    $('#d-sub').innerHTML = `<span class="num">${totalWater(p)} ml · 1:${fmtNum(ratio(p))}</span> · ${p.pours.length} صبّات${p.ice_g ? ` · ثلج <span class="num">${p.ice_g}g</span>` : ''}`;
    $('#d-fav').textContent = p.favorite ? '♥' : '♡';
    const max = Math.max(...p.pours.map((q) => q.volume_ml), 1);
    const chart = $('#d-chart');
    chart.innerHTML = '';
    let cum = 0;
    p.pours.forEach((q, i) => {
      const c = document.createElement('div');
      c.className = 'col';
      c.innerHTML = `<div class="vol">${q.volume_ml}</div><div class="bar" style="height:${Math.max(10, (q.volume_ml / max) * 80)}%"><div class="fill"></div></div><div class="lbl">${i + 1}</div>`;
      c.dataset.cum = cum; c.dataset.vol = q.volume_ml;
      cum += q.volume_ml;
      chart.appendChild(c);
    });
    const list = $('#d-pours');
    list.innerHTML = '';
    p.pours.forEach((q, i) => {
      const r = document.createElement('div');
      r.className = 'pour-row';
      r.innerHTML = `<span class="pi">${i + 1}</span><div><div class="pn"></div><div class="pd"><span class="num">${q.temp_c >= 96 ? 'BP' : q.temp_c + '°C'} · ${q.flow.toFixed(1)} ml/s${q.pause_s ? ' · ' + q.pause_s + 's' : ''}</span> · ${PAT_NAME[q.pattern]}${q.agitate_before || q.agitate_after ? ' · رجّ' : ''}</div></div><span class="pv num">${q.volume_ml} ml</span>`;
      r.querySelector('.pn').textContent = pourName(p, i);
      list.appendChild(r);
    });
    refreshDetail();
  }
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
      if (S.flow === 'loaded') { $('#md-cup').hidden = false; return; }
      return;
    }
    if (S.flow !== 'idle') return toast('فيه وصفة ثانية على المكينة');
    const p = find(S.cur);
    if (!p) return;
    const err = XB.validate(toMachine(p, true));
    if (err) return toast(err);
    S.active = S.cur; S.flow = 'loading';
    refreshDetail(); renderStatus();
    cmdResult('load', await link.load(toMachine(p, true)));
  });
  $('#d-stop').addEventListener('click', async () => cmdResult('stop', await link.stop()));
  // quick switch: grind in the machine, or brew pre-ground coffee (remembered for next time)
  $$('#d-grind button').forEach((b) => b.addEventListener('click', () => {
    if (S.active === S.cur && S.flow !== 'idle') return toast('غيّرها قبل ما تحمّل الوصفة');
    prefs.noGrind = b.dataset.g === '0'; savePrefs(); refreshDetail();
  }));
  $('#d-fav').addEventListener('click', () => {
    const p = find(S.cur); if (!p) return;
    p.favorite = !p.favorite; saveLib();
    $('#d-fav').textContent = p.favorite ? '♥' : '♡';
  });
  $('#d-edit').addEventListener('click', () => openEditor(S.cur));
  $('[data-back]').addEventListener('click', () => { show('home'); setTab(S.tab); });

  $('#cup-cancel').addEventListener('click', async () => {
    $('#md-cup').hidden = true;
    S.flow = 'idle'; S.active = null; refreshDetail();
    await link.quitRecipe();
  });
  $('#cup-go').addEventListener('click', async () => {
    $('#md-cup').hidden = true;
    S.flow = 'starting'; refreshDetail();
    cmdResult('execute', await link.execute());  // the only path that starts a recipe brew
  });

  function cmdResult(type, err) {
    if (err) {
      toast(err);
      if (type === 'load') brewEnded();
      if (type === 'execute') S.flow = 'loaded';
      if (type === 'grinderStart') setGrinding(false);
      if (type === 'brewerStart') setPouring(false);
      refreshDetail(); renderStatus();
      return;
    }
    if (type === 'load') {
      S.flow = 'loaded';
      if (S.screen === 'detail' && S.cur === S.active) $('#md-cup').hidden = false;
    } else if (type === 'execute') {
      if (S.flow !== 'brewing') { S.flow = 'brewing'; S.water = 0; S.brewStart = Date.now(); brewStarted(); }
    } else if (type === 'stop') brewEnded();
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
  function hideBrew() { $('#ov-brew').hidden = true; if (brewFx) brewFx.stop(); }
  $('#bw-pause').addEventListener('click', async () => {
    if (S.flow === 'paused') cmdResult('resume', await link.resume());
    else if (S.flow === 'brewing') cmdResult('pause', await link.pause());
  });
  $('#bw-stop').addEventListener('click', () => confirmBox('توقف التحضير؟', 'المكينة بتوقف الوصفة الحين.', 'وقّف', async () => cmdResult('stop', await link.stop())));

  function brewEnded(why) {
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
    finishFx = Dots.finish($('#finish-canvas'));
    clearTimeout(finishTimer);
    finishTimer = setTimeout(hideFinish, 90 * 1000);
  }
  function hideFinish() { $('#ov-finish').hidden = true; if (finishFx) finishFx.stop(); clearTimeout(finishTimer); }
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
    const g = S.weight;
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
    const src = uid ? find(uid) : null;
    ed = src ? JSON.parse(JSON.stringify(src)) : {
      uid: null, kind: 'mine', id: '', name: 'وصفة جديدة', cup_type: 3, dose_g: 15, grind_size: 45, rpm: 90, grinder_on: true,
      color: CARD_COLORS[lib.length % CARD_COLORS.length], pours: [P(45, 93, 1, 30), P(105, 93, 2, 10), P(100, 93, 2, 0)],
    };
    ed.srcUid = uid;
    $('#ed-title').textContent = uid ? 'تعديل الوصفة' : 'وصفة جديدة';
    $('#ed-delete').hidden = !(src && src.kind === 'mine');
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
    if (src && src.kind === 'mine') {
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
      lib = lib.filter((p) => p !== src); saveLib();
      ed = null; S.cur = null; show('home'); setTab('recipes');
      if (acct.signedIn && src.id) { try { await acct.remove(src.id); } catch (e) { toast('ما انحذفت من الحساب: ' + e.message); } }
    });
  });

  // ---------------------------------------------------------------- account sync
  async function pushRecipe(p) {
    try {
      const id = await acct.push(p);
      p.id = id; p.dirty = false; saveLib();
      if (S.screen === 'detail') buildDetail();
    } catch (e) { toast('ما انحفظت في حساب اكس بلوم: ' + e.message); }
  }
  async function sync(manual) {
    if (!acct.signedIn || syncing) return;
    if (!navigator.onLine) { if (manual) toast('ما فيه إنترنت'); return; }
    syncing = true; syncErr = ''; renderStatus(); renderSettings();
    try {
      for (const p of lib.filter((x) => x.dirty)) await pushRecipe(p);
      const list = await acct.sync();
      mergeAccount(list);
      lastSync = Date.now(); store.set('lastSync', lastSync);
      if (manual) toast(`تمت المزامنة: ${list.length} وصفة`);
    } catch (e) {
      syncErr = e.message;
      if (manual) toast('ما زبطت المزامنة: ' + e.message);
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
    const localOnly = lib.filter((p) => p.kind === 'mine' && !p.id);
    const starters = lib.filter(BUILTIN);
    lib = [...localOnly, ...fresh, ...starters];
    saveLib();
    if (S.cur && !find(S.cur) && S.screen === 'detail') { show('home'); setTab(S.tab); }
  }

  // ---------------------------------------------------------------- settings + login
  // ---------------------------------------------------------------- machine counter
  // Starts from the numbers in the xBloom app (cups made, days in use) and adds every brew
  // this panel finishes. Brews started from the machine's knobs or the phone are not seen here,
  // so tap "update" now and then with the app's numbers.
  const counter = Object.assign({ cups: 2223, days: 374, at: Date.parse('2026-11-14T12:00:00+03:00') }, store.get('counter', {}));
  const saveCounter = () => store.set('counter', counter);
  function renderCounter() {
    const days = counter.days + Math.max(0, Math.floor((Date.now() - counter.at) / 86400000));
    const perDay = days > 0 ? counter.cups / days : 0;
    const one = (x) => (Math.round(x * 10) / 10).toString();
    $('#ct-cups').textContent = counter.cups.toLocaleString('en-US');
    $('#ct-days').textContent = days.toLocaleString('en-US');
    $('#ct-day').textContent = one(perDay);
    $('#ct-week').textContent = one(perDay * 7);
    $('#ct-month').textContent = Math.round(perDay * 30.44).toString();   // average month
    $('#ct-note').textContent = 'من أرقام تطبيق xBloom، ويزيد مع كل كوب من اللوحة';
  }
  $('#btn-counter').addEventListener('click', () => {
    const c = parseInt(prompt('كم كوب مكتوب في تطبيق xBloom؟', counter.cups), 10);
    if (!(c > 0)) return;
    const d = parseInt(prompt('وكم يوم؟', counter.days + Math.max(0, Math.floor((Date.now() - counter.at) / 86400000))), 10);
    if (!(d > 0)) return;
    Object.assign(counter, { cups: c, days: d, at: Date.now() }); saveCounter(); renderCounter();
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
  function renderBackup() {
    $('#st-persist').textContent = persisted == null ? '…' : persisted ? 'محمي، ما ينمسح لحاله' : 'عادي، يضيع لو انمسحت بيانات المتصفح';
    const n = mine().length;
    $('#st-mine').textContent = n ? `· ${n} وصفة` : '· ما عندك وصفات خاصة';
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
    const ok = data.recipes.filter((p) => p && p.uid && p.name && Array.isArray(p.pours) && p.pours.length && !BUILTIN(p));
    let added = 0, updated = 0;
    for (const p of ok) {
      const i = lib.findIndex((q) => q.uid === p.uid);
      if (i >= 0) { lib[i] = p; updated++; } else { lib.unshift(p); added++; }
    }
    const fav = new Set(data.favorites || []);
    lib.forEach((p) => { if (BUILTIN(p) && fav.has(p.uid)) p.favorite = true; });
    if (data.counter && data.counter.cups > counter.cups) { Object.assign(counter, data.counter); saveCounter(); }
    saveLib(); renderSettings(); renderHome();
    toast(`رجّعت ${added} وصفة جديدة${updated ? ` وحدّثت ${updated}` : ''}`);
  });

  function renderSettings() {
    renderCounter();
    renderBackup();
    $('#st-machine').textContent = link.connected ? link.name : { connecting: 'يتصل…', searching: 'يبحث عن ' + (link.name || 'المكينة') + '…' }[link.state] || 'غير مربوطة';
    $('#btn-forget').hidden = !link.name;
    $('#st-acct').textContent = acct.signedIn ? acct.email : 'غير مسجّل';
    $('#btn-login').hidden = acct.signedIn;
    $('#btn-logout').hidden = !acct.signedIn;
    $('#btn-sync').hidden = !acct.signedIn;
    $('#btn-sync').disabled = syncing;
    $('#st-sync').textContent = syncing ? 'يزامن…' : syncErr ? 'خطأ: ' + syncErr
      : lastSync ? 'آخر مزامنة ' + new Date(lastSync).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
    $('#st-awake').checked = prefs.awake;
    $('#st-sim').checked = SIM;
    $$('#st-idle button').forEach((b) => b.classList.toggle('on', +b.dataset.idle === prefs.idleMin));
    $$('#st-write button').forEach((b) => b.classList.toggle('on', b.dataset.write === (link.writeMode || 'auto')));
  }
  $('#btn-connect').addEventListener('click', connectTap);
  $('#cc-btn').addEventListener('click', connectTap);
  async function connectTap() {
    try { await link.pick(); } catch (e) {
      if (e && e.name === 'NotFoundError') return;  // user closed the chooser
      toast(e.message || 'ما قدرت أتصل');
    }
    renderSettings();
  }
  $('#btn-forget').addEventListener('click', () => confirmBox('تفصل المكينة؟', 'بتحتاج تربطها من جديد بعدين.', 'افصل', () => { link.forget(); renderSettings(); updateConnectCard(); }));
  $('#btn-sync').addEventListener('click', () => sync(true));
  $('#btn-login').addEventListener('click', () => { $('#lg-err').textContent = ''; $('#md-login').hidden = false; $('#lg-email').focus(); });
  $('#lg-cancel').addEventListener('click', () => ($('#md-login').hidden = true));
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#lg-go').disabled = true; $('#lg-err').textContent = '';
    try {
      await acct.login($('#lg-email').value.trim(), $('#lg-pass').value);
      $('#md-login').hidden = true; $('#lg-pass').value = '';
      renderSettings();
      await sync(true);
    } catch (err) { $('#lg-err').textContent = err.message; }
    $('#lg-go').disabled = false;
  });
  $('#btn-logout').addEventListener('click', () => confirmBox('تطلع من الحساب؟', 'وصفات الحساب بتنشال من التابلت.', 'اطلع', () => {
    acct.signOut(); lib = lib.filter((p) => BUILTIN(p) || (p.kind === 'mine' && !p.id)); saveLib(); lastSync = 0; store.set('lastSync', 0); renderSettings();
  }));
  $('#st-awake').addEventListener('change', (e) => { prefs.awake = e.target.checked; savePrefs(); keepAwake(); });
  $('#st-sim').addEventListener('change', (e) => { prefs.sim = e.target.checked; savePrefs(); location.reload(); });
  $$('#st-idle button').forEach((b) => b.addEventListener('click', () => { prefs.idleMin = +b.dataset.idle; savePrefs(); renderSettings(); }));
  $$('#st-write button').forEach((b) => b.addEventListener('click', () => { link.setWriteMode(b.dataset.write); renderSettings(); }));
  $('#btn-fullscreen').addEventListener('click', () => document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => {}));
  $('#btn-log').addEventListener('click', () => { $('#log-pre').textContent = link.logLines.join('\n') || '(فاضي)'; $('#md-log').hidden = false; });
  $('#log-close').addEventListener('click', () => ($('#md-log').hidden = true));
  $('#log-copy').addEventListener('click', () => { navigator.clipboard && navigator.clipboard.writeText(link.logLines.join('\n')).then(() => toast('انسخ')); });
  $('#btn-new-recipe').addEventListener('click', () => openEditor(null));

  function updateConnectCard() {
    const card = $('#connect-card');
    const stuck = link.state === 'searching' && Date.now() - S.linkSince > 20000;
    const want = S.screen === 'home' && S.tab === 'home' && (link.state === 'idle' || stuck);
    card.hidden = !want;
    if (!link.supported) $('#cc-sub').textContent = 'هذا المتصفح ما يدعم البلوتوث. افتح الصفحة في Google Chrome.';
    else if (stuck) $('#cc-sub').textContent = 'ما لقيت المكينة. تأكد إنها شغالة وقريبة، واضغط اربط.';
    else $('#cc-sub').textContent = 'شغّل المكينة وقرّب التابلت منها، وبعدين اضغط اربط.';
  }

  // ---------------------------------------------------------------- link events
  link.on('link', (st) => {
    S.linkSince = Date.now();
    if (st !== 'connected') {
      if (S.flow !== 'idle') brewEnded();
      setGrinding(false); setPouring(false);
    }
    renderStatus(); renderSettings(); refreshDetail(); updateConnectCard();
  });
  link.on('weight', (g) => {
    S.weight = g;
    if (Math.abs(g - S.wakeRef) >= 2) { S.wakeRef = g; wake(); }
    renderScale();
  });
  link.on('water', (ml) => (S.water = ml));
  link.on('pour', (i) => (S.pourIdx = i));
  link.on('activity', (a) => {
    S.activity = a;
    wake();
    const brewing = a === 34 || a === 30 || a === 35 || a === 16;
    if (brewing && S.active && (S.flow === 'loaded' || S.flow === 'starting')) {
      S.flow = 'brewing';
      if (!S.brewStart) S.brewStart = Date.now();
      brewStarted();
    }
    if ((a === 1 || a === 36) && S.active && (S.flow === 'brewing' || S.flow === 'paused')) brewEnded(a === 36 ? 'done' : 'home');
    refreshDetail(); renderStatus();
  });
  link.on('done', () => {
    countCup('enjoy');
    const p = find(S.active);
    const ml = S.water > 0 ? S.water : p ? totalWater(p) : 0;
    const ms = S.brewStart ? Date.now() - S.brewStart : 0;
    showFinish(p ? p.name : 'قهوتك', S.weight, ml, ms);
    wake();
    brewEnded('done');
  });
  link.on('abandoned', brewEnded);
  link.on('paused', () => { if (S.flow === 'brewing') S.flow = 'paused'; refreshDetail(); });
  link.on('resumed', () => { if (S.flow === 'paused') S.flow = 'brewing'; refreshDetail(); });
  link.on('fault', (m) => { toast(m); wake(); });
  link.on('pod', () => wake());

  // ---------------------------------------------------------------- idle: clock, go home, wake lock
  let clockFx = null, wakeLock = null;
  function wake() { S.lastTouch = Date.now(); hideClock(); }
  function showClock() {
    if (!$('#ov-clock').hidden) return;
    $('#ov-clock').hidden = false;
    clockFx = Dots.clock($('#clock-canvas'));
    tickIdleClock();
  }
  function hideClock() { if ($('#ov-clock').hidden) return; $('#ov-clock').hidden = true; if (clockFx) clockFx.stop(); }
  function tickIdleClock() {
    if (!clockFx) return;
    const d = new Date();
    clockFx.set(d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
    clockFx.date = d.toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { weekday: 'long', day: 'numeric', month: 'long' });
  }
  $('#ov-clock').addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); wake(); });
  document.addEventListener('pointerdown', () => { S.lastTouch = Date.now(); }, true);

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
    $('#br-timer').textContent = fmtSW(S.pouring ? Date.now() - S.pourStart : 0);
    const pourP = S.pouring ? Math.min(1, (Date.now() - S.pourStart) / (mod.bVol / mod.bFlow * 1000)) : 0;
    $('#br-play').style.setProperty('--p', pourP.toFixed(3));
    if (artFx && S.screen === 'brewer') { if (S.pouring) artFx.view.progress = pourP * 0.85; artFx.view.pouring = S.pouring; }
    $('#sc-timer').textContent = fmtSW(sw.elapsed + (sw.running ? Date.now() - sw.start : 0));
    if (S.pouring && Date.now() - S.pourStart > (mod.bVol / mod.bFlow + 8) * 1000) setPouring(false);
    const idle = Date.now() - S.lastTouch;
    if (!busy() && idle > 30000) {
      const atHome = S.screen === 'home' && S.tab === 'home' && $('#ov-finish').hidden;
      if (!atHome) goHomeIdle();
    }
    if (!busy() && prefs.idleMin > 0 && idle > prefs.idleMin * 60000) showClock();
    if (!$('#ov-clock').hidden) tickIdleClock();
    if (acct.signedIn && !syncing && Date.now() - lastSync > 15 * 60000 && !busy()) sync(false);
    updateConnectCard();
  }, 500);

  // first touch: go full screen (browsers only allow it from a tap)
  document.addEventListener('pointerdown', function fsOnce() {
    document.removeEventListener('pointerdown', fsOnce, true);
    if (!document.fullscreenElement && !matchMedia('(display-mode: fullscreen)').matches && document.documentElement.requestFullscreen)
      document.documentElement.requestFullscreen().catch(() => {});
    keepAwake();
  }, true);

  // ---------------------------------------------------------------- start
  loadLib();
  setTab('home');
  tickClock();
  renderStatus();
  keepAwake();
  link.restore();
  if (acct.signedIn) setTimeout(() => sync(false), 1500);
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  window.__panel = { S, link, lib: () => lib, acct };  // for debugging in the console
})();
