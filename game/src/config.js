// Sunset Heat — every tuning number, place and payout in one place.
//
// Solmarina is a street grid on the coast: x runs east, z runs north
// toward the beach and the sea. Streets sit on multiples of 60 m; the
// blocks between them hold the buildings. Speeds are m/s unless a name
// says km/h, money is dollars, and a heading of 0 faces north (+z) with
// forward = (sin(yaw), cos(yaw)).

/** Fixed step the simulation advances in, whatever the display rate. */
export const STEP = 1 / 60;
/** Seed used when the page carries no ?seed= value. */
export const DEFAULT_SEED = 7;
/** localStorage key for the save. */
export const SAVE_KEY = 'sunset-heat.save.v1';

/** The playable rectangle and the shoreline. */
export const ISLAND = {
  west: -280,
  east: 280,
  south: -280,
  north: 340,
  /** Sand starts north of this line; water starts past waterAt. */
  sandAt: 240,
  waterAt: 282,
};

/** Streets: spacing, half-width, and the range their lines cover. */
export const STREETS = {
  every: 60,
  halfWidth: 6,
  from: -240,
  to: 240,
};

/** Where the player wakes up, on the street outside the safehouse. */
export const SPAWN = { x: 0, z: -6, yaw: 0 };

/** On-foot movement. */
export const ON_FOOT = {
  walk: 4.6,
  run: 7.6,
  radius: 0.55,
};

/** Cars: arcade handling, damage and the safehouse repair. */
export const DRIVING = {
  topKmh: 108,
  topSpeed: 30,
  /** Exponential approach to the top speed, per second. */
  accelRate: 1.15,
  brake: 26,
  reverseSpeed: 6,
  steerRate: 1.9,
  radius: 1.7,
  /** How much of the top speed damage eats: top * (1 - 0.45 * dmg). */
  damageLoss: 0.45,
  /** Exhaust smoke starts past this damage. */
  smokeFrom: 0.35,
  repairRate: 0.3,
  repairRadius: 14,
};

/** Traffic and pedestrians: counts, speeds, colours are drawn from the seed. */
export const CROWD = {
  trafficCars: 14,
  trafficCruise: 9.5,
  turnChance: 0.4,
  taxiChance: 0.25,
  parkedCars: 8,
  peds: 18,
  pedWalkMin: 1.1,
  pedWalkMax: 1.9,
  pedFlee: 4.2,
  pedDownSeconds: 6,
};

/** Police: cruiser and officer numbers and behaviour. */
export const POLICE = {
  maxCruisers: 4,
  cruiserSpeed: 14,
  ramDamage: 0.12,
  cruiserSpawn: 46,
  officerRun: 5.3,
  grabSeconds: 1.2,
  officerSpawn: 30,
};

/** Wanted: five stars at most, one fading per quiet stretch. */
export const HEAT = {
  maxStars: 5,
  decaySeconds: 20,
  bustFine: 120,
};

/** Where the story happens, and how close counts as "there". */
export const PLACES = {
  marina: { x: -150, z: 150 },
  pier: { x: 150, z: 210 },
  safehouse: { x: -30, z: -150 },
  markerRadius: 8,
};

/** The three jobs, in order. A job is done when its stages run out. */
export const JOBS = [
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
export const HIDDEN_CASH = [
  { x: 24, z: -22, value: 50 },
  { x: -90, z: 60, value: 40 },
  { x: 120, z: -90, value: 75 },
  { x: -180, z: -60, value: 60 },
  { x: 60, z: 180, value: 45 },
  { x: -40, z: 210, value: 70 },
  { x: 210, z: 30, value: 55 },
  { x: 0, z: -210, value: 65 },
];

/** Starting cash. */
export const START_MONEY = 50;

/** Marco's lines, one per story beat. */
export const LINES = {
  intro: 'MARCO: Solmarina, kid. The city runs on borrowed cars.',
  marina: 'MARCO: Package is in the trunk. Pier, before the sun drops.',
  setup: 'MARCO: It was a setup. Lose the heat, then get home.',
  done: 'MARCO: That is the whole story, kid. Solmarina is yours.',
};

/** Dusk palette: sky, fog, sea, sand, asphalt, accents. */
export const COLORS = {
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

/** System font stack, used by the HUD and the minimap. */
export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** Renderer quality rungs: pixel ratio per rung, lowest first. */
export const QUALITY_RUNGS = [
  { pixelRatio: 0.66, label: 'low' },
  { pixelRatio: 0.85, label: 'medium' },
  { pixelRatio: 1, label: 'high' },
];
/** Frames averaged before the auto-quality rung moves. */
export const QUALITY_WINDOW = 90;
