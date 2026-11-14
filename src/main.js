import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import plan from './data/plan.json';
import { buildWorld } from './world.js';
import { createLighting } from './lighting.js';
import { skyTexture } from './sky.js';
import { createPost } from './post.js';
import { Controls } from './controls.js';
import { MiniMap } from './minimap.js';
import { moveWithCollision } from './collide.js';
import { roomAt, insideFootprint } from './planUtil.js';
import { createPlumbingMode } from './plumbing/mode.js';

const EYE = 1.6; // eye height, metres
const RADIUS = 0.25; // walker's body radius
const SPEED = 2.2; // walking speed, m/s

const canvas = document.getElementById('view');
const roomEl = document.getElementById('room');
const hintEl = document.getElementById('hint');
const toggleEl = document.getElementById('toggle');
const styleEl = document.getElementById('style');
const timeEl = document.getElementById('time');
const plumbEl = document.getElementById('plumb');

const isTouch = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
if (isTouch) document.body.classList.add('touch');
window.addEventListener('touchstart', () => document.body.classList.add('touch'), { once: true, passive: true });

// ---------------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
let pixelRatio = Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 2);
renderer.setPixelRatio(pixelRatio);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // filtered, soft-edged shadows
renderer.shadowMap.autoUpdate = false; // nothing moves, so shadows are drawn once per look

const scene = new THREE.Scene();
const flatSky = new THREE.Color();

// Soft all-round light and gentle reflections. The model style uses a neutral
// studio; the Real style replaces it with a picture of the home's own rooms.
const pmrem = new THREE.PMREMGenerator(renderer);
const studioEnv = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
const cubeTarget = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType });
const cubeCam = new THREE.CubeCamera(0.1, 80, cubeTarget);
cubeCam.position.set(5.35, 1.45, 2.9); // middle of the Hall
let roomEnv = null;

// ---------------------------------------------------------------- cameras
const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 150);
camera.rotation.order = 'YXZ';

const topCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 80);
const topView = { x0: -0.9, x1: 9.0, z0: -2.3, z1: 11.2 }; // house, outside stair and a margin
topCam.position.set((topView.x0 + topView.x1) / 2, 40, (topView.z0 + topView.z1) / 2);
topCam.up.set(0, 0, -1); // north at the top of the screen, as on the plan
topCam.lookAt(topCam.position.x, 0, topCam.position.z);

// Marker for the walker in the top view.
const marker = new THREE.Group();
{
  const mat = new THREE.MeshBasicMaterial({ color: 0xd63031, depthTest: false });
  const ring = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false });
  const outer = new THREE.Mesh(new THREE.CircleGeometry(0.24, 24), ring);
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.19, 24), mat);
  const tri = new THREE.Shape();
  tri.moveTo(-0.16, 0.22);
  tri.lineTo(0.16, 0.22);
  tri.lineTo(0, 0.52);
  tri.closePath();
  const arrow = new THREE.Mesh(new THREE.ShapeGeometry(tri), mat);
  for (const m of [outer, dot, arrow]) {
    m.rotation.x = -Math.PI / 2; // lie flat; the arrow then points north (-z)
    m.renderOrder = 20;
    marker.add(m);
  }
  outer.renderOrder = 19;
  marker.position.y = 3.6;
  marker.visible = false;
  scene.add(marker);
}

// ---------------------------------------------------------------- the four looks
const lighting = createLighting(scene, plan, { isTouch });
const post = isTouch ? null : createPost(renderer, scene, camera); // finishing passes: computer only
const skies = {};
const worlds = {};

const state = { style: 'model', night: false, top: false };
let colliders = [];
let needsRender = true;

function ensureWorld(style) {
  if (!worlds[style]) {
    worlds[style] = buildWorld(plan, renderer, style);
    scene.add(worlds[style].group);
  }
  return worlds[style];
}

/** Applies the chosen style, time of day and view, then redraws shadows and reflections. */
function applyLook() {
  const world = ensureWorld(state.style);
  for (const [k, w] of Object.entries(worlds)) w.group.visible = k === state.style;
  world.setNight(state.night);
  world.setTop(state.top);
  colliders = world.colliders;

  const real = state.style === 'real';
  const look = lighting.apply(state.style, state.night, real && !isTouch);
  renderer.toneMappingExposure = look.exposure;
  if (real) {
    const key = state.night ? 'night' : 'day';
    skies[key] ??= skyTexture(state.night);
    scene.background = skies[key];
  } else {
    scene.background = flatSky.set(look.background);
  }
  post?.setNight(state.night);

  // Shadows and reflections are prepared once, always with the ceiling in place,
  // so the top view (ceiling hidden) keeps the same indoor light.
  const markerWas = marker.visible;
  marker.visible = false;
  world.withCeiling(() => {
    scene.environment = studioEnv;
    scene.environmentIntensity = real ? 0.15 : look.env;
    renderer.shadowMap.needsUpdate = true;
    renderer.render(scene, camera);
    if (real) {
      cubeCam.update(renderer, scene);
      roomEnv?.dispose();
      roomEnv = pmrem.fromCubemap(cubeTarget.texture);
      scene.environment = roomEnv.texture;
      scene.environmentIntensity = look.env;
    }
  });
  marker.visible = markerWas;

  toggleEl.textContent = state.top ? 'Walk view' : 'Top view';
  styleEl.textContent = real ? 'Model style' : 'Real style';
  timeEl.textContent = state.night ? 'Day' : 'Night';
  needsRender = true;
}

function setTop(on) {
  state.top = on;
  worlds[state.style].setTop(on);
  marker.visible = on;
  toggleEl.textContent = on ? 'Walk view' : 'Top view';
  needsRender = true;
}

function setLook(style, night) {
  state.style = style;
  state.night = night;
  applyLook();
}

toggleEl.addEventListener('click', () => {
  setTop(!state.top);
  toggleEl.blur();
});
timeEl.addEventListener('click', () => {
  setLook(state.style, !state.night);
  timeEl.blur();
});
styleEl.addEventListener('click', () => {
  const next = state.style === 'real' ? 'model' : 'real';
  styleEl.blur();
  if (worlds[next]) {
    setLook(next, state.night);
    return;
  }
  // First time: the Real version takes a moment to prepare.
  styleEl.disabled = true;
  styleEl.textContent = 'Loading…';
  window.setTimeout(() => {
    setLook(next, state.night);
    styleEl.disabled = false;
  }, 30);
});

// ---------------------------------------------------------------- walker
const pos = { x: plan.start.x, z: plan.start.z };
const controls = new Controls(canvas, document.getElementById('stick'), document.getElementById('knob'));

// ---------------------------------------------------------------- plumbing & drainage view
// A separate inspection view laid over the house. Opening it only swaps in
// see-through materials and neutral light; closing it restores the house view
// exactly as it was (same style, time of day and walk or top view).
const plumbing = createPlumbingMode({
  scene,
  renderer,
  canvas,
  isTouch,
  hooks: {
    enter() {
      controls.enabled = false;
      controls.keys.clear();
      document.body.classList.add('plumbing');
      plumbEl.textContent = 'House view';
      worlds[state.style].setInspect(true);
      const look = lighting.applyTechnical();
      renderer.toneMappingExposure = look.exposure;
      scene.background = flatSky.set(look.background);
      scene.environment = studioEnv;
      scene.environmentIntensity = 0.3;
      marker.visible = false;
      needsRender = true;
    },
    exit() {
      worlds[state.style].setInspect(false);
      document.body.classList.remove('plumbing');
      plumbEl.textContent = 'Plumbing & Drainage';
      controls.enabled = true;
      marker.visible = state.top;
      applyLook();
    },
    redraw() {
      needsRender = true;
    },
  },
});
plumbEl.addEventListener('click', () => {
  plumbing.setView(plumbing.active ? 'house' : 'drainage');
  plumbEl.blur();
});
controls.yaw = -THREE.MathUtils.degToRad(plan.start.heading); // heading is clockwise from north
controls.pitch = 0;

hintEl.textContent = isTouch ? 'Move: joystick · Look: drag' : 'Move: W A S D, arrow keys or scroll · Look: drag';
controls.onFirstInput = () => {
  window.setTimeout(() => {
    hintEl.textContent = '';
  }, 2500);
};

const minimap = new MiniMap(document.getElementById('map'), plan);
let lastRoom = '';

function resize() {
  const w = Math.max(1, window.innerWidth);
  const h = Math.max(1, window.innerHeight);
  renderer.setSize(w, h, false);
  post?.setSize(w, h, pixelRatio);
  const aspect = w / h;
  camera.aspect = aspect;
  // Keep a comfortable sideways view on an upright phone by widening the vertical angle.
  const wide = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(29)) / aspect));
  camera.fov = Math.max(63, Math.min(92, wide));
  camera.updateProjectionMatrix();
  plumbing.resize(aspect);

  const vw = topView.x1 - topView.x0;
  const vh = topView.z1 - topView.z0;
  const halfH = Math.max(vh / 2, vw / 2 / aspect);
  topCam.left = -halfH * aspect;
  topCam.right = halfH * aspect;
  topCam.top = halfH;
  topCam.bottom = -halfH;
  topCam.updateProjectionMatrix();

  minimap.resize();
  syncView(); // redraws the map, which a resize wipes
  needsRender = true;
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);

function syncView() {
  camera.position.set(pos.x, EYE, pos.z);
  camera.rotation.set(controls.pitch, controls.yaw, 0);
  marker.position.x = pos.x;
  marker.position.z = pos.z;
  marker.rotation.y = controls.yaw;

  let name;
  if (!insideFootprint(plan, pos.x, pos.z)) name = 'Outside';
  else name = roomAt(plan, pos.x, pos.z)?.name ?? lastRoom; // in a doorway: keep the last room
  if (name && name !== lastRoom) {
    lastRoom = name;
    roomEl.textContent = name;
  }
  minimap.draw(pos.x, pos.z, controls.yaw);
}

function draw() {
  if (plumbing.active) {
    renderer.render(scene, plumbing.camera);
    return;
  }
  // The finishing passes are for the walking view; the top view is drawn plainly.
  if (post && state.style === 'real' && !state.top) post.render();
  else renderer.render(scene, state.top ? topCam : camera);
}

// ---------------------------------------------------------------- loop
let last = performance.now();
let slowFrames = 0;
let movingFrames = 0;
let warmup = 8; // draw a few frames at the start while textures upload

/** Advances the walk by dt seconds. Returns true if the walker moved. */
function tick(dt) {
  const mv = controls.move();
  const scroll = controls.scrollStep(dt);
  const moving = mv.strafe !== 0 || mv.forward !== 0 || scroll !== 0;
  if (moving) {
    const sin = Math.sin(controls.yaw);
    const cos = Math.cos(controls.yaw);
    // forward is (-sin, -cos); right is (cos, -sin)
    const fwd = mv.forward * SPEED * dt + scroll;
    const side = mv.strafe * SPEED * dt;
    moveWithCollision(pos, -sin * fwd + cos * side, -cos * fwd - sin * side, colliders, RADIUS);
  }
  if (moving || controls.changed || warmup > 0) {
    controls.changed = false;
    if (warmup > 0) warmup--;
    syncView();
    needsRender = true;
  }
  return moving;
}

function frame(now) {
  const elapsed = (now - last) / 1000;
  const dt = Math.min(elapsed, 0.05);
  last = now;

  if (plumbing.active) {
    plumbing.update(); // eases the turn to a stop; asks for a redraw itself
  } else if (tick(dt)) {
    // If the device is struggling while walking, render fewer pixels.
    movingFrames++;
    if (elapsed > 1 / 40) slowFrames++;
    if (movingFrames >= 90) {
      if (slowFrames > 45 && pixelRatio > 1) {
        pixelRatio = Math.max(1, pixelRatio - 0.25);
        renderer.setPixelRatio(pixelRatio);
        renderer.setSize(window.innerWidth, window.innerHeight, false);
        post?.setSize(window.innerWidth, window.innerHeight, pixelRatio);
      }
      movingFrames = 0;
      slowFrames = 0;
    }
  }

  if (needsRender) {
    needsRender = false;
    draw();
  }
  requestAnimationFrame(frame);
}

canvas.addEventListener('webglcontextrestored', applyLook);

resize();
syncView();
applyLook();
requestAnimationFrame(frame);

// Small hook used for checking the build: jump to a spot, switch looks, read state.
window.__walk = {
  teleport(x, z, headingDeg = 0, pitchDeg = 0) {
    pos.x = x;
    pos.z = z;
    controls.yaw = -THREE.MathUtils.degToRad(headingDeg);
    controls.pitch = THREE.MathUtils.degToRad(pitchDeg);
    controls.changed = true;
  },
  top: setTop,
  look: setLook,
  state: () => ({ x: pos.x, z: pos.z, room: lastRoom, ...state, pixelRatio, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }),
  get colliders() {
    return colliders;
  },
  plan,
  controls,
  scene,
  lighting,
  plumbing,
  step: tick,
  renderNow() {
    syncView();
    draw();
  },
};
