import * as THREE from 'three';

// One set of lights, re-tuned for each of the four looks:
// model or real style, by day or by night.

// Where each room's light sits.
//   ceil: [x, z] of a downlight in the ceiling (night, and by day in rooms with little daylight)
//   win : a point just outside the room's main window, and where it aims: the
//         Real style's daylight coming in through that window
const ROOMS = {
  hall: { ceil: [6.08, 2.6], win: [8.9, 1.9, 3.7], aim: [5.2, 0.6, 3.4], shadow: true },
  cbed: { ceil: [2.21, 1.96], win: [2.05, 1.9, -0.7], aim: [2.2, 0.6, 2.4], shadow: true },
  mbed: { ceil: [2.21, 8.61], win: [2.2, 1.9, 11.4], aim: [2.2, 0.6, 8.2], shadow: true },
  kitchen: { ceil: [6.0, 8.6], win: [8.9, 1.9, 8.6], aim: [5.4, 0.6, 8.6], shadow: true },
  corridor: { ceil: [4.25, 5.9], shadow: true }, // lobby and passage share one light
  toilet1: { ceil: [1.3, 4.42] },
  toilet2: { ceil: [1.3, 5.9] },
  pooja: { ceil: [6.93, 5.9] },
};
const CEILING_Y = 2.93;

const WARM = 0xffcf9a;
const DAYLIGHT = 0xe6efff;

const LOOKS = {
  'model-day': {
    background: 0xcfe4f5,
    hemi: [0xf3f6fa, 0xc4b59c, 1.3],
    fill: 0.75,
    sun: { dir: [0.66, 0.58, 0.47], color: 0xfff0d6, intensity: 6.5 },
    env: 0.35,
    exposure: 1.0,
    rooms: { corridor: [16, 0xffd3a1], toilet1: [6, 0xffd3a1], toilet2: [6, 0xffd3a1] },
  },
  'model-night': {
    background: 0x0c1226,
    hemi: [0x93a6cc, 0x8a745c, 0.42], // the lower colour stands in for warm light bouncing off the floor
    fill: 0,
    sun: { dir: [-0.45, 0.75, 0.48], color: 0xa9bcff, intensity: 0.7 },
    env: 0.1,
    exposure: 1.0,
    rooms: { hall: [30, WARM], cbed: [22, WARM], mbed: [22, WARM], kitchen: [26, WARM], corridor: [12, WARM], toilet1: [5, WARM], toilet2: [5, WARM], pooja: [5, WARM] },
  },
  'real-day': {
    hemi: [0xdfe9f6, 0xb7a68b, 0.7],
    fill: 0.15,
    sun: { dir: [0.66, 0.58, 0.47], color: 0xffedcc, intensity: 8 },
    env: 0.5,
    exposure: 1.0,
    daylight: true, // room lights sit outside the windows
    rooms: {
      hall: [7, DAYLIGHT],
      cbed: [6.5, DAYLIGHT],
      mbed: [6.5, DAYLIGHT],
      kitchen: [6.5, DAYLIGHT],
      corridor: [9, 0xffd9ae],
      toilet1: [5, 0xffe2c0],
      toilet2: [5, 0xffe2c0],
      pooja: [2.5, 0xffd9ae],
    },
  },
  'real-night': {
    hemi: [0x6f83b3, 0x6b5846, 0.16],
    fill: 0,
    sun: { dir: [-0.45, 0.75, 0.48], color: 0x9db2ff, intensity: 0.45 },
    env: 0.5,
    exposure: 1.1,
    rooms: { hall: [26, WARM], cbed: [17, WARM], mbed: [15, WARM], kitchen: [22, 0xffd9b0], corridor: [10, WARM], toilet1: [4.5, 0xffe0bd], toilet2: [4.5, 0xffe0bd], pooja: [4, 0xffc488] },
  },
};

export function createLighting(scene, plan, { isTouch }) {
  const fp = plan.footprint;
  const centre = new THREE.Vector3((fp.x0 + fp.x1) / 2, 0, (fp.z0 + fp.z1) / 2);

  const hemi = new THREE.HemisphereLight();
  // A weak second light from the north-west so walls facing different ways read differently.
  const fill = new THREE.DirectionalLight(0xe6eefc, 0);
  fill.position.set(-0.55, 0.6, -0.6);

  // The sun by day, the moon by night. Its shadows are drawn once per look.
  const sun = new THREE.DirectionalLight();
  sun.castShadow = true;
  const size = isTouch ? 1024 : 2048;
  sun.shadow.mapSize.set(size, size);
  Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 5, far: 60 });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 3;
  sun.target.position.copy(centre);
  scene.add(hemi, fill, sun, sun.target);

  const rooms = {};
  for (const [id, def] of Object.entries(ROOMS)) {
    // Downlights shine down and out, not up at the ceiling beside them.
    const p = new THREE.SpotLight(WARM, 0, 9, 1.3, 0.6, 2);
    p.shadow.mapSize.set(1024, 1024);
    p.shadow.camera.near = 0.1;
    p.shadow.camera.far = 14;
    p.shadow.bias = -0.0015;
    p.shadow.normalBias = 0.025;
    p.shadow.radius = 3;
    p.visible = false;
    scene.add(p, p.target);
    rooms[id] = { light: p, def };
  }

  /**
   * style: 'model' or 'real'. night: true or false.
   * roomShadows: let the room lights cast shadows (Real style on a computer).
   * Returns the look's settings so the caller can set background and exposure.
   */
  function apply(style, night, roomShadows) {
    const look = LOOKS[`${style}-${night ? 'night' : 'day'}`];
    hemi.color.set(look.hemi[0]);
    hemi.groundColor.set(look.hemi[1]);
    hemi.intensity = look.hemi[2];
    fill.intensity = look.fill;
    fill.visible = look.fill > 0;
    sun.color.set(look.sun.color);
    sun.intensity = look.sun.intensity;
    sun.position.copy(centre).add(new THREE.Vector3(...look.sun.dir).normalize().multiplyScalar(30));

    for (const [id, { light, def }] of Object.entries(rooms)) {
      const cfg = look.rooms[id];
      light.visible = !!cfg;
      if (!cfg) continue;
      const outside = look.daylight && def.win;
      if (outside) {
        light.position.set(...def.win);
        light.target.position.set(...def.aim);
        light.angle = 1.05;
        light.penumbra = 0.5;
        light.decay = 1.0; // daylight through a window falls off gently
        light.distance = 12;
      } else {
        light.position.set(def.ceil[0], CEILING_Y, def.ceil[1]);
        light.target.position.set(def.ceil[0], 0, def.ceil[1]);
        light.angle = 1.3;
        light.penumbra = 0.7;
        light.decay = 2; // a lamp falls off as real light does
        light.distance = 9;
      }
      // Without shadows (phones) the window light is not held back by the walls, so it is turned down.
      light.intensity = outside && !roomShadows ? cfg[0] * 0.4 : cfg[0];
      light.color.set(cfg[1]);
      light.castShadow = !!(roomShadows && def.shadow);
    }
    return look;
  }

  /** Even, neutral light for the plumbing view, whatever the style or time of day. */
  function applyTechnical() {
    hemi.color.set(0xffffff);
    hemi.groundColor.set(0xb9c2cc);
    hemi.intensity = 2.3;
    fill.visible = false;
    sun.color.set(0xffffff);
    sun.intensity = 1.5;
    sun.position.copy(centre).add(new THREE.Vector3(0.45, 0.8, 0.4).multiplyScalar(30));
    for (const { light } of Object.values(rooms)) light.visible = false;
    return { background: 0xeef1f4, exposure: 1.0 };
  }

  return { apply, applyTechnical, sun, rooms };
}
