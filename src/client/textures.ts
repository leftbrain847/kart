/** Procedural textures drawn on canvases: nothing is loaded from anywhere, so the page stands alone. */
import * as THREE from 'three';

const canvas = (w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
};

const tex = (c: HTMLCanvasElement, repeat = true): THREE.CanvasTexture => {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
};

/** Deterministic noise for texture speckle (not game logic). */
const speckle = (seed: number): (() => number) => {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
};

export function roadTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#545a68';
  g.fillRect(0, 0, 256, 256);
  const r = speckle(7);
  for (let i = 0; i < 2600; i++) {
    const v = 70 + r() * 40;
    g.fillStyle = `rgba(${v},${v + 4},${v + 14},0.5)`;
    g.fillRect(r() * 256, r() * 256, 2, 2);
  }
  // Edge lines.
  g.fillStyle = '#f4f4f0';
  g.fillRect(6, 0, 8, 256);
  g.fillRect(242, 0, 8, 256);
  // Centre dashes.
  g.fillStyle = 'rgba(255,255,255,0.55)';
  g.fillRect(125, 0, 6, 110);
  return tex(c);
}

export function curbTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(64, 64);
  g.fillStyle = '#ff3b30';
  g.fillRect(0, 0, 64, 32);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 32, 64, 32);
  return tex(c);
}

export function grassTexture(base: string): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  const r = speckle(11);
  for (let i = 0; i < 1800; i++) {
    g.fillStyle = r() > 0.5 ? 'rgba(255,255,180,0.10)' : 'rgba(0,60,0,0.12)';
    g.fillRect(r() * 256, r() * 256, 3, 3);
  }
  // Mowing stripes.
  g.fillStyle = 'rgba(255,255,255,0.05)';
  for (let x = 0; x < 256; x += 64) g.fillRect(x, 0, 32, 256);
  return tex(c);
}

export function sandTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#f2d99a';
  g.fillRect(0, 0, 128, 128);
  const r = speckle(3);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.25)' : 'rgba(180,140,80,0.2)';
    g.fillRect(r() * 128, r() * 128, 2, 2);
  }
  return tex(c);
}

export function barrierTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 32);
  for (let i = 0; i < 4; i++) {
    g.fillStyle = i % 2 ? '#ffffff' : '#1d6cff';
    g.fillRect(i * 32, 0, 32, 32);
  }
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.fillRect(0, 26, 128, 6);
  return tex(c);
}

export function checkerTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 32);
  for (let x = 0; x < 16; x++)
    for (let y = 0; y < 4; y++) {
      g.fillStyle = (x + y) % 2 ? '#111' : '#fff';
      g.fillRect(x * 8, y * 8, 8, 8);
    }
  const t = tex(c);
  t.magFilter = THREE.NearestFilter;
  return t;
}

export function padTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(64, 128);
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, '#ffcf3f');
  grad.addColorStop(1, '#ff6a00');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 128);
  g.fillStyle = '#fff6c0';
  for (let k = 0; k < 2; k++) {
    const y = k * 64 + 12;
    g.beginPath();
    g.moveTo(8, y + 36);
    g.lineTo(32, y + 8);
    g.lineTo(56, y + 36);
    g.lineTo(46, y + 36);
    g.lineTo(32, y + 20);
    g.lineTo(18, y + 36);
    g.closePath();
    g.fill();
  }
  return tex(c);
}

export function boxTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  const grad = g.createLinearGradient(0, 0, 128, 128);
  grad.addColorStop(0, '#ff5fd2');
  grad.addColorStop(0.5, '#5fd0ff');
  grad.addColorStop(1, '#ffe45f');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.lineWidth = 8;
  g.strokeRect(6, 6, 116, 116);
  // A star, not a question mark.
  g.fillStyle = '#ffffff';
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? 18 : 42;
    g.lineTo(64 + Math.cos(a) * r, 66 + Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
  return tex(c, false);
}

export function bannerTexture(text: string): THREE.CanvasTexture {
  const [c, g] = canvas(512, 96);
  g.fillStyle = '#ff3b6b';
  g.fillRect(0, 0, 512, 96);
  g.fillStyle = '#ffe14d';
  g.fillRect(0, 0, 512, 10);
  g.fillRect(0, 86, 512, 10);
  g.fillStyle = '#ffffff';
  g.font = 'bold 54px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 50);
  return tex(c, false);
}

export function skyTexture(top: string, bottom: string): THREE.CanvasTexture {
  const [c, g] = canvas(4, 256);
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, top);
  grad.addColorStop(0.55, bottom);
  grad.addColorStop(1, '#ffffff');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  return tex(c, false);
}

export function dotTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(64, 64);
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.8)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return tex(c, false);
}

export function shadowTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(64, 64);
  const grad = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return tex(c, false);
}
