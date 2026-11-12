// Pixel UI kit from the "Pocket Inventory" pack: icon sprites (replace emojis), recoloured 9-slice panels, nav orbs.
import { ROOMMATES } from './schedule.js';

const ICONS = ['house', 'heart', 'x', 'alert', 'save', 'chest', 'face', 'dumbbell', 'gamepad', 'headphones', 'clover', 'notebook', 'gem', 'key', 'log',
  'bandage', 'medkit', 'mail', 'apple', 'melon', 'pine', 'cherry', 'acorn', 'scroll', 'wrench', 'pencil', 'bag'];
// emoji → icon name ('' = just drop it)
const MAP = {
  '🏠': 'house', '🗓': 'notebook', '🏆': 'gem', '🏅': 'gem', '🛏': 'chest', '🎁': 'chest', '📅': 'mail', '📜': 'scroll', '🛡': 'medkit',
  '🚩': 'alert', '🚨': 'alert', '⚠': 'alert', '☣': 'alert', '❌': 'x', '✖': 'x', '✕': 'x', '❤': 'heart', '🖤': 'heart dim',
  '💾': 'save', '☁': 'save', '🔑': 'key', '🤥': 'face', '🦹': 'face', '✅': 'clover', '🟠': 'pine', '🌅': 'melon', '✨': 'clover',
  '🔥': 'cherry', '🤝': 'bandage', '🧼': 'pine', '🐉': 'gamepad', '👑': 'gem', '👕': 'bag', '🐦': 'apple', '😇': 'clover', '👀': 'pencil', '📋': 'notebook',
};
const KNOWN = new Set(ICONS);
const RE = /(\p{Extended_Pictographic}\uFE0F?|[✔✖✕✓⇄⬇])\s?/gu, HAS = /\p{Extended_Pictographic}|[✔✖✕✓⇄⬇]/u;

const load = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });
const url = (n) => new URL(`../img/ui/${n}.png`, import.meta.url).href;
const px = (g, f, x, y, w, h) => { g.fillStyle = f; g.fillRect(x, y, w, h); };

function bbox(c) {
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
}

// recolour a frame sprite: black outline stays; hue (0-360) either rotates (buttons) or colourises grey (panels); light scales brightness
function tint(img, { rot = 0, hue = null, sat = 0.35, light = 1, alpha = 1 }) {
  const w = img.width, h = img.height, c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  const id = g.getImageData(0, 0, w, h), d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    let r = d[i] / 255, gg = d[i + 1] / 255, b = d[i + 2] / 255;
    const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b); let l = (mx + mn) / 2, s = 0, hh = 0;
    if (mx !== mn) { const dd = mx - mn; s = l > 0.5 ? dd / (2 - mx - mn) : dd / (mx + mn); hh = mx === r ? ((gg - b) / dd + (gg < b ? 6 : 0)) : mx === gg ? (b - r) / dd + 2 : (r - gg) / dd + 4; hh *= 60; }
    if (l < 0.12) continue;                       // outline
    if (hue != null) { hh = hue; s = Math.max(s, sat); } else hh = (hh + rot + 360) % 360;
    l = Math.min(1, l * light);
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = (t) => { t = (t + 360) % 360 / 360; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    d[i] = Math.round(f(hh + 120) * 255); d[i + 1] = Math.round(f(hh) * 255); d[i + 2] = Math.round(f(hh - 120) * 255); d[i + 3] = Math.round(d[i + 3] * alpha);
  }
  g.putImageData(id, 0, 0);
  return `url(${c.toDataURL('image/png')})`;
}
const hueOf = (hex) => { const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255, mx = Math.max(r, g, b), d = mx - Math.min(r, g, b);
  return d ? (60 * (mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4)) : 0; };

export async function initUI() {
  const [frame, blue, orange, ...icons] = await Promise.all([load(url('frame')), load(url('slot-blue')), load(url('slot-orange')), ...ICONS.map((n) => load(url(n)))]);
  let css = ':root{';
  if (frame && blue && orange) {
    // panels: grey frame colourised + darkened; buttons: blue/orange slots, hue-rotated
    const P = { card: { hue: 215, sat: 0.1, light: 0.30 }, hi: { hue: 205, sat: 0.2, light: 0.36 }, ok: { hue: 150, sat: 0.35, light: 0.34 }, bad: { hue: 350, sat: 0.4, light: 0.36 },
      gold: { hue: 42, sat: 0.4, light: 0.36 }, blue: { hue: 215, sat: 0.45, light: 0.38 }, ghost: { hue: 215, sat: 0.08, light: 0.22, alpha: 0.35 }, toast: { hue: 42, sat: 0.9, light: 1.2 } };
    for (const [k, o] of Object.entries(P)) css += `--px-${k}:${tint(frame, o)};`;
    css += `--px-btn:${tint(blue, {})};--px-go:${tint(blue, { rot: -75 })};--px-warn:${tint(orange, {})};`;
    for (const r of ROOMMATES) css += `--px-${r.id}-on:${tint(orange, { rot: hueOf(r.color) - 36 })};--px-${r.id}-off:${tint(frame, { hue: hueOf(r.color), sat: 0.45, light: 0.3, alpha: 0.6 })};`;
  }
  css += '}';
  icons.forEach((im, i) => {
    if (!im) return;
    const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; c.getContext('2d').drawImage(im, 0, 0);
    const [x, y, w, h] = bbox(c), o = document.createElement('canvas'); o.width = w; o.height = h; o.getContext('2d').drawImage(c, x, y, w, h, 0, 0, w, h);
    css += `.ic.n-${ICONS[i]}{--w:${w};--h:${h};background-image:url(${o.toDataURL('image/png')})}`;
  });
  const st = document.createElement('style'); st.textContent = css; document.head.append(st);
}

// swap emoji in rendered text for pixel icons (or drop them)
export function iconize(root) {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (HAS.test(n.nodeValue) && !n.parentElement.closest('script,style,textarea,input,[data-noicon]') ? 1 : 2) });
  const nodes = []; for (let n = w.nextNode(); n; n = w.nextNode()) nodes.push(n);
  for (const n of nodes) {
    const f = document.createDocumentFragment(); let last = 0; const s = n.nodeValue; RE.lastIndex = 0;
    for (let m; (m = RE.exec(s));) {
      f.append(s.slice(last, m.index)); last = RE.lastIndex;
      const name = MAP[m[1].replace('️', '')] || '';
      if (name && KNOWN.has(name.split(' ')[0])) { const i = document.createElement('i'); i.className = `ic n-${name.split(' ')[0]}${name.includes('dim') ? ' dim' : ''}`; f.append(i); }
    }
    f.append(s.slice(last)); n.replaceWith(f);
  }
}
