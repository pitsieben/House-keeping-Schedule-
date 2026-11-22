// Landmarks in the Ascent scene: small pixel sprites placed at real heights (meters above / below the ground).
// They only appear when that height is in view, so the scene changes as you climb or sink.
const cache = new Map();
function sprite(key, w, h, draw) {
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  const r = (col, x, y, ww = 1, hh = 1) => { g.fillStyle = col; g.fillRect(x, y, ww, hh); };
  draw(r, g);
  const v = { url: c.toDataURL('image/png'), w, h };
  cache.set(key, v);
  return v;
}
const disc = (r, cx, cy, rad, col) => { for (let y = -rad; y <= rad; y++) for (let x = -rad; x <= rad; x++) if (x * x + y * y <= rad * rad + rad * 0.6) r(col, cx + x, cy + y); };

// ---------- sky ----------
const flock = () => sprite('flock', 22, 9, (r) => {
  const bird = (x, y) => { r('#1f2937', x, y); r('#1f2937', x + 1, y + 1); r('#1f2937', x + 2, y + 1); r('#1f2937', x + 3, y); };
  bird(0, 3); bird(8, 0); bird(15, 5); bird(10, 6);
});
const balloon = (col) => sprite(`balloon${col}`, 7, 13, (r) => {
  disc(r, 3, 3, 3, col); r('#ffffff99', 2, 1); r('#ffffff99', 1, 2); r(col, 3, 7); r('#334155', 3, 8, 1, 5);
});
// a little house lifted by a big bunch of balloons (a nod to "Up")
const upHouse = () => sprite('up', 30, 42, (r) => {
  const cols = ['#ef4444', '#f97316', '#facc15', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#14b8a6'];
  let k = 0;
  for (let y = 0; y < 16; y += 3) for (let x = 1 + (y % 2) * 2; x < 29; x += 4) {
    const dx = x - 15, dy = y - 8;
    if (dx * dx / 196 + dy * dy / 64 <= 1) { disc(r, x, y, 2, cols[k++ % cols.length]); }
  }
  for (let i = 0; i < 9; i++) r('#cbd5e1', 6 + i * 2, 16 + Math.floor(i / 3), 1, 12 - Math.floor(i / 3)); // strings
  r('#7c2d12', 16, 25, 2, 5);                                   // chimney
  for (let i = 0; i < 6; i++) r('#4f6aa8', 9 - i + 6, 28 + i, 2 * i + 2, 1); // roof
  r('#f2d38a', 9, 33, 14, 8); r('#e9c46a', 9, 40, 14, 1);       // walls
  r('#7c4a1e', 15, 36, 3, 5); r('#bde0fe', 11, 35, 3, 3); r('#bde0fe', 19, 35, 3, 3); // door, windows
  r('#ffffff', 8, 41, 16, 1);                                   // porch
});
const smallPlane = () => sprite('cessna', 18, 8, (r) => {
  r('#f8fafc', 2, 3, 13, 3); r('#ef4444', 2, 4, 13, 1); r('#f8fafc', 1, 1, 2, 3); r('#94a3b8', 15, 3, 1, 3); r('#64748b', 16, 1, 1, 6);
  r('#cbd5e1', 6, 2, 6, 1); r('#7dd3fc', 11, 3, 2, 1); r('#334155', 7, 6, 1, 2); r('#334155', 11, 6, 1, 2);
});
const airliner = () => sprite('airliner', 30, 10, (r) => {
  r('#f1f5f9', 3, 4, 24, 3); r('#2563eb', 3, 5, 24, 1); r('#f1f5f9', 27, 5, 2, 1); r('#f1f5f9', 2, 0, 3, 4); r('#2563eb', 2, 0, 2, 2);
  r('#94a3b8', 12, 7, 8, 1); r('#94a3b8', 14, 8, 4, 1); r('#475569', 6, 3, 3, 1);
  for (let x = 8; x < 26; x += 2) r('#0f172a', x, 4);
});
const weatherBalloon = () => sprite('wballoon', 11, 20, (r) => {
  disc(r, 5, 5, 5, '#f8fafc'); r('#e2e8f0', 6, 7, 3, 2); r('#94a3b8', 5, 11, 1, 6); r('#f97316', 3, 17, 5, 3);
});
const debris = (n) => sprite(`debris${n}`, 4, 3, (r) => {
  const c = ['#94a3b8', '#f59e0b', '#cbd5e1', '#64748b'][n % 4];
  r(c, 0, 1, 3, 1); r(c, 1, 0, 1 + (n % 2), 1); if (n % 3 === 0) r('#e2e8f0', 3, 2);
});
const satellite = () => sprite('sat', 19, 7, (r) => {
  r('#1d4ed8', 0, 2, 6, 3); r('#60a5fa', 1, 3, 4, 1); r('#1d4ed8', 13, 2, 6, 3); r('#60a5fa', 14, 3, 4, 1);
  r('#94a3b8', 6, 3, 1, 1); r('#94a3b8', 12, 3, 1, 1); r('#fbbf24', 7, 1, 5, 5); r('#f59e0b', 8, 2, 3, 3); r('#e2e8f0', 9, 0, 1, 1);
});
const iss = () => sprite('iss', 34, 13, (r) => {
  r('#cbd5e1', 2, 6, 30, 1);                                    // truss
  for (const x of [2, 8, 22, 28]) { r('#b45309', x, 0, 4, 5); r('#b45309', x, 8, 4, 5); r('#f59e0b', x + 1, 1, 2, 3); r('#f59e0b', x + 1, 9, 2, 3); }
  r('#f1f5f9', 13, 4, 8, 5); r('#e2e8f0', 15, 3, 4, 7); r('#94a3b8', 17, 2, 1, 9);
});
const moon = () => sprite('moon', 64, 64, (r) => {
  disc(r, 32, 32, 30, '#d1d5db'); disc(r, 30, 30, 26, '#e5e7eb');
  for (const [x, y, s] of [[20, 22, 5], [40, 18, 3], [38, 40, 6], [18, 42, 3], [48, 30, 2], [28, 50, 2]]) { disc(r, x, y, s, '#c3c8d0'); disc(r, x - 1, y - 1, Math.max(1, s - 2), '#b8bec7'); }
  r('#6b7280', 44, 6, 1, 6); r('#ef4444', 45, 6, 4, 2); r('#f8fafc', 45, 8, 4, 1); r('#1d4ed8', 45, 6, 1, 1); // a tiny flag
});

// ---------- underground ----------
const ammonite = () => sprite('ammo', 11, 11, (r) => {
  disc(r, 5, 5, 5, '#c9a66b'); disc(r, 5, 5, 3, '#a8834a'); disc(r, 5, 5, 1, '#c9a66b');
  r('#8a6a3c', 5, 0, 1, 3); r('#8a6a3c', 8, 5, 3, 1); r('#8a6a3c', 5, 8, 1, 3);
});
const dino = () => sprite('dino', 36, 16, (r) => {
  const B = '#f3ead2', S = '#d9cfb4';
  r(B, 6, 5, 20, 2);                                            // spine
  for (let x = 9; x < 24; x += 3) r(S, x, 7, 1, 4);              // ribs
  r(B, 26, 3, 7, 4); r('#5b4636', 31, 4); r(B, 33, 5, 2, 1); r(B, 28, 7, 5, 1); // skull + jaw
  r(B, 0, 6, 6, 1); r(B, 0, 7, 2, 1);                           // tail
  r(B, 10, 7, 1, 7); r(B, 9, 14, 3, 1); r(B, 21, 7, 1, 7); r(B, 20, 14, 3, 1); // legs
});
const chest = () => sprite('chest', 14, 11, (r) => {
  r('#78350f', 0, 3, 14, 8); r('#92400e', 1, 0, 12, 4); r('#b45309', 1, 4, 12, 1);
  r('#fbbf24', 0, 4, 14, 1); r('#fbbf24', 3, 0, 1, 11); r('#fbbf24', 10, 0, 1, 11); r('#fde68a', 6, 4, 2, 3); r('#1f2937', 7, 5);
  r('#fbbf24', 12, 1); r('#fde047', 2, 1); // a glint
});
const nuclear = () => sprite('nuke', 26, 14, (r) => {
  r('#475569', 0, 12, 26, 2);                                   // concrete floor
  for (const x of [1, 9, 17]) {
    r('#facc15', x, 2, 7, 10); r('#ca8a04', x, 2, 7, 1); r('#ca8a04', x, 6, 7, 1); r('#ca8a04', x, 11, 7, 1);
    r('#111827', x + 3, 4); r('#111827', x + 2, 8); r('#111827', x + 4, 8); r('#111827', x + 3, 7); // trefoil-ish mark
  }
  r('#84cc16', 5, 0); r('#a3e635', 13, 1); r('#84cc16', 22, 0);  // glow
});
const mine = () => sprite('mine', 30, 20, (r) => {
  r('#6b4a2b', 0, 0, 3, 20); r('#6b4a2b', 27, 0, 3, 20); r('#7c5a36', 0, 0, 30, 3); // timber frame
  r('#facc15', 14, 3, 2, 2); r('#fde68a', 14, 5, 2, 1);          // lantern
  r('#9ca3af', 3, 18, 24, 1); for (let x = 4; x < 27; x += 4) r('#6b4a2b', x, 19, 2, 1); // rails
  r('#64748b', 8, 11, 12, 6); r('#475569', 8, 16, 12, 1); r('#1f2937', 9, 17, 2, 1); r('#1f2937', 17, 17, 2, 1); // cart
  r('#78716c', 9, 9, 4, 2); r('#a8a29e', 12, 8, 4, 3); r('#fbbf24', 16, 9, 2, 2); // ore + a gold nugget
});
const borehole = () => sprite('drill', 7, 30, (r) => {
  r('#9ca3af', 2, 0, 3, 26); r('#d1d5db', 3, 0, 1, 26); r('#6b7280', 1, 26, 5, 2); r('#f59e0b', 2, 28, 3, 1); r('#f59e0b', 3, 29);
});

// height (m; negative = depth), x (% of the width), sprite, optional animation
const PROPS = [
  { m: 8, x: 14, s: flock, anim: 'fly', dur: 26 }, { m: 18, x: 62, s: flock, anim: 'fly', dur: 34 }, { m: 35, x: 30, s: flock, anim: 'flyl', dur: 30 }, { m: 70, x: 78, s: flock, anim: 'fly', dur: 40 },
  { m: 130, x: 72, s: () => balloon('#ef4444'), anim: 'bob' }, { m: 260, x: 20, s: () => balloon('#3b82f6'), anim: 'bob' }, { m: 480, x: 58, s: () => balloon('#facc15'), anim: 'bob' },
  { m: 950, x: 32, s: upHouse, anim: 'bob' },
  { m: 2600, x: 70, s: smallPlane, anim: 'fly', dur: 22 },
  { m: 9000, x: 30, s: airliner, anim: 'fly', dur: 28 }, { m: 11500, x: 70, s: airliner, anim: 'flyl', dur: 36 },
  { m: 31000, x: 64, s: weatherBalloon, anim: 'bob' },
  ...[260e3, 330e3, 520e3, 900e3, 1.6e6, 3e6, 6e6, 1.1e7, 2.4e7].map((m, i) => ({ m, x: (i * 37 + 11) % 90 + 5, s: () => debris(i), anim: 'drift', dur: 60 + i * 7 })),
  { m: 408e3, x: 42, s: iss, anim: 'drift', dur: 70 },
  { m: 700e3, x: 76, s: satellite, anim: 'drift', dur: 90 }, { m: 2.02e7, x: 18, s: satellite, anim: 'drift', dur: 120 }, { m: 3.58e7, x: 60, s: satellite },
  { m: 3.844e8, x: 50, s: moon, big: true },
  { m: -6, x: 72, s: ammonite }, { m: -40, x: 24, s: dino }, { m: -90, x: 64, s: chest }, { m: -150, x: 18, s: dino },
  { m: -320, x: 70, s: chest }, { m: -600, x: 40, s: nuclear }, { m: -1600, x: 24, s: mine }, { m: -3500, x: 66, s: mine },
  { m: -12262, x: 44, s: borehole },
];

/**
 * HTML for the landmarks currently in view. ptsOf(m) → points for a height in meters, yOf(pts) → pixel row.
 * scale: CSS px per sprite pixel.
 */
export function propsHtml(ptsOf, yOf, height, { scale = 2, minPts = -Infinity, maxPts = Infinity } = {}) {
  let out = '';
  for (const pr of PROPS) {
    const p = ptsOf(pr.m);
    if (p < minPts || p > maxPts) continue;
    const y = yOf(p);
    const sp = pr.s();
    const k = pr.big ? scale * 1.5 : scale;
    if (y < -sp.h * k || y > height + sp.h * k) continue;
    out += `<img class="prop ${pr.anim || ''}" alt="" src="${sp.url}" style="left:${pr.x}%;top:${y.toFixed(1)}px;width:${sp.w * k}px${pr.dur ? `;--d:${pr.dur}s;animation-delay:-${((pr.anim === 'flyl' ? 100 - pr.x : pr.x) + 12) / 124 * pr.dur}s` : ''}">`;
  }
  return out;
}
