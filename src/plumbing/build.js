import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { design, LAYERS, HOT, roofOutline, surfaceFlows } from './design.js';

// Turns the plumbing design into 3D: one group per system, so each can be
// switched on and off, and every pipe, chamber and tank can be clicked.

const UP = new THREE.Vector3(0, 1, 0);
const v3 = (p) => new THREE.Vector3(p[0], p[1], p[2]);

/** Round pipe through a list of points, with rounded joints. */
function tube(points, r, seg = 10) {
  const geos = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = v3(points[i]);
    const b = v3(points[i + 1]);
    const d = b.clone().sub(a);
    const len = d.length();
    if (len < 1e-4) continue;
    const g = new THREE.CylinderGeometry(r, r, len, seg, 1, true);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()));
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    geos.push(g);
  }
  for (const p of points) {
    const s = new THREE.SphereGeometry(r, seg, 6);
    s.translate(p[0], p[1], p[2]);
    geos.push(s);
  }
  return mergeGeometries(geos, false);
}

/** Small cones along a route, pointing the way the water flows. */
function arrowsAlong(points, r, out) {
  for (let i = 0; i < points.length - 1; i++) {
    const a = v3(points[i]);
    const b = v3(points[i + 1]);
    const d = b.clone().sub(a);
    const len = d.length();
    if (len < 0.5) continue;
    const n = Math.max(1, Math.round(len / 1.7));
    const q = new THREE.Quaternion().setFromUnitVectors(UP, d.clone().normalize());
    for (let k = 0; k < n; k++) {
      const p = a.clone().addScaledVector(d, (k + 0.5) / n);
      const g = new THREE.ConeGeometry(r + 0.032, 0.17 + r * 1.5, 12);
      g.applyQuaternion(q);
      g.translate(p.x, p.y, p.z);
      out.push(g);
    }
  }
}

function labelSprite(text, small, shrink = 1) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  const px = small ? 26 : 30;
  const font = `600 ${px}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
  g.font = font;
  const w = Math.ceil(g.measureText(text).width) + 22;
  const h = px + 16;
  c.width = w;
  c.height = h;
  g.font = font;
  g.fillStyle = small ? 'rgba(255,255,255,0.86)' : 'rgba(22,24,27,0.84)';
  g.beginPath();
  g.roundRect(0, 0, w, h, 9);
  g.fill();
  g.fillStyle = small ? '#1c2228' : '#fff';
  g.textBaseline = 'middle';
  g.fillText(text, 11, h / 2 + 1);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, sizeAttenuation: false }));
  const k = (small ? 0.0155 : 0.0185) * shrink; // fraction of the view height, whatever the zoom
  s.scale.set((k * w) / h, k, 1);
  s.center.set(0.5, 0);
  s.renderOrder = 30;
  return s;
}

/** compact: smaller name tags, for a phone-sized screen. */
export function buildPlumbing({ compact = false } = {}) {
  const root = new THREE.Group();
  root.visible = false;
  const layers = {};
  const pickables = [];
  const labelSprites = [];

  const pipeMat = {};
  const darkMat = {};
  for (const [id, L] of Object.entries(LAYERS)) {
    layers[id] = new THREE.Group();
    root.add(layers[id]);
    pipeMat[id] = new THREE.MeshLambertMaterial({ color: L.color });
    darkMat[id] = new THREE.MeshLambertMaterial({ color: new THREE.Color(L.color).multiplyScalar(0.5) });
  }
  const hotMat = new THREE.MeshLambertMaterial({ color: HOT });
  const shell = new THREE.MeshLambertMaterial({ color: 0x9aa3ab, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide });
  const concrete = new THREE.MeshLambertMaterial({ color: 0x7c858d });
  const cover = new THREE.MeshLambertMaterial({ color: 0x3a4148 });
  const waterMat = new THREE.MeshLambertMaterial({ color: 0x4f9be8, transparent: true, opacity: 0.4, depthWrite: false });
  const sewageMat = new THREE.MeshLambertMaterial({ color: 0x8a7a55, transparent: true, opacity: 0.45, depthWrite: false });
  const sludgeMat = new THREE.MeshLambertMaterial({ color: 0x4f432c, transparent: true, opacity: 0.7, depthWrite: false });
  const gravelMat = new THREE.MeshLambertMaterial({ color: 0xa79c8a, transparent: true, opacity: 0.55, depthWrite: false });
  const sandMat = new THREE.MeshLambertMaterial({ color: 0xd9c48f, transparent: true, opacity: 0.6, depthWrite: false });
  const boulderMat = new THREE.MeshLambertMaterial({ color: 0x8b8f93, transparent: true, opacity: 0.6, depthWrite: false });

  const add = (layer, mesh, info) => {
    layers[layer].add(mesh);
    if (info) {
      mesh.userData.info = info;
      pickables.push(mesh);
    }
    return mesh;
  };
  const box = (x0, y0, z0, x1, y1, z1) => {
    const g = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return g;
  };
  const cyl = (x, y0, z, r, h, seg = 28) => {
    const g = new THREE.CylinderGeometry(r, r, h, seg);
    g.translate(x, y0 + h / 2, z);
    return g;
  };

  // ---------------- pipes
  const arrowGeos = {};
  for (const run of design.runs) {
    // Thin supply pipes are drawn a little thicker than life so they can be seen and clicked.
    const r = Math.max(run.dia / 2000, 0.016);
    const mat = run.hot ? hotMat : pipeMat[run.layer];
    const mesh = new THREE.Mesh(tube(run.points, r), mat);
    add(run.layer, mesh, { type: 'pipe', ...run });
    (arrowGeos[run.layer] ??= []).push(...(() => {
      const out = [];
      arrowsAlong(run.points, r, out);
      return out;
    })());
  }
  for (const [layer, geos] of Object.entries(arrowGeos)) {
    if (geos.length) layers[layer].add(new THREE.Mesh(mergeGeometries(geos, false), darkMat[layer]));
  }

  // ---------------- chambers and traps
  for (const c of design.chambers) {
    const half = c.size / 2 + 0.115; // clear size plus brick walls
    const bottom = c.invert - 0.1;
    const g = new THREE.Group();
    g.add(new THREE.Mesh(box(c.x - half, bottom, c.z - half, c.x + half, design.ground - 0.03, c.z + half), shell));
    g.add(new THREE.Mesh(box(c.x - half, bottom - 0.08, c.z - half, c.x + half, bottom, c.z + half), concrete)); // base
    const lid = new THREE.Mesh(box(c.x - half, design.ground - 0.03, c.z - half, c.x + half, design.ground + 0.02, c.z + half), c.kind === 'yard' || c.kind === 'gully' ? darkMat[c.layer] : cover);
    g.add(lid);
    // a band in the system's colour so chambers read at a glance
    g.add(new THREE.Mesh(box(c.x - half * 0.55, design.ground + 0.02, c.z - half * 0.55, c.x + half * 0.55, design.ground + 0.03, c.z + half * 0.55), pipeMat[c.layer]));
    if (c.kind === 'grease') {
      g.add(new THREE.Mesh(box(c.x - half + 0.1, bottom, c.z - 0.02, c.x + half - 0.1, c.invert + 0.25, c.z + 0.02), concrete)); // baffle
    }
    layers[c.layer].add(g);
    const info = { type: 'chamber', ...c };
    g.traverse((o) => {
      if (o.isMesh) {
        o.userData.info = info;
        pickables.push(o);
      }
    });
  }

  // ---------------- tanks, pits, pump
  for (const s of design.structures) {
    const info = { type: 'structure', ...s };
    const g = new THREE.Group();
    const top = design.ground;

    if (s.kind === 'septic') {
      const ix0 = s.x0 + s.wall;
      const ix1 = s.x1 - s.wall;
      const iz0 = s.z0 + s.wall;
      const iz1 = s.z1 - s.wall;
      g.add(new THREE.Mesh(box(s.x0, s.floor - 0.15, s.z0, s.x1, top - 0.12, s.z1), shell)); // walls
      g.add(new THREE.Mesh(box(s.x0, s.floor - 0.15, s.z0, s.x1, s.floor, s.z1), concrete)); // floor slab
      g.add(new THREE.Mesh(box(ix0, s.floor, iz0, ix1, s.floor + 0.25, iz1), sludgeMat)); // settled sludge
      g.add(new THREE.Mesh(box(ix0, s.floor + 0.25, iz0, ix1, s.liquid, iz1), sewageMat)); // liquid
      // baffle wall two-thirds of the way along, with a submerged opening
      const bz = iz1 - (iz1 - iz0) * (2 / 3);
      g.add(new THREE.Mesh(box(ix0, s.floor, bz - 0.06, ix1, s.liquid - 0.6, bz + 0.06), concrete));
      g.add(new THREE.Mesh(box(ix0, s.liquid - 0.35, bz - 0.06, ix1, s.liquid + 0.2, bz + 0.06), concrete));
      // inlet and outlet dip tees
      g.add(new THREE.Mesh(tube([[4.7, s.inletInv + 0.25, iz1 - 0.1], [4.7, s.liquid - 0.35, iz1 - 0.1]], 0.055), pipeMat.sewage));
      g.add(new THREE.Mesh(tube([[ix0 + 0.1, s.liquid + 0.2, s.outletZ], [ix0 + 0.1, s.liquid - 0.35, s.outletZ]], 0.055), pipeMat.sewage));
      // top slab and the two access covers
      g.add(new THREE.Mesh(box(s.x0, top - 0.12, s.z0, s.x1, top, s.z1), shell));
      for (const z of [iz1 - 0.45, iz0 + 0.4]) {
        g.add(new THREE.Mesh(box(4.4, top, z - 0.3, 5.0, top + 0.05, z + 0.3), cover));
        g.add(new THREE.Mesh(box(4.52, top + 0.05, z - 0.18, 4.88, top + 0.06, z + 0.18), pipeMat.sewage));
      }
    } else if (s.kind === 'soakpit') {
      g.add(new THREE.Mesh(cyl(s.x, s.bottom, s.z, s.r + 0.115, top - 0.12 - s.bottom), shell));
      g.add(new THREE.Mesh(cyl(s.x, s.bottom, s.z, s.r, 1.9), gravelMat)); // broken-brick fill
      for (let y = s.bottom + 0.3; y < -1.0; y += 0.35) {
        g.add(new THREE.Mesh(new THREE.TorusGeometry(s.r + 0.115, 0.018, 6, 40).rotateX(Math.PI / 2).translate(s.x, y, s.z), concrete)); // honeycomb courses
      }
      g.add(new THREE.Mesh(cyl(s.x, top - 0.12, s.z, s.r + 0.115, 0.12), shell));
      g.add(new THREE.Mesh(cyl(s.x, top, s.z, 0.3, 0.05), cover));
    } else if (s.kind === 'recharge') {
      const h = top - 0.12 - s.bottom;
      g.add(new THREE.Mesh(cyl(s.x, s.bottom, s.z, s.r + 0.115, h), shell));
      g.add(new THREE.Mesh(cyl(s.x, s.bottom, s.z, s.r, 0.9), boulderMat));
      g.add(new THREE.Mesh(cyl(s.x, s.bottom + 0.9, s.z, s.r, 0.6), gravelMat));
      g.add(new THREE.Mesh(cyl(s.x, s.bottom + 1.5, s.z, s.r, 0.4), sandMat));
      g.add(new THREE.Mesh(tube([[s.x, s.bottom + 0.2, s.z], [s.x, s.bottom - 2.2, s.z]], 0.075), pipeMat.rain)); // recharge bore
      g.add(new THREE.Mesh(cyl(s.x, top - 0.12, s.z, s.r + 0.115, 0.12), shell));
      g.add(new THREE.Mesh(cyl(s.x, top, s.z, 0.3, 0.05), darkMat.rain));
    } else if (s.kind === 'sump') {
      g.add(new THREE.Mesh(box(s.x0, s.floor - 0.15, s.z0, s.x1, top - 0.12, s.z1), shell));
      g.add(new THREE.Mesh(box(s.x0, s.floor - 0.15, s.z0, s.x1, s.floor, s.z1), concrete));
      g.add(new THREE.Mesh(box(s.x0 + s.wall, s.floor, s.z0 + s.wall, s.x1 - s.wall, s.water, s.z1 - s.wall), waterMat));
      g.add(new THREE.Mesh(box(s.x0, top - 0.12, s.z0, s.x1, top, s.z1), shell));
      const cx = (s.x0 + s.x1) / 2;
      const cz = (s.z0 + s.z1) / 2;
      g.add(new THREE.Mesh(box(cx - 0.3, top, cz - 0.3, cx + 0.3, top + 0.15, cz + 0.3), cover)); // raised access cover
      g.add(new THREE.Mesh(box(cx - 0.2, top + 0.15, cz - 0.2, cx + 0.2, top + 0.16, cz + 0.2), pipeMat.fresh));
    } else if (s.kind === 'borewell') {
      g.add(new THREE.Mesh(cyl(s.x, -6.0, s.z, 0.09, 6.35, 20), shell)); // casing, shown for the first few metres
      g.add(new THREE.Mesh(cyl(s.x, top, s.z, 0.22, 0.12, 20), concrete)); // collar at yard level
      g.add(new THREE.Mesh(cyl(s.x, 0.35, s.z, 0.11, 0.05, 20), darkMat.fresh)); // sealed cap
      g.add(new THREE.Mesh(cyl(s.x, -5.9, s.z, 0.06, 0.7, 16), darkMat.fresh)); // pump in the bore
    } else if (s.kind === 'pump') {
      g.add(new THREE.Mesh(box(s.x - 0.3, top, s.z - 0.2, s.x + 0.3, 0.12, s.z + 0.2), concrete)); // plinth
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.34, 20).rotateZ(Math.PI / 2).translate(s.x - 0.05, 0.25, s.z), darkMat.fresh));
      g.add(new THREE.Mesh(box(s.x + 0.12, 0.14, s.z - 0.1, s.x + 0.24, 0.36, s.z + 0.1), pipeMat.fresh));
    } else if (s.kind === 'oht') {
      g.add(new THREE.Mesh(box(s.x - 0.5, design.roof, s.z - 0.5, s.x + 0.5, s.base, s.z + 0.5), shell)); // stand
      g.add(new THREE.Mesh(cyl(s.x, s.base, s.z, s.r, s.top - s.base), shell));
      g.add(new THREE.Mesh(cyl(s.x, s.base + 0.02, s.z, s.r - 0.03, (s.top - s.base) * 0.75), waterMat));
      g.add(new THREE.Mesh(cyl(s.x, s.top, s.z, 0.2, 0.05), darkMat.fresh));
    }
    layers[s.layer].add(g);
    g.traverse((o) => {
      if (o.isMesh) {
        o.userData.info = info;
        pickables.push(o);
      }
    });
  }

  // ---------------- roof edge, and which way rain runs on the roof and the yard
  {
    const o = roofOutline;
    const pts = [[o.x0, o.z0], [o.x1, o.z0], [o.x1, o.z1], [o.x0, o.z1], [o.x0, o.z0]].map(([x, z]) => new THREE.Vector3(x, o.y, z));
    layers.rain.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: LAYERS.rain.color })));
    const geos = [];
    const light = new THREE.MeshLambertMaterial({ color: 0x7fd197 });
    for (const f of surfaceFlows) {
      const a = v3(f.from);
      const b = v3(f.to);
      const d = b.clone().sub(a);
      const len = d.length();
      const q = new THREE.Quaternion().setFromUnitVectors(UP, d.clone().normalize());
      const shaft = new THREE.CylinderGeometry(0.02, 0.02, len - 0.25, 8);
      shaft.applyQuaternion(q);
      const m = a.clone().addScaledVector(d, (len - 0.25) / 2 / len);
      shaft.translate(m.x, m.y, m.z);
      const head = new THREE.ConeGeometry(0.075, 0.25, 12);
      head.applyQuaternion(q);
      const hp = a.clone().addScaledVector(d, (len - 0.125) / len);
      head.translate(hp.x, hp.y, hp.z);
      geos.push(shaft, head);
    }
    layers.rain.add(new THREE.Mesh(mergeGeometries(geos, false), light));
  }

  // ---------------- name tags
  const labelGroup = new THREE.Group();
  root.add(labelGroup);
  for (const l of design.labels) {
    const s = labelSprite(l.text, l.small, compact ? 0.72 : 1);
    s.position.set(l.at[0], l.at[1], l.at[2]);
    s.userData.layer = l.layer;
    labelGroup.add(s);
    labelSprites.push(s);
  }

  // ---------------- highlight for the pipe or chamber that was clicked
  const highlight = new THREE.MeshBasicMaterial({ color: 0xffe14d });
  let selected = [];
  function select(info) {
    for (const m of selected) m.material = m.userData.plain;
    selected = [];
    if (!info || info.type !== 'pipe') return; // tanks and chambers stay see-through; their details show in the card
    for (const m of pickables) {
      if (m.userData.info.id !== info.id || m.userData.info.type !== info.type) continue;
      m.userData.plain = m.material;
      m.material = highlight;
      selected.push(m);
    }
  }

  function setLayers(on) {
    for (const id of Object.keys(layers)) layers[id].visible = !!on[id];
    for (const s of labelSprites) s.visible = !!on[s.userData.layer];
  }

  return {
    root,
    layers,
    labelGroup,
    setLayers,
    select,
    /** Things that can be clicked right now (only those in systems that are switched on). */
    pickList: () => pickables.filter((m) => layers[m.userData.info.layer].visible),
  };
}
