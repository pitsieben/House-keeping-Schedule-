// Easter egg: "House Jump", a Doodle-Jump-style climb from Barcelona to space and the Moon.
// Opens as a full-screen overlay. Pure canvas, 180×320 logical pixels, drawn pixelated.
import { drawHero } from './sprites.js';

const W = 180, H = 320;
const GRAV = 0.18, JUMP = -5.3, SPRING = -9.5, SPEED = 2.3;
// altitude: meters = 10 × (10^(px / 1200) − 1) → ~4 m after one screen, 100 m at 1,250 px, 10 km (airliners) at 3,600,
// space (100 km) at 4,800, the Moon (384,400 km) at ~9,100 px
export const PX_PER_DECADE = 1200;
export const metersAt = (px) => 10 * (10 ** (Math.max(0, px) / PX_PER_DECADE) - 1);
const pxAt = (m) => PX_PER_DECADE * Math.log10(m / 10 + 1);
export const SPACE_PX = Math.round(pxAt(1e5));
export const MOON_PX = Math.round(pxAt(3.844e8));
export function fmtAlt(px) {
  const m = metersAt(px);
  if (m < 1000) return `${Math.round(m)} m`;
  const km = m / 1000;
  if (km < 100) return `${km.toFixed(km < 10 ? 1 : 0)} km`;
  return km < 10000 ? `${Math.round(km).toLocaleString('en-US')} km` : `${Math.round(km / 1000)}k km`;
}
// sky colour stops by altitude in px
const SKY = [[0, '#8fd3f7'], [pxAt(100), '#62b2ec'], [pxAt(1e3), '#4b9ae0'], [pxAt(1e4), '#3169ad'], [pxAt(5e4), '#1f3b78'], [SPACE_PX, '#0a0e2c'], [pxAt(1e6), '#05071a'], [MOON_PX, '#03040f']];
const ZONES = [[0, 'Barcelona'], [pxAt(20), 'Rooftops'], [pxAt(100), 'Skyscrapers'], [pxAt(1e3), 'Clouds'], [pxAt(1e4), 'Airliners'], [pxAt(5e4), 'Edge of space'], [SPACE_PX, 'SPACE!'], [pxAt(4e5), 'Orbit'], [pxAt(1e8), 'Near Moon'], [MOON_PX, 'THE MOON']];

const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
function skyAt(px) {
  for (let i = 1; i < SKY.length; i++) {
    if (px <= SKY[i][0]) {
      const [a, ca] = SKY[i - 1], [b, cb] = SKY[i], t = (px - a) / (b - a);
      const [r1, g1, b1] = hex(ca), [r2, g2, b2] = hex(cb);
      return `rgb(${Math.round(r1 + (r2 - r1) * t)},${Math.round(g1 + (g2 - g1) * t)},${Math.round(b1 + (b2 - b1) * t)})`;
    }
  }
  return SKY[SKY.length - 1][1];
}
const zoneAt = (px) => ZONES.reduce((z, [at, n]) => (px >= at ? n : z), ZONES[0][1]);
// deterministic pseudo-random per integer (decor that doesn't jump around)
const hash = (n) => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };

// vertical gap to the next platform: ≤ 58 px, while a normal jump reaches ~75 px (see jumpHeight)
export const platformGap = (topY, diff) => 20 + hash(topY) * (10 + diff * 28);
/** Height reached by a jump with the game's fixed 60 Hz physics step. */
export function jumpHeight(v0 = JUMP) { let vy = v0, y = 0, top = 0; while (vy < 0) { vy += GRAV; y += vy; top = Math.min(top, y); } return -top; }

/**
 * Open the game. opts: { heroKey, outfit, name, color, board: [{name, color, best}], onEnd(bestPx) }
 */
export function openJump(opts) {
  const root = document.createElement('div');
  root.className = 'jump';
  root.innerHTML = `<canvas width="${W}" height="${H}"></canvas><button class="jx" aria-label="Close">✕</button>`;
  document.body.appendChild(root);
  const cv = root.querySelector('canvas'), g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;

  // hero sprite pre-rendered once (16×24)
  const heroCv = document.createElement('canvas'); heroCv.width = 16; heroCv.height = 24;
  drawHero(heroCv.getContext('2d'), opts.heroKey, 0, 0, { outfit: opts.outfit });

  let state = 'ready', raf = 0, last = 0, acc = 0;
  let p, plats, camY, best = 0, topY, lastTouch = 0;
  const input = { left: false, right: false, tilt: 0 };
  const sessionBest = () => Math.max(best, opts.best || 0);

  function reset() {
    p = { x: W / 2 - 8, y: H - 60, vy: JUMP, vx: 0, face: 1 };
    camY = 0; best = 0;
    plats = [{ x: W / 2 - 16, y: H - 30, w: 32, type: 'normal', dx: 0 }];
    topY = H - 30;
    if (opts.startAt) { // testing aid: begin higher up
      p.y -= opts.startAt; camY = p.y - 120;
      plats = [{ x: W / 2 - 16, y: p.y + 30, w: 32, type: 'normal', dx: 0 }]; topY = p.y + 30;
    }
    fill();
  }
  function height() { return Math.round(H - 60 - p.y); }
  function addPlat() {
    const climbed = H - 30 - topY;
    const diff = Math.min(1, climbed / 6000);
    const gap = platformGap(topY, diff);
    topY -= gap;
    const r = hash(topY * 1.3);
    let type = 'normal';
    if (climbed > 700 && r < 0.12 + diff * 0.2) type = 'moving';
    else if (r > 0.94) type = 'spring';
    const w = 32 - Math.round(diff * 8);
    plats.push({ x: Math.floor(hash(topY * 2.7) * (W - w)), y: topY, w, type, dx: type === 'moving' ? (hash(topY) > 0.5 ? 0.6 : -0.6) * (1 + diff) : 0 });
    // decoy: crumbling platform next to it (never the only way up)
    if (climbed > 1500 && hash(topY * 5.1) < 0.25 + diff * 0.2) {
      plats.push({ x: Math.floor(hash(topY * 3.9) * (W - 28)), y: topY + gap / 2, w: 28, type: 'crumble', dx: 0 });
    }
  }
  function fill() { while (topY > camY - 40) addPlat(); }

  function step(dt) {
    // input → horizontal speed
    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0) || Math.max(-1, Math.min(1, input.tilt / 18));
    p.vx += (dir * SPEED - p.vx) * Math.min(1, 0.25 * dt);
    if (dir) p.face = Math.sign(dir);
    p.x += p.vx * dt;
    if (p.x < -12) p.x = W - 4; if (p.x > W - 4) p.x = -12;            // wrap around
    const prevFeet = p.y + 24;
    p.vy += GRAV * dt; p.y += p.vy * dt;
    const feet = p.y + 24;
    for (const pl of plats) {
      if (pl.type === 'moving') { pl.x += pl.dx * dt; if (pl.x < 0 || pl.x + pl.w > W) pl.dx *= -1; }
      if (pl.gone) continue;
      if (p.vy > 0 && prevFeet <= pl.y + 1 && feet >= pl.y && p.x + 13 > pl.x && p.x + 3 < pl.x + pl.w) {
        if (pl.type === 'crumble') { pl.gone = 1; continue; }        // breaks, no bounce
        p.vy = pl.type === 'spring' ? SPRING : JUMP; p.y = pl.y - 24;
        if (pl.type === 'spring') pl.sprung = 8;
      }
      if (pl.sprung) pl.sprung -= dt;
    }
    // camera follows upwards only
    if (p.y < camY + 120) camY = p.y - 120;
    best = Math.max(best, height());
    plats = plats.filter((pl) => pl.y < camY + H + 20);
    fill();
    if (p.y > camY + H + 10) end(false);
    if (best >= MOON_PX) end(true);
  }

  function draw() {
    const alt = Math.max(0, H - 60 - camY - H / 2);                // altitude of the middle of the view
    g.fillStyle = skyAt(alt); g.fillRect(0, 0, W, H);
    // stars above ~30 km, fading in
    const starA = Math.max(0, Math.min(1, (alt - (SPACE_PX - 500)) / 700));
    if (starA > 0) {
      g.fillStyle = `rgba(255,255,255,${starA})`;
      for (let i = 0; i < 40; i++) {
        const band = Math.floor((camY * 0.3) / H);
        for (const b of [band, band + 1]) {
          const sx = Math.floor(hash(i + b * 97) * W), sy = Math.floor(hash(i * 3 + b * 31) * H + b * H - camY * 0.3);
          if (sy >= 0 && sy < H) g.fillRect(sx, sy, 1, 1);
        }
      }
    }
    // clouds between ~300 m and 12 km (parallax 0.6)
    if (alt > pxAt(300) && alt < pxAt(1.2e4)) {
      g.fillStyle = 'rgba(255,255,255,0.85)';
      const base = Math.floor(camY * 0.6 / 80);
      for (let k = base - 1; k <= base + 5; k++) {
        const cy = k * 80 - camY * 0.6, cx = Math.floor(hash(k) * (W - 40));
        g.fillRect(cx, cy, 30, 6); g.fillRect(cx + 6, cy - 4, 16, 4);
      }
    }
    // airliner around 10 km
    if (Math.abs(alt - pxAt(1e4)) < 450) {
      const ax = ((performance.now() / 40) % (W + 40)) - 20, ay = H * 0.3;
      g.fillStyle = '#e5e7eb'; g.fillRect(ax, ay, 18, 3); g.fillRect(ax + 6, ay - 3, 4, 9); g.fillRect(ax + 15, ay - 3, 2, 3);
    }
    // ground + Barcelona skyline at the start
    const groundY = H - 6 - camY;
    if (groundY < H + 40) {
      g.fillStyle = '#b59a68';
      [[20, 30, 4], [26, 42, 5], [32, 52, 6], [39, 44, 5], [45, 34, 4]].forEach(([x, h, w]) => g.fillRect(x, groundY - h, w, h)); // Sagrada Família
      g.fillStyle = '#8a7a5a'; g.fillRect(18, groundY - 14, 34, 14);
      g.fillStyle = '#94a3b8'; [[100, 26], [116, 18], [130, 32], [148, 22]].forEach(([x, h]) => g.fillRect(x, groundY - h, 12, h));
      g.fillStyle = '#3f8a3c'; g.fillRect(0, groundY, W, 4); g.fillStyle = '#6b4a2b'; g.fillRect(0, groundY + 4, W, 40);
    }
    // the Moon at the top
    const moonY = H - 60 - MOON_PX - camY;
    if (moonY > -80 && moonY < H + 80) {
      g.fillStyle = '#e5e7eb'; g.beginPath(); g.arc(W / 2, moonY - 30, 60, Math.PI, 2 * Math.PI); g.fill();
      g.fillStyle = '#cbd5e1'; [[60, -50], [100, -40], [80, -70]].forEach(([x, y]) => g.fillRect(x, moonY + y, 8, 5));
      g.fillStyle = '#e5e7eb'; g.fillRect(0, moonY - 30, W, 40);
    }
    // platforms
    for (const pl of plats) {
      if (pl.gone) continue;
      const y = Math.round(pl.y - camY), x = Math.round(pl.x);
      const col = { normal: ['#22c55e', '#15803d'], moving: ['#38bdf8', '#0369a1'], crumble: ['#b45309', '#78350f'], spring: ['#22c55e', '#15803d'] }[pl.type];
      g.fillStyle = '#101214'; g.fillRect(x - 1, y - 1, pl.w + 2, 6);
      g.fillStyle = col[0]; g.fillRect(x, y, pl.w, 4);
      g.fillStyle = col[1]; g.fillRect(x, y + 3, pl.w, 1);
      if (pl.type === 'crumble') { g.fillStyle = '#101214'; g.fillRect(x + 9, y, 1, 3); g.fillRect(x + 19, y + 1, 1, 3); }
      if (pl.type === 'spring') { const s = pl.sprung > 0 ? 8 : 4; g.fillStyle = '#9ca3af'; g.fillRect(x + pl.w / 2 - 3, y - s, 6, s); g.fillStyle = '#ef4444'; g.fillRect(x + pl.w / 2 - 4, y - s - 1, 8, 2); }
    }
    // hero (flip when moving left)
    g.save();
    const hx = Math.round(p.x), hy = Math.round(p.y - camY);
    if (p.face < 0) { g.translate(hx + 16, hy); g.scale(-1, 1); g.drawImage(heroCv, 0, 0); } else g.drawImage(heroCv, hx, hy);
    g.restore();
    // HUD
    g.fillStyle = '#0009'; g.fillRect(0, 0, W, 16);
    g.font = '8px "Press Start 2P", monospace'; g.textBaseline = 'top';
    g.fillStyle = '#fff'; g.fillText(fmtAlt(best), 4, 4);
    g.fillStyle = '#fbbf24'; const z = zoneAt(best); g.fillText(z, W - 4 - g.measureText(z).width, 4);
  }

  function overlayText(lines) {
    g.fillStyle = '#000b'; g.fillRect(10, 70, W - 20, 30 + lines.length * 14);
    g.textBaseline = 'top';
    lines.forEach(([t, c = '#fff', size = 8], i) => {
      g.font = `${size}px "Press Start 2P", monospace`; g.fillStyle = c;
      g.fillText(t, (W - g.measureText(t).width) / 2, 84 + i * 14);
    });
  }
  function board() {
    const rows = [...(opts.board || [])].filter((r) => r.best > 0).sort((a, b) => b.best - a.best).slice(0, 3);
    return rows.map((r, i) => [`${i + 1}. ${r.name} ${fmtAlt(r.best)}`, r.color]);
  }
  function screen() {
    if (state === 'ready') overlayText([['HOUSE JUMP', '#fbbf24', 10], ['Jump to space!'], [''], ['Tap / tilt / ← →', '#cbd5e1'], [''], ['TAP TO START', '#22c55e'], [''], ...board()]);
    if (state === 'over') overlayText([[won ? 'YOU REACHED' : 'FELL FROM', '#fbbf24', 10], [won ? 'THE MOON!' : fmtAlt(best), '#fff', 10], [''], [newBest ? 'NEW BEST!' : `Best ${fmtAlt(sessionBest())}`, '#22c55e'], [''], ['TAP TO RETRY', '#cbd5e1'], [''], ...board()]);
  }

  let won = false, newBest = false;
  function end(w) {
    if (state !== 'play') return;
    won = w; state = 'over'; newBest = best > (opts.best || 0);
    if (newBest) {
      opts.best = best;
      const me = (opts.board || []).find((r) => r.me); if (me) me.best = best;
      opts.onEnd?.(best);
    }
  }
  function loop(t) {
    // fixed 60 Hz physics steps, so the jump height is the same on every phone/frame rate
    acc += Math.min(5, last ? (t - last) / 16.67 : 1); last = t;
    while (acc >= 1) { if (state === 'play') step(1); acc -= 1; }
    draw(); screen();
    raf = requestAnimationFrame(loop);
  }

  async function startTap() {
    if (state === 'play') return;
    // iOS asks for motion permission on a user gesture; tilting is optional
    try { if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) await DeviceOrientationEvent.requestPermission(); } catch { /* ignore */ }
    reset(); state = 'play';
  }
  // controls
  const half = (e) => { const r = cv.getBoundingClientRect(); return (e.clientX - r.left) < r.width / 2; };
  const onDown = (e) => {
    if (e.target.closest('.jx')) return;
    if (e.type === 'mousedown' && performance.now() - lastTouch < 600) return; // ignore emulated mouse after touch
    if (state !== 'play') { startTap(); return; }
    const pt = e.touches ? e.touches[0] : e;
    if (half(pt)) input.left = true; else input.right = true;
  };
  const onUp = (e) => { if (e.type.startsWith('touch')) lastTouch = performance.now(); if (!e.touches || !e.touches.length) { input.left = input.right = false; } };
  const onKey = (e) => {
    const down = e.type === 'keydown';
    if (['ArrowLeft', 'a', 'A'].includes(e.key)) input.left = down;
    else if (['ArrowRight', 'd', 'D'].includes(e.key)) input.right = down;
    else if (down && (e.key === ' ' || e.key === 'Enter')) startTap();
    else if (down && e.key === 'Escape') close();
  };
  const onTilt = (e) => { if (e.gamma != null) input.tilt = e.gamma; };
  root.addEventListener('touchstart', onDown, { passive: true });
  root.addEventListener('touchend', onUp);
  root.addEventListener('mousedown', onDown);
  window.addEventListener('mouseup', onUp);
  window.addEventListener('keydown', onKey); window.addEventListener('keyup', onKey);
  window.addEventListener('deviceorientation', onTilt);
  function close() {
    cancelAnimationFrame(raf);
    window.removeEventListener('mouseup', onUp);
    window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey);
    window.removeEventListener('deviceorientation', onTilt);
    root.remove();
  }
  root.querySelector('.jx').addEventListener('click', close);
  reset();
  raf = requestAnimationFrame(loop);
  return { close, _debug: () => ({ state, p, best, camY, plats }) };
}
