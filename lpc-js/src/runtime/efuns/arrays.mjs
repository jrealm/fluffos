import { mkInt, mkArray, T_ARRAY, T_MAPPING, T_STRING, T_INT, T_FUNCTION, SVALUE_ZERO } from '../../vm/svalue.mjs';
import { getMachine } from '../apply.mjs';

export function registerArrayEfuns(reg) {
  reg.register('sizeof', (args) => {
    const sv = args[0];
    if (sv.type === T_ARRAY) return mkInt(sv.value.length);
    if (sv.type === T_MAPPING) return mkInt(sv.value.size);
    if (sv.type === T_STRING) return mkInt(sv.value.length);
    return mkInt(0);
  });

  // member_array: supports start index (3rd arg) and reverse search flag (4th arg)
  // C: flag & 2 = reverse search. Also supports string search (find char in string)
  reg.register('member_array', (args) => {
    const item = args[0];
    const container = args[1];
    const startIdx = args[2]?.value ?? 0;
    const flag = args[3]?.value ?? 0;

    // String mode: search for character in string
    if (container.type === T_STRING) {
      const str = container.value;
      const ch = item.type === T_INT ? String.fromCharCode(item.value) : String(item.value);
      if (flag & 2) { // reverse search
        return mkInt(str.lastIndexOf(ch));
      }
      return mkInt(str.indexOf(ch, startIdx));
    }

    // Array mode
    if (container.type !== T_ARRAY) return mkInt(-1);
    const arr = container.value;
    const target = item.value;

    if (flag & 2) { // reverse search
      for (let i = arr.length - 1; i >= 0; i--) {
        if (arr[i].value === target && arr[i].type === item.type) return mkInt(i);
      }
    } else {
      for (let i = startIdx; i < arr.length; i++) {
        if (arr[i].value === target && arr[i].type === item.type) return mkInt(i);
      }
    }
    return mkInt(-1);
  });

  // sort_array: supports comparator function or direction flag
  // C: int arg: positive=asc, negative=desc, 0=no sort
  //    function arg: custom comparator (returns <0, 0, >0)
  reg.register('sort_array', (args) => {
    if (args[0].type !== T_ARRAY || !args[0].value) return mkArray([]);
    const arr = [...args[0].value];
    const cmp = args[1];

    if (!cmp || (cmp.type === T_INT && cmp.value === 0)) {
      return mkArray(arr); // no sort
    }

    if (cmp.type === T_FUNCTION) {
      const vm = getMachine();
      arr.sort((a, b) => {
        const r = vm._callFunctionPtr(cmp.value, [a, b]);
        return r?.value ?? 0;
      });
    } else if (cmp.type === T_INT) {
      const dir = cmp.value > 0 ? 1 : -1;
      arr.sort((a, b) => {
        if (a.value < b.value) return -1 * dir;
        if (a.value > b.value) return 1 * dir;
        return 0;
      });
    } else if (cmp.type === T_STRING) {
      // String name callback: call named function on current object
      const vm = getMachine();
      arr.sort((a, b) => {
        const r = vm.driver?.apply(cmp.value, vm._currentObject, [a, b]);
        return r?.value ?? 0;
      });
    }
    return mkArray(arr);
  });

  // unique_array: groups elements by function result, returns array of arrays
  // C: unique_array(arr, func, [skipval])
  // Calls func on each element, groups by return value
  reg.register('unique_array', (args) => {
    const arr = args[0].value;
    const func = args[1];
    const skipVal = args[2]; // optional: skip elements whose func result matches this
    const vm = getMachine();
    const groups = new Map();
    const groupOrder = [];

    for (const item of arr) {
      let key;
      if (func.type === T_FUNCTION) {
        key = vm._callFunctionPtr(func.value, [item]);
      } else if (func.type === T_STRING) {
        key = vm.driver?.apply(func.value, item.value, []);
      }
      if (!key) continue;

      // Skip if matches skipval
      if (skipVal && key.type === skipVal.type && key.value === skipVal.value) continue;

      const mk = `${key.type}:${key.value}`;
      if (!groups.has(mk)) {
        groups.set(mk, []);
        groupOrder.push(mk);
      }
      groups.get(mk).push(item);
    }

    return mkArray(groupOrder.map(k => mkArray(groups.get(k))));
  });

  // allocate: supports fill value or generator function as 2nd arg
  // C: allocate(n) fills with 0, allocate(n, val) fills with val,
  //    allocate(n, func) calls func(i) for each index
  reg.register('allocate', (args) => {
    const n = args[0].value;
    if (n <= 0) return mkArray([]);
    const fill = args[1];

    if (!fill) {
      return mkArray(Array.from({ length: n }, () => ({ ...SVALUE_ZERO })));
    }

    if (fill.type === T_FUNCTION) {
      const vm = getMachine();
      return mkArray(Array.from({ length: n }, (_, i) => {
        return vm._callFunctionPtr(fill.value, [mkInt(i)]) ?? { ...SVALUE_ZERO };
      }));
    }

    // Fill with copies of the value
    return mkArray(Array.from({ length: n }, () => ({ ...fill })));
  });

  reg.register('filter_array', (args) => {
    const arr = args[0].type === T_ARRAY ? args[0].value : [];
    if (!arr || !Array.isArray(arr)) return mkArray([]);
    const fp = args[1];
    const vm = getMachine();
    const result = [];
    for (const item of arr) {
      let r;
      if (fp.type === T_FUNCTION) {
        r = vm._callFunctionPtr(fp.value, [item]);
      } else if (fp.type === T_STRING) {
        r = vm.driver?.apply(fp.value, item.value, args.slice(2));
      }
      if (r && r.value) result.push(item);
    }
    return mkArray(result);
  });

  reg.register('map_array', (args) => {
    const arr = args[0].value;
    const fp = args[1];
    const vm = getMachine();
    const result = [];
    for (const item of arr) {
      let r;
      if (fp.type === T_FUNCTION) {
        r = vm._callFunctionPtr(fp.value, [item]);
      } else if (fp.type === T_STRING) {
        r = vm.driver?.apply(fp.value, item.value, args.slice(2));
      }
      if (r == null) break; // C breaks on null return
      result.push(r);
    }
    // Fill remaining with zero if we broke early
    while (result.length < arr.length) result.push({ ...SVALUE_ZERO });
    return mkArray(result);
  });
}
