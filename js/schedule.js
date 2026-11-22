// House schedule engine. Pure functions, no DOM — used by the web app AND the calendar build script.
// Source of truth: house_system_proposal_nov2026.pdf / fridge_calendar_nov10_23_2026.pdf

export const ADMIN = 'pit'; // the only roommate who sees the admin dashboard

export const ROOMMATES = [
  { id: 'paco', name: 'Paco', color: '#f59e0b' },
  { id: 'pit', name: 'Pit', color: '#38bdf8' },
  { id: 'hrithik', name: 'Hritik', color: '#a78bfa' },
];

export const CONFIG = {
  trialStart: '2026-11-10',
  trialEnd: '2026-11-23',
  // No penalties for duties dated before this day (game starts fresh). Compared by duty date, not deadline,
  // because the evening deadline is midnight (= the next day).
  penaltyStart: '2026-11-12',
  // Perfect week = all your duties on time by you, no excuses/holidays/swaps/take-overs, from this week on.
  // Earlier weeks keep the old rule (excused duties counted as fine). Set to the trial start to apply it retroactively.
  strictPerfectWeekFrom: '2026-11-16',
  // [hour, minute] deadlines (local time)
  morningDeadline: [12, 0],   // "before leaving"
  eveningDeadline: [24, 0],   // midnight (= 00:00 at the start of the next day)
  weeklyDeadline: [20, 0],    // "Sunday at 8 pm"
  // Calendar event windows [start],[end]
  windows: {
    morning: [[7, 45], [8, 15]],
    evening: [[22, 30], [24, 0]],   // calendar alerts at 22:30 and 23:00
    clean: [[17, 0], [20, 0]],
  },
};

export const POINTS = {
  done: { morning: 10, evening: 10, clean: 30, plants: 5 },
  miss: { morning: -15, evening: -15, clean: -30, plants: 0 }, // plants: bonus task, nobody is penalised // late completion = half of this
  fakeMultiplier: 2, // caught claiming a duty you didn't do = double the missed penalty
  stealWindowHours: 24, // after a fake is caught, others can steal the duty for this long
  claimWindowHours: 24,  // "I did this one for you": can be claimed up to 24 h after the deadline
  claimAutoConfirmHours: 48, // …and counts as confirmed if the original owner hasn't answered within 48 h
  cleanSweep: 5,   // morning + evening both on time, same day
  perfectWeek: 25, // every duty of the Mon–Sun week on time
};

// Shared bathroom of Pit & Hritik: weekly, alternating, starting with Hritik on Sun 22 Nov 2026.
// Not shared with Paco, so to keep it fair: no points when done, but the usual penalty (−30 / late −15 + strike) if not.
export const BATHROOM = {
  id: 'bathroom', name: 'Shared bathroom (Pit & Hritik)', emoji: '🚿', start: '2026-11-22', people: ['hrithik', 'pit'],
  desc: 'Toilet, sink, mirror, shower/tub and tiles; empty the bin; wash the floor; fresh towels if needed.',
};

// Plants: once a week, Monday or Tuesday (due Tuesday midnight). Anyone can do it; whoever does it gets the points.
/** Points for doing a duty (0 for duties marked noPoints, e.g. the private bathroom). */
export const donePoints = (duty) => (duty.noPoints ? 0 : POINTS.done[duty.kind]);

export const PLANTS = { start: '2026-11-16', emoji: '🪴', name: 'Water the plants', desc: 'Water all the plants in the flat. Monday or Tuesday, anyone.' };

export const JOBS = [
  { id: 'kitchen', name: 'Kitchen', emoji: '🍳', desc: 'Clean hob, sink, counters, appliance exteriors, fronts and grease.' },
  { id: 'living', name: 'Living room / entrance / hallway', emoji: '🛋️', desc: 'Dust accessible surfaces, vacuum and mop floors, clean shoe rack.' },
  { id: 'terrace', name: 'Terrace / remaining floors', emoji: '🌿', desc: 'Sweep terrace, wipe outdoor furniture, clean kitchen floor, vacuum/mop remaining shared areas.' },
];

export const CHECKLISTS = {
  morning: [
    'Unload the dishwasher (if the cycle is finished — otherwise arrange completion)',
    'Check sink, counters, dining table, living room, entrance, hallway',
    'Check ALL bins: organic, general, plastics/packaging, paper/cardboard, glass — empty full ones, replace bags',
  ],
  evening: [
    'Load and run the dishwasher (light loads too, unless almost empty)',
    'Wipe counters, hob and dining table; clear the sink; tidy shared areas; spot-clean',
    'Check ALL bins again — empty full ones, replace bags',
  ],
};

// Laundry priority by weekday (0 = Sunday)
export const LAUNDRY = { 0: 'hrithik', 1: 'hrithik', 2: 'paco', 3: 'paco', 4: null, 5: 'pit', 6: 'pit' };

const CAPTAIN_BY_DOW = { 0: 'hrithik', 1: 'paco', 2: 'paco', 3: 'pit', 4: 'hrithik', 6: 'pit' };

// ---- date helpers (all local time) ----
const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const atTime = (d, [h, m]) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m);
const weeksBetween = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / (7 * 864e5));
export const person = (id) => ROOMMATES.find((r) => r.id === id);

export function captainFor(d) {
  const dow = d.getDay();
  if (dow === 5) { // Friday rotates Paco → Pit → Hritik, starting Fri 13 Nov 2026
    const n = weeksBetween(new Date(2026, 10, 13), d);
    return ROOMMATES[((n % 3) + 3) % 3].id;
  }
  return CAPTAIN_BY_DOW[dow];
}

// Weekly cleaning assignments for the Sunday due date; rotates every week.
export function weekJobs(sunday) {
  const k = weeksBetween(new Date(2026, 10, 15), sunday);
  return ROOMMATES.map((r, i) => ({ person: r.id, job: JOBS[(((i + k) % 3) + 3) % 3] }));
}

export function dutiesForDate(d) {
  const day = ymd(d);
  const cap = captainFor(d);
  const out = [
    { id: `${day}:AM`, kind: 'morning', date: day, assignee: cap, opens: startOfDay(d), deadline: atTime(d, CONFIG.morningDeadline) },
    { id: `${day}:PM`, kind: 'evening', date: day, assignee: cap, opens: startOfDay(d), deadline: atTime(d, CONFIG.eveningDeadline) },
  ];
  if (d.getDay() === 0) {
    for (const { person: p, job } of weekJobs(d)) {
      out.push({ id: `${day}:clean:${p}`, kind: 'clean', date: day, job, assignee: p, opens: addDays(startOfDay(d), -6), deadline: atTime(d, CONFIG.weeklyDeadline) });
    }
    if (day >= BATHROOM.start) {
      const who = BATHROOM.people[((weeksBetween(parseYmd(BATHROOM.start), d) % 2) + 2) % 2];
      out.push({ id: `${day}:bath`, kind: 'clean', date: day, job: BATHROOM, assignee: who, noPoints: true, opens: addDays(startOfDay(d), -6), deadline: atTime(d, CONFIG.weeklyDeadline) });
    }
  }
  if (d.getDay() === 2 && day >= PLANTS.start) { // Tuesday: one shared "water the plants" duty, open from Monday
    out.push({ id: `${day}:plants`, kind: 'plants', date: day, assignee: null, anyone: true, opens: addDays(startOfDay(d), -1), deadline: atTime(d, CONFIG.eveningDeadline) });
  }
  return out;
}

export function dutiesBetween(from, to) {
  const out = [];
  for (let d = startOfDay(from); d <= to; d = addDays(d, 1)) out.push(...dutiesForDate(d));
  return out;
}

export function dutyTitle(duty) {
  if (duty.kind === 'morning') return 'Morning reset';
  if (duty.kind === 'evening') return 'Evening reset';
  if (duty.kind === 'plants') return PLANTS.name;
  return `Weekly cleaning: ${duty.job.name}`;
}

// Owner after a confirmed swap (must be accepted BEFORE the deadline), ignoring take-overs.
export function baseAssigneeOf(duty, state) {
  const sw = state?.swaps?.[duty.id];
  if (sw && sw.status === 'accepted' && sw.acceptedAt <= duty.deadline.getTime()) return sw.to;
  return duty.assignee;
}

/**
 * Take-overs: state.covers[dutyId] =
 *   { status: 'requested', from, at }                   owner said "can't make it", nobody took it yet
 *   { status: 'taken', from, by, at, takenAt }          `by` took it over before the deadline → it's their duty now
 *   { status: 'claimed', from, by, at }                 `by` says they already did it → waits for `from` to confirm
 *   { status: 'confirmed', from, by, at, confirmedAt }  confirmed (or auto after claimAutoConfirmHours)
 */
export const coverOf = (state, duty) => state?.covers?.[duty.id] || null;
// "Can't make it" must leave time for someone else: captain resets up to 4 h before the deadline,
// weekly cleaning up to the end of the day before (Saturday midnight for Sunday).
export const CANT_MAKE_IT_HOURS = 4;
// …and only a few times per calendar month: 1× weekly cleaning, 3× house-captain resets.
export const CANT_MAKE_IT_LIMITS = { clean: 1, reset: 3 };
const quotaKind = (id) => (/:(clean|bath)/.test(id) ? 'clean' : /:(AM|PM)$/.test(id) ? 'reset' : null);
/** This person's "can't make it" requests in the duty's month and category, oldest first (duty ids). */
export function cantMakeItRequests(state, who, dutyId) {
  const month = dutyId.slice(0, 7), kind = quotaKind(dutyId);
  return Object.entries(state?.covers || {})
    .filter(([id, c]) => c && c.from === who && (c.status === 'requested' || c.status === 'taken') && id.slice(0, 7) === month && quotaKind(id) === kind)
    .sort((a, b) => a[1].at - b[1].at).map(([id]) => id);
}
/** How many "can't make it" are still available for this duty's month/category (not counting this duty). */
export function cantMakeItLeft(state, who, duty) {
  const kind = quotaKind(duty.id);
  if (!kind) return 0;
  return CANT_MAKE_IT_LIMITS[kind] - cantMakeItRequests(state, who, duty.id).filter((id) => id !== duty.id).length;
}
const withinQuota = (state, who, duty) => {
  const kind = quotaKind(duty.id);
  return !!kind && cantMakeItRequests(state, who, duty.id).indexOf(duty.id) < CANT_MAKE_IT_LIMITS[kind];
};

/** "Not home": state.away[who] = [{ from, to }]. Duties still need doing: anyone may do them, no penalty for the absentee. */
export function awayOf(state, who, date) {
  return (state?.away?.[who] || []).find((h) => h && h.from <= date && date <= h.to) || null;
}

export function cantMakeItUntil(duty) {
  return duty.kind === 'clean' ? startOfDay(duty.deadline) : new Date(duty.deadline.getTime() - CANT_MAKE_IT_HOURS * 3600e3);
}
const coverActive = (c, duty) => c && c.by && (c.status === 'claimed' || c.status === 'confirmed' || (c.status === 'taken' && c.takenAt <= duty.deadline.getTime()));

// Who actually owns the duty: swaps first, then a take-over.
export function assigneeOf(duty, state) {
  const c = coverOf(state, duty);
  if (coverActive(c, duty)) return c.by;
  const base = baseAssigneeOf(duty, state);
  // owner not home (and not on holiday): the duty belongs to whoever does it
  if (base && awayOf(state, base, duty.date) && !holidayOf(state, base, duty.date)) return state?.completions?.[duty.id]?.by || base;
  return base;
}

/** Holidays: state.holidays[who] = [{ from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }] (both days included). */
export function holidayOf(state, who, date) {
  return (state?.holidays?.[who] || []).find((h) => h && h.from <= date && date <= h.to) || null;
}

export function statusOf(duty, state, now = new Date()) {
  if (state?.fakes?.[duty.id]) return 'fake';
  const cv = coverOf(state, duty);
  if (cv?.by && cv.status === 'confirmed') return 'done';
  if (cv?.by && cv.status === 'claimed') return now.getTime() - cv.at > POINTS.claimAutoConfirmHours * 3600e3 ? 'done' : 'claimed';
  const c = state?.completions?.[duty.id];
  const base = duty.anyone ? null : baseAssigneeOf(duty, state);
  const releasedInTime = cv?.status === 'requested' && cv.at <= cantMakeItUntil(duty).getTime() && withinQuota(state, cv.from, duty);
  const awayFree = !!base && !!awayOf(state, base, duty.date) && !holidayOf(state, base, duty.date) && !coverActive(cv, duty);
  if (c) return c.at <= duty.deadline.getTime() ? 'done' : releasedInTime || awayFree ? 'released' : 'late';
  if (duty.anyone) return now < duty.opens ? 'future' : now > duty.deadline ? 'skipped' : 'open'; // shared bonus task: no penalty
  if (holidayOf(state, assigneeOf(duty, state), duty.date)) return 'holiday'; // away: automatically excused
  if (state?.excused?.[duty.id]) return 'excused';
  if (now < duty.opens) return 'future';
  if (now > duty.deadline) {
    if (duty.date < CONFIG.penaltyStart) return 'pregame';
    // asked for a take-over in time ("can't make it" before the cutoff) and nobody took it: no penalty, no points
    if (releasedInTime || awayFree) return 'released'; // nobody did it, but the owner had handed it over / wasn't home
    return 'missed';
  }
  return 'open';
}

export const LEVELS = [
  { xp: 0, title: 'Dust Bunny' },
  { xp: 40, title: 'Sponge Squire' },
  { xp: 100, title: 'Mop Knight' },
  { xp: 200, title: 'Broom Wizard' },
  { xp: 350, title: 'House Captain' },
  { xp: 550, title: 'Legendary Janitor' },
];
export function levelFor(xp) {
  let lv = 0;
  LEVELS.forEach((l, i) => { if (xp >= l.xp) lv = i; });
  const next = LEVELS[lv + 1];
  return { level: lv + 1, title: LEVELS[lv].title, next: next ? next.xp : null, base: LEVELS[lv].xp };
}

const mondayOf = (d) => addDays(startOfDay(d), -((d.getDay() + 6) % 7));

// Derive scoreboard from the shared state. Nothing is stored — penalties are computed from deadlines.
export function computeScores(state, now = new Date()) {
  const out = Object.fromEntries(ROOMMATES.map((r) => [r.id, {
    id: r.id, points: 0, xp: 0, done: 0, late: 0, missed: 0, excused: 0, holiday: 0, fakes: 0, steals: 0, plants: 0,
    streak: 0, best: 0, sweeps: 0, perfectWeeks: 0, strikes: [], earlyBird: 0,
  }]));
  const penStart = parseYmd(CONFIG.penaltyStart);
  // look a week ahead too, so a duty ticked early (e.g. Sunday's weekly cleaning done on Thursday) scores right away;
  // unticked future duties are 'open'/'future' and don't affect the score
  const all = dutiesBetween(parseYmd(CONFIG.trialStart), addDays(now, 7)).sort((a, b) => a.deadline - b.deadline);
  const perDay = {};
  const perWeek = {};

  for (const duty of all) {
    if (duty.anyone) { // plants: points for whoever did it on time; a caught fake costs them 2× the points
      const c = state.completions?.[duty.id], o = c && out[c.by];
      if (!o || c.at > duty.deadline.getTime()) continue;
      const f = state.fakes?.[duty.id];
      if (f) {
        o.points -= donePoints(duty) * POINTS.fakeMultiplier; o.fakes++;
        if (out[f.stolenBy]) { out[f.stolenBy].points += donePoints(duty); out[f.stolenBy].xp += donePoints(duty); out[f.stolenBy].steals++; }
      } else { o.points += donePoints(duty); o.xp += donePoints(duty); o.plants++; }
      continue;
    }
    const who = assigneeOf(duty, state);
    const st = statusOf(duty, state, now);
    const o = out[who];
    // perfect week: every duty of yours done on time BY YOU — no excuses, holidays, swaps, take-overs or hand-overs
    const wk = ymd(mondayOf(parseYmd(duty.date)));
    const wOf = (id) => ((perWeek[wk] ||= {})[id] ||= { done: 0, bad: false, total: 0, ok: 0 });
    const w = wOf(who);
    const sw = state.swaps?.[duty.id], cv = coverOf(state, duty), base = baseAssigneeOf(duty, state);
    if (sw && sw.status === 'accepted') { wOf(sw.from).bad = true; wOf(sw.to).bad = true; }
    if (cv && cv.from) wOf(cv.from).bad = true;               // asked for help / someone did it for you
    if (who !== base) wOf(base).bad = true;                   // not home: someone else did it
    if (st === 'done') w.done++;
    else if (!['open', 'future', 'pregame'].includes(st)) w.bad = true; // late, missed, fake, excused, holiday, released, claimed
    // old rule (weeks before strictPerfectWeekFrom): excused counted as fine, swaps allowed
    if (['done', 'excused'].includes(st)) { w.total++; w.ok++; } else if (['late', 'missed', 'fake'].includes(st)) w.total++;
    if (st === 'done') {
      const p = donePoints(duty);
      o.points += p; o.xp += p; o.done++; o.streak++; o.best = Math.max(o.best, o.streak);
      const c = state.completions?.[duty.id] || coverOf(state, duty);
      if (duty.kind === 'morning' && c && new Date(c.at).getHours() < 9) o.earlyBird++;
      if (duty.kind !== 'clean') ((perDay[duty.date] ||= {})[who] ||= []).push(duty.kind);
    } else if (st === 'late') {
      if (duty.date < CONFIG.penaltyStart) continue;
      o.points += Math.round(POINTS.miss[duty.kind] / 2); o.late++; o.streak = 0;
      o.strikes.push({ id: duty.id, at: duty.deadline.getTime(), kind: duty.kind, late: true });
    } else if (st === 'missed') {
      o.points += POINTS.miss[duty.kind]; o.missed++; o.streak = 0;
      o.strikes.push({ id: duty.id, at: duty.deadline.getTime(), kind: duty.kind });
    } else if (st === 'fake') {
      // claimed done but caught: double penalty + strike; whoever stole the duty gets its points
      if (duty.date < CONFIG.penaltyStart) continue;
      o.points += POINTS.miss[duty.kind] * POINTS.fakeMultiplier; o.missed++; o.fakes++; o.streak = 0;
      o.strikes.push({ id: duty.id, at: duty.deadline.getTime(), kind: duty.kind, fake: true });
      const thief = state.fakes[duty.id].stolenBy;
      if (thief && out[thief]) {
        const p = donePoints(duty);
        out[thief].points += p; out[thief].xp += p; out[thief].steals++;
      }
    } else if (st === 'holiday') {
      o.holiday++;                 // away: no points, no penalty, doesn't count for the week either
    } else if (st === 'excused') {
      o.excused++;
    }
  }

  for (const days of Object.values(perDay)) {
    for (const [who, kinds] of Object.entries(days)) {
      if (kinds.includes('morning') && kinds.includes('evening')) {
        out[who].points += POINTS.cleanSweep; out[who].xp += POINTS.cleanSweep; out[who].sweeps++;
      }
    }
  }
  for (const [wk, people] of Object.entries(perWeek)) {
    const monday = parseYmd(wk);
    const sundayEnd = atTime(addDays(monday, 6), CONFIG.weeklyDeadline);
    if (sundayEnd > now || monday < mondayOf(penStart)) continue;
    for (const [who, w] of Object.entries(people)) {
      const perfect = wk >= CONFIG.strictPerfectWeekFrom ? w.done > 0 && !w.bad : w.total > 0 && w.ok === w.total;
      if (perfect) {
        out[who].points += POINTS.perfectWeek; out[who].xp += POINTS.perfectWeek; out[who].perfectWeeks++;
      }
    }
  }
  for (const o of Object.values(out)) {
    const cutoff = now.getTime() - 30 * 864e5;
    o.recentStrikes = o.strikes.filter((s) => s.at >= cutoff).length;
    Object.assign(o, levelFor(o.xp));
  }
  return out;
}

export function rankings(scores) {
  return Object.values(scores).sort((a, b) => b.points - a.points || b.xp - a.xp || a.id.localeCompare(b.id));
}
