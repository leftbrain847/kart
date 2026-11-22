/** Draws a race each frame: karts and riders, items, boxes, particles, and the chase camera. */
import * as THREE from 'three';
import { TEAMS } from '../game/config';
import type { Race } from '../game/sim';
import { itemModel, kartModel, type KartModel } from './models';
import { dotTexture, shadowTexture } from './textures';
import { buildWorld, type World } from './world';

export const VIEW = {
  camDistance: 7.2,
  camHeight: 3.0,
  camLookAhead: 5,
  camFollow: 6,
  fov: 68,
  boostFov: 80,
  portraitFovBoost: 14,
  maxParticles: 400,
  sparkColors: [0x5fc8ff, 0xffa53d, 0xc77dff],
};

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  color: THREE.Color;
  size: number;
}

export class RaceView {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;
  private world: World;
  private karts: KartModel[] = [];
  private projectiles = new Map<number, THREE.Object3D>();
  private particles: Particle[] = [];
  private points: THREE.Points;
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private follow = 0;
  private time = 0;
  private swapAnim: number[] = [];

  constructor(canvas: HTMLCanvasElement, private race: Race) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const shadows = dpr <= 2;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: dpr < 2, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(dpr);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera = new THREE.PerspectiveCamera(VIEW.fov, 1, 0.3, 1600);
    this.world = buildWorld(race.track, { shadows });
    const shadowTex = shadowTexture();
    for (const k of race.karts) {
      const m = kartModel(TEAMS[k.team]!, shadowTex);
      this.world.scene.add(m.root);
      this.karts.push(m);
      this.swapAnim.push(0);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(VIEW.maxParticles * 3), 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(VIEW.maxParticles * 3), 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.55, map: dotTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.points.frustumCulled = false;
    this.world.scene.add(this.points);
    this.snapCamera();
  }

  setRace(race: Race): void {
    this.race = race;
    for (const p of this.projectiles.values()) this.world.scene.remove(p);
    this.projectiles.clear();
    this.particles = [];
    this.snapCamera();
  }

  /** Which kart the camera follows. */
  setFollow(id: number): void {
    this.follow = id;
    this.snapCamera();
  }

  resize(w: number, h: number): void {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  onSwap(kart: number): void {
    this.swapAnim[kart] = 1;
  }

  burst(kart: number, color: number, count: number, speed: number): void {
    const k = this.race.karts[kart];
    if (!k) return;
    for (let i = 0; i < count; i++) this.spawn(k.x, k.y + 0.8, k.z, (Math.random() - 0.5) * speed, Math.random() * speed * 0.6, (Math.random() - 0.5) * speed, 0.6, color, 0.9);
  }

  private snapCamera(): void {
    const k = this.race.karts[this.follow];
    if (!k) return;
    this.camPos.set(k.x - Math.cos(k.heading) * VIEW.camDistance, k.y + VIEW.camHeight, k.z - Math.sin(k.heading) * VIEW.camDistance);
    this.camLook.set(k.x, k.y + 1, k.z);
  }

  private spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, color: number, size = 0.5): void {
    if (this.particles.length >= VIEW.maxParticles) this.particles.shift();
    this.particles.push({ x, y, z, vx, vy, vz, life, max: life, color: new THREE.Color(color), size });
  }

  render(dt: number): void {
    this.time += dt;
    const race = this.race;
    const hop = race.rules.physics.hopSec;
    race.karts.forEach((k, i) => {
      const m = this.karts[i]!;
      const hopY = k.hop > 0 ? Math.sin((1 - k.hop / hop) * Math.PI) * race.rules.physics.hopHeight : 0;
      m.root.position.set(k.x, k.y, k.z);
      m.root.rotation.y = -k.heading;
      m.body.position.y = hopY + (k.offroad ? Math.sin(this.time * 40 + i) * 0.04 : 0);
      m.body.rotation.x = -k.steerShown * 0.08 - k.drift * 0.12;
      m.body.rotation.z = k.boost > 0 ? 0.05 : 0;
      for (const w of m.wheels) w.rotation.y -= k.speed * dt * 2.4;
      for (const fw of m.frontWheels) fw.rotation.y = -k.steerShown * 0.45 - k.drift * 0.3;
      // Riders: the driver sits, the back rider leans out into corners. Swap = both hop over each other.
      const sw = this.swapAnim[i]!;
      if (sw > 0) this.swapAnim[i] = Math.max(0, sw - dt * 2.6);
      const order: [number, number] = k.swapped ? [1, 0] : [0, 1];
      for (let r = 0; r < 2; r++) {
        const rider = m.riders[order[r]!]!;
        const seat = m.seats[r]!;
        const other = m.seats[1 - r]!;
        const t = sw > 0 ? sw : 0;
        rider.group.position.lerpVectors(seat, other, t);
        rider.group.position.y += Math.sin(t * Math.PI) * 1.6;
        if (r === 1) {
          rider.group.position.z = -(k.drift || k.steerShown) * 0.45;
          rider.group.rotation.x = -(k.drift || k.steerShown) * 0.35;
        } else rider.group.rotation.x = 0;
        rider.group.rotation.y = k.spin > 0 ? this.time * 12 : 0;
        for (const arm of rider.arms) arm.rotation.z = r === 1 && k.items[1] ? -2.6 : -1.1;
      }
      // Held items float above each rider.
      for (let slot = 0; slot < 2; slot++) {
        const kind = k.roulette > 0 && slot === 1 ? null : k.items[slot];
        const cur = m.heldItems[slot];
        if ((cur?.userData.kind ?? null) !== kind) {
          if (cur) m.body.remove(cur);
          m.heldItems[slot] = null;
          if (kind) {
            const o = itemModel(kind, 0.55);
            o.userData.kind = kind;
            m.body.add(o);
            m.heldItems[slot] = o;
          }
        }
        const o = m.heldItems[slot];
        if (o) {
          const seat = m.seats[slot]!;
          o.position.set(seat.x, seat.y + 1.95, seat.z);
          o.rotation.y = this.time * 3;
        }
      }
      // Boost flame and drift sparks.
      m.flame.visible = k.boost > 0;
      if (k.boost > 0) {
        m.flame.scale.set(1, 0.7 + Math.random() * 0.6, 1);
        (m.flame.material as THREE.MeshBasicMaterial).color.setHex(k.boost > 1.2 ? 0xc77dff : 0x7ad8ff);
      }
      const fx = Math.cos(k.heading);
      const fz = Math.sin(k.heading);
      if (k.drift !== 0 && k.tier > 0) {
        const col = VIEW.sparkColors[k.tier - 1]!;
        for (const side of [-1, 1]) {
          const wx = k.x - fx * 1.1 + fz * side * 0.95;
          const wz = k.z - fz * 1.1 - fx * side * 0.95;
          this.spawn(wx, k.y + 0.2 + hopY, wz, (Math.random() - 0.5) * 3 - fx * 2, Math.random() * 3, (Math.random() - 0.5) * 3 - fz * 2, 0.25, col, 0.6);
        }
      } else if (k.drift !== 0 && Math.random() < 0.5) {
        this.spawn(k.x - fx * 1.2, k.y + 0.2, k.z - fz * 1.2, (Math.random() - 0.5), 0.5, (Math.random() - 0.5), 0.4, 0x777777, 0.9);
      }
      if (k.offroad && k.speed > 6 && Math.random() < 0.6) this.spawn(k.x - fx * 1.3, k.y + 0.2, k.z - fz * 1.3, (Math.random() - 0.5) * 2, 1 + Math.random(), (Math.random() - 0.5) * 2, 0.5, 0x8a6b3d, 1.1);
      if (k.boost > 0 && Math.random() < 0.7) this.spawn(k.x - fx * 2.2, k.y + 0.5, k.z - fz * 2.2, -fx * 4, 0.6, -fz * 4, 0.3, 0xffb347, 0.8);
      m.shadow.position.y = 0.04 - hopY * 0;
    });

    // Projectiles.
    const alive = new Set<number>();
    for (const p of race.projectiles) {
      alive.add(p.id);
      let o = this.projectiles.get(p.id);
      if (!o) {
        o = itemModel(p.kind);
        this.world.scene.add(o);
        this.projectiles.set(p.id, o);
      }
      const y = race.track.samples[p.seg]?.y ?? 0;
      o.position.set(p.x, y + (p.kind === 'slick' ? 0 : 0.8 + Math.abs(Math.sin(this.time * 9)) * 0.3), p.z);
      if (p.kind !== 'slick') o.rotation.set(this.time * 6, this.time * 4, 0);
      if (p.kind === 'seeker' && Math.random() < 0.8) this.spawn(p.x, y + 0.8, p.z, 0, 0.4, 0, 0.35, 0xff2d8a, 0.7);
    }
    for (const [id, o] of this.projectiles)
      if (!alive.has(id)) {
        this.world.scene.remove(o);
        this.projectiles.delete(id);
      }

    // Item boxes spin, and pop away while respawning.
    race.boxes.forEach((b, i) => {
      const m = this.world.boxes[i]!;
      m.visible = b.respawn <= 0;
      m.position.set(b.x, b.y + 1.3 + Math.sin(this.time * 2 + i) * 0.2, b.z);
      m.rotation.set(this.time * 0.7, this.time * 1.1, 0);
    });
    this.world.pads.offset.y = -this.time * 1.5;

    // Particles.
    const pos = this.points.geometry.getAttribute('position') as THREE.BufferAttribute;
    const col = this.points.geometry.getAttribute('color') as THREE.BufferAttribute;
    let n = 0;
    this.particles = this.particles.filter((p) => (p.life -= dt) > 0);
    for (const p of this.particles) {
      p.vy -= 6 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const f = p.life / p.max;
      pos.setXYZ(n, p.x, p.y, p.z);
      col.setXYZ(n, p.color.r * f, p.color.g * f, p.color.b * f);
      n++;
    }
    for (let i = n; i < VIEW.maxParticles; i++) pos.setXYZ(i, 0, -999, 0);
    pos.needsUpdate = true;
    col.needsUpdate = true;

    // Chase camera: behind the travel direction, eased.
    const k = race.karts[this.follow]!;
    const dir = k.spin > 0 ? k.moveAngle : k.heading * 0.7 + (k.heading + wrap(k.moveAngle - k.heading)) * 0.3;
    const portrait = this.camera.aspect < 1;
    const dist = VIEW.camDistance * (portrait ? 1.25 : 1);
    const want = new THREE.Vector3(k.x - Math.cos(dir) * dist, k.y + VIEW.camHeight * (portrait ? 1.25 : 1), k.z - Math.sin(dir) * dist);
    const ease = 1 - Math.exp(-VIEW.camFollow * dt);
    this.camPos.lerp(want, ease);
    this.camLook.lerp(new THREE.Vector3(k.x + Math.cos(k.heading) * VIEW.camLookAhead, k.y + 1, k.z + Math.sin(k.heading) * VIEW.camLookAhead), Math.min(1, ease * 1.6));
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    const targetFov = (k.boost > 0 ? VIEW.boostFov : VIEW.fov) + (portrait ? VIEW.portraitFovBoost : 0);
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 5);
    this.camera.updateProjectionMatrix();
    // Keep the shadow camera on the action.
    this.world.sun.position.set(k.x + 45, k.y + 85, k.z + 30);
    this.world.sun.target.position.set(k.x, k.y, k.z);
    this.renderer.render(this.world.scene, this.camera);
  }
}

const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
