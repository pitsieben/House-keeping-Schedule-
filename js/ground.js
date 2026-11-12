// Procedural pixel textures for the underground layers and the grass edge (tiles drawn once on a canvas, shown at 2x).
const cache = {};
const rnd = (seed) => { let s = seed; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; };
const N = 96, S = 4; // tile size in texture pixels; S = density factor vs the 48 px design

function tile(seed, paint) {
  const c = document.createElement('canvas'); c.width = N; c.height = N;
  const g = c.getContext('2d'), r = rnd(seed);
  const dot = (col, n, w = 1, h = 1) => { g.fillStyle = col; for (let i = 0; i < n * S; i++) g.fillRect(Math.floor(r() * N), Math.floor(r() * N), w, h); };
  paint(g, r, dot);
  return `url(${c.toDataURL('image/png')})`;
}
const D = 'rgba(0,0,0,.16)', DD = 'rgba(0,0,0,.28)', L = 'rgba(255,255,255,.10)', LL = 'rgba(255,255,255,.2)';
// meandering line that wraps vertically so the tile still repeats
const wiggle = (g, r, col, x0, len, amp = 2) => { g.fillStyle = col; let x = x0; for (let y = 0; y < len; y++) { x += Math.round((r() - 0.5) * amp); g.fillRect(((x % N) + N) % N, y % N, 1, 1); } };

const KINDS = {
  dirt: (g, r, dot) => { dot(D, 70, 2, 1); dot(L, 40); dot(DD, 14, 2, 2);
    for (let i = 0; i < 20; i++) { g.fillStyle = '#8a8d94'; const x = Math.floor(r() * (N - 3)), y = Math.floor(r() * (N - 3)); g.fillRect(x, y, 3, 2); g.fillStyle = '#b9bcc4'; g.fillRect(x, y, 2, 1); }
    for (let i = 0; i < 10; i++) wiggle(g, r, '#3c2814', Math.floor(r() * N), N, 3); },
  sand: (g, r, dot) => { dot(D, 50, 2, 1); dot(L, 60); dot(LL, 12);
    for (let y = 8; y < N; y += 16) { g.fillStyle = 'rgba(0,0,0,.1)'; g.fillRect(0, y, N, 1); g.fillStyle = L; g.fillRect(0, y + 1, N, 1); }
    for (let i = 0; i < 16; i++) { g.fillStyle = '#6f5a3a'; g.fillRect(Math.floor(r() * N), Math.floor(r() * N), 2, 2); } },
  rock: (g, r, dot) => { dot(D, 60, 2, 1); dot(L, 50); dot(DD, 10, 1, 2);
    for (let i = 0; i < 16; i++) { let x = Math.floor(r() * N), y = Math.floor(r() * N); g.fillStyle = DD; for (let k = 0; k < 8; k++) { g.fillRect(x % N, y % N, 1, 1); x += r() < 0.5 ? 1 : 0; y += 1; } }
    for (let y = 0; y < N; y += 24) { g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(0, y, N, 1); } },
  crust: (g, r, dot) => { dot(D, 60, 2, 1); dot(L, 40);
    for (let y = 4; y < N; y += 12) { g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,.14)' : 'rgba(255,200,160,.08)'; g.fillRect(0, y, N, 3); }
    for (let i = 0; i < 12; i++) { const x = Math.floor(r() * (N - 2)), y = Math.floor(r() * (N - 2)); g.fillStyle = '#ffd56a'; g.fillRect(x, y, 1, 1); g.fillStyle = '#fff3c4'; g.fillRect(x + 1, y + 1, 1, 1); } },
  mantle: (g, r, dot) => { dot('rgba(255,120,40,.18)', 26, 3, 2); dot(D, 40, 2, 1); dot('rgba(255,220,120,.2)', 12);
    for (let i = 0; i < 12; i++) wiggle(g, r, 'rgba(255,140,60,.22)', Math.floor(r() * N), N, 4); },
  magma: (g, r, dot) => { dot('rgba(255,230,120,.28)', 30, 2, 2); dot('rgba(120,10,0,.3)', 40, 3, 2); dot('rgba(255,255,200,.4)', 10);
    for (let i = 0; i < 16; i++) { const x = Math.floor(r() * (N - 4)), y = Math.floor(r() * (N - 4)); g.fillStyle = 'rgba(255,200,80,.5)'; g.fillRect(x, y, 3, 3); g.fillStyle = 'rgba(255,245,170,.7)'; g.fillRect(x + 1, y + 1, 1, 1); } },
};

/** CSS background-image value for a layer kind (tiles are 48 px, show them with background-size: 96px). */
export function groundTexture(kind) {
  if (!KINDS[kind]) return '';
  return (cache[kind] ||= tile(kind.length * 131 + kind.charCodeAt(0), KINDS[kind]));
}

/** Grass edge: a 16×8 tile with blades and a dark soil lip; drawn in the given base colour (repeat-x, shown at 2x). */
export function grassEdge(base) {
  const key = `grass${base}`; if (cache[key]) return cache[key];
  const c = document.createElement('canvas'); c.width = 16; c.height = 8; const g = c.getContext('2d');
  const blades = [[0, 3], [2, 5], [3, 2], [5, 4], [7, 6], [8, 3], [10, 5], [12, 2], [13, 4], [15, 6]];
  g.fillStyle = base; g.fillRect(0, 5, 16, 3);
  blades.forEach(([x, h]) => { g.fillRect(x, 8 - h - 1, 1, h); });
  g.fillStyle = 'rgba(255,255,255,.28)'; blades.forEach(([x, h]) => g.fillRect(x, 8 - h - 1, 1, 1));
  g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, 7, 16, 1);
  return (cache[key] = `url(${c.toDataURL('image/png')})`);
}
