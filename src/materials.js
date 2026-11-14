import * as THREE from 'three';

// Small seeded random so the generated textures look the same on every load.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function canvasTexture(size, draw, aniso) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}

/** 2 x 2 large vitrified tiles (texture spans 1.6 m, each tile 0.8 m). */
function vitrifiedTexture(aniso) {
  return canvasTexture(
    512,
    (g, S) => {
      const r = rng(7);
      const half = S / 2;
      for (let ty = 0; ty < 2; ty++) {
        for (let tx = 0; tx < 2; tx++) {
          const ox = tx * half;
          const oy = ty * half;
          const tone = 214 + Math.floor(r() * 6);
          g.fillStyle = `rgb(${tone},${tone - 5},${tone - 16})`;
          g.fillRect(ox, oy, half, half);
          g.save();
          g.beginPath();
          g.rect(ox, oy, half, half);
          g.clip();
          // soft marble-like veins
          for (let i = 0; i < 9; i++) {
            g.strokeStyle = `rgba(150,140,125,${0.05 + r() * 0.08})`;
            g.lineWidth = 0.6 + r() * 2.2;
            g.beginPath();
            let x = ox + r() * half;
            let y = oy + r() * half;
            g.moveTo(x, y);
            for (let k = 0; k < 5; k++) {
              x += (r() - 0.3) * 90;
              y += (r() - 0.5) * 70;
              g.lineTo(x, y);
            }
            g.stroke();
          }
          // faint clouding
          for (let i = 0; i < 14; i++) {
            const cx = ox + r() * half;
            const cy = oy + r() * half;
            const rad = 20 + r() * 50;
            const grd = g.createRadialGradient(cx, cy, 0, cx, cy, rad);
            grd.addColorStop(0, `rgba(255,255,255,${0.05 + r() * 0.06})`);
            grd.addColorStop(1, 'rgba(255,255,255,0)');
            g.fillStyle = grd;
            g.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
          }
          g.restore();
        }
      }
      // grout lines
      g.fillStyle = 'rgb(158,150,136)';
      for (const p of [0, half]) {
        g.fillRect(p - 1.5, 0, 3, S);
        g.fillRect(0, p - 1.5, S, 3);
      }
      g.fillRect(S - 1.5, 0, 1.5, S);
      g.fillRect(0, S - 1.5, S, 1.5);
    },
    aniso,
  );
}

/** 2 x 2 matte anti-skid bathroom floor tiles (texture spans 0.6 m). */
function bathFloorTexture(aniso) {
  return canvasTexture(
    256,
    (g, S) => {
      const r = rng(21);
      const half = S / 2;
      for (let ty = 0; ty < 2; ty++) {
        for (let tx = 0; tx < 2; tx++) {
          const tone = 132 + Math.floor(r() * 10);
          g.fillStyle = `rgb(${tone},${tone + 4},${tone + 8})`;
          g.fillRect(tx * half, ty * half, half, half);
        }
      }
      for (let i = 0; i < 2600; i++) {
        const v = r() < 0.5 ? 255 : 0;
        g.fillStyle = `rgba(${v},${v},${v},${0.03 + r() * 0.05})`;
        g.fillRect(r() * S, r() * S, 2, 2);
      }
      g.fillStyle = 'rgb(96,100,104)';
      for (const p of [0, half]) {
        g.fillRect(p - 1.5, 0, 3, S);
        g.fillRect(0, p - 1.5, S, 3);
      }
    },
    aniso,
  );
}

/** Bathroom wall tile: one 0.3 m wide x 0.6 m tall tile per repeat. */
function bathWallTexture(aniso) {
  return canvasTexture(
    128,
    (g, S) => {
      g.fillStyle = 'rgb(214,211,203)';
      g.fillRect(0, 0, S, S);
      g.fillStyle = 'rgb(168,164,156)';
      g.fillRect(0, 0, S, 2);
      g.fillRect(0, 0, 3, S);
    },
    aniso,
  );
}

/** Neutral wood grain, tinted by each material's colour. */
function woodTexture(aniso) {
  return canvasTexture(
    256,
    (g, S) => {
      const r = rng(99);
      g.fillStyle = 'rgb(225,225,225)';
      g.fillRect(0, 0, S, S);
      for (let i = 0; i < 180; i++) {
        const x = r() * S;
        const w = 0.5 + r() * 2.5;
        const v = Math.floor(150 + r() * 80);
        g.strokeStyle = `rgba(${v},${v},${v},${0.15 + r() * 0.3})`;
        g.lineWidth = w;
        g.beginPath();
        g.moveTo(x, 0);
        g.bezierCurveTo(x + (r() - 0.5) * 14, S * 0.33, x + (r() - 0.5) * 14, S * 0.66, x + (r() - 0.5) * 8, S);
        g.stroke();
      }
    },
    aniso,
  );
}

function grassTexture(aniso) {
  return canvasTexture(
    128,
    (g, S) => {
      const r = rng(5);
      g.fillStyle = 'rgb(128,160,104)';
      g.fillRect(0, 0, S, S);
      for (let i = 0; i < 2500; i++) {
        const v = r();
        g.fillStyle = v < 0.5 ? 'rgba(90,130,70,0.35)' : 'rgba(165,190,130,0.3)';
        g.fillRect(r() * S, r() * S, 2, 2);
      }
    },
    aniso,
  );
}

export function createMaterials(renderer) {
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const wood = woodTexture(aniso);
  const bathFloor = bathFloorTexture(aniso);
  const bathWall = bathWallTexture(aniso);

  const M = {
    // building
    wall: std({ color: 0xece5d8, roughness: 0.95 }),
    skirting: std({ color: 0x8a7f70, roughness: 0.4 }),
    ceiling: std({ color: 0xfbfaf7, roughness: 0.95 }),
    cap: new THREE.MeshBasicMaterial({ color: 0x26282b }),
    floor: std({ map: vitrifiedTexture(aniso), roughness: 0.22, metalness: 0.0, envMapIntensity: 0.55 }),
    bathFloor: std({ map: bathFloor, color: 0xf2ece0, roughness: 0.92 }),
    bathWall: std({ map: bathWall, roughness: 0.4, envMapIntensity: 0.4 }),
    // the wet (shower) end of each bathroom: darker slate floor, blue-grey wall tiles
    bathFloorWet: std({ map: bathFloor, color: 0x5f7480, roughness: 0.95 }),
    bathWallWet: std({ map: bathWall, color: 0x7fa3b3, roughness: 0.35, envMapIntensity: 0.45 }),
    kerb: std({ color: 0x34383b, roughness: 0.35 }),
    // outdoor tiles on the ground around the house, under the roof overhang
    apron: std({ map: bathFloor, color: 0xd9c3a3, roughness: 0.9 }),
    splash: std({ color: 0xe6e2d8, roughness: 0.3 }),
    door: std({ map: wood, color: 0x9a653a, roughness: 0.55 }),
    doorFrame: std({ map: wood, color: 0x7a4c28, roughness: 0.6 }),
    winFrame: std({ color: 0x3b3e43, roughness: 0.5, metalness: 0.4 }),
    sill: std({ color: 0xd9d4c8, roughness: 0.35 }),
    glass: std({
      color: 0xcfe6f2,
      roughness: 0.05,
      metalness: 0.0,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
    }),
    glassFrost: std({ color: 0xf2f7f8, roughness: 0.7, transparent: true, opacity: 0.62, depthWrite: false }),
    // Darker and thinner than window glass: bathroom lights are close, and a pale
    // pane would wash out to a white panel under them.
    showerGlass: std({
      color: 0x7f9aa3,
      roughness: 0.05,
      transparent: true,
      opacity: 0.13,
      depthWrite: false,
      envMapIntensity: 0.5,
    }),
    lightOn: std({ color: 0xffffff, emissive: 0xffe2b0, emissiveIntensity: 1.6, roughness: 0.6 }),
    lampShade: std({ color: 0xfff1d6, emissive: 0xffd9a0, emissiveIntensity: 0.9, roughness: 0.8 }),
    fan: std({ color: 0xf0ede6, roughness: 0.5 }),

    // outside
    ground: std({ color: 0x55585c, roughness: 1 }),
    lawn: std({ map: grassTexture(aniso), roughness: 1 }),
    compound: std({ color: 0xe9e4d8, roughness: 1 }),
    gate: std({ color: 0x33363a, roughness: 0.5, metalness: 0.5 }),
    concrete: std({ color: 0xbdb8ae, roughness: 0.95 }),

    // furniture
    walnut: std({ map: wood, color: 0x6f4a2e, roughness: 0.6 }),
    oak: std({ map: wood, color: 0xcaa574, roughness: 0.6 }),
    teak: std({ map: wood, color: 0x9a653a, roughness: 0.55 }),
    laminate: std({ color: 0xeeebe4, roughness: 0.5 }),
    laminateGrey: std({ color: 0x8d9296, roughness: 0.5 }),
    dark: std({ color: 0x232527, roughness: 0.6 }),
    steel: std({ color: 0xc9ccce, roughness: 0.3, metalness: 0.9 }),
    fridge: std({ color: 0xaeb3b7, roughness: 0.35, metalness: 0.7 }),
    granite: std({ color: 0x1d1f21, roughness: 0.25, envMapIntensity: 0.8 }),
    blackGlass: std({ color: 0x0c0d0f, roughness: 0.1, envMapIntensity: 0.9 }),
    ceramic: std({ color: 0xfbfbf9, roughness: 0.15 }),
    mirror: std({ color: 0xf2f6f8, roughness: 0.03, metalness: 1.0, envMapIntensity: 3.2 }),
    brass: std({ color: 0xc9a24a, roughness: 0.35, metalness: 0.85 }),
    marble: std({ color: 0xf3f1ec, roughness: 0.25 }),
    flame: std({ color: 0xffc46b, emissive: 0xff9a2e, emissiveIntensity: 2.5 }),

    sofa: std({ color: 0x7c8a8d, roughness: 1 }),
    sofaLight: std({ color: 0x93a0a2, roughness: 1 }),
    mustard: std({ color: 0xd3a038, roughness: 1 }),
    rugHall: std({ color: 0xb9ab95, roughness: 1 }),
    rugKids: std({ color: 0x5f9ea0, roughness: 1 }),
    rugMaster: std({ color: 0x9c8f86, roughness: 1 }),
    sheet: std({ color: 0xf5f3ee, roughness: 1 }),
    blanketMaster: std({ color: 0x3f527c, roughness: 1 }),
    blanketKids: std({ color: 0xe0795a, roughness: 1 }),
    chairSeat: std({ color: 0x54606b, roughness: 1 }),
    plant: std({ color: 0x4d7b3c, roughness: 1 }),
    pot: std({ color: 0xb4663c, roughness: 0.9 }),
    bookA: std({ color: 0xb5483c, roughness: 0.9 }),
    bookB: std({ color: 0x3d6a8f, roughness: 0.9 }),
    bookC: std({ color: 0xd8b24a, roughness: 0.9 }),
    saffron: std({ color: 0xe58a2b, roughness: 1 }),
  };

  // Rugs and ceiling fittings are too thin or too high to need shadows.
  for (const k of ['rugHall', 'rugKids', 'rugMaster', 'lightOn', 'cap', 'fan']) M[k].userData.noShadow = true;
  return M;
}
