// Canvas scenes in Remedy's look: idle clock with Majnoon drifting his car,
// brewing scene (Remedy-drawn dripper + carafe, Majnoon), grinder and scale screens, "ENJOY" finish.
(function (root) {
  'use strict';
  const GROUND = '#131A14';

  class Field {
    constructor(canvas, opts = {}) {
      this.c = canvas; this.ctx = canvas.getContext('2d'); this.raf = 0; this.t0 = 0;
      this.bg = opts.bg || GROUND; this.fps = opts.fps || 0;
    }
    size() {
      const dpr = window.devicePixelRatio || 1, r = this.c.getBoundingClientRect();
      if (this.c.width !== Math.round(r.width * dpr) || this.c.height !== Math.round(r.height * dpr)) {
        this.c.width = Math.round(r.width * dpr); this.c.height = Math.round(r.height * dpr);
      }
      return { w: this.c.width, h: this.c.height, dpr };
    }
    start(draw) {
      this.stop();
      this.t0 = performance.now();
      let last = -1e9;
      const loop = (now) => {
        if (!this.fps || now - last >= 1000 / this.fps) { last = now; draw(this, now - this.t0); }
        this.raf = requestAnimationFrame(loop);
      };
      this.raf = requestAnimationFrame(loop);
    }
    stop() { cancelAnimationFrame(this.raf); this.raf = 0; }
    clear() {
      const { w, h } = this.size();
      if (this.bg === 'none') { this.ctx.clearRect(0, 0, w, h); return; }
      this.ctx.fillStyle = this.bg; this.ctx.fillRect(0, 0, w, h);
    }
  }

  // ---- idle clock ----------------------------------------------------------------
  // Idle clock: big solid time in Concert One, and Al-Majnoon drifting his car around it.
  // The car is Remedy's real Majnoon in his yellow car, captured from the 3D figure on
  // remedy.sa (icons/majnoon-drive.png, side view facing right). Never redrawn in code.
  const CAR = typeof Image !== 'undefined' ? Object.assign(new Image(), { src: 'icons/majnoon-drive.png' }) : null;
  const CAR_AR = 428 / 560;            // height / width of the picture
  const REAR = { x: 0.19, y: 0.95 };   // rear tyre contact point, as a fraction of the picture
  const FRONT = { x: 0.72, y: 0.95 };
  function clock(canvas) {
    const f = new Field(canvas);
    let text = '';
    f.date = '';
    f.set = (hm) => { text = hm; };
    if (document.fonts && document.fonts.load) document.fonts.load('400 100px "Concert One"').catch(() => {});
    const trail = [];      // tyre points: {x, y, side}
    const smoke = [];      // puffs: {x, y, r, a, vx, vy}
    let last = 0, theta = Math.PI / 2;

    // pos: car centre. face: -1..1 (sign = facing right/left, size = how side-on), tilt in rad.
    function carPoint(pt, x, y, cw, ch, face, tilt) {
      const lx = (pt.x - 0.5) * cw * face, ly = (pt.y - 0.5) * ch;
      return [x + lx * Math.cos(tilt) - ly * Math.sin(tilt), y + lx * Math.sin(tilt) + ly * Math.cos(tilt)];
    }
    function drawCar(ctx, x, y, cw, ch, face, tilt) {
      if (!CAR || !CAR.complete || !CAR.naturalWidth) return;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(tilt);
      ctx.scale(face, 1);
      // soft shadow under the car
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath(); ctx.ellipse(0, ch * 0.47, cw * 0.42, ch * 0.06, 0, 0, Math.PI * 2); ctx.fill();
      ctx.drawImage(CAR, -cw / 2, -ch / 2, cw, ch);
      ctx.restore();
    }

    f.start((F, t) => {
      const { w, h } = F.size();
      const ctx = F.ctx;
      const dt = Math.min(50, t - last) || 16; last = t;
      F.clear();

      // clock text, nudged a little each minute so nothing burns in
      const min = new Date().getMinutes();
      const nx = ((min % 7) - 3) * w * 0.004, ny = ((min % 5) - 2) * h * 0.004;
      let fs = h * 0.42;
      ctx.font = `400 ${fs}px "Concert One", sans-serif`;
      const tw = ctx.measureText(text || '00:00').width;
      if (tw > w * 0.66) { fs *= (w * 0.66) / tw; ctx.font = `400 ${fs}px "Concert One", sans-serif`; }
      const cx0 = w / 2 + nx, cy0 = h * 0.47 + ny;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'ltr';
      const parts = (text || '00:00').split(':');
      const colonA = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(t / 700));
      if (parts.length === 2) {
        const wl = ctx.measureText(parts[0]).width, wc = ctx.measureText(':').width, wr = ctx.measureText(parts[1]).width;
        const x0 = cx0 - (wl + wc + wr) / 2;
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(244,199,0,0.88)';
        ctx.fillText(parts[0], x0, cy0);
        ctx.fillText(parts[1], x0 + wl + wc, cy0);
        ctx.fillStyle = `rgba(244,199,0,${colonA})`;
        ctx.fillText(':', x0 + wl, cy0 - fs * 0.04);
      } else ctx.fillText(text, cx0, cy0);
      if (f.date) {
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(157,170,158,0.7)';
        ctx.font = `700 ${Math.round(fs * 0.12)}px "Baloo Bhaijaan 2", sans-serif`;
        ctx.direction = 'rtl';
        ctx.fillText(f.date, cx0, cy0 + fs * 0.5);
        ctx.direction = 'ltr';
      }

      // the drift: an ellipse around the time, speed surging, the car spinning at each end
      const s = Math.min(w, h) / 560;
      const cw = 160 * s, ch = cw * CAR_AR;
      const mx = cw * 0.55, my = ch * 0.6;
      const rx = Math.min(w / 2 - mx, tw / 2 + 120 * s);
      const ry = Math.min(h * 0.47 - my, h * 0.53 - my, fs * 0.6 + 60 * s);
      const surge = 0.55 + 0.45 * Math.sin(t / 2300);
      theta -= (dt / 1000) * (0.75 + 0.75 * surge);            // counter-clockwise on screen
      const depth = 0.86 + 0.14 * (0.5 + 0.5 * Math.sin(theta)); // smaller at the top, like it's further away
      const x = w / 2 + Math.cos(theta) * rx, y = h * 0.47 + Math.sin(theta) * ry;
      const tx = Math.sin(theta), ty = -Math.cos(theta);         // direction of travel (unit-ish)
      // facing: snaps through edge-on at the two ends of the loop, that's the drift spin
      let face = Math.max(-1, Math.min(1, tx * 2.6));
      if (Math.abs(face) < 0.08) face = face < 0 ? -0.08 : 0.08;
      const dir = tx >= 0 ? 1 : -1;
      // tail kicked out: nose dips into the turn, more when the speed surges
      const tilt = dir * (ty * 0.22 - 0.06 * surge) + Math.sin(t / 140) * 0.012;
      const W = cw * depth, H = ch * depth;
      // tyres leave marks, the rear one smokes
      for (const [k, pt] of [['r', REAR], ['f', FRONT]]) {
        const [px, py] = carPoint(pt, x, y, W, H, face, tilt);
        trail.push({ x: px, y: py, side: k });
        if (k === 'r' && Math.random() < 0.35 * surge) smoke.push({ x: px, y: py, r: 8 * s, a: 0.1, vx: -dir * (0.3 + Math.random() * 0.4), vy: -Math.random() * 0.3 });
      }
      while (trail.length > 560) trail.shift();
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.lineWidth = 6 * s;
      for (const side of ['r', 'f']) {
        const pts = trail.filter((p) => p.side === side);
        const chunk = 12;
        for (let i = 0; i < pts.length - 1; i += chunk) {
          ctx.strokeStyle = `rgba(245,248,242,${((i + chunk) / pts.length) * (side === 'r' ? 0.07 : 0.04)})`;
          ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y);
          for (let j = i + 1; j <= Math.min(i + chunk, pts.length - 1); j++) ctx.lineTo(pts[j].x, pts[j].y);
          ctx.stroke();
        }
      }
      for (let i = smoke.length - 1; i >= 0; i--) {
        const p = smoke[i];
        p.r += 0.4 * s * (dt / 16); p.a -= 0.0035 * (dt / 16); p.x += p.vx; p.y += p.vy;
        if (p.a <= 0) { smoke.splice(i, 1); continue; }
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        g.addColorStop(0, `rgba(216,224,213,${p.a})`); g.addColorStop(1, 'rgba(216,224,213,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      }
      drawCar(ctx, x, y, W, H, face, tilt);
    });
    return f;
  }

  // ---- Remedy drawing kit -------------------------------------------------------------
  // Same look as Majnoon on remedy.sa: flat fills, one cel shade, dark ink line, white sticker edge.
  // Coffee is Lol's screen colour. No brown on screen (brown is Lol's print colour only): the shade on the coffee
  // is a see-through ink layer over the same colour.
  const INK = '#1A2219', PAPER = '#F5F8F2', YEL = '#F4C700', YEL_SH = '#D8B200', LOL = '#DE9457', SHADE = 'rgba(26,34,25,.22)';
  const LINES = ['#DE9457', '#CE94CC', '#EE7A84', '#E86C8D', '#F4C700', '#2FA8D5'];
  const POSE = {};
  for (const n of ['write', 'run', 'sleep', 'happy', 'glasses', 'pour']) {
    POSE[n] = typeof Image !== 'undefined' ? Object.assign(new Image(), { src: `icons/majnoon-${n}.png` }) : null;
  }
  const ready = (im) => im && im.complete && im.naturalWidth;
  // path() builds the shape; it gets a white sticker edge, the fill, then the ink line on top
  function sticker(ctx, u, path, fill, opts = {}) {
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    path(); ctx.strokeStyle = PAPER; ctx.lineWidth = (opts.edge || 2.6) * u; ctx.stroke();
    path(); ctx.fillStyle = fill; ctx.fill();
    if (opts.shade) { ctx.save(); path(); ctx.clip(); opts.shade(); ctx.restore(); }
    path(); ctx.strokeStyle = INK; ctx.lineWidth = (opts.ink || 1.1) * u; ctx.stroke();
    ctx.restore();
  }
  function majnoon(ctx, im, cx, footY, height, bob) {
    if (!ready(im)) return;
    const hh = height, ww = hh * im.naturalWidth / im.naturalHeight;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(cx, footY, ww * 0.36, hh * 0.035, 0, 0, Math.PI * 2); ctx.fill();
    ctx.drawImage(im, cx - ww / 2, footY - hh - bob, ww, hh);
  }

  // ---- brewing scene: Remedy-drawn dripper and carafe, Majnoon keeping watch -------------
  // view = {progress 0..1, pouring, grinding, paused}; opts.full draws over the whole canvas
  function brew(canvas, opts = {}) {
    const f = new Field(canvas, opts);
    f.view = { progress: 0, pouring: false, grinding: false, paused: false };
    let level = opts.level || 0;
    if (opts.level) f.view.progress = opts.level;
    const grounds = [];   // falling coffee bits while grinding
    const drops = [];     // drops in the stream
    let kz = 1;           // حجم القمع والسيرفر: يصغرون وقت الصب والمجنون يكبر جنبهم (باريستا)
    f.start((F, t) => {
      const { w, h } = F.size();
      const ctx = F.ctx, v = F.view;
      F.clear();
      level += (v.progress - level) * 0.04;
      // the drawing lives on the right half (info is on the left); in portrait, the top half
      const portrait = h > w, full = !!opts.full;
      const ax = full || portrait ? 0 : w * 0.5, aw = full || portrait ? w : w * 0.5, ah = full ? h : portrait ? h * 0.55 : h;
      const u0 = Math.min(aw, ah) / 100 * (opts.zoom || 1);
      /* وقت الصب (المالك ٢١ نوفمبر: «شلون السيرفر اكبر من المجنون؟»): المجنون باريستا واقف على الأرض بطول ٣ أرباع
         المساحة تقريبًا، والقمع والسيرفر يصغرون لـ٤٠٪ ويقعدون على نفس الأرض، فتجي فوهة إبريقه (٤٣٪ من طوله فوق رجوله)
         فوق القمع على طول. الانتقال ناعم */
      const pourPose = v.pouring && opts.mascot !== false && ready(POSE.pour);
      const top0 = ah * 0.17, ground = Math.min(ah * 0.8, top0 + 66 * u0);
      /* طول المجنون: يملأ المساحة فوق الأرض (٨٥٪) بلا ما يطلع برا فوق أو يمين، وحجم القمع يتحسب منه:
         حافة القمع تحت فوهة الإبريق بـ٥ وحدات */
      const pr = ready(POSE.pour) ? POSE.pour.naturalWidth / POSE.pour.naturalHeight : 1;
      const pourH = Math.min(ground * 0.97, (aw * 0.95) / (pr * 0.922));   // المالك: «خل الرسمه اكبر»
      const pourTip = ground + 1.5 * u0 - 0.429 * pourH;
      const kPour = Math.min(1, Math.max(0.25, (ground - (pourTip + 5 * u0)) / (66 * u0)));
      kz += ((pourPose ? kPour : 1) - kz) * 0.08;
      const u = u0 * kz;
      const top = kz > 0.999 ? top0 : ground - 66 * u;
      const sx = ax + aw * ((opts.cx || 0.3) - 0.2 * Math.min(1, (1 - kz) / Math.max(0.01, 1 - kPour)));     // dripper / carafe centre line (يروح يسار وقت الصب عشان المجنون يوسع)
      const live = !v.paused;

      // coffee server: round glass belly, pouring spout on the left, yellow handle on the right
      const cTop = top + 20 * u, cBot = Math.min(ah * 0.8, cTop + 46 * u);
      const mouth = 26 * u, belly = 44 * u, bellyY = cBot - 15 * u;
      const L = sx - belly / 2, Rr = sx + belly / 2;
      const body = () => {
        ctx.beginPath();
        ctx.moveTo(sx + mouth / 2, cTop);
        ctx.lineTo(sx - mouth / 2, cTop);
        ctx.quadraticCurveTo(sx - mouth / 2 - 4.5 * u, cTop - 2.2 * u, sx - mouth / 2 - 5.5 * u, cTop - 0.6 * u); // spout tip
        ctx.quadraticCurveTo(sx - mouth / 2 - 2 * u, cTop + 2.5 * u, sx - mouth / 2 - 0.5 * u, cTop + 5 * u);
        ctx.bezierCurveTo(L + 2 * u, cTop + 12 * u, L, bellyY - 12 * u, L, bellyY);
        ctx.bezierCurveTo(L, cBot - 4 * u, L + 6 * u, cBot, L + 13 * u, cBot);
        ctx.lineTo(Rr - 13 * u, cBot);
        ctx.bezierCurveTo(Rr - 6 * u, cBot, Rr, cBot - 4 * u, Rr, bellyY);
        ctx.bezierCurveTo(Rr, bellyY - 12 * u, Rr - 2 * u, cTop + 12 * u, sx + mouth / 2 + 0.5 * u, cTop + 5 * u);
        ctx.closePath();
      };
      // shadow on the table
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(sx, cBot + 1.5 * u, belly * 0.58, 2.2 * u, 0, 0, Math.PI * 2); ctx.fill();
      // handle: a fat yellow loop, drawn before the glass so the glass sits over its ends
      ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const hx = Rr - 3 * u;
      const hp = () => { ctx.beginPath(); ctx.moveTo(hx - 4 * u, cTop + 7 * u); ctx.bezierCurveTo(hx + 13 * u, cTop + 5 * u, hx + 14 * u, bellyY - 2 * u, hx, bellyY - 1 * u); };
      hp(); ctx.strokeStyle = PAPER; ctx.lineWidth = 7.6 * u; ctx.stroke();
      hp(); ctx.strokeStyle = INK; ctx.lineWidth = 5.4 * u; ctx.stroke();
      hp(); ctx.strokeStyle = YEL; ctx.lineWidth = 3.2 * u; ctx.stroke();
      ctx.restore();
      const fillTop = cBot - 1.5 * u - level * (cBot - cTop - 12 * u);
      sticker(ctx, u, body, 'rgba(245,248,242,0.12)', {
        shade: () => {
          if (level > 0.005) {
            ctx.fillStyle = LOL;
            ctx.beginPath(); ctx.moveTo(L - 4 * u, ah);
            for (let x = L - 4 * u; x <= Rr + 4 * u; x += 2 * u) ctx.lineTo(x, fillTop + Math.sin(t / 380 + x / (5 * u)) * 0.8 * u * (live ? 1 : 0.3));
            ctx.lineTo(Rr + 4 * u, ah); ctx.closePath(); ctx.fill();
            ctx.fillStyle = SHADE;                                                      // cel shade on the coffee
            ctx.beginPath(); ctx.ellipse(Rr + 2 * u, cBot, belly * 0.42, (cBot - fillTop) + 4 * u, 0, 0, Math.PI * 2); ctx.fill();
          }
          // glass glints: a long curved one on the left belly, a dot near the top
          ctx.strokeStyle = 'rgba(245,248,242,0.55)'; ctx.lineCap = 'round'; ctx.lineWidth = 2.2 * u;
          ctx.beginPath(); ctx.moveTo(L + 6 * u, cTop + 16 * u); ctx.quadraticCurveTo(L + 3.2 * u, bellyY, L + 7 * u, cBot - 6 * u); ctx.stroke();
          ctx.fillStyle = 'rgba(245,248,242,0.55)';
          ctx.beginPath(); ctx.arc(L + 8 * u, cTop + 11 * u, 1.2 * u, 0, Math.PI * 2); ctx.fill();
          // measuring marks on the right
          ctx.strokeStyle = 'rgba(245,248,242,0.4)'; ctx.lineWidth = 0.9 * u;
          for (let k = 1; k <= 3; k++) {
            const yy = cBot - k * 9 * u, w0 = k === 2 ? 6 * u : 4 * u;
            ctx.beginPath(); ctx.moveTo(Rr - 9 * u - w0, yy); ctx.lineTo(Rr - 9 * u, yy); ctx.stroke();
          }
        },
      });
      // the rim: a thin glass band on the mouth
      const rimP = () => { ctx.beginPath(); ctx.roundRect(sx - mouth / 2 - 0.5 * u, cTop - 1.4 * u, mouth + 1 * u, 2.4 * u, 1.2 * u); };
      sticker(ctx, u, rimP, 'rgba(245,248,242,0.25)', { edge: 1.8, ink: 0.9 });

      // stream from the dripper tip down to the coffee
      const tipY = top + 21 * u;
      if (v.pouring && live) {
        if (Math.random() < 0.5) drops.push({ y: tipY, v: 0.6 * u });
        ctx.strokeStyle = LOL; ctx.lineWidth = 1.8 * u; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(sx, tipY); ctx.lineTo(sx, tipY + 6 * u); ctx.stroke();
      }
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i];
        if (live) { d.v += 0.08 * u; d.y += d.v; }
        if (d.y > fillTop - 1 * u) { drops.splice(i, 1); continue; }
        ctx.fillStyle = LOL; ctx.beginPath(); ctx.ellipse(sx, d.y, 1.1 * u, 1.9 * u, 0, 0, Math.PI * 2); ctx.fill();
      }

      // dripper: yellow cone (Remedy capsule yellow) on a small foot, wide rim on top
      const dTopW = 34 * u, dBotW = 10 * u, dH = 15 * u, dy0 = top + 3 * u;
      const cone = () => {
        ctx.beginPath();
        ctx.moveTo(sx - dTopW / 2, dy0);
        ctx.lineTo(sx + dTopW / 2, dy0);
        ctx.lineTo(sx + dBotW / 2, dy0 + dH);
        ctx.lineTo(sx - dBotW / 2, dy0 + dH);
        ctx.closePath();
      };
      const foot = () => { ctx.beginPath(); ctx.roundRect(sx - 13 * u, dy0 + dH - 0.5 * u, 26 * u, 2.8 * u, 1.4 * u); };
      sticker(ctx, u, foot, YEL_SH);
      sticker(ctx, u, cone, YEL, {
        shade: () => {
          ctx.fillStyle = YEL_SH;
          ctx.beginPath(); ctx.moveTo(sx + dTopW * 0.18, dy0); ctx.lineTo(sx + dTopW, dy0); ctx.lineTo(sx + dBotW, dy0 + dH); ctx.lineTo(sx + dBotW * 0.2, dy0 + dH); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = 'rgba(26,34,25,0.35)'; ctx.lineWidth = 1.2 * u;            // ribs
          for (const k of [-0.22, 0, 0.22]) { ctx.beginPath(); ctx.moveTo(sx + k * dTopW, dy0 + 4 * u); ctx.lineTo(sx + k * dBotW, dy0 + dH - 2 * u); ctx.stroke(); }
        },
      });
      const rim = () => { ctx.beginPath(); ctx.roundRect(sx - dTopW / 2 - 2.5 * u, dy0 - 3 * u, dTopW + 5 * u, 3.8 * u, 1.9 * u); };
      // coffee bed in the dripper, once there is coffee
      if (v.grinding || v.pouring || level > 0.01) {
        const bed = () => { ctx.beginPath(); ctx.ellipse(sx, dy0 - 3 * u, dTopW * 0.4, 2.6 * u, 0, Math.PI, 0); ctx.closePath(); };
        ctx.fillStyle = LOL; bed(); ctx.fill();
        if (v.pouring) { ctx.fillStyle = SHADE; bed(); ctx.fill(); }
      }
      sticker(ctx, u, rim, YEL);
      // grounds falling in while grinding
      if (v.grinding && live && Math.random() < 0.7) grounds.push({ x: sx + (Math.random() - 0.5) * 12 * u, y: dy0 - 16 * u, v: 0.3 * u });
      for (let i = grounds.length - 1; i >= 0; i--) {
        const g = grounds[i];
        if (live) { g.v += 0.05 * u; g.y += g.v; }
        if (g.y > dy0 - 4 * u) { grounds.splice(i, 1); continue; }
        ctx.fillStyle = LOL; ctx.beginPath(); ctx.arc(g.x, g.y, 0.9 * u, 0, Math.PI * 2); ctx.fill();
      }
      // a little steam over the dripper while pouring
      if (v.pouring) {
        ctx.save(); ctx.lineCap = 'round'; ctx.lineWidth = 1.6 * u;
        for (const k of [-1, 0, 1]) {
          const ph = (t / 1600 + k * 0.33) % 1;
          ctx.strokeStyle = `rgba(245,248,242,${0.22 * Math.sin(ph * Math.PI)})`;
          ctx.beginPath();
          for (let j = 0; j <= 10; j++) {
            const yy = dy0 - 6 * u - ph * 8 * u - j * 0.9 * u;
            const xx = sx + k * 9 * u + Math.sin(j * 0.7 + t / 500 + k) * 2 * u;
            j ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy);
          }
          ctx.stroke();
        }
        ctx.restore();
      }

      // Majnoon next to the carafe: running while it grinds, writing notes while it pours, asleep when paused
      const mx = ax + aw * 0.8, foot2 = cBot + 1.5 * u;
      if (opts.mascot === false) { /* home tile: no Majnoon */ } else if (v.paused) {
        majnoon(ctx, POSE.sleep, mx - 2 * u, foot2, 26 * u, 0);
        ctx.fillStyle = 'rgba(245,248,242,0.7)'; ctx.textAlign = 'center'; ctx.direction = 'ltr';
        for (let k = 0; k < 3; k++) {
          const ph = (t / 1800 + k / 3) % 1;
          ctx.globalAlpha = Math.sin(ph * Math.PI);
          ctx.font = `400 ${(4 + k * 1.6) * u}px "Concert One", sans-serif`;
          ctx.fillText('z', mx + 6 * u + ph * 8 * u, foot2 - 26 * u - ph * 16 * u);
        }
        ctx.globalAlpha = 1;
      } else if (v.grinding) {
        majnoon(ctx, POSE.run, mx, foot2, 40 * u, Math.abs(Math.sin(t / 110)) * 3 * u);
      } else if (v.pouring && ready(POSE.pour)) {
        /* المجنون باريستا وقت التقطير (المالك ٢١ نوفمبر): صورته ماسك إبريق التقطير (icons/majnoon-pour.png، من كودكس مثل
           باقي الوضعيات)، الفوهة فوق القمع تدوّر دوائر صغيرة، والماء ينزل منها على البن. الفوهة في الصورة عند ٧٫٨٪ من العرض
           و٥٧٪ من الطول */
        const im = POSE.pour;
        const swirl = live ? t / 700 : 0;
        const tipX = sx + 2 * u + Math.cos(swirl) * 3 * u;
        const tipY = dy0 - 3 * u - 5 * u0 + Math.sin(swirl) * 0.5 * u0;          // فوق حافة القمع بشوي
        const hh = Math.min(pourH, Math.max(20 * u0, (ground + 1.5 * u0 - tipY) / 0.429)), ww = hh * im.naturalWidth / im.naturalHeight;
        const bedY = dy0 - 3 * u;
        ctx.save(); ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(190,225,240,0.9)'; ctx.lineWidth = 1.1 * u;
        ctx.beginPath(); ctx.moveTo(tipX, tipY);
        for (let j = 1; j <= 6; j++) ctx.lineTo(tipX + Math.sin(t / 90 + j) * 0.25 * u, tipY + (bedY - tipY) * j / 6);
        ctx.stroke(); ctx.restore();
        ctx.drawImage(im, tipX - ww * 0.078, tipY - hh * 0.571 + Math.sin(t / 380) * 0.4 * u, ww, hh);
      } else if (v.pouring) {
        majnoon(ctx, POSE.write, mx, foot2, 40 * u, Math.abs(Math.sin(t / 420)) * 1.2 * u);
      } else {
        majnoon(ctx, POSE.glasses, mx, foot2, 40 * u, Math.abs(Math.sin(t / 600)) * 0.8 * u);
      }
    });
    return f;
  }

  // ---- finish: "ENJOY" in Concert One, Majnoon celebrating, line-colour confetti ----------
  function finish(canvas) {
    const f = new Field(canvas);
    const bits = [];
    f.start((F, t) => {
      const { w, h } = F.size();
      const ctx = F.ctx;
      F.clear();
      const u = Math.min(w, h) / 100;
      // confetti in the six line colours
      if (t < 6000 && Math.random() < 0.6) bits.push({ x: Math.random() * w, y: -4 * u, vy: (0.4 + Math.random() * 0.5) * u, vx: (Math.random() - 0.5) * 0.4 * u, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.15, c: LINES[(Math.random() * 6) | 0] });
      for (let i = bits.length - 1; i >= 0; i--) {
        const b = bits[i];
        b.y += b.vy; b.x += b.vx + Math.sin(t / 400 + i) * 0.15 * u; b.r += b.vr;
        if (b.y > h + 5 * u) { bits.splice(i, 1); continue; }
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.r); ctx.fillStyle = b.c;
        ctx.fillRect(-1.2 * u, -0.6 * u, 2.4 * u, 1.2 * u); ctx.restore();
      }
      // ENJOY, letters popping in one by one, yellow with the white sticker edge and ink line
      const word = 'ENJOY';
      const fs = Math.min(h * 0.22, w * 0.16);
      ctx.font = `400 ${fs}px "Concert One", sans-serif`;
      ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.direction = 'ltr'; ctx.lineJoin = 'round';
      const widths = [...word].map((ch) => ctx.measureText(ch).width);
      const total = widths.reduce((a, b) => a + b, 0);
      const cy = h * 0.22;
      let x = w / 2 - total / 2;
      [...word].forEach((ch, i) => {
        const k = Math.min(1, Math.max(0, (t - i * 110) / 380));
        const pop = k < 1 ? 1 - Math.pow(1 - k, 3) * Math.cos(k * 9) * 0.6 : 1;
        const bob = Math.sin(t / 500 + i * 0.8) * fs * 0.02;
        ctx.save();
        ctx.translate(x + widths[i] / 2, cy + bob); ctx.scale(pop, pop); ctx.globalAlpha = k;
        ctx.strokeStyle = PAPER; ctx.lineWidth = fs * 0.09; ctx.strokeText(ch, -widths[i] / 2, 0);
        ctx.fillStyle = YEL; ctx.fillText(ch, -widths[i] / 2, 0);
        ctx.strokeStyle = INK; ctx.lineWidth = fs * 0.035; ctx.strokeText(ch, -widths[i] / 2, 0);
        ctx.restore();
        x += widths[i];
      });
      // Majnoon jumping for joy under the word
      const jump = Math.max(0, Math.sin(t / 260)) * 4 * u;
      majnoon(ctx, POSE.happy, w / 2, h * 0.7, h * 0.33, jump);
    });
    return f;
  }

  // ---- grinder screen: Remedy-drawn grinder, grounds falling into the cup while it grinds ----
  // get() returns {grinding}
  function grinder(canvas, get, opts = {}) {
    const f = new Field(canvas, opts);
    const grounds = [];
    let level = opts.level || 0.12, spin = 0;
    f.start((F, t) => {
      const { w, h } = F.size();
      const ctx = F.ctx; F.clear();
      const on = !!(get() || {}).grinding;
      const u = opts.tile ? Math.min(w / 52, h / 100) * 0.86 : Math.min(w / 1.25, h) / 100;
      const cx0 = w * (opts.cx || 0.36), y0 = h / 2 - 46 * u;
      const jit = on ? Math.sin(t / 23) * 0.35 * u : 0, cx = cx0 + jit;
      if (on) { spin += 0.35; level = Math.min(0.92, level + 0.0016); }
      const baseY = y0 + 86 * u;
      // shadow
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(cx0, baseY + 6.5 * u, 24 * u, 2.4 * u, 0, 0, Math.PI * 2); ctx.fill();
      // back column that carries the body down to the base
      sticker(ctx, u, () => { ctx.beginPath(); ctx.roundRect(cx - 13 * u, y0 + 48 * u, 26 * u, 40 * u, 3 * u); }, YEL_SH);
      // base
      sticker(ctx, u, () => { ctx.beginPath(); ctx.roundRect(cx0 - 21 * u, baseY, 42 * u, 6 * u, 3 * u); }, YEL, {
        shade: () => { ctx.fillStyle = YEL_SH; ctx.fillRect(cx0 - 21 * u, baseY + 3.6 * u, 42 * u, 3 * u); },
      });
      // hopper: glass with beans, yellow lid
      const hTop = y0 + 4 * u, hBot = y0 + 22 * u;
      const hopper = () => {
        ctx.beginPath();
        ctx.moveTo(cx - 15 * u, hTop); ctx.lineTo(cx + 15 * u, hTop);
        ctx.lineTo(cx + 8 * u, hBot); ctx.lineTo(cx - 8 * u, hBot); ctx.closePath();
      };
      sticker(ctx, u, hopper, 'rgba(245,248,242,0.12)', {
        shade: () => {
          ctx.fillStyle = LOL; ctx.fillRect(cx - 16 * u, hTop + 7 * u, 32 * u, 16 * u);
          ctx.fillStyle = SHADE; ctx.fillRect(cx - 16 * u, hTop + 7 * u, 32 * u, 16 * u);
          ctx.strokeStyle = INK; ctx.lineWidth = 0.6 * u;
          for (let k = 0; k < 14; k++) {
            const bx = cx + ((k * 37) % 26 - 13) * u * 0.9, by = hTop + 8 * u + ((k * 53) % 10) * u + (on ? Math.sin(t / 60 + k) * 0.4 * u : 0);
            ctx.fillStyle = LOL;
            ctx.beginPath(); ctx.ellipse(bx, by, 2 * u, 1.4 * u, k, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          }
          ctx.strokeStyle = 'rgba(245,248,242,0.55)'; ctx.lineWidth = 1.6 * u; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(cx - 11 * u, hTop + 3 * u); ctx.lineTo(cx - 7 * u, hBot - 3 * u); ctx.stroke();
        },
      });
      sticker(ctx, u, () => { ctx.beginPath(); ctx.roundRect(cx - 16.5 * u, hTop - 4 * u, 33 * u, 4.4 * u, 2.2 * u); }, YEL);
      sticker(ctx, u, () => { ctx.beginPath(); ctx.roundRect(cx - 3 * u, hTop - 6.5 * u, 6 * u, 3 * u, 1.5 * u); }, YEL_SH);
      // body with the dial
      const bTop = y0 + 22 * u, bBot = y0 + 56 * u;
      sticker(ctx, u, () => { ctx.beginPath(); ctx.roundRect(cx - 14 * u, bTop, 28 * u, bBot - bTop, 4 * u); }, YEL, {
        shade: () => { ctx.fillStyle = YEL_SH; ctx.fillRect(cx + 6 * u, bTop, 10 * u, bBot - bTop); },
      });
      const dy = bTop + 13 * u;
      sticker(ctx, u, () => { ctx.beginPath(); ctx.arc(cx, dy, 5.5 * u, 0, Math.PI * 2); }, INK, { ink: 0.6 });
      ctx.save(); ctx.translate(cx, dy); ctx.rotate(spin);
      ctx.strokeStyle = PAPER; ctx.lineWidth = 1.4 * u; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, -1 * u); ctx.lineTo(0, -4 * u); ctx.stroke();
      ctx.restore();
      if (on) { ctx.fillStyle = '#8FD694'; ctx.beginPath(); ctx.arc(cx, bTop + 25 * u, 1.2 * u, 0, Math.PI * 2); ctx.fill(); }
      // spout
      sticker(ctx, u, () => { ctx.beginPath(); ctx.roundRect(cx - 3.5 * u, bBot - 1 * u, 7 * u, 6 * u, 1.5 * u); }, INK, { ink: 0.6 });
      // catch cup on the base
      const cTop = y0 + 68 * u, cBot = baseY;
      const cup = () => {
        ctx.beginPath();
        ctx.moveTo(cx0 - 9.5 * u, cTop); ctx.lineTo(cx0 + 9.5 * u, cTop);
        ctx.lineTo(cx0 + 8 * u, cBot - 1.5 * u); ctx.quadraticCurveTo(cx0 + 8 * u, cBot, cx0 + 6.5 * u, cBot);
        ctx.lineTo(cx0 - 6.5 * u, cBot); ctx.quadraticCurveTo(cx0 - 8 * u, cBot, cx0 - 8 * u, cBot - 1.5 * u);
        ctx.closePath();
      };
      const gTop = cBot - level * (cBot - cTop - 3 * u);
      sticker(ctx, u, cup, 'rgba(245,248,242,0.14)', {
        shade: () => {
          ctx.fillStyle = LOL;
          ctx.beginPath(); ctx.moveTo(cx0 - 12 * u, cBot + u); ctx.lineTo(cx0 - 12 * u, gTop + 1.5 * u);
          ctx.quadraticCurveTo(cx0, gTop - 2 * u, cx0 + 12 * u, gTop + 1.5 * u); ctx.lineTo(cx0 + 12 * u, cBot + u); ctx.closePath(); ctx.fill();
          ctx.fillStyle = SHADE; ctx.fillRect(cx0 + 3 * u, gTop, 8 * u, cBot - gTop + u);
          ctx.strokeStyle = 'rgba(245,248,242,0.5)'; ctx.lineWidth = 1.4 * u; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(cx0 - 6 * u, cTop + 3 * u); ctx.lineTo(cx0 - 5.5 * u, cBot - 4 * u); ctx.stroke();
        },
      });
      // grounds falling from the spout
      if (on && Math.random() < 0.8) grounds.push({ x: cx + (Math.random() - 0.5) * 3 * u, y: bBot + 5 * u, v: 0.4 * u });
      for (let i = grounds.length - 1; i >= 0; i--) {
        const g = grounds[i]; g.v += 0.06 * u; g.y += g.v;
        if (g.y > gTop) { grounds.splice(i, 1); continue; }
        ctx.fillStyle = LOL; ctx.beginPath(); ctx.arc(g.x, g.y, 0.8 * u, 0, Math.PI * 2); ctx.fill();
      }
      // Majnoon: running while it grinds, otherwise watching
      const mx = w * 0.8, foot = baseY + 6 * u;
      if (opts.mascot === false) return;
      if (on) majnoon(ctx, POSE.run, mx, foot, 40 * u, Math.abs(Math.sin(t / 110)) * 3 * u);
      else majnoon(ctx, POSE.glasses, mx, foot, 40 * u, Math.abs(Math.sin(t / 600)) * 0.8 * u);
    });
    return f;
  }

  // ---- scale screen: Remedy-drawn kitchen scale, a mug on it once there is weight ----
  // get() returns the weight in grams
  function scale(canvas, get, opts = {}) {
    const f = new Field(canvas, opts);
    let shown = opts.tile ? +get() || 0 : 0;
    f.start((F, t) => {
      const { w, h } = F.size();
      const ctx = F.ctx; F.clear();
      const g = +get() || 0;
      shown += (g - shown) * 0.12;
      const u = opts.tile ? Math.min(w / 92, h / 70) : Math.min(w / 1.25, h) / 100;
      const cx = w * (opts.cx || 0.38), baseTop = h / 2 + 16 * u;
      const press = Math.min(1.2, Math.max(0, shown) / 250) * u;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(cx, baseTop + 15 * u, 36 * u, 2.6 * u, 0, 0, Math.PI * 2); ctx.fill();
      // feet and base
      for (const k of [-1, 1]) sticker(ctx, u, () => { ctx.beginPath(); ctx.roundRect(cx + k * 24 * u - 4 * u, baseTop + 11 * u, 8 * u, 3.5 * u, 1.2 * u); }, INK, { ink: 0.6 });
      sticker(ctx, u, () => { ctx.beginPath(); ctx.roundRect(cx - 34 * u, baseTop, 68 * u, 12.5 * u, 4 * u); }, YEL, {
        shade: () => { ctx.fillStyle = YEL_SH; ctx.fillRect(cx - 35 * u, baseTop + 8.5 * u, 70 * u, 5 * u); },
      });
      // display
      sticker(ctx, u, () => { ctx.beginPath(); ctx.roundRect(cx - 14 * u, baseTop + 2.6 * u, 28 * u, 7 * u, 1.8 * u); }, INK, { ink: 0.6 });
      ctx.save(); ctx.direction = 'ltr'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#8FD694'; ctx.font = `400 ${5.2 * u}px "Concert One", sans-serif`;
      ctx.fillText(Math.max(0, shown).toFixed(1) + 'g', cx, baseTop + 6.3 * u);
      ctx.restore();
      // plate
      const plateY = baseTop - 4.6 * u + press;
      sticker(ctx, u, () => { ctx.beginPath(); ctx.roundRect(cx - 37 * u, plateY, 74 * u, 3.6 * u, 1.8 * u); }, '#D8E0D5');
      // mug once something is on the plate
      if (shown > 3) {
        const mTop = plateY - 25 * u, mBot = plateY - 0.2 * u;
        ctx.save(); ctx.lineCap = 'round';
        const hp = () => { ctx.beginPath(); ctx.moveTo(cx + 9 * u, mTop + 6 * u); ctx.bezierCurveTo(cx + 19 * u, mTop + 5 * u, cx + 19 * u, mTop + 19 * u, cx + 9 * u, mTop + 18 * u); };
        hp(); ctx.strokeStyle = PAPER; ctx.lineWidth = 6.4 * u; ctx.stroke();
        hp(); ctx.strokeStyle = INK; ctx.lineWidth = 4.6 * u; ctx.stroke();
        hp(); ctx.strokeStyle = PAPER; ctx.lineWidth = 2.6 * u; ctx.stroke();
        ctx.restore();
        sticker(ctx, u, () => { ctx.beginPath(); ctx.roundRect(cx - 12 * u, mTop, 24 * u, mBot - mTop, [2 * u, 2 * u, 6 * u, 6 * u]); }, PAPER, {
          shade: () => {
            ctx.fillStyle = '#D8E0D5'; ctx.fillRect(cx + 4 * u, mTop, 9 * u, mBot - mTop);
            ctx.fillStyle = YEL; ctx.fillRect(cx - 13 * u, mTop + 9 * u, 26 * u, 5 * u);   // yellow band
          },
        });
        ctx.fillStyle = LOL; ctx.strokeStyle = INK; ctx.lineWidth = 0.8 * u;
        ctx.beginPath(); ctx.ellipse(cx, mTop + 0.6 * u, 10.5 * u, 2 * u, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        // steam
        ctx.save(); ctx.lineCap = 'round'; ctx.lineWidth = 1.5 * u;
        for (const k of [-1, 1]) {
          const ph = (t / 1700 + (k + 1) * 0.25) % 1;
          ctx.strokeStyle = `rgba(245,248,242,${0.25 * Math.sin(ph * Math.PI)})`;
          ctx.beginPath();
          for (let j = 0; j <= 10; j++) {
            const yy = mTop - 3 * u - ph * 8 * u - j * 0.9 * u, xx = cx + k * 4.5 * u + Math.sin(j * 0.7 + t / 500 + k) * 1.8 * u;
            j ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy);
          }
          ctx.stroke();
        }
        ctx.restore();
      }
      if (opts.mascot !== false) majnoon(ctx, POSE.glasses, w * 0.82, baseTop + 14.5 * u, 40 * u, Math.abs(Math.sin(t / 600)) * 0.8 * u);
    });
    return f;
  }

  root.Dots = { clock, brew, finish, grinder, scale };
})(typeof self !== 'undefined' ? self : this);
