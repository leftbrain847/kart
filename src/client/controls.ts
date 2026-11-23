/**
 * Controls for a phone held either way, plus keys for desktop. The kart accelerates by itself.
 * Steering: tilt the phone like a wheel (default when the phone shares motion), or drag sideways on the left half.
 * Buttons: DRIFT (hold), BRAKE (hold), ITEM, SWAP.
 */
import type { Input } from '../game/sim';

export const CONTROLS = {
  /** Horizontal thumb drag in px for full lock (longer = calmer). */
  steerRangePx: 190,
  deadZonePx: 8,
  /** Drag response curve: 1 = linear, >1 = gentle for small moves, full lock still at the end. */
  steerCurve: 2,
  /** How fast thumb steering follows the thumb, per second (stops instant snaps to full lock). */
  steerFollowPerSec: 14,
  tilt: {
    /** Degrees of tilt from where you held the phone at the start for full lock. Higher = less sensitive. */
    fullLockDeg: 40,
    deadZoneDeg: 2.5,
    /** Smoothing per reading, 0..1 (lower = smoother, laggier). */
    smoothing: 0.3,
    /** Readings ease toward full lock along this curve: 1 = linear, >1 = gentler near centre. */
    curve: 1.8,
  },
};

type Button = 'drift' | 'item' | 'swap' | 'brake';

/** Player sensitivity sliders: 1 = default; 2 = half the thumb travel / tilt angle for full lock; 0.25 = four times as much. */
export const SENSITIVITY = { min: 0.25, max: 2, step: 0.1, storageKey: 'kart.sensitivity' };
export interface Sensitivity {
  thumb: number;
  tilt: number;
}
const clampSens = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(SENSITIVITY.min, Math.min(SENSITIVITY.max, v)) : 1);

export function loadSensitivity(): Sensitivity {
  try {
    const raw = JSON.parse(localStorage.getItem(SENSITIVITY.storageKey) ?? '{}') as Partial<Sensitivity>;
    return { thumb: clampSens(raw.thumb), tilt: clampSens(raw.tilt) };
  } catch {
    return { thumb: 1, tilt: 1 };
  }
}

export function saveSensitivity(s: Sensitivity): void {
  try {
    localStorage.setItem(SENSITIVITY.storageKey, JSON.stringify(s));
  } catch {
    // Storage blocked (private mode, framed page): the setting just lasts this visit.
  }
}

/** Thumb drag (px from where the thumb landed) to steering -1..1: dead zone, then a curve. */
export function dragToSteer(dx: number, sensitivity = 1, c: Pick<typeof CONTROLS, 'steerRangePx' | 'deadZonePx' | 'steerCurve'> = CONTROLS): number {
  const range = Math.max(c.deadZonePx + 10, c.steerRangePx / clampSens(sensitivity));
  const mag = Math.abs(dx);
  if (mag <= c.deadZonePx) return 0;
  const n = Math.min(1, (mag - c.deadZonePx) / (range - c.deadZonePx));
  return Math.sign(dx) * Math.pow(n, c.steerCurve);
}

export class Controls {
  private steerTouch: number | null = null;
  private steerOrigin = 0;
  private steerTouchValue = 0;
  private steerTouchTarget = 0;
  private keys = new Set<string>();
  private held: Record<Button, boolean> = { drift: false, item: false, swap: false, brake: false };
  private tiltRaw: number | null = null;
  private tiltNeutral: number | null = null;
  private tiltValue = 0;
  /** True once the phone has sent a motion reading. */
  tiltLive = false;
  tiltWanted = true;
  sens: Sensitivity = loadSensitivity();
  readonly knob: HTMLDivElement;

  constructor(root: HTMLElement, buttons: Record<Button, HTMLElement>) {
    this.knob = document.createElement('div');
    this.knob.className = 'knob';
    root.appendChild(this.knob);
    const opts = { passive: false } as const;
    root.addEventListener('touchstart', (e) => this.touchStart(e), opts);
    root.addEventListener('touchmove', (e) => this.touchMove(e), opts);
    root.addEventListener('touchend', (e) => this.touchEnd(e), opts);
    root.addEventListener('touchcancel', (e) => this.touchEnd(e), opts);
    for (const [name, el] of Object.entries(buttons) as [Button, HTMLElement][]) {
      const down = (e: Event): void => {
        e.preventDefault();
        e.stopPropagation();
        this.held[name] = true;
        el.classList.add('down');
      };
      const up = (e: Event): void => {
        e.preventDefault();
        e.stopPropagation();
        this.held[name] = false;
        el.classList.remove('down');
      };
      el.addEventListener('touchstart', down, opts);
      el.addEventListener('touchend', up, opts);
      el.addEventListener('touchcancel', up, opts);
      el.addEventListener('mousedown', down);
      el.addEventListener('mouseup', up);
      el.addEventListener('mouseleave', up);
    }
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.key.toLowerCase());
      if ([' ', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(e.key.toLowerCase())) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
    window.addEventListener('deviceorientation', (e) => this.onTilt(e));
  }

  /** Ask for motion access. iOS only allows this from a tap, so call it from the RACE button. */
  async enableTilt(): Promise<void> {
    const DOE = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
    try {
      if (DOE?.requestPermission) await DOE.requestPermission();
    } catch {
      // Refused or unavailable (e.g. inside a frame that blocks motion): touch steering still works.
    }
  }

  /** Treat the way the phone is held right now as straight ahead. */
  recentre(): void {
    this.tiltNeutral = this.tiltRaw;
    this.tiltValue = 0;
  }

  private onTilt(e: DeviceOrientationEvent): void {
    if (e.beta === null || e.gamma === null) return;
    const angle = screen.orientation?.angle ?? (window as unknown as { orientation?: number }).orientation ?? 0;
    // Steering-wheel tilt: in landscape it's beta (sign depends on which way the phone is turned); in portrait, gamma.
    const raw = angle === 90 ? e.beta : angle === -90 || angle === 270 ? -e.beta : e.gamma;
    this.tiltRaw = raw;
    this.tiltLive = true;
    if (this.tiltNeutral === null) this.tiltNeutral = raw;
    const T = CONTROLS.tilt;
    let d = raw - this.tiltNeutral;
    d = Math.abs(d) < T.deadZoneDeg ? 0 : d - Math.sign(d) * T.deadZoneDeg;
    const n = Math.max(-1, Math.min(1, d / (T.fullLockDeg / clampSens(this.sens.tilt) - T.deadZoneDeg)));
    const shaped = Math.sign(n) * Math.pow(Math.abs(n), T.curve);
    this.tiltValue += (shaped - this.tiltValue) * T.smoothing;
  }

  private touchStart(e: TouchEvent): void {
    for (const t of Array.from(e.changedTouches)) {
      if (this.steerTouch === null && t.clientX < window.innerWidth * 0.5) {
        this.steerTouch = t.identifier;
        this.steerOrigin = t.clientX;
        this.steerTouchValue = 0;
        this.steerTouchTarget = 0;
        this.knob.classList.add('on');
        this.knob.style.left = `${t.clientX}px`;
        this.knob.style.top = `${t.clientY}px`;
        this.knob.style.setProperty('--dx', '0px');
        e.preventDefault();
      }
    }
  }

  private touchMove(e: TouchEvent): void {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier !== this.steerTouch) continue;
      let dx = t.clientX - this.steerOrigin;
      // Re-centre if the thumb drifts past full lock, so reversing is always quick.
      const range = CONTROLS.steerRangePx / clampSens(this.sens.thumb);
      if (Math.abs(dx) > range) {
        this.steerOrigin = t.clientX - Math.sign(dx) * range;
        dx = Math.sign(dx) * range;
        this.knob.style.left = `${this.steerOrigin}px`;
      }
      this.steerTouchTarget = dragToSteer(dx, this.sens.thumb);
      this.knob.style.setProperty('--dx', `${(dx / range) * 32}px`);
      e.preventDefault();
    }
  }

  private touchEnd(e: TouchEvent): void {
    for (const t of Array.from(e.changedTouches))
      if (t.identifier === this.steerTouch) {
        this.steerTouch = null;
        this.steerTouchValue = 0;
        this.steerTouchTarget = 0;
        this.knob.classList.remove('on');
      }
  }

  /** Current input. `dt` (seconds since the last read) eases thumb steering toward the thumb. */
  read(dt = 1 / 60): Input {
    const k = this.keys;
    this.steerTouchValue += (this.steerTouchTarget - this.steerTouchValue) * Math.min(1, CONTROLS.steerFollowPerSec * dt);
    const keySteer = (k.has('arrowright') || k.has('d') ? 1 : 0) - (k.has('arrowleft') || k.has('a') ? 1 : 0);
    const steer = keySteer !== 0 ? keySteer : this.steerTouch !== null ? this.steerTouchValue : this.tiltWanted && this.tiltLive ? this.tiltValue : 0;
    return {
      steer: Math.max(-1, Math.min(1, steer)),
      drift: this.held.drift || k.has(' ') || k.has('shift'),
      item: this.held.item || k.has('x') || k.has('arrowup'),
      swap: this.held.swap || k.has('c'),
      brake: this.held.brake || k.has('s') || k.has('arrowdown'),
    };
  }
}
