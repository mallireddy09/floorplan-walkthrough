import * as THREE from 'three';
import { floorQuad, pictureQuad, curtainPanel } from './geom.js';
import { wallLining } from './house.js';

// Everything that turns the furnished model into a lived-in home: feature
// walls, curtains, pictures, switch plates, things left on tables and counters,
// bathroom bits, and trees and neighbours outside the windows.
// All positions are in metres on the plan (x east, z south).

/** Box fixed to a wall face: runs a0..a1 along it, and t0..t1 out from it. */
function onWall(b, mat, axis, pos, facing, a0, a1, y0, y1, t0, t1) {
  const c0 = pos + facing * t0;
  const c1 = pos + facing * t1;
  if (axis === 'x') b.box(mat, a0, y0, c0, a1, y1, c1);
  else b.box(mat, c0, y0, a0, c1, y1, a1);
}

/** Framed picture from the art sheet (cell = [column, row] of a 3 x 3 sheet). */
function framed(b, M, axis, pos, facing, a0, a1, y0, y1, cell, frameMat = M.frame, depth = 0.02) {
  if (frameMat) onWall(b, frameMat, axis, pos, facing, a0 - 0.025, a1 + 0.025, y0 - 0.025, y1 + 0.025, 0, depth);
  const [cx, cy] = cell;
  b.add(M.art, pictureQuad(axis, pos + facing * (depth + 0.0015), a0, a1, y0, y1, facing, cx / 3, 1 - (cy + 1) / 3, (cx + 1) / 3, 1 - cy / 3));
}

/** Disc standing flat against a wall that runs north-south (faces +x or -x). */
function wallDisc(b, mat, x, y, z, r, t) {
  const g = new THREE.CylinderGeometry(r, r, t, 28);
  g.rotateZ(Math.PI / 2);
  g.translate(x, y, z);
  b.add(mat, g);
}

/** Where the inside face of an outer wall is, for hanging things by a window. */
function insideFace(plan, wallId) {
  const w = plan.walls.find((q) => q.id === wallId);
  switch (wallId) {
    case 'N':
      return { axis: 'x', pos: w.z1, facing: +1 };
    case 'S':
      return { axis: 'x', pos: w.z0, facing: -1 };
    case 'W':
      return { axis: 'z', pos: w.x1, facing: +1 };
    default:
      return { axis: 'z', pos: w.x0, facing: -1 };
  }
}

// ------------------------------------------------------------------ shell

/** Feature walls, curtains, blinds, switch plates, and the outdoors. */
export function realShell(plan, M, { main, up, colliders }) {
  const room = (id) => plan.rooms.find((r) => r.id === id);
  const win = (id) => plan.windows.find((w) => w.id === id);

  // painted feature walls
  wallLining(plan, room('hall'), 3.0, M.accentHall, main, 1.1, 1.1, { y0: 0.08, sides: ['w'] });
  wallLining(plan, room('mbed'), 3.0, M.accentMaster, main, 1.1, 1.1, { y0: 0.08, sides: ['w'] });
  wallLining(plan, room('cbed'), 3.0, M.accentKids, main, 1.1, 1.1, { y0: 0.08, sides: ['w'] });

  // curtains, drawn open to each side of the window
  const curtains = [
    ['hallE2', M.curtainHall, 0.86], // stops above the sofa back
    ['hallN1', M.curtainHall, 0.1],
    ['cbedW', M.curtainKids, 0.1],
    ['mbedS', M.curtainMaster, 0.92], // stops above the headboard
  ];
  for (const [id, mat, drop] of curtains) {
    const w = win(id);
    const f = insideFace(plan, w.wall);
    onWall(main, M.dark, f.axis, f.pos, f.facing, w.from - 0.3, w.to + 0.3, 2.262, 2.284, 0.05, 0.072);
    main.add(mat, curtainPanel(f.axis, f.pos, w.from - 0.26, w.from + 0.1, drop, 2.262, f.facing));
    main.add(mat, curtainPanel(f.axis, f.pos, w.to - 0.1, w.to + 0.26, drop, 2.262, f.facing));
  }
  // roller blinds, rolled up, where curtains would get in the way
  for (const id of ['kitchenE', 'kitchenS', 'poojaE']) {
    const w = win(id);
    const f = insideFace(plan, w.wall);
    const head = w.sill + w.height;
    onWall(main, M.blind, f.axis, f.pos, f.facing, w.from - 0.03, w.to + 0.03, head - 0.02, head + 0.07, 0.005, 0.075);
    onWall(main, M.blind, f.axis, f.pos, f.facing, w.from, w.to, head - 0.16, head - 0.02, 0.03, 0.036);
  }

  // switch plates by the doors
  const plate = (axis, pos, facing, a) => onWall(main, M.switchPlate, axis, pos, facing, a - 0.06, a + 0.06, 1.22, 1.3, 0, 0.012);
  plate('x', 0.2286, +1, 7.2); // hall, beside the main door
  plate('x', 3.6957, -1, 3.1); // C. Bed Room
  plate('x', 6.7818, +1, 3.12); // M. Bed Room
  plate('z', 4.3053, +1, 9.75); // kitchen, by the south door
  plate('z', 2.4765, +1, 4.88); // lobby, for Toilet 1
  plate('z', 4.3053, +1, 5.08); // passage

  outdoors(plan, M, main, colliders);
}

function tree(b, M, colliders, x, z, s = 1) {
  b.cyl(M.bark, x, -0.05, z, 0.17 * s, 2.5 * s, 0.11 * s, 8);
  const blobs = [
    [0, 3.3, 0, 1.45],
    [0.8, 3.0, 0.3, 1.05],
    [-0.7, 3.1, -0.4, 1.1],
    [0.2, 4.2, -0.2, 1.0],
    [-0.3, 2.7, 0.7, 0.9],
  ];
  for (const [dx, y, dz, r] of blobs) b.sphere(M.leaves, x + dx * s, y * s, z + dz * s, r * s, 1, 0.82, 1);
  colliders.push({ x0: x - 0.2, z0: z - 0.2, x1: x + 0.2, z1: z + 0.2, tag: 'outdoor' });
}

function potted(b, M, colliders, x, z) {
  b.cyl(M.pot, x, -0.03, z, 0.17, 0.4, 0.22);
  b.sphere(M.plant, x, 0.72, z, 0.3, 1, 1.1, 1);
  b.sphere(M.plant, x + 0.1, 1.0, z - 0.05, 0.2);
  colliders.push({ x0: x - 0.22, z0: z - 0.22, x1: x + 0.22, z1: z + 0.22, tag: 'outdoor' });
}

function outdoors(plan, M, b, colliders) {
  const p = plan.plot;

  // paved paths: from the walk gate up the east side, across the north front to the main
  // door, a small landing outside the kitchen door, and a drive in from the main gate
  b.add(M.paving, floorQuad(9.4, -1.9, 12.7, p.z1, -0.012, 1 / 1.1));
  b.add(M.paving, floorQuad(12.7, 4.6, 15.4, p.z1, -0.012, 1 / 1.1));
  b.add(M.paving, floorQuad(3.3, -1.9, 9.4, -0.02, -0.012, 1 / 1.1));
  b.add(M.paving, floorQuad(4.3, 10.69, 6.1, p.z1, -0.012, 1 / 1.1));
  b.add(M.paving, floorQuad(8.1, 0.45, 9.4, 2.45, -0.012, 1 / 1.1)); // outside the Hall's east door

  potted(b, M, colliders, 5.45, -0.4);
  potted(b, M, colliders, 7.55, -0.4);

  // trees in the yard and beyond the compound wall
  tree(b, M, colliders, 14.2, 2.2, 1.0);
  tree(b, M, colliders, 16.4, 8.6, 0.8); // beside the drive, clear of the main gate
  tree(b, M, colliders, 11.4, -4.6, 0.9);
  tree(b, M, colliders, 20.5, -1.5, 1.15);
  tree(b, M, colliders, 21.5, 9.0, 1.0);
  tree(b, M, colliders, 3.5, -9.0, 1.1);
  tree(b, M, colliders, -6.5, 15.0, 1.0);
  tree(b, M, colliders, 16.0, 16.5, 1.1);

  // washing line along the east boundary, clear of the drive
  for (const z of [3.4, 6.4]) b.cyl(M.gate, 16.5, -0.03, z, 0.03, 2.0);
  b.box(M.dark, 16.496, 1.9, 3.4, 16.504, 1.906, 6.4);
  const wash = [M.towel, M.blue, M.throwCloth, M.sheet, M.yellow];
  wash.forEach((m, i) => {
    const z = 3.75 + i * 0.52;
    b.box(m, 16.49, 1.9 - (0.55 + (i % 2) * 0.25), z, 16.51, 1.905, z + 0.42);
  });
  colliders.push({ x0: 16.45, z0: 3.35, x1: 16.55, z1: 6.45, tag: 'outdoor' });

  // neighbouring houses beyond the compound wall
  const house = (x0, z0, x1, z1, h) => {
    b.box(M.facade, x0, -0.08, z0, x1, h, z1);
    b.box(M.roof, x0 - 0.2, h, z0 - 0.2, x1 + 0.2, h + 0.25, z1 + 0.2);
  };
  house(20.5, 1.0, 29.0, 9.5, 6.4); // east
  house(-1.0, -17.0, 9.5, -10.0, 6.0); // north
  house(11.5, -18.0, 19.5, -11.0, 7.2);
  house(1.0, 21.0, 12.0, 29.0, 7.0); // across the main road
  house(-15.5, 0.5, -8.5, 10.0, 6.6); // across the west road

  // street lamp on the main road and lamps on the gate posts
  b.cyl(M.gate, 6.2, -0.08, p.z1 + 1.6, 0.06, 5.0);
  b.box(M.gate, 6.17, 4.86, p.z1 + 0.9, 6.23, 4.92, p.z1 + 1.6);
  b.box(M.streetLamp, 6.05, 4.78, p.z1 + 0.75, 6.35, 4.86, p.z1 + 1.05);
  for (const g of p.gates) {
    for (const x of [g.from - 0.1, g.to + 0.1]) b.sphere(M.streetLamp, x, 1.79, p.z1 + 0.075, 0.1);
  }
}

// ------------------------------------------------------------------ rooms

/** Things on and around the furniture. Small floor items sit where nobody can walk. */
export function realDetails(plan, M, { b, colliders }) {
  hall(b, M);
  corridor(b, M);
  childBedroom(b, M, colliders);
  masterBedroom(b, M, colliders);
  kitchen(b, M, colliders);
  pooja(b, M);
  toilet1(b, M, colliders);
  toilet2(b, M, colliders);
}

function hall(b, M) {
  // doormat, and shoes left behind the door
  b.rbox(M.coir, 6.1, 0.001, 0.32, 6.9, 0.016, 0.78, 0.006);
  for (const [x, z, m] of [[7.14, 0.36, M.dark], [7.24, 0.36, M.dark], [7.14, 0.64, M.brown], [7.24, 0.64, M.brown]]) {
    b.rbox(m, x - 0.045, 0.001, z - 0.12, x + 0.045, 0.075, z + 0.12, 0.03);
  }

  // coffee table: paper, remote, mugs
  b.box(M.paper, 6.0, 0.4, 3.66, 6.28, 0.409, 3.9);
  b.box(M.dark, 6.33, 0.4, 3.45, 6.38, 0.42, 3.62);
  b.cyl(M.blue, 6.08, 0.4, 3.3, 0.04, 0.09);
  b.cyl(M.red, 6.36, 0.4, 4.08, 0.04, 0.09);

  // throw over the sofa arm
  b.rbox(M.throwCloth, 6.93, 0.612, 4.57, 7.5, 0.65, 4.765, 0.015);
  b.rbox(M.throwCloth, 6.915, 0.3, 4.57, 6.945, 0.65, 4.765, 0.012);

  // floor lamp in the corner beside the sofa
  b.cyl(M.dark, 7.63, 0, 4.895, 0.125, 0.02);
  b.cyl(M.dark, 7.63, 0.02, 4.895, 0.012, 1.42);
  b.cyl(M.lampShade, 7.63, 1.42, 4.895, 0.13, 0.26, 0.1, 20);

  // pictures and a clock
  framed(b, M, 'z', 4.3053, +1, 1.05, 2.0, 1.3, 1.95, [0, 0]);
  framed(b, M, 'x', 5.0292, -1, 6.35, 7.45, 1.25, 1.9, [1, 0]);
  wallDisc(b, M.dark, 4.3203, 2.05, 2.45, 0.16, 0.03);
  wallDisc(b, M.switchPlate, 4.3373, 2.05, 2.45, 0.143, 0.006);
  b.box(M.dark, 4.34, 2.045, 2.444, 4.344, 2.15, 2.456);
  b.box(M.dark, 4.34, 2.044, 2.45, 4.344, 2.056, 2.52);

  // family photo on the TV unit
  b.box(M.frameLight, 4.4, 0.5, 4.3, 4.416, 0.68, 4.5);
  b.add(M.art, pictureQuad('z', 4.4175, 4.32, 4.48, 0.52, 0.66, +1, 0, 0, 1 / 3, 1 / 3));
}

function corridor(b, M) {
  // runner rug in the lobby, photos on the wall, post on the console
  b.box(M.runner, 3.05, 0.001, 4.1, 3.85, 0.012, 6.4);
  framed(b, M, 'z', 4.191, -1, 4.05, 4.45, 1.35, 1.75, [0, 2], M.frameLight);
  framed(b, M, 'z', 4.191, -1, 4.6, 5.0, 1.35, 1.75, [1, 2], M.frameLight);
  b.cyl(M.brass, 2.63, 0.82, 6.0, 0.05, 0.03, 0.075);
  b.box(M.paper, 2.55, 0.82, 5.62, 2.72, 0.835, 5.8);
  // mandala beside the pooja door
  framed(b, M, 'z', 5.9055, -1, 6.13, 6.57, 1.3, 1.74, [2, 2], M.frameLight);
}

function childBedroom(b, M, colliders) {
  // posters over the bed, on the south wall
  for (const [x0, cell] of [[1.57, [0, 1]], [2.2, [1, 1]]]) {
    b.box(M.paper, x0 - 0.01, 1.24, 3.6907, x0 + 0.56, 1.96, 3.6957);
    framed(b, M, 'x', 3.6957, -1, x0, x0 + 0.55, 1.25, 1.95, cell, null, 0.005);
  }
  // teddy on the bed
  b.sphere(M.brown, 2.05, 0.65, 3.0, 0.1);
  b.sphere(M.brown, 2.05, 0.79, 3.0, 0.075);
  b.sphere(M.brown, 1.99, 0.85, 3.0, 0.028);
  b.sphere(M.brown, 2.11, 0.85, 3.0, 0.028);
  b.sphere(M.paper, 2.05, 0.78, 2.94, 0.03);
  // school bag beside the bookshelf, ball tucked in the corner behind it
  b.rbox(M.blue, 1.68, 0, 0.24, 1.92, 0.4, 0.48, 0.05);
  b.rbox(M.red, 1.72, 0.05, 0.47, 1.88, 0.22, 0.515, 0.02);
  colliders.push({ x0: 1.68, z0: 0.24, x1: 1.92, z1: 0.52, tag: 'prop' });
  b.sphere(M.red, 0.47, 0.11, 0.4, 0.11);
  // desk on the east wall: books, pencil pot, notebook
  [M.bookA, M.bookB, M.bookC].forEach((m, i) => b.box(m, 3.86, 0.75 + i * 0.03, 1.4 + i * 0.01, 4.1, 0.78 + i * 0.03, 1.58 - i * 0.01));
  b.cyl(M.green, 4.1, 0.75, 0.48, 0.035, 0.09);
  b.cyl(M.yellow, 4.09, 0.84, 0.48, 0.004, 0.08);
  b.cyl(M.red, 4.11, 0.84, 0.49, 0.004, 0.07);
  b.box(M.paper, 3.66, 0.75, 0.63, 3.8, 0.756, 0.87);
  // cardigan over the chair back
  b.rbox(M.pink, 3.208, 0.56, 0.64, 3.23, 0.93, 1.02, 0.01);
  b.rbox(M.pink, 3.208, 0.9, 0.64, 3.27, 0.93, 1.02, 0.01);
  // blocks and a globe on top of the bookshelf
  b.box(M.red, 0.82, 1.5, 0.34, 0.9, 1.58, 0.42);
  b.box(M.yellow, 0.92, 1.5, 0.34, 1.0, 1.58, 0.42);
  b.box(M.blue, 0.87, 1.58, 0.345, 0.95, 1.66, 0.425);
  b.cyl(M.dark, 1.4, 1.5, 0.39, 0.05, 0.03);
  b.sphere(M.blue, 1.4, 1.62, 0.39, 0.09);
}

function masterBedroom(b, M, colliders) {
  // picture on the east wall, now that the wardrobe stands on the west wall
  framed(b, M, 'z', 4.191, -1, 8.4, 9.6, 1.3, 1.95, [2, 0]);
  // throw across the foot of the bed (the north end), two cushions against the pillows
  b.rbox(M.throwCloth, 1.585, 0.535, 8.5, 3.415, 0.578, 8.95, 0.015);
  b.rbox(M.throwCloth, 1.575, 0.3, 8.5, 1.602, 0.565, 8.95, 0.012);
  b.rbox(M.throwCloth, 3.398, 0.3, 8.5, 3.425, 0.565, 8.95, 0.012);
  b.rbox(M.mustard, 1.9, 0.545, 9.78, 2.3, 0.9, 9.9, 0.05);
  b.rbox(M.throwCloth, 2.7, 0.545, 9.78, 3.1, 0.9, 9.9, 0.05);
  // bedside table
  b.box(M.bookB, 3.48, 0.5, 10.07, 3.62, 0.53, 10.2);
  b.cyl(M.glass, 3.83, 0.5, 10.12, 0.03, 0.1);
  // slippers at the foot of the bed, laundry basket in the corner
  b.rbox(M.blue, 1.85, 0.001, 8.12, 1.95, 0.04, 8.38, 0.02);
  b.rbox(M.blue, 1.99, 0.001, 8.12, 2.09, 0.04, 8.38, 0.02);
  b.cyl(M.basket, 0.44, 0, 7.02, 0.16, 0.45, 0.2, 16);
  b.sphere(M.towel, 0.44, 0.45, 7.02, 0.17, 1, 0.5, 1);
  colliders.push({ x0: 0.24, z0: 6.8, x1: 0.65, z1: 7.23, tag: 'prop' });
  // full-length mirror between the two doors
  onWall(b, M.frameLight, 'x', 6.7818, +1, 2.45, 2.95, 0.35, 1.9, 0, 0.025);
  onWall(b, M.mirror, 'x', 6.7818, +1, 2.48, 2.92, 0.38, 1.87, 0.025, 0.03);
}

function kitchen(b, M, colliders) {
  const x0 = 7.2486;
  const top = 0.86;
  // kettle and spice jars at the north end of the counter
  b.cyl(M.steel, 7.62, top, 7.68, 0.075, 0.16, 0.06);
  b.cyl(M.dark, 7.62, top + 0.16, 7.68, 0.05, 0.02);
  b.box(M.dark, 7.5, top + 0.06, 7.67, 7.55, top + 0.16, 7.69);
  [M.red, M.yellow, M.brown, M.green].forEach((m, i) => {
    b.cyl(m, 7.78, top, 7.57 + i * 0.075, 0.03, 0.08);
    b.cyl(M.steel, 7.78, top + 0.08, 7.57 + i * 0.075, 0.031, 0.012);
  });
  // chopping board with tomatoes and a knife
  b.box(M.oak, 7.33, top, 8.55, 7.6, top + 0.015, 8.83);
  b.sphere(M.red, 7.4, top + 0.045, 8.62, 0.032);
  b.sphere(M.red, 7.46, top + 0.045, 8.7, 0.032);
  b.box(M.steel, 7.5, top + 0.015, 8.6, 7.525, top + 0.018, 8.72);
  b.box(M.dark, 7.5, top + 0.015, 8.72, 7.525, top + 0.03, 8.79);
  // washed-up things beside the sink
  b.box(M.steel, 7.42, top, 8.86, 7.78, top + 0.012, 9.3);
  b.cyl(M.steel, 7.6, top + 0.012, 8.98, 0.105, 0.05);
  b.cyl(M.steel, 7.52, top + 0.012, 9.2, 0.035, 0.09, 0.03);
  b.cyl(M.steel, 7.62, top + 0.012, 9.2, 0.035, 0.09, 0.03);
  b.cyl(M.steel, 7.72, top + 0.012, 9.18, 0.055, 0.045, 0.07);
  // pressure cooker and kadhai on the hob
  b.cyl(M.steel, x0 + 0.4, top + 0.036, 9.72, 0.1, 0.13);
  b.cyl(M.steel, x0 + 0.4, top + 0.166, 9.72, 0.1, 0.03, 0.05);
  b.cyl(M.dark, x0 + 0.4, top + 0.196, 9.72, 0.012, 0.04);
  b.box(M.dark, x0 + 0.2, top + 0.12, 9.705, x0 + 0.31, top + 0.145, 9.735);
  b.cyl(M.dark, x0 + 0.2, top + 0.036, 9.57, 0.06, 0.05, 0.1);
  b.box(M.dark, x0 + 0.06, top + 0.07, 9.56, x0 + 0.12, top + 0.085, 9.58);
  // steel tins in the corner, mixer and fruit on the return
  b.cyl(M.steel, 7.62, top, 10.25, 0.09, 0.2);
  b.cyl(M.steel, 7.42, top, 10.28, 0.075, 0.16);
  b.rbox(M.plastic, 6.04, top, 10.1, 6.24, top + 0.16, 10.3, 0.03);
  b.cyl(M.steel, 6.14, top + 0.16, 10.2, 0.06, 0.16, 0.07);
  b.cyl(M.dark, 6.14, top + 0.32, 10.2, 0.072, 0.02);
  b.cyl(M.oak, 6.78, top, 10.12, 0.09, 0.06, 0.14, 18);
  b.sphere(M.orange, 6.74, top + 0.08, 10.1, 0.042);
  b.sphere(M.orange, 6.82, top + 0.08, 10.15, 0.042);
  b.sphere(M.red, 6.79, top + 0.085, 10.06, 0.038);
  b.sphere(M.banana, 6.77, top + 0.11, 10.16, 0.03, 3.0, 0.9, 0.9);
  // tea towel on a handle, mat in front of the sink
  b.box(M.teaTowel, x0 - 0.014, 0.38, 8.94, x0 + 0.002, 0.72, 9.14);
  b.rbox(M.mat, 6.6, 0.001, 7.8, 7.2, 0.014, 8.6, 0.006);
  // fridge: magnets, a note, a basket on top
  b.box(M.red, 5.015, 1.45, 8.72, 5.022, 1.5, 8.77);
  b.box(M.yellow, 5.015, 1.52, 8.9, 5.022, 1.58, 8.96);
  b.box(M.blue, 5.015, 1.3, 9.04, 5.022, 1.34, 9.1);
  b.box(M.paper, 5.015, 1.3, 8.8, 5.021, 1.42, 8.9);
  b.rbox(M.basket, 4.4, 1.75, 8.62, 4.9, 1.9, 9.12, 0.02);
  // water purifier above the north end of the counter, calendar by the door: both kept off the Pooja wall
  onWall(b, M.plastic, 'z', 7.8486, -1, 7.56, 7.82, 1.35, 1.8, 0, 0.13);
  onWall(b, M.blue, 'z', 7.8486, -1, 7.6, 7.78, 1.52, 1.76, 0.13, 0.134);
  b.cyl(M.steel, 7.76, 1.33, 7.69, 0.01, 0.03);
  b.box(M.paper, 4.3053, 1.29, 9.29, 4.3093, 1.73, 9.59);
  framed(b, M, 'z', 4.3053, +1, 9.3, 9.58, 1.3, 1.72, [2, 1], null, 0.004);
  // bin beside the storage unit
  b.cyl(M.laminateGrey, 4.47, 0, 9.4, 0.12, 0.32, 0.135, 16);
  b.cyl(M.dark, 4.47, 0.32, 9.4, 0.14, 0.02, 0.14, 16);
  colliders.push({ x0: 4.33, z0: 9.26, x1: 4.61, z1: 9.54, tag: 'prop' });
  // jars and a herb pot on the storage unit
  b.cyl(M.brown, 4.5, top, 7.52, 0.04, 0.12);
  b.cyl(M.yellow, 4.5, top, 7.63, 0.04, 0.12);
  b.cyl(M.steel, 4.5, top + 0.12, 7.52, 0.042, 0.012);
  b.cyl(M.steel, 4.5, top + 0.12, 7.63, 0.042, 0.012);
  b.cyl(M.pot, 4.5, top, 8.43, 0.045, 0.08, 0.055);
  b.sphere(M.plant, 4.5, top + 0.14, 8.43, 0.08);
}

function pooja(b, M) {
  // picture on the back panel, garland along the front, bell, flowers and a plate
  framed(b, M, 'x', 6.6375, -1, 6.9, 7.3, 1.05, 1.45, [2, 2], null, 0.001);
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    b.sphere(i % 2 ? M.orange : M.yellow, 6.7 + t * 0.8, 1.63 - 0.07 * Math.sin(Math.PI * t), 6.285, 0.024);
  }
  b.cyl(M.dark, 7.38, 1.56, 6.34, 0.003, 0.09);
  b.cyl(M.brass, 7.38, 1.5, 6.34, 0.035, 0.06, 0.012, 12);
  for (const [x, z, m] of [[6.86, 6.46, M.orange], [6.9, 6.43, M.yellow], [7.3, 6.45, M.orange], [7.34, 6.42, M.red], [7.1, 6.4, M.yellow]]) {
    b.sphere(m, x, 0.895, z, 0.018);
  }
  b.cyl(M.steel, 6.95, 0.88, 6.36, 0.06, 0.008);
  b.sphere(M.red, 6.93, 0.895, 6.36, 0.014);
  b.sphere(M.yellow, 6.97, 0.895, 6.37, 0.014);
  b.cyl(M.brown, 7.27, 0.88, 6.33, 0.003, 0.18);
  // rangoli on the floor inside the door
  b.cyl(M.red, 6.42, 0.001, 5.82, 0.2, 0.003, 0.2, 24);
  b.cyl(M.yellow, 6.42, 0.004, 5.82, 0.14, 0.002, 0.14, 24);
  b.cyl(M.paper, 6.42, 0.006, 5.82, 0.075, 0.002, 0.075, 24);
}

function bucketAndMug(b, M, x, z, mx, mz) {
  b.cyl(M.bucket, x, 0.004, z, 0.12, 0.3, 0.155, 18);
  b.cyl(M.red, mx, 0.004, mz, 0.045, 0.1, 0.055, 14);
}

function geyser(b, M, x, z) {
  b.cyl(M.plastic, x, 1.85, z, 0.17, 0.42, 0.17, 20);
  b.cyl(M.steel, x - 0.07, 1.25, z, 0.008, 0.6);
  b.cyl(M.steel, x + 0.07, 1.25, z, 0.008, 0.6);
}

function toilet1(b, M, colliders) {
  // wet end: bucket and mug, geyser, bottles on a shelf under the window
  bucketAndMug(b, M, 0.45, 4.8, 0.72, 4.9);
  colliders.push({ x0: 0.29, z0: 4.63, x1: 0.78, z1: 4.97, tag: 'prop' });
  geyser(b, M, 0.62, 4.854);
  onWall(b, M.steel, 'z', 0.2286, +1, 4.25, 4.55, 1.1, 1.112, 0, 0.1);
  b.cyl(M.blue, 0.28, 1.112, 4.31, 0.028, 0.16);
  b.cyl(M.orange, 0.28, 1.112, 4.4, 0.03, 0.12);
  b.cyl(M.paper, 0.28, 1.112, 4.49, 0.025, 0.14);
  // dry end: soap and brushes on the basin, towel on a hook, mat where you step out of the shower
  b.cyl(M.green, 2.07, 0.86, 4.96, 0.03, 0.09);
  b.cyl(M.blue, 2.065, 0.95, 4.96, 0.004, 0.08);
  b.cyl(M.pink, 2.08, 0.95, 4.965, 0.004, 0.07);
  b.rbox(M.pink, 1.64, 0.86, 4.93, 1.71, 0.885, 4.975, 0.01);
  onWall(b, M.towel, 'x', 3.81, +1, 1.18, 1.42, 0.95, 1.5, 0.012, 0.04);
  onWall(b, M.steel, 'x', 3.81, +1, 1.28, 1.32, 1.5, 1.53, 0, 0.05);
  b.rbox(M.coir, 1.08, 0.005, 3.86, 1.5, 0.02, 4.38, 0.006);
}

function toilet2(b, M, colliders) {
  // wet end
  bucketAndMug(b, M, 0.43, 5.35, 0.64, 5.28);
  colliders.push({ x0: 0.27, z0: 5.19, x1: 0.69, z1: 5.5, tag: 'prop' });
  geyser(b, M, 0.55, 6.49);
  onWall(b, M.steel, 'z', 0.2286, +1, 6.3, 6.6, 1.1, 1.112, 0, 0.1);
  b.cyl(M.green, 0.28, 1.112, 6.36, 0.028, 0.17);
  b.cyl(M.paper, 0.28, 1.112, 6.45, 0.03, 0.13);
  b.cyl(M.orange, 0.28, 1.112, 6.54, 0.025, 0.11);
  // dry end: towel over the rail, mat where you step out of the shower
  b.rbox(M.towel, 1.1, 0.72, 6.598, 1.4, 1.228, 6.628, 0.01);
  b.rbox(M.towel, 1.1, 1.205, 6.598, 1.4, 1.238, 6.66, 0.01);
  b.rbox(M.coir, 1.08, 0.005, 6.05, 1.5, 0.02, 6.47, 0.006);
  b.cyl(M.green, 1.67, 0.86, 5.2, 0.03, 0.09);
  b.cyl(M.blue, 1.665, 0.95, 5.2, 0.004, 0.08);
  b.rbox(M.pink, 2.01, 0.86, 5.2, 2.08, 0.885, 5.245, 0.01);
}
