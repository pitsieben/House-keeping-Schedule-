// iCalendar (.ics) builder — works in Node and in the browser.
// Times are "floating" (no timezone) so they show at the same local clock time on every roommate's device.
import { CONFIG, CHECKLISTS, LAUNDRY, ROOMMATES, addDays, assigneeOf, dutiesForDate, dutyTitle, person, startOfDay } from './schedule.js';

const pad = (n) => String(n).padStart(2, '0');
const local = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
const dateOnly = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
const utcStamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

function fold(line) {
  const chars = [...line];
  if (chars.length <= 70) return line;
  const parts = [];
  for (let i = 0; i < chars.length; i += 70) parts.push(chars.slice(i, i + 70).join(''));
  return parts.join('\r\n ');
}

function alarm(trigger, text) {
  return ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(text)}`, `TRIGGER:${trigger}`, 'END:VALARM'];
}

const ALARMS = {
  morning: ['PT0S'],
  evening: ['PT0S', 'PT30M'],
  clean: ['-P1D', 'PT0S', 'PT2H'],
};

/**
 * @param {object} o
 * @param {string} o.calName
 * @param {Date} o.from
 * @param {Date} o.to
 * @param {string|null} o.who  roommate id → personal feed (with alarms); null → whole-house feed
 * @param {object} [o.state]   optional app state, so confirmed swaps are reflected
 */
export function buildICS({ calName, from, to, who = null, state = {} }) {
  const stamp = utcStamp(new Date());
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//House Quest//House Keeping Schedule//EN',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(calName)}`, 'X-PUBLISHED-TTL:PT1H', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
  ];
  const ev = (arr) => lines.push('BEGIN:VEVENT', ...arr, 'END:VEVENT');

  for (let d = startOfDay(from); d <= to; d = addDays(d, 1)) {
    for (const duty of dutiesForDate(d)) {
      const owner = assigneeOf(duty, state);
      if (who && owner !== who) continue;
      const [s, e] = CONFIG.windows[duty.kind];
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), s[0], s[1]);
      const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), e[0], e[1]);
      const name = person(owner).name;
      const emoji = duty.kind === 'morning' ? '🌅' : duty.kind === 'evening' ? '🌙' : '🧹';
      const title = who ? `${emoji} ${dutyTitle(duty)}` : `${emoji} ${name}: ${dutyTitle(duty)}`;
      const body = duty.kind === 'clean'
        ? `${duty.job.desc}\nDue Sunday 8 pm. Check it off in House Quest to earn points!`
        : `${CHECKLISTS[duty.kind].map((t) => '• ' + t).join('\n')}\nCheck it off in House Quest to earn points!`;
      const entry = [
        `UID:${duty.id}-${owner}@house-quest`, `DTSTAMP:${stamp}`,
        `DTSTART:${local(start)}`, `DTEND:${local(end)}`, `SUMMARY:${esc(title)}`,
        `DESCRIPTION:${esc(body)}`,
      ];
      if (who) for (const t of ALARMS[duty.kind]) entry.push(...alarm(t, `${title} — your turn, ${name}!`));
      ev(entry);
    }
    // Laundry priority as all-day events
    const lp = LAUNDRY[d.getDay()];
    if (!who || lp === who) {
      const label = lp ? (who ? '🧺 Your laundry priority day' : `🧺 Laundry: ${person(lp).name}`) : '🧺 Laundry: open to all';
      ev([`UID:laundry-${dateOnly(d)}@house-quest`, `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${dateOnly(d)}`, `DTEND;VALUE=DATE:${dateOnly(addDays(d, 1))}`,
        `SUMMARY:${esc(label)}`, 'TRANSP:TRANSPARENT']);
    }
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

export const FEEDS = [...ROOMMATES.map((r) => ({ file: `${r.id}.ics`, who: r.id, name: `${r.name} — House Quest` })),
  { file: 'house.ics', who: null, name: 'House Quest — everyone' }];
