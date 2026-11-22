// Headless regression test (node only, no browser): `npm test`
// Prints PASS/FAIL per check and ends with ALL CHECKS PASSED or exits 1.
let pass = 0, fail = 0;
const check = (name, ok, info = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` -> ${info}`}`); };

// minimal browser shims for store.js
const ls = {};
globalThis.localStorage = { getItem: (k) => ls[k] ?? null, setItem: (k, v) => { ls[k] = String(v); }, removeItem: (k) => { delete ls[k]; } };
globalThis.document = { addEventListener() {}, hidden: false };

const S = await import('../js/schedule.js');
const R = await import('../js/rooms.js');
const empty = () => ({ completions: {}, swaps: {}, excused: {}, fakes: {}, flags: {}, log: {} });
const pts = (st, now) => Object.fromEntries(Object.values(S.computeScores(st, new Date(now))).map((o) => [o.id, o.points]));

// ---- scoring basics
{
  const st = empty();
  const sc = pts(st, '2026-11-12T08:00');
  check('nothing done before any deadline = 0 for everyone', Object.values(sc).every((p) => p === 0), JSON.stringify(sc));
  const d = S.dutiesForDate(S.parseYmd('2026-11-13')).find((x) => x.kind === 'morning');
  st.completions[d.id] = { by: d.assignee, at: d.deadline - 3600e3 };
  check('on-time morning reset = +10', pts(st, '2026-11-13T13:00')[d.assignee] === 10, pts(st, '2026-11-13T13:00')[d.assignee]);
  check('one missed reset (morning, checked at 13:00) = -15', pts(empty(), '2026-11-13T13:00')[d.assignee] === -15, pts(empty(), '2026-11-13T13:00')[d.assignee]);
  check('evening reset not missed yet at 23:00 (deadline midnight) = -15', pts(empty(), '2026-11-13T23:00')[d.assignee] === -15, pts(empty(), '2026-11-13T23:00')[d.assignee]);
  check('both resets missed (checked 00:30 next day) = -30', pts(empty(), '2026-11-14T00:30')[d.assignee] === -30, pts(empty(), '2026-11-14T00:30')[d.assignee]);
  const ev = S.dutiesForDate(S.parseYmd('2026-11-13')).find((x) => x.kind === 'evening');
  check('evening deadline is midnight', ev.deadline.getTime() === new Date('2026-11-14T00:00').getTime(), ev.deadline);
  const st2 = empty(); st2.completions[ev.id] = { by: ev.assignee, at: new Date('2026-11-13T23:45').getTime() };
  check('evening reset ticked at 23:45 = on time', S.statusOf(ev, st2, new Date('2026-11-14T01:00')) === 'done');
  const pre = S.dutiesForDate(S.parseYmd('2026-11-11')).find((x) => x.kind === 'evening');
  check('pre-game evening (11 Nov, deadline 12 Nov 00:00) still has no penalty', S.statusOf(pre, empty(), new Date('2026-11-12T08:00')) === 'pregame');
}
// ---- duty ticked before its date (weekly cleaning done early) scores right away
{
  const st = empty();
  const c = S.dutiesForDate(S.parseYmd('2026-11-15')).find((x) => x.kind === 'clean' && x.assignee === 'pit');
  st.completions[c.id] = { by: 'pit', at: new Date('2026-11-12T20:00').getTime() };
  check('early weekly cleaning = +30 immediately', pts(st, '2026-11-12T21:00').pit === 30, pts(st, '2026-11-12T21:00').pit);
}
// ---- fake (double penalty) + steal
{
  const st = empty();
  const d = S.dutiesForDate(S.parseYmd('2026-11-13')).find((x) => x.kind === 'morning');
  const thief = S.ROOMMATES.map((r) => r.id).find((id) => id !== d.assignee);
  st.completions[d.id] = { by: d.assignee, at: d.deadline - 3600e3 };
  st.fakes[d.id] = { by: 'pit', at: d.deadline.getTime(), stolenBy: thief };
  const sc = pts(st, '2026-11-13T13:00');
  check('fake = 2x missed penalty (-30)', sc[d.assignee] === -30, sc[d.assignee]);
  check('thief gets the duty points (+10)', sc[thief] === 10, sc[thief]);
  check('statusOf = fake', S.statusOf(d, st, new Date('2026-11-13T13:00')) === 'fake');
}
// ---- monthly achievements, collectibles, dirt
{
  const st = empty(); const now = new Date('2026-12-02T10:00');
  for (const d of S.dutiesBetween(S.parseYmd('2026-11-10'), now)) {
    if (d.deadline > now || d.assignee !== 'pit') continue;
    const at = new Date(d.deadline); if (d.kind === 'morning') at.setHours(8, 0); else at.setTime(d.deadline - 3600e3);
    st.completions[d.id] = { by: 'pit', at: at.getTime() };
  }
  const ach = R.computeAchievements(st, now);
  const types = ach.pit.filter((a) => a.month === '2026-11').map((a) => a.type).sort();
  check('perfect November → early, sweeper, onfire, spotless, boss, champ',
    JSON.stringify(types) === JSON.stringify(['boss', 'champ', 'early', 'onfire', 'spotless', 'sweeper']), JSON.stringify(types));
  check('roommates who did nothing get no achievements', ach.paco.length === 0 && ach.hrithik.length === 0);
  const sc = S.computeScores(st, now);
  const owned = R.ownedItems(ach.pit, sc.pit.xp);
  check('achievement items are owned', ['clock', 'broom', 'lavalamp', 'plant', 'dragon', 'trophy'].every((k) => owned.includes(k)), owned.join(','));
  const placed = R.placedItems(owned, undefined);
  check('placed items respect slot capacity', Object.entries(R.SLOTS).every(([sl, n]) => placed.filter((k) => R.ITEMS[k].slot === sl).length <= n));
  check('dirt levels: 0 spotless, -1 unmade, -300 biohazard', R.dirtLevel(0) === 0 && R.dirtLevel(-1) === 1 && R.dirtLevel(-300) === 5);
  const mid = R.computeAchievements(st, new Date('2026-11-20T10:00'));
  check('month-end achievements not given mid-month', !mid.pit.some((a) => ['spotless', 'boss', 'champ'].includes(a.type)));
}

// ---- holidays: duties automatically excused, no points/penalty/strike
{
  const st = empty(); st.holidays = { paco: [{ from: '2026-11-15', to: '2026-11-18' }] };
  const d = S.dutiesForDate(S.parseYmd('2026-11-16')).find((x) => x.kind === 'morning'); // Monday: Paco is captain
  check('holiday: assignee on holiday → status holiday', d.assignee === 'paco' && S.statusOf(d, st, new Date('2026-11-17T10:00')) === 'holiday');
  const sc = S.computeScores(st, new Date('2026-11-18T23:00'));
  const base = S.computeScores({ ...empty(), holidays: { paco: [{ from: '2026-11-12', to: '2026-11-18' }] } }, new Date('2026-11-18T23:00'));
  check('holiday: no penalty and no strikes while away', base.paco.points === 0 && base.paco.recentStrikes === 0, JSON.stringify({ p: base.paco.points, s: base.paco.recentStrikes }));
  check('holiday: days outside the holiday still count', sc.paco.points < 0, sc.paco.points);
  check('holiday: holidayOf includes both end days', !!S.holidayOf(st, 'paco', '2026-11-15') && !!S.holidayOf(st, 'paco', '2026-11-18') && !S.holidayOf(st, 'paco', '2026-11-19'));
  const done = { ...st, completions: { [d.id]: { by: 'paco', at: d.deadline - 3600e3 } } };
  check('holiday: a duty done anyway still scores', S.statusOf(d, done, new Date('2026-11-17T10:00')) === 'done');
}

// ---- take-overs: "can't make it" / "I did this one"
{
  const ev = S.dutiesForDate(S.parseYmd('2026-11-16')).find((x) => x.kind === 'evening'); // Monday evening: Paco
  const after = new Date('2026-11-17T14:00');
  const base = S.computeScores(empty(), after);
  // taken over before the deadline and done by Pit
  const st1 = empty(); st1.covers = { [ev.id]: { status: 'taken', from: 'paco', by: 'pit', at: 1, takenAt: new Date('2026-11-16T19:00').getTime() } };
  st1.completions[ev.id] = { by: 'pit', at: new Date('2026-11-16T22:00').getTime() };
  const s1 = S.computeScores(st1, after);
  check('take-over: duty belongs to the one who took it', S.assigneeOf(ev, st1) === 'pit' && S.baseAssigneeOf(ev, st1) === 'paco');
  check('take-over: taker gets +10, owner no penalty', s1.pit.points - base.pit.points === 10 && s1.paco.points - base.paco.points === 15, JSON.stringify([s1.pit.points - base.pit.points, s1.paco.points - base.paco.points]));
  const st1b = empty(); st1b.covers = { [ev.id]: { status: 'taken', from: 'paco', by: 'pit', at: 1, takenAt: new Date('2026-11-16T19:00').getTime() } };
  const s1b = S.computeScores(st1b, after);
  check('take-over: taker who then skips it gets the penalty, not the owner', s1b.pit.points - base.pit.points === -15 && s1b.paco.points === base.paco.points + 15);
  // claimed after the fact ("I did this one")
  const claim = { status: 'claimed', from: 'paco', by: 'pit', at: new Date('2026-11-17T09:00').getTime() };
  const st2 = empty(); st2.covers = { [ev.id]: claim };
  check('claim: pending = neutral status "claimed"', S.statusOf(ev, st2, after) === 'claimed');
  const s2 = S.computeScores(st2, after);
  check('claim pending: no penalty for owner, no points yet', s2.paco.points === base.paco.points + 15 && s2.pit.points === base.pit.points);
  const st3 = empty(); st3.covers = { [ev.id]: { ...claim, status: 'confirmed', confirmedAt: after.getTime() } };
  const s3 = S.computeScores(st3, after);
  check('claim confirmed: helper +10, owner no penalty', s3.pit.points === base.pit.points + 10 && s3.paco.points === base.paco.points + 15);
  check('claim auto-confirms after 48 h', S.statusOf(ev, st2, new Date('2026-11-19T10:00')) === 'done');
  const s4 = S.computeScores(empty(), after); // declined = cover removed = back to normal
  check('claim declined: owner back to missed (-15)', s4.paco.points === base.paco.points);
}
// ---- "can't make it" cutoff: 4 h before a reset, the day before for weekly cleaning
{
  const ds = S.dutiesForDate(S.parseYmd('2026-11-22')); // Sunday
  const am = ds.find((x) => x.kind === 'morning'), pm = ds.find((x) => x.kind === 'evening'), cl = ds.find((x) => x.kind === 'clean');
  check('cutoff: morning reset (due 12:00) → 08:00', S.cantMakeItUntil(am).getTime() === new Date('2026-11-22T08:00').getTime(), S.cantMakeItUntil(am));
  check('cutoff: evening reset (due midnight) → 20:00', S.cantMakeItUntil(pm).getTime() === new Date('2026-11-22T20:00').getTime(), S.cantMakeItUntil(pm));
  check('cutoff: Sunday cleaning → Saturday midnight', S.cantMakeItUntil(cl).getTime() === new Date('2026-11-22T00:00').getTime(), S.cantMakeItUntil(cl));
}
// ---- "can't make it" and nobody takes over: no penalty, no points
{
  const pm = S.dutiesForDate(S.parseYmd('2026-11-18')).find((x) => x.kind === 'evening'); // Wed: Pit
  const after = new Date('2026-11-19T10:00'), base = S.computeScores(empty(), after);
  const req = (h) => ({ ...empty(), covers: { [pm.id]: { status: 'requested', from: 'pit', at: new Date(`2026-11-18T${h}`).getTime() } } });
  const s1 = S.computeScores(req('15:00'), after);
  check('released: asked in time, nobody took it → no penalty, no points', S.statusOf(pm, req('15:00'), after) === 'released' && s1.pit.points === base.pit.points + 15 && s1.pit.recentStrikes === base.pit.recentStrikes - 1);
  check('released: asked after the cutoff → still missed', S.statusOf(pm, req('21:00'), after) === 'missed');
  const s2 = req('15:00'); s2.completions[pm.id] = { by: 'pit', at: new Date('2026-11-18T23:00').getTime() };
  check('released: did it yourself after all → +10 as usual', S.statusOf(pm, s2, after) === 'done' && S.computeScores(s2, after).pit.points === base.pit.points + 25);
  const s3 = req('15:00'); s3.completions[pm.id] = { by: 'pit', at: new Date('2026-11-19T01:00').getTime() };
  check('released: did it late after asking in time → no penalty either', S.statusOf(pm, s3, after) === 'released');
}
// ---- monthly "can't make it" limits: 3× resets, 1× weekly cleaning
{
  const st = empty(); st.covers = {};
  const resets = ['2026-12-02', '2026-12-03', '2026-12-04', '2026-12-05'].map((d) => S.dutiesForDate(S.parseYmd(d)).find((x) => x.kind === 'evening'));
  resets.forEach((d, i) => { st.covers[d.id] = { status: 'requested', from: d.assignee, at: d.deadline - 6 * 3600e3 + i }; });
  // make them all the same person's for the test
  const who = 'pit'; for (const d of resets) st.covers[d.id].from = who;
  const fake = (d) => ({ ...d, assignee: who });
  const after = new Date('2026-12-06T10:00');
  check("limit: 4th reset hand-over in a month isn't released", S.statusOf(fake(resets[2]), st, after) === 'released' && S.statusOf(fake(resets[3]), st, after) === 'missed');
  check('limit: none left after the monthly requests are used', S.cantMakeItLeft(st, who, fake(S.dutiesForDate(S.parseYmd('2026-12-09')).find((x) => x.kind === 'morning'))) <= 0);
  const st3 = { ...st, covers: Object.fromEntries(Object.entries(st.covers).slice(0, 3)) };
  check('limit: exactly 3 used → 0 left', S.cantMakeItLeft(st3, who, fake(S.dutiesForDate(S.parseYmd('2026-12-09')).find((x) => x.kind === 'morning'))) === 0);
  check('limit: new month starts fresh', S.cantMakeItLeft(st, who, fake(S.dutiesForDate(S.parseYmd('2027-01-04')).find((x) => x.kind === 'morning'))) === 3);
  const cl = S.dutiesForDate(S.parseYmd('2026-12-06')).find((x) => x.id.endsWith(':clean:pit'));
  check('limit: 1 weekly-cleaning hand-over per month', S.cantMakeItLeft(st, 'pit', cl) === 1);
}
// ---- not home: duties still need doing, anyone can do them, no penalty for the absentee
{
  const pm = S.dutiesForDate(S.parseYmd('2026-11-18')).find((x) => x.kind === 'evening'); // Wed: Pit
  const after = new Date('2026-11-19T10:00'), base = S.computeScores(empty(), after);
  const st = { ...empty(), away: { pit: [{ from: '2026-11-18', to: '2026-11-18' }] } };
  const s1 = S.computeScores(st, after);
  check('not home: nobody did it → released, no penalty for Pit', S.statusOf(pm, st, after) === 'released' && s1.pit.points === base.pit.points + 30, s1.pit.points - base.pit.points);
  const st2 = { ...st, completions: { [pm.id]: { by: 'paco', at: new Date('2026-11-18T21:00').getTime() } } };
  const s2 = S.computeScores(st2, after);
  check('not home: Paco did it → Paco +10, duty is his', S.assigneeOf(pm, st2) === 'paco' && s2.paco.points === base.paco.points + 10);
  const st3 = { ...st, holidays: { pit: [{ from: '2026-11-18', to: '2026-11-18' }] } };
  check('not home + holiday the same day → holiday wins', S.statusOf(pm, st3, after) === 'holiday');
}
// ---- perfect week (from 16 Nov): all on time by you, nothing excused/swapped/handed over
{
  const wk = S.dutiesBetween(S.parseYmd('2026-11-23'), S.parseYmd('2026-11-29')).filter((d) => !d.anyone);
  const allDone = () => { const st = empty(); for (const d of wk) st.completions[d.id] = { by: d.assignee, at: d.deadline - 3600e3 }; return st; };
  const after = new Date('2026-11-30T12:00');
  const pw = (st) => S.computeScores(st, after).paco.perfectWeeks;
  check('perfect week: everything on time → yes', pw(allDone()) === 1);
  const ex = allDone(); const pacoDuty = wk.find((d) => d.assignee === 'paco' && d.kind !== 'clean'); delete ex.completions[pacoDuty.id]; ex.excused[pacoDuty.id] = { by: 'pit', at: 1 };
  check('perfect week: one excused duty → no', pw(ex) === 0);
  const sw = allDone(); sw.swaps = { [pacoDuty.id]: { from: 'paco', to: 'hrithik', status: 'accepted', at: 1, acceptedAt: 1 } }; sw.completions[pacoDuty.id] = { by: 'hrithik', at: pacoDuty.deadline - 3600e3 };
  check('perfect week: a swap → no (for both)', pw(sw) === 0 && S.computeScores(sw, after).hrithik.perfectWeeks === 0);
  const old = empty(); const wk1 = S.dutiesBetween(S.parseYmd('2026-11-09'), S.parseYmd('2026-11-15')).filter((d) => !d.anyone);
  for (const d of wk1) old.completions[d.id] = { by: d.assignee, at: d.deadline - 3600e3 };
  const pd = wk1.find((d) => d.assignee === 'paco' && d.date >= '2026-11-12' && d.kind !== 'clean'); delete old.completions[pd.id]; old.excused[pd.id] = { by: 'pit', at: 1 };
  check('perfect week: weeks before 16 Nov keep the old rule (excused ok)', S.computeScores(old, new Date('2026-11-16T12:00')).paco.perfectWeeks === 1);
}
// ---- shared bathroom: Hritik on Sun 22 Nov, then alternating with Pit
{
  {
    const b = S.dutiesForDate(S.parseYmd('2026-11-29')).find((x) => x.id.endsWith(':bath')); // Pit's turn
    const after = new Date('2026-11-30T12:00'), base = S.computeScores(empty(), after);
    const st = empty(); st.completions[b.id] = { by: 'pit', at: b.deadline - 3600e3 };
    check('bathroom done → 0 points (no penalty: +15 vs missed)', S.computeScores(st, after).pit.points === base.pit.points + 15);
    const st2 = empty(); st2.completions[b.id] = { by: 'pit', at: b.deadline + 3600e3 };
    check('bathroom late → −7 + strike (half of half)', S.computeScores(st2, after).pit.points === base.pit.points + 8 && S.computeScores(st2, after).pit.recentStrikes === base.pit.recentStrikes);
    check('bathroom missed → −15 (half penalty)', S.missPoints(b) === -15 && S.statusOf(b, empty(), after) === 'missed');
    const st3 = empty(); st3.completions[b.id] = { by: 'pit', at: b.deadline - 3600e3 }; st3.fakes = { [b.id]: { by: 'hrithik', at: 1 } };
    check('bathroom caught fake → −30 (not −60)', S.computeScores(st3, after).pit.points === base.pit.points - 15);
    check('weekly cleaning still +30', S.donePoints(S.dutiesForDate(S.parseYmd('2026-11-29')).find((x) => x.id.endsWith(':clean:pit'))) === 30 && S.donePoints(b) === 0);
  }
  const bath = (day) => S.dutiesForDate(S.parseYmd(day)).find((x) => x.id.endsWith(':bath'));
  check('bathroom: none before 22 Nov', !bath('2026-11-15'));
  check('bathroom: Hritik 22 Nov, Pit 29 Nov, Hritik 6 Dec', bath('2026-11-22')?.assignee === 'hrithik' && bath('2026-11-29')?.assignee === 'pit' && bath('2026-12-06')?.assignee === 'hrithik');
  check('bathroom: weekly cleaning points/deadline (Sun 20:00)', bath('2026-11-22').kind === 'clean' && bath('2026-11-22').deadline.getHours() === 20);
}

// ---- plants: weekly, Mon–Tue, anyone, +5, no penalty; Green Thumb achievement
{
  const pl = (day) => S.dutiesForDate(S.parseYmd(day)).find((x) => x.kind === 'plants');
  check('plants: one duty on Tuesdays (opens Monday, due Tue midnight)', !!pl('2026-11-17') && !pl('2026-11-16') && pl('2026-11-17').opens.getDate() === 16 && pl('2026-11-17').deadline.getTime() === new Date('2026-11-18T00:00').getTime());
  const now = new Date('2026-11-19T10:00');
  const base = S.computeScores(empty(), now);
  const st = empty(); st.completions[pl('2026-11-17').id] = { by: 'hrithik', at: new Date('2026-11-16T19:00').getTime() };
  const sc = S.computeScores(st, now);
  check('plants: whoever waters them gets +5', sc.hrithik.points - base.hrithik.points === 5 && sc.pit.points === base.pit.points && sc.paco.points === base.paco.points);
  check('plants: nobody watering = no penalty, status skipped', S.statusOf(pl('2026-11-17'), empty(), now) === 'skipped' && JSON.stringify(Object.values(S.computeScores(empty(), now)).map((o) => o.points)) === JSON.stringify(Object.values(base).map((o) => o.points)));
  const fk = { ...st, fakes: { [pl('2026-11-17').id]: { by: 'pit', at: 1 } } };
  check('plants: caught fake = -10 for the faker', S.computeScores(fk, now).hrithik.points - base.hrithik.points === -10);
  const g = empty(); const dec = new Date('2026-12-31T12:00');
  for (const day of ['2026-12-01', '2026-12-08', '2026-12-15']) g.completions[pl(day).id] = { by: 'paco', at: pl(day).deadline - 3600e3 };
  const ach = R.computeAchievements(g, dec);
  check('plants: 3 waterings in a month → Green Thumb (+ cactus)', ach.paco.some((a) => a.type === 'green' && a.month === '2026-12') && R.ownedItems(ach.paco, 0).includes('cactus'));
  const g2 = empty(); for (const day of ['2026-12-01', '2026-12-08']) g2.completions[pl(day).id] = { by: 'paco', at: pl(day).deadline - 3600e3 };
  check('plants: 2 waterings are not enough', !R.computeAchievements(g2, dec).paco.some((a) => a.type === 'green'));
}

// ---- House Jump easter egg: always beatable, altitude scale
{
  const J = await import('../js/jump.js');
  const reach = J.jumpHeight();
  let worst = 0;
  for (let y = 0; y > -12000; y -= 7.3) for (const d of [0, 0.5, 1]) worst = Math.max(worst, J.platformGap(y, d));
  check(`jump: every platform gap (max ${worst.toFixed(1)} px) is well below the jump height (${reach.toFixed(1)} px)`, worst <= reach - 12, `${worst} vs ${reach}`);
  check(`jump: space (100 km) at ${J.SPACE_PX} px`, Math.abs(J.metersAt(J.SPACE_PX) / 1e5 - 1) < 0.01, J.metersAt(J.SPACE_PX));
  check('jump: one screen (320 px) ≈ 8 m, so the counter moves right away', J.metersAt(320) > 5 && J.metersAt(320) < 12, J.metersAt(320));
  check('jump: Moon target ≈ 384,400 km', Math.abs(J.metersAt(J.MOON_PX) / 1000 - 384400) / 384400 < 0.01, J.metersAt(J.MOON_PX));
}

// ---- levels: exponential, level 1 at 75 XP, ×2 per level
{
  const L = (x) => S.levelFor(x).level;
  check('levels: 0 below 75 XP, 1 at 75, 2 at 150, 3 at 300, 4 at 600, 5 at 1200', L(74) === 0 && L(75) === 1 && L(149) === 1 && L(150) === 2 && L(300) === 3 && L(600) === 4 && L(1199) === 4 && L(1200) === 5);
  check('levels: progress bounds (base/next) for 200 XP = 150…300', S.levelFor(200).base === 150 && S.levelFor(200).next === 300);
  check('levels: never run out (titles beyond the list)', S.levelFor(1e6).level > 10 && typeof S.levelFor(1e6).title === 'string');
  check('collectibles: rug at level 1 (75 XP), gaming setup at level 5 (1200 XP)', R.ownedItems([], 75).includes('rug') && !R.ownedItems([], 1199).includes('gaming') && R.ownedItems([], 1200).includes('gaming'));
}

// ---- store sync against a mocked GitHub API
async function syncRun(mode) {
  for (const k of Object.keys(ls)) delete ls[k];
  let branch = mode !== 'nobranch', file = mode === 'nobranch' || mode === 'nofile' ? null : JSON.stringify(empty()), sha = 1, conflictOnce = mode === 'conflict';
  globalThis.fetch = async (url, o = {}) => {
    const res = (status, body) => ({ status, ok: status < 300, headers: { get: () => null }, json: async () => body });
    const u = url.replace(/^https:\/\/api\.github\.com\/repos\/[^/]+\/[^/]+/, '').split('?')[0];
    if (u === '/contents/state.json' && !o.method) return branch && file !== null ? res(200, { sha: String(sha), content: Buffer.from(file).toString('base64') }) : res(404, {});
    if (u === '/git/ref/heads/data') return res(branch ? 200 : 404, {});
    if (u === '/git/trees') return res(201, { sha: 't' });
    if (u === '/git/commits') { if (JSON.parse(o.body).parents.length) throw new Error('data branch must be an orphan'); return res(201, { sha: 'c' }); }
    if (u === '/git/refs') { branch = true; file = JSON.stringify(empty()); sha++; return res(201, {}); }
    if (o.method === 'PUT') {
      if (conflictOnce) { conflictOnce = false; file = JSON.stringify({ ...empty(), completions: { other: { by: 'paco' } } }); sha++; return res(409, {}); }
      const b = JSON.parse(o.body); if (file !== null && b.sha !== String(sha)) return res(409, {});
      file = Buffer.from(b.content, 'base64').toString(); sha++; return res(200, {});
    }
    return res(500, {});
  };
  const { store } = await import(`../js/store.js?${mode}`);
  store.token = 'github_pat_test';
  store.complete('d1', 'pit', 1);
  await new Promise((r) => setTimeout(r, 900));
  return { saved: JSON.parse(file), pending: store.pending.length, error: store.error };
}
{
  const a = await syncRun('conflict');
  check('sync: concurrent save is merged, not overwritten', a.saved.completions.other && a.saved.completions.d1 && a.pending === 0, JSON.stringify(a));
  const b = await syncRun('nobranch');
  check('sync: creates orphan data branch with only state.json', b.saved.completions.d1 && b.pending === 0, JSON.stringify(b));
  const c = await syncRun('nofile');
  check('sync: recreates missing state.json on existing branch', c.saved.completions.d1 && c.pending === 0, JSON.stringify(c));
}

// ---- rate limit: slower read-only polling, back-off on 403, recovery on success
{
  for (const k of Object.keys(ls)) delete ls[k];
  let code = 200;
  globalThis.fetch = async () => ({ status: code, ok: code < 300, headers: { get: () => null }, json: async () => ({ sha: '1', content: Buffer.from(JSON.stringify(empty())).toString('base64') }) });
  const { store } = await import('../js/store.js?limit');
  store.token = '';
  await store.pull();
  check('rate limit: read-only polls every 120 s', store.pollDelay() === 120000, store.pollDelay());
  store.token = 'github_pat_test';
  check('rate limit: with a token polls every 20 s', store.pollDelay() === 20000, store.pollDelay());
  code = 403; await store.pull();
  check('rate limit: first 403 backs off 5 min', store.rateLimited && store.pollDelay() === 300000, store.pollDelay());
  await store.pull(); await store.pull(); await store.pull();
  check('rate limit: repeated 403 caps at 30 min', store.pollDelay() === 1800000, store.pollDelay());
  code = 200; await store.pull();
  check('rate limit: recovers to normal after a success', !store.rateLimited && store.pollDelay() === 20000, store.pollDelay());
}

console.log(fail ? `\n${fail} FAILED, ${pass} passed` : `\nALL CHECKS PASSED (${pass})`);
process.exit(fail ? 1 : 0);
