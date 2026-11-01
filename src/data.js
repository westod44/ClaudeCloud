/* Game data: items, weapons, recipes, buildable structures, creatures and spawn rules. */
(function (root) {
  const ITEMS = {
    log: { name: 'Log', max: 20 }, stick: { name: 'Stick', max: 50 }, stone: { name: 'Stone', max: 40 }, fiber: { name: 'Plant fiber', max: 50 },
    rope: { name: 'Rope', max: 20 }, hide: { name: 'Hide', max: 20 }, cloth: { name: 'Cloth', max: 20 }, bone: { name: 'Bone', max: 20 }, relic: { name: 'Relic', max: 8 }, seeds: { name: 'Seeds', max: 30 },
    berries: { name: 'Berries', max: 30, eat: { hunger: 9, thirst: 4 }, verb: 'Eat' },
    meat_raw: { name: 'Raw meat', max: 15, eat: { hunger: 12, hp: -8, sick: 30 }, verb: 'Eat raw', note: 'Cook it, dry it or stew it.' },
    meat_cooked: { name: 'Cooked meat', max: 15, eat: { hunger: 36, hp: 5 }, verb: 'Eat' },
    jerky: { name: 'Jerky', max: 20, eat: { hunger: 26, thirst: -4 }, verb: 'Eat' },
    stew: { name: 'Hearty stew', max: 5, eat: { hunger: 55, thirst: 25, hp: 12, warm: 30 }, verb: 'Eat' },
    herb: { name: 'Herb', max: 30, eat: { hp: 4, sick: -20 }, verb: 'Chew' },
    salve: { name: 'Herbal salve', max: 10, eat: { hp: 40, sick: -60 }, verb: 'Apply' },
    bandage: { name: 'Bandage', max: 10, eat: { hp: 18, bleed: true }, verb: 'Apply' },
    arrow: { name: 'Arrow', max: 50 }, fire_arrow: { name: 'Fire arrow', max: 30 },
    club: { name: 'Club', max: 1, weapon: 'club' }, knife: { name: 'Flint knife', max: 1, weapon: 'knife' }, axe: { name: 'Stone axe', max: 1, weapon: 'axe' },
    spear: { name: 'Spear', max: 1, weapon: 'spear' }, greataxe: { name: 'Great axe', max: 1, weapon: 'greataxe' }, bow: { name: 'Bow', max: 1, weapon: 'bow' }, sling: { name: 'Sling', max: 1, weapon: 'sling' },
    torch: { name: 'Torch', max: 8, verb: 'Light' }, waterskin: { name: 'Waterskin', max: 3, verb: 'Drink' }, armor: { name: 'Hide armor', max: 1, verb: 'Wear' },
  };
  // arc in degrees (half-angle) for melee
  const WEAPONS = {
    fists: { name: 'Fists', dmg: 6, reach: 0.95, cd: 0.5, stam: 4, arc: 50, asset: 'explorer' },
    club: { name: 'Club', dmg: 12, reach: 1.05, cd: 0.55, stam: 6, arc: 60, knock: 0.3, asset: 'explorer_club' },
    knife: { name: 'Flint knife', dmg: 10, reach: 0.95, cd: 0.32, stam: 4, arc: 45, asset: 'explorer_knife', skin: true },
    axe: { name: 'Stone axe', dmg: 16, reach: 1.15, cd: 0.6, stam: 8, arc: 70, chop: 1, asset: 'explorer_axe' },
    spear: { name: 'Spear', dmg: 26, reach: 1.65, cd: 0.75, stam: 10, arc: 28, asset: 'explorer_spear' },
    greataxe: { name: 'Great axe', dmg: 38, reach: 1.3, cd: 1.05, stam: 18, arc: 110, knock: 0.5, chop: 2, asset: 'explorer_greataxe' },
    bow: { name: 'Bow', dmg: 30, reach: 8, cd: 0.9, stam: 5, ranged: true, ammo: ['fire_arrow', 'arrow'], asset: 'explorer_bow' },
    sling: { name: 'Sling', dmg: 13, reach: 6.5, cd: 0.6, stam: 4, ranged: true, ammo: ['stone'], asset: 'explorer_sling' },
  };
  const RECIPES = [
    { out: 'rope', n: 1, cost: { fiber: 3 }, desc: 'Twisted plant fiber.' },
    { out: 'club', n: 1, cost: { log: 1 }, desc: 'Cheap, fast blunt weapon.' },
    { out: 'knife', n: 1, cost: { stick: 1, stone: 2, rope: 1 }, desc: 'Quick strikes; extra meat and hide from carcasses.' },
    { out: 'axe', n: 1, cost: { stick: 2, stone: 2, rope: 1 }, desc: 'Fells trees. A solid weapon.' },
    { out: 'spear', n: 1, cost: { stick: 3, stone: 1, rope: 1 }, desc: 'Long reach, heavy damage, narrow thrust.' },
    { out: 'sling', n: 1, cost: { rope: 2, hide: 1 }, desc: 'Hurls stones. Ammo: stone.' },
    { out: 'bow', n: 1, cost: { stick: 3, rope: 2 }, desc: 'Ranged. Ammo: arrows.' },
    { out: 'arrow', n: 5, cost: { stick: 3, stone: 1 }, desc: 'Five arrows.' },
    { out: 'torch', n: 1, cost: { stick: 1, fiber: 2 }, desc: 'Burns ~2.5 minutes. Hollows fear its light.' },
    { out: 'bandage', n: 1, cost: { cloth: 1, herb: 1 }, desc: 'Heals 18 and stops bleeding.' },
    { out: 'salve', n: 1, cost: { herb: 3 }, desc: 'Heals 40 and cures sickness.' },
    { out: 'waterskin', n: 1, cost: { hide: 2, rope: 1 }, desc: 'Carries 3 drinks. Fill at water.' },
    { out: 'greataxe', n: 1, cost: { log: 1, stone: 4, rope: 2, bone: 1 }, desc: 'Huge, slow, wide cleaving arc. Chops twice as fast.', bench: true },
    { out: 'fire_arrow', n: 3, cost: { arrow: 3, cloth: 1 }, desc: 'Burning arrows: heavy damage, double against Hollows.', bench: true },
    { out: 'armor', n: 1, cost: { hide: 4, rope: 2, bone: 2 }, desc: 'Absorbs 40% of damage until worn out. Keeps you warm.', bench: true },
  ];
  // cat: shelter | walls | light | food | storage | comfort
  const STRUCTS = {
    campfire: { name: 'Campfire', cat: 'light', asset: 'campfire', cost: { stick: 4, stone: 3 }, hp: 80, desc: 'Light, warmth and cooking. Needs fuel.', light: 4.6, fuel: true },
    standing_torch: { name: 'Standing torch', cat: 'light', asset: 'standing_torch', cost: { stick: 3, fiber: 2 }, hp: 40, desc: 'A small, lasting light.', light: 3.2, repeat: true },
    brazier: { name: 'Brazier', cat: 'light', asset: 'brazier', cost: { stone: 6, log: 2 }, hp: 140, desc: 'Big, long-burning fire. Needs fuel.', light: 5.6, fuel: true, bench: true },
    spirit_lantern: { name: 'Spirit lantern', cat: 'light', asset: 'spirit_lantern', cost: { stone: 8, cloth: 2, bone: 2 }, hp: 200, desc: 'Never goes out. Hollows will not enter its light.', light: 5.5, ward: true, bench: true },
    lean_to: { name: 'Lean-to', cat: 'shelter', asset: 'lean_to', cost: { log: 5, stick: 6, fiber: 4 }, hp: 150, desc: 'Sleep through the night and save.', sleep: 1 },
    bed: { name: 'Bed', cat: 'shelter', asset: 'bed', cost: { log: 3, fiber: 6, hide: 2 }, hp: 90, desc: 'Sleep and save. Heals more, adds comfort.', sleep: 2, comfort: 2 },
    cabin: { name: 'Log cabin', cat: 'shelter', asset: 'cabin', cost: { log: 16, stone: 8, rope: 2 }, hp: 500, desc: 'A sturdy home. Warm, and sleeping here heals fully.', sleep: 3, comfort: 2, bench: true },
    floor: { name: 'Wood floor', cat: 'shelter', asset: 'floor', cost: { log: 1 }, hp: 60, desc: 'Flooring for your base. Adds comfort.', repeat: true, flat: true },
    wall_log: { name: 'Log wall', cat: 'walls', asset: 'wall_log_post', cost: { log: 2 }, hp: 220, desc: 'Connects to neighbouring walls automatically.', repeat: true, wall: 'log' },
    wall_stone: { name: 'Stone wall', cat: 'walls', asset: 'wall_stone_post', cost: { stone: 6 }, hp: 520, desc: 'Much tougher wall.', repeat: true, wall: 'stone', bench: true },
    gate: { name: 'Gate', cat: 'walls', asset: 'gate_i', cost: { log: 3, rope: 1 }, hp: 200, desc: 'Opens for you, holds against creatures. Place it in a wall line.', gate: true },
    palisade: { name: 'Palisade', cat: 'walls', asset: 'palisade', cost: { log: 2 }, hp: 180, desc: 'Sharpened stake block.', repeat: true },
    spike_wall: { name: 'Spiked barricade', cat: 'walls', asset: 'spike_wall', cost: { log: 2, stick: 6 }, hp: 160, desc: 'Blocks and wounds attackers.', repeat: true, thorns: 8 },
    spike_trap: { name: 'Spike trap', cat: 'walls', asset: 'spike_trap', cost: { stick: 5, log: 1 }, hp: 60, desc: 'Wounds creatures that step on it.', repeat: true },
    lookout: { name: 'Lookout tower', cat: 'walls', asset: 'lookout', cost: { log: 8, rope: 2 }, hp: 260, desc: 'Climb to see far across the island.', bench: true },
    rain_collector: { name: 'Rain collector', cat: 'food', asset: 'rain_collector', cost: { log: 3, hide: 1 }, hp: 60, desc: 'Collects drinking water, faster in rain.' },
    drying_rack: { name: 'Drying rack', cat: 'food', asset: 'drying_rack', cost: { stick: 6, rope: 1 }, hp: 50, desc: 'Turns raw meat into jerky over time.' },
    stew_pot: { name: 'Cooking pot', cat: 'food', asset: 'stew_pot', cost: { stone: 4, stick: 3, bone: 1 }, hp: 70, desc: 'Cook hearty stew: meat, herb and berries.', light: 2.4 },
    garden: { name: 'Garden plot', cat: 'food', asset: 'garden', cost: { log: 2, fiber: 4 }, hp: 50, desc: 'Plant seeds; harvest berries and herbs.', flat: true },
    crate: { name: 'Storage crate', cat: 'storage', asset: 'crate', cost: { log: 4 }, hp: 80, desc: 'Store items: 24 slots.', store: 24 },
    shelf: { name: 'Storage shelf', cat: 'storage', asset: 'shelf', cost: { log: 4, rope: 1 }, hp: 80, desc: 'Store items: 18 slots. Adds comfort.', store: 18, comfort: 0.5 },
    workbench: { name: 'Workbench', cat: 'storage', asset: 'workbench', cost: { log: 4, stone: 2, rope: 1 }, hp: 120, desc: 'Stand near it to unlock advanced crafting and buildings.' },
    weapon_rack: { name: 'Weapon rack', cat: 'comfort', asset: 'weapon_rack', cost: { log: 2, stick: 4 }, hp: 60, desc: 'Decor. Adds comfort.', comfort: 0.5 },
    table: { name: 'Table', cat: 'comfort', asset: 'table', cost: { log: 2 }, hp: 60, desc: 'Adds comfort.', comfort: 1 },
    bench: { name: 'Bench', cat: 'comfort', asset: 'bench', cost: { log: 1 }, hp: 50, desc: 'Adds comfort.', comfort: 1, repeat: true },
    rug: { name: 'Rug', cat: 'comfort', asset: 'rug', cost: { cloth: 2, fiber: 4 }, hp: 30, desc: 'Adds comfort.', comfort: 1, flat: true },
    beacon: { name: 'Signal beacon', cat: 'light', asset: 'beacon', cost: { log: 12, stone: 8, relic: 8 }, hp: 400, desc: 'Light it at dusk and survive until dawn to be rescued.' },
  };
  const BUILD_CATS = [['shelter', 'Shelter'], ['walls', 'Walls & defence'], ['light', 'Fire & light'], ['food', 'Food & water'], ['storage', 'Storage & crafting'], ['comfort', 'Comfort']];
  // creatures. fear: how strongly firelight repels them (1 = fully). zone: minimum danger to spawn naturally
  const KINDS = {
    deer: { asset: 'deer', name: 'Deer', hp: 30, speed: 3.0, flee: 3.6, loot: { meat_raw: 3, hide: 2, bone: 1 }, call: 'deer' },
    sheep: { asset: 'sheep', name: 'Sheep', hp: 22, speed: 1.1, flee: 2.0, loot: { meat_raw: 2, cloth: 1 }, call: 'sheep' },
    wolf: { asset: 'wolf', name: 'Wolf', hp: 45, speed: 3.0, dmg: 8, reach: 0.95, cd: 1.0, aggro: 3.5, nightAggro: 7, fear: 1, loot: { meat_raw: 1, hide: 1, bone: 1 }, hostile: true, call: 'growl', bleed: 0.3 },
    boar: { asset: 'boar', name: 'Boar', hp: 55, speed: 2.5, dmg: 11, reach: 0.95, cd: 1.25, aggro: 1.3, loot: { meat_raw: 3, hide: 2, bone: 1 }, hostile: true, call: 'boar' },
    bear: { asset: 'bear', name: 'Bear', hp: 170, speed: 2.7, dmg: 22, reach: 1.25, cd: 1.5, aggro: 4, loot: { meat_raw: 5, hide: 3, bone: 2 }, hostile: true, call: 'bear', bleed: 0.5 },
    spider: { asset: 'spider', name: 'Duskweaver', hp: 45, speed: 3.1, dmg: 8, reach: 0.95, cd: 1.0, aggro: 5, fear: 0.5, loot: { fiber: 4 }, hostile: true, call: 'spider', venom: 35 },
    hollow: { asset: 'hollow', name: 'Hollow', hp: 60, speed: 2.35, dmg: 10, reach: 1.0, cd: 1.1, fear: 1, structDmg: 14, hostile: true, night: true, call: 'hollow', bleed: 0.25 },
    stalker: { asset: 'hollow_stalker', name: 'Stalker', hp: 40, speed: 3.4, dmg: 9, reach: 1.0, cd: 0.8, fear: 0.6, structDmg: 8, hostile: true, night: true, call: 'hollow', bleed: 0.35 },
    crawler: { asset: 'crawler', name: 'Crawler', hp: 55, speed: 2.9, dmg: 11, reach: 0.95, cd: 1.0, fear: 1, structDmg: 18, hostile: true, night: true, call: 'hollow' },
    wisp: { asset: 'wisp', name: 'Wisp', hp: 32, speed: 2.0, dmg: 10, reach: 6, cd: 2.4, fear: 0.3, hostile: true, night: true, ranged: true, call: 'wisp' },
    brute: { asset: 'hollow_brute', name: 'Brute', hp: 170, speed: 1.9, dmg: 24, reach: 1.25, cd: 1.6, fear: 0.4, structDmg: 40, hostile: true, night: true, call: 'hollow', bleed: 0.5 },
  };
  // night spawn table: [kind, minDay, minDanger, weight]
  const NIGHT_SPAWNS = [['hollow', 1, 0, 10], ['crawler', 2, 0.3, 5], ['stalker', 3, 0.45, 4], ['wisp', 4, 0.55, 3], ['brute', 5, 0.7, 2]];
  root.DATA = { ITEMS, WEAPONS, RECIPES, STRUCTS, BUILD_CATS, KINDS, NIGHT_SPAWNS };
})(typeof window !== 'undefined' ? window : globalThis);
