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
const menuEl = document.getElementById('menu');
const buttonsEl = document.getElementById('buttons');
const enterEl = document.getElementById('enter');
const wholeEl = document.getElementById('whole');

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
const topView = { x0: -1.3, x1: 10.3, z0: -2.3, z1: 11.95 }; // house, outside stair, the tiled strip round it and a margin
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
let lookExposure = 1;

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
  lookExposure = look.exposure;
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

// The hint appears once you are inside, and clears itself.
function showHint() {
  hintEl.textContent = isTouch ? 'Move: joystick · Look: drag' : 'Move: W A S D, arrow keys or scroll · Look: drag';
  const clear = () => {
    hintEl.textContent = '';
  };
  window.setTimeout(clear, 7000);
  controls.onFirstInput = () => window.setTimeout(clear, 2500);
}

// On a phone the four view buttons fold into one Menu button.
menuEl.addEventListener('click', () => {
  const open = buttonsEl.classList.toggle('open');
  menuEl.setAttribute('aria-expanded', String(open));
  menuEl.textContent = open ? 'Close' : 'Menu';
  if (open) hintEl.textContent = ''; // the hint would sit behind the open menu
  menuEl.blur();
});
document.getElementById('button-list').addEventListener('click', () => {
  buttonsEl.classList.remove('open');
  menuEl.setAttribute('aria-expanded', 'false');
  menuEl.textContent = 'Menu';
});

// ---------------------------------------------------------------- opening view
// The page opens on the whole house, seen from outside and slowly turning.
// "Enter" walks the camera down to the main entrance and in through the door,
// and the normal walking view takes over from there.
const introCam = new THREE.PerspectiveCamera(50, 1, 0.1, 300);
const intro = { active: true, flying: false, start: performance.now(), t0: 0, from: null };
const HOUSE_MID = new THREE.Vector3(4.04, 1.0, 5.33);
const DOOR_OUT = new THREE.Vector3(plan.start.x, 1.7, -4.2); // on the path outside the main door
const DOOR_IN = new THREE.Vector3(plan.start.x, EYE, plan.start.z); // where the walk begins
const LOOK_DOOR = new THREE.Vector3(plan.start.x, 1.5, 3.0);
const LOOK_IN = new THREE.Vector3(plan.start.x, EYE, 6.0); // straight ahead, due south
const ease = (t) => t * t * (3 - 2 * t);
document.body.classList.add('intro');
controls.enabled = false;

function updateIntro(now) {
  if (!intro.flying) {
    // slow turn around the house, starting north-east of it so the entrance side shows first
    const back = Math.min(1.9, Math.max(1, 1.15 / introCam.aspect)); // stand further back on an upright phone
    const r = 19 * back;
    const a = THREE.MathUtils.degToRad(38) + ((now - intro.start) / 1000) * ((Math.PI * 2) / 70);
    introCam.position.set(HOUSE_MID.x + r * Math.sin(a), 11.5 * back, HOUSE_MID.z - r * Math.cos(a));
    introCam.lookAt(HOUSE_MID);
    return;
  }
  const t = (now - intro.t0) / 1000;
  const d1 = 2.4; // down to the door
  const d2 = 1.9; // in through it
  const look = new THREE.Vector3();
  if (t < d1) {
    const k = ease(t / d1);
    introCam.position.lerpVectors(intro.from, DOOR_OUT, k);
    look.lerpVectors(HOUSE_MID, LOOK_DOOR, k);
    introCam.fov = THREE.MathUtils.lerp(50, camera.fov, k);
  } else {
    const k = ease(Math.min(1, (t - d1) / d2));
    introCam.position.lerpVectors(DOOR_OUT, DOOR_IN, k);
    look.lerpVectors(LOOK_DOOR, LOOK_IN, k);
    introCam.fov = camera.fov;
  }
  introCam.updateProjectionMatrix();
  introCam.lookAt(look);
  if (t >= d1 + d2) finishIntro();
}

function finishIntro() {
  intro.active = false;
  intro.flying = false;
  document.body.classList.remove('intro', 'entering');
  pos.x = plan.start.x;
  pos.z = plan.start.z;
  controls.yaw = -THREE.MathUtils.degToRad(plan.start.heading);
  controls.pitch = 0;
  controls.enabled = true;
  controls.changed = true;
  showHint();
}

function enterHouse(instant = false) {
  if (!intro.active || intro.flying) return;
  if (instant) {
    finishIntro();
    return;
  }
  intro.flying = true;
  intro.t0 = performance.now();
  intro.from = introCam.position.clone();
  document.body.classList.add('entering');
}
enterEl.addEventListener('click', () => enterHouse());

/** Back out to the opening view of the whole house, from anywhere in the walk. */
function showWholeHouse() {
  if (intro.active || plumbing.active) return;
  if (state.top) setTop(false); // the outside view needs the roof on
  intro.active = true;
  intro.flying = false;
  intro.start = performance.now();
  introCam.fov = 50;
  introCam.updateProjectionMatrix();
  document.body.classList.remove('entering');
  document.body.classList.add('intro');
  controls.enabled = false;
  controls.keys.clear();
  hintEl.textContent = '';
  needsRender = true;
}
wholeEl.addEventListener('click', () => {
  showWholeHouse();
  wholeEl.blur();
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'Enter' && intro.active) enterHouse();
});
// The tour video and the wall photos are on a page of their own.
document.getElementById('tour').addEventListener('click', () => {
  window.location.href = 'tour/index.html';
});

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
  introCam.aspect = aspect;
  introCam.updateProjectionMatrix();

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
  if (intro.active) {
    renderer.render(scene, introCam);
    return;
  }
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

  if (intro.active) {
    updateIntro(now);
    needsRender = true;
  } else if (plumbing.active) {
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
  enter: enterHouse,
  whole: showWholeHouse,
  intro,
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
  /**
   * Draws one frame from any viewpoint. The wall photos and the tour video are made with this (tools/tour.mjs).
   * outdoor (0 to 1) sets the picture up for sunlight, as a camera would: lower exposure, less glow, and the
   * stand-in daylight at the windows switched off so it does not show on the outside walls.
   */
  shot({ x, y = EYE, z, heading = 0, pitch = 0, fov = 65, near = 0.05, outdoor = 0 }) {
    camera.position.set(x, y, z);
    camera.rotation.set(THREE.MathUtils.degToRad(pitch), -THREE.MathUtils.degToRad(heading), 0);
    camera.fov = fov;
    camera.near = near;
    camera.updateProjectionMatrix();
    renderer.toneMappingExposure = lookExposure * (1 - 0.42 * outdoor);
    post?.setGlow(1 - 0.75 * outdoor);
    lighting.setWindowLight(1 - outdoor);
    if (post && state.style === 'real') post.render();
    else renderer.render(scene, camera);
  },
  renderNow() {
    syncView();
    draw();
  },
};
