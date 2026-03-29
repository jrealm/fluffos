import { mkInt, mkString, mkArray, SVALUE_ZERO, T_OBJECT, T_STRING, T_FUNCTION } from '../../vm/svalue.mjs';
import { getMachine } from '../apply.mjs';

function getObjArg(args, driver) {
  if (args.length > 0 && args[0]?.type === T_OBJECT) return args[0].value;
  return driver?._currentObject ?? getMachine()?._currentObject ?? null;
}

export function registerObjectEfuns(reg, driver) {
  // object_name: returns "/" + objectId (C uses add_slash(ob->obname))
  reg.register('object_name', (args) => {
    const obj = getObjArg(args, driver);
    if (!obj) return SVALUE_ZERO;
    const name = obj.objectId;
    return mkString(name.startsWith('/') ? name : '/' + name);
  });

  // base_name: returns "/" + filename with #N and .c stripped
  // C: add_slash(ob->obname) then strip from '#' onward; FluffOS stores names without .c
  reg.register('base_name', (args) => {
    const obj = getObjArg(args, driver);
    if (!obj) return SVALUE_ZERO;
    let name = obj.objectId ?? obj.filename;
    // Strip clone suffix #N
    const hashIdx = name.indexOf('#');
    if (hashIdx !== -1) name = name.slice(0, hashIdx);
    // Strip .c extension (FluffOS object names don't include .c)
    if (name.endsWith('.c')) name = name.slice(0, -2);
    return mkString(name.startsWith('/') ? name : '/' + name);
  });

  // file_name: returns "/" + objectId (with clone #N), .c stripped
  // C: add_slash(ob->obname), which includes #N for clones
  reg.register('file_name', (args) => {
    const obj = getObjArg(args, driver);
    if (!obj) return SVALUE_ZERO;
    let name = obj.objectId;
    if (name.endsWith('.c')) name = name.slice(0, -2);
    return mkString(name.startsWith('/') ? name : '/' + name);
  });

  reg.register('all_inventory', (args) => {
    const obj = getObjArg(args, driver);
    if (!obj) return mkArray([]);
    return mkArray([...obj.inventory].map(o => ({ type: T_OBJECT, value: o })));
  });

  // deep_inventory: supports optional filter function
  reg.register('deep_inventory', (args) => {
    const target = getObjArg(args, driver);
    if (!target) return mkArray([]);
    const filterFn = args.length > 1 && args[1]?.type === T_FUNCTION ? args[1] : null;
    const vm = filterFn ? getMachine() : null;
    const result = [];

    function collect(obj) {
      for (const item of obj.inventory) {
        if (filterFn) {
          const r = vm._callFunctionPtr(filterFn.value, [{ type: T_OBJECT, value: item }]);
          const rv = r?.value ?? 0;
          if (rv & 1) result.push({ type: T_OBJECT, value: item });
          if (!(rv & 2)) collect(item); // bit 2 = don't recurse
        } else {
          result.push({ type: T_OBJECT, value: item });
          collect(item);
        }
      }
    }
    collect(target);
    return mkArray(result);
  });

  // present: calls id() apply on inventory items (C behavior)
  // Supports "item N" syntax for Nth match
  reg.register('present', (args) => {
    const arg0 = args[0];
    // Object argument: check containment
    if (arg0.type === T_OBJECT) {
      const target = arg0.value;
      const env = target.environment;
      if (!env) return SVALUE_ZERO;
      for (const item of env.inventory) {
        if (item === target) return arg0;
      }
      return SVALUE_ZERO;
    }

    const name = arg0.type === T_STRING ? arg0.value : null;
    if (!name) return SVALUE_ZERO;

    // Parse "item N" syntax
    let searchName = name;
    let nth = 1;
    const spaceIdx = name.lastIndexOf(' ');
    if (spaceIdx > 0) {
      const numPart = name.slice(spaceIdx + 1);
      const num = parseInt(numPart, 10);
      if (!isNaN(num) && num > 0) {
        searchName = name.slice(0, spaceIdx);
        nth = num;
      }
    }

    // Determine search container
    let container;
    if (args[1]?.type === T_OBJECT) {
      container = args[1].value;
    } else {
      const curObj = driver?._currentObject ?? driver?.currentObject;
      container = curObj?.environment ?? null;
    }
    if (!container) return SVALUE_ZERO;

    // Search by calling id() on each inventory item (C behavior)
    let count = 0;
    for (const item of container.inventory) {
      if (item.isDestructed?.()) continue;
      // Try calling id() apply
      let matched = false;
      try {
        const r = driver.apply('id', item, [mkString(searchName)]);
        if (r && r.value) matched = true;
      } catch {
        // Object doesn't have id() — fall back to name matching
      }
      // Fallback: match by livingName, filename, or objectId
      if (!matched) {
        if (item.livingName === searchName || item.objectId === searchName ||
            item.filename === searchName) {
          matched = true;
        }
      }
      if (matched) {
        count++;
        if (count >= nth) return { type: T_OBJECT, value: item };
      }
    }
    return SVALUE_ZERO;
  });

  // function_exists: returns "/" + program filename with .c stripped
  // C: add_slash, strip ".c", supports flag argument
  reg.register('function_exists', (args) => {
    const funcName = args[0]?.value;
    const obj = args[1]?.type === T_OBJECT ? args[1].value : getObjArg([], driver);
    if (!obj?.program || !funcName) return SVALUE_ZERO;

    for (const f of obj.program.functions) {
      if (f.name === funcName) {
        let fname = obj.program.filename;
        if (fname.endsWith('.c')) fname = fname.slice(0, -2);
        return mkString(fname.startsWith('/') ? fname : '/' + fname);
      }
    }
    for (const inh of (obj.program.inherits ?? [])) {
      for (const f of inh.program.functions) {
        if (f.name === funcName) {
          let fname = inh.program.filename;
          if (fname.endsWith('.c')) fname = fname.slice(0, -2);
          return mkString(fname.startsWith('/') ? fname : '/' + fname);
        }
      }
    }
    return SVALUE_ZERO;
  });

  // first_inventory: accepts both T_OBJECT and T_STRING (C behavior)
  reg.register('first_inventory', (args) => {
    let obj;
    if (args[0].type === T_OBJECT) {
      obj = args[0].value;
    } else if (args[0].type === T_STRING) {
      obj = driver.objects?.find(args[0].value);
    }
    if (!obj) return SVALUE_ZERO;
    const inv = obj.inventory;
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
