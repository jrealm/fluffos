import { mkInt, mkString, mkFloat, T_INT, T_STRING, T_FLOAT, T_ARRAY, T_MAPPING, T_OBJECT, T_FUNCTION, T_BUFFER, SVALUE_ZERO } from '../../vm/svalue.mjs';

const TYPE_NAMES = {
  [T_INT]: 'int',
  [T_STRING]: 'string',
  [T_FLOAT]: 'float',
  [T_ARRAY]: 'array',
  [T_MAPPING]: 'mapping',
  [T_OBJECT]: 'object',
  [T_FUNCTION]: 'function',
  [T_BUFFER]: 'buffer',
};

export function registerMiscEfuns(reg) {
  reg.register('typeof', (args) => {
    return mkString(TYPE_NAMES[args[0].type] ?? 'unknown');
  });

  reg.register('to_int', (args) => {
    const sv = args[0];
    if (sv.type === T_STRING) return mkInt(parseInt(sv.value, 10) || 0);
    if (sv.type === T_FLOAT) return mkInt(Math.trunc(sv.value));
    if (sv.type === T_INT) return sv;
    return mkInt(0);
  });

  reg.register('to_string', (args) => {
    return mkString(String(args[0].value));
  });

  reg.register('to_float', (args) => {
    const sv = args[0];
    if (sv.type === T_INT) return mkFloat(sv.value);
    if (sv.type === T_STRING) return mkFloat(parseFloat(sv.value) || 0);
    if (sv.type === T_FLOAT) return sv;
    return mkFloat(0);
  });

  reg.register('random', (args) => {
    return mkInt(Math.floor(Math.random() * args[0].value));
  });

  reg.register('time', () => {
    return mkInt(Math.floor(Date.now() / 1000));
  });

  reg.register('sprintf', (args) => {
    let fmt = args[0].value;
    let argIdx = 1;
    const result = fmt.replace(/%[sd%]/g, (match) => {
      if (match === '%%') return '%';
      if (match === '%s') return String(args[argIdx++]?.value ?? '');
      if (match === '%d') return String(Number(args[argIdx++]?.value ?? 0));
      return match;
    });
    return mkString(result);
  });

  reg.register('write', () => SVALUE_ZERO);
}
