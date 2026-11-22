/**
 * Touch controls for a phone held either way, plus keys for desktop. The kart accelerates by itself.
 * Left thumb: drag sideways anywhere on the left half to steer. Right side: DRIFT (hold), ITEM, SWAP buttons.
 */
import type { Input } from '../game/sim';

export const CONTROLS = {
  /** Horizontal drag in px for full lock. */
  steerRangePx: 70,
  deadZonePx: 6,
};

export class Controls {
  private steerTouch: number | null = null;
  private steerOrigin = 0;
  private steerTouchValue = 0;
  private keys = new Set<string>();
  private held = { drift: false, item: false, swap: false };
  readonly knob: HTMLDivElement;

  constructor(private root: HTMLElement, buttons: { drift: HTMLElement; item: HTMLElement; swap: HTMLElement }) {
    this.knob = document.createElement('div');
    this.knob.className = 'knob';
    root.appendChild(this.knob);
    const opts = { passive: false } as const;
    root.addEventListener('touchstart', (e) => this.touchStart(e), opts);
    root.addEventListener('touchmove', (e) => this.touchMove(e), opts);
    root.addEventListener('touchend', (e) => this.touchEnd(e), opts);
    root.addEventListener('touchcancel', (e) => this.touchEnd(e), opts);
    for (const [name, el] of Object.entries(buttons) as [keyof Controls['held'], HTMLElement][]) {
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
  }

  private touchStart(e: TouchEvent): void {
    for (const t of Array.from(e.changedTouches)) {
      if (this.steerTouch === null && t.clientX < window.innerWidth * 0.5) {
        this.steerTouch = t.identifier;
        this.steerOrigin = t.clientX;
        this.steerTouchValue = 0;
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
      if (Math.abs(dx) > CONTROLS.steerRangePx) {
        this.steerOrigin = t.clientX - Math.sign(dx) * CONTROLS.steerRangePx;
        dx = Math.sign(dx) * CONTROLS.steerRangePx;
        this.knob.style.left = `${this.steerOrigin}px`;
      }
      this.steerTouchValue = Math.abs(dx) < CONTROLS.deadZonePx ? 0 : dx / CONTROLS.steerRangePx;
      this.knob.style.setProperty('--dx', `${dx}px`);
      e.preventDefault();
    }
  }

  private touchEnd(e: TouchEvent): void {
    for (const t of Array.from(e.changedTouches))
      if (t.identifier === this.steerTouch) {
        this.steerTouch = null;
        this.steerTouchValue = 0;
        this.knob.classList.remove('on');
      }
  }

  read(): Input {
    const k = this.keys;
    const keySteer = (k.has('arrowright') || k.has('d') ? 1 : 0) - (k.has('arrowleft') || k.has('a') ? 1 : 0);
    return {
      steer: Math.max(-1, Math.min(1, keySteer !== 0 ? keySteer : this.steerTouchValue)),
      drift: this.held.drift || k.has(' ') || k.has('shift'),
      item: this.held.item || k.has('x') || k.has('arrowup'),
      swap: this.held.swap || k.has('c') || k.has('arrowdown'),
    };
  }
}
