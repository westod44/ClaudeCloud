// THE WOODS REMEMBER — authored constants.
// Values are taken from the Visual Production Bible (sections 03, 14, 15, 16).

export const PALETTE = {
  pine: 0x252d25,
  moss: 0x465044,
  wetBark: 0x42382e,
  leaves: 0x655643,
  overcast: 0x727774,
  slate: 0x414a55,
  fog: 0x8b918c,
  nearBlack: 0x151a18,
  fire: 0xc16d32,
  marker: 0xb49c52,
  rust: 0x713d36,
  violet: 0x353345,
  moonlight: 0xa0a5ac,
};

export const PLAYER = {
  eyeStand: 1.65,
  eyeCrouch: 1.05,
  heightStand: 1.8,
  heightCrouch: 1.15,
  radius: 0.3,
  walk: 2.3,
  sprint: 3.6,
  crouch: 1.2,
  minColdWalk: 2.0,
  stepUp: 0.55,
  stepDown: 0.9,
  interactRange: 1.8,
  defaultFov: 85,
  defaultBob: 0.012, // bible: no more than 0.015 m
};

export const SURVIVAL = {
  staminaMax: 100,
  sprintDrain: 8, // per second
  staminaRecoverDelay: 1.5,
  staminaRecover: 18, // per second
  coldMildMul: 0.85,
  coldSevereMul: 0.7,
  thirstMul: 0.85,

  warmthStart: 80,
  warmthLossAfternoon: 0.25, // per minute
  warmthLossDusk: 0.7,
  warmthLossNight: 1.2,
  warmthRidgeExtra: 0.5,
  warmthWetExtra: 0.5,
  warmthFloor: 10,
  shelterRestore: 6, // per minute
  fireRestore: 18, // per minute, to 90
  fireCap: 90,
  restWarmthMin: 70,

  wetAfterWater: 3, // seconds in creek water
  wetClearRefuge: 60, // seconds at shelter / fire

  hydrationStart: 80,
  hydrationLoss: 0.55, // per minute of active play
  hydrationFloor: 10,
  drinkMl: 250,
  drinkRestore: 30,
  bottleMax: 750,
  bottleStart: 500,

  snackWarmth: 15,
  snackStamina: 30,

  batteryDrain: 4, // per minute → 25 minutes per pack
  batterySwapTime: 2,
};

// Lighting states (bible section 14). Index: 0 afternoon, 1 dusk, 2 night, 3 dawn.
export const LIGHT_STATES = [
  { // afternoon — diffuse soft grey, 60-80 m useful distance, 15 m clear near field
    sky: 0x7d837f, fog: 0x8b918c, fogNear: 15, fogFar: 78,
    hemiSky: 0xb9beb8, hemiGround: 0x4a4034, hemi: 2.25,
  },
  { // dusk — grey-violet, 35-50 m distant, 10 m clear
    sky: 0x5a5866, fog: 0x5d5c69, fogNear: 10, fogFar: 48,
    hemiSky: 0x8a879a, hemiGround: 0x3a332e, hemi: 1.45,
  },
  { // night — cool slate, 18-30 m silhouettes, 5 m ground readability without flashlight
    sky: 0x1b2027, fog: 0x1f242b, fogNear: 4, fogFar: 30,
    hemiSky: 0x56627a, hemiGround: 0x1e2220, hemi: 0.95,
  },
  { // dawn — desaturated grey-green, restored 60 m depth, no golden celebration
    sky: 0x8f9a92, fog: 0x8f9a92, fogNear: 14, fogFar: 62,
    hemiSky: 0xb3bdb3, hemiGround: 0x48463c, hemi: 2.0,
  },
];

export const FLASHLIGHT = {
  color: 0xfff0d8,
  intensity: 2.7, // flat to ~12 m, fading by the 19 m cutoff: readable without white overexposure
  distance: 19,
  angle: (30 * Math.PI) / 180, // 60-degree outer cone
  penumbra: 0.42, // soft edge, ~42-degree inner cone
  decay: 0,
};

export const FIRELIGHT = { color: 0xff9a52, intensity: 14, distance: 6.5, decay: 1.6 };
export const STOVELIGHT = { color: 0xff8c48, intensity: 7, distance: 4.5, decay: 1.6 };

export const UI = {
  objectiveSeconds: 5,
};

export const TOPOLOGY_VERSION = 3;
export const SAVE_PREFIX = 'twr.save.';
export const SETTINGS_KEY = 'twr.settings';
export const ENDINGS_KEY = 'twr.endings';

export const DEFAULT_SETTINGS = {
  sensitivity: 1.0,
  invertY: false,
  fov: 85,
  subtitles: true,
  subtitleSize: 1.0,
  master: 0.85,
  ambience: 0.8,
  effects: 0.9,
  music: 0.6,
  headBob: true,
  worldRes: 360, // 360 | 540 | 0 (full)
  nearest: false, // restrained soft filtering by default
  uiScale: 1.0,
  brightness: 1.0,
  soundCaptions: false, // visual alternatives for sound clues
  centreDot: true,
  keys: {
    forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD',
    sprint: 'ShiftLeft', crouch: 'KeyC', interact: 'KeyE', flashlight: 'KeyF',
    backpack: 'Tab', map: 'KeyM', journal: 'KeyJ',
  },
};
