/** The static world: road ribbon, curbs, barriers, ground, sea, scenery, sky and lights. */
import * as THREE from 'three';
import type { Track } from '../game/track';
import { pointAt, project } from '../game/track';
import { cloud, lighthouse, palm, umbrella } from './models';
import * as T from './textures';

export const WORLD = {
  islandRadius: 330,
  beachWidth: 26,
  barrierHeight: 0.9,
  curbWidth: 1.1,
  scenery: { palms: 140, umbrellas: 26, clouds: 14, rocks: 40, keepOut: 5 },
  sunDir: [0.45, 0.85, 0.3] as [number, number, number],
};

/** A ribbon along the track between two sideways offsets, at the track's height plus `lift`. */
function ribbon(track: Track, from: (i: number) => number, to: (i: number) => number, lift: number, vScale: number, uSpan: [number, number] = [0, 1]): THREE.BufferGeometry {
  const S = track.samples;
  const n = S.length;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const s = S[i % n]!;
    const lx = s.tz;
    const lz = -s.tx;
    const a = from(i % n);
    const b = to(i % n);
    pos.push(s.x + lx * a, s.y + lift, s.z + lz * a, s.x + lx * b, s.y + lift, s.z + lz * b);
    const v = (i === n ? track.length : s.s) / vScale;
    uv.push(uSpan[0], v, uSpan[1], v);
    if (i < n) {
      const k = i * 2;
      idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // Make sure faces point up whichever side is "from".
  const nrm = g.getAttribute('normal') as THREE.BufferAttribute;
  if (nrm.getY(0) < 0) {
    g.setIndex(idx.map((_, j) => idx[j - (j % 3) + [0, 2, 1][j % 3]!]!));
    g.computeVertexNormals();
  }
  return g;
}

/** A vertical wall along the track at sideways offset `at(i)`, from the track height down to `bottom`. */
function wall(track: Track, at: (i: number) => number, lift: number, bottom: (y: number) => number, vScale: number): THREE.BufferGeometry {
  const S = track.samples;
  const n = S.length;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const s = S[i % n]!;
    const off = at(i % n);
    const x = s.x + s.tz * off;
    const z = s.z - s.tx * off;
    pos.push(x, s.y + lift, z, x, bottom(s.y), z);
    const u = (i === n ? track.length : s.s) / vScale;
    uv.push(u, 1, u, 0);
    if (i < n) {
      const k = i * 2;
      idx.push(k, k + 1, k + 2, k + 2, k + 1, k + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export interface World {
  scene: THREE.Scene;
  sun: THREE.DirectionalLight;
  pads: THREE.Texture;
  water: THREE.Mesh;
  boxes: THREE.Mesh[];
}

export function buildWorld(track: Track, quality: { shadows: boolean }): World {
  const scene = new THREE.Scene();
  const th = track.def.theme;
  scene.fog = new THREE.Fog(th.fog, 140, 520);
  // Sky dome.
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 12), new THREE.MeshBasicMaterial({ map: T.skyTexture('#3d8bff', '#9fd6ff'), side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.renderOrder = -1;
  scene.add(sky);
  scene.add(new THREE.HemisphereLight(0xcfe9ff, 0x5a8a3a, 1.25));
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
  sun.position.set(...WORLD.sunDir).multiplyScalar(100);
  if (quality.shadows) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const c = sun.shadow.camera;
    c.left = c.bottom = -45;
    c.right = c.top = 45;
    c.near = 10;
    c.far = 260;
    sun.shadow.bias = -0.0006;
  }
  scene.add(sun, sun.target);

  // Sea and island.
  const water = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshStandardMaterial({ color: th.water, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.95 }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = -1.2;
  scene.add(water);
  const centre: [number, number] = [0, 0];
  for (const s of track.samples) {
    centre[0] += s.x / track.samples.length;
    centre[1] += s.z / track.samples.length;
  }
  const sandTex = T.sandTexture();
  sandTex.repeat.set(60, 60);
  const beach = new THREE.Mesh(new THREE.CircleGeometry(WORLD.islandRadius + WORLD.beachWidth, 72), new THREE.MeshStandardMaterial({ map: sandTex, roughness: 1 }));
  beach.rotation.x = -Math.PI / 2;
  beach.position.set(centre[0], -0.6, centre[1]);
  beach.receiveShadow = true;
  scene.add(beach);
  const grassTex = T.grassTexture('#5cc04a');
  grassTex.repeat.set(70, 70);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(WORLD.islandRadius, 72), new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(centre[0], -0.05, centre[1]);
  ground.receiveShadow = true;
  scene.add(ground);

  const half = (i: number): number => track.samples[i]!.half;
  const sh = track.def.shoulder;
  // Grass shoulders at road height (they matter where the road climbs above the ground).
  const shoulderTex = T.grassTexture('#4fb23f');
  const shoulder = new THREE.Mesh(ribbon(track, (i) => -(half(i) + sh), (i) => half(i) + sh, -0.02, 6), new THREE.MeshStandardMaterial({ map: shoulderTex, roughness: 1 }));
  shoulder.receiveShadow = true;
  scene.add(shoulder);
  const road = new THREE.Mesh(ribbon(track, (i) => -half(i), (i) => half(i), 0.02, 16), new THREE.MeshStandardMaterial({ map: T.roadTexture(), roughness: 0.85 }));
  road.receiveShadow = true;
  scene.add(road);
  const curbMat = new THREE.MeshStandardMaterial({ map: T.curbTexture(), roughness: 0.6 });
  for (const side of [-1, 1]) {
    const inner = (i: number): number => side * half(i);
    const outer = (i: number): number => side * (half(i) + WORLD.curbWidth);
    const curb = new THREE.Mesh(ribbon(track, side < 0 ? outer : inner, side < 0 ? inner : outer, 0.05, 3), curbMat);
    curb.receiveShadow = true;
    scene.add(curb);
    // Barrier at the wall line, plus an embankment skirt down to the ground.
    const barrierTex = T.barrierTexture();
    const barrier = new THREE.Mesh(wall(track, (i) => side * (half(i) + sh), WORLD.barrierHeight, (y) => y, 8), new THREE.MeshStandardMaterial({ map: barrierTex, side: THREE.DoubleSide, roughness: 0.5 }));
    barrier.castShadow = quality.shadows;
    scene.add(barrier);
    const skirt = new THREE.Mesh(wall(track, (i) => side * (half(i) + sh), 0, () => -0.6, 8), new THREE.MeshStandardMaterial({ color: 0x9b7b55, side: THREE.DoubleSide, roughness: 1 }));
    scene.add(skirt);
  }

  // Start / finish line and gantry.
  const start = pointAt(track, 0);
  const startAngle = Math.atan2(start.tz, start.tx);
  const line = new THREE.Mesh(new THREE.PlaneGeometry(2.4, start.half * 2), new THREE.MeshStandardMaterial({ map: T.checkerTexture(), roughness: 0.7 }));
  line.rotation.set(-Math.PI / 2, 0, -startAngle);
  line.position.set(start.x, start.y + 0.04, start.z);
  scene.add(line);
  const gantry = new THREE.Group();
  const postMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.7, 7, 0.7), postMat);
    post.position.set(0, 3.5, side * (start.half + 2));
    gantry.add(post);
  }
  const banner = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.6, start.half * 2 + 4.7), [postMat, postMat, postMat, postMat, new THREE.MeshStandardMaterial({ map: T.bannerTexture('CORAL COAST') }), new THREE.MeshStandardMaterial({ map: T.bannerTexture('CORAL COAST') })]);
  banner.position.y = 7;
  gantry.add(banner);
  gantry.position.set(start.x, start.y, start.z);
  gantry.rotation.y = -startAngle;
  gantry.traverse((o) => (o.castShadow = quality.shadows));
  scene.add(gantry);

  // Boost pads.
  const padTex = T.padTexture();
  padTex.wrapT = THREE.RepeatWrapping;
  const padMat = new THREE.MeshBasicMaterial({ map: padTex, transparent: true, opacity: 0.95 });
  for (const pad of track.def.boostPads) {
    const p = pointAt(track, pad.s, pad.lateral);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(3.6, pad.length), padMat);
    m.rotation.set(-Math.PI / 2, 0, -Math.atan2(p.tz, p.tx) + Math.PI / 2);
    m.position.set(p.x, p.y + 0.06, p.z);
    scene.add(m);
  }

  // Item boxes (positions are refreshed every frame from the sim).
  const boxMat = new THREE.MeshStandardMaterial({ map: T.boxTexture(), transparent: true, opacity: 0.85, emissive: 0xffffff, emissiveIntensity: 0.25, roughness: 0.2 });
  const boxGeo = new THREE.BoxGeometry(1.4, 1.4, 1.4);
  const boxes: THREE.Mesh[] = [];
  for (const row of track.def.itemRows)
    for (let k = 0; k < row.count; k++) {
      const b = new THREE.Mesh(boxGeo, boxMat);
      b.castShadow = quality.shadows;
      scene.add(b);
      boxes.push(b);
    }

  // Scenery, placed from a fixed seed so every run looks the same, kept off the track.
  let seed = 99;
  const rand = (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const clear = (x: number, z: number, margin: number): boolean => {
    const pr = project(track, x, z, -1);
    return Math.abs(pr.lateral) > pr.half + sh + margin;
  };
  const place = (count: number, make: () => THREE.Object3D, margin: number, rMin = 0, rMax = WORLD.islandRadius - 4): void => {
    let placed = 0;
    for (let tries = 0; placed < count && tries < count * 30; tries++) {
      const a = rand() * Math.PI * 2;
      const r = rMin + Math.sqrt(rand()) * (rMax - rMin);
      const x = centre[0] + Math.cos(a) * r;
      const z = centre[1] + Math.sin(a) * r;
      if (!clear(x, z, margin)) continue;
      const o = make();
      o.position.set(x, 0, z);
      o.rotation.y = rand() * Math.PI * 2;
      scene.add(o);
      placed++;
    }
  };
  place(WORLD.scenery.palms, () => palm(rand), WORLD.scenery.keepOut);
  const umbrellaColors = [0xff3b6b, 0xffd23f, 0x2fd0ff, 0x7a4bff];
  place(WORLD.scenery.umbrellas, () => umbrella(umbrellaColors[Math.floor(rand() * umbrellaColors.length)]!), 3, WORLD.islandRadius - 8, WORLD.islandRadius + WORLD.beachWidth - 6);
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x8b8f99, roughness: 1, flatShading: true });
  place(WORLD.scenery.rocks, () => {
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(1 + rand() * 2.5, 0), rockMat);
    r.scale.y = 0.6;
    r.castShadow = quality.shadows;
    return r;
  }, 3);
  const lh = lighthouse();
  lh.position.set(centre[0] + WORLD.islandRadius * 0.92, -0.5, centre[1] - WORLD.islandRadius * 0.35);
  scene.add(lh);
  // Distant islands and clouds.
  const hillMat = new THREE.MeshStandardMaterial({ color: 0x3f9a58, roughness: 1, flatShading: true });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rand() * 0.3;
    const hill = new THREE.Mesh(new THREE.ConeGeometry(60 + rand() * 60, 50 + rand() * 70, 7), hillMat);
    hill.position.set(centre[0] + Math.cos(a) * 640, -2, centre[1] + Math.sin(a) * 640);
    scene.add(hill);
  }
  for (let i = 0; i < WORLD.scenery.clouds; i++) {
    const c = cloud(rand);
    const a = rand() * Math.PI * 2;
    c.position.set(centre[0] + Math.cos(a) * (200 + rand() * 300), 70 + rand() * 50, centre[1] + Math.sin(a) * (200 + rand() * 300));
    scene.add(c);
  }
  return { scene, sun, pads: padTex, water, boxes };
}
