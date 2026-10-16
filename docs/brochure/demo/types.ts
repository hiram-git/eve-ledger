// Types of the mocked ESI for the demo: name, group, category and, for skills, rank, attributes and requirements.
// They are the game's (real IDs), but attributes and prices are approximate: only good for the screenshots.
// [name, group, category, rank, primary, secondary, [skill, level]…, omegaOnly]
export type Fake = [string, number, number, number | null, number | null, number | null, [number, number][], boolean?];
export const TYPES: Record<number, Fake> = {
  // Ships
  587: ['Rifter', 25, 6, null, null, null, [[3329, 1]]],
  24702: ['Hurricane', 419, 6, null, null, null, [[33095, 1]]],
  11978: ['Scimitar', 832, 6, null, null, null, [[12096, 1], [3333, 5]]],
  // Modules, ammo and drones
  2048: ['Damage Control II', 60, 7, null, null, null, [[3394, 3]]],
  519: ['Gyrostabilizer II', 59, 7, null, null, null, [[3318, 1]]],
  2913: ['425mm AutoCannon II', 55, 7, null, null, null, [[3305, 5], [12205, 1]]],
  37627: ['Heavy Energy Neutralizer II', 71, 7, null, null, null, [[3423, 4]]],
  3841: ['Large Shield Extender II', 38, 7, null, null, null, [[3425, 4]]],
  12058: ['10MN Afterburner II', 46, 7, null, null, null, [[3450, 4]]],
  31718: ['Medium Projectile Burst Aerator I', 778, 7, null, null, null, [[26260, 1]]],
  3608: ['Large Remote Shield Booster II', 41, 7, null, null, null, [[3422, 4]]],
  1541: ['Power Diagnostic System II', 766, 7, null, null, null, [[3413, 4]]],
  5975: ['Sensor Booster II', 212, 7, null, null, null, [[3431, 4]]],
  21924: ['Republic Fleet EMP M', 83, 8, null, null, null, []],
  2488: ['Warrior II', 100, 18, null, null, null, [[24241, 2]]],
  2185: ['Hammerhead II', 101, 18, null, null, null, [[33699, 5]]],
  // Skills
  3327: ['Spaceship Command', 257, 16, 1, 167, 168, []],
  3329: ['Minmatar Frigate', 257, 16, 2, 167, 168, [[3327, 1]]],
  3333: ['Minmatar Cruiser', 257, 16, 5, 167, 168, [[3329, 3]]],
  33095: ['Minmatar Battlecruiser', 257, 16, 6, 167, 168, [[3333, 3]]],
  12096: ['Logistics Cruisers', 257, 16, 6, 167, 168, [[3333, 5], [3422, 4]], true],
  3392: ['Mechanics', 1210, 16, 1, 166, 168, []],
  3394: ['Hull Upgrades', 1210, 16, 2, 166, 168, [[3392, 2]]],
  3436: ['Drones', 273, 16, 1, 166, 167, []],
  24241: ['Light Drone Operation', 273, 16, 1, 166, 167, [[3436, 1]]],
  33699: ['Medium Drone Operation', 273, 16, 2, 166, 167, [[24241, 3]]],
  3423: ['Capacitor Emission Systems', 255, 16, 2, 165, 166, []],
  3300: ['Gunnery', 255, 16, 1, 167, 168, []],
  3305: ['Medium Projectile Turret', 255, 16, 3, 167, 168, [[3300, 3]]],
  12205: ['Medium Autocannon Specialization', 255, 16, 5, 167, 168, [[3305, 5]], true],
  3413: ['Power Grid Management', 1209, 16, 1, 165, 166, []],
  3426: ['CPU Management', 1209, 16, 1, 165, 166, []],
  3318: ['Weapon Upgrades', 255, 16, 2, 167, 168, [[3300, 2], [3426, 1]]],
  3416: ['Shield Operation', 1209, 16, 1, 165, 166, []],
  3425: ['Shield Upgrades', 1209, 16, 2, 165, 166, [[3416, 2]]],
  3422: ['Shield Emission Systems', 1209, 16, 2, 165, 166, [[3416, 3]]],
  3449: ['Navigation', 275, 16, 1, 167, 166, []],
  3450: ['Afterburner', 275, 16, 1, 167, 166, [[3449, 1]]],
  26260: ['Projectile Weapon Rigging', 1218, 16, 3, 165, 166, [[3392, 3]]],
  3431: ['Electronic Upgrades', 1210, 16, 2, 165, 166, [[3426, 2]]],
};
export const PRICE: Record<number, number> = {
  587: 380_000, 24702: 61_500_000, 11978: 228_000_000, 2048: 1_150_000, 519: 1_850_000, 2913: 3_300_000, 37627: 2_750_000,
  3841: 2_900_000, 12058: 3_600_000, 31718: 4_200_000, 3608: 7_800_000, 1541: 1_400_000, 5975: 2_100_000, 21924: 210,
  2488: 275_000, 2185: 520_000, 40520: 812_000_000, 45635: 181_000_000, 44992: 4_100_000,
};
