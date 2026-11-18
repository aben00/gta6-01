// SUNSET HEAT — Solmarina. Every tuning number, colour, stash and mission
// lives in this one file, so the rest of the game never hard-codes a value.
// The city is a 480 x 480 m grid: roads every 60 m, a beach and the sea on
// the south edge, a pier reaching into the water at the east end of the
// beach. All positions are metres, x east, z south (three.js: -z is north).

export const STEP = 1 / 60;
export const SAVE_KEY = 'sunset-heat.save.v1';

// --- city -----------------------------------------------------------------
export const CITY = {
  half: 240, // world runs -240 .. 240 on both axes
  roadEvery: 60, // road centre lines at -180, -120, -60, 0, 60, 120, 180
  roadWidth: 10,
  beachZ: 200, // sand starts here
  waterZ: 232, // sea starts here
  blockInset: 8, // buildings keep this far inside a block
  pierX: 150, // the wooden pier stands on this x, out into the sea
  pierZ0: 214, // deck starts just past the beach (mission 2 ends on the sand)
  pierZ1: 238,
  pierWidth: 7,
};

// --- player ---------------------------------------------------------------
export const PLAYER = {
  walkSpeed: 5.2,
  runSpeed: 9.5,
  radius: 0.55,
  accel: 42,
  health: 100,
  punchRange: 2.4,
  punchArc: 1.1, // radians either side of facing
  punchCooldown: 0.45,
  punchDamage: 34,
};

// --- cars -----------------------------------------------------------------
export const CAR = {
  length: 4.4,
  width: 2.0,
  radius: 2.4, // collision circle
  accel: 16, // m/s^2
  brake: 30,
  reverseAccel: 10,
  maxSpeed: 30, // ~108 km/h
  maxReverse: 9,
  steerMax: 0.55, // radians of front-wheel angle
  grip: 8.5, // how fast velocity aligns to heading
  drag: 0.35,
  enterRange: 4.2,
  taxiChance: 0.25, // share of traffic cars that are yellow taxis
};

// --- car damage -----------------------------------------------------------
// Hard hits bend the car: top speed falls, the exhaust smokes, and the
// safehouse garage (or any stop beside it) puts it right again.
export const DAMAGE = {
  crashSpeed: 8, // impacts faster than this add damage
  perCrash: 55, // damage added per m/s over the threshold, scaled (see world)
  ramAdd: 0.06, // damage from one police ram
  maxSpeedLoss: 0.45, // a wrecked car keeps this much of its top speed gone
  smokeAt: 0.3, // exhaust smoke starts at this damage
  repairRate: 0.3, // damage repaired per second at the safehouse
  repairRadius: 14, // metres from the safehouse door
};

// --- traffic --------------------------------------------------------------
export const TRAFFIC = {
  count: 12,
  speed: 9,
  speedJitter: 3,
  respawnDistance: 170,
};

// --- pedestrians ----------------------------------------------------------
export const PEDS = {
  count: 22,
  walkSpeed: 1.4,
  fleeSpeed: 4.2,
  radius: 0.5,
};

// --- police ---------------------------------------------------------------
export const COPS = {
  maxCars: 5,
  chaseSpeed: 24,
  ramDamage: 9,
  ramCooldown: 1.0,
  officerSpeed: 7.2,
  officerRange: 26, // spawn an officer this close to the player (on foot)
  bustSeconds: 1.6, // officer contact time that busts the player
  bustFine: 120,
  spawnDistance: 95,
};

// --- wanted ---------------------------------------------------------------
export const WANTED = {
  stealCar: 1,
  hitPedestrian: 1,
  punchPedestrian: 1,
  punchCop: 2,
  ramCopCar: 1,
  quietSeconds: 10, // no crime + no cop in sight this long before stars fall
  fallEvery: 5, // seconds per lost star while quiet
};

// --- horn -----------------------------------------------------------------
export const HORN = {
  range: 12, // pedestrians inside this cone ahead of the car scatter
  cone: 1.0, // radians either side of the car's facing
};

// --- street stashes -------------------------------------------------------
// Eight cash stashes hidden around Solmarina. Walk up to one on foot and
// press E to pocket it. They are fixed spots (not seeded), placed clear of
// the mission routes so a story run never trips over them by accident.
export const STASHES = [
  { x: 24, z: -24, amount: 50 }, // central plaza, by the palms
  { x: -170, z: 215, amount: 75 }, // far west beach
  { x: 170, z: 218, amount: 75 }, // far east beach
  { x: 158, z: 222, amount: 40 }, // beside the pier
  { x: -170, z: 130, amount: 50 }, // marina corner
  { x: 170, z: -170, amount: 60 }, // north-east corner
  { x: -170, z: -170, amount: 60 }, // north-west corner
  { x: -90, z: -150, amount: 50 }, // safehouse row
];
export const STASH_RANGE = 2.4; // how close on foot to grab one with E

// --- missions -------------------------------------------------------------
// Three story missions, in order. Each has a briefing (dialogue lines shown
// when it starts), an objective, a target point and a reward. Positions are
// [x, z] in world metres.
export const MISSIONS = [
  {
    id: 'first-wheels',
    name: '1 · First Wheels',
    contact: 'MARCO',
    briefing: [
      'MARCO: Solmarina, kid. The city runs on borrowed cars.',
      'MARCO: Grab any car — press E next to one — and bring it to the marina.',
      'MARCO: Do it clean and there is $250 in it for you.',
    ],
    stages: [
      { objective: 'Steal a car — walk up to one and press E', target: null },
      { objective: 'Drive to the marina marker', target: [-150, 150] },
    ],
    reward: 250,
  },
  {
    id: 'sunset-run',
    name: '2 · Sunset Run',
    contact: 'MARCO',
    briefing: [
      'MARCO: Nice wheels. Now earn them.',
      'MARCO: A package needs to reach the pier before the sun is gone. 90 seconds.',
      'MARCO: Cops are out tonight. Drive fast, drive smart.',
    ],
    stages: [
      { objective: 'Deliver the package to the pier', target: [150, 210], timer: 90 },
    ],
    reward: 400,
  },
  {
    id: 'heat-escape',
    name: '3 · Heat Escape',
    contact: 'MARCO',
    briefing: [
      'MARCO: They made you. Three stars, and every cruiser in Solmarina is coming.',
      'MARCO: Lose the heat — get your wanted level to zero — then reach the safehouse.',
      'MARCO: Pull this off and the $750 is yours. Stay free, kid.',
    ],
    stages: [
      { objective: 'Lose the heat — wanted level to zero', target: null, forceWanted: 3 },
      { objective: 'Reach the safehouse', target: [-30, -150] },
    ],
    reward: 750,
  },
];

export const START_MONEY = 50;
export const SAFEHOUSE = [-30, -150];

// --- palette (sunset) -----------------------------------------------------
export const PALETTE = {
  skyTop: 0x2b1440,
  skyHorizon: 0xff7e4a,
  fog: 0x453050,
  sun: 0xffb36b,
  sunCore: 0xffd9a0,
  hemiSky: 0x9a6aa8,
  hemiGround: 0x33241f,
  dirLight: 0xffb36b,
  road: 0x2c2c34,
  roadLine: 0xd8b13c,
  sidewalk: 0x55555e,
  block: 0x3a3a44,
  sand: 0xc9a06a,
  sea: 0x14486b,
  seaDeep: 0x0d3049,
  buildingBase: 0x8a7a72,
  windowLit: 0xffc46b,
  windowDark: 0x2a2438,
  palmTrunk: 0x6b4a2f,
  palmLeaf: 0x2f7a3d,
  lampGlow: 0xffe9a8,
  beacon: 0xffd23c,
  copBlue: 0x2244cc,
  copRed: 0xdd2222,
  stashGold: 0xffd23c,
  pierWood: 0x8a6a45,
  boatHull: 0xe8e4da,
  boatTrim: 0x2e6ec2,
  taxiYellow: 0xe8b820,
  smoke: 0x8a8a92,
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
