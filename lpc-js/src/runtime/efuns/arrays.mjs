import { mkInt, mkArray, T_ARRAY, T_MAPPING, T_STRING } from '../../vm/svalue.mjs';

export function registerArrayEfuns(reg) {
  reg.register('sizeof', (args) => {
    const sv = args[0];
    if (sv.type === T_ARRAY) return mkInt(sv.value.length);
    if (sv.type === T_MAPPING) return mkInt(sv.value.size);
    if (sv.type === T_STRING) return mkInt(sv.value.length);
    return mkInt(0);
  });

  reg.register('member_array', (args) => {
    const arr = args[0].value;
    const target = args[1].value;
    for (let i = 0; i < arr.length; i++) {
      if (arr[i].value === target) return mkInt(i);
    }
    return mkInt(-1);
  });

  reg.register('sort_array', (args) => {
    const arr = [...args[0].value];
    arr.sort((a, b) => {
      if (a.value < b.value) return -1;
      if (a.value > b.value) return 1;
      return 0;
    });
    return mkArray(arr);
  });

  reg.register('unique_array', (args) => {
    const seen = new Set();
    const result = [];
    for (const sv of args[0].value) {
      const key = JSON.stringify(sv.value);
      if (!seen.has(key)) {
        seen.add(key);
        result.push(sv);
      }
    }
    return mkArray(result);
  });
}
