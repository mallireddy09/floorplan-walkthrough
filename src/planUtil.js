// Helpers that turn the plan data into wall pieces. Used by the 3D builder and the map.

export function wallAxis(w) {
  return w.x1 - w.x0 >= w.z1 - w.z0 ? 'x' : 'z';
}

/**
 * Splits a wall along its length into solid runs, door openings and window openings.
 * Returns { axis, segs: [{ kind, from, to, o? }] } where from/to are absolute
 * coordinates along the wall's axis.
 */
export function wallSegments(plan, w) {
  const axis = wallAxis(w);
  const a0 = axis === 'x' ? w.x0 : w.z0;
  const a1 = axis === 'x' ? w.x1 : w.z1;
  const ops = [
    ...plan.doors.filter((d) => d.wall === w.id).map((o) => ({ kind: 'door', o })),
    ...plan.windows.filter((d) => d.wall === w.id).map((o) => ({ kind: 'window', o })),
  ].sort((p, q) => p.o.from - q.o.from);

  const segs = [];
  let c = a0;
  for (const { kind, o } of ops) {
    if (o.from > c + 1e-6) segs.push({ kind: 'solid', from: c, to: o.from });
    segs.push({ kind, from: o.from, to: o.to, o });
    c = o.to;
  }
  if (c < a1 - 1e-6) segs.push({ kind: 'solid', from: c, to: a1 });
  return { axis, segs };
}

/** Plan rectangle covered by a run of wall. */
export function segRect(w, axis, from, to) {
  return axis === 'x'
    ? { x0: from, x1: to, z0: w.z0, z1: w.z1 }
    : { x0: w.x0, x1: w.x1, z0: from, z1: to };
}

/** Which named room contains this point (with a little tolerance), or null. */
export function roomAt(plan, x, z, pad = 0.03) {
  for (const r of plan.rooms) {
    if (x >= r.x0 - pad && x <= r.x1 + pad && z >= r.z0 - pad && z <= r.z1 + pad) return r;
  }
  return null;
}

export function insideFootprint(plan, x, z) {
  const f = plan.footprint;
  return x >= f.x0 && x <= f.x1 && z >= f.z0 && z <= f.z1;
}
