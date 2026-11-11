// House schedule engine. Pure functions, no DOM — used by the web app AND the calendar build script.
// Source of truth: house_system_proposal_nov2026.pdf / fridge_calendar_nov10_23_2026.pdf

export const ROOMMATES = [
  { id: 'paco', name: 'Paco', color: '#f59e0b' },
  { id: 'pit', name: 'Pit', color: '#38bdf8' },
  { id: 'hrithik', name: 'Hrithik', color: '#a78bfa' },
];

export const CONFIG = {
  trialStart: '2026-11-10',
  trialEnd: '2026-11-23',
  // No penalties for anything whose deadline is before this date (game starts fresh).
  penaltyStart: '2026-11-12',
  // [hour, minute] deadlines (local time)
  morningDeadline: [12, 0],   // "before leaving"
  eveningDeadline: [22, 30],  // "by 10:30 pm"
  weeklyDeadline: [20, 0],    // "Sunday at 8 pm"
  // Calendar event windows [start],[end]
  windows: {
    morning: [[7, 45], [8, 15]],
    evening: [[21, 30], [22, 30]],
    clean: [[17, 0], [20, 0]],
  },
};

export const POINTS = {
  done: { morning: 10, evening: 10, clean: 30 },
  miss: { morning: -15, evening: -15, clean: -30 }, // late completion = half of this
  cleanSweep: 5,   // morning + evening both on time, same day
  perfectWeek: 25, // every duty of the Mon–Sun week on time
};

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
  if (dow === 5) { // Friday rotates Paco → Pit → Hrithik, starting Fri 13 Nov 2026
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
  return `Weekly cleaning: ${duty.job.name}`;
}

// Who actually owns the duty, after a confirmed swap (must be accepted BEFORE the deadline).
export function assigneeOf(duty, state) {
  const sw = state?.swaps?.[duty.id];
  if (sw && sw.status === 'accepted' && sw.acceptedAt <= duty.deadline.getTime()) return sw.to;
  return duty.assignee;
}

export function statusOf(duty, state, now = new Date()) {
  const c = state?.completions?.[duty.id];
  if (c) return c.at <= duty.deadline.getTime() ? 'done' : 'late';
  if (state?.excused?.[duty.id]) return 'excused';
  if (now < duty.opens) return 'future';
  if (now > duty.deadline) return duty.deadline < parseYmd(CONFIG.penaltyStart) ? 'pregame' : 'missed';
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
    id: r.id, points: 0, xp: 0, done: 0, late: 0, missed: 0, excused: 0,
    streak: 0, best: 0, sweeps: 0, perfectWeeks: 0, strikes: [], earlyBird: 0,
  }]));
  const penStart = parseYmd(CONFIG.penaltyStart);
  const all = dutiesBetween(parseYmd(CONFIG.trialStart), now).sort((a, b) => a.deadline - b.deadline);
  const perDay = {};
  const perWeek = {};

  for (const duty of all) {
    const who = assigneeOf(duty, state);
    const st = statusOf(duty, state, now);
    const o = out[who];
    const wk = ymd(mondayOf(parseYmd(duty.date)));
    const w = ((perWeek[wk] ||= {})[who] ||= { total: 0, ok: 0 });
    if (st === 'done') {
      const p = POINTS.done[duty.kind];
      o.points += p; o.xp += p; o.done++; o.streak++; o.best = Math.max(o.best, o.streak);
      w.total++; w.ok++;
      const c = state.completions[duty.id];
      if (duty.kind === 'morning' && new Date(c.at).getHours() < 9) o.earlyBird++;
      if (duty.kind !== 'clean') ((perDay[duty.date] ||= {})[who] ||= []).push(duty.kind);
    } else if (st === 'late') {
      if (duty.deadline < penStart) continue;
      o.points += Math.round(POINTS.miss[duty.kind] / 2); o.late++; o.streak = 0;
      o.strikes.push({ id: duty.id, at: duty.deadline.getTime(), kind: duty.kind, late: true });
      w.total++;
    } else if (st === 'missed') {
      o.points += POINTS.miss[duty.kind]; o.missed++; o.streak = 0;
      o.strikes.push({ id: duty.id, at: duty.deadline.getTime(), kind: duty.kind });
      w.total++;
    } else if (st === 'excused') {
      o.excused++; w.total++; w.ok++;
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
      if (w.total > 0 && w.ok === w.total) {
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
