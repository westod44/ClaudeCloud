// Narrative text. Section 17 lines are implemented verbatim.

export const OPENING_JOURNAL = 'Stopped at Bellwether on the way home. Forty-five minutes round the loop. Back at the car before dark.';

export const OBJECTIVES = {
  walk: 'Walk the Bellwether loop.',
  return: 'Return to the car before dark.',
  shelter: 'Find the ranger shelter.',
  lookout: 'Reach the lookout radio.',
  out: 'Find a way out of Bellwether.',
};

// Documents: inspectable with a clean native-resolution transcription.
export const DOCS = {
  reminder: { title: 'Note on the dashboard', style: 'sticky', body: ['Home before dark.'] },
  phone: { title: 'Phone', style: 'phone', body: ['Thursday', '4:17 PM', 'Battery 12%', 'No service'] },
  trailhead: {
    title: 'Trailhead board', style: 'board',
    body: ['BELLWETHER FOREST RESERVE', 'Creek Loop - 45 minutes', 'Stay on marked trails. Return before dark.'],
  },
  coldNotebook: {
    title: 'Notebook on the stump', style: 'note',
    body: ['I left the creek behind me. I walked uphill for an hour. I reached the creek again. The water was flowing the other way.'],
  },
  campSketch: {
    title: 'Map sketch', style: 'note',
    body: ['A pencil sketch of the creek loop. Someone has drawn a small square uphill of the clearing and written beside it:', 'RANGER SHELTER — stay the night if you have to.'],
  },
  rangerLog: {
    title: 'Ranger log — essential page', style: 'log',
    body: ['Three walkers reported the same clearing from different trails. The lookout was east of the creek in one account and west in another. Do not follow the tower. Follow the things that do not move.'],
  },
  fieldNote: {
    title: 'Ranger log — attached field note', style: 'log',
    body: ["By 'do not move' I mean the marks stay the same: the split stone, the pale scar, the post with two bars. The paths between them are another matter. The water runs downhill while you can see it. Don't assume where it comes from."],
  },
  radioNote: {
    title: 'Ranger log — radio note', style: 'log',
    body: ['Shelter set is dead. Lookout emergency set still had power on the last check. Marked lower track reaches the service access. It starts away from the tower.'],
  },
  backPage: {
    title: 'Ranger log — back page', style: 'log',
    body: ['I put the sign back where it belonged. It was waiting on the other side when I returned.'],
  },
  trailSheet: {
    title: 'Trail sheet', style: 'note',
    body: ['BELLWETHER — SERVICE NOTES', 'Lookout: emergency set on the cabin desk. Sealed water under the desk.', 'Survey posts: yellow square, two bars. Do not move them.'],
  },
  towerScratch: { title: 'Scratched beside the window', style: 'scratch', body: ['I could see the road from here yesterday.'] },
  secondPack: {
    title: 'Second backpack', style: 'note',
    body: ['A dark blue pack, zipped shut against the rain. Inside: a folded fleece, an empty bottle, a spare torch with no batteries. A luggage tag with the name scratched off. It has been here a while, and it has been here only since you last passed.'],
  },
  oldPack: { title: 'Your backpack', style: 'note', body: ['Flashlight, one spare battery pack, a 750 mL bottle with 500 mL of water, one snack, a lighter, a folded trail map, your phone and a pocket notebook.'] },
};

export const DUP_CAMP_TAIL = 'I heard myself walking outside the tent. I did not look.';

// Journal: evidence and hints, added only after their trigger.
export const JOURNAL = {
  opening: { title: 'Bellwether', text: OPENING_JOURNAL },
  bridge: { title: 'The footbridge', text: 'An old footbridge over the creek. Twelve planks, a section of the right-hand rail missing near the far end, a split slate stone on the left bank.' },
  dryGully: { title: 'The dry gully', text: 'I came back the way I walked. Where the creek and the bridge should be there is only a dry gully full of stones.' },
  ribbon2: { title: 'The ribbon log', text: 'The same fallen trunk, the same two broken prongs, the same orange ribbon on the lower one. I walked away from it and it was ahead of me again.' },
  ribbon4: { title: 'The ribbon log', text: 'The open path returns to the ribbon. There is a smaller track under the broken trunk.' },
  coldCamp: { title: 'The cold camp', text: 'A collapsed tent, a cold fire ring of seven stones, a chipped green mug on a stump. Whoever was here left in a hurry, or did not leave.' },
  junction1: { title: 'The sign junction', text: 'The broad path came back to the signpost from the other side. Same initials, E.M., same snapped branch at its foot.' },
  junction2: { title: 'The sign junction', text: 'The sign is not helping. I can hear running water below the narrow path.' },
  clearing: { title: 'The dead tree', text: 'I left the clearing past the split stone and walked back into it from the far side. The scar and the broken limb are the same.' },
  barredPost: { title: 'The barred post', text: 'A knee-high post with a yellow square and two black bars. It stands beside the path that actually leaves the clearing.' },
  shelter: { title: 'The shelter', text: 'There are rules here. Someone else was trying to learn them. The split stone, the pale scar, the post with two bars.' },
  tower1: { title: 'The tower', text: 'The lookout stands across the valley, left of a forked pine.' },
  tower2: { title: 'The marked lower path', text: 'I reach this pine every time I walk toward the tower. The marked lower path heads away from it.' },
  corridor: { title: 'The corridor', text: 'The same broken fence, again and again. Looking back, the trail runs on much further than I walked.' },
  warmCamp: { title: 'The second camp', text: 'The same clearing. The same stump and mug, the same seven stones. But the tent is standing and the fire is lit, and there is a second backpack.' },
  tunnel: { title: 'The drainage tunnel', text: 'The embankment was barely seven metres deep. I walked fifty-five inside it before I came out under the lookout.' },
  radio: { title: 'The lookout radio', text: '"Take the path behind the shelter. Keep the creek on your right." Then, quieter: "If you find the bridge again, don\'t cross it."' },
  finalBridge: { title: 'The bridge again', text: 'I recognise this route, but I also recognise the evidence against it. The rail is missing in the same place. The split stone is on the bank beside the narrow path.' },
  campLoop: { title: 'The wide path', text: 'The wide path keeps bringing me back. The marked track leaves the clearing.' },
};

export const RADIO_SEQUENCE = [
  { t: 0, cap: '[click]' },
  { t: 0.3, cap: '[static]', static: 2 },
  { t: 2.3, cap: '"Bellwether lookout, do you read?"', voice: 1.8 },
  { t: 6.1, cap: '"Take the path behind the shelter. Keep the creek on your right."', voice: 3.2 },
  { t: 9.3, cap: '[static]', static: 3 },
  { t: 12.4, cap: '"If you find the bridge again, don\'t cross it."', voice: 2.4, quiet: true },
  { t: 15.2, cap: '' },
];

export const ITEM_INFO = {
  water: n => ({ name: 'Water bottle', desc: `${n} / 750 mL`, actionDesc: 'Drink 250 mL\nRestores 30 hydration.' }),
  food: n => ({ name: 'Snack', desc: n ? 'One cereal bar.' : 'Eaten.', actionDesc: 'Restores 15 warmth and 30 stamina once. Does not restore hydration.' }),
  batteries: n => ({ name: 'Batteries', desc: `${n} spare battery pack${n === 1 ? '' : 's'}.`, actionDesc: 'Replace battery\nTakes two seconds. Each pack gives about 25 minutes of light.' }),
  fire: () => ({ name: 'Fire kit', desc: 'A disposable lighter.', actionDesc: 'Lights a stove or a dry fire. Cannot be discarded.' }),
  map: () => ({ name: 'Map / journal', desc: 'Folded trail map and pocket notebook.', actionDesc: 'M opens the map. J opens the journal.' }),
  notes: n => ({ name: 'Notes', desc: `${n} document${n === 1 ? '' : 's'} collected.`, actionDesc: 'Read collected documents again.' }),
};

export const CREDITS = [
  'THE WOODS REMEMBER',
  '',
  'A first-person spatial horror',
  'Built from The Woods Remember — Visual Production Bible',
  '',
  'Design, premise and art direction: the Visual Production Bible',
  'Implementation: three.js r160 (MIT) with procedural textures and audio',
  '',
  'No recorded voices. Radio and roadside dialogue are captioned with nonverbal radio static.',
  '',
  'Thank you for walking the loop.',
];
