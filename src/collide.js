/**
 * Moves a circle of radius r by (dx, dz) and pushes it back out of any
 * rectangle it ends up overlapping. Sliding along walls falls out naturally.
 */
export function moveWithCollision(pos, dx, dz, colliders, r) {
  const dist = Math.hypot(dx, dz);
  const steps = Math.max(1, Math.ceil(dist / 0.08));
  let x = pos.x;
  let z = pos.z;
  for (let s = 0; s < steps; s++) {
    x += dx / steps;
    z += dz / steps;
    for (let iter = 0; iter < 3; iter++) {
      let hit = false;
      for (let i = 0; i < colliders.length; i++) {
        const c = colliders[i];
        if (x < c.x0 - r || x > c.x1 + r || z < c.z0 - r || z > c.z1 + r) continue;
        const nx = x < c.x0 ? c.x0 : x > c.x1 ? c.x1 : x;
        const nz = z < c.z0 ? c.z0 : z > c.z1 ? c.z1 : z;
        const ox = x - nx;
        const oz = z - nz;
        const d2 = ox * ox + oz * oz;
        if (d2 >= r * r) continue;
        hit = true;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2);
          x = nx + (ox / d) * r;
          z = nz + (oz / d) * r;
        } else {
          // centre is inside the rectangle: leave by the nearest edge
          const l = x - c.x0;
          const rt = c.x1 - x;
          const t = z - c.z0;
          const bt = c.z1 - z;
          const m = Math.min(l, rt, t, bt);
          if (m === l) x = c.x0 - r;
          else if (m === rt) x = c.x1 + r;
          else if (m === t) z = c.z0 - r;
          else z = c.z1 + r;
        }
      }
      if (!hit) break;
    }
  }
  pos.x = x;
  pos.z = z;
}
