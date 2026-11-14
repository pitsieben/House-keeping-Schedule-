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
