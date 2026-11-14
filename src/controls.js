const FORWARD = ['KeyW', 'ArrowUp'];
const BACK = ['KeyS', 'ArrowDown'];
const LEFT = ['KeyA', 'ArrowLeft'];
const RIGHT = ['KeyD', 'ArrowRight'];
const ALL = new Set([...FORWARD, ...BACK, ...LEFT, ...RIGHT]);

// Keep receiving a pointer's moves even if it leaves the element. Never fatal if it fails.
function capture(el, id) {
  try {
    el.setPointerCapture(id);
  } catch {
    /* pointer already gone */
  }
}

/**
 * Keyboard + mouse on a computer, joystick + drag on a phone.
 * Exposes: yaw, pitch (radians) and a move vector (strafe, forward) in -1..1.
 */
export class Controls {
  constructor(canvas, stick, knob) {
    this.canvas = canvas;
    this.yaw = 0;
    this.pitch = 0;
    this.keys = new Set();
    this.joy = { x: 0, y: 0 };
    this.changed = true;
    this.onFirstInput = null;
    this.enabled = true; // switched off while another view (plumbing) owns the mouse

    this._look = new Map(); // pointerId -> last position
    this._stickId = null;

    // ----- keyboard
    window.addEventListener('keydown', (e) => {
      if (!this.enabled || !ALL.has(e.code) || e.metaKey || e.ctrlKey || e.altKey) return;
      e.preventDefault();
      this.keys.add(e.code);
      this._first();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    // ----- drag to look (mouse, pen or any finger that is not on the joystick)
    canvas.addEventListener('pointerdown', (e) => {
      if (!this.enabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
      capture(canvas, e.pointerId);
      this._look.set(e.pointerId, { x: e.clientX, y: e.clientY });
      canvas.classList.add('dragging');
    });
    canvas.addEventListener('pointermove', (e) => {
      const last = this._look.get(e.pointerId);
      if (!last) return;
      const k = e.pointerType === 'mouse' ? 0.0035 : 0.0055;
      // The view follows the drag, like turning a panorama.
      this.yaw += (e.clientX - last.x) * k;
      this.pitch += (e.clientY - last.y) * k;
      this.pitch = Math.max(-1.3, Math.min(1.3, this.pitch));
      last.x = e.clientX;
      last.y = e.clientY;
      this.changed = true;
      this._first();
    });
    const endLook = (e) => {
      this._look.delete(e.pointerId);
      if (this._look.size === 0) canvas.classList.remove('dragging');
    };
    canvas.addEventListener('pointerup', endLook);
    canvas.addEventListener('pointercancel', endLook);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // ----- scroll to walk (mouse wheel, or two fingers on a touchpad)
    // Rolling the wheel away from you walks forward; rolling it toward you walks back.
    this._scroll = 0; // metres still to walk, forward positive
    canvas.addEventListener(
      'wheel',
      (e) => {
        if (!this.enabled) return;
        e.preventDefault(); // keep the page from scrolling or zooming
        if (e.ctrlKey) return; // a pinch gesture, not a scroll
        let dy = e.deltaY;
        if (e.deltaMode === 1) dy *= 32; // lines
        else if (e.deltaMode === 2) dy *= window.innerHeight; // pages
        this._scroll = Math.max(-2.5, Math.min(2.5, this._scroll - dy * 0.006));
        this._first();
      },
      { passive: false },
    );

    // ----- on-screen joystick
    const setKnob = (dx, dy) => {
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
    };
    const stickMove = (e) => {
      const r = stick.getBoundingClientRect();
      const max = r.width / 2 - 14;
      let dx = e.clientX - (r.left + r.width / 2);
      let dy = e.clientY - (r.top + r.height / 2);
      const len = Math.hypot(dx, dy);
      if (len > max) {
        dx = (dx / len) * max;
        dy = (dy / len) * max;
      }
      setKnob(dx, dy);
      this.joy.x = dx / max;
      this.joy.y = -dy / max;
    };
    stick.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this._stickId = e.pointerId;
      capture(stick, e.pointerId);
      stickMove(e);
      this._first();
    });
    stick.addEventListener('pointermove', (e) => {
      if (e.pointerId === this._stickId) stickMove(e);
    });
    const endStick = (e) => {
      if (e.pointerId !== this._stickId) return;
      this._stickId = null;
      this.joy.x = 0;
      this.joy.y = 0;
      setKnob(0, 0);
    };
    stick.addEventListener('pointerup', endStick);
    stick.addEventListener('pointercancel', endStick);
  }

  _first() {
    if (this.onFirstInput) {
      this.onFirstInput();
      this.onFirstInput = null;
    }
  }

  _any(codes) {
    for (const c of codes) if (this.keys.has(c)) return true;
    return false;
  }

  /** Metres to walk forward this frame from scrolling, eased so it glides to a stop. */
  scrollStep(dt) {
    if (!this.enabled || Math.abs(this._scroll) < 0.002) {
      this._scroll = 0;
      return 0;
    }
    let step = this._scroll * (1 - Math.exp(-9 * dt));
    const max = 5 * dt; // never faster than a brisk run
    step = Math.max(-max, Math.min(max, step));
    this._scroll -= step;
    return step;
  }

  /** Returns { strafe, forward } each in -1..1. */
  move() {
    if (!this.enabled) return { strafe: 0, forward: 0 };
    let strafe = this.joy.x;
    let forward = this.joy.y;
    if (this._any(FORWARD)) forward += 1;
    if (this._any(BACK)) forward -= 1;
    if (this._any(RIGHT)) strafe += 1;
    if (this._any(LEFT)) strafe -= 1;
    const len = Math.hypot(strafe, forward);
    if (len > 1) {
      strafe /= len;
      forward /= len;
    }
    return { strafe, forward };
  }
}
