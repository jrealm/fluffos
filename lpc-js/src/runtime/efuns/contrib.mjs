import { mkInt, mkString, mkFloat, mkArray, mkMapping, mappingKey,
         T_INT, T_STRING, T_FLOAT, T_ARRAY, T_MAPPING, T_OBJECT, T_FUNCTION,
         SVALUE_ZERO, isTruthy } from '../../vm/svalue.mjs';
import { getMachine } from '../apply.mjs';

function deepCopy(sv) {
  switch (sv.type) {
    case T_ARRAY:
      return mkArray(sv.value.map(deepCopy));
    case T_MAPPING: {
      const m = new Map();
      for (const [k, entry] of sv.value) {
        m.set(k, { key: deepCopy(entry.key), value: deepCopy(entry.value) });
      }
      return mkMapping(m);
    }
    default:
      return sv;
  }
}

export function registerContribEfuns(reg, driver) {
  // Deep copy
  reg.register('copy', (args) => {
    return deepCopy(args[0]);
  });

  // Flatten nested arrays
  reg.register('flatten', (args) => {
    if (args[0].type !== T_ARRAY) return args[0];
    const result = [];
    function walk(arr) {
      for (const item of arr) {
        if (item.type === T_ARRAY) walk(item.value);
        else result.push(item);
      }
    }
    walk(args[0].value);
    return mkArray(result);
  });

  // Shuffle array (Fisher-Yates)
  reg.register('shuffle', (args) => {
    if (args[0].type !== T_ARRAY) return args[0];
    const arr = [...args[0].value];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return mkArray(arr);
  });

  // Random element
  reg.register('element_of', (args) => {
    if (args[0].type !== T_ARRAY || args[0].value.length === 0) return SVALUE_ZERO;
    return args[0].value[Math.floor(Math.random() * args[0].value.length)];
  });

  // Max of array
  reg.register('max', (args) => {
    if (args[0].type !== T_ARRAY || args[0].value.length === 0) return SVALUE_ZERO;
    let best = args[0].value[0];
    for (let i = 1; i < args[0].value.length; i++) {
      if (args[0].value[i].value > best.value) best = args[0].value[i];
    }
    return best;
  });

  // Min of array
  reg.register('min', (args) => {
    if (args[0].type !== T_ARRAY || args[0].value.length === 0) return SVALUE_ZERO;
    let best = args[0].value[0];
    for (let i = 1; i < args[0].value.length; i++) {
      if (args[0].value[i].value < best.value) best = args[0].value[i];
    }
    return best;
  });

  // Absolute value
  reg.register('abs', (args) => {
    const v = args[0].value;
    if (args[0].type === T_FLOAT) return mkFloat(Math.abs(v));
    return mkInt(Math.abs(v));
  });

  // Repeat string
  reg.register('repeat_string', (args) => {
    const str = args[0].value;
    const n = args[1].value;
    return mkString(str.repeat(Math.max(0, n)));
  });

  // String comparison
  reg.register('strcmp', (args) => {
    const a = args[0].value;
    const b = args[1].value;
    if (a < b) return mkInt(-1);
    if (a > b) return mkInt(1);
    return SVALUE_ZERO;
  });

  // Terminal colour: replace %^TAG%^ patterns using a mapping
  reg.register('terminal_colour', (args) => {
    let str = args[0].value;
    const mapping = args[1];
    const wrap = args.length > 2 ? args[2].value : 0;
    // Replace %^TAG%^ with mapping[TAG]
    if (mapping.type === T_MAPPING) {
      str = str.replace(/%\^([^%]*?)%\^/g, (_, tag) => {
        const key = mappingKey(mkString(tag));
        const entry = mapping.value.get(key);
        return entry ? String(entry.value.value ?? '') : '';
      });
    }
    // Simple line wrapping
    if (wrap > 0) {
      const lines = [];
      let pos = 0;
      while (pos < str.length) {
        lines.push(str.slice(pos, pos + wrap));
        pos += wrap;
      }
      str = lines.join('\n');
    }
    return mkString(str);
  });

  // List functions of an object
  reg.register('functions', (args) => {
    const obj = args[0].type === T_OBJECT ? args[0].value : null;
    if (!obj?.program) return mkArray([]);
    const flag = args.length > 1 ? args[1].value : 0;
    const result = obj.program.functions.map(f => mkString(f.name));
    // flag & 1: include inherited functions (recursively)
    if (flag & 1) {
      function collectInherited(program) {
        for (const inh of program.inherits) {
          for (const f of inh.program.functions) {
            result.push(mkString(f.name));
          }
          collectInherited(inh.program);
        }
      }
      collectInherited(obj.program);
    }
    return mkArray(result);
  });

  // List variables of an object
  reg.register('variables', (args) => {
    const obj = args[0].type === T_OBJECT ? args[0].value : null;
    if (!obj?.program) return mkArray([]);
    const result = obj.program.variables.map(v => mkString(v.name));
    return mkArray(result);
  });

  // List all objects with active heart beats
  reg.register('heart_beats', () => {
    if (!driver) return mkArray([]);
    const result = [];
    for (const obj of driver.heartBeatList) {
      if (!obj.isDestructed()) result.push({ type: T_OBJECT, value: obj });
    }
    return mkArray(result);
  });

  // Filter mapping
  reg.register('filter_mapping', (args) => {
    const mapping = args[0];
    const func = args[1];
    if (mapping.type !== T_MAPPING) return SVALUE_ZERO;
    const m = new Map();
    const vm = getMachine();
    for (const [k, entry] of mapping.value) {
      let keep;
      if (func.type === T_FUNCTION) {
        keep = vm._callFunctionPtr(func.value, [entry.key, entry.value]);
      } else if (func.type === T_STRING && driver) {
        keep = driver.apply(func.value, driver.currentObject, [entry.key, entry.value]);
      } else {
        continue;
      }
      if (isTruthy(keep)) {
        m.set(k, { key: entry.key, value: entry.value });
      }
    }
    return mkMapping(m);
  });

  // Map mapping values
  reg.register('map_mapping', (args) => {
    const mapping = args[0];
    const func = args[1];
    if (mapping.type !== T_MAPPING) return SVALUE_ZERO;
    const m = new Map();
    const vm = getMachine();
    for (const [k, entry] of mapping.value) {
      let newVal;
      if (func.type === T_FUNCTION) {
        newVal = vm._callFunctionPtr(func.value, [entry.key, entry.value]);
      } else if (func.type === T_STRING) {
        newVal = driver.apply(func.value, driver.currentObject, [entry.key, entry.value]);
      } else {
        newVal = entry.value;
      }
      m.set(k, { key: entry.key, value: newVal });
    }
    return mkMapping(m);
  });
}
