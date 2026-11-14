import * as THREE from 'three';

// Painted skies for the Real style, wrapped all the way round the scene.

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function skyTexture(night) {
  const W = 2048;
  const H = 1024;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const r = rng(night ? 9 : 4);
  const horizon = H / 2;

  const grd = g.createLinearGradient(0, 0, 0, horizon);
  if (night) {
    grd.addColorStop(0, '#03050c');
    grd.addColorStop(0.7, '#0a1024');
    grd.addColorStop(1, '#1b2340');
  } else {
    grd.addColorStop(0, '#3f7fd0');
    grd.addColorStop(0.6, '#8fbdea');
    grd.addColorStop(1, '#dcebf6');
  }
  g.fillStyle = grd;
  g.fillRect(0, 0, W, horizon);
  g.fillStyle = night ? '#0a0d14' : '#9aa58c'; // below the horizon
  g.fillRect(0, horizon, W, H - horizon);

  if (night) {
    for (let i = 0; i < 900; i++) {
      const y = Math.pow(r(), 1.4) * horizon * 0.95;
      const a = 0.35 + r() * 0.65;
      g.fillStyle = `rgba(${230 + r() * 25},${230 + r() * 25},255,${a})`;
      const s = r() < 0.9 ? 1.2 : 2.2;
      g.fillRect(r() * W, y, s, s);
    }
    // moon with a soft halo
    const mx = W * 0.62;
    const my = horizon * 0.42;
    const halo = g.createRadialGradient(mx, my, 0, mx, my, 120);
    halo.addColorStop(0, 'rgba(200,215,255,0.35)');
    halo.addColorStop(1, 'rgba(200,215,255,0)');
    g.fillStyle = halo;
    g.fillRect(mx - 120, my - 120, 240, 240);
    g.fillStyle = '#f2f1e6';
    g.beginPath();
    g.arc(mx, my, 20, 0, Math.PI * 2);
    g.fill();
    // glow of the town along the horizon
    const town = g.createLinearGradient(0, horizon - 90, 0, horizon);
    town.addColorStop(0, 'rgba(255,170,90,0)');
    town.addColorStop(1, 'rgba(255,170,90,0.22)');
    g.fillStyle = town;
    g.fillRect(0, horizon - 90, W, 90);
  } else {
    // sun glow toward the south-east
    const sx = W * 0.14;
    const sy = horizon * 0.6;
    const glow = g.createRadialGradient(sx, sy, 0, sx, sy, 260);
    glow.addColorStop(0, 'rgba(255,250,230,0.95)');
    glow.addColorStop(0.08, 'rgba(255,244,214,0.6)');
    glow.addColorStop(1, 'rgba(255,244,214,0)');
    g.fillStyle = glow;
    g.fillRect(sx - 260, sy - 260, 520, 520);
    // a few soft clouds
    for (let i = 0; i < 26; i++) {
      const cx = r() * W;
      const cy = horizon * (0.25 + r() * 0.6);
      for (let k = 0; k < 7; k++) {
        const x = cx + (r() - 0.5) * 220;
        const y = cy + (r() - 0.5) * 30;
        const rad = 30 + r() * 60;
        const puff = g.createRadialGradient(x, y, 0, x, y, rad);
        puff.addColorStop(0, 'rgba(255,255,255,0.5)');
        puff.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = puff;
        g.fillRect(x - rad, y - rad * 0.6, rad * 2, rad * 1.2);
      }
    }
  }

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.mapping = THREE.EquirectangularReflectionMapping;
  return t;
}
