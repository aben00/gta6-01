// Sunset Heat — every tuning number, place and payout in one place.
// The city is a street grid on the coast of Solmarina: x runs east, z runs
// north toward the beach and the sea. Streets sit on multiples of 60 m;
// the blocks between them hold the buildings. All speeds are m/s unless
// a name says km/h, and all money is in dollars.

export const SAVE_KEY = 'sunset-heat.save.v1';

/** The playable rectangle: x in [-280, 280], z in [-280, 340]. */
export const WORLD = { minX: -280, maxX: 280, minZ: -280, maxZ: 340 };
/** Streets are laid out on this spacing; intersections are multiples of it. */
export const STREET_STEP = 60;
export const STREET_HALF = 6;
/** North of this line the sand starts; past SEA_Z the water starts. */
export const BEACH_Z = 240;
export const SEA_Z = 282;

/** Fixed step the simulation advances in, whatever the display rate. */
export const STEP = 1 / 60;

export const SPAWN = { x: 0, z: -6, yaw: 0 };

export const WALK = { speed: 4.6, runSpeed: 7.6, radius: 0.55 };
export const CAR = {
  topKmh: 108,
  topSpeed: 30,
  accelRate: 1.15,
  brake: 26,
  reverseSpeed: 6,
  steerRate: 1.9,
  radius: 1.7,
  /** How much of the top speed damage eats: top * (1 - 0.45 * dmg). */
  damageLoss: 0.45,
  smokeFrom: 0.35,
  repairRate: 0.3,
  repairRadius: 14,
};

export const TRAFFIC = { count: 14, cruise: 9.5, turnChance: 0.4, taxiChance: 0.25 };
export const PARKED = { count: 8 };
export const PEDS = { count: 18, walkMin: 1.1, walkMax: 1.9, fleeSpeed: 4.2, downSeconds: 6 };
export const COPS = { maxCruisers: 4, cruise: 14, ramDamage: 0.12, spawnDistance: 46 };
export const OFFICERS = { runSpeed: 5.3, grabSeconds: 1.2, spawnDistance: 30 };

/** A star of wanted fades after this long with no fresh crime. */
export const WANTED_DECAY_SECONDS = 20;
export const MAX_WANTED = 5;
export const BUST_FINE = 120;

/** Where the story happens. */
export const MARINA = { x: -150, z: 150 };
export const PIER = { x: 150, z: 210 };
export const SAFEHOUSE = { x: -30, z: -150 };
/** How close the player must be to count as "there". */
export const MARKER_RADIUS = 8;

/** The three jobs, in order. A job is done when its stage list runs out. */
export const MISSIONS = [
  {
    name: 'First Wheels',
    reward: 250,
    stages: [
      'Steal a car — walk up to one and press E',
      'Drive to the marina marker',
    ],
  },
  {
    name: 'Sunset Run',
    reward: 400,
    timeLimit: 90,
    stages: ['Deliver the package to the pier'],
  },
  {
    name: 'Heat Off',
    reward: 750,
    stages: ['Lose the heat — stay out of sight', 'Get to the safehouse'],
  },
];

/** Eight hidden cash stashes. Values are dollars; spots never move. */
export const STASHES = [
  { x: 24, z: -22, value: 50 },
  { x: -90, z: 60, value: 40 },
  { x: 120, z: -90, value: 75 },
  { x: -180, z: -60, value: 60 },
  { x: 60, z: 180, value: 45 },
  { x: -40, z: 210, value: 70 },
  { x: 210, z: 30, value: 55 },
  { x: 0, z: -210, value: 65 },
];

export const START_MONEY = 50;

export const DIALOGUE = {
  intro: 'MARCO: Solmarina, kid. The city runs on borrowed cars.',
  marina: 'MARCO: Package is in the trunk. Pier, before the sun drops.',
  setup: 'MARCO: It was a setup. Lose the heat, then get home.',
  done: 'MARCO: That is the whole story, kid. Solmarina is yours.',
};

export const PALETTE = {
  sky: 0x2a1846,
  fog: 0x2a1846,
  sun: 0xffe9b0,
  sunLight: 0xff9a5c,
  hemiSky: 0x8a6bbf,
  hemiGround: 0x2a1f1a,
  sea: 0x16324a,
  sand: 0xc9a06a,
  asphalt: 0x23202a,
  gold: 0xffc93c,
  safehouse: 0x2fae5f,
  playerArrow: 0x3fa7ff,
  hudPanel: 'rgba(12, 10, 24, 0.72)',
  hudGold: '#ffd166',
  hudGreen: '#7ee787',
  hudRed: '#ff6b6b',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** Renderer quality rungs: pixel ratio per rung, lowest first. */
export const QUALITY = [
  { pixelRatio: 0.66, label: 'low' },
  { pixelRatio: 0.85, label: 'medium' },
  { pixelRatio: 1, label: 'high' },
];
/** Frames averaged before the auto-quality rung moves. */
export const QUALITY_WINDOW = 90;
