// Background life for the Ascent scene: hand-drawn pixel sprites (sky, space) and pack items buried underground.
import { art } from './ui.js';

const disc = (r, ring) => {
  const n = r * 2 + 1, rows = [];
  for (let y = 0; y < n; y++) { let s = ''; for (let x = 0; x < n; x++) { const d = Math.hypot(x - r, y - r); s += d > r ? '.' : d > r - 1 ? 'o' : (ring && Math.abs(y - r - (x - r) * 0.25) < 0.7 && Math.abs(x - r) > r - 2 ? 'o' : (x + y) % 7 === 0 && d < r - 2 ? 'c' : 'f'); } rows.push(s); }
  return rows;
};
const sprites = {
  sun: { rows: disc(6), pal: { o: '#f59e0b', f: '#ffe14d', c: '#ffd02a' } },
  moon: { rows: disc(9), pal: { o: '#9aa0ad', f: '#d9dce3', c: '#b4b9c4' } },
  planet: { rows: disc(5), pal: { o: '#7a2e1c', f: '#d9693a', c: '#c05a30' } },
  planet2: { rows: disc(4), pal: { o: '#1e4d7a', f: '#4aa3df', c: '#3b8ec9' } },
  bird: { rows: ['#...#', '.#.#.', '..#..'], pal: { '#': '#1d2733' } },
  plane: { rows: ['...............b..', '..............bb..', '#############bb###.', '###############w##', '..ggg.....ggg.....'.slice(0, 18)], pal: { '#': '#f1f5f9', b: '#3b82f6', g: '#94a3b8', w: '#cbd5e1' } },
  rocket: { rows: ['..r..', '.rrr.', '.www.', '.wbw.', '.www.', '.www.', 'rwwwr', 'rwwwr', '.o.o.', '..o..'], pal: { r: '#ef4444', w: '#f1f5f9', b: '#38bdf8', o: '#fbbf24' } },
  sat: { rows: ['bb.....bb', 'bb..g..bb', 'bb.ggg.bb', 'bb..g..bb'], pal: { b: '#3b82f6', g: '#cbd5e1' } },
  worm: { rows: ['.pp.pp.', 'p..pp.p'], pal: { p: '#e08a9a' } },
  skyline: {
    rows: (() => { const W = 64, H = 26, a = Array.from({ length: H }, () => Array(W).fill('.')); let x = 0, i = 0;
      while (x < W) { const w = 5 + (i * 3) % 5, h = 8 + (i * 7) % 16; for (let y = H - h; y < H; y++) for (let k = 0; k < w - 1 && x + k < W; k++) a[y][x + k] = (y % 3 === 1 && k % 2 === 1 && y < H - 2) ? 'y' : 'b'; x += w; i++; }
      return a.map((r) => r.join('')); })(),
    pal: { b: '#3d5a80', y: '#ffd166' } },
};
const buried = { chest: 2, gem: 2, key: 2, bandage: 2, acorn: 2, log: 2 };

// [sprite, left %, vertical position 0-1, scale]
const BY_LAYER = {
  0: [['sun', 8, 0.05, 3], ['skyline', 0, 1, 0]],
  20: [['bird', 18, 0.3, 3], ['bird', 40, 0.65, 3], ['bird', 72, 0.2, 3]],
  40: [['skyline', 40, 1, 0]],
  80: [['plane', 12, 0.3, 3], ['plane', 62, 0.7, 2]],
  100: [['planet', 70, 0.2, 3], ['rocket', 18, 0.5, 3]],
  112: [['sat', 55, 0.4, 3], ['planet2', 12, 0.2, 3]],
  150: [['sat', 20, 0.5, 3], ['planet', 78, 0.3, 2]],
  172: [['moon', 62, 0.3, 4]],
  '-20': [['worm', 14, 0.5, 3], ['acorn', 50, 0.3], ['worm', 74, 0.7, 3]],
  '-34': [['key', 25, 0.55], ['log', 78, 0.3]],
  '-60': [['gem', 12, 0.4], ['chest', 55, 0.5], ['gem', 84, 0.7]],
  '-91': [['bandage', 20, 0.5], ['gem', 66, 0.4]],
  '-115': [['gem', 40, 0.5]],
};
const cache = {};
const imgOf = (name) => {
  const s = sprites[name]; if (!s) return null;
  return (cache[name] ||= { url: art(s.rows, s.pal), w: s.rows[0].length, h: s.rows.length });
};

export function decorFor(from, h) {
  const list = BY_LAYER[from]; if (!list || h < 14) return '';
  return list.map(([n, x, y, sc = 2]) => {
    const im = imgOf(n);
    if (!im) { const px = 14 * sc; return `<i class="ic n-${n} deco" style="--s:${sc};left:${x}%;top:${Math.max(0, (h - px) * y).toFixed(0)}px"></i>`; }
    if (n === 'skyline') return `<img class="deco sky" alt="" src="${im.url}" style="left:${x}%;bottom:0;width:${im.w * 3}px">`;
    const w = im.w * sc, hh = im.h * sc;
    if (hh > h) return '';
    return `<img class="deco" alt="" src="${im.url}" style="left:${x}%;top:${((h - hh) * y).toFixed(0)}px;width:${w}px">`;
  }).join('');
}
