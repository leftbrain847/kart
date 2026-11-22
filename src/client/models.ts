/** Low-poly models built from primitives: karts with two riders, items, scenery. Karts face +x. */
import * as THREE from 'three';
import type { Rider, Team } from '../game/config';

const mat = (color: number, opts: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05, flatShading: false, ...opts });

const shared = {
  tire: mat(0x1c1c22, { roughness: 0.9 }),
  hub: mat(0xdadde6, { metalness: 0.6, roughness: 0.3 }),
  seat: mat(0x2a2a33),
  eyeWhite: mat(0xffffff, { roughness: 0.3 }),
  eyeDark: mat(0x111111, { roughness: 0.2 }),
  metal: mat(0x9aa0ad, { metalness: 0.7, roughness: 0.35 }),
};

export interface RiderModel {
  group: THREE.Group;
  arms: THREE.Mesh[];
}

function riderModel(r: Rider): RiderModel {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.38, 4, 10), mat(r.color));
  body.position.y = 0.45;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 12), mat(r.color));
  head.position.y = 1.05;
  g.add(head);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), mat(r.accent, { roughness: 0.3 }));
  helmet.position.y = 1.07;
  g.add(helmet);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), shared.eyeWhite);
    eye.position.set(0.29, 1.07, side * 0.12);
    eye.scale.set(0.6, 1.2, 1);
    g.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), shared.eyeDark);
    pupil.position.set(0.34, 1.07, side * 0.12);
    g.add(pupil);
  }
  if (r.head === 'ears')
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.32, 8), mat(r.color));
      ear.position.set(-0.02, 1.4, side * 0.2);
      ear.rotation.x = side * 0.35;
      g.add(ear);
    }
  if (r.head === 'antenna') {
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.4, 6), shared.metal);
    stalk.position.set(0, 1.55, 0);
    g.add(stalk);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), mat(r.accent, { emissive: r.accent, emissiveIntensity: 0.6 }));
    ball.position.set(0, 1.78, 0);
    g.add(ball);
  }
  if (r.head === 'crest') {
    const crest = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.45, 4), mat(r.accent));
    crest.position.set(-0.08, 1.47, 0);
    crest.rotation.z = 0.4;
    g.add(crest);
  }
  const arms: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.35, 3, 6), mat(r.color));
    arm.position.set(0.2, 0.6, side * 0.33);
    arm.rotation.z = -1.1;
    g.add(arm);
    arms.push(arm);
  }
  g.traverse((o) => (o.castShadow = true));
  return { group: g, arms };
}

export interface KartModel {
  root: THREE.Group;
  /** Tilts and hops; the riders and body live here. */
  body: THREE.Group;
  wheels: THREE.Mesh[];
  frontWheels: THREE.Group[];
  riders: [RiderModel, RiderModel];
  /** Driver seat and back-rider positions in kart space. */
  seats: [THREE.Vector3, THREE.Vector3];
  flame: THREE.Mesh;
  shadow: THREE.Mesh;
  heldItems: [THREE.Object3D | null, THREE.Object3D | null];
}

export function kartModel(team: Team, shadowTex: THREE.Texture): KartModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const paint = mat(team.kart, { roughness: 0.35, metalness: 0.15 });
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.42, 1.35), paint);
  chassis.position.y = 0.42;
  body.add(chassis);
  const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.68, 0.42, 16, 1, false, 0, Math.PI), paint);
  nose.rotation.set(Math.PI / 2, 0, -Math.PI / 2);
  nose.position.set(1.15, 0.42, 0);
  body.add(nose);
  const bumper = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.22, 1.7), shared.metal);
  bumper.position.set(1.65, 0.28, 0);
  body.add(bumper);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 1.5), paint);
  fin.position.set(-1.1, 0.85, 0);
  body.add(fin);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.08, 1.9), mat(0xffffff, { roughness: 0.3 }));
  wing.position.set(-1.15, 1.12, 0);
  body.add(wing);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.8), shared.seat);
  seat.position.set(0.1, 0.8, 0);
  body.add(seat);
  const wheelCol = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 6), shared.metal);
  wheelCol.position.set(0.75, 0.9, 0);
  wheelCol.rotation.z = 0.8;
  body.add(wheelCol);
  const steeringWheel = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.04, 6, 14), shared.tire);
  steeringWheel.position.set(0.55, 1.08, 0);
  steeringWheel.rotation.y = Math.PI / 2;
  steeringWheel.rotation.x = 0.6;
  body.add(steeringWheel);
  for (const side of [-1, 1]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 0.55, 10), shared.metal);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(-1.35, 0.5, side * 0.38);
    body.add(pipe);
  }
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.28, 1.4, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x7ad8ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  flame.rotation.z = Math.PI / 2;
  flame.position.set(-2.1, 0.5, 0);
  flame.visible = false;
  body.add(flame);

  const wheels: THREE.Mesh[] = [];
  const frontWheels: THREE.Group[] = [];
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.42, 16);
  const hubGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.44, 10);
  for (const [x, front] of [
    [0.85, true],
    [-0.9, false],
  ] as const)
    for (const side of [-1, 1]) {
      const holder = new THREE.Group();
      holder.position.set(x, 0.42, side * (front ? 0.85 : 0.9));
      const w = new THREE.Mesh(wheelGeo, shared.tire);
      w.rotation.x = Math.PI / 2;
      const hub = new THREE.Mesh(hubGeo, shared.hub);
      w.add(hub);
      if (!front) w.scale.set(1.15, 1.25, 1.15);
      holder.add(w);
      root.add(holder);
      wheels.push(w);
      if (front) frontWheels.push(holder);
    }

  const driver = riderModel(team.riders[0]);
  const backer = riderModel(team.riders[1]);
  const seats: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(0.1, 0.62, 0), new THREE.Vector3(-0.85, 0.95, 0)];
  body.add(driver.group, backer.group);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.4), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.04;
  shadow.renderOrder = 1;
  root.add(shadow);
  root.traverse((o) => {
    if (o !== shadow) o.castShadow = true;
  });
  return { root, body, wheels, frontWheels, riders: [driver, backer], seats, flame, shadow, heldItems: [null, null] };
}

export function itemModel(kind: 'nitro' | 'bouncer' | 'seeker' | 'slick', scale = 1): THREE.Object3D {
  const g = new THREE.Group();
  if (kind === 'bouncer' || kind === 'seeker') {
    const color = kind === 'bouncer' ? 0x24e08a : 0xff2d8a;
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 1), mat(color, { emissive: color, emissiveIntensity: 0.35, roughness: 0.25 }));
    g.add(core);
    const spikes = new THREE.Mesh(new THREE.OctahedronGeometry(0.78, 0), mat(0xffffff, { roughness: 0.2, metalness: 0.4 }));
    spikes.scale.setScalar(0.85);
    g.add(spikes);
    if (kind === 'seeker') {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.07, 6, 20), mat(0xffe14d, { emissive: 0xffe14d, emissiveIntensity: 0.8 }));
      ring.rotation.x = Math.PI / 2;
      g.add(ring);
    }
  } else if (kind === 'slick') {
    const puddle = new THREE.Mesh(new THREE.CircleGeometry(1.5, 18), mat(0x241433, { roughness: 0.05, metalness: 0.6 }));
    puddle.rotation.x = -Math.PI / 2;
    puddle.position.y = 0.06;
    g.add(puddle);
    const sheen = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.9, 18), new THREE.MeshBasicMaterial({ color: 0x9b6bff, transparent: true, opacity: 0.45 }));
    sheen.rotation.x = -Math.PI / 2;
    sheen.position.y = 0.08;
    g.add(sheen);
  } else {
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.9, 12), mat(0xff7a00, { emissive: 0xff3d00, emissiveIntensity: 0.3 }));
    g.add(can);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.25, 10), shared.metal);
    cap.position.y = 0.55;
    g.add(cap);
  }
  g.scale.setScalar(scale);
  return g;
}

export function palm(rand: () => number): THREE.Group {
  const g = new THREE.Group();
  const h = 6 + rand() * 4;
  const lean = (rand() - 0.5) * 0.4;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.38, h, 7), mat(0x9c6b3c, { roughness: 0.9 }));
  trunk.position.y = h / 2;
  trunk.rotation.z = lean;
  g.add(trunk);
  const top = new THREE.Vector3(-Math.sin(lean) * h, h, 0);
  const leafMat = mat(0x2fa84f, { roughness: 0.8, side: THREE.DoubleSide });
  for (let i = 0; i < 7; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.7, 3.6, 4), leafMat);
    leaf.scale.set(1, 1, 0.25);
    const a = (i / 7) * Math.PI * 2;
    leaf.position.copy(top).add(new THREE.Vector3(Math.cos(a) * 1.4, -0.4, Math.sin(a) * 1.4));
    leaf.rotation.set(Math.sin(a) * 1.9, -a, Math.cos(a) * -1.9);
    leaf.lookAt(top.clone().add(new THREE.Vector3(Math.cos(a) * 4, -1.8, Math.sin(a) * 4)));
    leaf.rotateX(Math.PI / 2);
    g.add(leaf);
  }
  for (let i = 0; i < 3; i++) {
    const nut = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), mat(0x5a3a1a));
    nut.position.copy(top).add(new THREE.Vector3(Math.cos(i * 2) * 0.3, -0.35, Math.sin(i * 2) * 0.3));
    g.add(nut);
  }
  g.traverse((o) => (o.castShadow = true));
  return g;
}

export function umbrella(color: number): THREE.Group {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 6), mat(0xffffff));
  pole.position.y = 1.3;
  g.add(pole);
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.6, 0.7, 8), mat(color, { side: THREE.DoubleSide }));
  canopy.position.y = 2.6;
  g.add(canopy);
  return g;
}

export function lighthouse(): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(2.2 - i * 0.25, 2.45 - i * 0.25, 4, 16), mat(i % 2 ? 0xff3b30 : 0xffffff));
    seg.position.y = 2 + i * 4;
    g.add(seg);
  }
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 2, 12), mat(0xfff2a8, { emissive: 0xffe066, emissiveIntensity: 1 }));
  lamp.position.y = 21;
  g.add(lamp);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.7, 1.8, 12), mat(0x222831));
  roof.position.y = 22.9;
  g.add(roof);
  g.traverse((o) => (o.castShadow = true));
  return g;
}

export function cloud(rand: () => number): THREE.Group {
  const g = new THREE.Group();
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xbfd8ff, emissiveIntensity: 0.25 });
  for (let i = 0; i < 5; i++) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(4 + rand() * 4, 10, 8), m);
    puff.position.set((i - 2) * 5, rand() * 2, (rand() - 0.5) * 4);
    g.add(puff);
  }
  return g;
}
