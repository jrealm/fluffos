import { mkInt, mkString, mkArray, SVALUE_ZERO } from '../../vm/svalue.mjs';

export function registerRegexEfuns(reg) {
  reg.register('regexp', (args) => {
    const arr = args[0].value;
    const pattern = args[1].value;
    const re = new RegExp(pattern);
    return mkArray(arr.filter(sv => re.test(sv.value)));
  });

  reg.register('reg_assoc', (args) => {
    const str = args[0].value;
    const patterns = args[1].value.map(sv => sv.value);
    const tokens = args[2].value.map(sv => sv.value);
    const defaultToken = args[3]?.value ?? 0;

    const fragments = [];
    const fragmentTokens = [];
    let pos = 0;

    while (pos < str.length) {
      let bestMatch = null;
      let bestIdx = -1;

      for (let i = 0; i < patterns.length; i++) {
        const re = new RegExp(patterns[i], 'g');
        re.lastIndex = pos;
        const m = re.exec(str);
        if (m && m.index === pos) {
          if (!bestMatch || m[0].length > bestMatch[0].length) {
            bestMatch = m;
            bestIdx = i;
          }
        }
      }

      if (bestMatch && bestMatch.index === pos) {
        fragments.push(mkString(bestMatch[0]));
        fragmentTokens.push(mkInt(tokens[bestIdx] ?? defaultToken));
        pos += bestMatch[0].length;
      } else {
        let nextMatchPos = str.length;
        for (let i = 0; i < patterns.length; i++) {
          const re = new RegExp(patterns[i], 'g');
          re.lastIndex = pos;
          const m = re.exec(str);
          if (m && m.index < nextMatchPos) nextMatchPos = m.index;
        }
        fragments.push(mkString(str.slice(pos, nextMatchPos)));
        fragmentTokens.push(mkInt(defaultToken));
        pos = nextMatchPos;
      }
    }

    return mkArray([mkArray(fragments), mkArray(fragmentTokens)]);
  });

  reg.register('pcre_match', (args) => {
    return mkInt(new RegExp(args[1].value).test(args[0].value) ? 1 : 0);
  });
}
