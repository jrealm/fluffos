import { mkInt, mkString, mkFloat, mkArray, mkMapping, T_INT, T_STRING, T_FLOAT, T_ARRAY, T_MAPPING, SVALUE_ZERO } from '../../vm/svalue.mjs';

export function serializeObject(obj) {
  const lines = [];
  for (let i = 0; i < obj.program.variables.length; i++) {
    const v = obj.program.variables[i];
    const sv = obj.variables[i];
    lines.push(`${v.name} ${serializeValue(sv)}`);
  }
  return lines.join('\n') + '\n';
}

export function deserializeObject(obj, text) {
  const varMap = new Map();
  for (let i = 0; i < obj.program.variables.length; i++) {
    varMap.set(obj.program.variables[i].name, i);
  }
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    const spaceIdx = line.indexOf(' ');
    if (spaceIdx === -1) continue;
    const name = line.slice(0, spaceIdx);
    const valueStr = line.slice(spaceIdx + 1);
    const idx = varMap.get(name);
    if (idx !== undefined) {
      obj.variables[idx] = deserializeValue(valueStr);
    }
  }
}

function serializeValue(sv) {
  switch (sv.type) {
    case T_INT: return String(sv.value);
    case T_STRING: return JSON.stringify(sv.value);
    case T_FLOAT: return String(sv.value);
    case T_ARRAY: return '({' + sv.value.map(v => serializeValue(v)).join(',') + '})';
    case T_MAPPING: {
      const pairs = [];
      for (const [k, v] of sv.value) {
        pairs.push(serializeValue(mkString(String(k))) + ':' + serializeValue(v));
      }
      return '([' + pairs.join(',') + '])';
    }
    default: return '0';
  }
}

function deserializeValue(str) {
  str = str.trim();
  if (str.startsWith('"')) {
    try { return mkString(JSON.parse(str)); } catch { return mkString(str.slice(1, -1)); }
  }
  if (str.startsWith('({') && str.endsWith('})')) {
    const inner = str.slice(2, -2);
    if (inner === '') return mkArray([]);
    return mkArray(splitTopLevel(inner).map(s => deserializeValue(s)));
  }
  if (str.startsWith('([') && str.endsWith('])')) {
    const inner = str.slice(2, -2);
    if (inner === '') return mkMapping(new Map());
    const m = new Map();
    for (const pair of splitTopLevel(inner)) {
      const colonIdx = findTopLevelColon(pair);
      if (colonIdx >= 0) {
        const k = deserializeValue(pair.slice(0, colonIdx));
        const v = deserializeValue(pair.slice(colonIdx + 1));
        m.set(k.value, v);
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
    const text = serializeObject(driver.currentObject);
    const writeFile = driver.efuns.registry.get('write_file');
    const rm = driver.efuns.registry.get('rm');
    if (writeFile) {
      try { if (rm) rm([mkString(args[0].value)]); } catch {}
      writeFile([mkString(args[0].value), mkString(text)]);
    }
    return mkInt(1);
  });

  reg.register('restore_object', (args) => {
    if (!driver.currentObject) return SVALUE_ZERO;
    const readFile = driver.efuns.registry.get('read_file');
    if (readFile) {
      const content = readFile([mkString(args[0].value)]);
      if (content.type === T_STRING) {
        deserializeObject(driver.currentObject, content.value);
        return mkInt(1);
      }
    }
    return SVALUE_ZERO;
  });
}
