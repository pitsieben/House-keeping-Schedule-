import {
  ROOMMATES, CONFIG, POINTS, JOBS, CHECKLISTS, LAUNDRY, LEVELS,
  person, ymd, parseYmd, addDays, startOfDay, captainFor, dutiesForDate, dutiesBetween,
  dutyTitle, assigneeOf, statusOf, computeScores, rankings, weekJobs,
} from './schedule.js';
import { SPRITES, SPRITE_KEYS, spriteURL } from './sprites.js';
import { store } from './store.js';
import { buildICS, FEEDS } from './ics.js';

const app = document.getElementById('app');
const params = new URLSearchParams(location.search);
const NOW_OVERRIDE = params.get('now'); // ?now=2026-11-14T09:00 → time-travel for testing
const getNow = () => (NOW_OVERRIDE ? new Date(NOW_OVERRIDE) : new Date());

const ui = { tab: 'today', me: localStorage.getItem('house-quest-me') || '', swapFor: null, toast: '' };

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
function hero(id, scores, { crown = false, size = 'md' } = {}) {
  const key = store.state.avatars?.[id];
  const sweat = (scores?.[id]?.recentStrikes || 0) > 0;
  return `<img class="sprite ${size}" alt="" src="${spriteURL(key, { crown, sweat })}">`;
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
  if (!store.cloudAvailable) {
    return `<p class="tiny muted">💾 Local mode — progress is saved on this device only. See README to turn on shared sync.</p>`;
  }
  if (store.houseCode) return '';
  return `<form class="card" data-act="housecode"><label class="tiny">House code (ask your roommates — everyone enters the same one)</label>
    <input name="code" placeholder="e.g. latin-lovers-7f3k" autocomplete="off" required><button class="btn">Join house ☁</button></form>`;
}

function heroPicker() {
  const taken = new Set(Object.entries(store.state.avatars || {}).filter(([k]) => k !== ui.me).map(([, v]) => v));
  return `
  <main class="center">
    <h1 class="logo small">CHOOSE YOUR<br>HERO</h1>
    <p class="muted">Which pixel hero is you, ${person(ui.me).name}?</p>
    <div class="party">
      ${SPRITE_KEYS.map((k) => `
        <button class="card pick" data-act="hero" data-key="${k}" ${taken.has(k) ? 'disabled' : ''}>
          <img class="sprite lg" alt="" src="${spriteURL(k)}"><b>${SPRITES[k].label}</b>
          ${taken.has(k) ? '<span class="tiny muted">taken</span>' : ''}
        </button>`).join('')}
    </div>
    <button class="btn ghost" data-act="logout">← Not ${person(ui.me).name}</button>
  </main>`;
}

function statusChip(st, duty, now) {
  const map = {
    done: ['✔ On time', 'ok'], late: ['✔ Late (strike)', 'warn'], missed: ['✖ Missed', 'bad'],
    excused: ['🛡 Excused', 'ok'], open: [`⏳ ${countdown(duty.deadline - now)} left`, 'open'],
    future: ['🔒 Not open yet', 'muted'], pregame: ['— pre-game', 'muted'],
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
  if (mine && !done && st !== 'future' && st !== 'excused') {
    const late = st === 'missed';
    actions += `<button class="btn ${late ? 'warn' : 'go'}" data-act="done" data-id="${duty.id}">${late ? 'Mark done (late)' : `✔ Done +${pts}`}</button>`;
    if (st === 'open' && !(sw && sw.status === 'pending')) actions += `<button class="btn ghost" data-act="swapopen" data-id="${duty.id}">⇄ Swap</button>`;
  }
  if (mine && done) actions += `<button class="btn ghost" data-act="undo" data-id="${duty.id}">Undo</button>`;
  if (!mine && st === 'missed') actions += `<button class="btn ghost" data-act="excuse" data-id="${duty.id}" title="Genuine emergency">🛡 Excuse (emergency)</button>`;
  if (st === 'excused') actions += `<button class="btn ghost" data-act="unexcuse" data-id="${duty.id}">Remove excuse</button>`;
  if (ui.swapFor === duty.id) {
    actions += `<div class="swapbox tiny">Swap with: ${ROOMMATES.filter((r) => r.id !== who).map((r) =>
      `<button class="btn ghost" data-act="swapto" data-id="${duty.id}" data-to="${r.id}">${r.name}</button>`).join('')}
      <button class="btn ghost" data-act="swapopen" data-id="">✕</button></div>`;
  }
  let swapNote = '';
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

function partyScene(scores) {
  const ranked = rankings(scores);
  const top = ranked[0].points > 0 && ranked[0].points > (ranked[1]?.points ?? -1e9) ? ranked[0].id : null;
  return `<section class="scene">
    <div class="party">${ranked.map((o, i) => {
      const r = person(o.id);
      const pct = o.next ? Math.min(100, ((o.xp - o.base) / (o.next - o.base)) * 100) : 100;
      return `<div class="member ${o.id === ui.me ? 'me' : ''} ${o.id === top ? 'leader' : ''}" style="--c:${r.color}">
        <div class="rank">#${i + 1}</div>
        ${hero(o.id, scores, { crown: o.id === top, size: 'lg' })}
        <div class="floor"></div>
        <b class="nm">${r.name}</b>
        <div class="tiny muted">LV ${o.level} · ${o.title}</div>
        <div class="bar"><i style="width:${pct}%"></i></div>
        <div class="pts">${o.points} <small>pts</small></div>
        <div class="tiny hearts" title="Strikes in rolling 30 days">${hearts(o.recentStrikes)}</div>
      </div>`; }).join('')}</div>
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
  <p class="tiny muted">Friday's captain rotates Paco → Pit → Hrithik. Bathrooms are excluded. Weekly deadline: Sunday 8 pm.</p>`;
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
  <div class="card"><b>House Captain</b><p class="tiny">One roommate is captain each day and does the morning reset (before leaving, ~5–10 min) and the evening reset (by 10:30 pm, ~10–15 min). Mon–Tue Paco · Wed Pit · Thu Hrithik · Fri rotates · Sat Pit · Sun Hrithik.</p>
  <p class="tiny muted">The captain isn't responsible for someone else's cooking mess or belongings.</p></div>
  <div class="card"><b>Weekly cleaning (Sun 8 pm)</b><p class="tiny">${JOBS.map((j) => `${j.emoji} <b>${esc(j.name)}</b>: ${esc(j.desc)}`).join('<br>')}</p><p class="tiny muted">Assignments rotate weekly. Bathrooms excluded.</p></div>
  <div class="card"><b>Laundry priority</b><p class="tiny">Sun–Mon Hrithik · Tue–Wed Paco · Thu open · Fri–Sat Pit. Priority, not obligation — swap directly by agreement; remove laundry promptly.</p></div>
  <div class="card"><b>Swaps & strikes</b><p class="tiny">Swaps must be confirmed (accepted) BEFORE the deadline — a notice without acceptance is not a swap. An unfinished duty without a confirmed swap is a strike; genuine emergencies are excused by a roommate. Max three pairs of shoes each at the entrance. Three strikes in a rolling 30 days → household review + agreed paid-replacement plan.</p>
  <p class="tiny muted">Compensation amounts need all three of you to agree. Trial review: 23 Nov · 30-day review: ~10 Dec. The goal is a clean home, not fines.</p></div>
  <div class="card"><b>Account</b><p class="tiny muted">Playing as ${person(ui.me).name} · ${store.mode === 'cloud' ? '☁ synced with the house' : '💾 local only on this device'}</p>
  <button class="btn ghost" data-act="changehero">Change hero</button> <button class="btn ghost" data-act="logout">Switch player</button>${store.error ? `<p class="tiny bad">Sync error: ${esc(store.error)}</p>` : ''}</div>`;
}

function shell(inner) {
  const tabs = [['today', '🏠', 'Today'], ['week', '🗓', 'Schedule'], ['ranks', '🏆', 'Ranks'], ['cal', '📅', 'Calendar'], ['rules', '📜', 'Rules']];
  return `
  <header class="top"><h1 class="logo tiny">HOUSE QUEST</h1>
    <div class="me" style="--c:${person(ui.me).color}">${hero(ui.me, null, { size: 'xs' })}<span>${person(ui.me).name}</span>
    <span class="sync" title="${store.mode === 'cloud' ? 'Synced' : 'Local only'}">${store.mode === 'cloud' ? '☁' : '💾'}</span></div></header>
  <main class="page">${inner}</main>
  <nav class="tabs">${tabs.map(([k, i, l]) => `<button data-act="tab" data-tab="${k}" class="${ui.tab === k ? 'on' : ''}"><span>${i}</span>${l}</button>`).join('')}</nav>
  ${ui.toast ? `<div class="toast">${esc(ui.toast)}</div>` : ''}`;
}

function render() {
  const now = getNow();
  if (!ui.me) { app.innerHTML = loginView(); return; }
  if (!store.state.avatars?.[ui.me]) { app.innerHTML = heroPicker(); return; }
  const scores = computeScores(store.state, now);
  const views = {
    today: () => todayView(scores, now), week: () => weekView(now), ranks: () => ranksView(scores),
    cal: calendarView, rules: rulesView,
  };
  app.innerHTML = shell(views[ui.tab]());
}

function toast(t) { ui.toast = t; render(); setTimeout(() => { ui.toast = ''; render(); }, 2600); }

// ---------- actions ----------
const findDuty = (id) => dutiesForDate(parseYmd(id.split(':')[0])).find((d) => d.id === id);

const actions = {
  login: (el) => { ui.me = el.dataset.id; localStorage.setItem('house-quest-me', ui.me); },
  logout: () => { ui.me = ''; localStorage.removeItem('house-quest-me'); },
  hero: (el) => { store.setAvatar(ui.me, el.dataset.key); },
  changehero: () => { store.setAvatar(ui.me, undefined); },
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
app.addEventListener('submit', async (e) => {
  const form = e.target.closest('[data-act="housecode"]');
  if (!form) return;
  e.preventDefault();
  store.houseCode = new FormData(form).get('code');
  await store.connect();
  render();
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
store.subscribe(() => render());
render();
store.connect().then(render);
setInterval(() => { if (!document.activeElement?.matches('input')) render(); checkReminders(); }, 30000);
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
