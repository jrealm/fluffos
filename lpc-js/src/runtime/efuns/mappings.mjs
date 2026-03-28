import { mkArray, SVALUE_ZERO, mappingKey, T_STRING } from '../../vm/svalue.mjs';

export function registerMappingEfuns(reg) {
  reg.register('keys', (args) => {
    const entries = [];
    for (const entry of args[0].value.values()) {
      entries.push(entry.key);
    }
    return mkArray(entries);
  });

  reg.register('values', (args) => {
    const entries = [];
    for (const entry of args[0].value.values()) {
      entries.push(entry.value);
    }
    return mkArray(entries);
  });

  reg.register('map_delete', (args) => {
    args[0].value.delete(mappingKey(args[1]));
    return SVALUE_ZERO;
  });

  reg.register('match_path', (args) => {
    const mapping = args[0].value;
    const path = args[1].value;
    let bestKey = null;
    let bestLen = -1;
    for (const [, entry] of mapping) {
      if (entry.key.type !== T_STRING) continue;
      const key = entry.key.value;
      if (path.startsWith(key) && key.length > bestLen &&
          (path.length === key.length || path[key.length] === '/')) {
        bestKey = entry.value;
        bestLen = key.length;
      }
    }
    return bestKey ?? SVALUE_ZERO;
  });
}
