import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildPlumbing } from './build.js';
import { LAYERS, VIEWS } from './design.js';

// The Plumbing & Drainage view: a see-through house you can turn and zoom,
// with the pipe systems drawn over it. It adds to the scene only while it is
// open; the house itself is never changed.

const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
const fmt = (n) => (Math.round(n * 100) / 100).toFixed(2);

/**
 * scene, renderer, canvas: the viewer's own.
 * hooks.enter(view) / hooks.exit(): called when the view opens and closes, so the
 * viewer can ghost the house and restore it. hooks.redraw(): ask for a new frame.
 */
export function createPlumbingMode({ scene, renderer, canvas, isTouch, hooks }) {
  const panel = document.getElementById('plumbing');
  const infoEl = document.getElementById('p-info');
  const layersEl = document.getElementById('p-layers');
  const sectionEl = document.getElementById('p-section');
  const cutEl = document.getElementById('p-cut');
  const labelsEl = document.getElementById('p-labels');
  const hintEl = document.getElementById('p-hint');
  const segButtons = [...panel.querySelectorAll('[data-view]')];
  const bodyEl = document.getElementById('p-body');
  const collapseEl = document.getElementById('p-collapse');
  const narrow = () => window.innerWidth > 0 && window.innerWidth < 640;

  // The options fold away so a small screen is left free for the model.
  function setCollapsed(c) {
    bodyEl.hidden = c;
    collapseEl.textContent = c ? 'Options' : 'Hide';
    collapseEl.setAttribute('aria-expanded', String(!c));
  }
  collapseEl.addEventListener('click', () => setCollapsed(!bodyEl.hidden));

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 400);
  const orbit = new OrbitControls(camera, canvas);
  orbit.enabled = false;
  orbit.enableDamping = true;
  orbit.dampingFactor = 0.12;
  orbit.minDistance = 1.5;
  orbit.maxDistance = 70;
  orbit.maxPolarAngle = Math.PI * 0.68; // may dip below ground level to look up at the pipes
  orbit.addEventListener('change', () => hooks.redraw());

  let plumbing = null; // built the first time the view is opened
  let view = 'house';
  const on = { fresh: false, sewage: false, waste: false, rain: false, vent: false };
  const checks = {};

  // ---------- system switches (also the colour key)
  for (const [id, L] of Object.entries(LAYERS)) {
    const row = document.createElement('label');
    row.className = 'p-row';
    const box = document.createElement('input');
    box.type = 'checkbox';
    const swatch = document.createElement('span');
    swatch.className = 'p-swatch';
    swatch.style.background = hex(L.color);
    const name = document.createElement('span');
    name.className = 'p-name';
    name.textContent = L.name;
    const note = document.createElement('span');
    note.className = 'p-note';
    note.textContent = L.note;
    row.append(box, swatch, name, note);
    layersEl.append(row);
    checks[id] = box;
    box.addEventListener('change', () => {
      on[id] = box.checked;
      applyLayers();
    });
  }
  hintEl.textContent = isTouch ? 'Drag: rotate · Pinch: zoom · Tap a pipe for details' : 'Drag: rotate · Scroll: zoom · Right-drag: move · Click a pipe for details';

  function applyLayers() {
    if (!plumbing) return;
    plumbing.setLayers(on);
    plumbing.labelGroup.visible = labelsEl.checked;
    for (const id of Object.keys(on)) checks[id].checked = on[id];
    hooks.redraw();
  }

  // ---------- section: cut the model along an east-west line and look at the cut face
  const cutPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
  const sectionGroup = new THREE.Group();
  sectionGroup.visible = false;
  {
    const earth = new THREE.Mesh(
      new THREE.PlaneGeometry(26, 3.9),
      new THREE.MeshBasicMaterial({ color: 0x9a7b55, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false }),
    );
    earth.position.set(8, -0.03 - 1.95, 0);
    sectionGroup.add(earth);
    const line = (y, color, opacity) => {
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-5, y, 0), new THREE.Vector3(21, y, 0)]);
      sectionGroup.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity })));
    };
    line(-0.03, 0x4a3a26, 0.9); // ground
    for (let d = 0.5; d <= 3.5; d += 0.5) line(-d, 0x4a3a26, 0.22); // depth every half metre
    sectionGroup.userData.tags = [];
    const tag = (text, y) => {
      const c = document.createElement('canvas');
      const g = c.getContext('2d');
      g.font = '600 26px system-ui, sans-serif';
      c.width = Math.ceil(g.measureText(text).width) + 16;
      c.height = 36;
      g.font = '600 26px system-ui, sans-serif';
      g.fillStyle = '#3b2f20';
      g.textBaseline = 'middle';
      g.fillText(text, 8, 19);
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true, sizeAttenuation: false }));
      s.scale.set((0.02 * c.width) / c.height, 0.02, 1);
      s.center.set(0, 0.5);
      s.position.set(18.2, y, 0); // east of the plot, clear of the panel
      sectionGroup.add(s);
    };
    tag('Floor level', 0.0);
    for (let d = 0.5; d <= 3.0; d += 0.5) tag(`${d.toFixed(1)} m`, -d);
  }
  scene.add(sectionGroup);

  function applySection(moveCamera) {
    const cut = sectionEl.checked;
    const z = parseFloat(cutEl.value);
    cutEl.disabled = !cut;
    sectionGroup.visible = cut && view !== 'house';
    if (cut && view !== 'house') {
      cutPlane.constant = z; // keeps everything north of the line (z <= cut)
      renderer.clippingPlanes = [cutPlane];
      sectionGroup.position.z = z - 0.004;
      if (moveCamera) {
        orbit.target.set(7.0, -0.9, z);
        camera.position.set(7.0, 0.7, z + 17);
        orbit.update();
      }
    } else {
      renderer.clippingPlanes = [];
    }
    hooks.redraw();
  }
  sectionEl.addEventListener('change', () => {
    applySection(true);
    if (!sectionEl.checked) homeCamera();
  });
  cutEl.addEventListener('input', () => applySection(false));
  labelsEl.addEventListener('change', applyLayers);

  function homeCamera() {
    orbit.target.set(6.8, -0.4, 3.1);
    // Stand further back on an upright phone so the whole plot still fits across the screen.
    const back = Math.min(1.9, Math.max(1, 1.15 / camera.aspect));
    camera.position.set(6.8 + 11.9 * back, -0.4 + 15.4 * back, 3.1 + 17.5 * back);
    orbit.update();
    hooks.redraw();
  }

  // ---------- details for whatever is clicked
  function row(dl, k, v) {
    if (v === undefined || v === null || v === '') return;
    const dt = document.createElement('dt');
    dt.textContent = k;
    const dd = document.createElement('dd');
    dd.textContent = v;
    dl.append(dt, dd);
  }

  function showInfo(info) {
    plumbing.select(info);
    hooks.redraw();
    if (!info) {
      infoEl.hidden = true;
      return;
    }
    infoEl.replaceChildren();
    const head = document.createElement('div');
    head.className = 'p-info-head';
    const sw = document.createElement('span');
    sw.className = 'p-swatch';
    sw.style.background = hex(LAYERS[info.layer].color);
    const title = document.createElement('strong');
    title.textContent = info.name;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'p-close';
    close.setAttribute('aria-label', 'Close details');
    close.textContent = '×';
    close.addEventListener('click', () => showInfo(null));
    head.append(sw, title, close);
    const purpose = document.createElement('p');
    purpose.textContent = info.purpose;
    const dl = document.createElement('dl');
    row(dl, 'System', info.hot ? 'Fresh water (hot)' : LAYERS[info.layer].name);

    if (info.type === 'pipe') {
      row(dl, 'Diameter', `${info.dia} mm`);
      row(dl, 'Pipe', info.material);
      if (info.grade) row(dl, 'Fall', `1 in ${info.grade} (${fmt(100 / info.grade)} %)`);
      if (info.invStart !== undefined) row(dl, 'Depth below floor', `${fmt(-info.invStart)} m → ${fmt(-info.invEnd)} m (pipe invert)`);
      row(dl, 'Length', `${fmt(info.length)} m`);
      row(dl, 'Flow', `${info.from} → ${info.to}`);
    } else if (info.type === 'chamber') {
      const mm = Math.round(info.size * 1000);
      row(dl, 'Clear size', `${mm} × ${mm} mm`);
      row(dl, 'Depth below floor', `${fmt(-info.invert)} m (invert)`);
      row(dl, 'Position', `${fmt(info.x)} m east, ${fmt(info.z)} m south of the house’s north-west corner`);
      row(dl, 'Flows to', info.to);
      row(dl, 'Access', 'Lift-off cover at ground level');
    } else {
      for (const [k, v] of info.details ?? []) row(dl, k, v);
    }
    infoEl.append(head, purpose, dl);
    infoEl.hidden = false;
  }

  const ray = new THREE.Raycaster();
  let down = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (view === 'house') return;
    down = { x: e.clientX, y: e.clientY, id: e.pointerId };
  });
  canvas.addEventListener('pointerup', (e) => {
    if (view === 'house' || !down || down.id !== e.pointerId) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    down = null;
    if (moved > 6) return; // that was a drag, not a click
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    let hits = ray.intersectObjects(plumbing.pickList(), false);
    // ignore anything on the hidden side of a section cut
    if (renderer.clippingPlanes.length) hits = hits.filter((h) => cutPlane.distanceToPoint(h.point) >= 0);
    // a pipe wins over the see-through tank or chamber it runs through
    const hit = hits.find((h) => h.object.userData.info.type === 'pipe' && h.distance < (hits[0]?.distance ?? 0) + 0.6) ?? hits[0];
    showInfo(hit ? hit.object.userData.info : null);
  });

  // ---------- switching views
  function setView(next) {
    if (next === view) return;
    const wasHouse = view === 'house';
    view = next;
    for (const b of segButtons) b.setAttribute('aria-pressed', String(b.dataset.view === view));

    if (view === 'house') {
      orbit.enabled = false;
      if (plumbing) plumbing.root.visible = false;
      sectionGroup.visible = false;
      renderer.clippingPlanes = [];
      infoEl.hidden = true;
      plumbing?.select(null);
      panel.hidden = true;
      hooks.exit();
      return;
    }

    if (!plumbing) {
      plumbing = buildPlumbing({ compact: narrow() });
      scene.add(plumbing.root);
    }
    plumbing.root.visible = true;
    for (const id of Object.keys(on)) on[id] = VIEWS[view].includes(id);
    showInfo(null);
    applyLayers();
    panel.hidden = false;
    if (wasHouse) {
      setCollapsed(narrow());
      hooks.enter();
      orbit.enabled = true;
      sectionEl.checked = false;
      homeCamera();
    }
    applySection(false);
  }

  for (const b of segButtons) b.addEventListener('click', () => setView(b.dataset.view));

  return {
    camera,
    get view() {
      return view;
    },
    get active() {
      return view !== 'house';
    },
    setView,
    /** Called every frame while the view is open, so the turn eases to a stop. */
    update() {
      orbit.update();
    },
    resize(aspect) {
      camera.aspect = aspect;
      // On a wide screen, shift the picture right so the model is not hidden behind the panel.
      const w = Math.max(1, window.innerWidth);
      const h = Math.max(1, window.innerHeight);
      if (w > 760) camera.setViewOffset(w, h, -130, 0, w, h);
      else camera.clearViewOffset();
      camera.updateProjectionMatrix();
    },
    // for checking the build
    debug: { orbit, showInfo, get plumbing() { return plumbing; }, on, applyLayers, sectionEl, cutEl, applySection },
  };
}
