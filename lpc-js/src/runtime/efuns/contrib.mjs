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
  // C: supports wrap (3rd arg), indent (4th arg), negative wrap = fillout mode
  // Tracks visible vs invisible (colour code) character widths for wrapping
  reg.register('terminal_colour', (args) => {
    let str = args[0].value;
    const mapping = args[1];
    const wrap = args.length > 2 ? args[2].value : 0;
    const indent = args.length > 3 ? args[3].value : 0;

    // Replace %^TAG%^ with mapping values
    // Keep track of which parts are "invisible" (colour codes) for wrapping
    const segments = []; // { text, visible }
    if (mapping.type === T_MAPPING) {
      let lastEnd = 0;
      const regex = /%\^([^%]*?)%\^/g;
      let match;
      while ((match = regex.exec(str)) !== null) {
        if (match.index > lastEnd) {
          segments.push({ text: str.slice(lastEnd, match.index), visible: true });
        }
        const tag = match[1];
        const key = mappingKey(mkString(tag));
        const entry = mapping.value.get(key);
        if (entry) {
          segments.push({ text: String(entry.value.value ?? ''), visible: false });
        }
        // Unmatched tags: silently skip (remove from output)
        lastEnd = match.index + match[0].length;
      }
      if (lastEnd < str.length) {
        segments.push({ text: str.slice(lastEnd), visible: true });
      }
      str = segments.map(s => s.text).join('');
    }

    // Word-wrap if wrap > 0
    if (wrap > 0) {
      const absWrap = Math.abs(wrap);
      const fillout = wrap < 0;
      const indentStr = indent > 0 ? ' '.repeat(indent) : '';
      const lines = [];
      const words = str.split(/( +|\n)/);
      let currentLine = '';
      let currentVisible = 0;
      let isFirst = true;

      for (const word of words) {
        if (word === '\n') {
          if (fillout) currentLine = currentLine.padEnd(absWrap);
          lines.push(currentLine);
          currentLine = isFirst ? '' : indentStr;
          currentVisible = isFirst ? 0 : indent;
          isFirst = false;
          continue;
        }
        if (word === '') continue;

        const wordLen = word.length; // simplified: treat all chars as visible
        if (currentVisible + wordLen > absWrap) {
          if (currentLine.length > 0) {
            if (fillout) currentLine = currentLine.padEnd(absWrap);
            lines.push(currentLine);
            currentLine = indentStr;
            currentVisible = indent;
            isFirst = false;
          }
          // Hard-break word into chunks
          let remaining = word.trimStart();
          while (remaining.length > 0) {
            const available = absWrap - currentVisible;
            if (remaining.length <= available) {
              currentLine += remaining;
              currentVisible += remaining.length;
              remaining = '';
            } else {
              lines.push(currentLine + remaining.slice(0, available));
              remaining = remaining.slice(available);
              currentLine = indentStr;
              currentVisible = indent;
            }
          }
        } else {
          currentLine += word;
          currentVisible += wordLen;
        }
      }
      if (currentLine) {
        if (fillout) currentLine = currentLine.padEnd(absWrap);
        lines.push(currentLine);
      }
      str = lines.join('\n');
    }

    return mkString(str);
  });

  // List functions of an object
  // C: default (flag=0) returns ALL functions (local + inherited)
  //    flag & 1: return detailed info (arrays with name, arg count, types)
  //    flag & 2: exclude inherited functions (only locally defined)
  reg.register('functions', (args) => {
    const obj = args[0].type === T_OBJECT ? args[0].value : null;
    if (!obj?.program) return mkArray([]);
    const flag = args.length > 1 ? args[1].value : 0;
    const detailed = !!(flag & 1);
    const excludeInherited = !!(flag & 2);
    const result = [];

    // Local functions
    for (const f of obj.program.functions) {
      if (detailed) {
        result.push(mkArray([mkString(f.name), mkInt(f.numArgs ?? 0)]));
      } else {
        result.push(mkString(f.name));
      }
    }

    // Inherited functions (unless flag & 2)
    if (!excludeInherited) {
      function collectInherited(program) {
        for (const inh of (program.inherits ?? [])) {
          for (const f of inh.program.functions) {
            if (detailed) {
              result.push(mkArray([mkString(f.name), mkInt(f.numArgs ?? 0)]));
            } else {
              result.push(mkString(f.name));
            }
          }
          collectInherited(inh.program);
        }
      }
      collectInherited(obj.program);
    }
    return mkArray(result);
  });

  // List variables of an object
  // C: recursively walks inheritance tree; flag != 0 returns detailed info
  reg.register('variables', (args) => {
    const obj = args[0].type === T_OBJECT ? args[0].value : null;
    if (!obj?.program) return mkArray([]);
    const flag = args.length > 1 ? args[1].value : 0;
    const result = [];

    function collectVars(program) {
      for (const v of program.variables) {
        if (flag) {
          result.push(mkArray([mkString(v.name), mkString(v.typeName ?? 'mixed')]));
        } else {
          result.push(mkString(v.name));
        }
      }
      for (const inh of (program.inherits ?? [])) {
        collectVars(inh.program);
      }
    }
    collectVars(obj.program);
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
