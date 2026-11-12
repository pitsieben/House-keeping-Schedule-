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
// nature sprites cut from the house pack sheet: [x, y, w, h]
const SHEET = new URL('../img/nature/exterior.png', import.meta.url).href, SHEET_W = 240;
const NAT = {
  bigTree: [155, 467, 72, 77], tree: [179, 558, 57, 65], round: [65, 320, 62, 78], apple: [1, 324, 61, 73], bush: [6, 455, 36, 34], bush2: [3, 610, 43, 43],
  shrub: [49, 626, 29, 27], shroom: [64, 548, 32, 41], shrooms: [69, 595, 24, 25], scarecrow: [4, 547, 52, 56], well: [1, 498, 35, 41],
  stump: [96, 598, 29, 22], stump2: [165, 635, 37, 28], log: [88, 630, 36, 22], rock: [7, 409, 34, 32], rockS: [49, 403, 30, 28],
  boulderA: [0, 656, 54, 63], boulderB: [69, 656, 53, 60], boulderC: [132, 672, 38, 45], boulderD: [179, 672, 40, 47], crystalA: [178, 729, 29, 30], crystalB: [210, 729, 29, 30],
};

// [sprite, left %, vertical position 0-1, scale]; nature sprites ('n:name') with y = 'b' stand on the bottom edge of the band
const BY_LAYER = {
  0: [['sun', 8, 0.05, 3], ['n:apple', 1, 'b', 1], ['n:shrooms', 31, 'b', 2], ['n:bush', 43, 'b', 1], ['n:scarecrow', 58, 'b', 1], ['n:bigTree', 76, 'b', 1]],
  20: [['bird', 18, 0.3, 3], ['bird', 40, 0.65, 3], ['bird', 72, 0.2, 3]],
  40: [['skyline', 40, 1, 0]],
  80: [['plane', 12, 0.3, 3], ['plane', 62, 0.7, 2]],
  100: [['planet', 70, 0.2, 3], ['rocket', 18, 0.5, 3]],
  112: [['sat', 55, 0.4, 3], ['planet2', 12, 0.2, 3]],
  150: [['sat', 20, 0.5, 3], ['planet', 78, 0.3, 2]],
  172: [['moon', 62, 0.3, 4]],
  '-20': [['n:stump', 8, 0.35, 2], ['worm', 36, 0.65, 3], ['n:log', 50, 0.3, 2], ['n:stump2', 76, 0.45, 2]],
  '-34': [['n:rockS', 20, 0.6, 2], ['n:rock', 70, 0.4, 2]],
  '-60': [['n:boulderA', 6, 0.5, 1], ['n:boulderC', 40, 0.5, 1], ['n:boulderD', 70, 0.5, 1]],
  '-91': [['n:crystalA', 15, 0.5, 2], ['n:crystalB', 62, 0.4, 2]],
};
const cache = {};
const imgOf = (name) => {
  const s = sprites[name]; if (!s) return null;
  return (cache[name] ||= { url: art(s.rows, s.pal), w: s.rows[0].length, h: s.rows.length });
};

export function decorFor(from, h) {
  const list = BY_LAYER[from]; if (!list || h < 14) return '';
  return list.map(([n, x, y, sc = 2]) => {
    if (n.startsWith('n:')) {
      const r = NAT[n.slice(2)]; if (!r) return '';
      let k = sc; while (k > 1 && r[3] * k > h) k--;
      if (r[3] * k > h) return '';
      const top = y === 'b' ? h - r[3] * k : (h - r[3] * k) * y;
      return `<i class="deco nat" style="left:${x}%;top:${top.toFixed(0)}px;width:${r[2] * k}px;height:${r[3] * k}px;background:url(${SHEET}) -${r[0] * k}px -${r[1] * k}px / ${SHEET_W * k}px auto no-repeat"></i>`;
    }
    const im = imgOf(n);
    if (n === 'skyline') return `<img class="deco sky" alt="" src="${im.url}" style="left:${x}%;bottom:0;width:${im.w * 3}px">`;
    const w = im.w * sc, hh = im.h * sc;
    if (hh > h) return '';
    return `<img class="deco" alt="" src="${im.url}" style="left:${x}%;top:${((h - hh) * y).toFixed(0)}px;width:${w}px">`;
  }).join('');
}
