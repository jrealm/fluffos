import { mkInt, mkString, mkFloat, mkArray, mkMapping, T_INT, T_STRING, T_FLOAT, T_ARRAY, T_MAPPING, T_OBJECT, T_FUNCTION, T_BUFFER, SVALUE_ZERO } from '../../vm/svalue.mjs';
import { getMachine } from '../apply.mjs';
import { createHash } from 'node:crypto';
import { hostname } from 'node:os';

const TYPE_NAMES = {
  [T_INT]: 'int',
  [T_STRING]: 'string',
  [T_FLOAT]: 'float',
  [T_ARRAY]: 'array',
  [T_MAPPING]: 'mapping',
  [T_OBJECT]: 'object',
  [T_FUNCTION]: 'function',
  [T_BUFFER]: 'buffer',
};

export function registerMiscEfuns(reg) {
  reg.register('typeof', (args) => {
    return mkString(TYPE_NAMES[args[0].type] ?? 'unknown');
  });

  reg.register('to_int', (args) => {
    const sv = args[0];
    if (sv.type === T_STRING) return mkInt(parseInt(sv.value, 10) || 0);
    if (sv.type === T_FLOAT) return mkInt(Math.trunc(sv.value));
    if (sv.type === T_INT) return sv;
    return mkInt(0);
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

  reg.register('random', (args) => {
    return mkInt(Math.floor(Math.random() * args[0].value));
  });

  reg.register('time', () => {
    return mkInt(Math.floor(Date.now() / 1000));
  });

  // sprintf moved to sprintf.mjs

  reg.register('write', () => SVALUE_ZERO);

  reg.register('evaluate', (args) => {
    const fp = args[0];
    if (fp.type !== T_FUNCTION) return fp;
    const vm = getMachine();
    return vm._callFunctionPtr(fp.value, args.slice(1));
  });

  reg.register('functionp', (args) => {
    return mkInt(args[0].type === T_FUNCTION ? 1 : 0);
  });

  reg.register('sscanf', (args) => {
    const input = args[0].value;
    const format = args[1].value;
    const results = [];
    let inputPos = 0;
    let fmtPos = 0;

    while (fmtPos < format.length && inputPos <= input.length) {
      if (format[fmtPos] === '%') {
        fmtPos++;
        if (fmtPos >= format.length) break;
        const spec = format[fmtPos++];
        if (spec === 'd') {
          let numStr = '';
          if (input[inputPos] === '-') numStr += input[inputPos++];
          while (inputPos < input.length && input[inputPos] >= '0' && input[inputPos] <= '9') {
            numStr += input[inputPos++];
          }
          if (numStr === '' || numStr === '-') break;
          results.push(mkInt(parseInt(numStr, 10)));
        } else if (spec === 's') {
          let endChar = null;
          if (fmtPos < format.length && format[fmtPos] !== '%') endChar = format[fmtPos];
          let str = '';
          if (endChar) {
            while (inputPos < input.length && input[inputPos] !== endChar) str += input[inputPos++];
          } else {
            while (inputPos < input.length && input[inputPos] !== ' ' && input[inputPos] !== '\t' && input[inputPos] !== '\n') {
              str += input[inputPos++];
            }
          }
          results.push(mkString(str));
        } else if (spec === '%') {
          if (input[inputPos] !== '%') break;
          inputPos++;
        }
      } else {
        if (input[inputPos] !== format[fmtPos]) break;
        inputPos++;
        fmtPos++;
      }
    }
    return mkArray(results);
  });

  reg.register('allocate_mapping', () => {
    return mkMapping(new Map());
  });

  reg.register('localtime', (args) => {
    const ts = args[0].value * 1000;
    const d = new Date(ts);
    return mkArray([
      mkInt(d.getSeconds()),
      mkInt(d.getMinutes()),
      mkInt(d.getHours()),
      mkInt(d.getDate()),
      mkInt(d.getMonth()),
      mkInt(d.getFullYear() - 1900),
      mkInt(d.getDay()),
      mkInt(Math.floor((d - new Date(d.getFullYear(), 0, 1)) / 86400000)),
      mkInt(0),
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

  reg.register('ctime', (args) => {
    const ts = args.length > 0 ? args[0].value * 1000 : Date.now();
    return mkString(new Date(ts).toString());
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

  reg.register('call_stack', () => {
    return mkArray([]);
  });
}
