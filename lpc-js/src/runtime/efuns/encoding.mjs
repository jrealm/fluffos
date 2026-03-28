import { mkInt, mkString, mkArray, T_INT, T_STRING, T_ARRAY, SVALUE_ZERO } from '../../vm/svalue.mjs';

// East Asian Width lookup — characters that take 2 columns
// Covers CJK Unified Ideographs, Hangul, Fullwidth Forms, etc.
function isWide(cp) {
  return (
    (cp >= 0x1100 && cp <= 0x115F) ||   // Hangul Jamo
    (cp >= 0x2E80 && cp <= 0x303E) ||   // CJK Radicals, Kangxi, Ideographic
    (cp >= 0x3041 && cp <= 0x33BF) ||   // Hiragana, Katakana, Bopomofo, CJK Compatibility
    (cp >= 0x3400 && cp <= 0x4DBF) ||   // CJK Unified Ideographs Extension A
    (cp >= 0x4E00 && cp <= 0x9FFF) ||   // CJK Unified Ideographs
    (cp >= 0xA000 && cp <= 0xA4CF) ||   // Yi
    (cp >= 0xAC00 && cp <= 0xD7AF) ||   // Hangul Syllables
    (cp >= 0xF900 && cp <= 0xFAFF) ||   // CJK Compatibility Ideographs
    (cp >= 0xFE30 && cp <= 0xFE6F) ||   // CJK Compatibility Forms
    (cp >= 0xFF01 && cp <= 0xFF60) ||   // Fullwidth Forms
    (cp >= 0xFFE0 && cp <= 0xFFE6) ||   // Fullwidth Signs
    (cp >= 0x20000 && cp <= 0x2FA1F)    // CJK Unified Extensions B-F, Compat Supplement
  );
}

export function registerEncodingEfuns(reg, driver) {
  // set_encoding: set character encoding for a connection
  reg.register('set_encoding', (args) => {
    const encoding = args[0].value;
    const obj = driver?.currentObject;
    if (obj?.interactive) {
      obj.interactive.encoding = encoding;
    }
    return SVALUE_ZERO;
  });

  // to_utf8: convert string from given encoding to UTF-8
  reg.register('to_utf8', (args) => {
    const str = args[0].value;
    const fromEncoding = args[1].value;
    try {
      const buf = Buffer.from(str, 'binary');
      const decoder = new TextDecoder(fromEncoding);
      const decoded = decoder.decode(buf);
      return mkString(decoded);
    } catch {
      return mkString(str);
    }
  });

  // utf8_to: convert UTF-8 string to given encoding
  reg.register('utf8_to', (args) => {
    const str = args[0].value;
    const toEncoding = args[1].value;
    try {
      const encoder = new TextEncoder();
      const buf = encoder.encode(str);
      // Node.js Buffer supports encoding conversion
      const result = Buffer.from(buf).toString(toEncoding === 'utf-8' ? 'utf8' : 'binary');
      return mkString(result);
    } catch {
      return mkString(str);
    }
  });

  // str_to_arr: convert string to array of Unicode codepoints
  reg.register('str_to_arr', (args) => {
    const str = args[0].value;
    const codepoints = [];
    for (const ch of str) {
      codepoints.push(mkInt(ch.codePointAt(0)));
    }
    return mkArray(codepoints);
  });

  // arr_to_str: convert array of codepoints to string
  reg.register('arr_to_str', (args) => {
    if (args[0].type !== T_ARRAY) return mkString('');
    const chars = args[0].value.map(sv => String.fromCodePoint(sv.value));
    return mkString(chars.join(''));
  });

  // strwidth: calculate display width of a string (CJK aware)
  reg.register('strwidth', (args) => {
    const str = args[0].value;
    let width = 0;
    for (const ch of str) {
      const cp = ch.codePointAt(0);
      width += isWide(cp) ? 2 : 1;
    }
    return mkInt(width);
  });
}
