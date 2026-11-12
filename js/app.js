import {
  ROOMMATES, ADMIN, CONFIG, POINTS, JOBS, CHECKLISTS, LAUNDRY, LEVELS,
  person, ymd, parseYmd, addDays, startOfDay, captainFor, dutiesForDate, dutiesBetween,
  dutyTitle, assigneeOf, statusOf, computeScores, rankings, weekJobs,
} from './schedule.js';
import { spriteURL, OUTFITS, OUTFIT_KEYS } from './sprites.js';
import { drawHome, SMOKE, HOME_W, HOME_H } from './home.js';
import { ACHIEVEMENTS, ITEMS, ITEM_SOURCE, SLOTS, DIRT, computeAchievements, ownedItems, placedItems, dirtLevel, drawRoom } from './rooms.js';
import { store, REPO } from './store.js';
import { buildICS, FEEDS } from './ics.js';

const app = document.getElementById('app');
const params = new URLSearchParams(location.search);
const NOW_OVERRIDE = params.get('now'); // ?now=2026-11-14T09:00 → time-travel for testing
const getNow = () => (NOW_OVERRIDE ? new Date(NOW_OVERRIDE) : new Date());

// "Who am I" is remembered in a 1-year cookie (localStorage as fallback)
const getCookie = (k) => document.cookie.split('; ').find((c) => c.startsWith(k + '='))?.split('=')[1] || '';
const setCookie = (k, v, days = 365) => { document.cookie = `${k}=${encodeURIComponent(v)}; max-age=${days * 86400}; path=/; SameSite=Lax`; };
const clearCookie = (k) => { document.cookie = `${k}=; max-age=0; path=/`; };
const validMe = (id) => (ROOMMATES.some((r) => r.id === id) ? id : '');
const ui = { tab: 'today', me: validMe(decodeURIComponent(getCookie('house-quest-me')) || localStorage.getItem('house-quest-me') || ''), swapFor: null, toast: '' };

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtTime = (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const fmtDay = (d) => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtDayLong = (d) => d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
const kindLabel = { morning: '🌅 Morning reset', evening: '🌙 Evening reset', clean: '🧹 Weekly cleaning' };

function countdown(ms) {
  if (ms <= 0) return 'now';
  const m = Math.floor(ms / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
  if (d >= 1) return `${d}d ${h % 24}h`;
  if (h >= 1) return `${h}h ${m % 60}m`;
  return `${m}m`;
}

// ---------- sprites ----------
// Each roommate always gets their own pixel hero
const HEROES = { hrithik: 's1', paco: 's2', pit: 's3' };

// achievements, memoised per state object + minute (heroes are drawn many times per render)
let achMemo = { state: null, min: -1, val: null };
function achievementsNow() {
  const now = getNow(), min = Math.floor(now.getTime() / 60000);
  if (achMemo.state !== store.state || achMemo.min !== min) achMemo = { state: store.state, min, val: computeAchievements(store.state, now) };
  return achMemo.val;
}

// chosen outfit, only if (still) unlocked
function outfitOf(id) {
  const o = store.state.outfits?.[id];
  if (!o || !OUTFITS[o]) return 'everyday';
  const n = (achievementsNow()[id] || []).length;
  return n >= OUTFITS[o].need ? o : 'everyday';
}

function hero(id, scores, { crown = false, size = 'md' } = {}) {
  const key = HEROES[id];
  const sweat = (scores?.[id]?.recentStrikes || 0) > 0;
  return `<img class="sprite ${size}" alt="" src="${spriteURL(key, { crown, sweat, outfit: outfitOf(id) })}">`;
}

// ---------- views ----------
function loginView() {
  return `
  <main class="center">
    <h1 class="logo">HOUSE<br>QUEST</h1>
    <p class="muted">Who's playing?</p>
    <div class="party">
      ${ROOMMATES.map((r) => `
        <button class="card pick" data-act="login" data-id="${r.id}" style="--c:${r.color}">
          ${hero(r.id, null)}<b>${r.name}</b>
        </button>`).join('')}
    </div>
    ${cloudSetupHtml()}
  </main>`;
}

function cloudSetupHtml() {
  if (store.canWrite) return '';
  return `<p class="tiny muted">${store.mode === 'cloud' ? '👀 Read-only: you can see the shared leaderboard.' : '💾 Offline.'} To save your ticks for everyone, add your GitHub token in <b>Rules → Account</b> (once per device).</p>`;
}

function tokenFormHtml() {
  if (store.canWrite) return `<p class="tiny muted">🔑 GitHub token saved on this device.</p><button class="btn ghost" data-act="copylink">Copy invite link for a roommate</button> <button class="btn ghost" data-act="rmtoken">Remove token</button>`;
  const standalone = window.navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  return `<form data-act="settoken">${standalone ? '<p class="tiny muted">📱 The Home Screen app keeps its own storage, separate from Safari — add the token here once.</p>' : ''}
    <button type="button" class="btn" data-act="pastetoken">📋 Paste invite link or token</button>
    <label class="tiny">…or type it: GitHub token (fine-grained, this repo only, <i>Contents: Read and write</i>)</label>
    <input name="token" type="password" placeholder="github_pat_… or invite link" autocomplete="off" required><button class="btn ghost">Save & sync ☁</button></form>`;
}

function statusChip(st, duty, now) {
  const map = {
    done: ['✔ On time', 'ok'], late: ['✔ Late (strike)', 'warn'], missed: ['✖ Missed', 'bad'],
    excused: ['🛡 Excused', 'ok'], open: [`⏳ ${countdown(duty.deadline - now)} left`, 'open'],
    future: ['🔒 Not open yet', 'muted'], pregame: ['— pre-game', 'muted'],
    fake: ['🤥 Fake — caught', 'bad'],
  };
  const [t, c] = map[st];
  return `<span class="chip ${c}">${t}</span>`;
}

function dutyCard(duty, now, { showDate = false } = {}) {
  const s = store.state;
  const who = assigneeOf(duty, s);
  const st = statusOf(duty, s, now);
  const p = person(who);
  const mine = who === ui.me;
  const sw = s.swaps?.[duty.id];
  const pts = POINTS.done[duty.kind];
  const done = st === 'done' || st === 'late';
  const lines = duty.kind === 'clean'
    ? `<p class="tiny">${duty.job.emoji} <b>${esc(duty.job.name)}</b> — ${esc(duty.job.desc)}</p>`
    : `<ul class="tiny checks">${CHECKLISTS[duty.kind].map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`;
  let actions = '';
  if (mine && !done && st !== 'future' && st !== 'excused' && st !== 'fake') {
    const late = st === 'missed';
    actions += `<button class="btn ${late ? 'warn' : 'go'}" data-act="done" data-id="${duty.id}">${late ? 'Mark done (late)' : `✔ Done +${pts}`}</button>`;
    if (st === 'open' && !(sw && sw.status === 'pending')) actions += `<button class="btn ghost" data-act="swapopen" data-id="${duty.id}">⇄ Swap</button>`;
  }
  if (mine && done) actions += `<button class="btn ghost" data-act="undo" data-id="${duty.id}">Undo</button>`;
  const flag = s.flags?.[duty.id], fake = s.fakes?.[duty.id];
  if (!mine && done && !flag) actions += `<button class="btn ghost" data-act="flag" data-id="${duty.id}" title="Ask the admin to check">🚩 Not really done?</button>`;
  if (fake && !fake.stolenBy && !mine && canSteal(fake, now)) actions += `<button class="btn go" data-act="steal" data-id="${duty.id}">🦹 Steal it: do it now, +${pts}</button>`;
  if (!mine && st === 'missed') actions += `<button class="btn ghost" data-act="excuse" data-id="${duty.id}" title="Genuine emergency">🛡 Excuse (emergency)</button>`;
  if (st === 'excused') actions += `<button class="btn ghost" data-act="unexcuse" data-id="${duty.id}">Remove excuse</button>`;
  if (ui.swapFor === duty.id) {
    actions += `<div class="swapbox tiny">Swap with: ${ROOMMATES.filter((r) => r.id !== who).map((r) =>
      `<button class="btn ghost" data-act="swapto" data-id="${duty.id}" data-to="${r.id}">${r.name}</button>`).join('')}
      <button class="btn ghost" data-act="swapopen" data-id="">✕</button></div>`;
  }
  let swapNote = '';
  if (flag && !fake) swapNote += `<p class="tiny note">🚩 ${person(flag.by).name} doubts this was done — the admin will check.</p>`;
  if (fake) swapNote += `<p class="tiny note bad">🤥 Claimed done but wasn't: ${POINTS.fakeMultiplier}× penalty (${POINTS.miss[duty.kind] * POINTS.fakeMultiplier}).${fake.stolenBy ? ` 🦹 Stolen by ${person(fake.stolenBy).name} (+${pts}).` : canSteal(fake, now) ? ' Anyone else can steal it.' : ''}</p>`;
  if (sw && sw.status === 'pending') swapNote = `<p class="tiny note">⇄ ${person(sw.from).name} asked ${person(sw.to).name} to swap — not valid until accepted before the deadline.${sw.from === ui.me ? ` <button class="link" data-act="swapcancel" data-id="${duty.id}">cancel</button>` : ''}</p>`;
  if (sw && sw.status === 'accepted' && who === sw.to) swapNote = `<p class="tiny note">⇄ Swapped from ${person(sw.from).name}</p>`;
  const d = parseYmd(duty.date);
  return `
  <article class="duty ${st} ${mine ? 'mine' : ''}" style="--c:${p.color}">
    <header>
      <div class="who">${hero(who, null, { size: 'xs' })}<div><b>${p.name}</b><div class="tiny muted">${showDate ? fmtDay(d) + ' · ' : ''}${kindLabel[duty.kind]} · by ${fmtTime(duty.deadline)}</div></div></div>
      ${statusChip(st, duty, now)}
    </header>
    ${st === 'future' && !mine ? '' : lines}
    ${swapNote}
    <div class="actions">${actions}</div>
  </article>`;
}

const canSteal = (fake, now) => now.getTime() - fake.at < POINTS.stealWindowHours * 3600e3;

function pendingSwaps(now) {
  const out = [];
  for (const [id, sw] of Object.entries(store.state.swaps || {})) {
    if (sw.status !== 'pending' || sw.to !== ui.me) continue;
    const day = id.split(':')[0];
    const duty = dutiesForDate(parseYmd(day)).find((d) => d.id === id);
    if (duty && duty.deadline > now) out.push({ id, sw, duty });
  }
  return out;
}

function banners(scores, now) {
  let h = '';
  for (const { id, sw, duty } of pendingSwaps(now)) {
    h += `<div class="banner swap">⇄ <b>${person(sw.from).name}</b> wants to swap: ${dutyTitle(duty)} on ${fmtDay(parseYmd(duty.date))}.
      <button class="btn go" data-act="swapyes" data-id="${id}">Accept</button><button class="btn ghost" data-act="swapno" data-id="${id}">Decline</button></div>`;
  }
  for (const r of ROOMMATES) {
    if (scores[r.id].recentStrikes >= 3) h += `<div class="banner bad">🚨 ${r.name} has ${scores[r.id].recentStrikes} strikes in 30 days — household review + paid-replacement arrangement to agree.</div>`;
  }
  const mine = scores[ui.me];
  if (mine.recentStrikes === 2) h += `<div class="banner warn">⚠ You're on 2 strikes (30 days). One more triggers a household review.</div>`;
  return h;
}

function hearts(n) { return '❤'.repeat(Math.max(0, 3 - n)) + '🖤'.repeat(Math.min(3, n)); }

// ---- The Ascent: points → altitude. 1 point ≈ a log step: meters = 10^(|pts|/20) − 1 (above the ground = up, below = digging down).
// The camera zooms out to keep all three of you (and the ground) in view.
const SCENE_H = 560, HERO_W = 84; // sprite is 16×29 px → height = width × 29/16
const clampPts = (p) => Math.max(-130, Math.min(172, p)); // the Moon and the magma are the ends of the scale
const meters = (p) => 10 ** (Math.abs(p) / 20) - 1;
function fmtMeters(p) {
  const m = meters(p);
  if (m < 1) return '0 m';
  if (m < 1000) return `${Math.round(m)} m`;
  const km = m / 1000;
  if (km < 1000) return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
  return `${(km / 1000).toFixed(km < 1e4 ? 1 : 0)}k km`;
}
// ascending by points; each layer runs from its `from` up to the next layer's `from`
const LAYERS = [
  { from: -Infinity, name: '🔥 MAGMA HELL', color: '#e0390c', deco: 'flames' },
  { from: -130, name: 'Lower mantle', color: '#b3331a' },
  { from: -115, name: 'Upper mantle', color: '#8a2c16' },
  { from: -91, name: "Earth's crust", color: '#5c4a44' },
  { from: -60, name: 'Bedrock', color: '#55575c' },
  { from: -34, name: '🦴 Dinosaur bones', color: '#8a7150', deco: 'bones' },
  { from: -20, name: 'Roots & worms', color: '#5d3f25' },
  { from: 0, name: 'Ground level', color: '#8fd3f7' },
  { from: 20, name: 'Birds & rooftops', color: '#7cc4f5' },
  { from: 40, name: 'Skyscrapers', color: '#62b2ec' },
  { from: 60, name: 'Clouds', color: '#4b9ae0', deco: 'clouds' },
  { from: 80, name: 'Airliners', color: '#3169ad' },
  { from: 94, name: 'Edge of space', color: '#1f3b78' },
  { from: 100, name: '🚀 SPACE', color: '#0a0e2c', deco: 'stars' },
  { from: 112, name: 'Orbit (ISS)', color: '#070a20', deco: 'stars' },
  { from: 150, name: 'Geostationary', color: '#05071a', deco: 'stars' },
  { from: 172, name: '🌙 The Moon', color: '#03040f', deco: 'stars' },
];

const fmtDist = (m) => (m < 1000 ? `${m} m` : `${(m / 1000).toLocaleString('en-US')} km`);

function niceStep(span) {
  return [5, 10, 20, 25, 50, 100].find((st) => span / st <= 9) || 200;
}

function partyScene(scores) {
  const pts = ROOMMATES.map((r) => clampPts(scores[r.id].points));
  const topId = (() => {
    const r = rankings(scores);
    return r[0].points > 0 && r[0].points > (r[1]?.points ?? -1e9) ? r[0].id : null;
  })();
  // camera: fit everyone + the ground, never tighter than 70 points tall
  let lo = Math.min(0, ...pts), hi = Math.max(0, ...pts);
  const mid = (lo + hi) / 2, span = Math.max(70, (hi - lo) * 1.18);
  lo = mid - span / 2; hi = mid + span / 2;
  // the further we zoom out, the smaller the heroes; when tiny they just get a little name header
  const zoom = Math.max(0.28, Math.min(1, 70 / span));
  const heroW = Math.round(HERO_W * zoom), heroH = heroW * 29 / 16;
  const compact = zoom < 0.6;
  const yTop = heroH + (compact ? 30 : 20), yBot = SCENE_H - (compact ? 14 : 112);
  const yOf = (p) => yTop + ((hi - p) / (hi - lo)) * (yBot - yTop);
  const yMin = yOf(hi), yMax = yOf(lo);          // pixel range that is "inside" the axis
  const sceneTop = yTop - 0, sceneBot = yBot;

  // layer bands (cover the whole scene, extending past the axis ends)
  const bands = LAYERS.map((l, i) => {
    const upper = LAYERS[i + 1]?.from ?? Infinity;
    const y1 = upper === Infinity ? -9999 : yOf(upper);
    const y0 = l.from === -Infinity ? SCENE_H + 9999 : yOf(l.from);
    if (y0 < 0 || y1 > SCENE_H) return '';
    return { l, top: Math.max(0, y1), bottom: Math.min(SCENE_H, y0), upper };
  }).filter(Boolean);
  const bandHtml = bands.map(({ l, top, bottom }) => {
    let deco = '';
    const h = bottom - top;
    if (l.deco === 'stars') deco = `<i class="stars"></i>`;
    if (l.deco === 'clouds') deco = [12, 52, 30].map((x, k) => `<i class="cloud" style="left:${x}%;top:${Math.min(h - 14, 8 + k * 40)}px"></i>`).join('');
    if (l.deco === 'bones') deco = [8, 40, 68].map((x, k) => `<i class="bone" style="left:${x}%;top:${Math.min(h - 10, 10 + k * 14)}px"></i>`).join('');
    if (l.deco === 'flames') deco = [3, 17, 31, 45, 59, 73].map((x) => `<i class="flame" style="left:${x}%"></i>`).join('');
    const grass = l.from === 0 ? '<i class="grass"></i>' : '';
    return `<div class="band" style="top:${top.toFixed(1)}px;height:${(bottom - top).toFixed(1)}px;background:${l.color}">${grass}${deco}</div>`;
  }).join('');

  const earthY = yOf(0);
  // ruler: plain tick lines, every 10 points (longer every 20 = each ×10 in meters); no labels, purely illustrative
  const ruler = [];
  for (let p = Math.ceil(lo / 10) * 10; p <= hi; p += 10) {
    const y = yOf(p);
    if (y < 4 || y > SCENE_H - 4 || p < -130 || p > 172) continue;
    ruler.push(`<i class="tk ${p % 20 === 0 ? 'major' : ''} ${p === 0 ? 'zero' : ''}" style="top:${y.toFixed(1)}px"></i>`);
  }
  // small distance labels: 50 m, then round 1-2-5 steps (100 m, 200 m, 500 m, 1 km …) (skipped when too close together)
  const marks = [50];
  for (let e = 100; e <= 1e9; e *= 10) marks.push(e, 2 * e, 5 * e);
  for (const dir of [1, -1]) {
    let last = yOf(0);
    for (const m of marks) {
      const p = dir * 20 * Math.log10(m + 1);
      if (p < -130 || p > 172) break;
      const y = yOf(p);
      if (y < 8 || y > SCENE_H - 8) continue;
      if (Math.abs(y - last) < 26) continue;
      last = y;
      ruler.push(`<i class="tk mark" style="top:${y.toFixed(1)}px"><b>${dir < 0 ? '−' : ''}${fmtDist(m)}</b></i>`);
    }
  }

  const heroes = ROOMMATES.map((r, i) => {
    const o = scores[r.id];
    const sign = o.points > 0 ? '+' : '';
    const head = compact ? `<div class="head"><b>${r.name}</b> ${sign}${o.points}</div>` : '';
    return `<div class="member ${compact ? 'compact' : ''} ${r.id === ui.me ? 'you' : ''} ${r.id === topId ? 'leader' : ''}" style="--c:${r.color};--w:${heroW}px;left:${i * 33.33}%;top:${yOf(clampPts(o.points)).toFixed(1)}px">
      <div class="figure">${head}${hero(r.id, scores, { crown: r.id === topId, size: 'lg' })}</div>
      ${compact ? '' : `<div class="tag"><b class="nm">${r.name}</b><div class="pts">${o.points > 0 ? '+' : ''}${o.points}<small>pts</small></div>
      <div class="alt tiny">${o.points === 0 ? 'on earth' : (o.points > 0 ? '▲ ' : '▼ ') + fmtMeters(clampPts(o.points))}</div>
      <div class="hearts">${hearts(o.recentStrikes)}</div></div>`}
    </div>`;
  }).join('');

  return `<section class="scene" style="height:${SCENE_H}px">
    ${bandHtml}
    <div class="earthline" style="top:${earthY.toFixed(1)}px"></div>
    <div class="world">${heroes}</div>
    <aside class="legend">${ruler.join('')}</aside>
  </section>`;
}

function todayView(scores, now) {
  const today = startOfDay(now);
  const duties = dutiesForDate(today);
  const sunday = addDays(today, (7 - today.getDay()) % 7);
  const weekly = dutiesForDate(sunday).filter((d) => d.kind === 'clean');
  const lp = LAUNDRY[today.getDay()];
  const cap = person(captainFor(today));
  const feed = Object.values(store.state.log || {}).sort((a, b) => b.t - a.t).slice(0, 8);
  const myWeekly = weekly.find((d) => assigneeOf(d, store.state) === ui.me);
  return `
  ${banners(scores, now)}
  ${partyScene(scores)}
  <h2>Today · ${fmtDayLong(today)}</h2>
  <p class="muted tiny">👑 House Captain today: <b>${cap.name}</b> &nbsp;·&nbsp; 🧺 Laundry: <b>${lp ? person(lp).name : 'open to all'}</b></p>
  ${duties.filter((d) => d.kind !== 'clean').map((d) => dutyCard(d, now)).join('')}
  ${(() => {
    const grabs = Object.entries(store.state.fakes || {}).filter(([, f]) => !f.stolenBy && canSteal(f, now))
      .map(([id]) => findDuty(id)).filter((d) => d && !duties.some((x) => x.id === d.id));
    return grabs.length ? `<h2>🦹 Up for grabs <small>faked duties — do one, take the points</small></h2>${grabs.map((d) => dutyCard(d, now, { showDate: true })).join('')}` : '';
  })()}
  <h2>🐉 Weekly cleaning boss <small>due ${fmtDay(sunday)} 8 pm</small></h2>
  ${myWeekly ? dutyCard(myWeekly, now) : ''}
  <div class="grid3">${weekly.filter((d) => d !== myWeekly).map((d) => dutyCard(d, now)).join('')}</div>
  <h2>Activity</h2>
  <ul class="feed">${feed.length ? feed.map((f) => `<li><span class="tiny muted">${fmtDay(new Date(f.t))} ${fmtTime(new Date(f.t))}</span> ${esc(f.text)}</li>`).join('') : '<li class="muted">Nothing yet — be the first to complete a quest!</li>'}</ul>`;
}

function weekView(now) {
  const today = startOfDay(now);
  const from = parseYmd(CONFIG.trialStart) > today ? parseYmd(CONFIG.trialStart) : addDays(today, -1);
  const days = Array.from({ length: 14 }, (_, i) => addDays(from, i));
  const cell = (duty) => {
    const st = statusOf(duty, store.state, now);
    const ic = { done: '✅', late: '🟠', missed: '❌', excused: '🛡', open: '⏳', future: '·', pregame: '–' }[st];
    return `<span title="${st}">${ic}</span>`;
  };
  const rows = days.map((d) => {
    const ds = dutiesForDate(d);
    const am = ds.find((x) => x.kind === 'morning'), pm = ds.find((x) => x.kind === 'evening');
    const w = assigneeOf(am, store.state), p = person(w), lp = LAUNDRY[d.getDay()];
    const cleans = ds.filter((x) => x.kind === 'clean');
    return `<tr class="${ymd(d) === ymd(today) ? 'today' : ''}" style="--c:${p.color}">
      <td><b>${fmtDay(d)}</b></td>
      <td><span class="dot"></span>${p.name}</td><td>${cell(am)}</td><td>${cell(pm)}</td>
      <td class="tiny">${lp ? person(lp).name : 'open'}</td>
      <td class="tiny">${cleans.map((c) => `${person(assigneeOf(c, store.state)).name}: ${c.job.emoji} ${cell(c)}`).join('<br>')}</td></tr>`;
  }).join('');
  const sundays = [0, 1, 2, 3].map((i) => addDays(addDays(today, (7 - today.getDay()) % 7), i * 7));
  return `
  <h2>Next 14 days</h2>
  <div class="scroll"><table class="tbl"><thead><tr><th>Day</th><th>Captain</th><th>AM</th><th>PM</th><th>Laundry</th><th>Weekly clean (Sun)</th></tr></thead><tbody>${rows}</tbody></table></div>
  <h2>Weekly cleaning rotation</h2>
  <div class="scroll"><table class="tbl"><thead><tr><th>Due</th>${ROOMMATES.map((r) => `<th>${r.name}</th>`).join('')}</tr></thead><tbody>
    ${sundays.map((s) => `<tr><td><b>${fmtDay(s)}</b></td>${weekJobs(s).map((j) => `<td>${j.job.emoji} ${esc(j.job.name.split(' /')[0])}</td>`).join('')}</tr>`).join('')}
  </tbody></table></div>
  <p class="tiny muted">Friday's captain rotates Paco → Pit → Hritik. Bathrooms are excluded. Weekly deadline: Sunday 8 pm.</p>`;
}

function badgesFor(o) {
  const b = [];
  if (o.best >= 3) b.push(['🔥', `${o.best}-duty streak`]);
  if (o.sweeps >= 1) b.push(['✨', `${o.sweeps}× Clean Sweep`]);
  if (o.perfectWeeks >= 1) b.push(['🏆', `${o.perfectWeeks}× Perfect Week`]);
  if (o.earlyBird >= 2) b.push(['🐦', 'Early Bird']);
  if (o.done >= 1 && o.strikes.length === 0) b.push(['😇', 'No strikes']);
  return b;
}

// ---------- rooms ----------
const roomCache = new Map();
function roomImage(opts) {
  const sig = JSON.stringify(opts);
  if (!roomCache.has(sig)) { const c = document.createElement('canvas'); drawRoom(c, opts); roomCache.set(sig, c.toDataURL('image/png')); }
  return roomCache.get(sig);
}

let homeURL = '', homeSig = '';
function homeImage(dirts) {
  const sig = JSON.stringify(dirts);
  if (sig !== homeSig) { homeSig = sig; const c = document.createElement('canvas'); drawHome(c, dirts).then(() => { homeURL = c.toDataURL('image/png'); const el = document.querySelector('.home img'); if (el) el.src = homeURL; }); }
  return homeURL;
}
function roomsView(scores, now) {
  const who = ui.room || ui.me, mine = who === ui.me, r = person(who);
  const mineAch = achievementsNow()[who] || [];
  const owned = ownedItems(mineAch, scores[who].xp);
  const saved = store.state.rooms?.[who]?.placed;
  const placed = placedItems(owned, saved);
  const dirt = dirtLevel(scores[who].points);
  const d = DIRT[dirt];
  const outfit = outfitOf(who);
  const img = roomImage({ who, color: r.color, items: placed, dirt, outfit, heroKey: HEROES[who] });
  const flies = dirt >= 4 ? [12, 30, 55, 78].map((x, i) => `<i class="fly" style="left:${x}%;top:${50 + (i % 2) * 14}%;animation-delay:-${i * 0.7}s"></i>`).join('') : '';
  const month = ymd(now).slice(0, 7);
  const monthName = now.toLocaleDateString('en-GB', { month: 'long' });
  const thisMonth = new Set(mineAch.filter((a) => a.month === month).map((a) => a.type));
  const past = mineAch.filter((a) => a.month !== month);
  const fmtMonth = (m) => parseYmd(`${m}-01`).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
  return `
  <div class="roompick">${ROOMMATES.map((p) => `<button class="btn ${p.id === who ? '' : 'ghost'}" data-act="room" data-who="${p.id}" style="--c:${p.color}">${hero(p.id, null, { size: 'xs' })}${p.name}</button>`).join('')}</div>
  <section class="home" aria-label="The house"><img alt="The house and garden" src="${homeImage(Object.fromEntries(ROOMMATES.map((p) => [p.id, dirtLevel(scores[p.id].points)])))}"><i class="smoke" style="background-image:url(${SMOKE})"></i></section>
  <section class="room ${dirt >= 5 ? 'gross' : ''}"><img src="${img}" alt="${r.name}'s room">${flies}</section>
  <p class="tiny roomstate">${d.emoji} <b>${r.name}'s room: ${d.name}</b>${dirt ? ` · ${scores[who].points} pts — back above 0 cleans it up` : ''}</p>

  <h2>🏅 ${monthName} achievements</h2>
  <div class="achs">${Object.entries(ACHIEVEMENTS).map(([k, a]) => `<div class="ach ${thisMonth.has(k) ? 'got' : ''}" title="${esc(a.desc)}">
    <span>${a.emoji}</span><b>${a.name}</b><small>${esc(a.desc)}${a.monthEnd ? ' · awarded at month end' : ''}</small></div>`).join('')}</div>
  ${past.length ? `<p class="tiny muted">Earlier: ${past.map((a) => `${ACHIEVEMENTS[a.type].emoji} ${ACHIEVEMENTS[a.type].name} (${fmtMonth(a.month)})`).join(' · ')}</p>` : ''}

  <h2>🎁 Collectibles <small>${owned.length}/${Object.keys(ITEMS).length}${mine ? ' · tap to show/hide' : ''}</small></h2>
  <div class="items">${Object.keys(ITEMS).map((k) => {
    const has = owned.includes(k), on = placed.includes(k);
    return `<button class="item ${has ? 'has' : ''} ${on ? 'on' : ''}" ${mine && has ? `data-act="place" data-item="${k}"` : 'disabled'}>
      <b>${has ? ITEMS[k].name : '???'}</b><small>${has ? (on ? '✓ on display' : 'in storage') + ` · ${ITEMS[k].slot}` : `🔒 ${esc(ITEM_SOURCE[k])}`}</small></button>`;
  }).join('')}</div>

  <h2>👕 Outfits <small>${mineAch.length} achievement${mineAch.length === 1 ? '' : 's'} so far</small></h2>
  <div class="outfits">${OUTFIT_KEYS.map((k) => {
    const o = OUTFITS[k], has = mineAch.length >= o.need, on = outfit === k;
    return `<button class="outfit ${on ? 'on' : ''} ${has ? '' : 'locked'}" ${mine && has ? `data-act="outfit" data-outfit="${k}"` : 'disabled'}>
      <img class="sprite" alt="" src="${spriteURL(HEROES[who], { outfit: k })}"><b>${o.name}</b><small>${has ? (on ? '✓ wearing' : 'unlocked') : `🔒 ${o.need} achievements`}</small></button>`;
  }).join('')}</div>`;
}

function ranksView(scores) {
  const ranked = rankings(scores);
  const medals = ['🥇', '🥈', '🥉'];
  return `
  <h2>Leaderboard</h2>
  ${ranked.map((o, i) => {
    const r = person(o.id);
    return `<article class="rankrow" style="--c:${r.color}">
      <div class="medal">${medals[i]}</div>
      ${hero(o.id, scores, { crown: i === 0 && o.points > 0, size: 'sm' })}
      <div class="grow"><b>${r.name}</b> <span class="tiny muted">LV ${o.level} ${o.title}</span>
        <div class="tiny">✅ ${o.done} on time · 🟠 ${o.late} late · ❌ ${o.missed} missed · 🔥 streak ${o.streak} (best ${o.best}) · ${hearts(o.recentStrikes)}</div>
        <div class="tiny">${badgesFor(o).map(([e, t]) => `<span class="badge" title="${t}">${e} ${t}</span>`).join('') || '<span class="muted">No badges yet</span>'}</div></div>
      <div class="pts big">${o.points}<small>pts</small></div>
    </article>`; }).join('')}
  <h2>How points work</h2>
  <table class="tbl small"><tbody>
    <tr><td>🌅 Morning reset on time</td><td class="plus">+${POINTS.done.morning}</td></tr>
    <tr><td>🌙 Evening reset on time</td><td class="plus">+${POINTS.done.evening}</td></tr>
    <tr><td>🧹 Weekly cleaning on time</td><td class="plus">+${POINTS.done.clean}</td></tr>
    <tr><td>✨ Clean Sweep (both resets, same day)</td><td class="plus">+${POINTS.cleanSweep}</td></tr>
    <tr><td>🏆 Perfect Week (every duty on time)</td><td class="plus">+${POINTS.perfectWeek}</td></tr>
    <tr><td>❌ Missed reset / weekly cleaning</td><td class="minus">${POINTS.miss.morning} / ${POINTS.miss.clean} + strike</td></tr>
    <tr><td>🟠 Done late</td><td class="minus">half penalty + strike</td></tr>
    <tr><td>🤥 Ticked but not really done (caught by the admin)</td><td class="minus">${POINTS.fakeMultiplier}× penalty + strike</td></tr>
    <tr><td>🦹 Steal a faked duty (do it yourself within ${POINTS.stealWindowHours} h)</td><td class="plus">its points</td></tr>
    <tr><td>⇄ Swap accepted before the deadline</td><td>no penalty</td></tr>
    <tr><td>🛡 Genuine emergency (excused by a roommate)</td><td>no penalty</td></tr>
    <tr><td>🚨 3 strikes in 30 days</td><td class="minus">household review</td></tr>
  </tbody></table>
  <p class="tiny muted">Levels: ${LEVELS.map((l, i) => `${i + 1} ${l.title} (${l.xp} XP)`).join(' · ')}. Penalties start ${fmtDay(parseYmd(CONFIG.penaltyStart))}.</p>`;
}

function feedUrl(file, scheme = 'https') {
  const base = location.href.split('?')[0].replace(/[^/]*$/, '');
  return (scheme === 'webcal' ? base.replace(/^https?:/, 'webcal:') : base) + 'calendar/' + file;
}

function calendarView() {
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  return `
  <h2>📅 Put it in your Apple Calendar</h2>
  <p class="tiny muted">Subscribe once — new days and reminders appear automatically, with a calendar alert at the start of every turn (your phone pings you even when this app is closed).</p>
  ${FEEDS.map((f) => `<div class="card feed">
      <b>${f.who ? person(f.who).name + "'s duties" : 'Whole house (everyone, no alerts)'}</b>
      <div class="row"><a class="btn go" href="${feedUrl(f.file, 'webcal')}">Subscribe (iPhone / Mac)</a>
      <button class="btn ghost" data-act="copy" data-url="${feedUrl(f.file)}">Copy link</button></div></div>`).join('')}
  <p class="tiny muted">Mac: Calendar → File → New Calendar Subscription → paste the link. Tip: each roommate subscribes to <i>their own</i> feed for alerts, and everyone can add the whole-house feed to see who's on duty.</p>
  <div class="card"><b>Includes confirmed swaps?</b><p class="tiny muted">The subscription feeds follow the base rotation. Swapped a duty? Download a fresh snapshot of your current schedule (includes accepted swaps):</p>
    <button class="btn ghost" data-act="icsnow">⬇ Download my current schedule (.ics)</button></div>
  <h2>🔔 In-app reminders</h2>
  <div class="card"><p class="tiny muted">While this app is open (or installed to your home screen), you get a reminder in the morning, in the evening, and 30 minutes before each deadline.</p>
  <button class="btn go" data-act="notif" ${perm === 'granted' || perm === 'unsupported' ? 'disabled' : ''}>${perm === 'granted' ? '✔ Notifications on' : perm === 'denied' ? 'Blocked in browser settings' : perm === 'unsupported' ? 'Not supported here' : 'Enable notifications'}</button>
  <p class="tiny muted">iPhone: tap Share → "Add to Home Screen" first, then enable notifications from the installed app.</p></div>`;
}

function rulesView() {
  return `
  <h2>📜 The House System</h2>
  <div class="card"><b>House Captain</b><p class="tiny">One roommate is captain each day and does the morning reset (before leaving, ~5–10 min) and the evening reset (by 10:30 pm, ~10–15 min). Mon–Tue Paco · Wed Pit · Thu Hritik · Fri rotates · Sat Pit · Sun Hritik.</p>
  <p class="tiny muted">The captain isn't responsible for someone else's cooking mess or belongings.</p></div>
  <div class="card"><b>Weekly cleaning (Sun 8 pm)</b><p class="tiny">${JOBS.map((j) => `${j.emoji} <b>${esc(j.name)}</b>: ${esc(j.desc)}`).join('<br>')}</p><p class="tiny muted">Assignments rotate weekly. Bathrooms excluded.</p></div>
  <div class="card"><b>Laundry priority</b><p class="tiny">Sun–Mon Hritik · Tue–Wed Paco · Thu open · Fri–Sat Pit. Priority, not obligation — swap directly by agreement; remove laundry promptly.</p></div>
  <div class="card"><b>Swaps & strikes</b><p class="tiny">Swaps must be confirmed (accepted) BEFORE the deadline — a notice without acceptance is not a swap. An unfinished duty without a confirmed swap is a strike; genuine emergencies are excused by a roommate. Max three pairs of shoes each at the entrance. Three strikes in a rolling 30 days → household review + agreed paid-replacement plan.</p>
  <p class="tiny muted">Compensation amounts need all three of you to agree. Trial review: 23 Nov · 30-day review: ~10 Dec. The goal is a clean home, not fines.</p></div>
  <div class="card"><b>Account</b><p class="tiny muted">Playing as ${person(ui.me).name} · ${store.mode === 'cloud' ? (store.canWrite ? '☁ synced via GitHub' : '👀 read-only (no token)') : '💾 offline — changes are queued'}${store.pending.length ? ` · ${store.pending.length} waiting to upload` : ''}</p>
  <button class="btn ghost" data-act="logout">Switch player</button>${tokenFormHtml()}${store.error ? `<p class="tiny bad">Sync error: ${esc(store.error)}</p>` : ''}</div>`;
}

// ---------- admin (Pit only, PIN-locked) ----------
// Note: this is an honour-system lock. Anyone with the GitHub token could still edit state.json directly.
const ADMIN_OK_KEY = 'house-quest-admin-ok';
async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('house-quest-admin:' + text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const adminUnlocked = () => !!store.state.admin?.pinHash && localStorage.getItem(ADMIN_OK_KEY) === store.state.admin.pinHash;

function adminView(now) {
  const hash = store.state.admin?.pinHash;
  if (!hash) {
    return `<h2>🛡 Admin</h2><form class="card" data-act="adminset"><b>Set your admin PIN</b>
      <p class="tiny muted">Only you (${person(ADMIN).name}) see this tab. Pick a PIN of at least 6 characters — you'll need it on each device.</p>
      <input name="pin" type="password" minlength="6" required placeholder="New admin PIN" autocomplete="new-password"> <button class="btn">Set PIN</button></form>`;
  }
  if (!adminUnlocked()) {
    return `<h2>🛡 Admin</h2><form class="card" data-act="adminunlock"><b>Locked</b>
      <input name="pin" type="password" required placeholder="Admin PIN" autocomplete="current-password"> <button class="btn">Unlock</button></form>`;
  }
  const s = store.state;
  const flagged = Object.keys(s.flags || {}).filter((id) => !s.fakes?.[id]).map(findDuty).filter(Boolean);
  const recent = dutiesBetween(addDays(startOfDay(now), -6), addDays(startOfDay(now), 1))
    .filter((d) => d.opens <= now).sort((a, b) => b.deadline - a.deadline);
  const row = (d) => {
    const st = statusOf(d, s, now), who = assigneeOf(d, s), f = s.fakes?.[d.id];
    const b = (act, label, cls = 'ghost') => `<button class="btn ${cls}" data-act="${act}" data-id="${d.id}">${label}</button>`;
    let btns = '';
    if (st === 'done' || st === 'late') btns += b('afake', `🤥 Fake (${POINTS.fakeMultiplier}× penalty)`, 'warn') + b('aundo', 'Undo done');
    if (['missed', 'open', 'future'].includes(st)) btns += b('adone', '✔ Mark done') + b('aexcuse', '🛡 Excuse');
    if (st === 'excused') btns += b('aunexcuse', 'Remove excuse');
    if (f) btns += b('aunfake', 'Clear fake') + (f.stolenBy ? b('aunsteal', `Remove ${person(f.stolenBy).name}'s steal`) : '');
    if (s.flags?.[d.id] && !f) btns += b('adismiss', 'Dismiss flag');
    return `<div class="arow" style="--c:${person(who).color}"><div class="grow"><b>${person(who).name}</b> · ${kindLabel[d.kind]}
      <div class="tiny muted">${fmtDay(parseYmd(d.date))} · by ${fmtTime(d.deadline)}${s.completions?.[d.id] ? ` · ticked ${fmtTime(new Date(s.completions[d.id].at))}` : ''}</div></div>
      ${statusChip(st, d, now)}<div class="actions">${btns}</div></div>`;
  };
  return `<h2>🛡 Admin <small>only you see this</small></h2>
    <div class="card"><b>🚩 Flags to review</b>${flagged.length ? flagged.map(row).join('') : '<p class="tiny muted">Nothing flagged. 👍</p>'}</div>
    <div class="card"><b>Last 7 days</b><p class="tiny muted">Mark a ticked duty as fake when it wasn't really done: ${POINTS.fakeMultiplier}× penalty + strike, and for ${POINTS.stealWindowHours} h anyone else can steal it for the points.</p>
      ${recent.map(row).join('')}</div>
    <button class="btn ghost" data-act="alock">🔒 Lock admin</button>`;
}

function shell(inner) {
  const tabs = [['today', '🏠', 'Today'], ['week', '🗓', 'Week'], ['ranks', '🏆', 'Ranks'], ['room', '🛏', 'Rooms'], ['cal', '📅', 'Calendar'], ['rules', '📜', 'Rules']];
  if (ui.me === ADMIN) tabs.push(['admin', '🛡', 'Admin']);
  return `
  <header class="top"><h1 class="logo tiny">HOUSE QUEST</h1>
    <div class="me" style="--c:${person(ui.me).color}">${hero(ui.me, null, { size: 'xs' })}<span>${person(ui.me).name}</span>
    <span class="sync" title="${store.mode === 'cloud' ? 'Synced' : 'Offline'}">${store.mode === 'cloud' ? (store.pending.length ? '⏳' : '☁') : '💾'}</span></div></header>
  <main class="page">${inner}</main>
  <nav class="tabs">${tabs.map(([k, i, l]) => `<button data-act="tab" data-tab="${k}" class="${ui.tab === k ? 'on' : ''}"><span>${i}</span>${l}</button>`).join('')}</nav>
  ${ui.toast ? `<div class="toast">${esc(ui.toast)}</div>` : ''}`;
}

function render() {
  const now = getNow();
  if (!ui.me) { app.innerHTML = loginView(); return; }
  const scores = computeScores(store.state, now);
  const views = {
    today: () => todayView(scores, now), week: () => weekView(now), ranks: () => ranksView(scores),
    room: () => roomsView(scores, now), cal: calendarView, rules: rulesView, admin: () => (ui.me === ADMIN ? adminView(now) : rulesView()),
  };
  app.innerHTML = shell(views[ui.tab]());
}

function toast(t) { ui.toast = t; render(); setTimeout(() => { ui.toast = ''; render(); }, 2600); }

// ---------- actions ----------
const findDuty = (id) => dutiesForDate(parseYmd(id.split(':')[0])).find((d) => d.id === id);

const actions = {
  login: (el) => { ui.me = el.dataset.id; setCookie('house-quest-me', ui.me); localStorage.setItem('house-quest-me', ui.me); },
  logout: () => { ui.me = ''; clearCookie('house-quest-me'); localStorage.removeItem('house-quest-me'); },
  copylink: async () => {
    const link = `${location.origin}${location.pathname}#t=${encodeURIComponent(store.token)}`;
    try { await navigator.clipboard.writeText(link); toast('Invite link copied — send it privately'); } catch { prompt('Copy this link and send it privately:', link); }
  },
  pastetoken: async () => {
    let text = '';
    try { text = await navigator.clipboard.readText(); } catch { /* permission denied */ }
    const tok = extractToken(text);
    if (!tok) { toast('Clipboard has no token — copy the invite link first'); return; }
    await saveToken(tok);
  },
  flag: (el) => {
    const d = findDuty(el.dataset.id), now = getNow();
    store.patch(['flags', d.id], { by: ui.me, at: now.getTime() });
    store.say(`🚩 ${person(ui.me).name} flagged ${person(assigneeOf(d, store.state)).name}'s ${dutyTitle(d).toLowerCase()} — admin will check`, now.getTime());
  },
  steal: (el) => {
    const d = findDuty(el.dataset.id), now = getNow(), f = store.state.fakes[d.id];
    if (!confirm(`Do ${dutyTitle(d).toLowerCase()} now and take the +${POINTS.done[d.kind]} points?`)) return;
    store.patch(['fakes', d.id], { ...f, stolenBy: ui.me, stolenAt: now.getTime() });
    store.say(`🦹 ${person(ui.me).name} stole ${person(assigneeOf(d, store.state)).name}'s ${dutyTitle(d).toLowerCase()} (+${POINTS.done[d.kind]})`, now.getTime());
  },
  afake: (el) => {
    const d = findDuty(el.dataset.id), now = getNow(), who = assigneeOf(d, store.state);
    if (!confirm(`Mark ${person(who).name}'s ${dutyTitle(d).toLowerCase()} as FAKE? ${POINTS.fakeMultiplier}× penalty (${POINTS.miss[d.kind] * POINTS.fakeMultiplier}) + strike.`)) return;
    store.patch(['fakes', d.id], { by: ui.me, at: now.getTime() });
    store.patch(['flags', d.id], undefined);
    store.say(`🛡 Admin: ${person(who).name}'s ${dutyTitle(d).toLowerCase()} wasn't really done — ${POINTS.fakeMultiplier}× penalty. Anyone can steal it for ${POINTS.stealWindowHours} h!`, now.getTime());
  },
  aunfake: (el) => { const d = findDuty(el.dataset.id); store.patch(['fakes', d.id], undefined); store.say(`🛡 Admin cleared the fake on ${person(assigneeOf(d, store.state)).name}'s ${dutyTitle(d).toLowerCase()}`, getNow().getTime()); },
  aunsteal: (el) => { const d = findDuty(el.dataset.id), f = store.state.fakes[d.id]; store.patch(['fakes', d.id], { by: f.by, at: f.at }); store.say(`🛡 Admin removed ${person(f.stolenBy).name}'s steal`, getNow().getTime()); },
  aundo: (el) => { const d = findDuty(el.dataset.id); store.undo(d.id); store.say(`🛡 Admin un-ticked ${person(assigneeOf(d, store.state)).name}'s ${dutyTitle(d).toLowerCase()}`, getNow().getTime()); },
  adone: (el) => {
    const d = findDuty(el.dataset.id), who = assigneeOf(d, store.state);
    store.patch(['completions', d.id], { by: who, at: Math.min(getNow().getTime(), d.deadline.getTime()), admin: true });
    store.say(`🛡 Admin marked ${person(who).name}'s ${dutyTitle(d).toLowerCase()} as done`, getNow().getTime());
  },
  aexcuse: (el) => { const d = findDuty(el.dataset.id); store.excuse(d.id, ui.me, getNow().getTime()); store.say(`🛡 Admin excused ${person(assigneeOf(d, store.state)).name}'s ${dutyTitle(d).toLowerCase()}`, getNow().getTime()); },
  aunexcuse: (el) => { store.unexcuse(el.dataset.id); },
  adismiss: (el) => { store.patch(['flags', el.dataset.id], undefined); },
  alock: () => { localStorage.removeItem(ADMIN_OK_KEY); },
  room: (el) => { ui.room = el.dataset.who; },
  place: (el) => {
    const now = getNow(), scores = computeScores(store.state, now);
    const owned = ownedItems(achievementsNow()[ui.me] || [], scores[ui.me].xp);
    let list = placedItems(owned, store.state.rooms?.[ui.me]?.placed);
    const k = el.dataset.item;
    if (list.includes(k)) list = list.filter((x) => x !== k);
    else {
      const slot = ITEMS[k].slot;
      if (list.filter((x) => ITEMS[x].slot === slot).length >= SLOTS[slot]) { toast(`The ${slot} is full — hide something there first`); return; }
      list = [...list, k];
    }
    store.patch(['rooms', ui.me, 'placed'], list);
  },
  outfit: (el) => { store.patch(['outfits', ui.me], el.dataset.outfit); },
  rmtoken: () => { store.token = ''; store.mode = 'local'; },
  tab: (el) => { ui.tab = el.dataset.tab; window.scrollTo(0, 0); },
  done: (el) => {
    const now = getNow(), d = findDuty(el.dataset.id);
    store.complete(d.id, ui.me, now.getTime());
    const on = now <= d.deadline;
    store.say(`${person(ui.me).name} completed ${dutyTitle(d).toLowerCase()} ${on ? `(+${POINTS.done[d.kind]})` : '(late)'}`, now.getTime());
    toast(on ? `+${POINTS.done[d.kind]} points! 🎉` : 'Logged — late, so the strike stands.');
  },
  undo: (el) => { store.undo(el.dataset.id); },
  excuse: (el) => {
    const d = findDuty(el.dataset.id), now = getNow();
    if (!confirm(`Excuse ${person(assigneeOf(d, store.state)).name} for a genuine emergency? No penalty or strike.`)) return;
    store.excuse(d.id, ui.me, now.getTime());
    store.say(`${person(ui.me).name} excused ${person(assigneeOf(d, store.state)).name}'s ${dutyTitle(d).toLowerCase()} (emergency)`, now.getTime());
  },
  unexcuse: (el) => { store.unexcuse(el.dataset.id); },
  swapopen: (el) => { ui.swapFor = el.dataset.id || null; },
  swapto: (el) => {
    const now = getNow(); store.requestSwap(el.dataset.id, ui.me, el.dataset.to, now.getTime()); ui.swapFor = null;
    toast(`Swap request sent to ${person(el.dataset.to).name}`);
  },
  swapcancel: (el) => { store.cancelSwap(el.dataset.id); },
  swapyes: (el) => {
    const now = getNow(), d = findDuty(el.dataset.id), sw = store.state.swaps[d.id];
    store.respondSwap(d.id, true, now.getTime());
    store.say(`${person(ui.me).name} accepted ${person(sw.from).name}'s swap: ${dutyTitle(d).toLowerCase()} on ${fmtDay(parseYmd(d.date))}`, now.getTime());
  },
  swapno: (el) => { store.respondSwap(el.dataset.id, false, getNow().getTime()); },
  copy: async (el) => { try { await navigator.clipboard.writeText(el.dataset.url); toast('Link copied'); } catch { prompt('Copy this link:', el.dataset.url); } },
  icsnow: () => {
    const now = getNow();
    const ics = buildICS({ calName: `${person(ui.me).name} — House Quest (snapshot)`, from: startOfDay(now), to: addDays(now, 60), who: ui.me, state: store.state });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    a.download = `house-quest-${ui.me}.ics`; a.click();
  },
  notif: async () => { await Notification.requestPermission(); checkReminders(); },
};

app.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.tagName === 'FORM') return;
  const fn = actions[el.dataset.act];
  if (fn) { fn(el); render(); }
});
// accepts a raw token or a full invite link (…#t=<token>)
function extractToken(text) {
  const t = String(text || '').trim();
  const m = t.match(/#t=([^&\s]+)/);
  const tok = m ? decodeURIComponent(m[1]) : t;
  return /^(github_pat_|ghp_)[A-Za-z0-9_]+$/.test(tok) ? tok : '';
}
async function saveToken(tok) {
  store.token = tok;
  await store.pull();
  await store.flush();
  toast('🔑 Token saved — syncing');
}

app.addEventListener('submit', async (e) => {
  const af = e.target.closest('[data-act="adminset"],[data-act="adminunlock"]');
  if (af) {
    e.preventDefault();
    if (ui.me !== ADMIN) return;
    const h = await sha256(new FormData(af).get('pin'));
    if (af.dataset.act === 'adminset') {
      if (store.state.admin?.pinHash) return;
      store.patch(['admin', 'pinHash'], h);
      localStorage.setItem(ADMIN_OK_KEY, h); toast('🛡 Admin PIN set');
    } else if (h === store.state.admin?.pinHash) { localStorage.setItem(ADMIN_OK_KEY, h); toast('🛡 Unlocked'); } else toast('Wrong PIN');
    render();
    return;
  }
  const form = e.target.closest('[data-act="settoken"]');
  if (!form) return;
  e.preventDefault();
  const tok = extractToken(new FormData(form).get('token'));
  if (!tok) { toast("That doesn't look like a token or invite link"); return; }
  await saveToken(tok);
});

// ---------- reminders (only while the app is open; the calendar feeds cover the closed-app case) ----------
function notify(title, body, tag) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (navigator.serviceWorker?.ready) navigator.serviceWorker.ready.then((r) => r.showNotification(title, { body, tag, icon: 'icon.svg' })).catch(() => new Notification(title, { body, tag }));
  else new Notification(title, { body, tag });
}
function checkReminders() {
  if (!ui.me) return;
  const now = getNow();
  const sent = JSON.parse(localStorage.getItem('house-quest-notified') || '{}');
  const mark = (k) => { sent[k] = 1; localStorage.setItem('house-quest-notified', JSON.stringify(sent)); };
  const duties = dutiesBetween(addDays(now, -1), addDays(now, 1));
  for (const d of duties) {
    if (assigneeOf(d, store.state) !== ui.me) continue;
    if (['done', 'late', 'excused'].includes(statusOf(d, store.state, now)) || now > d.deadline) continue;
    const [s] = CONFIG.windows[d.kind];
    const start = new Date(d.deadline.getFullYear(), d.deadline.getMonth(), d.deadline.getDate(), s[0], s[1]);
    const warn = new Date(d.deadline - 30 * 60000);
    if (now >= start && now < warn && !sent[d.id + ':start']) { mark(d.id + ':start'); notify(`${kindLabel[d.kind]} — your turn!`, `Due by ${fmtTime(d.deadline)}. Check it off for points.`, d.id); }
    else if (now >= warn && !sent[d.id + ':warn']) { mark(d.id + ':warn'); notify(`⏰ 30 min left: ${dutyTitle(d)}`, 'Miss it and you lose points.', d.id + 'w'); }
  }
}

// ---------- boot ----------
// Invite link: https://site/#t=<token> → store the token, then wipe it from the address bar (fragments never leave the browser)
const inviteToken = new URLSearchParams(location.hash.slice(1)).get('t');
if (inviteToken) { store.token = inviteToken; history.replaceState(null, '', location.pathname + location.search); }
// ---------- auto-update: when a new version is merged to main, reload (after the Pages deploy has had time to finish) ----------
let bootSha = '', updating = false;
async function checkForUpdate() {
  if (updating) return;
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/commits/main`, { headers: { ...store.headers(), Accept: 'application/vnd.github.sha' }, cache: 'no-store' });
    if (!r.ok) return;
    const sha = (await r.text()).trim();
    if (!bootSha) { bootSha = sha; return; }
    if (sha === bootSha) return;
    updating = true;
    toast('✨ New version — updating in 2 min');
    const reloadWhenIdle = () => {
      if (document.activeElement?.matches('input') || store.pending.length) return setTimeout(reloadWhenIdle, 15000);
      location.reload();
    };
    setTimeout(reloadWhenIdle, 120000); // GitHub Pages needs ~1 min to publish after the merge
  } catch { /* offline: try again later */ }
}
checkForUpdate();
setInterval(checkForUpdate, 5 * 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkForUpdate(); });

store.subscribe(() => render());
render();
store.connect().then(render);
setInterval(() => { if (!document.activeElement?.matches('input')) render(); checkReminders(); }, 30000);
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
