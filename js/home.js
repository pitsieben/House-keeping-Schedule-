// The house and its garden (top-down pixel art, Craftpix "Main characters home" free pack, see img/home/CREDITS.txt).
// Each roommate looks after one plant: it thrives while their room is tidy and withers when it isn't.
export const HOME_W = 240, HOME_H = 192;
const SHEET = new URL('../img/home/exterior.png', import.meta.url).href;
export const SMOKE = new URL('../img/home/Smoke_animation.png', import.meta.url).href;
// [x, y, w, h] on exterior.png
const S = {
  house: [12, 0, 134, 128], cobble: [8, 134, 34, 34],
  appleL: [1, 324, 61, 73], appleR: [135, 336, 51, 64], bushBig: [3, 227, 43, 44],
  tree: [65, 320, 62, 78], dirt: [9, 281, 31, 31], stump: [48, 272, 32, 32], rocks: [91, 272, 69, 25],
};
let sheet;
const load = () => sheet || (sheet = new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = SHEET; }));

// spots: one per roommate (id → [sprite, x, y, witheredSprite]); a lit window at night is not needed, the house is always cosy
const SPOTS = { paco: ['appleL', 0, 119, 'dirt'], pit: ['bushBig', 88, 146, 'dirt'], hrithik: ['appleR', 189, 128, 'dirt'] };
export const HOME_SPOTS = SPOTS;

// dirts: { id: dirt level 0..5 }; returns a canvas
export async function drawHome(canvas, dirts = {}) {
  const img = await load();
  canvas.width = HOME_W; canvas.height = HOME_H;
  const g = canvas.getContext('2d'); g.imageSmoothingEnabled = false;
  const draw = (k, x, y) => { const [sx, sy, w, h] = S[k]; g.drawImage(img, sx, sy, w, h, x, y, w, h); };
  g.fillStyle = '#86a85c'; g.fillRect(0, 0, HOME_W, HOME_H);
  // grass speckle, deterministic
  let s = 7; const r = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  for (let i = 0; i < 160; i++) { g.fillStyle = r() < 0.5 ? '#7a9c52' : '#94b567'; g.fillRect(Math.floor(r() * HOME_W), Math.floor(r() * HOME_H), 2, 1); }
  draw('tree', 150, 6);                         // big shade tree behind the house, right
  draw('house', 53, 30);
  draw('cobble', 151 - 17, 158);                // path from the front door
  for (const [who, [k, x, y, dead]] of Object.entries(SPOTS)) {
    const bad = (dirts[who] ?? 0) >= 3;
    draw(bad ? dead : k, x + (bad ? 6 : 0), y + (bad ? 12 : 0));
  }
  return canvas;
}
