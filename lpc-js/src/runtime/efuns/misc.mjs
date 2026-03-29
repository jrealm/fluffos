import { mkInt, mkString, mkFloat, mkArray, mkMapping, mkFunction, mappingKey,
         T_INT, T_STRING, T_FLOAT, T_ARRAY, T_MAPPING, T_OBJECT, T_FUNCTION, T_BUFFER,
         SVALUE_ZERO, SVALUE_UNDEFINED } from '../../vm/svalue.mjs';
import { getMachine } from '../apply.mjs';
import { createHash } from 'node:crypto';
import { hostname } from 'node:os';
import { Buffer } from 'node:buffer';

// CRC32 lookup table (FluffOS uses non-standard CRC32: no final XOR)
const crc32Table = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crc32Table[i] = c;
}

function computeCrc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = crc32Table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  // FluffOS does NOT do final XOR (non-standard)
  return crc >>> 0;
}

export function registerMiscEfuns(reg) {
  reg.register('to_int', (args) => {
    const sv = args[0];
    if (sv.type === T_STRING) {
      const n = parseInt(sv.value, 10);
      return isNaN(n) ? SVALUE_UNDEFINED : mkInt(n);
    }
    if (sv.type === T_FLOAT) return mkInt(Math.trunc(sv.value));
    if (sv.type === T_INT) return sv;
    return SVALUE_UNDEFINED;
  });

  reg.register('to_string', (args) => {
    return mkString(String(args[0].value));
  });

  reg.register('to_float', (args) => {
    const sv = args[0];
    if (sv.type === T_INT) return mkFloat(sv.value);
    if (sv.type === T_STRING) return mkFloat(parseFloat(sv.value) || 0);
    if (sv.type === T_FLOAT) return sv;
    return mkFloat(0);
  });

  // random: returns 0 for n <= 0 (C behavior)
  reg.register('random', (args) => {
    const n = args[0].value;
    if (n <= 0) return mkInt(0);
    return mkInt(Math.floor(Math.random() * n));
  });

  reg.register('time', () => {
    return mkInt(Math.floor(Date.now() / 1000));
  });

  // write is registered in interactive.mjs with proper command_giver logic
  reg.register('write', () => SVALUE_ZERO);

  reg.register('evaluate', (args) => {
    const fp = args[0];
    if (fp.type !== T_FUNCTION) return fp;
    const vm = getMachine();
    return vm._callFunctionPtr(fp.value, args.slice(1));
  });

  // sscanf: supports %d, %s, %f, %x, %%, %*d, %*s
  // %s without trailing delimiter consumes entire remaining input (C behavior)
  // %s followed by %d: scan forward to find digit start
  reg.register('sscanf', (args) => {
    const input = args[0].value;
    const format = args[1].value;
    const results = [];
    let inputPos = 0;
    let fmtPos = 0;
    let matchCount = 0;

    while (fmtPos < format.length && inputPos <= input.length) {
      if (format[fmtPos] === '%') {
        fmtPos++;
        if (fmtPos >= format.length) break;
        let suppress = false;
        if (format[fmtPos] === '*') { suppress = true; fmtPos++; }
        const spec = format[fmtPos++];

        if (spec === 'd') {
          let numStr = '';
          if (inputPos < input.length && (input[inputPos] === '-' || input[inputPos] === '+')) {
            numStr += input[inputPos++];
          }
          while (inputPos < input.length && input[inputPos] >= '0' && input[inputPos] <= '9') {
            numStr += input[inputPos++];
          }
          if (numStr === '' || numStr === '-' || numStr === '+') break;
          if (!suppress) results.push(mkInt(parseInt(numStr, 10)));
          matchCount++;
        } else if (spec === 'f') {
          let numStr = '';
          if (inputPos < input.length && (input[inputPos] === '-' || input[inputPos] === '+')) {
            numStr += input[inputPos++];
          }
          while (inputPos < input.length && ((input[inputPos] >= '0' && input[inputPos] <= '9') || input[inputPos] === '.')) {
            numStr += input[inputPos++];
          }
          if (numStr === '' || numStr === '-' || numStr === '+') break;
          if (!suppress) results.push(mkFloat(parseFloat(numStr)));
          matchCount++;
        } else if (spec === 'x') {
          let numStr = '';
          // Skip optional 0x prefix
          if (inputPos + 1 < input.length && input[inputPos] === '0' && (input[inputPos + 1] === 'x' || input[inputPos + 1] === 'X')) {
            inputPos += 2;
          }
          while (inputPos < input.length && /[0-9a-fA-F]/.test(input[inputPos])) {
            numStr += input[inputPos++];
          }
          if (numStr === '') break;
          if (!suppress) results.push(mkInt(parseInt(numStr, 16)));
          matchCount++;
        } else if (spec === 's') {
          // Determine what follows %s to know when to stop
          let endStr = null;
          let nextIsPercent = false;

          if (fmtPos < format.length) {
            if (format[fmtPos] === '%') {
              nextIsPercent = true;
              // Peek at next spec to determine delimiter
              const peekPos = fmtPos + 1 + (format[fmtPos + 1] === '*' ? 1 : 0);
              if (peekPos < format.length) {
                const nextSpec = format[peekPos];
                if (nextSpec === 'd' || nextSpec === 'x') {
                  // %s%d or %s%x: scan forward to find where digit/hex starts
                  let str = '';
                  const savedInputPos = inputPos;
                  // Find the position where a number starts
                  let numStart = inputPos;
                  while (numStart < input.length) {
                    if ((input[numStart] >= '0' && input[numStart] <= '9') ||
                        (input[numStart] === '-' && numStart + 1 < input.length && input[numStart + 1] >= '0' && input[numStart + 1] <= '9')) {
                      break;
                    }
                    numStart++;
                  }
                  str = input.slice(inputPos, numStart);
                  inputPos = numStart;
                  if (!suppress) results.push(mkString(str));
                  matchCount++;
                  continue;
                }
              }
            } else {
              // Next char is a literal delimiter
              endStr = format[fmtPos];
            }
          }

          let str = '';
          if (endStr) {
            while (inputPos < input.length && input[inputPos] !== endStr) {
              str += input[inputPos++];
            }
          } else {
            // No following delimiter: consume entire remaining input (C behavior)
            str = input.slice(inputPos);
            inputPos = input.length;
          }
          if (!suppress) results.push(mkString(str));
          matchCount++;
        } else if (spec === '%') {
          if (inputPos >= input.length || input[inputPos] !== '%') break;
          inputPos++;
        } else if (spec === '(') {
          // %(regexp) pattern matching
          let pattern = '';
          while (fmtPos < format.length && format[fmtPos] !== ')') {
            pattern += format[fmtPos++];
          }
          if (fmtPos < format.length) fmtPos++; // skip ')'
          try {
            const re = new RegExp(pattern, 'y');
            re.lastIndex = inputPos;
            const m = re.exec(input);
            if (!m) break;
            if (!suppress) results.push(mkString(m[0]));
            inputPos += m[0].length;
            matchCount++;
          } catch {
            break;
          }
        }
      } else {
        if (inputPos >= input.length || input[inputPos] !== format[fmtPos]) break;
        inputPos++;
        fmtPos++;
      }
    }
    // Write results back to caller's variables (args[2], args[3], ...)
    // This works because args[] are references to the same svalue objects in locals
    for (let i = 0; i < results.length && i + 2 < args.length; i++) {
      const target = args[i + 2];
      if (Object.isFrozen(target)) continue; // Skip frozen svalues (SVALUE_ZERO etc.)
      target.type = results[i].type;
      target.value = results[i].value;
    }
    return mkInt(matchCount);
  });

  reg.register('allocate_mapping', () => {
    return mkMapping(new Map());
  });

  // localtime: returns 11-element array matching C struct
  // [sec, min, hour, mday, mon, year(full), wday, yday, gmtoff, zone, isdst]
  reg.register('localtime', (args) => {
    const ts = args[0].value * 1000;
    const d = new Date(ts);
    const gmtoff = -d.getTimezoneOffset() * 60; // offset in seconds east of UTC
    const jan1 = new Date(d.getFullYear(), 0, 1);
    const yday = Math.floor((d - jan1) / 86400000);
    // Check DST: compare current offset with January offset
    const janOffset = jan1.getTimezoneOffset();
    const isDst = d.getTimezoneOffset() < janOffset ? 1 : 0;
    // Get timezone abbreviation
    const zone = d.toLocaleTimeString('en-US', { timeZoneName: 'short' }).split(' ').pop() || '';

    return mkArray([
      mkInt(d.getSeconds()),      // LT_SEC   0
      mkInt(d.getMinutes()),      // LT_MIN   1
      mkInt(d.getHours()),        // LT_HOUR  2
      mkInt(d.getDate()),         // LT_MDAY  3
      mkInt(d.getMonth()),        // LT_MON   4
      mkInt(d.getFullYear()),     // LT_YEAR  5 — C returns tm_year+1900 (full year)
      mkInt(d.getDay()),          // LT_WDAY  6
      mkInt(yday),                // LT_YDAY  7
      mkInt(gmtoff),              // LT_GMTOFF 8
      mkString(zone),             // LT_ZONE  9
      mkInt(isDst),               // LT_ISDST 10
    ]);
  });

  reg.register('hash', (args) => {
    const algo = args[0].value;
    const data = args[1].value;
    return mkString(createHash(algo).update(data).digest('hex'));
  });

  reg.register('crypt', (args) => {
    const data = args[0].value;
    return mkString(createHash('md5').update(data).digest('hex').slice(0, 13));
  });

  // ctime: format matches C's ctime() output: "Wed Mar 29 12:00:00 2026"
  reg.register('ctime', (args) => {
    const ts = args.length > 0 ? args[0].value * 1000 : Date.now();
    const d = new Date(ts);
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const pad = (n) => String(n).padStart(2, '0');
    return mkString(
      `${days[d.getDay()]} ${months[d.getMonth()]} ${String(d.getDate()).padStart(2, ' ')} ` +
      `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${d.getFullYear()}`
    );
  });

  reg.register('query_host_name', () => {
    return mkString(hostname());
  });

  reg.register('origin', () => {
    return mkString('efun');
  });

  reg.register('memory_info', () => {
    return mkInt(process.memoryUsage().heapUsed);
  });

  reg.register('mud_status', () => {
    return mkString('Running');
  });

  // call_stack: argument selects what to return
  // 0 = program filenames, 1 = objects, 2 = function names (default),
  // 3 = origin names, 4 = line numbers
  reg.register('call_stack', (args) => {
    const vm = getMachine();
    if (!vm) return mkArray([]);
    const mode = args[0]?.value ?? 2;
    const frames = [];
    for (const f of vm.callStack) {
      switch (mode) {
        case 0: // program filenames
          frames.push(mkString(f.program?.filename ?? f.functionName ?? '<unknown>'));
          break;
        case 1: // objects
          frames.push(f.object ? { type: T_OBJECT, value: f.object } : SVALUE_ZERO);
          break;
        case 2: // function names
          frames.push(mkString(f.functionName ?? '<unknown>'));
          break;
        case 3: // origin names
          frames.push(mkString(f.origin ?? 'efun'));
          break;
        case 4: // line numbers
          frames.push(mkInt(f.lineNumber ?? 0));
          break;
        default:
          frames.push(mkString(f.functionName ?? '<unknown>'));
      }
    }
    if (vm._currentFunctionName && mode === 2) {
      frames.push(mkString(vm._currentFunctionName));
    }
    return mkArray(frames.reverse());
  });

  reg.register('allocate_buffer', (args) => {
    const size = args[0].value;
    if (size < 0 || size > 65536) return SVALUE_ZERO;
    return { type: T_BUFFER, value: Buffer.alloc(size) };
  });

  reg.register('read_buffer', (args) => {
    const buf = args[0];
    if (buf.type === T_BUFFER) {
      const start = args[1]?.value ?? 0;
      const len = args[2]?.value ?? buf.value.length;
      return { type: T_BUFFER, value: buf.value.subarray(start, start + len) };
    }
    return SVALUE_ZERO;
  });

  reg.register('write_buffer', (args) => {
    const buf = args[0];
    if (buf.type !== T_BUFFER) return SVALUE_ZERO;
    const start = args[1].value;
    const data = args[2];
    if (data.type === T_STRING) {
      Buffer.from(data.value).copy(buf.value, start);
    } else if (data.type === T_INT) {
      buf.value[start] = data.value & 0xFF;
    } else if (data.type === T_BUFFER) {
      data.value.copy(buf.value, start);
    }
    return mkInt(1);
  });

  reg.register('bind', (args) => {
    const fp = args[0];
    const obj = args[1];
    if (fp.type !== T_FUNCTION || obj.type !== T_OBJECT) return SVALUE_ZERO;
    const newFp = { ...fp.value, boundObj: obj.value };
    return mkFunction(newFp);
  });

  reg.register('base64_encode', (args) => {
    const input = args[0].type === T_BUFFER
      ? args[0].value
      : Buffer.from(args[0].value);
    return mkString(input.toString('base64'));
  });

  reg.register('base64_decode', (args) => {
    const decoded = Buffer.from(args[0].value, 'base64');
    return { type: T_BUFFER, value: decoded };
  });

  reg.register('sha1', (args) => {
    const input = args[0].type === T_BUFFER
      ? args[0].value
      : Buffer.from(args[0].value);
    const digest = createHash('sha1').update(input).digest();
    return { type: T_BUFFER, value: digest };
  });

  reg.register('current_time_millis', () => {
    return mkInt(Date.now());
  });

  reg.register('filter', (args) => {
    const collection = args[0];
    if (collection.type === T_ARRAY) {
      const filterArray = getMachine()?.efunHandler;
      if (filterArray) return filterArray('filter_array', args);
    }
    return SVALUE_ZERO;
  });

  reg.register('map', (args) => {
    const collection = args[0];
    if (collection.type === T_ARRAY) {
      const mapHandler = getMachine()?.efunHandler;
      if (mapHandler) return mapHandler('map_array', args);
    }
    return SVALUE_ZERO;
  });

  reg.register('crc32', (args) => {
    const sv = args[0];
    let buf;
    if (sv.type === T_BUFFER) {
      buf = sv.value;
    } else if (sv.type === T_STRING) {
      buf = Buffer.from(sv.value);
    } else {
      return SVALUE_ZERO;
    }
    return mkInt(computeCrc32(buf));
  });

  reg.register('oldcrypt', (args) => {
    const data = args[0].value;
    return mkString(createHash('md5').update(data).digest('hex').slice(0, 13));
  });

  reg.register('throw', (args) => {
    const val = args[0];
    const msg = val.type === T_STRING ? val.value : String(val.value);
    throw new Error(msg);
  });

  reg.register('unique_mapping', (args) => {
    const arr = args[0];
    const func = args[1];
    if (arr.type !== T_ARRAY) return SVALUE_ZERO;
    const vm = getMachine();
    const m = new Map();
    for (const item of arr.value) {
      let key;
      if (func.type === T_FUNCTION) {
        key = vm._callFunctionPtr(func.value, [item]);
      } else if (func.type === T_STRING) {
        key = vm.driver?.apply(func.value, item.value, []) ?? SVALUE_ZERO;
      } else {
        continue;
      }
      const mk = mappingKey(key);
      if (!m.has(mk)) {
        m.set(mk, { key, value: mkArray([item]) });
      } else {
        m.get(mk).value.value.push(item);
      }
    }
    return mkMapping(m);
  });

  reg.register('funcall', (args) => {
    const fp = args[0];
    if (fp.type !== T_FUNCTION) return fp;
    const vm = getMachine();
    return vm._callFunctionPtr(fp.value, args.slice(1));
  });

  // json_encode: convert LPC value to JSON string
  function svToJs(sv) {
    if (!sv || sv === SVALUE_ZERO) return 0;
    switch (sv.type) {
      case T_INT: return sv.value;
      case T_STRING: return sv.value;
      case T_FLOAT: return sv.value;
      case T_ARRAY: return sv.value.map(svToJs);
      case T_MAPPING: {
        const obj = {};
        for (const [, entry] of sv.value) {
          const k = entry.key.type === T_STRING ? entry.key.value : String(entry.key.value);
          obj[k] = svToJs(entry.value);
        }
        return obj;
      }
      default: return null;
    }
  }
  reg.register('json_encode', (args) => {
    return mkString(JSON.stringify(svToJs(args[0])));
  });

  // json_decode: convert JSON string to LPC value
  function jsToSv(val) {
    if (val === null || val === undefined) return SVALUE_ZERO;
    if (typeof val === 'number') return Number.isInteger(val) ? mkInt(val) : mkFloat(val);
    if (typeof val === 'string') return mkString(val);
    if (typeof val === 'boolean') return mkInt(val ? 1 : 0);
    if (Array.isArray(val)) return mkArray(val.map(jsToSv));
    if (typeof val === 'object') {
      const m = new Map();
      for (const [k, v] of Object.entries(val)) {
        const key = mkString(k);
        m.set(mappingKey(key), { key, value: jsToSv(v) });
      }
      return { type: T_MAPPING, value: m };
    }
    return SVALUE_ZERO;
  }
  reg.register('json_decode', (args) => {
    try { return jsToSv(JSON.parse(args[0].value)); }
    catch { return SVALUE_ZERO; }
  });
}
