// Makes the wall photos and the walk-through video, in the Real style.
//
//   node tools/tour.mjs photos     one photo of every wall of every room, plus the outside
//   node tools/tour.mjs video      the full house tour as MP4 (1080p and 720p)
//   node tools/tour.mjs check      checks the tour route and saves small sample frames
//   node tools/tour.mjs stills     saves a sheet of stills from the finished video
//   node tools/tour.mjs info       prints the graphics card in use and everything that blocks the walker
//
// The photos, the 720p video and the page that shows them go to public/tour, which is
// published with the site. The 1080p video and the check sheets go to "tour", which is
// not. Needs two packages that are not in package.json:
//   npm install --no-save playwright-core mp4-muxer
// and Google Chrome installed on this computer.

import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const plan = JSON.parse(await fs.readFile(path.join(root, 'src/data/plan.json'), 'utf8'));
const siteDir = path.join(root, 'public', 'tour'); // published with the site: photos, the page that shows them, the 720p video
const localDir = path.join(root, 'tour'); // stays on this computer: the 1080p video (too large for GitHub) and check sheets
const mode = process.argv[2] ?? 'photos';
const FPS = 30;

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const lerp = (a, b, k) => a + (b - a) * k;
const smoothstep = (t) => t * t * (3 - 2 * t);

// ------------------------------------------------------------------ browser
async function open({ width, height, scale = 1 }) {
  const server = await createServer({ root, logLevel: 'error', server: { port: 5199 } });
  await server.listen();
  const url = server.resolvedUrls.local[0];
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
  });
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale, acceptDownloads: true });
  const page = await context.newPage();
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' || t.startsWith('[tour]')) console.log(t);
  });
  page.on('pageerror', (e) => console.log('page error:', e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.__walk);
  const gpu = await page.evaluate(async () => {
    const w = window.__walk;
    w.enter(true); // skip the opening view
    w.look('real', false); // Real style, daytime
    // draw a few frames so every texture is uploaded before anything is saved
    for (let i = 0; i < 6; i++) {
      w.shot({ x: 6.2, z: 2.2, heading: i * 60 });
      await new Promise((r) => setTimeout(r, 60));
    }
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
  });
  const close = async () => {
    await browser.close();
    await server.close();
  };
  return { page, gpu, close };
}

const saveDataUrl = (file, dataUrl) => fs.writeFile(file, Buffer.from(dataUrl.split(',')[1], 'base64'));

// ------------------------------------------------------------------ wall photos
// Each photo looks square-on at one wall, with the wall filling 80% of the
// picture's height. In the larger rooms the camera stands inside the room, just
// in front of the opposite wall. The small rooms are too shallow for that, so
// there the camera stands behind the opposite wall and that wall is left out.
const SIDES = [
  { id: 'north', heading: 0 },
  { id: 'east', heading: 90 },
  { id: 'south', heading: 180 },
  { id: 'west', heading: 270 },
];

/** How much of one side of a room is actual wall (0..1); the rest is open to the next space. */
function wallCover(room, side) {
  const near = (a, b) => Math.abs(a - b) < 1e-3;
  const alongX = side === 'north' || side === 'south';
  const [s0, s1] = alongX ? [room.x0, room.x1] : [room.z0, room.z1];
  let covered = 0;
  for (const w of plan.walls) {
    const horizontal = w.x1 - w.x0 > w.z1 - w.z0;
    if (horizontal !== alongX) continue;
    const touches =
      (side === 'north' && near(w.z1, room.z0)) ||
      (side === 'south' && near(w.z0, room.z1)) ||
      (side === 'west' && near(w.x1, room.x0)) ||
      (side === 'east' && near(w.x0, room.x1));
    if (!touches) continue;
    const lo = Math.max(s0, alongX ? w.x0 : w.z0);
    const hi = Math.min(s1, alongX ? w.x1 : w.z1);
    if (hi > lo) covered += hi - lo;
  }
  return covered / (s1 - s0);
}

const TALL = ['wardrobe', 'fridge', 'storage unit', 'bookshelf', 'mandir', 'door'];

function wallShots(colliders) {
  const FOV = 55;
  const half = plan.heights.ceiling / 2 / 0.8; // the wall fills 80% of the picture's height
  const D = half / Math.tan(rad(FOV / 2));
  const shots = [];
  for (const room of plan.rooms) {
    const xm = (room.x0 + room.x1) / 2;
    const zm = (room.z0 + room.z1) / 2;
    for (const side of SIDES) {
      const alongX = side.id === 'north' || side.id === 'south';
      const width = alongX ? room.x1 - room.x0 : room.z1 - room.z0;
      const depth = alongX ? room.z1 - room.z0 : room.x1 - room.x0;
      const inside = depth >= 2.75; // deep enough to photograph from inside the room
      const d = inside ? Math.min(D, depth - 0.3) : D;
      const fov = deg(2 * Math.atan(half / d));
      const cam = { x: xm, y: plan.heights.ceiling / 2, z: zm };
      if (side.id === 'north') cam.z = room.z0 + d;
      if (side.id === 'south') cam.z = room.z1 - d;
      if (side.id === 'west') cam.x = room.x0 + d;
      if (side.id === 'east') cam.x = room.x1 - d;
      let near = inside ? 0.05 : d - depth + 0.02;
      // standing inside a tall piece of furniture: start the picture just past it
      for (const c of colliders) {
        if (!TALL.includes(c.tag)) continue;
        if (cam.x < c.x0 - 0.06 || cam.x > c.x1 + 0.06 || cam.z < c.z0 - 0.06 || cam.z > c.z1 + 0.06) continue;
        const out = { north: cam.z - c.z0, south: c.z1 - cam.z, west: cam.x - c.x0, east: c.x1 - cam.x }[side.id];
        near = Math.max(near, out + 0.03);
      }
      const fit = (width / 2) * 1.06 / half;
      const allowed = inside ? 2.2 : ((width / 2 - 0.005) * d) / (near * half);
      const aspect = Math.min(2.2, Math.max(fit, Math.min(0.75, allowed)));
      const cover = wallCover(room, side.id);
      const what = cover > 0.95 ? `${side.id} wall` : cover > 0.2 ? `${side.id} wall (part open)` : `${side.id} side (open)`;
      shots.push({
        file: `${room.id}-${side.id}.jpg`,
        group: room.name,
        title: `${room.name} · ${what}`,
        aspect,
        cam: { ...cam, heading: side.heading, pitch: 0, fov, near },
      });
    }
  }
  return shots;
}

function outsideShots() {
  const fp = plan.footprint;
  const p = plan.plot;
  const e = plan.terrace.extend;
  const slab = { x0: fp.x0 - e.west, x1: fp.x1 + e.east, z0: fp.z0 - e.north, z1: fp.z1 + e.south };
  const FOV = 40;
  const aspect = 16 / 9;
  const tanH = Math.tan(rad(FOV / 2)) * aspect;
  const xm = (slab.x0 + slab.x1) / 2;
  const zm = (slab.z0 + slab.z1) / 2;
  const y = 2.3;
  const dist = (w) => (w / 2) * 1.1 / tanH;
  const shots = [];
  const add = (id, title, cam) => shots.push({ file: `outside-${id}.jpg`, group: 'Outside', title: `Outside · ${title}`, aspect, cam: { y, pitch: 0, fov: FOV, outdoor: 1, ...cam } });
  // square-on views of the four sides; the compound wall and anything beyond it are left out
  let d = dist(slab.x1 - slab.x0);
  add('north', 'north side (main entrance)', { x: xm, z: slab.z0 - d, heading: 180, near: Math.max(0.1, p.z0 + 0.05 - (slab.z0 - d)) });
  add('south', 'south side (road side)', { x: xm, z: slab.z1 + d, heading: 0, near: Math.max(0.1, slab.z1 + d - (p.z1 - 0.05)) });
  d = dist(slab.z1 - slab.z0);
  add('east', 'east side', { x: slab.x1 + d, z: zm, heading: 270, near: slab.x1 + d - 12.3 }); // starts past the trees and the washing line
  add('west', 'west side', { x: slab.x0 - d, z: zm, heading: 90, near: Math.max(0.1, p.x0 + 0.05 - (slab.x0 - d)) });
  // two views from above
  const aim = (pos, look) => {
    const dx = look[0] - pos[0];
    const dy = look[1] - pos[1];
    const dz = look[2] - pos[2];
    return { x: pos[0], y: pos[1], z: pos[2], heading: deg(Math.atan2(dx, -dz)), pitch: deg(Math.atan2(dy, Math.hypot(dx, dz))), fov: 45, near: 0.1 };
  };
  add('from-north-east', 'from the north-east', aim([17.5, 10.5, -9.5], [4.4, 1.2, 4.6]));
  add('from-south-east', 'from the south-east', aim([18.5, 10.5, 19.5], [4.4, 1.2, 5.6]));
  add('terrace', 'terrace', aim([-0.3, 6.6, -1.2], [5.6, 3.1, 6.4]));
  return shots;
}

async function photos() {
  const only = process.argv[3];
  const { page, gpu, close } = await open({ width: 900, height: 750, scale: 2 });
  console.log('graphics:', gpu);
  const colliders = await page.evaluate(() => window.__walk.colliders.map((c) => ({ ...c })));
  const shots = [...wallShots(colliders), ...outsideShots()];
  await fs.mkdir(path.join(siteDir, 'walls'), { recursive: true });
  for (const s of shots) {
    if (only && !s.file.includes(only)) continue;
    const h = 750;
    const w = Math.round(h * s.aspect);
    await page.setViewportSize({ width: w, height: h });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const url = await page.evaluate((cam) => {
      window.__walk.shot(cam);
      return document.getElementById('view').toDataURL('image/jpeg', 0.93);
    }, s.cam);
    await saveDataUrl(path.join(siteDir, 'walls', s.file), url);
    console.log(s.file, `${w * 2}x${h * 2}`, s.title, `fov ${s.cam.fov.toFixed(0)} near ${s.cam.near.toFixed(2)}`);
  }
  if (!only) await fs.writeFile(path.join(siteDir, 'index.html'), galleryPage(shots));
  await close();
}

/** One page to look through everything: the video on top, then the photos room by room. */
function galleryPage(shots) {
  const groups = [...new Set(shots.map((s) => s.group))];
  const section = (g) =>
    `<h2>${g}</h2>\n<div class="grid">\n` +
    shots
      .filter((s) => s.group === g)
      .map((s) => `<figure><a href="walls/${s.file}"><img loading="lazy" src="walls/${s.file}" alt="${s.title}"></a><figcaption>${s.title.split(' · ')[1]}</figcaption></figure>`)
      .join('\n') +
    '\n</div>';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>House tour and wall photos</title>
<link rel="icon" href="data:,">
<style>
  :root { color-scheme: light dark; --bg: #f4f2ee; --fg: #1c1e21; --muted: #5f646b; --card: #fff; }
  @media (prefers-color-scheme: dark) { :root { --bg: #17191c; --fg: #eceae6; --muted: #a2a7ae; --card: #22252a; } }
  body { margin: 0; padding: 24px 16px 48px; background: var(--bg); color: var(--fg); font: 16px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 1200px; margin: 0 auto; }
  h1 { font-size: 24px; margin: 0 0 16px; }
  h2 { font-size: 18px; margin: 32px 0 10px; }
  video { width: 100%; border-radius: 10px; background: #000; display: block; }
  p { color: var(--muted); margin: 8px 0 0; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 12px; align-items: start; }
  figure { margin: 0; background: var(--card); border-radius: 10px; overflow: hidden; }
  img { width: 100%; display: block; }
  figcaption { padding: 8px 10px; font-size: 14px; }
  a { color: inherit; }
  .back { margin: 0 0 14px; }
  .back a { display: inline-block; padding: 9px 14px; border-radius: 10px; background: var(--card); color: var(--fg); font-weight: 600; text-decoration: none; }
</style>
</head>
<body>
<main>
<p class="back"><a href="../index.html">Walk-through</a></p>
<h1>House tour and wall photos</h1>
<video controls playsinline preload="metadata" src="house-tour-720p.mp4"></video>
<p><a href="house-tour-720p.mp4" download>Download the video</a>. Tap a photo to open it full size.</p>
${groups.map(section).join('\n')}
</main>
</body>
</html>
`;
}

// ------------------------------------------------------------------ the tour route
const HOUSE_MID = [4.04, 1.0, 5.33];
const ORBIT_R = 19; // the opening and closing views circle the house at this distance and height
const ORBIT_H = 14.5;
const EYE = 1.6;

function buildTour() {
  const raw = [];
  const cur = { x: 0, y: EYE, z: 0, h: 0, p: 0, fov: 50, free: true, label: null };
  const push = () => raw.push({ ...cur });
  const nearest = (h, ref) => h + 360 * Math.round((ref - h) / 360);
  const aimAt = (look) => {
    const dx = look[0] - cur.x;
    const dy = look[1] - cur.y;
    const dz = look[2] - cur.z;
    cur.h = nearest(deg(Math.atan2(dx, -dz)), cur.h);
    cur.p = deg(Math.atan2(dy, Math.hypot(dx, dz)));
  };
  let lookPoint = [...HOUSE_MID];

  /** Circle the house from above. Angles are clockwise from north, as seen from the house. */
  function orbit({ from, to, secs, r = ORBIT_R, height = ORBIT_H }) {
    const n = Math.round(secs * FPS);
    cur.free = true;
    cur.label = '';
    cur.fov = 50;
    for (let i = 0; i < n; i++) {
      const a = rad(lerp(from, to, i / (n - 1)));
      cur.x = HOUSE_MID[0] + r * Math.sin(a);
      cur.y = height;
      cur.z = HOUSE_MID[2] - r * Math.cos(a);
      aimAt(HOUSE_MID);
      push();
    }
    lookPoint = [...HOUSE_MID];
  }

  /** Glide from where the camera is to another point, turning to look at a new target. */
  function fly({ pos, look, fov = cur.fov, secs, label = '' }) {
    const n = Math.round(secs * FPS);
    const p0 = [cur.x, cur.y, cur.z];
    const l0 = lookPoint;
    const f0 = cur.fov;
    cur.free = true;
    cur.label = label;
    for (let i = 1; i <= n; i++) {
      const k = smoothstep(i / n);
      cur.x = lerp(p0[0], pos[0], k);
      cur.y = lerp(p0[1], pos[1], k);
      cur.z = lerp(p0[2], pos[2], k);
      cur.fov = lerp(f0, fov, k);
      aimAt([lerp(l0[0], look[0], k), lerp(l0[1], look[1], k), lerp(l0[2], look[2], k)]);
      push();
    }
    lookPoint = [...look];
  }

  function hold(secs, { pitch = cur.p } = {}) {
    const n = Math.round(secs * FPS);
    const p0 = cur.p;
    for (let i = 1; i <= n; i++) {
      cur.p = lerp(p0, pitch, smoothstep(i / n));
      push();
    }
  }

  /** Turn on the spot by delta degrees (positive = clockwise, to the right). */
  function turn(delta, secs, { pitch = cur.p } = {}) {
    const n = Math.round(secs * FPS);
    const h0 = cur.h;
    const p0 = cur.p;
    for (let i = 1; i <= n; i++) {
      const k = smoothstep(i / n);
      cur.h = h0 + delta * k;
      cur.p = lerp(p0, pitch, k);
      push();
    }
  }

  /** Turn the short way round to face a compass heading. */
  function face(heading, opts = {}) {
    const delta = nearest(heading, cur.h) - cur.h;
    turn(delta, opts.secs ?? Math.max(0.7, Math.abs(delta) / 65), opts);
  }

  /** Walk through a list of points [x, z] or [x, z, eye height], looking where you are going. */
  function walk(points, { speed = 1.0, pitch = 0, fov = 65, free = false, label = null } = {}) {
    const pts = [[cur.x, cur.z, cur.y]];
    for (const p of points) pts.push([p[0], p[1], p[2] ?? pts[pts.length - 1][2]]);
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const total = cum[cum.length - 1];
    const at = (s) => {
      s = Math.max(0, Math.min(total, s));
      let i = 1;
      while (i < pts.length - 1 && cum[i] < s) i++;
      const k = cum[i] - cum[i - 1] > 1e-9 ? (s - cum[i - 1]) / (cum[i] - cum[i - 1]) : 0;
      return [lerp(pts[i - 1][0], pts[i][0], k), lerp(pts[i - 1][1], pts[i][1], k), lerp(pts[i - 1][2], pts[i][2], k)];
    };
    const AHEAD = 0.9;
    const dirAt = (s) => {
      const a = at(s);
      const b = at(s + AHEAD);
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.3) return null;
      return deg(Math.atan2(b[0] - a[0], -(b[1] - a[1])));
    };
    cur.free = free;
    cur.label = label;
    cur.fov = fov;
    const first = dirAt(0);
    if (first !== null) {
      const delta = nearest(first, cur.h) - cur.h;
      if (Math.abs(delta) > 40) turn(delta, Math.max(0.7, Math.abs(delta) / 75), { pitch });
    }
    const p0 = cur.p;
    const n = Math.max(1, Math.round((total / speed) * FPS));
    for (let i = 1; i <= n; i++) {
      const s = (total * i) / n;
      [cur.x, cur.z, cur.y] = at(s);
      const d = dirAt(s);
      if (d !== null) cur.h = nearest(d, cur.h);
      cur.p = lerp(p0, pitch, Math.min(1, i / (FPS * 0.8)));
      push();
    }
  }

  const stair = plan.stair;
  const roofTop = plan.heights.ceiling + plan.heights.slab;
  const rise = roofTop / 14;
  const stairRun = (stair.x1 - stair.landingTo) / 13;
  const stepY = (x) => EYE + rise * (1.5 + (x - stair.landingTo) / stairRun);
  const roofEye = EYE + roofTop;

  // ---- 1. the whole house from above, then down to the main entrance
  orbit({ from: 150, to: 28, secs: 15 });
  fly({ pos: [6.5, 1.7, -4.8], look: [6.5, 1.5, 3.0], fov: 65, secs: 4.5, label: 'Outside' });
  cur.h = nearest(180, cur.h);
  walk([[6.5, -1.5, 1.65], [6.5, 0.6, EYE], [6.3, 2.1]], { speed: 1.3, free: false });

  // ---- 2. Hall
  turn(360, 12.5);
  walk([[5.2, 2.9], [5.2, 4.7], [5.15, 5.6]]);

  // ---- 3. Kitchen
  walk([[5.2, 6.9], [5.8, 8.35]]);
  face(90);
  hold(0.8);
  turn(185, 8.5);

  // ---- 4. Pooja
  walk([[5.25, 7.0], [5.1, 5.75], [5.7, 5.67], [6.3, 5.67]]);
  hold(1.2);
  hold(1.6, { pitch: 14 });
  hold(1.4, { pitch: 0 });

  // ---- 5. Lobby and C. Bed Room
  walk([[5.3, 5.75], [3.62, 5.3], [3.62, 3.3], [3.4, 2.5]]);
  turn(-205, 9.5);
  walk([[3.62, 3.3], [3.62, 4.35]]);

  // ---- 6. Toilet 1
  walk([[3.0, 4.33], [2.3, 4.33]]);
  hold(0.8, { pitch: -8 });
  turn(-32, 1.8, { pitch: -10 });
  turn(55, 2.6, { pitch: -10 });
  turn(-23, 1.4, { pitch: -4 });
  turn(-180, 2.6, { pitch: 0 }); // turn round away from the open door leaf

  // ---- 7. M. Bed Room and Toilet 2
  walk([[3.0, 4.33], [3.62, 5.4], [3.62, 6.9], [3.0, 7.75]]);
  face(150);
  turn(235, 10.5);
  walk([[1.9, 7.45], [1.89, 6.56]]);
  hold(0.8, { pitch: -8 });
  turn(-34, 1.8, { pitch: -10 });
  turn(50, 2.4, { pitch: -10 });
  turn(-16, 1.2, { pitch: -4 });
  turn(-185, 2.6, { pitch: 0 }); // turn round away from the open door leaf

  // ---- 8. back through the house and out by the kitchen's south door
  walk([[2.3, 7.45], [3.5, 7.5], [3.62, 6.6], [3.75, 5.9], [5.0, 5.9], [5.3, 7.1], [5.3, 9.6], [5.2, 10.55], [5.3, 11.3]], { speed: 1.25 });

  // ---- 9. round the east side to the front, and the outside staircase
  walk([[8.8, 11.3], [11.0, 9.0]], { speed: 1.9 });
  face(140);
  hold(1.5);
  walk([[10.9, 3.0], [9.6, -2.9], [3.8, -3.1], [0.42, -3.0], [0.42, -2.2]], { speed: 2.1 });
  walk([[0.42, -1.6, EYE + rise], [0.42, -0.93], [stair.landingTo, -0.93, stepY(stair.landingTo)]], { speed: 0.9, free: true, label: 'Staircase' });
  walk([[2.95, -0.93, stepY(2.95)], [3.0, -0.45, roofEye], [2.95, 0.5]], { speed: 0.65, pitch: 8, free: true, label: 'Staircase' });

  // ---- 10. Terrace
  walk([[3.2, 1.6], [4.4, 4.9]], { speed: 1.1, free: true, label: 'Terrace', pitch: -4 });
  turn(360, 11, { pitch: -6 });

  // ---- 11. lift off and finish on the whole house again
  cur.h = ((cur.h % 360) + 360) % 360;
  lookPoint = [cur.x + 3 * Math.sin(rad(cur.h)), cur.y - 0.3, cur.z - 3 * Math.cos(rad(cur.h))];
  const a = rad(40);
  fly({ pos: [HOUSE_MID[0] + ORBIT_R * Math.sin(a), ORBIT_H, HOUSE_MID[2] - ORBIT_R * Math.cos(a)], look: HOUSE_MID, fov: 50, secs: 6 });
  orbit({ from: 40, to: 70, secs: 5 });

  // ---- smooth everything so starts, stops and corners are gentle
  const smooth = (key, tau) => {
    const k = 1 - Math.exp(-1 / (tau * FPS));
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 1; i < raw.length; i++) raw[i][key] = raw[i - 1][key] + k * (raw[i][key] - raw[i - 1][key]);
      raw.reverse();
    }
  };
  // headings are continuous within a section; make them continuous across the whole tour too
  for (let i = 1; i < raw.length; i++) raw[i].h = nearest(raw[i].h, raw[i - 1].h);
  for (const key of ['x', 'y', 'z']) smooth(key, 0.16);
  for (const key of ['h', 'p', 'fov']) smooth(key, 0.3);

  // ---- which room each frame is in
  const fp = plan.footprint;
  let last = 'Outside';
  for (const f of raw) {
    if (f.label === null) {
      const inside = f.x > fp.x0 && f.x < fp.x1 && f.z > fp.z0 && f.z < fp.z1;
      if (!inside) last = 'Outside';
      else last = plan.rooms.find((r) => f.x >= r.x0 && f.x <= r.x1 && f.z >= r.z0 && f.z <= r.z1)?.name ?? last;
      f.label = last;
    } else if (f.label) last = f.label;
  }
  // sunlight setting: 1 outdoors, 0 indoors, changing over about a second as a camera's exposure does
  const rooms = new Set(plan.rooms.map((r) => r.name));
  for (const f of raw) f.out = rooms.has(f.label) ? 0 : 1;
  smooth('out', 0.4);
  return raw;
}

/** Lists every stretch of the route that passes closer than `gap` to something solid. */
function clearance(frames, colliders, gap = 0.2) {
  const hits = [];
  let open = null;
  frames.forEach((f, i) => {
    let worst = null;
    if (!f.free) {
      for (const c of colliders) {
        const dx = Math.max(c.x0 - f.x, 0, f.x - c.x1);
        const dz = Math.max(c.z0 - f.z, 0, f.z - c.z1);
        const d = Math.hypot(dx, dz);
        if (d < gap && (!worst || d < worst.d)) worst = { d, c };
      }
    }
    if (worst) {
      if (!open) hits.push((open = { from: i, to: i, d: worst.d, c: worst.c, at: [f.x, f.z] }));
      open.to = i;
      if (worst.d < open.d) Object.assign(open, { d: worst.d, c: worst.c, at: [f.x, f.z] });
    } else open = null;
  });
  return hits.map((h) => `${(h.from / FPS).toFixed(1)}s-${(h.to / FPS).toFixed(1)}s  ${h.d.toFixed(2)} m from ${h.c.tag ?? 'furniture'} [${h.c.x0.toFixed(2)},${h.c.z0.toFixed(2)} .. ${h.c.x1.toFixed(2)},${h.c.z1.toFixed(2)}] at (${h.at[0].toFixed(2)}, ${h.at[1].toFixed(2)})`);
}

const packFrames = (frames) => {
  const labels = [...new Set(frames.map((f) => f.label))];
  const r = (v) => Math.round(v * 1000) / 1000;
  return { labels, data: frames.map((f) => [r(f.x), r(f.y), r(f.z), r(f.h), r(f.p), r(f.fov), labels.indexOf(f.label), r(f.out)]) };
};

async function info() {
  const { page, gpu, close } = await open({ width: 1280, height: 720 });
  console.log('graphics:', gpu);
  const cols = await page.evaluate(() => window.__walk.colliders.map((c) => ({ ...c })));
  for (const c of cols) {
    if (c.tag === 'wall' || c.tag === 'window' || c.tag === 'compound') continue;
    console.log((c.tag ?? 'furniture').padEnd(10), c.x0.toFixed(2), c.z0.toFixed(2), '..', c.x1.toFixed(2), c.z1.toFixed(2), c.name ?? '');
  }
  await close();
}

async function check() {
  const frames = buildTour();
  console.log('tour length:', (frames.length / FPS).toFixed(1), 's,', frames.length, 'frames');
  const every = Number(process.argv[3] ?? 1.5);
  const { page, gpu, close } = await open({ width: 480, height: 270 });
  console.log('graphics:', gpu);
  const cols = await page.evaluate(() => window.__walk.colliders.map((c) => ({ ...c })));
  const hits = clearance(frames, cols);
  console.log(hits.length ? 'too close:\n  ' + hits.join('\n  ') : 'route is clear of walls and furniture');
  await fs.mkdir(path.join(localDir, 'check'), { recursive: true });
  const picks = [];
  for (let i = 0; i < frames.length; i += Math.round(every * FPS)) picks.push(i);
  const { labels, data } = packFrames(frames);
  const COLS = 5;
  const ROWS = 6;
  for (let s = 0; s * COLS * ROWS < picks.length; s++) {
    const part = picks.slice(s * COLS * ROWS, (s + 1) * COLS * ROWS);
    const url = await page.evaluate(
      ({ part, data, labels, COLS, ROWS, FPS }) => {
        const gl = document.getElementById('view');
        const sheet = document.createElement('canvas');
        sheet.width = 480 * COLS;
        sheet.height = 270 * ROWS;
        const g = sheet.getContext('2d');
        g.font = '600 15px system-ui';
        part.forEach((idx, n) => {
          const [x, y, z, heading, pitch, fov, li, outdoor] = data[idx];
          window.__walk.shot({ x, y, z, heading, pitch, fov, outdoor });
          const cx = (n % COLS) * 480;
          const cy = Math.floor(n / COLS) * 270;
          g.drawImage(gl, cx, cy, 480, 270);
          g.fillStyle = 'rgba(0,0,0,0.7)';
          g.fillRect(cx, cy, 190, 22);
          g.fillStyle = '#fff';
          g.fillText(`${(idx / FPS).toFixed(1)}s  ${labels[li]}`, cx + 6, cy + 16);
        });
        return sheet.toDataURL('image/jpeg', 0.85);
      },
      { part, data, labels, COLS, ROWS, FPS },
    );
    await saveDataUrl(path.join(localDir, 'check', `sheet-${s + 1}.jpg`), url);
    console.log('saved', `sheet-${s + 1}.jpg`);
  }
  await close();
}

async function video() {
  const frames = buildTour();
  const limit = Number(process.argv[3] ?? 0); // optional: only the first N seconds, for a quick trial
  const use = limit ? frames.slice(0, Math.round(limit * FPS)) : frames;
  console.log('tour length:', (use.length / FPS).toFixed(1), 's,', use.length, 'frames');
  const { page, gpu, close } = await open({ width: 1920, height: 1080, scale: 2 }); // drawn at twice the size and scaled down, for clean edges
  console.log('graphics:', gpu);
  await page.addScriptTag({ path: path.join(root, 'node_modules/mp4-muxer/build/mp4-muxer.js') });
  const { labels, data } = packFrames(use);
  await fs.mkdir(siteDir, { recursive: true });
  await fs.mkdir(localDir, { recursive: true });

  const started = Date.now();
  const result = await page.evaluate(
    async ({ data, labels, FPS }) => {
      const gl = document.getElementById('view');
      const W = 1920;
      const H = 1080;
      const big = document.createElement('canvas');
      big.width = W;
      big.height = H;
      const g = big.getContext('2d');
      g.imageSmoothingQuality = 'high';
      const small = document.createElement('canvas');
      small.width = 1280;
      small.height = 720;
      const gs = small.getContext('2d');
      gs.imageSmoothingQuality = 'high';

      let failed = null;
      const make = async (width, height, codec, bitrate) => {
        const config = { codec, width, height, bitrate, framerate: FPS, latencyMode: 'quality', avc: { format: 'avc' } };
        const ok = await VideoEncoder.isConfigSupported(config);
        if (!ok.supported) throw new Error('This browser cannot encode ' + codec);
        const muxer = new Mp4Muxer.Muxer({ target: new Mp4Muxer.ArrayBufferTarget(), video: { codec: 'avc', width, height, frameRate: FPS }, fastStart: 'in-memory' });
        const enc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => (failed = e) });
        enc.configure(config);
        return { muxer, enc };
      };
      const full = await make(W, H, 'avc1.640028', 5_500_000);
      const half = await make(1280, 720, 'avc1.64001f', 2_600_000);

      // the room name, bottom left, as in the walk-through itself
      const caption = (text) => {
        if (!text) return;
        g.font = '600 30px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
        const tw = g.measureText(text).width;
        const x = 40;
        const y = H - 40 - 56;
        g.fillStyle = 'rgba(22,24,27,0.72)';
        g.beginPath();
        g.roundRect(x, y, tw + 44, 56, 12);
        g.fill();
        g.fillStyle = '#fff';
        g.textBaseline = 'middle';
        g.fillText(text, x + 22, y + 29);
      };

      for (let i = 0; i < data.length; i++) {
        const [x, y, z, heading, pitch, fov, li, outdoor] = data[i];
        window.__walk.shot({ x, y, z, heading, pitch, fov, outdoor });
        g.drawImage(gl, 0, 0, W, H);
        caption(labels[li]);
        gs.drawImage(big, 0, 0, 1280, 720);
        const stamp = { timestamp: Math.round((i * 1e6) / FPS), duration: Math.round(1e6 / FPS) };
        const key = { keyFrame: i % (FPS * 2) === 0 };
        const a = new VideoFrame(big, stamp);
        full.enc.encode(a, key);
        a.close();
        const b = new VideoFrame(small, stamp);
        half.enc.encode(b, key);
        b.close();
        if (failed) throw failed;
        while (full.enc.encodeQueueSize > 4 || half.enc.encodeQueueSize > 4) await new Promise((r) => setTimeout(r, 2));
        if (i % 8 === 0) await new Promise((r) => setTimeout(r, 0));
        if (i % 300 === 0) console.log(`[tour] frame ${i} of ${data.length}`);
      }
      await full.enc.flush();
      await half.enc.flush();
      full.muxer.finalize();
      half.muxer.finalize();
      window.__videos = [full.muxer.target.buffer, half.muxer.target.buffer];
      return { W, H, sizes: window.__videos.map((b) => b.byteLength) };
    },
    { data, labels, FPS },
  );
  console.log('rendered in', ((Date.now() - started) / 1000).toFixed(0), 's', result);

  const names = ['house-tour-1080p.mp4', 'house-tour-720p.mp4'];
  for (let i = 0; i < names.length; i++) {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.evaluate(
        ({ i, name }) => {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(new Blob([window.__videos[i]], { type: 'video/mp4' }));
          a.download = name;
          document.body.appendChild(a);
          a.click();
        },
        { i, name: names[i] },
      ),
    ]);
    const file = limit ? path.join(localDir, `trial-${names[i]}`) : path.join(i === 0 ? localDir : siteDir, names[i]);
    await download.saveAs(file);
    console.log('saved', file);
  }
  await close();
}

/** Saves a sheet of stills taken from the finished video, to look it over quickly. */
async function stills() {
  const name = process.argv[3] ?? 'house-tour-720p.mp4';
  const { page, close } = await open({ width: 640, height: 360 });
  const url = await page.evaluate(async (src) => {
    const v = document.createElement('video');
    v.muted = true;
    v.src = src;
    await new Promise((ok, bad) => {
      v.onloadedmetadata = ok;
      v.onerror = () => bad(new Error('The video could not be opened'));
    });
    const COLS = 6;
    const n = 36;
    const sheet = document.createElement('canvas');
    sheet.width = 400 * COLS;
    sheet.height = 225 * Math.ceil(n / COLS);
    const g = sheet.getContext('2d');
    for (let i = 0; i < n; i++) {
      v.currentTime = ((i + 0.5) / n) * v.duration;
      await new Promise((r) => (v.onseeked = r));
      g.drawImage(v, (i % COLS) * 400, Math.floor(i / COLS) * 225, 400, 225);
    }
    console.log(`[tour] ${src}: ${v.videoWidth}x${v.videoHeight}, ${v.duration.toFixed(1)} s`);
    return sheet.toDataURL('image/jpeg', 0.85);
  }, `/tour/${name}`);
  await fs.mkdir(path.join(localDir, 'check'), { recursive: true });
  await saveDataUrl(path.join(localDir, 'check', 'video-stills.jpg'), url);
  await close();
}

await { photos, video, check, info, stills }[mode]();
process.exit(0);
