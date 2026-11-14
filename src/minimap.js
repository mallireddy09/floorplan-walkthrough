import { wallSegments, segRect } from './planUtil.js';

/** Small 2D map of the floor plan with a dot for the walker. North is up. */
export class MiniMap {
  constructor(canvas, plan) {
    this.canvas = canvas;
    this.plan = plan;
    this.g = canvas.getContext('2d');
    this.base = document.createElement('canvas');
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth || 132;
    const h = this.canvas.clientHeight || 174;
    this.canvas.width = this.base.width = Math.round(w * dpr);
    this.canvas.height = this.base.height = Math.round(h * dpr);
    const fp = this.plan.footprint;
    const pad = 0.35;
    this.scale = Math.min(
      this.canvas.width / (fp.x1 - fp.x0 + pad * 2),
      this.canvas.height / (fp.z1 - fp.z0 + pad * 2),
    );
    this.ox = (this.canvas.width - (fp.x1 - fp.x0) * this.scale) / 2 - fp.x0 * this.scale;
    this.oz = (this.canvas.height - (fp.z1 - fp.z0) * this.scale) / 2 - fp.z0 * this.scale;
    this.dpr = dpr;
    this.drawBase();
  }

  px(x) {
    return this.ox + x * this.scale;
  }

  pz(z) {
    return this.oz + z * this.scale;
  }

  drawBase() {
    const g = this.base.getContext('2d');
    const { plan } = this;
    const fp = plan.footprint;
    g.clearRect(0, 0, this.base.width, this.base.height);

    // floor
    g.fillStyle = '#f4f1ea';
    g.fillRect(this.px(fp.x0), this.pz(fp.z0), (fp.x1 - fp.x0) * this.scale, (fp.z1 - fp.z0) * this.scale);
    for (const r of plan.rooms) {
      if (r.floor !== 'bath') continue;
      g.fillStyle = '#dfe5e6';
      g.fillRect(this.px(r.x0), this.pz(r.z0), (r.x1 - r.x0) * this.scale, (r.z1 - r.z0) * this.scale);
      if (r.wet) {
        // the wet (shower) end, in a stronger blue
        g.fillStyle = '#8fb6c6';
        g.fillRect(this.px(r.wet.x0), this.pz(r.wet.z0), (r.wet.x1 - r.wet.x0) * this.scale, (r.wet.z1 - r.wet.z0) * this.scale);
      }
    }

    // walls: solid runs dark, windows as a light line, doors left open
    for (const w of plan.walls) {
      const { axis, segs } = wallSegments(plan, w);
      for (const s of segs) {
        if (s.kind === 'door') continue;
        const r = segRect(w, axis, s.from, s.to);
        const x = this.px(r.x0);
        const z = this.pz(r.z0);
        const wd = Math.max(1, (r.x1 - r.x0) * this.scale);
        const ht = Math.max(1, (r.z1 - r.z0) * this.scale);
        if (s.kind === 'solid') {
          g.fillStyle = '#2a2c2f';
          g.fillRect(x, z, wd, ht);
        } else {
          g.fillStyle = '#8fb9d4';
          g.fillRect(x, z, wd, ht);
        }
      }
    }
  }

  /** x, z in metres; yaw as used by the camera (0 looks north, positive turns left). */
  draw(x, z, yaw) {
    const g = this.g;
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    g.drawImage(this.base, 0, 0);

    const fp = this.plan.footprint;
    const pad = 0.3;
    const cx = this.px(Math.max(fp.x0 - pad, Math.min(fp.x1 + pad, x)));
    const cz = this.pz(Math.max(fp.z0 - pad, Math.min(fp.z1 + pad, z)));
    const d = this.dpr;

    // direction wedge
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    g.fillStyle = 'rgba(214,48,49,0.28)';
    g.beginPath();
    g.moveTo(cx, cz);
    const a = Math.atan2(fz, fx);
    g.arc(cx, cz, 15 * d, a - 0.5, a + 0.5);
    g.closePath();
    g.fill();

    // dot
    g.fillStyle = '#d63031';
    g.strokeStyle = '#fff';
    g.lineWidth = 1.5 * d;
    g.beginPath();
    g.arc(cx, cz, 4.2 * d, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }
}
