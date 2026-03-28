import { mkInt, mkString, mkArray, SVALUE_ZERO, T_OBJECT, T_STRING } from '../../vm/svalue.mjs';

export function registerObjectEfuns(reg) {
  reg.register('object_name', (args) => {
    if (args[0].type !== T_OBJECT) return SVALUE_ZERO;
    return mkString(args[0].value.objectId);
  });

  reg.register('base_name', (args) => {
    if (args[0].type !== T_OBJECT) return SVALUE_ZERO;
    return mkString(args[0].value.filename);
  });

  reg.register('file_name', (args) => {
    if (args[0].type !== T_OBJECT) return SVALUE_ZERO;
    const fname = args[0].value.filename;
    return mkString(fname.endsWith('.c') ? fname.slice(0, -2) : fname);
  });

  reg.register('all_inventory', (args) => {
    if (args[0].type !== T_OBJECT) return mkArray([]);
    return mkArray([...args[0].value.inventory].map(o => ({ type: T_OBJECT, value: o })));
  });

  reg.register('deep_inventory', (args) => {
    if (args[0].type !== T_OBJECT) return mkArray([]);
    const result = [];
    function collect(obj) {
      for (const item of obj.inventory) {
        result.push({ type: T_OBJECT, value: item });
        collect(item);
      }
    }
    collect(args[0].value);
    return mkArray(result);
  });

  reg.register('present', (args) => {
    const name = args[0].type === T_STRING ? args[0].value : null;
    const container = args[1]?.type === T_OBJECT ? args[1].value : null;
    if (!name || !container) return SVALUE_ZERO;
    for (const item of container.inventory) {
      if (item.filename === name || item.objectId === name) {
        return { type: T_OBJECT, value: item };
      }
    }
    return SVALUE_ZERO;
  });

  reg.register('function_exists', (args) => {
    const funcName = args[0].value;
    const obj = args[1]?.type === T_OBJECT ? args[1].value : null;
    if (!obj?.program) return SVALUE_ZERO;
    for (const f of obj.program.functions) {
      if (f.name === funcName) return mkString(obj.program.filename);
    }
    for (const inh of (obj.program.inherits ?? [])) {
      for (const f of inh.program.functions) {
        if (f.name === funcName) return mkString(inh.program.filename);
      }
    }
    return SVALUE_ZERO;
  });

  reg.register('first_inventory', (args) => {
    if (args[0].type !== T_OBJECT) return SVALUE_ZERO;
    const inv = args[0].value.inventory;
    const first = inv.values().next();
    if (first.done) return SVALUE_ZERO;
    return { type: T_OBJECT, value: first.value };
  });

  reg.register('next_inventory', (args) => {
    if (args[0].type !== T_OBJECT) return SVALUE_ZERO;
    const obj = args[0].value;
    const env = obj.environment;
    if (!env) return SVALUE_ZERO;
    const iter = env.inventory.values();
    let found = false;
    for (const item of iter) {
      if (found) return { type: T_OBJECT, value: item };
      if (item === obj) found = true;
    }
    return SVALUE_ZERO;
  });
}
