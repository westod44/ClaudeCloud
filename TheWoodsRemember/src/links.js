// Route table (bible section 10 developer map + section 19 connection contract).
// source place.exit → destination place.entry, as a function of story state.
// Reverse travel normally uses the arrival return link (world.js); entries below
// are the defaults once the player has walked well away from the arrival join.

export const LAP_ENTRIES = ['westIn', 'eastIn', 'entry'];

export function makeLinkTable(S) {
  return (place, mouth) => {
    const f = S.flags;
    switch (place + '.' + mouth) {
      // Act I
      case 'car.trail': return f.radioDone ? ['final', 'far'] : ['bridge', 'west'];
      case 'bridge.west': return ['car', 'trail'];
      case 'bridge.east': return ['gully', 'S'];
      case 'gully.S': return f.gullyTrap ? ['dry', 'back'] : ['bridge', 'east'];
      case 'gully.L': return ['log', 'entry'];
      case 'dry.back': return ['gully', 'S'];
      case 'dry.on': return ['log', 'entry'];
      case 'log.entry': return ['gully', 'L'];
      case 'log.loop': return ['log', 'entry'];
      case 'log.track': return ['coldcamp', 'entry'];
      case 'coldcamp.entry': return ['log', 'track'];
      case 'coldcamp.onward': return ['junction', 'south'];
      // Act II
      case 'junction.south': return ['coldcamp', 'onward'];
      case 'junction.ranger': return ['junction', 'creek'];
      case 'junction.creek': return ['clearing', 'south'];
      case 'clearing.south': return ['junction', 'creek'];
      case 'clearing.east': return ['clearing', 'north'];
      case 'clearing.west': return ['clearing', 'south'];
      case 'clearing.north': return ['shelter', 'approach'];
      case 'shelter.approach': return f.shelterShift ? ['ridge', 'entry'] : ['clearing', 'north'];
      // Act III
      case 'ridge.entry': return ['shelter', 'approach'];
      case 'ridge.uphill': return ['ridge', 'ret'];
      case 'ridge.ret': return ['ridge', 'uphill'];
      case 'ridge.lower': return ['corridor', 'start'];
      case 'corridor.start': return f.corridorFar ? ['corridor', 'end'] : ['ridge', 'lower'];
      case 'corridor.end': return ['warmcamp', 'entry'];
      case 'warmcamp.entry': return f.radioDone ? ['bank', 'spur'] : ['corridor', 'end'];
      case 'warmcamp.broad': return f.radioDone ? ['warmcamp', LAP_ENTRIES[(f.campLaps || 0) % 3]] : ['culvert', 'approach'];
      case 'warmcamp.narrow': return f.radioDone ? ['bank', 'forkIn'] : null;
      case 'warmcamp.westIn': return ['warmcamp', 'broad'];
      case 'warmcamp.eastIn': return ['warmcamp', 'broad'];
      case 'culvert.approach': return ['warmcamp', 'broad'];
      case 'culvert.mouth': return ['tunnel', 'mouth'];
      case 'tunnel.mouth': return ['culvert', 'mouth'];
      case 'tunnel.door': return ['hut', 'tunnelDoor'];
      case 'hut.tunnelDoor': return ['tunnel', 'door'];
      case 'hut.descent': return f.radioDone ? ['final', 'entry'] : ['hut', 'descentBack'];
      case 'hut.descentBack': return ['hut', 'descent'];
      // Act IV
      case 'final.entry': return ['hut', 'descent'];
      case 'final.far': return ['car', 'trail'];
      case 'final.bank': return ['bank', 'entry'];
      case 'bank.entry': return ['final', 'bank'];
      case 'bank.forkIn': return ['warmcamp', 'narrow'];
      case 'bank.wrong': return ['bank', 'entry'];
      case 'bank.creekOn': return ['bank', 'entry'];
      case 'bank.spur': return ['warmcamp', 'entry'];
      case 'bank.road': return ['road', 'entry'];
      case 'road.entry': return ['bank', 'road'];
    }
    return null;
  };
}

// Human-readable route table for the debug view and tests.
export const CRITICAL_ROUTE = ['car', 'bridge', 'gully', 'log', 'coldcamp', 'junction', 'clearing', 'shelter', 'ridge', 'corridor', 'warmcamp', 'culvert', 'tunnel', 'hut', 'final', 'bank'];
