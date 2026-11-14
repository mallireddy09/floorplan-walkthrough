import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/**
 * Re-maps a box's texture coordinates to real size, so a texture that covers
 * `tex` metres looks the same on a small box and a large one. With `grain`,
 * the texture's lines run along the longer side of each face (like wood).
 */
function scaleBoxUV(g, w, h, d, tex, grain, seed) {
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  const off = Math.abs(Math.sin(seed * 12.9898) * 43758.5453) % 1;
  for (let f = 0; f < 6; f++) {
    const [du, dv] = dims[f];
    const swap = grain && du > dv;
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      const u = uv.getX(k);
      const v = uv.getY(k);
      if (swap) uv.setXY(k, (v * dv) / tex + off, (u * du) / tex + off * 0.7);
      else uv.setXY(k, (u * du) / tex + off, (v * dv) / tex + off * 0.7);
    }
  }
}

/** Real-size texture coordinates for any shape, projected along each face's main direction. */
function projectUV(g, tex) {
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i));
    const ay = Math.abs(n.getY(i));
    const az = Math.abs(n.getZ(i));
    if (ay >= ax && ay >= az) uv.setXY(i, p.getX(i) / tex, p.getZ(i) / tex);
    else if (ax >= az) uv.setXY(i, p.getZ(i) / tex, p.getY(i) / tex);
    else uv.setXY(i, p.getX(i) / tex, p.getY(i) / tex);
  }
}

/**
 * Collects many small geometries per material and merges them into one mesh
 * per material, so the whole home draws in a few dozen calls.
 */
export class Batch {
  /** real: use real-size textures and rounded soft shapes (the Real style). */
  constructor({ real = false } = {}) {
    this.items = new Map();
    this.real = real;
  }

  add(mat, geo) {
    let list = this.items.get(mat);
    if (!list) {
      list = [];
      this.items.set(mat, list);
    }
    list.push(geo);
    return this;
  }

  /** Axis-aligned box from two opposite corners (any order). */
  box(mat, x0, y0, z0, x1, y1, z1) {
    const w = Math.abs(x1 - x0);
    const h = Math.abs(y1 - y0);
    const d = Math.abs(z1 - z0);
    const g = new THREE.BoxGeometry(w, h, d);
    if (this.real && mat.userData.tex) scaleBoxUV(g, w, h, d, mat.userData.tex, mat.userData.grain, x0 * 7.3 + z0 * 3.1 + y0 * 1.7);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return this.add(mat, g);
  }

  /** Box with softened edges in the Real style; a plain box otherwise. */
  rbox(mat, x0, y0, z0, x1, y1, z1, r = 0.04) {
    if (!this.real) return this.box(mat, x0, y0, z0, x1, y1, z1);
    const w = Math.abs(x1 - x0);
    const h = Math.abs(y1 - y0);
    const d = Math.abs(z1 - z0);
    const rad = Math.max(0.002, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
    const g = new RoundedBoxGeometry(w, h, d, 3, rad);
    if (mat.userData.tex) projectUV(g, mat.userData.tex);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return this.add(mat, g);
  }

  /** Upright cylinder standing on y0. */
  cyl(mat, x, y0, z, r, h, rTop = r, seg = 14) {
    const g = new THREE.CylinderGeometry(rTop, r, h, seg);
    g.translate(x, y0 + h / 2, z);
    return this.add(mat, g);
  }

  sphere(mat, x, y, z, r, sx = 1, sy = 1, sz = 1) {
    const g = new THREE.SphereGeometry(r, 10, 8);
    g.scale(sx, sy, sz);
    g.translate(x, y, z);
    return this.add(mat, g);
  }

  build(parent, { cast = true, receive = true } = {}) {
    const meshes = [];
    for (const [mat, geos] of this.items) {
      // Some shapes come without an index; merging needs them all alike.
      const mixed = geos.some((g) => !g.index);
      const list = mixed ? geos.map((g) => (g.index ? g.toNonIndexed() : g)) : geos;
      for (const g of list) {
        for (const name of Object.keys(g.attributes)) {
          if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
        }
      }
      const merged = mergeGeometries(list, false);
      geos.forEach((g) => g.dispose());
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = cast && !mat.transparent && !mat.userData.noShadow;
      mesh.receiveShadow = receive && !mat.transparent;
      mesh.matrixAutoUpdate = false;
      parent.add(mesh);
      meshes.push(mesh);
    }
    this.items.clear();
    return meshes;
  }
}

/** Horizontal quad facing up, with UVs in world metres times uvScale. */
export function floorQuad(x0, z0, x1, z1, y, uvScale = 1) {
  const g = new THREE.BufferGeometry();
  g.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([x0, y, z0, x0, y, z1, x1, y, z1, x1, y, z0], 3),
  );
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  g.setAttribute(
    'uv',
    new THREE.Float32BufferAttribute(
      [x0 * uvScale, z0 * uvScale, x0 * uvScale, z1 * uvScale, x1 * uvScale, z1 * uvScale, x1 * uvScale, z0 * uvScale],
      2,
    ),
  );
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

/**
 * Vertical quad lying on a wall face.
 * axis 'x': runs along x at z = pos. axis 'z': runs along z at x = pos.
 * facing is +1 or -1: which way the visible side points along the other axis.
 */
export function wallQuad(axis, pos, a0, a1, y0, y1, facing, tileW = 1, tileH = 1) {
  const g = new THREE.BufferGeometry();
  let p;
  let n;
  let ccw;
  if (axis === 'x') {
    p = [a0, y0, pos, a1, y0, pos, a1, y1, pos, a0, y1, pos];
    n = [0, 0, facing];
    ccw = facing > 0;
  } else {
    p = [pos, y0, a0, pos, y0, a1, pos, y1, a1, pos, y1, a0];
    n = [facing, 0, 0];
    ccw = facing < 0;
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([...n, ...n, ...n, ...n], 3));
  g.setAttribute(
    'uv',
    new THREE.Float32BufferAttribute(
      [a0 / tileW, y0 / tileH, a1 / tileW, y0 / tileH, a1 / tileW, y1 / tileH, a0 / tileW, y1 / tileH],
      2,
    ),
  );
  g.setIndex(ccw ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]);
  return g;
}

/** Flat picture on a wall face, showing the part (u0,v0)-(u1,v1) of its texture. */
export function pictureQuad(axis, pos, a0, a1, y0, y1, facing, u0 = 0, v0 = 0, u1 = 1, v1 = 1) {
  const g = wallQuad(axis, pos, a0, a1, y0, y1, facing);
  // Keep the picture the right way round whichever way the wall faces.
  const flip = (axis === 'x') === (facing < 0);
  const ua = flip ? u1 : u0;
  const ub = flip ? u0 : u1;
  g.setAttribute('uv', new THREE.Float32BufferAttribute([ua, v0, ub, v0, ub, v1, ua, v1], 2));
  return g;
}

/**
 * A hanging curtain panel with soft folds, running along a wall.
 * axis/pos/facing as for wallQuad; the folds stand out from pos toward `facing`.
 */
export function curtainPanel(axis, pos, a0, a1, y0, y1, facing) {
  const n = Math.max(6, Math.round((a1 - a0) / 0.035));
  const p = [];
  const uv = [];
  const idx = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = a0 + (a1 - a0) * t;
    const c = pos + facing * (0.055 + 0.022 * Math.sin(t * n * 1.05) + 0.008 * Math.sin(t * n * 2.7 + 1));
    for (const y of [y0, y1]) {
      if (axis === 'x') p.push(a, y, c);
      else p.push(c, y, a);
      uv.push(t * 3, (y - y0) / (y1 - y0));
    }
    if (i < n) {
      const k = i * 2;
      idx.push(k, k + 2, k + 3, k, k + 3, k + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
