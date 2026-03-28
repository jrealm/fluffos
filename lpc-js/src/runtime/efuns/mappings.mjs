import { mkArray, mkString, SVALUE_ZERO } from '../../vm/svalue.mjs';

export function registerMappingEfuns(reg) {
  reg.register('keys', (args) => {
    const entries = [];
    for (const key of args[0].value.keys()) {
      entries.push(mkString(String(key)));
    }
    return mkArray(entries);
  });

  reg.register('values', (args) => {
    const entries = [];
    for (const val of args[0].value.values()) {
      entries.push(val);
    }
    return mkArray(entries);
  });

  reg.register('map_delete', (args) => {
    args[0].value.delete(args[1].value);
    return SVALUE_ZERO;
  });
}
