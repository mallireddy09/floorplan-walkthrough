import * as THREE from 'three';
import { createMaterials } from './materials.js';

// Materials for the "Real" style: the same names as the model style, with
// richer textures, surface relief and a set of extra materials for the
// lived-in details. Everything is drawn in code; no image files are loaded.

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function tex(w, h, draw, aniso, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}

function speckle(g, w, h, r, n, alpha, size = 2) {
  for (let i = 0; i < n; i++) {
    const v = r() < 0.5 ? 0 : 255;
    g.fillStyle = `rgba(${v},${v},${v},${alpha * (0.4 + r() * 0.6)})`;
    g.fillRect(r() * w, r() * h, size, size);
  }
}

/** 4 x 4 vitrified tiles, each with its own veining. Covers 3.2 m. */
function floorTextures(aniso) {
  const S = 1024;
  const cell = S / 4;
  const colour = tex(
    S,
    S,
    (g) => {
      const r = rng(11);
      for (let ty = 0; ty < 4; ty++) {
        for (let tx = 0; tx < 4; tx++) {
          const ox = tx * cell;
          const oy = ty * cell;
          const t = 206 + Math.floor(r() * 12);
          g.fillStyle = `rgb(${t},${t - 6},${t - 18})`;
          g.fillRect(ox, oy, cell, cell);
          g.save();
          g.beginPath();
          g.rect(ox, oy, cell, cell);
          g.clip();
          for (let i = 0; i < 16; i++) {
            const cx = ox + r() * cell;
            const cy = oy + r() * cell;
            const rad = 30 + r() * 90;
            const grd = g.createRadialGradient(cx, cy, 0, cx, cy, rad);
            const light = r() < 0.6;
            grd.addColorStop(0, light ? `rgba(255,252,244,${0.1 + r() * 0.1})` : `rgba(150,135,112,${0.06 + r() * 0.06})`);
            grd.addColorStop(1, 'rgba(255,255,255,0)');
            g.fillStyle = grd;
            g.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
          }
          for (let i = 0; i < 7; i++) {
            g.strokeStyle = `rgba(128,112,92,${0.07 + r() * 0.12})`;
            g.lineWidth = 0.5 + r() * 1.8;
            g.beginPath();
            let x = ox + r() * cell;
            let y = oy - 10;
            g.moveTo(x, y);
            while (y < oy + cell + 10) {
              x += (r() - 0.5) * 60;
              y += 18 + r() * 40;
              g.lineTo(x, y);
            }
            g.stroke();
          }
          g.restore();
        }
      }
      speckle(g, S, S, r, 5000, 0.035, 1.5);
      g.fillStyle = 'rgb(142,134,120)';
      for (let i = 0; i <= 4; i++) {
        g.fillRect(i * cell - 1.5, 0, 3, S);
        g.fillRect(0, i * cell - 1.5, S, 3);
      }
    },
    aniso,
  );
  const bump = tex(
    S,
    S,
    (g) => {
      g.fillStyle = '#fff';
      g.fillRect(0, 0, S, S);
      g.fillStyle = '#555';
      for (let i = 0; i <= 4; i++) {
        g.fillRect(i * cell - 2, 0, 4, S);
        g.fillRect(0, i * cell - 2, S, 4);
      }
    },
    aniso,
    false,
  );
  return { colour, bump };
}

/** Wood with long grain, darker bands and a couple of knots. Tinted by the material colour. */
function woodTexture(aniso) {
  return tex(
    512,
    512,
    (g, S) => {
      const r = rng(77);
      g.fillStyle = 'rgb(214,214,214)';
      g.fillRect(0, 0, S, S);
      for (let i = 0; i < 14; i++) {
        const x = r() * S;
        const w = 20 + r() * 60;
        const grd = g.createLinearGradient(x, 0, x + w, 0);
        const a = 0.05 + r() * 0.1;
        grd.addColorStop(0, 'rgba(90,90,90,0)');
        grd.addColorStop(0.5, `rgba(90,90,90,${a})`);
        grd.addColorStop(1, 'rgba(90,90,90,0)');
        g.fillStyle = grd;
        g.fillRect(x, 0, w, S);
      }
      for (let i = 0; i < 420; i++) {
        const x = r() * S;
        const v = Math.floor(110 + r() * 120);
        g.strokeStyle = `rgba(${v},${v},${v},${0.12 + r() * 0.3})`;
        g.lineWidth = 0.4 + r() * 1.6;
        g.beginPath();
        g.moveTo(x, 0);
        const sway = (r() - 0.5) * 18;
        g.bezierCurveTo(x + sway, S * 0.33, x - sway, S * 0.66, x + (r() - 0.5) * 6, S);
        g.stroke();
      }
      for (let k = 0; k < 2; k++) {
        const cx = 80 + r() * (S - 160);
        const cy = 80 + r() * (S - 160);
        for (let i = 7; i > 0; i--) {
          g.strokeStyle = `rgba(70,70,70,${0.1 + (7 - i) * 0.03})`;
          g.lineWidth = 1.2;
          g.beginPath();
          g.ellipse(cx, cy, i * 2.4, i * 6, 0, 0, Math.PI * 2);
          g.stroke();
        }
      }
    },
    aniso,
  );
}

/** Woven cloth relief. */
function weaveTexture(aniso) {
  return tex(
    64,
    64,
    (g, S) => {
      g.fillStyle = '#808080';
      g.fillRect(0, 0, S, S);
      for (let y = 0; y < S; y += 4) {
        for (let x = 0; x < S; x += 4) {
          const over = ((x + y) / 4) % 2 === 0;
          g.fillStyle = over ? '#c8c8c8' : '#5a5a5a';
          if (over) g.fillRect(x, y + 1, 4, 2);
          else g.fillRect(x + 1, y, 2, 4);
        }
      }
    },
    aniso,
    false,
  );
}

/** Slightly uneven painted plaster. */
function plasterTexture(aniso) {
  return tex(
    256,
    256,
    (g, S) => {
      const r = rng(31);
      g.fillStyle = '#808080';
      g.fillRect(0, 0, S, S);
      for (let i = 0; i < 900; i++) {
        const x = r() * S;
        const y = r() * S;
        const rad = 2 + r() * 7;
        const v = r() < 0.5 ? 60 : 200;
        const grd = g.createRadialGradient(x, y, 0, x, y, rad);
        grd.addColorStop(0, `rgba(${v},${v},${v},0.16)`);
        grd.addColorStop(1, `rgba(${v},${v},${v},0)`);
        g.fillStyle = grd;
        g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
    },
    aniso,
    false,
  );
}

function graniteTexture(aniso) {
  return tex(
    256,
    256,
    (g, S) => {
      const r = rng(3);
      g.fillStyle = 'rgb(34,35,38)';
      g.fillRect(0, 0, S, S);
      for (let i = 0; i < 5000; i++) {
        const v = 40 + Math.floor(r() * 120);
        g.fillStyle = `rgba(${v},${v},${v + 6},${0.25 + r() * 0.5})`;
        g.fillRect(r() * S, r() * S, 1 + r() * 2, 1 + r() * 2);
      }
    },
    aniso,
  );
}

function grassTexture(aniso) {
  return tex(
    256,
    256,
    (g, S) => {
      const r = rng(5);
      g.fillStyle = 'rgb(104,138,82)';
      g.fillRect(0, 0, S, S);
      for (let i = 0; i < 9000; i++) {
        const v = r();
        g.strokeStyle = v < 0.45 ? 'rgba(66,104,52,0.5)' : v < 0.85 ? 'rgba(140,170,104,0.45)' : 'rgba(170,160,100,0.35)';
        const x = r() * S;
        const y = r() * S;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + (r() - 0.5) * 4, y - 2 - r() * 4);
        g.stroke();
      }
    },
    aniso,
  );
}

function leafTexture(aniso) {
  return tex(
    128,
    128,
    (g, S) => {
      const r = rng(8);
      g.fillStyle = 'rgb(70,112,54)';
      g.fillRect(0, 0, S, S);
      for (let i = 0; i < 700; i++) {
        const v = r();
        g.fillStyle = v < 0.5 ? 'rgba(40,78,36,0.55)' : 'rgba(130,168,84,0.5)';
        g.beginPath();
        g.ellipse(r() * S, r() * S, 2 + r() * 5, 1 + r() * 3, r() * 3, 0, Math.PI * 2);
        g.fill();
      }
    },
    aniso,
  );
}

/** Patterned rug: border, inner border and a repeating motif. Fits the rug exactly. */
function rugTexture(aniso, base, border, motif, seed) {
  const t = tex(
    512,
    512,
    (g, S) => {
      const r = rng(seed);
      g.fillStyle = border;
      g.fillRect(0, 0, S, S);
      g.fillStyle = base;
      g.fillRect(34, 34, S - 68, S - 68);
      g.strokeStyle = motif;
      g.lineWidth = 5;
      g.strokeRect(52, 52, S - 104, S - 104);
      g.lineWidth = 2;
      for (let y = 100; y < S - 80; y += 62) {
        for (let x = 100; x < S - 80; x += 62) {
          g.save();
          g.translate(x, y);
          g.rotate(Math.PI / 4);
          g.strokeRect(-13, -13, 26, 26);
          g.fillStyle = motif;
          g.fillRect(-4, -4, 8, 8);
          g.restore();
        }
      }
      speckle(g, S, S, r, 9000, 0.06, 2);
    },
    aniso,
  );
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Striped or checked cloth for bedding and towels. */
function clothTexture(aniso, a, b, check) {
  return tex(
    128,
    128,
    (g, S) => {
      g.fillStyle = a;
      g.fillRect(0, 0, S, S);
      g.fillStyle = b;
      for (let i = 0; i < S; i += 32) g.fillRect(i, 0, 10, S);
      if (check) {
        g.globalAlpha = 0.6;
        for (let i = 0; i < S; i += 32) g.fillRect(0, i, S, 10);
      }
    },
    aniso,
  );
}

/** Soft vertical shading for curtain cloth. */
function curtainTexture(aniso, colour) {
  return tex(
    128,
    64,
    (g, W, H) => {
      g.fillStyle = colour;
      g.fillRect(0, 0, W, H);
      for (let x = 0; x < W; x += 1) {
        const s = Math.sin((x / W) * Math.PI * 10) * 0.5 + 0.5;
        g.fillStyle = `rgba(0,0,0,${0.16 * s})`;
        g.fillRect(x, 0, 1, H);
      }
    },
    aniso,
  );
}

/**
 * One sheet holding all the pictures on the walls, 3 x 3.
 * Cells (col,row from the top-left): 0,0 landscape  1,0 abstract  2,0 bedroom art
 * 0,1 kids poster A  1,1 kids poster B  2,1 calendar  0,2 photo  1,2 photo  2,2 mandala
 */
function artSheet(aniso) {
  const t = tex(
    1536,
    1536,
    (g) => {
      const C = 512;
      const r = rng(2024);
      const cell = (cx, cy, fn) => {
        g.save();
        g.translate(cx * C, cy * C);
        g.beginPath();
        g.rect(0, 0, C, C);
        g.clip();
        fn();
        g.restore();
      };
      // landscape: hills at dusk
      cell(0, 0, () => {
        const sky = g.createLinearGradient(0, 0, 0, C);
        sky.addColorStop(0, '#f2c98a');
        sky.addColorStop(0.55, '#f7e3c0');
        sky.addColorStop(1, '#d9e2d0');
        g.fillStyle = sky;
        g.fillRect(0, 0, C, C);
        g.fillStyle = '#f4f0dc';
        g.beginPath();
        g.arc(360, 170, 46, 0, Math.PI * 2);
        g.fill();
        const cols = ['#a9b9a4', '#7f9a86', '#55796a', '#35594f'];
        cols.forEach((col, i) => {
          g.fillStyle = col;
          g.beginPath();
          g.moveTo(0, C);
          for (let x = 0; x <= C; x += 16) g.lineTo(x, 250 + i * 55 + Math.sin(x * 0.012 + i * 2.1) * 34 + Math.sin(x * 0.04 + i) * 9);
          g.lineTo(C, C);
          g.fill();
        });
      });
      // abstract: overlapping blocks
      cell(1, 0, () => {
        g.fillStyle = '#efe6d6';
        g.fillRect(0, 0, C, C);
        const cols = ['#c8643c', '#2f4b5c', '#d9a441', '#7d9a8c', '#1f2a30'];
        for (let i = 0; i < 9; i++) {
          g.fillStyle = cols[i % cols.length];
          g.globalAlpha = 0.85;
          if (i % 3 === 0) {
            g.beginPath();
            g.arc(80 + r() * 350, 80 + r() * 350, 40 + r() * 80, 0, Math.PI * 2);
            g.fill();
          } else g.fillRect(40 + r() * 300, 40 + r() * 300, 60 + r() * 170, 40 + r() * 170);
        }
        g.globalAlpha = 1;
      });
      // bedroom art: soft leaves
      cell(2, 0, () => {
        g.fillStyle = '#f1ece2';
        g.fillRect(0, 0, C, C);
        for (let i = 0; i < 9; i++) {
          g.save();
          g.translate(60 + i * 50, 300 + Math.sin(i) * 40);
          g.rotate(-0.6 + i * 0.14);
          g.fillStyle = i % 2 ? '#6f8f7b' : '#9db39f';
          g.beginPath();
          g.ellipse(0, -100, 26, 120, 0, 0, Math.PI * 2);
          g.fill();
          g.strokeStyle = '#46604f';
          g.lineWidth = 3;
          g.beginPath();
          g.moveTo(0, 20);
          g.lineTo(0, -220);
          g.stroke();
          g.restore();
        }
      });
      // kids poster A: rocket and stars
      cell(0, 1, () => {
        g.fillStyle = '#1e2f5c';
        g.fillRect(0, 0, C, C);
        g.fillStyle = '#ffe9a8';
        for (let i = 0; i < 60; i++) g.fillRect(r() * C, r() * C, 3 + r() * 4, 3 + r() * 4);
        g.fillStyle = '#f2f2f2';
        g.beginPath();
        g.ellipse(256, 250, 62, 150, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#e2533f';
        g.beginPath();
        g.moveTo(194, 330);
        g.lineTo(150, 420);
        g.lineTo(215, 380);
        g.moveTo(318, 330);
        g.lineTo(362, 420);
        g.lineTo(297, 380);
        g.fill();
        g.fillStyle = '#6fc3df';
        g.beginPath();
        g.arc(256, 220, 30, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#f5a93b';
        g.beginPath();
        g.moveTo(226, 395);
        g.lineTo(256, 480);
        g.lineTo(286, 395);
        g.fill();
      });
      // kids poster B: alphabet blocks
      cell(1, 1, () => {
        g.fillStyle = '#fbf3df';
        g.fillRect(0, 0, C, C);
        const cols = ['#e2533f', '#3c8dbc', '#f5a93b', '#59a96a', '#8e63b5'];
        const letters = 'ABCDEFGHIJKLMNOP';
        g.font = 'bold 74px sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        for (let i = 0; i < 16; i++) {
          const x = 40 + (i % 4) * 112;
          const y = 40 + Math.floor(i / 4) * 112;
          g.fillStyle = cols[i % cols.length];
          g.fillRect(x, y, 96, 96);
          g.fillStyle = '#fff';
          g.fillText(letters[i], x + 48, y + 52);
        }
      });
      // calendar
      cell(2, 1, () => {
        g.fillStyle = '#fdfdfb';
        g.fillRect(0, 0, C, C);
        g.fillStyle = '#c8452f';
        g.fillRect(0, 0, C, 120);
        g.fillStyle = '#fff';
        g.font = 'bold 60px sans-serif';
        g.textAlign = 'center';
        g.fillText('NOVEMBER', 256, 82);
        g.fillStyle = '#333';
        g.font = '34px sans-serif';
        for (let d = 1; d <= 30; d++) {
          const i = d + 5;
          g.fillText(String(d), 50 + (i % 7) * 68, 185 + Math.floor(i / 7) * 62);
        }
      });
      // two framed photos: simple figures against a backdrop
      for (const [cx, bg, c1, c2] of [
        [0, '#cfe0ea', '#b5583c', '#33506b'],
        [1, '#e8dcc6', '#3d6a4c', '#c98a3a'],
      ]) {
        cell(cx, 2, () => {
          g.fillStyle = bg;
          g.fillRect(0, 0, C, C);
          g.fillStyle = 'rgba(255,255,255,0.5)';
          g.fillRect(0, 330, C, 182);
          [[190, c1, 1], [320, c2, 0.86]].forEach(([x, col, s]) => {
            g.fillStyle = '#d9a886';
            g.beginPath();
            g.arc(x, 250 - 60 * s, 46 * s, 0, Math.PI * 2);
            g.fill();
            g.fillStyle = col;
            g.beginPath();
            g.ellipse(x, 400, 86 * s, 150 * s, 0, Math.PI, 0);
            g.fill();
            g.fillRect(x - 86 * s, 400, 172 * s, 120);
          });
        });
      }
      // mandala for the pooja
      cell(2, 2, () => {
        g.fillStyle = '#8c1d18';
        g.fillRect(0, 0, C, C);
        g.translate(256, 256);
        const cols = ['#f5c542', '#f08a24', '#fff3c9', '#f5c542'];
        for (let ring = 4; ring > 0; ring--) {
          g.fillStyle = cols[ring % cols.length];
          for (let i = 0; i < 16; i++) {
            g.save();
            g.rotate((i / 16) * Math.PI * 2 + ring * 0.2);
            g.beginPath();
            g.ellipse(0, -ring * 50, 16 + ring * 3, 40, 0, 0, Math.PI * 2);
            g.fill();
            g.restore();
          }
        }
        g.fillStyle = '#fff3c9';
        g.beginPath();
        g.arc(0, 0, 34, 0, Math.PI * 2);
        g.fill();
      });
    },
    aniso,
  );
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Front of a neighbouring building: wall with rows of windows; a second map lights some of them at night. */
function facadeTextures(aniso) {
  const r = rng(404);
  const lit = [];
  for (let i = 0; i < 24; i++) lit.push(r() < 0.55);
  const draw = (night) => (g, W, H) => {
    g.fillStyle = night ? '#000' : '#d8cfc0';
    g.fillRect(0, 0, W, H);
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 8; col++) {
        const x = 12 + col * 31;
        const y = 16 + row * 38;
        if (night) {
          if (!lit[row * 8 + col]) continue;
          g.fillStyle = col % 3 === 0 ? '#ffe6b0' : '#ffd08a';
        } else g.fillStyle = '#5d6f7d';
        g.fillRect(x, y, 18, 22);
      }
    }
  };
  return { colour: tex(256, 128, draw(false), aniso), glow: tex(256, 128, draw(true), aniso) };
}

export function createRealMaterials(renderer) {
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const std = (o, u) => {
    const m = new THREE.MeshStandardMaterial(o);
    if (u) Object.assign(m.userData, u);
    return m;
  };
  const M = createMaterials(renderer);
  for (const k of ['floor', 'wall', 'ceiling', 'walnut', 'oak', 'teak', 'door', 'doorFrame', 'lawn', 'granite']) {
    M[k].map?.dispose();
    M[k].dispose();
  }

  const wood = woodTexture(aniso);
  const weave = weaveTexture(aniso);
  const plaster = plasterTexture(aniso);
  const floor = floorTextures(aniso);
  const facade = facadeTextures(aniso);
  const woodMat = (color, rough = 0.48) => std({ map: wood, bumpMap: wood, bumpScale: 0.35, color, roughness: rough }, { tex: 0.9, grain: true });
  const cloth = (color, rough = 1) => std({ color, roughness: rough, bumpMap: weave, bumpScale: 0.9 }, { tex: 0.05 });

  Object.assign(M, {
    // building
    wall: std({ color: 0xf0e9db, roughness: 0.93, bumpMap: plaster, bumpScale: 0.5 }, { tex: 1.1 }),
    ceiling: std({ color: 0xfaf8f3, roughness: 0.95, bumpMap: plaster, bumpScale: 0.3 }, { tex: 1.4 }),
    accentHall: std({ color: 0xa9b7a6, roughness: 0.93, bumpMap: plaster, bumpScale: 0.5 }),
    accentMaster: std({ color: 0x8c97a8, roughness: 0.93, bumpMap: plaster, bumpScale: 0.5 }),
    accentKids: std({ color: 0xf1d9a2, roughness: 0.93, bumpMap: plaster, bumpScale: 0.5 }),
    floor: std({ map: floor.colour, bumpMap: floor.bump, bumpScale: 0.4, roughness: 0.16, envMapIntensity: 1.0 }, { span: 3.2 }),
    door: woodMat(0x93603a, 0.42),
    doorFrame: woodMat(0x70462a, 0.5),
    walnut: woodMat(0x6c472c),
    oak: woodMat(0xc49f6e),
    teak: woodMat(0x93603a, 0.42),
    granite: std({ map: graniteTexture(aniso), roughness: 0.14, envMapIntensity: 1.1 }, { tex: 0.5 }),
    lawn: std({ map: grassTexture(aniso), roughness: 1 }),
    laminate: std({ color: 0xece8df, roughness: 0.38 }),
    ceramic: std({ color: 0xfbfbf9, roughness: 0.08, envMapIntensity: 1.1 }),
    steel: std({ color: 0xcfd2d4, roughness: 0.24, metalness: 1.0, envMapIntensity: 1.2 }),
    fridge: std({ color: 0xb4b9bd, roughness: 0.3, metalness: 0.85, envMapIntensity: 1.1 }),
    brass: std({ color: 0xcfa64c, roughness: 0.28, metalness: 1.0, envMapIntensity: 1.2 }),
    mirror: std({ color: 0xffffff, roughness: 0.02, metalness: 1.0, envMapIntensity: 1.6 }),
    blackGlass: std({ color: 0x08090b, roughness: 0.06, envMapIntensity: 1.3 }),
    glass: std({ color: 0xd6ebf5, roughness: 0.03, transparent: true, opacity: 0.12, depthWrite: false, envMapIntensity: 1.4 }),

    // soft furnishings
    sofa: cloth(0x6f7f83),
    sofaLight: cloth(0x86969a),
    mustard: cloth(0xcf9a35),
    chairSeat: cloth(0x4f5b66),
    sheet: cloth(0xf3f0ea),
    saffron: cloth(0xe2862a),
    blanketMaster: std({ map: clothTexture(aniso, '#3d5078', '#34456a', false), roughness: 1 }, { tex: 0.36 }),
    blanketKids: std({ map: clothTexture(aniso, '#e27c5c', '#f3e3c8', true), roughness: 1 }, { tex: 0.4 }),
    rugHall: std({ map: rugTexture(aniso, '#9a4a3a', '#d9c7a0', '#f0dfb8', 1), roughness: 1 }),
    rugKids: std({ map: rugTexture(aniso, '#4f9ba0', '#f0e2c0', '#f5c95a', 2), roughness: 1 }),
    rugMaster: std({ map: rugTexture(aniso, '#b9ab9a', '#6f6258', '#efe6d8', 3), roughness: 1 }),
    runner: std({ map: rugTexture(aniso, '#3f5a57', '#c9b48a', '#e9dcc0', 4), roughness: 1 }),
    throwCloth: cloth(0xb5593c),
    towel: std({ map: clothTexture(aniso, '#e9e2d4', '#7fa7b0', false), roughness: 1 }, { tex: 0.2 }),
    teaTowel: std({ map: clothTexture(aniso, '#f4efe4', '#c8452f', true), roughness: 1 }, { tex: 0.14 }),
    curtainHall: std({ map: curtainTexture(aniso, '#d8c7a3'), roughness: 1, side: THREE.DoubleSide }),
    curtainKids: std({ map: curtainTexture(aniso, '#7fb4b8'), roughness: 1, side: THREE.DoubleSide }),
    curtainMaster: std({ map: curtainTexture(aniso, '#8793a6'), roughness: 1, side: THREE.DoubleSide }),
    blind: std({ color: 0xe9e3d5, roughness: 0.9 }),
    coir: cloth(0x8a6a44),
    mat: cloth(0x9a4b33),

    // small things
    art: std({ map: artSheet(aniso), roughness: 0.7 }),
    frame: std({ color: 0x2a2623, roughness: 0.5 }),
    frameLight: woodMat(0xc49f6e),
    switchPlate: std({ color: 0xf7f6f2, roughness: 0.35 }),
    plastic: std({ color: 0xf2f1ed, roughness: 0.4 }),
    paper: std({ color: 0xf2efe6, roughness: 0.9 }),
    red: std({ color: 0xb9382c, roughness: 0.6 }),
    blue: std({ color: 0x2f5f9a, roughness: 0.6 }),
    green: std({ color: 0x4e8a55, roughness: 0.6 }),
    yellow: std({ color: 0xe8b83a, roughness: 0.6 }),
    orange: std({ color: 0xe9892b, roughness: 0.7 }),
    pink: std({ color: 0xd9788a, roughness: 0.7 }),
    brown: std({ color: 0x7a5a3c, roughness: 0.9 }),
    banana: std({ color: 0xe6c94b, roughness: 0.7 }),
    bucket: std({ color: 0x3f7fb5, roughness: 0.35 }),
    basket: std({ color: 0xb08a58, roughness: 0.9, bumpMap: weave, bumpScale: 2 }, { tex: 0.08 }),
    bulb: std({ color: 0xffffff, emissive: 0xffdfae, emissiveIntensity: 0 }),

    // outside
    leaves: std({ map: leafTexture(aniso), roughness: 1 }),
    bark: std({ color: 0x5c4634, roughness: 1 }),
    paving: std({ color: 0xb9b3a6, roughness: 0.95, bumpMap: plaster, bumpScale: 0.8 }),
    facade: std({ map: facade.colour, emissiveMap: facade.glow, emissive: 0xffffff, emissiveIntensity: 0, roughness: 1 }),
    roof: std({ color: 0x8c8378, roughness: 1 }),
    streetLamp: std({ color: 0xffffff, emissive: 0xffe0a8, emissiveIntensity: 0 }),
  });

  // Soft, thin or glowing things do not need to cast the sun's shadow.
  for (const k of ['rugHall', 'rugKids', 'rugMaster', 'runner', 'coir', 'mat', 'art', 'switchPlate', 'bulb', 'streetLamp']) {
    M[k].userData.noShadow = true;
  }
  return M;
}
