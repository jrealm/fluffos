import { mkString, mkInt, mkArray, T_STRING } from '../../vm/svalue.mjs';

export function registerStringEfuns(reg) {
  reg.register('capitalize', (args) => {
    const s = args[0].value;
    if (!s.length) return mkString(s);
    return mkString(s.charAt(0).toUpperCase() + s.slice(1));
  });

  reg.register('lower_case', (args) => mkString(args[0].value.toLowerCase()));
  reg.register('upper_case', (args) => mkString(args[0].value.toUpperCase()));
  reg.register('strlen', (args) => mkInt(args[0].value.length));

  // implode: only joins T_STRING elements, skips non-strings (C behavior)
  reg.register('implode', (args) => {
    const strs = [];
    for (const sv of args[0].value) {
      if (sv.type === T_STRING) strs.push(sv.value);
    }
    return mkString(strs.join(args[1].value));
  });

  // explode: strips all leading delimiters and one trailing delimiter
  // (default FluffOS behavior without REVERSIBLE_EXPLODE_STRING)
  // Empty delimiter splits into individual characters
  reg.register('explode', (args) => {
    const str = typeof args[0].value === 'string' ? args[0].value : '';
    const delim = typeof args[1].value === 'string' ? args[1].value : '';

    if (!str.length) return mkArray([]);

    // Empty delimiter: split into individual characters
    if (delim.length === 0) {
      return mkArray(str.split('').map(c => mkString(c)));
    }

    // Strip all leading delimiters
    let s = str;
    while (s.startsWith(delim)) {
      s = s.slice(delim.length);
    }

    if (!s.length) return mkArray([]);

    // Strip one trailing delimiter
    if (s.endsWith(delim)) {
      s = s.slice(0, s.length - delim.length);
    }

    if (!s.length) return mkArray([]);

    const parts = s.split(delim);
    return mkArray(parts.map(p => mkString(p)));
  });

  // replace_string: supports first/last occurrence args (4th/5th params)
  reg.register('replace_string', (args) => {
    const str = typeof args[0].value === 'string' ? args[0].value : String(args[0].value ?? '');
    const pattern = typeof args[1].value === 'string' ? args[1].value : String(args[1].value ?? '');
    const replacement = typeof args[2].value === 'string' ? args[2].value : String(args[2].value ?? '');
    const first = args[3]?.value ?? 1;  // 1-based, default 1
    const last = args[4]?.value ?? 0;   // 0 = all

    if (!pattern.length) return mkString(str);

    if (first === 1 && last === 0) {
      // Replace all (common case)
      return mkString(str.replaceAll(pattern, replacement));
    }

    // Replace specific occurrences
    let result = '';
    let pos = 0;
    let count = 0;
    while (pos <= str.length) {
      const idx = str.indexOf(pattern, pos);
      if (idx === -1) {
        result += str.slice(pos);
        break;
      }
      count++;
      result += str.slice(pos, idx);
      if (count >= first && (last === 0 || count <= last)) {
        result += replacement;
      } else {
        result += pattern;
      }
      pos = idx + pattern.length;
    }
    return mkString(result);
  });

  reg.register('trim', (args) => {
    const v = args[0].value;
    return mkString(typeof v === 'string' ? v.trim() : '');
  });

  // strsrch: flag != 0 means reverse search (not start index)
  reg.register('strsrch', (args) => {
    const str = typeof args[0].value === 'string' ? args[0].value : String(args[0].value ?? '');
    let needle = args[1].value;
    const flag = args[2]?.value ?? 0;
    // If needle is int, convert to character
    if (typeof needle === 'number') needle = String.fromCharCode(needle);
    if (typeof str !== 'string') return mkInt(-1);
    // Any non-zero flag = reverse search (lastIndexOf)
    if (flag !== 0) return mkInt(str.lastIndexOf(needle));
    return mkInt(str.indexOf(needle));
  });
}
