import { mkInt, mkString, mkFloat, mkArray, mkMapping, T_INT, T_STRING, T_FLOAT, T_ARRAY, T_MAPPING, SVALUE_ZERO, mappingKey } from '../../vm/svalue.mjs';

// Serialize an object's variables to FluffOS save format
// C: writes "#/path/to/object.c\n" header, skips NOSAVE/static vars, skips zero-valued vars
export function serializeObject(obj, saveZeros = false) {
  const lines = [];
  // Header line (C writes #filename\n)
  const fname = obj.objectId ?? obj.filename;
  lines.push('#' + (fname.startsWith('/') ? fname : '/' + fname));

  for (let i = 0; i < obj.program.variables.length; i++) {
    const v = obj.program.variables[i];
    // Skip nosave/static variables
    if (v.modifiers?.nosave || v.modifiers?.static) continue;
    const sv = obj.variables[i];
    if (!sv) continue;
    const serialized = serializeValue(sv);
    // Skip zero-valued variables unless saveZeros is set
    if (!saveZeros && serialized === '0') continue;
    lines.push(`${v.name} ${serialized}`);
  }
  return lines.join('\n') + '\n';
}

export function deserializeObject(obj, text, noClear = false) {
  const varMap = new Map();
  for (let i = 0; i < obj.program.variables.length; i++) {
    varMap.set(obj.program.variables[i].name, i);
  }

  // Clear non-static variables to 0 before restoring (unless noClear)
  if (!noClear) {
    for (let i = 0; i < obj.program.variables.length; i++) {
      const v = obj.program.variables[i];
      if (v.modifiers?.nosave || v.modifiers?.static) continue;
      obj.variables[i] = { ...SVALUE_ZERO };
    }
  }

  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    // Skip comment/header lines (C ignores lines starting with #)
    if (line.startsWith('#')) continue;
    const spaceIdx = line.indexOf(' ');
    if (spaceIdx === -1) continue;
    const name = line.slice(0, spaceIdx);
    const valueStr = line.slice(spaceIdx + 1);
    const idx = varMap.get(name);
    if (idx !== undefined) {
      obj.variables[idx] = deserializeValue(valueStr);
    }
    // TODO: call restore_lost_variable for unknown vars
  }
}

// LPC save format for strings: "..." with \n encoded as \r, only " and \ escaped
function serializeString(str) {
  let result = '"';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '\n') result += '\r';      // C encodes \n as \r
    else if (ch === '"') result += '\\"';
    else if (ch === '\\') result += '\\\\';
    else result += ch;
  }
  result += '"';
  return result;
}

// Deserialize LPC string: \r → \n, handle \\ and \"
function deserializeString(str) {
  // Strip surrounding quotes
  if (str.startsWith('"') && str.endsWith('"')) {
    str = str.slice(1, -1);
  }
  let result = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '\\' && i + 1 < str.length) {
      const next = str[i + 1];
      if (next === '"') { result += '"'; i++; }
      else if (next === '\\') { result += '\\'; i++; }
      else { result += ch; }
    } else if (ch === '\r') {
      result += '\n'; // C decodes \r back to \n
    } else {
      result += ch;
    }
  }
  return result;
}

export function serializeValue(sv) {
  switch (sv.type) {
    case T_INT: return String(sv.value);
    case T_STRING: return serializeString(sv.value);
    case T_FLOAT: {
      // C uses %f which gives 6 decimal places
      const s = sv.value.toFixed(6);
      return s;
    }
    case T_ARRAY:
      // C format: trailing comma after every element including last
      return '({' + sv.value.map(v => serializeValue(v)).join(',') + ',})';
    case T_MAPPING: {
      const pairs = [];
      for (const [, entry] of sv.value) {
        pairs.push(serializeValue(entry.key) + ':' + serializeValue(entry.value));
      }
      // C format: trailing comma after last pair
      return '([' + pairs.join(',') + ',])';
    }
    default: return '0';
  }
}

export function deserializeValue(str) {
  str = str.trim();
  if (str.startsWith('"')) {
    return mkString(deserializeString(str));
  }
  if (str.startsWith('({') && str.endsWith('})')) {
    const inner = str.slice(2, -2);
    if (inner === '' || inner === ',') return mkArray([]);
    // Handle trailing comma
    let trimmed = inner;
    if (trimmed.endsWith(',')) trimmed = trimmed.slice(0, -1);
    if (trimmed === '') return mkArray([]);
    return mkArray(splitTopLevel(trimmed).map(s => deserializeValue(s)));
  }
  if (str.startsWith('([') && str.endsWith('])')) {
    const inner = str.slice(2, -2);
    if (inner === '' || inner === ',') return mkMapping(new Map());
    let trimmed = inner;
    if (trimmed.endsWith(',')) trimmed = trimmed.slice(0, -1);
    if (trimmed === '') return mkMapping(new Map());
    const m = new Map();
    for (const pair of splitTopLevel(trimmed)) {
      const colonIdx = findTopLevelColon(pair);
      if (colonIdx >= 0) {
        const k = deserializeValue(pair.slice(0, colonIdx));
        const v = deserializeValue(pair.slice(colonIdx + 1));
        m.set(mappingKey(k), { key: k, value: v });
      }
    }
    return mkMapping(m);
  }
  if (str.includes('.')) {
    const f = parseFloat(str);
    if (!isNaN(f)) return mkFloat(f);
  }
  const n = parseInt(str, 10);
  if (!isNaN(n)) return mkInt(n);
  return SVALUE_ZERO;
}

function splitTopLevel(str) {
  const parts = [];
  let depth = 0, current = '', inString = false;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (inString) {
      current += ch;
      if (ch === '\\') { current += str[++i] ?? ''; continue; }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; current += ch; continue; }
    if (ch === '(' || ch === '[') { depth++; current += ch; continue; }
    if (ch === ')' || ch === ']') { depth--; current += ch; continue; }
    if (ch === ',' && depth === 0) { parts.push(current.trim()); current = ''; continue; }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function findTopLevelColon(str) {
  let depth = 0, inString = false;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (inString) { if (ch === '\\') { i++; continue; } if (ch === '"') inString = false; continue; }
    if (ch === '"') { inString = true; continue; }
    if (ch === '(' || ch === '[') { depth++; continue; }
    if (ch === ')' || ch === ']') { depth--; continue; }
    if (ch === ':' && depth === 0) return i;
  }
  return -1;
}

export function registerSaveEfuns(reg, driver) {
  reg.register('save_object', (args) => {
    if (!driver.currentObject) return SVALUE_ZERO;
    let savePath;
    if (args.length > 0 && args[0].type === T_STRING) {
      savePath = args[0].value;
    } else {
      const result = driver.apply('query_save_file', driver.currentObject, []);
      if (!result || result.type !== T_STRING) return SVALUE_ZERO;
      savePath = result.value;
    }
    if (!savePath.endsWith('.o')) savePath += '.o';
    const saveZeros = args.length > 1 ? !!args[1]?.value : false;
    const text = serializeObject(driver.currentObject, saveZeros);
    const writeFile = driver.efuns.registry.get('write_file');
    const rm = driver.efuns.registry.get('rm');
    if (writeFile) {
      try { if (rm) rm([mkString(savePath)]); } catch {}
      writeFile([mkString(savePath), mkString(text)]);
    }
    return mkInt(1);
  });

  reg.register('restore_object', (args) => {
    if (!driver.currentObject) return SVALUE_ZERO;
    let restorePath;
    if (args.length > 0 && args[0].type === T_STRING) {
      restorePath = args[0].value;
    } else {
      const result = driver.apply('query_save_file', driver.currentObject, []);
      if (!result || result.type !== T_STRING) return SVALUE_ZERO;
      restorePath = result.value;
    }
    if (!restorePath.endsWith('.o')) restorePath += '.o';
    const noClear = args.length > 1 ? !!args[1]?.value : false;
    const readFile = driver.efuns.registry.get('read_file');
    if (readFile) {
      const content = readFile([mkString(restorePath)]);
      if (content.type === T_STRING) {
        deserializeObject(driver.currentObject, content.value, noClear);
        return mkInt(1);
      }
    }
    return SVALUE_ZERO;
  });

  reg.register('save_variable', (args) => {
    return mkString(serializeValue(args[0]));
  });

  reg.register('restore_variable', (args) => {
    return deserializeValue(args[0].value);
  });
}
