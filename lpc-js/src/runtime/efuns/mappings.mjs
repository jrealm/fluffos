import { mkArray, SVALUE_ZERO, mappingKey, T_STRING, T_MAPPING } from '../../vm/svalue.mjs';

export function registerMappingEfuns(reg) {
  reg.register('keys', (args) => {
    if (args[0].type !== T_MAPPING || !(args[0].value instanceof Map)) {
      return mkArray([]);
    }
    const entries = [];
    for (const entry of args[0].value.values()) {
      entries.push(entry.key);
    }
    return mkArray(entries);
  });

  reg.register('values', (args) => {
    if (args[0].type !== T_MAPPING || !(args[0].value instanceof Map)) {
      return mkArray([]);
    }
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

  // match_path: matches path against mapping keys using incremental path component search
  // C algorithm: walks path char by char, builds substrings at each '/', looks up each
  // in the mapping, keeps the last (most specific) match. Normalizes consecutive '/'
  // and strips trailing '/' (unless path is just "/").
  reg.register('match_path', (args) => {
    const mapping = args[0].value;
    let path = args[1].value;

    // Normalize: collapse consecutive '/' and strip trailing '/'
    path = path.replace(/\/+/g, '/');
    if (path.length > 1 && path.endsWith('/')) {
      path = path.slice(0, -1);
    }

    // Walk path building substrings at each '/' boundary
    let bestValue = null;
    let sub = '';
    for (let i = 0; i < path.length; i++) {
      sub += path[i];
      if (path[i] === '/' || i === path.length - 1) {
        // At a '/' boundary, sub ends with '/' — check both with and without
        const bare = sub.endsWith('/') && sub.length > 1 ? sub.slice(0, -1) : sub;
        const key1 = mappingKey({ type: T_STRING, value: bare });
        if (mapping.has(key1)) bestValue = mapping.get(key1).value;
        const key2 = mappingKey({ type: T_STRING, value: bare + '/' });
        if (mapping.has(key2)) bestValue = mapping.get(key2).value;
      }
    }
    return bestValue ?? SVALUE_ZERO;
  });
}
