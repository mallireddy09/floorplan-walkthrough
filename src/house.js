import * as THREE from 'three';
import { Batch, floorQuad, wallQuad } from './geom.js';
import { wallAxis, wallSegments, segRect } from './planUtil.js';

const JAMB = 0.06; // door frame width
const LEAF = 0.04; // door leaf thickness

/**
 * Builds the shell of the home from the plan data: walls with door and window
 * openings, floors, ceiling, door frames and open leaves, windows with glass,
 * ceiling lights, plus the yard outside.
 *
 * Returns:
 *   root      everything
 *   upper     ceiling, lintels, fans and ceiling lights (hidden in the top view)
 *   topOnly   dark wall caps shown only in the top view
 *   colliders plan rectangles the walker cannot enter
 */
export function buildHouse(plan, M, { real = false, extras = null } = {}) {
  const H = plan.heights;
  const fp = plan.footprint;

  const root = new THREE.Group();
  const upper = new THREE.Group();
  const topOnly = new THREE.Group();
  topOnly.visible = false;
  root.add(upper, topOnly);

  const main = new Batch({ real });
  const up = new Batch({ real });
  const caps = new Batch();
  const colliders = [];

  // ---------- walls, doors, windows ----------
  for (const w of plan.walls) {
    const { axis, segs } = wallSegments(plan, w);
    for (const s of segs) {
      const r = segRect(w, axis, s.from, s.to);
      if (s.kind === 'solid') {
        main.box(M.wall, r.x0, 0, r.z0, r.x1, H.ceiling, r.z1);
        caps.add(M.cap, floorQuad(r.x0, r.z0, r.x1, r.z1, H.ceiling + 0.004));
        colliders.push({ ...r, tag: 'wall' });
      } else if (s.kind === 'door') {
        const h = s.o.height ?? H.door;
        up.box(M.wall, r.x0, h, r.z0, r.x1, H.ceiling, r.z1);
        buildDoor(s.o, w, axis, h, main, M, colliders);
      } else {
        const sill = s.o.sill;
        const head = s.o.sill + s.o.height;
        main.box(M.wall, r.x0, 0, r.z0, r.x1, sill, r.z1);
        up.box(M.wall, r.x0, head, r.z0, r.x1, H.ceiling, r.z1);
        colliders.push({ ...r, tag: 'window' });
        buildWindow(s.o, w, axis, main, M);
      }
    }
  }

  // ---------- floors ----------
  // One continuous vitrified floor; 0.8 m tiles (texture spans two tiles).
  main.add(M.floor, floorQuad(fp.x0, fp.z0, fp.x1, fp.z1, 0, 1 / (M.floor.userData.span ?? 1.6)));
  for (const room of plan.rooms) {
    if (room.floor !== 'bath') {
      wallLining(plan, room, 0.08, M.skirting, main, 1, 1); // tile skirting
      continue;
    }
    // 0.3 m matte tiles laid just above the main floor
    const wet = room.wet;
    if (!wet) {
      main.add(M.bathFloor, floorQuad(room.x0, room.z0, room.x1, room.z1, 0.004, 1 / 0.6));
      wallLining(plan, room, 2.1, M.bathWall, main, 0.3, 0.6);
      continue;
    }
    // Wet end (shower) and dry end (WC, basin) get different floor and wall tiles,
    // with a low kerb between them to hold the water back.
    const wetAtWest = Math.abs(wet.x0 - room.x0) < 1e-3;
    const dry = wetAtWest ? { ...room, x0: wet.x1 } : { ...room, x1: wet.x0 };
    main.add(M.bathFloor, floorQuad(dry.x0, dry.z0, dry.x1, dry.z1, 0.004, 1 / 0.6));
    main.add(M.bathFloorWet, floorQuad(wet.x0, wet.z0, wet.x1, wet.z1, 0.004, 1 / 0.6));
    wallLining(plan, dry, 2.1, M.bathWall, main, 0.3, 0.6, { sides: wetAtWest ? ['n', 's', 'e'] : ['n', 's', 'w'] });
    wallLining(plan, wet, 2.1, M.bathWallWet, main, 0.3, 0.6, { sides: wetAtWest ? ['n', 's', 'w'] : ['n', 's', 'e'] });
    const kx = wetAtWest ? wet.x1 : wet.x0;
    main.box(M.kerb, kx - 0.03, 0, room.z0, kx + 0.03, 0.05, room.z1);
  }

  // ---------- ceiling ----------
  // The roof slab reaches past the walls where the terrace is extended. North of the
  // house wall it starts east of the outside staircase, leaving the stair open to the sky.
  const T = plan.terrace;
  const ext = T?.extend ?? { north: 0, east: 0, south: 0, west: 0 };
  const slab = { x0: fp.x0 - ext.west, x1: fp.x1 + ext.east, z0: fp.z0 - ext.north, z1: fp.z1 + ext.south };
  const wellTo = T?.stairWell?.to ?? fp.x0; // the slab's north part begins here
  up.box(M.ceiling, slab.x0, H.ceiling, fp.z0, slab.x1, H.ceiling + H.slab, slab.z1);
  if (ext.north > 0) up.box(M.ceiling, wellTo, H.ceiling, slab.z0, slab.x1, H.ceiling + H.slab, fp.z0);

  // ---------- tiles on the ground around the house, under the overhang ----------
  // Four strips that together match the outline of the slab outside the walls.
  if (T?.groundTiles) {
    const y = -0.008;
    const uv = 1 / (T.groundTiles.size * 2); // the texture holds two tiles each way
    const strip = (x0, z0, x1, z1) => {
      if (x1 - x0 > 0.01 && z1 - z0 > 0.01) main.add(M.apron, floorQuad(x0, z0, x1, z1, y, uv));
    };
    strip(wellTo, slab.z0, slab.x1, fp.z0); // north, east of the staircase
    strip(fp.x1, fp.z0, slab.x1, slab.z1); // east
    strip(slab.x0, fp.z1, fp.x1, slab.z1); // south
    strip(slab.x0, fp.z0, fp.x0, fp.z1); // west
  }

  // ---------- terrace safety wall (parapet) ----------
  // A wall all round the edge of the slab, open only where the outside staircase
  // arrives. It sits with the ceiling, so it comes off with it in the top view.
  if (T) {
    const y0 = H.ceiling + H.slab;
    const y1 = y0 + T.parapet;
    const t = T.parapetThickness;
    const run = (x0, z0, x1, z1) => {
      if (x1 - x0 < 0.02 || z1 - z0 < 0.02) return;
      up.box(M.wall, x0, y0, z0, x1, y1, z1);
      up.box(M.concrete, x0 - 0.02, y1, z0 - 0.02, x1 + 0.02, y1 + 0.04, z1 + 0.02); // coping
    };
    // along the house's north wall line, beside the stair: open at the access
    run(slab.x0, fp.z0, T.access.from, fp.z0 + t);
    run(T.access.to, fp.z0, wellTo, fp.z0 + t);
    if (ext.north > 0) run(wellTo, slab.z0, slab.x1, slab.z0 + t); // north edge, east of the stair
    else run(wellTo, fp.z0, slab.x1, fp.z0 + t);
    run(slab.x0, slab.z1 - t, slab.x1, slab.z1); // south
    run(slab.x0, fp.z0 + t, slab.x0 + t, slab.z1 - t); // west
    run(slab.x1 - t, slab.z0 + t, slab.x1, slab.z1 - t); // east
  }

  // ---------- ceiling lights and fans ----------
  const fittings = {
    hall: { fan: [6.08, 2.6], lamps: [[6.08, 1.1], [6.08, 4.1]] },
    cbed: { fan: [2.21, 1.96], lamps: [[1.1, 1.96], [3.3, 1.96]] },
    mbed: { fan: [2.21, 8.61], lamps: [[1.1, 8.61], [3.3, 8.61]] },
    kitchen: { lamps: [[5.6, 8.0], [5.6, 9.3], [6.9, 8.6]] },
    pooja: { lamps: [[6.93, 5.9]] },
    toilet1: { lamps: [[1.3, 4.42]] },
    toilet2: { lamps: [[1.3, 5.9]] },
    lobby: { lamps: [[3.33, 4.6], [3.33, 5.9]] },
    passage: { lamps: [[5.1, 5.9]] },
  };
  for (const room of plan.rooms) {
    const f = fittings[room.id];
    if (!f) continue;
    for (const [x, z] of f.lamps) {
      up.cyl(M.fan, x, H.ceiling - 0.035, z, 0.13, 0.035);
      up.cyl(M.lightOn, x, H.ceiling - 0.045, z, 0.105, 0.012);
    }
    if (f.fan) ceilingFan(up, M, f.fan[0], f.fan[1], H.ceiling);
  }

  // ---------- outside ----------
  buildOutside(plan, M, main, colliders);
  if (extras) extras({ main, up, colliders });

  main.build(root);
  up.build(upper);
  caps.build(topOnly, { cast: false, receive: false });

  return { root, upper, topOnly, colliders };
}

// A box described as (along the wall, height, across the wall), for either wall direction.
function alongBox(batch, axis, mat, a0, y0, c0, a1, y1, c1) {
  if (axis === 'x') batch.box(mat, a0, y0, c0, a1, y1, c1);
  else batch.box(mat, c0, y0, a0, c1, y1, a1);
}

function buildDoor(d, w, axis, h, batch, M, colliders) {
  const t0 = axis === 'x' ? w.z0 : w.x0;
  const t1 = axis === 'x' ? w.z1 : w.x1;
  const proud = 0.015;

  // frame: two jambs and a head
  alongBox(batch, axis, M.doorFrame, d.from, 0, t0 - proud, d.from + JAMB, h, t1 + proud);
  alongBox(batch, axis, M.doorFrame, d.to - JAMB, 0, t0 - proud, d.to, h, t1 + proud);
  alongBox(batch, axis, M.doorFrame, d.from + JAMB, h - JAMB, t0 - proud, d.to - JAMB, h, t1 + proud);

  // leaves, standing open at 90 degrees on the side the plan shows them swinging to
  const sgn = d.swing === '+' ? 1 : -1;
  const face = sgn > 0 ? t1 : t0;
  const leafTop = h - JAMB - 0.01;

  const leaf = (hingeAt, dir, width) => {
    const a0 = Math.min(hingeAt, hingeAt + dir * LEAF);
    const a1 = Math.max(hingeAt, hingeAt + dir * LEAF);
    const c0 = Math.min(face, face + sgn * width);
    const c1 = Math.max(face, face + sgn * width);
    alongBox(batch, axis, M.door, a0, 0.01, c0, a1, leafTop, c1);
    // lever handle on both faces, near the free edge
    const hc = face + sgn * (width - 0.09);
    alongBox(batch, axis, M.steel, a0 - 0.035, 1.0, hc - 0.06, a1 + 0.035, 1.025, hc + 0.06);
    colliders.push(
      axis === 'x'
        ? { x0: a0, x1: a1, z0: c0, z1: c1, tag: 'door' }
        : { x0: c0, x1: c1, z0: a0, z1: a1, tag: 'door' },
    );
  };

  const clear = d.to - d.from - 2 * JAMB;
  if (d.type === 'double') {
    leaf(d.from + JAMB, +1, clear / 2);
    leaf(d.to - JAMB, -1, clear / 2);
  } else if (d.hinge === 'start') {
    leaf(d.from + JAMB, +1, clear);
  } else {
    leaf(d.to - JAMB, -1, clear);
  }
}

function buildWindow(win, w, axis, batch, M) {
  const t0 = axis === 'x' ? w.z0 : w.x0;
  const t1 = axis === 'x' ? w.z1 : w.x1;
  const c = (t0 + t1) / 2;
  const fd = 0.035; // half depth of the frame
  const f = 0.045; // frame section
  const y0 = win.sill;
  const y1 = win.sill + win.height;
  const a0 = win.from;
  const a1 = win.to;

  alongBox(batch, axis, M.winFrame, a0, y0, c - fd, a0 + f, y1, c + fd);
  alongBox(batch, axis, M.winFrame, a1 - f, y0, c - fd, a1, y1, c + fd);
  alongBox(batch, axis, M.winFrame, a0 + f, y0, c - fd, a1 - f, y0 + f, c + fd);
  alongBox(batch, axis, M.winFrame, a0 + f, y1 - f, c - fd, a1 - f, y1, c + fd);

  const width = a1 - a0;
  const panels = width > 1.6 ? 3 : width > 0.9 ? 2 : 1;
  for (let i = 1; i < panels; i++) {
    const a = a0 + (width * i) / panels;
    alongBox(batch, axis, M.winFrame, a - f / 2, y0 + f, c - fd, a + f / 2, y1 - f, c + fd);
  }

  alongBox(batch, axis, win.frosted ? M.glassFrost : M.glass, a0 + f, y0 + f, c - 0.004, a1 - f, y1 - f, c + 0.004);

  // stone sill board, a touch proud of the wall on both faces
  alongBox(batch, axis, M.sill, a0, y0 - 0.03, t0 - 0.02, a1, y0 + 0.006, t1 + 0.02);
}

/**
 * Covers the inside faces of a room's walls up to a height (bathroom tiles, skirting,
 * a painted feature wall), only where a wall actually stands, and leaving doors and
 * windows clear. opts.sides picks walls of the room ('n','s','w','e'); opts.y0 starts
 * the covering above the floor.
 */
export function wallLining(plan, room, height, mat, batch, tileW, tileH, opts = {}) {
  const eps = opts.eps ?? 0.004;
  const y0 = opts.y0 ?? 0;
  const near = (a, b) => Math.abs(a - b) < 1e-3;
  const sides = [
    { id: 'n', axis: 'x', pos: room.z0 + eps, facing: +1, s0: room.x0, s1: room.x1, match: (w) => near(w.z1, room.z0) },
    { id: 's', axis: 'x', pos: room.z1 - eps, facing: -1, s0: room.x0, s1: room.x1, match: (w) => near(w.z0, room.z1) },
    { id: 'w', axis: 'z', pos: room.x0 + eps, facing: +1, s0: room.z0, s1: room.z1, match: (w) => near(w.x1, room.x0) },
    { id: 'e', axis: 'z', pos: room.x1 - eps, facing: -1, s0: room.z0, s1: room.z1, match: (w) => near(w.x0, room.x1) },
  ];
  for (const side of sides) {
    if (opts.sides && !opts.sides.includes(side.id)) continue;
    const quad = (a0, a1, lo, hi) => {
      if (a1 - a0 < 1e-4 || hi - lo < 1e-4) return;
      batch.add(mat, wallQuad(side.axis, side.pos, a0, a1, lo, hi, side.facing, tileW, tileH));
    };
    for (const w of plan.walls) {
      if (wallAxis(w) !== side.axis || !side.match(w)) continue;
      const lo = Math.max(side.s0, side.axis === 'x' ? w.x0 : w.z0);
      const hi = Math.min(side.s1, side.axis === 'x' ? w.x1 : w.z1);
      if (hi - lo < 1e-4) continue;
      for (const s of wallSegments(plan, w).segs) {
        const a0 = Math.max(lo, s.from);
        const a1 = Math.min(hi, s.to);
        if (a1 - a0 < 1e-4) continue;
        if (s.kind === 'solid') quad(a0, a1, y0, height);
        else if (s.kind === 'window') {
          quad(a0, a1, y0, Math.min(s.o.sill, height));
          quad(a0, a1, Math.max(y0, Math.min(s.o.sill + s.o.height, height)), height);
        } else if (s.kind === 'door') {
          quad(a0, a1, Math.max(y0, s.o.height ?? plan.heights.door), height);
        }
      }
    }
  }
}

function ceilingFan(batch, M, x, z, ceiling) {
  batch.cyl(M.fan, x, ceiling - 0.3, z, 0.012, 0.3);
  batch.cyl(M.fan, x, ceiling - 0.38, z, 0.1, 0.08);
  const y0 = ceiling - 0.36;
  const y1 = ceiling - 0.345;
  batch.box(M.fan, x + 0.08, y0, z - 0.06, x + 0.62, y1, z + 0.06);
  batch.box(M.fan, x - 0.62, y0, z - 0.06, x - 0.08, y1, z + 0.06);
  batch.box(M.fan, x - 0.06, y0, z + 0.08, x + 0.06, y1, z + 0.62);
  batch.box(M.fan, x - 0.06, y0, z - 0.62, x + 0.06, y1, z - 0.08);
}

function buildOutside(plan, M, batch, colliders) {
  const p = plan.plot;
  const fp = plan.footprint;

  // road level and the plot's lawn
  batch.add(M.ground, floorQuad(p.x0 - 30, p.z0 - 30, p.x1 + 30, p.z1 + 30, -0.08));
  batch.add(M.lawn, floorQuad(p.x0, p.z0, p.x1, p.z1, -0.03, 1 / 1.5));
  // plinth skirt so the floor edge reads as a slab from outside
  batch.box(M.concrete, fp.x0 - 0.02, -0.08, fp.z0 - 0.02, fp.x1 + 0.02, -0.002, fp.z1 + 0.02);

  // compound wall, with the gates on the main road side
  const t = 0.15;
  const h = 1.5;
  const wall = (x0, z0, x1, z1) => {
    batch.box(M.compound, x0, -0.08, z0, x1, h, z1);
    colliders.push({ x0, z0, x1, z1, tag: 'compound' });
  };
  wall(p.x0 - t, p.z0 - t, p.x1 + t, p.z0); // north
  wall(p.x0 - t, p.z0, p.x0, p.z1); // west
  wall(p.x1, p.z0, p.x1 + t, p.z1); // east
  // south side: wall between the gates, a post each side of every gate, closed leaves
  let from = p.x0 - t;
  for (const g of [...p.gates].sort((a, b) => a.from - b.from)) {
    wall(from, p.z1, g.from, p.z1 + t);
    from = g.to;
    for (const x of [g.from - 0.1, g.to + 0.1]) batch.box(M.compound, x - 0.12, -0.08, p.z1 - 0.03, x + 0.12, h + 0.18, p.z1 + t + 0.03);
    if (g.leaves === 2) {
      const mid = (g.from + g.to) / 2;
      batch.box(M.gate, g.from + 0.02, 0.05, p.z1 + 0.04, mid - 0.01, h - 0.1, p.z1 + 0.09);
      batch.box(M.gate, mid + 0.01, 0.05, p.z1 + 0.04, g.to - 0.02, h - 0.1, p.z1 + 0.09);
    } else {
      batch.box(M.gate, g.from + 0.02, 0.05, p.z1 + 0.04, g.to - 0.02, h - 0.1, p.z1 + 0.09);
    }
    colliders.push({ x0: g.from, z0: p.z1, x1: g.to, z1: p.z1 + t, tag: 'gate' });
  }
  wall(from, p.z1, p.x1 + t, p.z1 + t);

  // outside staircase against the north wall (drawn on the plan, rising to the east)
  const s = plan.stair;
  const top = plan.heights.ceiling + plan.heights.slab;
  const n = 13;
  const run = (s.x1 - s.landingTo) / n;
  const rise = top / (n + 1);
  batch.box(M.concrete, s.x0, -0.03, s.z0, s.landingTo, rise, s.z1 - 0.03);
  for (let i = 0; i < n; i++) {
    const x0 = s.landingTo + i * run;
    const yTop = (i + 2) * rise;
    batch.box(M.concrete, x0, yTop - 0.3, s.z0, x0 + run, yTop, s.z1 - 0.03);
  }
  colliders.push({ x0: s.x0, z0: s.z0, x1: s.x1, z1: s.z1, tag: 'stair' });

  // Safety on the staircase: a wall on its open (north) side that steps up with the
  // treads, a wall across the high end and the landing's west end, and a handrail on
  // the house side. You step on at the landing from the north.
  if (s.sideWall) {
    const wt = 0.1;
    const hgt = s.sideWall;
    // The walls stand just outside the edge of the steps, so they do not share a face with them.
    batch.box(M.wall, s.x0 - wt, -0.03, s.z0 - wt, s.x0, rise + hgt, s.z1 - 0.03); // landing, west end
    for (let i = 0; i < n; i++) {
      const x0 = s.landingTo + i * run;
      const yTop = (i + 2) * rise;
      batch.box(M.wall, x0, yTop - 0.3, s.z0 - wt, x0 + run, yTop + hgt, s.z0); // open side
    }
    batch.box(M.wall, s.x1, top - 0.3, s.z0 - wt, s.x1 + wt, top + 1.0, s.z1 - 0.03); // across the high end
    colliders.push({ x0: s.landingTo, z0: s.z0 - wt, x1: s.x1 + wt, z1: s.z0, tag: 'stair' });
    colliders.push({ x0: s.x0 - wt, z0: s.z0 - wt, x1: s.x0, z1: s.z1, tag: 'stair' });
    // handrail along the house wall, following the slope of the treads
    const railEnd = plan.terrace ? plan.terrace.access.from : s.x1 - run;
    const a = new THREE.Vector3(s.landingTo, 2 * rise + 0.85, s.z1 - 0.1);
    const b2 = new THREE.Vector3(railEnd, 2 * rise + ((railEnd - s.landingTo) / run) * rise + 0.85, s.z1 - 0.1);
    const d = b2.clone().sub(a);
    const rail = new THREE.CylinderGeometry(0.02, 0.02, d.length(), 10);
    rail.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
    rail.translate((a.x + b2.x) / 2, (a.y + b2.y) / 2, (a.z + b2.z) / 2);
    batch.add(M.steel, rail);
    for (const p of [a, a.clone().lerp(b2, 0.5), b2]) batch.box(M.steel, p.x - 0.015, p.y - 0.015, p.z, p.x + 0.015, p.y + 0.015, s.z1 - 0.03); // brackets to the wall
  }
}
