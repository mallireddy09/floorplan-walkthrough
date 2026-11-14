import * as THREE from 'three';
import { Batch } from './geom.js';

/**
 * A piece of furniture placed on the plan.
 * cx, cz : centre of its footprint (metres)
 * facing : which way its front points: 'n', 's', 'e' or 'w'
 * Local coordinates: x across the width, z from back (negative) to front (positive).
 */
class Piece {
  constructor(batch, colliders, cx, cz, facing) {
    this.b = batch;
    this.colliders = colliders;
    this.cx = cx;
    this.cz = cz;
    this.f = facing;
  }

  pt(lx, lz) {
    switch (this.f) {
      case 's':
        return [this.cx + lx, this.cz + lz];
      case 'n':
        return [this.cx - lx, this.cz - lz];
      case 'e':
        return [this.cx + lz, this.cz - lx];
      default:
        return [this.cx - lz, this.cz + lx]; // 'w'
    }
  }

  box(mat, x0, y0, z0, x1, y1, z1) {
    const [ax, az] = this.pt(x0, z0);
    const [bx, bz] = this.pt(x1, z1);
    this.b.box(mat, ax, y0, az, bx, y1, bz);
    return this;
  }

  /** Soft-edged box in the Real style, plain box in the model style. */
  rbox(mat, x0, y0, z0, x1, y1, z1, r = 0.04) {
    const [ax, az] = this.pt(x0, z0);
    const [bx, bz] = this.pt(x1, z1);
    this.b.rbox(mat, ax, y0, az, bx, y1, bz, r);
    return this;
  }

  cyl(mat, lx, y0, lz, r, h, rTop = r, seg = 14) {
    const [x, z] = this.pt(lx, lz);
    this.b.cyl(mat, x, y0, z, r, h, rTop, seg);
    return this;
  }

  sphere(mat, lx, y, lz, r, sx = 1, sy = 1, sz = 1) {
    const [x, z] = this.pt(lx, lz);
    this.b.sphere(mat, x, y, z, r, sx, sy, sz);
    return this;
  }

  /** Footprint the walker cannot enter. */
  solid(x0, z0, x1, z1, tag) {
    const [ax, az] = this.pt(x0, z0);
    const [bx, bz] = this.pt(x1, z1);
    this.colliders.push({
      x0: Math.min(ax, bx),
      z0: Math.min(az, bz),
      x1: Math.max(ax, bx),
      z1: Math.max(az, bz),
      tag,
    });
    return this;
  }
}

/**
 * Furnishes every room. With real = true the soft pieces are rounded and
 * `extras` is called to add the lived-in details before everything is merged.
 */
export function furnish(plan, M, { real = false, extras = null } = {}) {
  const group = new THREE.Group();
  const b = new Batch({ real });
  const colliders = [];
  const at = (cx, cz, facing) => new Piece(b, colliders, cx, cz, facing);

  hall(at, b, M);
  childBedroom(at, b, M);
  masterBedroom(at, b, M);
  kitchen(at, b, M, colliders);
  pooja(at, b, M);
  toilet1(at, b, M, colliders);
  toilet2(at, b, M, colliders);
  lobby(at, b, M);
  if (extras) extras({ b, at, colliders });

  b.build(group);
  return { group, colliders };
}

// ------------------------------------------------------------------ pieces

function sofa(p, M, w = 2.1, d = 0.9) {
  const hw = w / 2;
  const hd = d / 2;
  const arm = 0.16;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(M.dark, sx * (hw - 0.1), 0, sz * (hd - 0.1), sx * (hw - 0.04), 0.08, sz * (hd - 0.04));
  p.box(M.sofa, -hw, 0.08, -hd, hw, 0.3, hd); // base
  p.rbox(M.sofa, -hw, 0.28, -hd, hw, 0.8, -hd + 0.2, 0.05); // back
  p.rbox(M.sofa, -hw, 0.28, -hd + 0.15, -hw + arm, 0.62, hd, 0.05); // arms
  p.rbox(M.sofa, hw - arm, 0.28, -hd + 0.15, hw, 0.62, hd, 0.05);
  const inner = w - 2 * arm;
  const n = 3;
  for (let i = 0; i < n; i++) {
    const x0 = -hw + arm + (inner * i) / n + 0.01;
    const x1 = -hw + arm + (inner * (i + 1)) / n - 0.01;
    p.rbox(M.sofaLight, x0, 0.29, -hd + 0.2, x1, 0.44, hd - 0.01, 0.05); // seat cushion
    p.rbox(M.sofaLight, x0, 0.42, -hd + 0.18, x1, 0.76, -hd + 0.34, 0.06); // back cushion
  }
  p.rbox(M.mustard, -hw + arm + 0.03, 0.44, -hd + 0.34, -hw + arm + 0.43, 0.8, -hd + 0.46, 0.05);
  p.rbox(M.mustard, hw - arm - 0.43, 0.44, -hd + 0.34, hw - arm - 0.03, 0.8, -hd + 0.46, 0.05);
  p.solid(-hw, -hd, hw, hd, 'sofa');
}

function coffeeTable(p, M, w = 1.0, d = 0.5) {
  const hw = w / 2;
  const hd = d / 2;
  p.box(M.oak, -hw, 0.36, -hd, hw, 0.4, hd);
  p.box(M.oak, -hw + 0.05, 0.12, -hd + 0.05, hw - 0.05, 0.14, hd - 0.05);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(M.dark, sx * (hw - 0.06), 0, sz * (hd - 0.06), sx * (hw - 0.02), 0.36, sz * (hd - 0.02));
  p.box(M.bookB, -0.3, 0.4, -0.1, -0.08, 0.43, 0.08);
  p.cyl(M.ceramic, 0.25, 0.4, 0, 0.06, 0.12, 0.045);
  p.solid(-hw, -hd, hw, hd, 'coffee table');
}

function tvUnit(p, M, w = 1.8, d = 0.4) {
  const hw = w / 2;
  const hd = d / 2;
  p.box(M.walnut, -hw, 0.1, -hd, hw, 0.5, hd);
  for (const sx of [-1, 1]) p.box(M.dark, sx * (hw - 0.12), 0, -hd + 0.05, sx * (hw - 0.06), 0.1, hd - 0.05);
  for (const x of [-hw / 3, hw / 3]) p.box(M.dark, x - 0.004, 0.12, hd, x + 0.004, 0.48, hd + 0.003); // door gaps
  // wall-mounted television (about 55 inch) above the unit
  p.box(M.dark, -0.63, 0.88, -hd - 0.005, 0.63, 1.62, -hd + 0.035);
  p.box(M.blackGlass, -0.61, 0.9, -hd + 0.035, 0.61, 1.6, -hd + 0.04);
  p.box(M.dark, -0.45, 0.5, -0.06, 0.45, 0.56, 0.02); // soundbar
  p.cyl(M.pot, hw - 0.2, 0.5, 0.02, 0.07, 0.12, 0.06);
  p.sphere(M.plant, hw - 0.2, 0.72, 0.02, 0.12, 1, 1.1, 1);
  p.solid(-hw, -hd, hw, hd, 'tv unit');
}

function chair(p, M) {
  const s = 0.21;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(M.walnut, sx * s, 0, sz * s, sx * (s - 0.035), 0.43, sz * (s - 0.035));
  p.rbox(M.chairSeat, -s, 0.43, -s, s, 0.485, s, 0.02);
  p.box(M.walnut, -s, 0.48, -s, -s + 0.035, 0.9, -s + 0.035);
  p.box(M.walnut, s - 0.035, 0.48, -s, s, 0.9, -s + 0.035);
  p.box(M.walnut, -s, 0.66, -s, s, 0.9, -s + 0.03);
}

function diningTable(p, M, w = 1.2, d = 0.8) {
  const hw = w / 2;
  const hd = d / 2;
  p.box(M.oak, -hw, 0.72, -hd, hw, 0.76, hd);
  p.box(M.oak, -hw + 0.08, 0.64, -hd + 0.08, hw - 0.08, 0.72, hd - 0.08);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(M.oak, sx * (hw - 0.05), 0, sz * (hd - 0.05), sx * (hw - 0.11), 0.72, sz * (hd - 0.11));
  p.cyl(M.ceramic, 0, 0.76, 0, 0.13, 0.05, 0.16);
  p.sphere(M.saffron, -0.04, 0.82, 0.02, 0.045);
  p.sphere(M.mustard, 0.05, 0.82, -0.03, 0.045);
}

function bed(p, M, w, d, blanket, pillows, headboard = 1.05) {
  const hw = w / 2;
  const hd = d / 2;
  p.box(M.walnut, -hw, 0, -hd, hw, headboard, -hd + 0.06); // headboard
  p.box(M.walnut, -hw, 0.1, -hd + 0.06, hw, 0.3, hd); // frame
  for (const sx of [-1, 1]) for (const z of [-hd + 0.1, hd - 0.1]) p.box(M.dark, sx * (hw - 0.04), 0, z - 0.03, sx * (hw - 0.1), 0.1, z + 0.03);
  p.rbox(M.sheet, -hw + 0.03, 0.28, -hd + 0.08, hw - 0.03, 0.52, hd - 0.03, 0.05); // mattress
  p.rbox(blanket, -hw + 0.015, 0.29, -hd + 0.75, hw - 0.015, 0.545, hd - 0.015, 0.045); // blanket
  p.rbox(M.sheet, -hw + 0.015, 0.5, -hd + 0.62, hw - 0.015, 0.555, -hd + 0.78, 0.02); // folded sheet
  const pw = (w - 0.2) / pillows;
  for (let i = 0; i < pillows; i++) {
    const x0 = -hw + 0.1 + i * pw + 0.04;
    p.rbox(M.sheet, x0, 0.51, -hd + 0.14, x0 + pw - 0.08, 0.65, -hd + 0.52, 0.06);
  }
  p.solid(-hw, -hd, hw, hd, 'bed');
}

function bedside(p, M, w = 0.45, d = 0.4) {
  const hw = w / 2;
  const hd = d / 2;
  p.box(M.walnut, -hw, 0.08, -hd, hw, 0.5, hd);
  p.box(M.dark, -hw + 0.03, 0, -hd + 0.03, hw - 0.03, 0.08, hd - 0.03);
  p.box(M.dark, -hw + 0.02, 0.285, hd, hw - 0.02, 0.292, hd + 0.003);
  p.box(M.steel, -0.05, 0.38, hd, 0.05, 0.395, hd + 0.015);
  p.cyl(M.brass, 0, 0.5, -0.03, 0.06, 0.02);
  p.cyl(M.brass, 0, 0.52, -0.03, 0.01, 0.2);
  p.cyl(M.lampShade, 0, 0.7, -0.03, 0.11, 0.16, 0.08);
  p.solid(-hw, -hd, hw, hd, 'bedside table');
}

function wardrobe(p, M, w, d = 0.6, h = 2.1, doors = 3, mat = M.laminate) {
  const hw = w / 2;
  const hd = d / 2;
  p.box(M.dark, -hw + 0.02, 0, -hd, hw - 0.02, 0.08, hd - 0.04);
  p.box(mat, -hw, 0.08, -hd, hw, h, hd);
  for (let i = 1; i < doors; i++) {
    const x = -hw + (w * i) / doors;
    p.box(M.dark, x - 0.004, 0.1, hd, x + 0.004, h - 0.02, hd + 0.003);
  }
  for (let i = 0; i < doors; i++) {
    const edge = -hw + (w * (i + (i % 2 === 0 ? 1 : 0))) / doors;
    const x = edge + (i % 2 === 0 ? -0.06 : 0.06);
    p.box(M.steel, x - 0.008, 0.95, hd, x + 0.008, 1.25, hd + 0.025);
  }
  p.solid(-hw, -hd, hw, hd, 'wardrobe');
}

function desk(p, M, w = 1.2, d = 0.55) {
  const hw = w / 2;
  const hd = d / 2;
  p.box(M.oak, -hw, 0.72, -hd, hw, 0.75, hd);
  p.box(M.oak, -hw, 0, -hd, -hw + 0.03, 0.72, hd);
  p.box(M.laminate, hw - 0.4, 0.05, -hd + 0.02, hw, 0.72, hd - 0.02); // drawers
  for (const y of [0.27, 0.5]) p.box(M.dark, hw - 0.39, y, hd - 0.02, hw - 0.01, y + 0.006, hd - 0.017);
  p.box(M.dark, -0.42, 0.75, -0.12, -0.08, 0.765, 0.1); // laptop base
  p.box(M.dark, -0.42, 0.765, -0.13, -0.08, 0.98, -0.115); // laptop screen
  p.cyl(M.dark, 0.3, 0.75, -0.15, 0.06, 0.015);
  p.cyl(M.dark, 0.3, 0.765, -0.15, 0.008, 0.3);
  p.cyl(M.lampShade, 0.3, 1.04, -0.15, 0.07, 0.09, 0.04);
  p.solid(-hw, -hd, hw, hd, 'desk');
}

function bookshelf(p, M, w = 0.9, d = 0.3, h = 1.5) {
  const hw = w / 2;
  const hd = d / 2;
  p.box(M.oak, -hw, 0, -hd, -hw + 0.025, h, hd);
  p.box(M.oak, hw - 0.025, 0, -hd, hw, h, hd);
  p.box(M.oak, -hw, 0, -hd, hw, h, -hd + 0.015);
  const shelves = 5;
  for (let i = 0; i < shelves; i++) {
    const y = 0.05 + (i * (h - 0.075)) / (shelves - 1);
    p.box(M.oak, -hw, y, -hd, hw, y + 0.025, hd);
  }
  const mats = [M.bookA, M.bookB, M.bookC, M.sheet, M.plant];
  for (let s = 0; s < shelves - 1; s++) {
    const y = 0.075 + (s * (h - 0.075)) / (shelves - 1);
    let x = -hw + 0.05;
    let k = s;
    while (x < hw - 0.3 + (s % 2) * 0.15) {
      const bw = 0.03 + ((k * 7) % 4) * 0.008;
      const bh = 0.2 + ((k * 5) % 3) * 0.03;
      p.box(mats[k % mats.length], x, y, -hd + 0.03, x + bw, y + bh, hd - 0.04);
      x += bw + 0.004;
      k++;
    }
  }
  p.solid(-hw, -hd, hw, hd, 'bookshelf');
}

function plant(p, M, scale = 1) {
  p.cyl(M.pot, 0, 0, 0, 0.15 * scale, 0.34 * scale, 0.19 * scale);
  p.cyl(M.dark, 0, 0.34 * scale, 0, 0.012, 0.3 * scale);
  p.sphere(M.plant, 0, 0.78 * scale, 0, 0.24 * scale, 1, 1.15, 1);
  p.sphere(M.plant, 0.1 * scale, 1.02 * scale, 0.05 * scale, 0.19 * scale);
  p.sphere(M.plant, -0.09 * scale, 0.95 * scale, -0.07 * scale, 0.17 * scale);
  p.solid(-0.19 * scale, -0.19 * scale, 0.19 * scale, 0.19 * scale, 'plant');
}

function wc(p, M, d = 0.68) {
  // back of the cistern against the wall; 0.38 wide, d deep (0.6 for a compact one)
  const hd = d / 2;
  p.box(M.ceramic, -0.19, 0.4, -hd, 0.19, 0.8, -hd + 0.17);
  p.box(M.steel, -0.03, 0.8, -hd + 0.06, 0.03, 0.81, -hd + 0.11);
  p.box(M.ceramic, -0.17, 0, -hd, 0.17, 0.4, hd - 0.2);
  p.cyl(M.ceramic, 0, 0, hd - 0.2, 0.17, 0.4, 0.19, 18);
  p.box(M.ceramic, -0.19, 0.4, -hd + 0.17, 0.19, 0.425, hd - 0.2); // seat and lid
  p.cyl(M.ceramic, 0, 0.4, hd - 0.2, 0.19, 0.025, 0.19, 18);
  p.solid(-0.19, -hd, 0.19, hd, 'toilet');
}

function basin(p, M, w = 0.5, d = 0.42) {
  const hw = w / 2;
  const hd = d / 2;
  p.box(M.walnut, -hw, 0.3, -hd, hw, 0.78, hd - 0.03); // wall-hung vanity
  p.box(M.dark, -0.003, 0.32, hd - 0.03, 0.003, 0.76, hd - 0.027);
  p.box(M.ceramic, -hw, 0.78, -hd, hw, 0.86, hd); // basin top
  p.box(M.laminateGrey, -hw + 0.07, 0.855, -hd + 0.1, hw - 0.07, 0.862, hd - 0.05); // bowl
  p.cyl(M.steel, 0, 0.86, -hd + 0.05, 0.015, 0.14);
  p.box(M.steel, -0.012, 0.98, -hd + 0.05, 0.012, 1.0, -hd + 0.17);
  // mirror on the wall above
  p.box(M.dark, -hw - 0.01, 1.08, -hd, hw + 0.01, 1.8, -hd + 0.012);
  p.box(M.mirror, -hw + 0.01, 1.1, -hd + 0.012, hw - 0.01, 1.78, -hd + 0.016);
  p.solid(-hw, -hd, hw, hd, 'basin');
}

function shower(p, M) {
  // fixed to the wall behind (local z = 0 is the wall face)
  p.box(M.steel, -0.07, 1.0, 0, 0.07, 1.1, 0.04);
  p.cyl(M.steel, 0, 1.1, 0.025, 0.011, 1.05);
  p.box(M.steel, -0.011, 2.13, 0.02, 0.011, 2.15, 0.34);
  p.cyl(M.steel, 0, 2.1, 0.32, 0.1, 0.02, 0.1, 18);
}

// ------------------------------------------------------------------ rooms

function hall(at, b, M) {
  // Dining for four by the north window, clear of the entrance.
  diningTable(at(5.1, 1.53, 's'), M, 1.2, 0.8);
  chair(at(4.8, 1.02, 's'), M);
  chair(at(5.4, 1.02, 's'), M);
  chair(at(4.8, 2.04, 'n'), M);
  chair(at(5.4, 2.04, 'n'), M);
  at(5.1, 1.53, 's').solid(-0.6, -0.72, 0.6, 0.72, 'dining set');

  // Seating: sofa under the east window facing the television on the centre wall.
  sofa(at(7.39, 3.7, 'w'), M, 2.1, 0.9);
  coffeeTable(at(6.2, 3.7, 'w'), M, 1.0, 0.5);
  tvUnit(at(4.515, 3.7, 'e'), M, 1.8, 0.4);
  b.box(M.rugHall, 5.5, 0.001, 2.8, 6.93, 0.012, 4.6);

  plant(at(7.55, 2.33, 's'), M, 1); // between the east door and the sofa
}

function childBedroom(at, b, M) {
  // Wardrobe in the south-west corner, on the west wall.
  wardrobe(at(0.535, 2.79, 'e'), M, 1.8, 0.6, 2.1, 3);
  // Bed beside it, head against the south wall; study desk on the east wall.
  bed(at(2.12, 2.69, 'n'), M, 1.0, 2.0, M.blanketKids, 1);
  bedside(at(2.9, 3.49, 'n'), M);
  desk(at(3.91, 1.0, 'w'), M, 1.2, 0.55);
  chair(at(3.44, 0.83, 'e'), M);
  at(3.44, 0.83, 'e').solid(-0.21, -0.21, 0.21, 0.21, 'chair');
  bookshelf(at(0.385, 0.95, 'e'), M, 0.9, 0.3, 1.5);
  b.box(M.rugKids, 1.1, 0.001, 0.45, 2.9, 0.012, 1.55);
}

function masterBedroom(at, b, M) {
  // Wardrobe in the south-west corner, on the west wall.
  wardrobe(at(0.535, 9.33, 'e'), M, 2.2, 0.6, 2.1, 4, M.oak);
  // Bed faces north: head against the south wall, feet toward the north.
  // The headboard is kept just under the sill so it does not cover the window.
  bed(at(2.5, 9.4094, 'n'), M, 1.8, 2.05, M.blanketMaster, 2, 0.88);
  bedside(at(3.67, 10.235, 'n'), M);
  b.box(M.rugMaster, 1.35, 0.001, 7.45, 3.65, 0.012, 9.4);
}

function kitchen(at, b, M, colliders) {
  const x0 = 7.2486; // front of the east run
  const x1 = 7.8486; // east wall
  const zN = 7.52; // north end of the counter; the corner between it and the Pooja wall is left empty
  const zS = 10.4394; // south wall
  const sink0 = 7.9;
  const sink1 = 8.5;
  const sinkMid = (sink0 + sink1) / 2;

  // base cabinets along the east wall, split around the sink bowl
  b.box(M.dark, x0 + 0.06, 0, zN, x1, 0.1, zS);
  b.box(M.laminate, x0 + 0.02, 0.1, zN, x1, 0.82, sink0);
  b.box(M.laminate, x0 + 0.02, 0.1, sink0, x1, 0.62, sink1);
  b.box(M.laminate, x0 + 0.02, 0.1, sink1, x1, 0.82, zS);
  b.box(M.laminate, x0 + 0.02, 0.62, sink0, x0 + 0.1, 0.82, sink1);
  // return under the south window
  b.box(M.dark, 6.0, 0, zS - 0.54, x0, 0.1, zS);
  b.box(M.laminate, 6.0, 0.1, zS - 0.58, x0 + 0.02, 0.82, zS);
  // cabinet door lines and handles
  for (let z = zN + 0.6; z < zS - 0.7; z += 0.6) b.box(M.dark, x0 + 0.017, 0.12, z - 0.004, x0 + 0.02, 0.8, z + 0.004);
  for (let z = zN + 0.3; z < zS - 0.7; z += 0.6) b.box(M.steel, x0, 0.7, z - 0.07, x0 + 0.02, 0.715, z + 0.07);
  for (let x = 6.6; x < x0; x += 0.6) b.box(M.dark, x - 0.004, 0.12, zS - 0.583, x + 0.004, 0.8, zS - 0.58);
  for (let x = 6.3; x < x0; x += 0.6) b.box(M.steel, x - 0.07, 0.7, zS - 0.6, x + 0.07, 0.715, zS - 0.58);

  // granite counter, with an opening for the sink
  b.box(M.granite, x0 - 0.02, 0.82, zN, x1, 0.86, sink0);
  b.box(M.granite, x0 - 0.02, 0.82, sink1, x1, 0.86, zS);
  b.box(M.granite, x0 - 0.02, 0.82, sink0, x0 + 0.1, 0.86, sink1);
  b.box(M.granite, x1 - 0.1, 0.82, sink0, x1, 0.86, sink1);
  b.box(M.granite, 6.0, 0.82, zS - 0.6, x0 - 0.02, 0.86, zS);

  // steel sink under the east window
  b.box(M.steel, x0 + 0.1, 0.62, sink0, x1 - 0.1, 0.64, sink1);
  b.box(M.steel, x0 + 0.1, 0.64, sink0, x0 + 0.11, 0.862, sink1);
  b.box(M.steel, x1 - 0.11, 0.64, sink0, x1 - 0.1, 0.862, sink1);
  b.box(M.steel, x0 + 0.1, 0.64, sink0, x1 - 0.1, 0.862, sink0 + 0.01);
  b.box(M.steel, x0 + 0.1, 0.64, sink1 - 0.01, x1 - 0.1, 0.862, sink1);
  b.cyl(M.steel, x1 - 0.05, 0.86, sinkMid, 0.015, 0.28);
  b.box(M.steel, x1 - 0.22, 1.12, sinkMid - 0.012, x1 - 0.04, 1.14, sinkMid + 0.012);

  // hob at the south-east end, chimney on the solid wall above it
  b.box(M.blackGlass, x0 + 0.08, 0.86, 9.42, x1 - 0.08, 0.872, 10.02);
  for (const [bx, bz, r] of [[x0 + 0.2, 9.57, 0.07], [x0 + 0.2, 9.87, 0.07], [x0 + 0.4, 9.72, 0.09]]) {
    b.cyl(M.steel, bx, 0.872, bz, r, 0.012);
    b.cyl(M.dark, bx, 0.884, bz, r + 0.02, 0.012, r * 0.7);
  }
  b.box(M.steel, x0 + 0.1, 1.55, 9.42, x1, 1.62, 10.02);
  b.box(M.dark, x0 + 0.1, 1.62, 9.42, x1, 1.68, 10.02);
  b.box(M.steel, x1 - 0.3, 1.68, 9.6, x1, 2.5, 9.84);

  // tile splashback on the solid parts of the walls behind the counter
  b.box(M.splash, x1 - 0.006, 0.86, zN, x1, 1.5, 7.85);
  b.box(M.splash, x1 - 0.006, 0.86, 9.35, x1, 1.55, zS);
  b.box(M.splash, 6.0, 0.86, zS - 0.006, 6.3, 1.5, zS);
  b.box(M.splash, 7.4, 0.86, zS - 0.006, x1, 1.5, zS);

  colliders.push({ x0: x0 - 0.02, z0: zN, x1, z1: zS, tag: 'kitchen counter' });
  colliders.push({ x0: 6.0, z0: zS - 0.6, x1: x0, z1: zS, tag: 'kitchen counter' });

  // fridge on the centre wall, right beside the microwave, facing east
  const f = at(4.665, 8.87, 'e');
  f.box(M.dark, -0.33, 0, -0.33, 0.33, 0.03, 0.3);
  f.box(M.fridge, -0.35, 0.03, -0.35, 0.35, 1.75, 0.35);
  f.box(M.dark, -0.35, 1.12, 0.35, 0.35, 1.128, 0.353);
  f.box(M.steel, 0.27, 1.2, 0.35, 0.285, 1.55, 0.385);
  f.box(M.steel, 0.27, 0.6, 0.35, 0.285, 1.05, 0.385);
  f.solid(-0.35, -0.35, 0.35, 0.35, 'fridge');

  // storage unit with a microwave on the centre wall
  const s = at(4.515, 7.7, 'e');
  s.box(M.dark, -0.78, 0, -0.2, 0.78, 0.1, 0.16);
  s.box(M.laminate, -0.8, 0.1, -0.2, 0.8, 0.82, 0.2);
  s.box(M.oak, -0.82, 0.82, -0.2, 0.82, 0.86, 0.22);
  for (const x of [-0.4, 0, 0.4]) s.box(M.dark, x - 0.004, 0.12, 0.2, x + 0.004, 0.8, 0.203);
  s.box(M.laminateGrey, -0.8, 1.45, -0.2, 0.8, 2.1, 0.12); // wall cabinets
  for (const x of [-0.4, 0, 0.4]) s.box(M.dark, x - 0.004, 1.47, 0.12, x + 0.004, 2.08, 0.123);
  s.box(M.steel, -0.65, 0.86, -0.17, -0.15, 1.14, 0.15); // microwave
  s.box(M.blackGlass, -0.63, 0.88, 0.15, -0.3, 1.12, 0.153);
  s.cyl(M.steel, 0.4, 0.86, 0, 0.09, 0.2); // steel container
  s.cyl(M.steel, 0.62, 0.86, 0.02, 0.07, 0.15);
  s.solid(-0.82, -0.2, 0.82, 0.22, 'storage unit');
}

function pooja(at, b, M) {
  // mandir against the south wall, facing north
  const p = at(7.1, 6.4675, 'n');
  const hw = 0.45;
  const hd = 0.2;
  p.box(M.teak, -hw, 0, -hd, hw, 0.85, hd);
  p.box(M.dark, -0.003, 0.05, hd, 0.003, 0.8, hd + 0.003);
  for (const x of [-0.06, 0.06]) p.cyl(M.brass, x, 0.45, hd, 0.012, 0.02);
  p.box(M.marble, -hw - 0.02, 0.85, -hd, hw + 0.02, 0.88, hd + 0.02);
  p.box(M.teak, -hw, 0.88, -hd, hw, 1.7, -hd + 0.03); // back panel
  for (const sx of [-1, 1]) {
    p.box(M.teak, sx * hw, 0.88, hd - 0.05, sx * (hw - 0.05), 1.65, hd);
    p.box(M.teak, sx * hw, 0.88, -hd + 0.03, sx * (hw - 0.02), 1.65, hd - 0.05);
  }
  p.box(M.teak, -hw - 0.03, 1.65, -hd, hw + 0.03, 1.72, hd + 0.03);
  // small stepped top
  p.box(M.teak, -0.36, 1.72, -0.16, 0.36, 1.8, 0.16);
  p.box(M.teak, -0.26, 1.8, -0.12, 0.26, 1.88, 0.12);
  p.box(M.teak, -0.16, 1.88, -0.08, 0.16, 1.96, 0.08);
  p.cyl(M.brass, 0, 1.96, 0, 0.025, 0.07, 0.004, 8);
  // idols, lamp and offerings
  p.box(M.marble, -0.3, 0.88, -0.14, 0.3, 0.93, 0.0);
  p.cyl(M.brass, 0, 0.93, -0.07, 0.06, 0.22, 0.04);
  p.sphere(M.brass, 0, 1.19, -0.07, 0.045);
  p.cyl(M.brass, -0.2, 0.93, -0.07, 0.04, 0.14, 0.028);
  p.cyl(M.brass, 0.2, 0.93, -0.07, 0.04, 0.14, 0.028);
  p.box(M.saffron, -0.42, 1.5, -hd + 0.03, 0.42, 1.56, -hd + 0.04);
  for (const x of [-0.3, 0.3]) {
    p.cyl(M.brass, x, 0.88, 0.1, 0.035, 0.03, 0.02);
    p.sphere(M.flame, x, 0.925, 0.1, 0.014, 1, 1.6, 1);
  }
  p.cyl(M.steel, 0, 0.88, 0.1, 0.07, 0.012);
  p.solid(-hw - 0.02, -hd, hw + 0.02, hd + 0.02, 'mandir');
  b.box(M.saffron, 6.75, 0.001, 5.55, 7.45, 0.012, 6.1); // prayer mat
}

/**
 * Fixed glass screen standing on the kerb between the wet and dry ends.
 * Runs z0..z1 at x; `open` is the end you walk past.
 */
function showerScreen(b, M, colliders, x, z0, z1, open) {
  b.box(M.showerGlass, x - 0.005, 0.05, z0, x + 0.005, 2.0, z1);
  b.box(M.steel, x - 0.012, 2.0, z0, x + 0.012, 2.025, z1);
  b.box(M.steel, x - 0.012, 0.05, open - 0.012, x + 0.012, 2.0, open + 0.012);
  colliders.push({ x0: x - 0.015, z0, x1: x + 0.015, z1, tag: 'shower screen' });
}

function floorDrain(b, M, x, z) {
  b.box(M.steel, x - 0.06, 0.004, z - 0.06, x + 0.06, 0.008, z + 0.06);
  b.box(M.dark, x - 0.04, 0.008, z - 0.04, x + 0.04, 0.009, z + 0.04);
}

// Both toilets: wet end (shower, drain) by the window on the west, behind a kerb
// and a glass screen; dry end (WC, basin) by the door.

function toilet1(at, b, M, colliders) {
  // wet
  shower(at(0.6, 3.81, 's'), M);
  floorDrain(b, M, 0.4, 4.6);
  showerScreen(b, M, colliders, 1.03, 4.42, 5.0292, 4.42);
  // dry: a compact WC and the basin side by side on the south wall
  wc(at(1.27, 4.7292, 'n'), M, 0.6);
  basin(at(1.87, 4.8192, 'n'), M);
}

function toilet2(at, b, M, colliders) {
  // wet
  shower(at(0.6, 5.1435, 's'), M);
  floorDrain(b, M, 0.4, 6.3);
  showerScreen(b, M, colliders, 1.03, 5.1435, 6.0, 6.0);
  // dry: WC and basin on the north wall, towel rail by the door
  wc(at(1.31, 5.4835, 's'), M);
  basin(at(1.85, 5.3535, 's'), M);
  b.box(M.steel, 1.08, 1.2, 6.62, 1.45, 1.22, 6.64);
}

function lobby(at, b, M) {
  // slim console with a mirror on the wall beside the toilets
  const p = at(2.6365, 5.75, 'e');
  p.box(M.walnut, -0.5, 0.78, -0.15, 0.5, 0.82, 0.15);
  p.box(M.walnut, -0.5, 0.55, -0.15, 0.5, 0.78, 0.13);
  for (const sx of [-1, 1]) {
    p.box(M.dark, sx * 0.48, 0, -0.13, sx * 0.44, 0.55, -0.09);
    p.box(M.dark, sx * 0.48, 0, 0.09, sx * 0.44, 0.55, 0.13);
  }
  p.box(M.dark, -0.31, 1.09, -0.16, 0.31, 1.81, -0.148);
  p.box(M.mirror, -0.29, 1.11, -0.148, 0.29, 1.79, -0.144);
  p.cyl(M.ceramic, 0.3, 0.82, 0, 0.05, 0.2, 0.07);
  p.sphere(M.plant, 0.3, 1.1, 0, 0.11, 1, 1.2, 1);
  p.solid(-0.5, -0.15, 0.5, 0.15, 'console');
}

/**
 * Soft dark patches on the floor under each piece of furniture, so nothing
 * looks like it is floating where the sun does not reach.
 */
export function contactShadows(rects, opacity = 0.34) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.shadowColor = 'rgba(0,0,0,1)';
  g.shadowBlur = 9;
  g.fillStyle = 'rgba(0,0,0,1)';
  g.fillRect(14, 14, 36, 36);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    color: 0x000000,
    transparent: true,
    opacity,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const pos = [];
  const uv = [];
  const idx = [];
  const m = 0.14; // how far the soft edge spreads past the footprint
  const us = [0.03, 0.25, 0.75, 0.97]; // soft border | dark core | soft border
  for (const r of rects) {
    if (r.tag === 'shower screen') continue;
    const xs = [r.x0 - m, r.x0, r.x1, r.x1 + m];
    const zs = [r.z0 - m, r.z0, r.z1, r.z1 + m];
    const n = pos.length / 3;
    for (let j = 0; j < 4; j++) {
      for (let i = 0; i < 4; i++) {
        pos.push(xs[i], 0.014, zs[j]);
        uv.push(us[i], us[j]);
      }
    }
    for (let j = 0; j < 3; j++) {
      for (let i = 0; i < 3; i++) {
        const v = n + j * 4 + i;
        idx.push(v, v + 4, v + 5, v, v + 5, v + 1);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals(); // the corner-shading pass needs to know these face up
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 2;
  return mesh;
}
