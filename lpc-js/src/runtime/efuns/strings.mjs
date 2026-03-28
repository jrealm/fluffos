import { mkString, mkInt, mkArray } from '../../vm/svalue.mjs';

export function registerStringEfuns(reg) {
  reg.register('capitalize', (args) => {
    const s = args[0].value;
    return mkString(s.charAt(0).toUpperCase() + s.slice(1));
  });

  reg.register('lower_case', (args) => mkString(args[0].value.toLowerCase()));
  reg.register('upper_case', (args) => mkString(args[0].value.toUpperCase()));
  reg.register('strlen', (args) => mkInt(args[0].value.length));

  reg.register('implode', (args) => {
    const arr = args[0].value.map(sv => sv.value);
    return mkString(arr.join(args[1].value));
  });

  reg.register('explode', (args) => {
    const parts = args[0].value.split(args[1].value);
    return mkArray(parts.map(p => mkString(p)));
  });

  reg.register('replace_string', (args) => {
    return mkString(args[0].value.replaceAll(args[1].value, args[2].value));
  });

  reg.register('trim', (args) => mkString(args[0].value.trim()));

  reg.register('strsrch', (args) => {
    const str = args[0].value;
    let needle = args[1].value;
    const flag = args[2]?.value ?? 0;
    // If needle is int, convert to character
    if (typeof needle === 'number') needle = String.fromCharCode(needle);
    // flag -1 = reverse search (lastIndexOf)
    if (flag === -1) return mkInt(str.lastIndexOf(needle));
    return mkInt(str.indexOf(needle, flag));
  });
}
