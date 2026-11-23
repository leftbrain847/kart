/**
 * Kart client: title + crew select, the race (three.js view, HUD, touch controls), results.
 * The race sim runs at a fixed 60 Hz in the browser. On the friends host, inputs are also sent to the server in
 * chunks so it can replay the race and record the score. In the Play/demo build the network paths compile out.
 */
import { api, configureClient } from '@app-builder/client-sdk';
import config from '../../app.config.json';
import { REPLAY } from '../app';
import { TEAMS, type ItemKind } from '../game/config';
import { pushInput, tickCount } from '../game/replay';
import { createRace, lapOf, NO_INPUT, raceTimeSec, standings, step, type Race } from '../game/sim';
import { Sound } from './audio';
import { Controls, SENSITIVITY, saveSensitivity, type Sensitivity } from './controls';
import { el, render } from './ui';
import { RaceView } from './view';

const ONLINE = import.meta.env.VITE_TARGET !== 'play';
const ATTRACT = location.hash === '#attract';

const ITEM_LABEL: Record<ItemKind, string> = { nitro: 'Nitro', bouncer: 'Bouncer', seeker: 'Seeker', slick: 'Slick' };
const PLACE = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];
const fmt = (sec: number): string => `${Math.floor(sec / 60)}:${(sec % 60).toFixed(2).padStart(5, '0')}`;
const randomSeed = (): number => crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;

const sound = new Sound();
let crew = 0;

// One canvas and view for the whole session.
const canvas = el('canvas', { className: 'stage' });
let view: RaceView | null = null;
let race: Race = createRace(randomSeed(), crew);
let mode: 'title' | 'race' | 'results' = 'title';
let paused = false;
let runs: number[][] = [[]];
let ranked: { runId: string; sent: number } | null = null;

const hud = {
  place: el('div', { className: 'place' }),
  lap: el('div', { className: 'lap' }),
  time: el('div', { className: 'time' }),
  slots: [el('div', { className: 'slot front' }), el('div', { className: 'slot back' })] as [HTMLDivElement, HTMLDivElement],
  banner: el('div', { className: 'banner' }),
  toast: el('div', { className: 'toast' }),
  map: el('canvas', { className: 'map' }),
};
const btn = {
  drift: el('button', { className: 'ctl drift', text: 'DRIFT' }),
  item: el('button', { className: 'ctl item', text: 'ITEM' }),
  swap: el('button', { className: 'ctl swap', text: 'SWAP' }),
  brake: el('button', { className: 'ctl brake', text: 'BRAKE' }),
};
const touchLayer = el('div', { className: 'touch' });
const controls = new Controls(touchLayer, btn);
let bannerUntil = 0;
let toastUntil = 0;
const say = (text: string, sec = 1.2): void => {
  hud.banner.textContent = text;
  hud.banner.classList.add('on');
  bannerUntil = performance.now() + sec * 1000;
};
const toast = (text: string): void => {
  hud.toast.textContent = text;
  hud.toast.classList.add('on');
  toastUntil = performance.now() + 900;
};

function ensureView(): RaceView {
  if (!view) {
    view = new RaceView(canvas, race);
    const resize = (): void => view!.resize(window.innerWidth, window.innerHeight);
    window.addEventListener('resize', resize);
    resize();
  } else view.setRace(race);
  view.setFollow(race.player);
  return view;
}

function newRace(attract: boolean): void {
  race = createRace(randomSeed(), crew);
  if (attract) race.karts[race.player]!.ai = true;
  runs = [[]];
  ranked = null;
  controls.recentre();
  ensureView();
  drawMap(true);
  if (ONLINE && !attract) {
    configureClient({ basePath: `/${config.id}` });
    void api.soloStart(config.id).then((s) => {
      if (s && race.tick === 0) {
        race = createRace(s.seed, crew);
        view?.setRace(race);
        ranked = { runId: s.runId, sent: 0 };
      }
    });
  }
}

function sendChunk(final: boolean): void {
  if (!ONLINE || !ranked) return;
  const cur = runs[runs.length - 1]!;
  if (!final && tickCount(cur) < REPLAY.maxChunkTicks) return;
  if (tickCount(cur) === 0) return;
  const i = ranked.sent++;
  const seg = { i, team: crew, runs: cur };
  runs.push([]);
  const r = ranked;
  void api.soloSegment(config.id, r.runId, seg).then((res) => {
    if (!res || !res.ok) ranked = null;
  });
}

// ---------- Screens ----------

/** Thumb and tilt sensitivity sliders; changes apply at once and are remembered on this device. */
function sensitivityPanel(): HTMLElement {
  const slider = (key: keyof Sensitivity, label: string): HTMLElement => {
    const out = el('span', { className: 'val', text: `${Math.round(controls.sens[key] * 100)}%` });
    const input = el('input');
    input.type = 'range';
    input.min = String(SENSITIVITY.min);
    input.max = String(SENSITIVITY.max);
    input.step = String(SENSITIVITY.step);
    input.value = String(controls.sens[key]);
    input.setAttribute('aria-label', `${label} steering sensitivity`);
    input.addEventListener('input', () => {
      controls.sens = { ...controls.sens, [key]: Number(input.value) };
      out.textContent = `${Math.round(controls.sens[key] * 100)}%`;
      saveSensitivity(controls.sens);
    });
    for (const ev of ['touchstart', 'touchmove'] as const) input.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });
    return el('label', { className: 'sens' }, [el('span', { text: label }), input, out]);
  };
  return el('div', { className: 'senses' }, [el('strong', { text: 'Steering sensitivity' }), slider('thumb', 'Thumb'), slider('tilt', 'Tilt')]);
}

function titleScreen(): void {
  mode = 'title';
  newRace(true);
  const cards = TEAMS.map((t, i) => {
    const stat = (label: string, v: number, lo: number, hi: number): HTMLElement =>
      el('div', { className: 'stat' }, [el('span', { text: label }), el('i', {}, [el('b', { className: `w${Math.round(((v - lo) / (hi - lo)) * 4)}` })])]);
    const card = el('button', { className: `crew${i === crew ? ' picked' : ''} c${i}`, onClick: () => ((crew = i), titleScreen()) }, [
      el('strong', { text: t.name }),
      el('span', { className: 'riders', text: `${t.riders[0].name} + ${t.riders[1].name}` }),
      stat('Speed', t.stats.topSpeed, 26.5, 29.5),
      stat('Accel', t.stats.accel, 12, 18.5),
      stat('Grip', t.stats.handling, 1.9, 2.4),
      stat('Weight', t.stats.weight, 0.5, 3.2),
    ]);
    return card;
  });
  render(
    el('div', { className: 'screen' }, [
      canvas,
      el('div', { className: 'panel title' }, [
        el('h1', { text: 'KART' }),
        el('p', { className: 'sub', text: 'Two riders. One kart. Coral Coast, 3 laps.' }),
        el('div', { className: 'crews' }, cards),
        el('button', { className: 'go', text: 'RACE', onClick: startRace }),
        sensitivityPanel(),
        el('p', { className: 'how', text: 'Turn the phone like a steering wheel (or drag the left side) | hold DRIFT while turning, release for a turbo | BRAKE pivots through tight turns | hold DRIFT just before GO for a rocket start | ITEM throws the back rider\'s item | SWAP trades riders. Hold the phone how you like before tapping RACE: that\'s straight ahead.' }),
      ]),
    ]),
  );
}

function startRace(): void {
  sound.unlock();
  void controls.enableTilt();
  mode = 'race';
  newRace(ATTRACT);
  paused = false;
  render(
    el('div', { className: 'screen' }, [
      canvas,
      touchLayer,
      el('div', { className: 'hud' }, [
        el('div', { className: 'tl' }, [hud.place, el('div', {}, [hud.lap, hud.time])]),
        hud.map,
        el('div', { className: 'slots' }, [hud.slots[1], hud.slots[0]]),
        hud.banner,
        hud.toast,
        el('button', { className: 'pause', text: 'II', onClick: togglePause }),
      ]),
      el('div', { className: 'pad' }, [btn.swap, btn.item, btn.drift]),
      btn.brake,
      el('button', { className: 'recentre', text: 'CENTRE', onClick: () => (controls.recentre(), toast('STEERING CENTRED')) }),
    ]),
  );
}

let pauseMenu: HTMLElement | null = null;
function togglePause(): void {
  if (mode !== 'race') return;
  paused = !paused;
  pauseMenu?.remove();
  pauseMenu = null;
  if (paused) {
    pauseMenu = el('div', { className: 'panel pausemenu' }, [
      el('h1', { text: 'PAUSED' }),
      sensitivityPanel(),
      el('div', { className: 'row' }, [el('button', { className: 'go', text: 'RESUME', onClick: togglePause }), el('button', { className: 'alt', text: 'QUIT', onClick: () => ((paused = false), titleScreen()) })]),
    ]);
    document.querySelector('.screen')?.appendChild(pauseMenu);
  } else say('GO!', 0.6);
}

function resultsScreen(): void {
  mode = 'results';
  sendChunk(true);
  const rows = standings(race).map((r) =>
    el('li', { className: r.kart.id === race.player ? 'me' : '' }, [
      el('span', { text: PLACE[r.kart.place - 1] ?? '' }),
      el('span', { text: TEAMS[r.kart.team]!.name + (r.kart.id === race.player ? ' (you)' : '') }),
      el('span', { text: `${r.estimated ? '~' : ''}${fmt(r.timeSec)}` }),
    ]),
  );
  const me = race.karts[race.player]!;
  render(
    el('div', { className: 'screen' }, [
      canvas,
      el('div', { className: 'panel results' }, [
        el('h1', { text: me.finished ? `${PLACE[me.place - 1]} place!` : 'Race over' }),
        el('p', { className: 'sub', text: `${TEAMS[me.team]!.name} | ${fmt(raceTimeSec(race, me))}` }),
        el('ol', {}, rows),
        el('div', { className: 'row' }, [el('button', { className: 'go', text: 'RACE AGAIN', onClick: startRace }), el('button', { className: 'alt', text: 'CHANGE CREW', onClick: titleScreen })]),
      ]),
    ]),
  );
}

// ---------- HUD ----------

function drawMap(rebuild = false): void {
  const c = hud.map;
  const size = 120;
  if (rebuild) {
    c.width = c.height = size * 2;
  }
  const g = c.getContext('2d');
  if (!g) return;
  const S = race.track.samples;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const s of S) {
    minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x); minZ = Math.min(minZ, s.z); maxZ = Math.max(maxZ, s.z);
  }
  const scale = (size * 2 - 24) / Math.max(maxX - minX, maxZ - minZ);
  const px = (x: number): number => 12 + (x - minX) * scale;
  const pz = (z: number): number => 12 + (z - minZ) * scale;
  g.clearRect(0, 0, c.width, c.height);
  g.lineCap = g.lineJoin = 'round';
  g.strokeStyle = 'rgba(0,0,0,0.45)';
  g.lineWidth = 12;
  g.beginPath();
  S.forEach((s, i) => (i ? g.lineTo(px(s.x), pz(s.z)) : g.moveTo(px(s.x), pz(s.z))));
  g.closePath();
  g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.lineWidth = 5;
  g.stroke();
  for (const k of [...race.karts].reverse()) {
    const me = k.id === race.player;
    g.fillStyle = `#${TEAMS[k.team]!.kart.toString(16).padStart(6, '0')}`;
    g.strokeStyle = me ? '#fff' : '#000';
    g.lineWidth = me ? 4 : 2;
    g.beginPath();
    g.arc(px(k.x), pz(k.z), me ? 9 : 6, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }
}

let rouletteFrame = 0;
function updateHud(): void {
  const me = race.karts[race.player]!;
  const now = performance.now();
  const countdown = race.goTick - race.tick;
  hud.place.textContent = PLACE[me.place - 1] ?? '';
  hud.place.className = `place p${me.place}`;
  hud.lap.textContent = `LAP ${lapOf(race, me)}/${race.rules.laps}`;
  hud.time.textContent = fmt(raceTimeSec(race, me));
  rouletteFrame++;
  for (let slot = 0; slot < 2; slot++) {
    const kind = me.items[slot] ?? null;
    const rolling = slot === 1 && me.roulette > 0;
    const show: ItemKind | null = rolling ? (['nitro', 'bouncer', 'seeker', 'slick'] as const)[Math.floor(rouletteFrame / 4) % 4]! : kind;
    const s = hud.slots[slot]!;
    s.className = `slot ${slot ? 'back' : 'front'} ${show ?? 'empty'}${rolling ? ' rolling' : ''}`;
    s.textContent = show ? ITEM_LABEL[show] : '';
    s.dataset.who = TEAMS[me.team]!.riders[(slot === 0) === !me.swapped ? 0 : 1].name;
  }
  if (countdown > 0) {
    const n = Math.ceil(countdown / race.rules.tickHz);
    hud.banner.textContent = String(n);
    hud.banner.classList.add('on');
    bannerUntil = now + 300;
  }
  if (me.wrongWay > 1) say('WRONG WAY!', 0.3);
  if (now > bannerUntil) hud.banner.classList.remove('on');
  if (now > toastUntil) hud.toast.classList.remove('on');
  btn.drift.classList.toggle(`t${me.tier}`, me.tier > 0);
  for (const t of [1, 2, 3]) if (t !== me.tier) btn.drift.classList.remove(`t${t}`);
  drawMap();
}

function handleEvents(): void {
  const me = race.player;
  for (const e of race.events) {
    if (e.type === 'go') {
      say('GO!', 0.8);
      if (!controls.tiltLive && !ATTRACT) toast('DRAG LEFT SIDE TO STEER');
      sound.tone(880, 0.5, 'square', 0.25);
    } else if ('kart' in e && e.kart !== me) {
      if (e.type === 'hit' && e.by === me) {
        toast('HIT!');
        sound.tone(660, 0.15, 'square', 0.2, 990);
      }
      continue;
    } else if (e.type === 'boost') {
      const label = { turbo: ['', 'MINI-TURBO', 'SUPER TURBO', 'ULTRA TURBO'][e.tier ?? 0] ?? 'TURBO', nitro: 'NITRO!', pad: 'BOOST', draft: 'SLIPSTREAM', rocket: 'ROCKET START!' }[e.why];
      if (e.why === 'rocket') say(label, 1);
      else toast(label);
      sound.noise(0.4, 0.25, 1400);
    } else if (e.type === 'hit') {
      toast('OUCH!');
      sound.tone(400, 0.5, 'sawtooth', 0.25, 80);
    } else if (e.type === 'pickup') sound.tone(520, 0.25, 'triangle', 0.2, 1040);
    else if (e.type === 'use') sound.tone(300, 0.12, 'square', 0.15, 600);
    else if (e.type === 'wall') sound.noise(0.12, 0.25 * e.force, 220);
    else if (e.type === 'spark') sound.tone([0, 900, 1200, 1500][e.tier] ?? 900, 0.1, 'sine', 0.15);
    else if (e.type === 'swap') {
      view?.onSwap(me);
      sound.tone(700, 0.12, 'triangle', 0.18, 500);
    } else if (e.type === 'stall') say('TOO EARLY!', 1);
    else if (e.type === 'lap') {
      say(e.lap === race.rules.laps ? 'FINAL LAP!' : `LAP ${e.lap}`, 1.3);
      sound.tone(990, 0.3, 'triangle', 0.2);
    } else if (e.type === 'finish') {
      say(`FINISH! ${PLACE[e.place - 1]}`, 2.5);
      sound.tone(523, 0.2, 'square', 0.2);
      setTimeout(() => sound.tone(784, 0.4, 'square', 0.2), 180);
    }
    if (e.type === 'swap') continue;
  }
  for (const e of race.events) if (e.type === 'swap' && e.kart !== me) view?.onSwap(e.kart);
  // Countdown beeps.
  const left = race.goTick - race.tick;
  if (left > 0 && left % race.rules.tickHz === 0) sound.tone(440, 0.2, 'square', 0.2);
}

// ---------- Loop ----------

const DT = 1 / race.rules.tickHz;
let acc = 0;
let last = performance.now();
let finishedAt = 0;
function frame(now: number): void {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!view) return;
  if (!paused) {
    acc += dt;
    while (acc >= DT) {
      acc -= DT;
      if (mode === 'race') {
        const input = race.over ? NO_INPUT : controls.read();
        const wasOver = race.over;
        step(race, input);
        if (!wasOver) {
          pushInput(runs[runs.length - 1]!, input);
          sendChunk(false);
        }
        handleEvents();
        if (race.over && !wasOver) finishedAt = now;
      } else {
        step(race);
        if (race.over) newRace(true);
      }
    }
  }
  if (mode === 'race') {
    updateHud();
    const me = race.karts[race.player]!;
    sound.engineAt(me.speed, me.boost > 0, !paused);
    if (race.over && now - finishedAt > 2500) {
      sound.engineAt(0, false, false);
      resultsScreen();
    }
  }
  view.render(paused ? 0 : dt);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden && mode === 'race' && !paused) togglePause();
});

titleScreen();
if (ATTRACT) startRace();
requestAnimationFrame(frame);
