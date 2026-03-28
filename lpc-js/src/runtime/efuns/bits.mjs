import { mkInt, mkString } from '../../vm/svalue.mjs';

const BASE = 0x30; // '0' = 0

export function registerBitEfuns(reg) {
  reg.register('set_bit', (args) => {
    const str = args[0].value;
    const bit = args[1].value;
    const charIdx = Math.floor(bit / 6);
    const bitIdx = bit % 6;

    let chars = [...str];
    while (chars.length <= charIdx) chars.push(String.fromCharCode(BASE));

    const val = chars[charIdx].charCodeAt(0) - BASE;
    chars[charIdx] = String.fromCharCode((val | (1 << bitIdx)) + BASE);
    return mkString(chars.join(''));
  });

  reg.register('clear_bit', (args) => {
    const str = args[0].value;
    const bit = args[1].value;
    const charIdx = Math.floor(bit / 6);
    const bitIdx = bit % 6;

    if (charIdx >= str.length) return mkString(str);
    let chars = [...str];
    const val = chars[charIdx].charCodeAt(0) - BASE;
    chars[charIdx] = String.fromCharCode((val & ~(1 << bitIdx)) + BASE);
    return mkString(chars.join(''));
  });

  reg.register('test_bit', (args) => {
    const str = args[0].value;
    const bit = args[1].value;
    const charIdx = Math.floor(bit / 6);
    const bitIdx = bit % 6;

    if (charIdx >= str.length) return mkInt(0);
    const val = str.charCodeAt(charIdx) - BASE;
    return mkInt((val >> bitIdx) & 1);
  });

  reg.register('next_bit', (args) => {
    const str = args[0].value;
    const start = args[1].value;

    for (let bit = start; ; bit++) {
      const charIdx = Math.floor(bit / 6);
      if (charIdx >= str.length) return mkInt(-1);
      const val = str.charCodeAt(charIdx) - BASE;
      const bitIdx = bit % 6;
      if ((val >> bitIdx) & 1) return mkInt(bit);
    }
  });
}
