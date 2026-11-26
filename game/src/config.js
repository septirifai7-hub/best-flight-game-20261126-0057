// Sky Courier — tuning constants and mission definitions.
// One clear job: every number the flight model, the world and the
// missions share lives here, so balancing never touches game logic.
export const CONFIG = {
  // Flight model (units: metres, seconds, knots for display).
  minSpeed: 40,          // below this the wing stalls and the nose drops
  maxSpeed: 110,         // full throttle, level flight
  cruiseSpeed: 65,
  climbRate: 9,          // m/s at full power, level pitch
  sinkRate: 7,           // m/s gliding with throttle idle
  turnRate: 0.55,        // rad/s at full bank and cruise speed
  maxBank: 0.9,          // rad of visual bank
  maxPitch: 0.35,        // rad of visual pitch
  fuelCapacity: 100,
  fuelBurn: 1.6,         // %/s at full throttle
  fuelBurnIdle: 0.35,    // %/s at idle
  damageOnCrash: 100,
  damageHardLanding: 35,
  // World.
  groundLevel: 0,        // m; the valley floor
  startAltitude: 320,    // m
  runwayLength: 900,     // m of paved strip
  runwayWidth: 26,
  ringRadius: 26,        // m; fly through the glowing hoop
  ringScore: 100,
  ringCentreBonus: 50,   // extra for threading the middle
  // Rendering.
  focal: 900,            // px at 1280 wide; pinhole projection scale
  drawDistance: 2600,    // m; objects farther than this are not drawn
};

// Missions: three sorties with different goals. Each mission is a list
// of objectives the pilot works through in order.
export const MISSIONS = [
  {
    id: 'ring-run',
    name: 'Ring Run',
    tagline: 'Thread all 8 rings, then bring her home.',
    blurb: 'A dawn time-trial over Aurea Valley. Eight glowing rings mark the course — fly through each one, mind your fuel, and land on runway 09. Fast, clean flying pays: centre hits and a gentle touchdown earn the big points.',
    timeOfDay: 'dawn',
    rings: 8,
    fuel: 100,
    objectives: ['rings', 'land'],
  },
  {
    id: 'parcel-drop',
    name: 'Parcel Drop',
    tagline: 'Three parcels, three rooftops. Don’t miss.',
    blurb: 'The valley villages are waiting on medicine, mail and machine parts. Line up over each glowing drop zone and press SPACE to release. Accuracy is everything — then land on runway 09 before the fuel light comes on.',
    timeOfDay: 'morning',
    drops: 3,
    fuel: 100,
    objectives: ['drops', 'land'],
  },
  {
    id: 'dawn-landing',
    name: 'Last Light Landing',
    tagline: 'Low fuel. One runway. Make it count.',
    blurb: 'You took off late and the tanks are nearly dry. There is no fuel for a second try: line up on runway 09, keep the speed honest, flare late and kiss the tarmac. The gentler the touchdown, the higher the score.',
    timeOfDay: 'dusk',
    fuel: 38,
    objectives: ['land'],
  },
];

// Sky palettes per time of day: top, horizon, sun colour, ridge colours.
export const SKIES = {
  dawn:   { top: '#2b3a67', mid: '#7d6a9e', horizon: '#f7b267', sun: '#ffd9a0', sunX: 0.72, sunY: 0.30, far: '#6d5a8f', near: '#4c4368', ground: '#5d6b46' },
  morning:{ top: '#3f7ec2', mid: '#8ec3e8', horizon: '#dceefb', sun: '#fff3c4', sunX: 0.22, sunY: 0.16, far: '#7a94b8', near: '#4f6d54', ground: '#6d8148' },
  dusk:   { top: '#1d2440', mid: '#8a4a6b', horizon: '#ff9e5e', sun: '#ffcf8a', sunX: 0.28, sunY: 0.34, far: '#5d3f63', near: '#3d3350', ground: '#4c5238' },
};
