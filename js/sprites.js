// 16x24 pixel-art heroes, hand-drawn from the three roommate photos (outfits + hair + beard, not faces).
// '.' = transparent. Each letter maps to a colour in the sprite's palette.

export const SPRITES = {
  // Photo 1: tidy dark hair, light stubble, navy cardigan over white tee, sunglasses on the collar, wristwatch
  s1: {
    label: 'Navy Cardigan',
    pal: { H: '#1c1512', S: '#b9794e', B: '#4a342c', E: '#15110f', M: '#8a3f33', W: '#f3f3f0', N: '#1f2a4a', P: '#161d36', K: '#0d0d12', G: '#5a4040', T: '#d4bd5a' },
    rows: [
      '................',
      '.....HHHHHH.....',
      '....HHHHHHHH....',
      '....HHHHHHHH....',
      '....HSSSSSSH....',
      '....SSSSSSSS....',
      '....SESSSSES....',
      '....SSSSSSSS....',
      '....SBBMMBBS....',
      '.....BBBBBB.....',
      '......SSSS......',
      '...NNNWWWWNNN...',
      '...NNNWGWWNNN...',
      '...NNNWWWWNNN...',
      '...NNNWWWWNNN...',
      '...NNNWWWWNNN...',
      '...SNNWWWWNNT...',
      '....PPPPPPPP....',
      '....PPPPPPPP....',
      '....PPPPPPPP....',
      '....PPP..PPP....',
      '....PPP..PPP....',
      '....PPP..PPP....',
      '...KKKK..KKKK...',
    ],
  },
  // Photo 2: big dark curls, black sunglasses, huge grin, olive overshirt over striped tee
  s2: {
    label: 'Curly Shades',
    pal: { H: '#2a1a14', S: '#c98d63', G: '#0a0a0e', T: '#ffffff', M: '#8a3f33', O: '#6f7348', D: '#17171c', W: '#f2efe6', P: '#2d3650', K: '#e8e8e8' },
    rows: [
      '....H.HHHH.H....',
      '...HHHHHHHHHH...',
      '...HHHHHHHHHH...',
      '...HHHSSSSHHH...',
      '..HHSSSSSSSSHH..',
      '...HGGGSSGGGH...',
      '...HGGGSSGGGH...',
      '....SSSSSSSS....',
      '....SSTTTTSS....',
      '.....SSSSSS.....',
      '......SSSS......',
      '...OOOWWWWOOO...',
      '...OOODDDDOOO...',
      '...OOOWWWWOOO...',
      '...OOODDDDOOO...',
      '...OOOWWWWOOO...',
      '...SOODDDDOOS...',
      '....PPPPPPPP....',
      '....PPPPPPPP....',
      '....PPPPPPPP....',
      '....PPP..PPP....',
      '....PPP..PPP....',
      '....PPP..PPP....',
      '...KKKK..KKKK...',
    ],
  },
  // Photo 3: beige cap, moustache + beard, cream zip jacket over dark tee, olive corduroy trousers
  s3: {
    label: 'Cap & Corduroy',
    pal: { C: '#dcc9a3', c: '#b39f7b', S: '#e2b595', B: '#6e4b36', E: '#1d1d1d', M: '#b8605a', J: '#d9d1bd', Z: '#8d8a80', U: '#3b3733', P: '#6e5c32', K: '#463627' },
    rows: [
      '................',
      '.....CCCCCC.....',
      '....CCCCCCCC....',
      '....CCCCCCCC....',
      '...cccccccccc...',
      '....SSSSSSSS....',
      '....SESSSSES....',
      '....SSSSSSSS....',
      '....SBBBBBBS....',
      '.....BBMMBB.....',
      '......BBBB......',
      '...JJJUUUUJJJ...',
      '...JJJJZZJJJJ...',
      '...JJJJZZJJJJ...',
      '...JJJJZZJJJJ...',
      '...JJJJZZJJJJ...',
      '...SJJJZZJJJS...',
      '....PPPPPPPP....',
      '....PPPPPPPP....',
      '....PPPPPPPP....',
      '....PPP..PPP....',
      '....PPP..PPP....',
      '....PPP..PPP....',
      '...KKKK..KKKK...',
    ],
  },
};
export const SPRITE_KEYS = Object.keys(SPRITES);

// Grey "?" hero shown until a roommate picks their character.
const GENERIC = {
  pal: { H: '#555a66', S: '#7b8190', B: '#555a66', E: '#2a2d35', M: '#2a2d35', W: '#9aa0ad', N: '#666c7a', P: '#4a4f5b', K: '#2a2d35', G: '#555a66', T: '#9aa0ad' },
  rows: SPRITES.s1.rows,
};

const CROWN = ['Y..YY..Y', 'YYYYYYYY', 'YRYYYYRY', 'YYYYYYYY'];
const SWEAT = [[12, 8], [12, 9]];
const TOP = 5; // canvas rows above the sprite (room for the crown)
const cache = new Map();

/** Returns a data-URL PNG of the sprite (16 x 29 px). Display it with `image-rendering: pixelated`. */
export function spriteURL(key, { crown = false, sweat = false } = {}) {
  const id = `${key}|${crown}|${sweat}`;
  if (cache.has(id)) return cache.get(id);
  const def = SPRITES[key] || GENERIC;
  const c = document.createElement('canvas');
  c.width = 16; c.height = 24 + TOP;
  const g = c.getContext('2d');
  def.rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.') return;
    g.fillStyle = def.pal[ch]; g.fillRect(x, y + TOP, 1, 1);
  }));
  if (crown) CROWN.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.') return;
    g.fillStyle = ch === 'R' ? '#ef4444' : '#fbbf24'; g.fillRect(x + 4, y + 1, 1, 1);
  }));
  if (sweat) SWEAT.forEach(([x, y]) => { g.fillStyle = '#7dd3fc'; g.fillRect(x, y + TOP - 2, 1, 1); });
  const url = c.toDataURL('image/png');
  cache.set(id, url);
  return url;
}
