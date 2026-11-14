// Plumbing and drainage layout for the home, kept apart from the house model.
// Nothing here changes the house: it only describes pipes, chambers and tanks
// that the Plumbing & Drainage view draws over it.
//
// Coordinates are the plan's: x east, z south, metres, origin at the house's
// north-west outer corner. Heights are relative to finished floor level (0);
// the yard is about 0.03 m below it. An "invert" is the inside bottom of a pipe.
//
// Basis: common Indian practice (National Building Code Part 9, IS 1742 for
// building drainage, IS 2470 for septic tanks, IS 2065 for water supply).
// It is a design-intent layout for visualisation, not an approved drawing.

export const LAYERS = {
  fresh: { name: 'Fresh water', color: 0x1e6fe0, note: '15–32 mm' },
  sewage: { name: 'Toilet sewage', color: 0xd7332a, note: '110 mm · 1 in 60' },
  waste: { name: 'Wastewater', color: 0xf08a1c, note: '75 mm · 1 in 40' },
  rain: { name: 'Rainwater', color: 0x2f9e4a, note: '110–160 mm · 1 in 100' },
  vent: { name: 'Vent pipes', color: 0x8e44ad, note: '75 mm' },
};
export const HOT = 0x63b7ff; // hot water: a lighter blue within the fresh-water system

export const VIEWS = {
  water: ['fresh'],
  drainage: ['sewage', 'waste', 'rain', 'vent'],
};

const GROUND = -0.03;
const ROOF = 3.12;

const runs = [];
const chambers = [];
const structures = [];
const labels = [];

const r3 = (n) => Math.round(n * 1000) / 1000;
const hyp = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/**
 * A buried pipe laid to a steady fall. pts are [x, z]; the invert starts at
 * inv0 and drops 1 in `grade` along the route. Returns the invert at the end.
 */
function fall(o, inv0, grade, pts) {
  const rad = o.dia / 2000;
  let inv = inv0;
  const points = [[pts[0][0], inv + rad, pts[0][1]]];
  let length = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = hyp(pts[i - 1], pts[i]);
    length += d;
    inv -= d / grade;
    points.push([pts[i][0], inv + rad, pts[i][1]]);
  }
  runs.push({ ...o, grade, points, length: r3(length), invStart: r3(inv0), invEnd: r3(inv) });
  return inv;
}

/** A pipe given point by point as [x, y, z] (risers, drops, pressure pipes). */
function pipe(o, points) {
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    length += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1], points[i][2] - points[i - 1][2]);
  }
  runs.push({ ...o, points, length: r3(length) });
}

function chamber(o) {
  chambers.push(o);
  labels.push({ text: o.id, layer: o.layer, at: [o.x, 0.28, o.z] });
  return o;
}

const SWR = 'uPVC soil-and-waste pipe (SWR)';
const UPVC = 'uPVC pressure pipe';
const CPVC = 'CPVC pipe';

// ===================================================================== sewage and wastewater

// --- inspection chambers (IC) and traps on the west side, outside both bathrooms
const IC1 = chamber({ id: 'IC-1', kind: 'ic', layer: 'sewage', x: -0.75, z: 5.1, size: 0.45, invert: -0.5, name: 'Inspection chamber IC-1', purpose: 'Collects both toilets and both bathroom gully traps. First access point for rodding.', to: 'IC-2' });
const GT1 = chamber({ id: 'GT-1', kind: 'gully', layer: 'waste', x: -0.55, z: 4.0, size: 0.3, invert: -0.42, name: 'Gully trap GT-1', purpose: 'Water-sealed trap for Toilet 1 (second bedroom side) basin and floor drain. Keeps sewer gas out of the bathroom.', to: 'IC-1' });
const GT2 = chamber({ id: 'GT-2', kind: 'gully', layer: 'waste', x: -0.55, z: 6.3, size: 0.3, invert: -0.42, name: 'Gully trap GT-2', purpose: 'Water-sealed trap for Toilet 2 (master bathroom) basin and floor drain.', to: 'IC-1' });
const IC2 = chamber({ id: 'IC-2', kind: 'ic', layer: 'sewage', x: -0.75, z: -2.75, size: 0.45, invert: -0.63, name: 'Inspection chamber IC-2', purpose: 'Change of direction at the north-west corner.', to: 'IC-7' });

// --- east and south side: kitchen, wash area, utility
const GTU = chamber({ id: 'GT-U', kind: 'gully', layer: 'waste', x: 7.75, z: 11.15, size: 0.3, invert: -0.5, name: 'Utility / washing area gully', purpose: 'Outdoor point for a washing machine and clothes washing, outside the kitchen on the south side.', to: 'IC-3' });
const IC3 = chamber({ id: 'IC-3', kind: 'ic', layer: 'sewage', x: 9.0, z: 11.15, size: 0.45, invert: -0.6, name: 'Inspection chamber IC-3', purpose: 'Head of the east drain. Takes the utility / washing area.', to: 'IC-4' });
const GTW = chamber({ id: 'GT-W', kind: 'gully', layer: 'waste', x: 8.6, z: 9.5, size: 0.3, invert: -0.3, name: 'Kitchen wash area gully', purpose: 'Outdoor vessel-washing point beside the kitchen. Drains through the grease trap.', to: 'Grease trap' });
const GRT = chamber({ id: 'Grease trap', kind: 'grease', layer: 'waste', x: 8.6, z: 8.5, size: 0.6, invert: -0.5, name: 'Kitchen grease trap', purpose: 'Holds back oil and food solids from the kitchen sink and wash area before the water reaches the septic tank. Lift-off cover; clean monthly.', to: 'IC-4' });
const IC4 = chamber({ id: 'IC-4', kind: 'ic', layer: 'sewage', x: 9.0, z: 7.6, size: 0.45, invert: -0.67, name: 'Inspection chamber IC-4', purpose: 'Takes the grease trap outlet into the east drain.', to: 'IC-5' });
const IC5 = chamber({ id: 'IC-5', kind: 'ic', layer: 'sewage', x: 9.0, z: -2.75, size: 0.6, invert: -0.85, name: 'Inspection chamber IC-5', purpose: 'Change of direction at the north-east corner.', to: 'IC-7' });
const IC7 = chamber({ id: 'IC-7', kind: 'ic', layer: 'sewage', x: 4.7, z: -2.75, size: 0.6, invert: -0.93, name: 'Inspection chamber IC-7', purpose: 'Last chamber: the west and east drains meet here before the septic tank.', to: 'Septic tank' });

// --- toilets: dedicated 110 mm soil pipes
fall({ id: 'soil-t2', layer: 'sewage', name: 'Toilet 2 (master bathroom) WC', purpose: 'Carries the master bathroom toilet straight to the inspection chamber.', dia: 110, material: SWR, from: 'Toilet 2 WC', to: 'IC-1' }, -0.4, 60, [[1.31, 5.48], [IC1.x, IC1.z]]);
fall({ id: 'soil-t1', layer: 'sewage', name: 'Toilet 1 (second bedroom side) WC', purpose: 'Carries the Toilet 1 toilet straight to the inspection chamber.', dia: 110, material: SWR, from: 'Toilet 1 WC', to: 'IC-1' }, -0.4, 60, [[1.27, 4.73], [IC1.x, IC1.z]]);

// --- bathroom basins and floor drains: 75 mm waste to a gully trap
fall({ id: 'waste-t1-basin', layer: 'waste', name: 'Toilet 1 washbasin waste', purpose: 'Basin waste under the floor to gully trap GT-1.', dia: 75, material: SWR, from: 'Toilet 1 basin', to: 'GT-1' }, -0.3, 40, [[1.87, 4.82], [GT1.x, GT1.z]]);
fall({ id: 'waste-t1-floor', layer: 'waste', name: 'Toilet 1 floor drain', purpose: 'Shower-end floor drain to gully trap GT-1.', dia: 75, material: SWR, from: 'Toilet 1 floor drain', to: 'GT-1' }, -0.3, 40, [[0.4, 4.6], [GT1.x, GT1.z]]);
fall({ id: 'waste-t2-basin', layer: 'waste', name: 'Toilet 2 (master) washbasin waste', purpose: 'Basin waste under the floor to gully trap GT-2.', dia: 75, material: SWR, from: 'Toilet 2 basin', to: 'GT-2' }, -0.3, 40, [[1.85, 5.35], [GT2.x, GT2.z]]);
fall({ id: 'waste-t2-floor', layer: 'waste', name: 'Toilet 2 (master) floor drain', purpose: 'Shower-end floor drain to gully trap GT-2.', dia: 75, material: SWR, from: 'Toilet 2 floor drain', to: 'GT-2' }, -0.3, 40, [[0.4, 6.3], [GT2.x, GT2.z]]);
fall({ id: 'gt1-ic1', layer: 'waste', name: 'GT-1 outlet', purpose: 'Trapped wastewater from Toilet 1 into the inspection chamber.', dia: 110, material: SWR, from: 'GT-1', to: 'IC-1' }, GT1.invert, 60, [[GT1.x, GT1.z], [IC1.x, IC1.z]]);
fall({ id: 'gt2-ic1', layer: 'waste', name: 'GT-2 outlet', purpose: 'Trapped wastewater from Toilet 2 into the inspection chamber.', dia: 110, material: SWR, from: 'GT-2', to: 'IC-1' }, GT2.invert, 60, [[GT2.x, GT2.z], [IC1.x, IC1.z]]);

// --- kitchen sink, wash area, utility
pipe({ id: 'waste-sink-drop', layer: 'waste', name: 'Kitchen sink waste', purpose: 'Sink waste through the east wall and down to the grease trap.', dia: 75, material: SWR, from: 'Kitchen sink', to: 'Grease trap' }, [[7.55, 0.6, 8.2], [8.22, 0.55, 8.2], [8.22, -0.3, 8.2], [8.42, -0.31, 8.35]]);
fall({ id: 'waste-wash', layer: 'waste', name: 'Kitchen wash area waste', purpose: 'Wash area gully to the grease trap.', dia: 75, material: SWR, from: 'GT-W', to: 'Grease trap' }, GTW.invert, 40, [[GTW.x, GTW.z], [GRT.x, GRT.z + 0.25]]);
fall({ id: 'grease-ic4', layer: 'waste', name: 'Grease trap outlet', purpose: 'Kitchen wastewater, after the grease trap, into the east drain.', dia: 110, material: SWR, from: 'Grease trap', to: 'IC-4' }, GRT.invert, 60, [[GRT.x, GRT.z], [IC4.x, IC4.z]]);
fall({ id: 'waste-utility', layer: 'waste', name: 'Utility / washing area waste', purpose: 'Washing machine and clothes-washing water to the east drain.', dia: 110, material: SWR, from: 'GT-U', to: 'IC-3' }, GTU.invert, 60, [[GTU.x, GTU.z], [IC3.x, IC3.z]]);

// --- drains between chambers, falling to the septic tank
const sewer = { layer: 'sewage', dia: 110, material: SWR };
fall({ ...sewer, id: 'sewer-1-2', name: 'West drain IC-1 to IC-2', purpose: 'Both bathrooms, along the west side of the house.', from: 'IC-1', to: 'IC-2' }, IC1.invert, 60, [[IC1.x, IC1.z], [IC2.x, IC2.z]]);
fall({ ...sewer, id: 'sewer-2-7', name: 'North drain IC-2 to IC-7', purpose: 'Both bathrooms, across the north yard to the last chamber.', from: 'IC-2', to: 'IC-7' }, IC2.invert, 60, [[IC2.x, IC2.z], [IC7.x, IC7.z]]);
fall({ ...sewer, id: 'sewer-3-4', name: 'East drain IC-3 to IC-4', purpose: 'Utility / washing area, along the east side.', from: 'IC-3', to: 'IC-4' }, IC3.invert, 60, [[IC3.x, IC3.z], [IC4.x, IC4.z]]);
fall({ ...sewer, id: 'sewer-4-5', name: 'East drain IC-4 to IC-5', purpose: 'Kitchen and utility wastewater, along the east side.', from: 'IC-4', to: 'IC-5' }, IC4.invert, 60, [[IC4.x, IC4.z], [IC5.x, IC5.z]]);
fall({ ...sewer, id: 'sewer-5-7', name: 'North drain IC-5 to IC-7', purpose: 'Kitchen and utility wastewater, across the north yard.', from: 'IC-5', to: 'IC-7' }, IC5.invert, 60, [[IC5.x, IC5.z], [IC7.x, IC7.z]]);

// --- septic tank (IS 2470 Part 1: 2.0 x 0.9 m, 1.0 m of liquid, two compartments 2:1)
// It stands in the north-west of the north yard, lying east-west: sewage enters at
// the east end and settled water leaves at the west end. There is no soak pit on the
// plot; the outlet stops at a chamber by the west boundary for a sewer connection.
const tank = {
  x0: 0.37, x1: 2.83, z0: -5.88, z1: -4.52, wall: 0.23, // outside faces
  inlet: [2.83, -5.2], outlet: [0.37, -5.2],
};
export const TANK_MID = [(tank.x0 + tank.x1) / 2, (tank.z0 + tank.z1) / 2];
const tankInlet = fall({ ...sewer, id: 'sewer-7-tank', name: 'Septic tank inlet', purpose: 'All sewage and wastewater enters the tank here through a dip tee.', from: 'IC-7', to: 'Septic tank' }, IC7.invert, 60, [[IC7.x, IC7.z], tank.inlet]);
tank.inletInv = tankInlet;
tank.liquid = r3(tankInlet - 0.075); // outlet invert sits 75 mm below the inlet
tank.floor = r3(tank.liquid - 1.0);
structures.push({
  id: 'Septic tank', kind: 'septic', layer: 'sewage', ...tank,
  name: 'Septic tank',
  purpose: 'Two-compartment tank. Solids settle and digest in the first compartment; clearer water passes the baffle wall to the second and out through the outlet chamber.',
  details: [
    ['Inside size', '2.0 m long × 0.9 m wide'],
    ['Liquid depth', '1.0 m (about 1,800 litres)'],
    ['Compartments', 'Two, split 2 : 1 by a baffle wall with a submerged opening'],
    ['Inlet / outlet', '110 mm dip tees; outlet 75 mm below inlet'],
    ['Access', 'Two cover slabs at ground level, one per compartment'],
    ['Vent', '75 mm, taken up the north wall to 2 m above the roof'],
    ['Cleaning', 'Desludge about every 2 years; reachable by hose from the west road'],
    ['Position', 'North-west of the north yard: 4.5 m from the house, 0.5 m inside the north boundary'],
    ['Sizing basis', 'IS 2470 Part 1, up to about 10 users'],
  ],
});
labels.push({ text: 'Septic tank', layer: 'sewage', at: [TANK_MID[0], 0.4, TANK_MID[1]] });

const OUT = chamber({ id: 'Outlet', kind: 'ic', layer: 'sewage', x: -0.6, z: -5.2, size: 0.45, invert: r3(tank.liquid - 0.02), name: 'Outlet chamber', purpose: 'Last chamber on the plot, by the west boundary. The settled water from the septic tank needs an approved place to go from here: there is no soak pit, so this is where a public sewer connection (or another approved disposal) must be made.', to: 'Public sewer or other approved disposal (to be confirmed)' });
fall({ ...sewer, id: 'tank-out', name: 'Septic tank outlet', purpose: 'Settled water from the second compartment to the outlet chamber.', from: 'Septic tank', to: 'Outlet' }, tank.liquid, 60, [tank.outlet, [OUT.x, OUT.z]]);
fall({ ...sewer, id: 'out-boundary', name: 'Outlet to the boundary', purpose: 'Stub to the west boundary for the connection to a public sewer or other approved disposal. Its destination is not decided yet.', from: 'Outlet', to: 'Public sewer or other approved disposal (to be confirmed)' }, OUT.invert, 60, [[OUT.x, OUT.z], [-1.45, -5.2]]);

// --- fixture tags
for (const [text, layer, x, y, z] of [
  ['WC', 'sewage', 1.31, 0.75, 5.48],
  ['WC', 'sewage', 1.27, 0.75, 4.73],
  ['Basin', 'waste', 1.87, 1.05, 4.82],
  ['Basin', 'waste', 1.85, 1.05, 5.35],
  ['Floor drain', 'waste', 0.4, 0.2, 4.6],
  ['Floor drain', 'waste', 0.4, 0.2, 6.3],
  ['Kitchen sink', 'waste', 7.55, 1.15, 8.2],
]) labels.push({ text, layer, at: [x, y, z], small: true });

// ===================================================================== vents

pipe({ id: 'vent-soil', layer: 'vent', name: 'Soil vent pipe', purpose: 'Lets sewer gas out above the roof and stops the toilets’ water seals being sucked out. Fresh air only; no water flows in it.', dia: 75, material: SWR, from: 'Head of the drain at IC-1', to: 'Open air, 0.9 m above the roof' }, [[IC1.x + 0.3, -0.4, 5.09], [-0.1, -0.4, 5.09], [-0.1, ROOF + 0.9, 5.09]]);
pipe({ id: 'vent-septic', layer: 'vent', name: 'Septic tank vent pipe', purpose: 'Releases gas from the septic tank well above head height and away from windows.', dia: 75, material: SWR, from: 'Septic tank', to: 'Open air, 2 m above the roof' }, [[2.7, -0.14, -4.6], [4.0, -0.14, -4.0], [4.0, -0.14, -0.1], [4.0, ROOF + 2.0, -0.1]]);

// ===================================================================== rainwater (never joins the sewage system)

const RW = (id, x, z, invert, purpose, to) => chamber({ id, kind: 'rain', layer: 'rain', x, z, size: 0.45, invert, name: `Rainwater chamber ${id}`, purpose, to });
const RW1 = RW('RW-1', -0.45, 11.65, -0.3, 'Foot of the south-west downpipe.', 'RW-2');
const RW2 = RW('RW-2', 8.5, 11.65, -0.39, 'Foot of the south-east downpipe.', 'RW-3');
const RW5 = RW('RW-5', 3.5, -2.2, -0.4, 'Foot of the north downpipe by the staircase.', 'RW-6');
const RW6 = RW('RW-6', 7.9, -2.2, -0.45, 'Foot of the north-east downpipe.', 'RW-7');
const RW7 = RW('RW-7', 10.0, -2.2, -0.47, 'North-east corner, turn south. The line passes above the sewer here; they do not connect.', 'RW-4');
const RW4 = RW('RW-4', 10.0, 4.2, -0.54, 'Chamber part-way down the east rainwater line.', 'RW-3');
const RW3 = RW('RW-3', 10.0, 11.65, -0.62, 'By the walk gate on the south side: the south and east rainwater lines meet here and leave the plot.', 'Roadside storm drain');
for (const [id, x, z, text] of [['YG-1', 10.0, 8.0, 'East yard'], ['YG-2', 10.0, 0.6, 'Outside the Hall east door'], ['YG-3', 5.7, -2.2, 'North yard']]) {
  chamber({ id, kind: 'yard', layer: 'rain', x, z, size: 0.3, invert: -0.45, name: `Yard gully ${id}`, purpose: `${text}: grated surface-water inlet. Paving and ground fall toward it at about 1 in 100.`, to: 'Rainwater line' });
}

const rainPipe = { layer: 'rain', dia: 110, material: 'uPVC rainwater pipe' };
for (const [id, where, x, z, c] of [
  ['dp-sw', 'south-west', -0.07, 10.5, RW1],
  ['dp-se', 'south-east', 8.15, 10.5, RW2],
  ['dp-n1', 'north (by the staircase)', 3.5, -0.07, RW5],
  ['dp-n2', 'north-east', 7.9, -0.07, RW6],
]) {
  pipe({ ...rainPipe, id, name: `Roof downpipe, ${where}`, purpose: 'Takes rain from a roof outlet down the outside wall to a rainwater chamber.', from: 'Roof outlet', to: c.id }, [[x, ROOF + 0.02, z], [x, -0.22, z], [c.x, c.invert + 0.055, c.z]]);
  labels.push({ text: 'Roof outlet', layer: 'rain', at: [x, ROOF + 0.3, z], small: true });
}
const rainRun = (id, name, a, b, dia = 110) => fall({ ...rainPipe, dia, id, name, purpose: 'Underground rainwater line, separate from all sewage and wastewater pipes.', from: a.id, to: b.id }, a.invert, 100, [[a.x, a.z], [b.x, b.z]]);
rainRun('rain-1-2', 'South rainwater line RW-1 to RW-2', RW1, RW2);
rainRun('rain-2-3', 'South rainwater line RW-2 to RW-3', RW2, RW3);
rainRun('rain-5-6', 'North rainwater line RW-5 to RW-6', RW5, RW6);
rainRun('rain-6-7', 'North rainwater line RW-6 to RW-7', RW6, RW7);
rainRun('rain-7-4', 'East rainwater line RW-7 to RW-4', RW7, RW4);
rainRun('rain-4-3', 'East rainwater line RW-4 to RW-3', RW4, RW3, 160);
// There is no recharge pit: all roof and yard rainwater leaves to the roadside storm drain.
fall({ ...rainPipe, dia: 160, id: 'rain-out', name: 'Rainwater outlet', purpose: 'All roof and yard rainwater leaves the plot here to the roadside storm drain on the main road. It never joins the sewage pipes.', from: 'RW-3', to: 'Roadside storm drain' }, RW3.invert, 100, [[RW3.x, RW3.z], [10.0, 12.35]]);
labels.push({ text: 'To storm drain', layer: 'rain', at: [10.0, 0.2, 12.35], small: true });

// Roof edge, roof outlets and the direction rain runs on the roof and yard.
// Edge of the roof slab: 6 ft beyond the walls on the north and east, 3 ft on the south
// and west, starting east of the outside staircase on the north side.
export const roofOutline = {
  y: ROOF,
  points: [[3.3, -1.8288], [9.906, -1.8288], [9.906, 11.5824], [-0.9144, 11.5824], [-0.9144, 0], [3.3, 0], [3.3, -1.8288]],
};
export const surfaceFlows = [
  // on the roof: toward the four outlets
  { from: [2.0, ROOF + 0.03, 8.4], to: [0.4, ROOF + 0.03, 10.2] },
  { from: [6.0, ROOF + 0.03, 8.4], to: [7.7, ROOF + 0.03, 10.2] },
  { from: [2.6, ROOF + 0.03, 2.2], to: [3.4, ROOF + 0.03, 0.4] },
  { from: [6.4, ROOF + 0.03, 2.2], to: [7.7, ROOF + 0.03, 0.4] },
  // on the ground: away from the walls, toward the yard gullies
  { from: [8.4, GROUND + 0.03, 6.6], to: [9.7, GROUND + 0.03, 7.7] },
  { from: [8.4, GROUND + 0.03, 1.4], to: [9.7, GROUND + 0.03, 0.8] },
  { from: [11.6, GROUND + 0.03, 7.0], to: [10.4, GROUND + 0.03, 7.8] },
  { from: [11.6, GROUND + 0.03, 1.6], to: [10.4, GROUND + 0.03, 0.9] },
  { from: [5.7, GROUND + 0.03, -0.5], to: [5.7, GROUND + 0.03, -1.8] },
  { from: [7.4, GROUND + 0.03, -3.6], to: [6.1, GROUND + 0.03, -2.5] },
];

// ===================================================================== fresh water

// The existing borewell is in the north-east corner of the plot (position assumed
// about 1 m in from each boundary). The sump and the lifting pump sit beside it.
const borewell = { x: 16.2, z: -5.4 };
const sump = { x0: 13.4, x1: 15.2, z0: -5.7, z1: -3.9, wall: 0.15, floor: -1.8, water: -0.4 };
const pump = { x: 14.3, z: -3.45 };
const oht = { x: 0.9, z: 9.77, r: 0.55, base: ROOF + 0.45, top: ROOF + 1.7 }; // south-west corner of the roof, over the house walls
const sumpMid = [(sump.x0 + sump.x1) / 2, (sump.z0 + sump.z1) / 2];
const metres = (a, b) => Math.round(Math.hypot(a[0] - b[0], a[1] - b[1]) * 10) / 10;
const boreToTank = metres([borewell.x, borewell.z], TANK_MID);

structures.push({
  id: 'Borewell', kind: 'borewell', layer: 'fresh', ...borewell,
  name: 'Borewell',
  purpose: 'The existing borewell and its pump, in the north-east corner. It fills the sump.',
  details: [
    ['Casing', '150 mm, sealed at the top above yard level'],
    ['Pump', 'Existing borewell pump; a float switch in the sump stops it when the sump is full'],
    ['Delivery', '32 mm pipe to the sump'],
    ['Distance to septic tank', `About ${boreToTank} m. The tank is watertight, but an engineer should confirm this separation from a drinking-water source`],
  ],
});
labels.push({ text: 'Borewell', layer: 'fresh', at: [borewell.x, 0.75, borewell.z] });
pipe({ id: 'bore-delivery', layer: 'fresh', name: 'Borewell delivery pipe', purpose: 'Water pumped up from the borewell into the sump.', dia: 32, material: UPVC, from: 'Borewell pump', to: 'Sump' }, [[borewell.x, -5.8, borewell.z], [borewell.x, 0.3, borewell.z], [15.75, 0.3, -5.1], [15.75, -0.3, -5.1], [sump.x1 - 0.15, -0.3, -5.0]]);

pipe({ id: 'main-street', layer: 'fresh', name: 'Municipal water main', purpose: 'Public supply main under the main road.', dia: 100, material: 'Public main', from: 'Public supply', to: 'Service connection' }, [[17.6, -0.9, 13.3], [10.5, -0.9, 13.3]]);
pipe({ id: 'service', layer: 'fresh', name: 'Underground service connection', purpose: 'Second source, if a municipal connection is taken: from the road main, through the meter, along the east boundary to the sump. A float valve shuts it when the sump is full.', dia: 20, material: UPVC, from: 'Municipal main', to: 'Sump' }, [[16.7, -0.9, 13.3], [16.7, -0.6, 12.4], [16.7, -0.6, -4.4], [sump.x1 - 0.15, -0.3, -4.4]]);
chamber({ id: 'Meter', kind: 'meter', layer: 'fresh', x: 16.7, z: 11.75, size: 0.3, invert: -0.6, name: 'Water meter and stop valve', purpose: 'Meter and main shut-off for the municipal connection, just inside the boundary.', to: 'Sump' });
structures.push({
  id: 'Sump', kind: 'sump', layer: 'fresh', ...sump,
  name: 'Underground water tank (sump)',
  purpose: 'Stores borewell (and any municipal) water at ground level so the pump can lift it to the roof tank.',
  details: [
    ['Capacity', 'About 3,000 litres (1.5 × 1.5 × 1.4 m of water)'],
    ['Construction', 'Watertight concrete, cover raised above the yard so surface water cannot enter'],
    ['Position', `Beside the borewell in the north-east corner; about ${metres(sumpMid, TANK_MID)} m from the septic tank`],
  ],
});
labels.push({ text: 'Sump', layer: 'fresh', at: [sumpMid[0], 0.45, sumpMid[1]] });
structures.push({ id: 'Pump', kind: 'pump', layer: 'fresh', ...pump, name: 'Water pump', purpose: 'Lifts water from the sump to the overhead tank.', details: [['Type', 'About 0.5 hp self-priming pump on a raised plinth, beside the sump and borewell'], ['Suction', '25 mm with a foot valve in the sump'], ['Delivery', '25 mm rising main to the roof tank']] });
labels.push({ text: 'Pump', layer: 'fresh', at: [pump.x, 0.75, pump.z] });
structures.push({ id: 'Overhead tank', kind: 'oht', layer: 'fresh', ...oht, name: 'Overhead water tank', purpose: 'Feeds every tap in the house by gravity.', details: [['Capacity', '1,000 litres'], ['Position', 'On the roof at the south-west corner, above the M. Bed Room, on a 0.45 m stand'], ['Inlet', '25 mm rising main with a float valve'], ['Outlet', '32 mm main with a shut-off valve']] });
labels.push({ text: 'Overhead tank', layer: 'fresh', at: [oht.x, oht.top + 0.3, oht.z] });

pipe({ id: 'suction', layer: 'fresh', name: 'Pump suction', purpose: 'Draws water from near the bottom of the sump.', dia: 25, material: UPVC, from: 'Sump', to: 'Pump' }, [[pump.x, -1.6, sump.z1 - 0.4], [pump.x, 0.25, sump.z1 - 0.4], [pump.x, 0.25, pump.z - 0.1]]);
pipe({ id: 'rising', layer: 'fresh', name: 'Rising main', purpose: 'Pumped water from the sump to the overhead tank: underground across the north yard, up the east wall at the north-east corner of the house, then along the roof to the tank in the south-west corner. Where it crosses the east drain and rainwater line it passes above them in a sleeve.', dia: 25, material: UPVC, from: 'Pump', to: 'Overhead tank' }, [[pump.x, 0.25, pump.z + 0.1], [pump.x, -0.25, pump.z + 0.1], [pump.x, -0.25, -1.2], [8.2, -0.25, -1.2], [8.2, -0.25, 0.5], [8.2, ROOF + 0.2, 0.5], [7.6, ROOF + 0.2, 0.9], [7.6, ROOF + 0.2, oht.z + 0.3], [oht.x + 0.45, ROOF + 0.2, oht.z + 0.3], [oht.x + 0.45, oht.top - 0.1, oht.z + 0.3]]);

const cold = (id, name, purpose, dia, from, to, pts) => pipe({ id, layer: 'fresh', name, purpose, dia, material: UPVC, from, to }, pts);
const hot = (id, name, purpose, from, to, pts) => pipe({ id, layer: 'fresh', hot: true, name, purpose, dia: 15, material: CPVC, from, to }, pts);
const RY = ROOF + 0.08; // pipes lying on the roof slab
const HI = 2.35; // cold pipe along the bathroom walls, above the tiles
const HH = 2.22; // hot pipe just below it

// main from the tank, along the roof to above the two bathrooms, then on to the kitchen side
cold('main', 'Main distribution pipe', 'Cold water from the overhead tank along the roof to the bathrooms.', 32, 'Overhead tank', 'Bathroom branches', [[oht.x, oht.base + 0.05, oht.z - 0.55], [oht.x, RY, oht.z - 0.55], [2.3, RY, oht.z - 0.55], [2.3, RY, 5.09]]);
cold('main-kitchen', 'Kitchen-side distribution pipe', 'Continues the main across the roof from above the bathrooms to above the kitchen, for the sink, wash area and utility taps.', 25, 'Main distribution pipe', 'Kitchen, wash area and utility branches', [[2.3, RY, 5.09], [4.25, RY, 5.09], [4.25, RY, 9.05], [7.0, RY, 9.05]]);

// Toilet 1 (second bedroom side): its own branch and shut-off
cold('t1-branch', 'Toilet 1 cold branch', 'Separate cold supply to Toilet 1, with its own shut-off valve, run along the walls above the tiles.', 20, 'Main distribution pipe', 'Toilet 1 fixtures', [[2.3, RY, 5.09], [2.25, RY, 4.985], [2.25, HI, 4.985], [0.27, HI, 4.985], [0.27, HI, 3.85], [0.6, HI, 3.85]]);
cold('t1-basin', 'Toilet 1 basin, cold', 'Cold water to the washbasin tap.', 15, 'Toilet 1 cold branch', 'Basin', [[1.81, HI, 4.985], [1.81, 0.6, 4.985]]);
cold('t1-wc', 'Toilet 1 WC cistern', 'Cold water to the toilet cistern.', 15, 'Toilet 1 cold branch', 'WC cistern', [[1.4, HI, 4.985], [1.4, 0.72, 4.985]]);
cold('t1-geyser', 'Toilet 1 geyser inlet', 'Cold water into the water heater.', 15, 'Toilet 1 cold branch', 'Geyser', [[0.84, HI, 4.985], [0.84, 1.8, 4.985], [0.7, 1.8, 4.93]]);
cold('t1-shower', 'Toilet 1 shower, cold', 'Cold water to the shower mixer.', 15, 'Toilet 1 cold branch', 'Shower mixer', [[0.6, HI, 3.85], [0.6, 1.1, 3.85]]);
hot('t1-hot-shower', 'Toilet 1 shower, hot', 'Hot water from the geyser to the shower mixer.', 'Geyser', 'Shower mixer', [[0.55, 1.8, 4.93], [0.5, HH, 4.95], [0.31, HH, 4.95], [0.31, HH, 3.89], [0.54, HH, 3.89], [0.54, 1.1, 3.89]]);
hot('t1-hot-basin', 'Toilet 1 basin, hot', 'Hot water from the geyser to the washbasin.', 'Geyser', 'Basin', [[0.5, HH, 4.95], [1.93, HH, 4.95], [1.93, 0.6, 4.95]]);

// Toilet 2 (master bathroom): its own branch and shut-off
cold('t2-branch', 'Toilet 2 (master) cold branch', 'Separate cold supply to the master bathroom, with its own shut-off valve, run along the walls above the tiles.', 20, 'Main distribution pipe', 'Toilet 2 fixtures', [[2.3, RY, 5.09], [2.25, RY, 5.19], [2.25, HI, 5.19], [0.27, HI, 5.19], [0.27, HI, 6.62], [0.46, HI, 6.62]]);
cold('t2-basin', 'Toilet 2 basin, cold', 'Cold water to the washbasin tap.', 15, 'Toilet 2 cold branch', 'Basin', [[1.79, HI, 5.19], [1.79, 0.6, 5.19]]);
cold('t2-wc', 'Toilet 2 WC cistern', 'Cold water to the toilet cistern.', 15, 'Toilet 2 cold branch', 'WC cistern', [[1.44, HI, 5.19], [1.44, 0.72, 5.19]]);
cold('t2-shower', 'Toilet 2 shower, cold', 'Cold water to the shower mixer.', 15, 'Toilet 2 cold branch', 'Shower mixer', [[0.6, HI, 5.19], [0.6, 1.1, 5.19]]);
cold('t2-geyser', 'Toilet 2 geyser inlet', 'Cold water into the water heater.', 15, 'Toilet 2 cold branch', 'Geyser', [[0.46, HI, 6.62], [0.46, 1.8, 6.6], [0.5, 1.8, 6.56]]);
hot('t2-hot-shower', 'Toilet 2 shower, hot', 'Hot water from the geyser to the shower mixer.', 'Geyser', 'Shower mixer', [[0.62, 1.8, 6.56], [0.66, HH, 6.6], [0.31, HH, 6.6], [0.31, HH, 5.23], [0.54, HH, 5.23], [0.54, 1.1, 5.23]]);
hot('t2-hot-basin', 'Toilet 2 basin, hot', 'Hot water from the geyser to the washbasin.', 'Geyser', 'Basin', [[0.54, HH, 5.23], [1.91, HH, 5.23], [1.91, 0.6, 5.23]]);

// kitchen sink, wash area, utility
cold('kitchen', 'Kitchen sink supply', 'Cold water down the east wall, behind the counter, to the sink tap.', 20, 'Kitchen-side distribution pipe', 'Kitchen sink', [[7.0, RY, 9.05], [7.0, RY, 7.72], [7.8, RY, 7.72], [7.8, 0.6, 7.72], [7.8, 0.6, 8.2], [7.8, 0.92, 8.2]]);
cold('wash', 'Kitchen wash area supply', 'Cold water down the outside of the east wall to the wash area tap.', 15, 'Kitchen-side distribution pipe', 'Wash area tap', [[7.0, RY, 9.05], [7.0, RY, 9.5], [8.16, RY, 9.5], [8.16, 0.9, 9.5], [8.3, 0.9, 9.5]]);
cold('utility', 'Utility / washing area supply', 'Cold water down the outside of the south wall to the washing-machine tap.', 15, 'Kitchen-side distribution pipe', 'Utility tap', [[7.0, RY, 9.5], [7.0, RY, 10.2], [7.75, RY, 10.74], [7.75, 0.9, 10.74], [7.75, 0.9, 10.88]]);

for (const [text, x, y, z] of [['Wash area tap', 8.3, 1.15, 9.5], ['Utility tap', 7.75, 1.15, 10.9], ['Geyser', 0.62, 2.45, 4.85], ['Geyser', 0.55, 2.45, 6.49]]) {
  labels.push({ text, layer: 'fresh', at: [x, y, z], small: true });
}
labels.push({ text: 'Municipal main', layer: 'fresh', at: [14.0, -0.5, 13.3], small: true });

export const design = { runs, chambers, structures, labels, ground: GROUND, roof: ROOF };
