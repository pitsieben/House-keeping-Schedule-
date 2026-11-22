// Personal rooms: monthly achievements → collectibles, level-ups → collectibles, negative points → dirt.
import {
  ROOMMATES, CONFIG, POINTS, donePoints, missPoints, parseYmd, ymd, addDays, startOfDay, dutiesBetween, assigneeOf, statusOf, levelFor,
} from './schedule.js';
import { drawHero } from './sprites.js';

// ---------------------------------------------------------------------------------------------
// Monthly achievements (pure: computed from the shared state, nothing extra is stored)
// `monthEnd: true` → only awarded once the month is over.
export const ACHIEVEMENTS = {
  early: { emoji: '🌅', name: 'Early Bird', desc: '5 morning resets done before 9:00 in one month', item: 'clock' },
  sweeper: { emoji: '✨', name: 'Clean Sweeper', desc: '4 Clean Sweeps (both resets on time, same day) in one month', item: 'broom' },
  onfire: { emoji: '🔥', name: 'On Fire', desc: '10 duties on time in a row within one month', item: 'lavalamp' },
  thief: { emoji: '🦹', name: 'Opportunist', desc: 'Steal a faked duty', item: 'sack' },
  team: { emoji: '🤝', name: 'Team Player', desc: "Take over a roommate's duty with an accepted swap and do it on time", item: 'frame' },
  spotless: { emoji: '🧼', name: 'Spotless Month', desc: 'At least 10 duties in a month, every one on time (excused is fine)', item: 'plant', monthEnd: true },
  boss: { emoji: '🐉', name: 'Boss Slayer', desc: 'Every weekly cleaning of the month on time', item: 'dragon', monthEnd: true },
  champ: { emoji: '👑', name: 'Monthly Champion', desc: 'Most points earned in the month', item: 'trophy', monthEnd: true },
  green: { emoji: '🪴', name: 'Green Thumb', desc: 'Water the plants 3 times in one month', item: 'cactus' },
};
// Collectibles you get from levelling up (LV 2…6)
export const LEVEL_ITEMS = { 1: 'rug', 2: 'poster', 3: 'guitar', 4: 'fishtank', 5: 'gaming' }; // levels: 75 / 150 / 300 / 600 / 1,200 XP

const monthKey = (d) => ymd(d).slice(0, 7);
const monthStart = (key) => parseYmd(`${key}-01`);
const nextMonth = (key) => { const d = monthStart(key); return new Date(d.getFullYear(), d.getMonth() + 1, 1); };

function monthStats(state, key, now) {
  const from = monthStart(key), to = addDays(nextMonth(key), -1);
  const st0 = () => ({ total: 0, done: 0, late: 0, missed: 0, fakes: 0, excused: 0, steals: 0, early: 0, sweeps: 0, cleans: 0, cleansOk: 0, team: 0, streak: 0, best: 0, pts: 0, plants: 0 });
  const out = Object.fromEntries(ROOMMATES.map((r) => [r.id, st0()]));
  const perDay = {};
  const end = new Date(Math.min(to.getTime(), addDays(now, 7).getTime()));
  const duties = dutiesBetween(from, end).sort((a, b) => a.deadline - b.deadline);
  for (const d of duties) {
    if (d.anyone) { // plants: count for whoever watered them on time (not a caught fake)
      const c = state.completions?.[d.id];
      if (c && out[c.by] && c.at <= d.deadline.getTime() && !state.fakes?.[d.id]) { out[c.by].plants++; out[c.by].pts += donePoints(d); }
      continue;
    }
    const who = assigneeOf(d, state), st = statusOf(d, state, now), o = out[who];
    if (!o || ['open', 'future', 'pregame', 'holiday', 'claimed', 'released'].includes(st)) continue;
    o.total++;
    if (d.kind === 'clean') o.cleans++;
    if (st === 'done') {
      o.done++; o.pts += donePoints(d); o.streak++; o.best = Math.max(o.best, o.streak);
      if (d.kind === 'clean') o.cleansOk++;
      const c = state.completions?.[d.id] || state.covers?.[d.id];
      if (d.kind === 'morning' && c && new Date(c.at).getHours() < 9) o.early++;
      if (d.kind !== 'clean') ((perDay[d.date] ||= {})[who] ||= []).push(d.kind);
      const sw = state.swaps?.[d.id];
      if (sw && sw.status === 'accepted' && sw.to === who) o.team++;
    } else if (st === 'late') { o.late++; o.pts += Math.round(missPoints(d) / 2); o.streak = 0; }
    else if (st === 'missed') { o.missed++; o.pts += missPoints(d); o.streak = 0; }
    else if (st === 'fake') {
      o.fakes++; o.pts += missPoints(d) * POINTS.fakeMultiplier; o.streak = 0;
      const thief = state.fakes[d.id].stolenBy;
      if (out[thief]) { out[thief].steals++; out[thief].pts += donePoints(d); }
    } else if (st === 'excused') { o.excused++; if (d.kind === 'clean') o.cleansOk++; }
  }
  for (const days of Object.values(perDay)) {
    for (const [who, kinds] of Object.entries(days)) if (kinds.includes('morning') && kinds.includes('evening')) out[who].sweeps++;
  }
  return out;
}

/** → { [who]: [{ type, month }] } for every month since the trial started. */
export function computeAchievements(state, now = new Date()) {
  const res = Object.fromEntries(ROOMMATES.map((r) => [r.id, []]));
  for (let key = monthKey(parseYmd(CONFIG.trialStart)); monthStart(key) <= now; key = monthKey(nextMonth(key))) {
    const s = monthStats(state, key, now);
    const ended = now >= nextMonth(key);
    const give = (who, type) => res[who].push({ type, month: key });
    for (const r of ROOMMATES) {
      const o = s[r.id];
      if (o.early >= 5) give(r.id, 'early');
      if (o.sweeps >= 4) give(r.id, 'sweeper');
      if (o.best >= 10) give(r.id, 'onfire');
      if (o.steals >= 1) give(r.id, 'thief');
      if (o.team >= 1) give(r.id, 'team');
      if (o.plants >= 3) give(r.id, 'green');
      if (ended && o.total >= 10 && o.done + o.excused === o.total) give(r.id, 'spotless');
      if (ended && o.cleans >= 2 && o.cleansOk === o.cleans) give(r.id, 'boss');
    }
    if (ended) {
      const best = Math.max(...ROOMMATES.map((r) => s[r.id].pts));
      const top = ROOMMATES.filter((r) => s[r.id].pts === best);
      if (best > 0 && top.length === 1) give(top[0].id, 'champ');
    }
  }
  return res;
}

/** Collectibles a roommate owns, in unlock order. */
export function ownedItems(achievements, xp) {
  const items = [];
  for (const a of achievements) { const it = ACHIEVEMENTS[a.type].item; if (!items.includes(it)) items.push(it); }
  const lv = levelFor(xp).level;
  for (const [l, it] of Object.entries(LEVEL_ITEMS)) if (lv >= +l) items.push(it);
  return items;
}

// ---------------------------------------------------------------------------------------------
// Dirt: the further below 0, the worse
export const DIRT = [
  { at: 0, name: 'Spotless', emoji: '🧽' },
  { at: -1, name: 'Unmade', emoji: '🛏' },
  { at: -20, name: 'Messy', emoji: '🧦' },
  { at: -40, name: 'Cobwebs', emoji: '🕸' },
  { at: -60, name: 'Flies', emoji: '🪰' },
  { at: -90, name: 'Biohazard', emoji: '☣️' },
];
export const dirtLevel = (points) => DIRT.reduce((lv, d, i) => (points <= d.at && i > 0 ? i : lv), 0);

// ---------------------------------------------------------------------------------------------
// Collectible pixel art. slot: where it goes in the room.
export const ITEMS = {
  clock: { name: 'Sunrise Alarm Clock', slot: 'shelf', pal: { R: '#dc2626', W: '#f8fafc', K: '#111111' },
    rows: ['.R....R.', '.RRRRRR.', 'RWWWWWWR', 'RWWKWWWR', 'RWWKKKWR', 'RWWWWWWR', '.RRRRRR.', '.K....K.'] },
  broom: { name: 'Golden Broom', slot: 'floor', pal: { Y: '#b7791f', O: '#fbbf24' },
    rows: ['...Y...', '...Y...', '...Y...', '...Y...', '...Y...', '...Y...', '...Y...', '...Y...', '...Y...', '..YYY..', '.OOOOO.', '.OYOYO.', 'OOOOOOO', 'OYOYOYO', 'OOOOOOO'] },
  lavalamp: { name: 'Lava Lamp', slot: 'shelf', pal: { K: '#475569', P: '#a855f7', O: '#f97316' },
    rows: ['..KK..', '.KKKK.', '.PPOP.', '.POPP.', 'PPPOPP', 'POOPPP', 'PPPOPP', '.PPPP.', '.KKKK.', 'KKKKKK'] },
  sack: { name: 'Loot Sack', slot: 'floor', pal: { T: '#7c5a2e', S: '#a0784a', Y: '#fbbf24' },
    rows: ['...TTTT...', '....TT....', '...SSSS...', '..SSSSSS..', '.SSSYYSSS.', 'SSSSYSSSSS', 'SSSSYYSSSS', 'SSSSSYSSSS', '.SSYYSSSS.', '..SSSSSS..'] },
  frame: { name: 'House Photo', slot: 'wall', pal: { F: '#7c4a1e', s: '#bfe3f5', a: '#c98d63', A: '#f59e0b', b: '#e2b595', B: '#38bdf8', c: '#b9794e', C: '#a78bfa' },
    rows: ['FFFFFFFFFFFF', 'FssssssssssF', 'FsaasbbsccsF', 'FsaasbbsccsF', 'FsAAsBBsCCsF', 'FsAAsBBsCCsF', 'FssssssssssF', 'FFFFFFFFFFFF'] },
  plant: { name: 'Monstera', slot: 'floor', pal: { g: '#3d9a4f', G: '#2e7d3c', p: '#b5532e', P: '#8f3f22' },
    rows: ['...g.g...', '..ggggg..', '.gGggGgg.', 'gggGggggg', '.ggggGgg.', '..ggggg..', '....g....', '..ppppp..', '..pPPPp..', '..ppppp..', '...ppp...'] },
  dragon: { name: 'Dragon Plushie', slot: 'shelf', pal: { g: '#22c55e', K: '#111111', Y: '#fde047' },
    rows: ['.......gg.', '......gKgg', '..g..ggggg', '.gggggggg.', 'ggYggggg..', '.gggggg...', '.g.g.g.g..'] },
  cactus: { name: 'Happy Cactus', slot: 'shelf', pal: { G: '#22c55e', D: '#15803d', P: '#f472b6', K: '#101214', T: '#c2410c', t: '#9a3412' },
    rows: ['...PP...', '...GG...', '.G.GG...', '.GDGG.G.', '.GGGGDG.', '..GGGG..', '...GD...', '.TTTTTT.', '..tTTt..', '..TTTT..'] },
  trophy: { name: 'Champion Trophy', slot: 'shelf', pal: { Y: '#fbbf24', O: '#fde68a', K: '#78350f' },
    rows: ['YYYYYYYY', 'YOYYYYOY', 'Y.YYYY.Y', '.YYYYYY.', '..YYYY..', '...YY...', '...YY...', '..YYYY..', '.KKKKKK.'] },
  rug: { name: 'Cosy Rug', slot: 'rug', pal: {}, rows: [] }, // drawn in the roommate's colour
  poster: { name: 'Rocket Poster', slot: 'wall', pal: { N: '#1e293b', w: '#ffffff', R: '#dc2626', W: '#e5e7eb', O: '#f97316', Y: '#fde047' },
    rows: ['NNNNNNNNNNNN', 'NwNNNNNNNwNN', 'NNNNNRRNNNNN', 'NNNNRWWRNNNN', 'NNNNRWWRNNwN', 'NwNNRWWRNNNN', 'NNNRRWWRRNNN', 'NNNRNOONRNNN', 'NNNNNOONNNNN', 'NNNNNYYNNNwN', 'NNwNNNNNNNNN', 'NNNNNNNNNNNN'] },
  guitar: { name: 'Guitar', slot: 'floor', pal: { K: '#111111', B: '#7c4a1e', O: '#d97706' },
    rows: ['...K...', '..KKK..', '...B...', '...B...', '...B...', '...B...', '...B...', '..OOO..', '.OOOOO.', '.OOKOO.', '..OOO..', '.OOOOO.', 'OOOOOOO', 'OOOKOOO', 'OOOOOOO', '.OOOOO.', '..OOO..'] },
  fishtank: { name: 'Fish Tank', slot: 'floor', pal: { G: '#94a3b8', b: '#38bdf8', O: '#f97316', Y: '#fde047', g: '#22c55e', s: '#e7d7a8', K: '#475569' },
    rows: ['GGGGGGGGGGGGGG', 'GbbbbbbbbbbbbG', 'GbbbbbbObbbbbG', 'GbbbbbOOObbbbG', 'GbbYbbbObbbbbG', 'GbYYYbbbbbbgbG', 'GbbYbbbbbbgbbG', 'GbbbbbbbbbgbbG', 'GssssssssssssG', 'GGGGGGGGGGGGGG', '.KK........KK.', '.KK........KK.'] },
  gaming: { name: 'Gaming Setup', slot: 'floor', pal: { K: '#111827', c: '#1e3a8a', P: '#ec4899', G: '#22c55e', W: '#5b4636' },
    rows: ['.KKKKKKKKKKKK.', '.KccccccccccK.', '.KcPPcccGGccK.', '.KcPPcccGGccK.', '.KccccccccccK.', '.KKKKKKKKKKKK.', '......KK......', '....KKKKKK....', 'WWWWWWWWWWWWWW', '.W..........W.', '.W..........W.', '.W..........W.', '.W..........W.'] },
};
export const ITEM_SOURCE = Object.fromEntries([
  ...Object.entries(ACHIEVEMENTS).map(([k, a]) => [a.item, `${a.emoji} ${a.name}`]),
  ...Object.entries(LEVEL_ITEMS).map(([lv, it]) => [it, `Reach level ${lv}`]),
]);
export const SLOTS = { shelf: 3, wall: 2, floor: 3, rug: 1 };

/** Which items are on display: the owner's choice, or by default the first ones that fit each slot. */
export function placedItems(owned, saved) {
  const list = Array.isArray(saved) ? saved.filter((k) => owned.includes(k)) : owned;
  const used = { shelf: 0, wall: 0, floor: 0, rug: 0 };
  return list.filter((k) => { const sl = ITEMS[k].slot; return used[sl]++ < SLOTS[sl]; });
}

// ---------------------------------------------------------------------------------------------
// Room drawing (128 × 80 px canvas)
export const ROOM_W = 128, ROOM_H = 80;
const WALLS = { paco: '#f1d3a1', pit: '#cfe4f1', hrithik: '#dcd2f2' };

function px(g, rows, pal, x, y) {
  rows.forEach((row, ry) => [...row].forEach((ch, rx) => {
    if (ch === '.' || !pal[ch]) return;
    g.fillStyle = pal[ch]; g.fillRect(x + rx, y + ry, 1, 1);
  }));
}
const rect = (g, c, x, y, w, h) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
// tiny deterministic "random" so the mess doesn't jump around on every redraw
const rnd = (seed) => { let s = seed; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; };

// window glass (transparent in the canvas, the live sky shows through it): x 50–77, y 8–31
export const ROOM_WINDOW = { x: 50, y: 8, w: 28, h: 24 };
const shade = (hex, f) => { // f < 0 darker, > 0 lighter
  const n = parseInt(hex.slice(1), 16), ch = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f));
  return `#${ch.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
};

export function drawRoom(canvas, { who, color, items = [], dirt = 0, outfit = 'everyday', heroKey, phase = 'day', grey = false }) {
  canvas.width = ROOM_W; canvas.height = ROOM_H;
  const g = canvas.getContext('2d');
  g.imageSmoothingEnabled = false;
  const r = rnd(who.length * 97 + 13);
  const fx = rnd(31);                       // decor randomness, same every time
  const W = WALLS[who] || '#e5e7eb';
  // ---- wall: striped wallpaper with a small pattern, crown moulding, soft shadow at the ceiling and corners
  rect(g, W, 0, 0, ROOM_W, 56);
  for (let x = 2; x < ROOM_W; x += 8) rect(g, shade(W, 0.12), x, 3, 3, 47);
  for (let y = 8; y < 48; y += 7) for (let x = (y % 14 ? 6 : 2); x < ROOM_W; x += 8) { rect(g, shade(W, -0.07), x, y, 1, 1); rect(g, shade(W, -0.07), x - 1, y + 1, 3, 1); rect(g, shade(W, -0.07), x, y + 2, 1, 1); }
  rect(g, shade(W, 0.35), 0, 0, ROOM_W, 2); rect(g, shade(W, -0.18), 0, 2, ROOM_W, 1);
  for (let i = 0; i < 6; i++) { rect(g, `rgba(0,0,0,${0.06 - i * 0.01})`, 0, 3 + i, ROOM_W, 1); rect(g, `rgba(0,0,0,${0.07 - i * 0.01})`, i, 0, 1, 56); rect(g, `rgba(0,0,0,${0.07 - i * 0.01})`, ROOM_W - 1 - i, 0, 1, 56); }
  // baseboard
  rect(g, '#efe6d4', 0, 50, ROOM_W, 6); rect(g, '#fffaf0', 0, 50, ROOM_W, 1); rect(g, '#d8ccb4', 0, 54, ROOM_W, 1); rect(g, '#b9ab90', 0, 55, ROOM_W, 1);
  // ---- floor: planks with varied tones, highlights, seams and knots
  const tones = ['#a3713f', '#9c6b3f', '#94643a', '#a8784a', '#99683c'];
  for (let y = 56; y < ROOM_H; y += 5) {
    for (let x = -Math.floor(fx() * 20); x < ROOM_W;) {
      const len = 14 + Math.floor(fx() * 14), t = tones[Math.floor(fx() * tones.length)];
      rect(g, t, x, y, len, 5); rect(g, shade(t, 0.12), x, y, len, 1); rect(g, shade(t, -0.25), x + len - 1, y, 1, 5);
      if (fx() > 0.6) rect(g, shade(t, -0.3), x + 3 + Math.floor(fx() * (len - 6)), y + 2, 2, 1);
      x += len;
    }
    rect(g, '#6b4423', 0, y + 4, ROOM_W, 1);
  }
  rect(g, 'rgba(0,0,0,.18)', 0, 56, ROOM_W, 2);
  // ---- window: green Barcelona shutters with slats, white frame, sill with a little flower pot
  for (const sx of [40, 83]) {
    rect(g, '#2f6b40', sx, 5, 6, 30); rect(g, '#3f8a52', sx + 1, 6, 4, 28);
    for (let y = 7; y < 34; y += 2) rect(g, '#2f6b40', sx + 1, y, 4, 1);
    rect(g, '#cbd5e1', sx === 40 ? sx + 5 : sx, 18, 1, 2);
  }
  rect(g, '#f7f1e6', 46, 5, 36, 30); rect(g, '#d9d2c2', 47, 6, 34, 28); rect(g, '#fffdf7', 46, 5, 36, 1);
  rect(g, '#efe6d4', 44, 33, 40, 3); rect(g, '#fffaf0', 44, 33, 40, 1); rect(g, 'rgba(0,0,0,.18)', 45, 36, 38, 2); // sill + shadow
  // ---- shelf with brackets and its shadow
  rect(g, '#8a5a2b', 91, 26, 35, 2); rect(g, '#a8763f', 91, 26, 35, 1); rect(g, 'rgba(0,0,0,.18)', 92, 28, 34, 2);
  rect(g, '#5b3716', 94, 28, 2, 4); rect(g, '#5b3716', 121, 28, 2, 4);
  // ---- wall lamp above the bed
  rect(g, '#6b7280', 23, 26, 1, 4); rect(g, '#fde68a', 20, 22, 7, 4); rect(g, '#fbbf24', 20, 25, 7, 1); rect(g, '#fff7cc', 21, 22, 5, 1);
  // ---- bed: wooden headboard with grain, pillow, quilted blanket in the roommate's colour, shadow on the floor
  const sheet = dirt >= 1 ? '#c9c2b0' : '#f8fafc';
  rect(g, 'rgba(0,0,0,.22)', 4, 70, 40, 3);
  rect(g, '#6b4423', 2, 36, 5, 36); rect(g, '#7c5230', 3, 37, 3, 34); for (let y = 40; y < 70; y += 6) rect(g, '#5b3716', 4, y, 1, 3);
  rect(g, '#8a5a2b', 2, 35, 5, 1);
  rect(g, sheet, 7, 52, 35, 10); rect(g, shade(sheet, -0.08), 7, 60, 35, 2);
  rect(g, dirt >= 1 ? '#bdb6a2' : '#ffffff', 8, 46, 10, 7); rect(g, dirt >= 1 ? '#a8a08a' : '#e2e8f0', 8, 51, 10, 2); rect(g, '#ffffff', 9, 46, 6, 1);
  const c2 = shade(color, -0.18), c3 = shade(color, 0.25);
  rect(g, color, 17, 50, 25, 12); rect(g, c3, 17, 50, 25, 2);                       // blanket + folded edge
  for (let x = 17; x < 42; x += 6) rect(g, c2, x, 52, 1, 10); for (let y = 55; y < 62; y += 4) rect(g, c2, 17, y, 25, 1);
  rect(g, c2, 17, 61, 25, 1);
  rect(g, '#6b4423', 7, 62, 35, 6); rect(g, '#7c5230', 7, 62, 35, 1); rect(g, '#4a2f17', 8, 68, 2, 4); rect(g, '#4a2f17', 39, 68, 2, 4);
  // hero shadow
  rect(g, 'rgba(0,0,0,.25)', 88, 77, 12, 2);

  // collectibles
  const at = { shelf: [[97, 26], [108, 26], [119, 26]], wall: [[100, 32], [116, 32]], floor: [[50, 77], [68, 77], [118, 77]] };
  const used = { shelf: 0, wall: 0, floor: 0 };
  // rug first so floor items stand on it
  for (const k of [...items].sort((a, b) => (ITEMS[b].slot === 'rug') - (ITEMS[a].slot === 'rug'))) {
    const it = ITEMS[k];
    if (it.slot === 'rug') { // rug in the roommate's colour
      rect(g, color, 46, 69, 36, 7); rect(g, '#ffffff55', 48, 71, 32, 1); rect(g, '#ffffff55', 48, 73, 32, 1);
      for (let x = 46; x < 82; x += 3) rect(g, '#00000030', x, 76, 1, 1);
      continue;
    }
    const pos = at[it.slot][used[it.slot]++]; if (!pos) continue;
    const w = it.rows[0].length, h = it.rows.length;
    const [cx, base] = pos;
    px(g, it.rows, it.pal, Math.round(cx - w / 2), it.slot === 'wall' ? base : base - h);
  }

  // dirt (progressive)
  if (dirt >= 1) for (let i = 0; i < 6; i++) rect(g, '#8a6a3c', 17 + Math.floor(r() * 24), 51 + Math.floor(r() * 9), 2, 1);
  if (dirt >= 2) {
    for (let i = 0; i < 24; i++) rect(g, '#5e4a33', Math.floor(r() * ROOM_W), 57 + Math.floor(r() * 22), 1, 1);
    [['#3b82f6', 28, 72, 7, 3], ['#ef4444', 33, 73, 6, 3], ['#e5e7eb', 30, 70, 5, 2], ['#16a34a', 36, 71, 4, 2]].forEach(([c, x, y, w, h]) => rect(g, c, x, y, w, h));
    rect(g, '#00000018', 20, 30, 6, 4);
  }
  if (dirt >= 3) {
    const web = (x0, flip) => { for (let i = 0; i < 12; i++) { rect(g, '#e2e8f0cc', flip ? x0 - i : x0 + i, i, 1, 1); rect(g, '#e2e8f0aa', flip ? x0 - i : x0 + i, 0, 1, 1); rect(g, '#e2e8f0aa', x0, i, 1, 1); }
      for (let k = 3; k < 12; k += 4) for (let i = 0; i <= k; i++) rect(g, '#e2e8f099', flip ? x0 - i : x0 + i, k - i, 1, 1); };
    web(0, false); web(ROOM_W - 1, true);
    rect(g, '#111111', 8, 9, 2, 2);
  }
  if (dirt >= 4) {
    rect(g, '#f8fafc', 56, 70, 9, 2); rect(g, '#a16207', 58, 69, 5, 1); // dirty plate
    for (let i = 0; i < 3; i++) rect(g, '#84cc16', 30 + i * 3, 64 - (i % 2), 1, 4);  // stink lines
  }
  if (dirt >= 5) {
    rect(g, '#1f2937', 100, 66, 10, 11); rect(g, '#111827', 108, 69, 9, 8); rect(g, '#374151', 103, 64, 3, 2); // trash bags
    rect(g, '#d6a35c', 70, 74, 12, 3); rect(g, '#b45309', 72, 75, 3, 1);       // pizza box
    for (let i = 0; i < 4; i++) rect(g, '#5b4636aa', 10 + i * 22, 20 + (i % 2) * 9, 5, 3); // wall stains
    rect(g, '#3a2a1033', 0, 0, ROOM_W, ROOM_H);
  }
  // the roommate, in their outfit
  drawHero(g, heroKey, 86, 54, { outfit });

  // ---- light: follows the time of day (like the leaderboard sky)
  const sunny = !grey && ['day', 'morning', 'golden', 'dawn'].includes(phase);
  if (sunny) { // sunbeam from the window across the floor
    g.fillStyle = phase === 'golden' || phase === 'dawn' ? 'rgba(255,190,110,.20)' : 'rgba(255,246,200,.20)';
    g.beginPath(); g.moveTo(50, 34); g.lineTo(78, 34); g.lineTo(100, 80); g.lineTo(64, 80); g.closePath(); g.fill();
  }
  const tint = grey && phase !== 'night' ? 'rgba(60,70,85,.14)' : { morning: 'rgba(255,240,210,.05)', golden: 'rgba(255,160,80,.13)', dawn: 'rgba(255,160,120,.10)',
    dusk: 'rgba(90,60,140,.24)', twilight: 'rgba(20,25,70,.40)', night: 'rgba(8,12,35,.56)' }[phase];
  if (tint) rect(g, tint, 0, 0, ROOM_W, ROOM_H);
  if (['night', 'twilight', 'dusk'].includes(phase)) { // the lamp is on
    g.globalCompositeOperation = 'lighter';
    for (let rad = 26; rad > 2; rad -= 4) { g.fillStyle = `rgba(255,200,110,${0.035})`; g.beginPath(); g.arc(23, 25, rad, 0, Math.PI * 2); g.fill(); }
    g.globalCompositeOperation = 'source-over';
    rect(g, '#fff3b0', 20, 22, 7, 4);
  }
  // ---- cut out the glass: the live sky (HTML layer behind the canvas) shows through; mullions + a faint reflection on top
  const { x: wx, y: wy, w: ww, h: wh } = ROOM_WINDOW;
  g.clearRect(wx, wy, ww, wh);
  if (dirt >= 5) rect(g, 'rgba(110,120,100,.55)', wx, wy, ww, wh);
  rect(g, 'rgba(255,255,255,.18)', wx + 3, wy + 2, 1, 6); rect(g, 'rgba(255,255,255,.18)', wx + 4, wy + 1, 1, 4); rect(g, 'rgba(255,255,255,.12)', wx + 17, wy + 13, 1, 5);
  rect(g, '#f7f1e6', 63, wy, 1, wh); rect(g, '#f7f1e6', wx, 19, ww, 1); rect(g, '#d9d2c2', 64, wy, 1, wh); rect(g, '#d9d2c2', wx, 20, ww, 1);
  // flower pot on the sill, in front of the glass (dimmed like the room at night)
  rect(g, '#b45309', 71, 29, 6, 4); rect(g, '#92400e', 71, 32, 6, 1); rect(g, '#22c55e', 72, 26, 4, 3); rect(g, '#16a34a', 73, 25, 2, 1); rect(g, '#f472b6', 74, 24, 1, 1);
  if (tint) rect(g, tint, 70, 23, 8, 10);
}
