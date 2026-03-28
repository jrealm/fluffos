import { mkString, T_INT, T_STRING, T_FLOAT, T_ARRAY, T_MAPPING, T_OBJECT, T_FUNCTION, T_BUFFER, T_CLASS, SVALUE_ZERO } from '../../vm/svalue.mjs';

export function registerSprintfEfuns(reg) {
  reg.register('sprintf', (args) => {
    return mkString(lpcSprintf(args));
  });
}

function lpcSprintf(args) {
  const fmt = args[0].value;
  let argIdx = 1;
  let result = '';
  let i = 0;

  while (i < fmt.length) {
    if (fmt[i] !== '%') {
      result += fmt[i++];
      continue;
    }
    i++; // skip %

    if (i >= fmt.length) break;
    if (fmt[i] === '%') { result += '%'; i++; continue; }

    // Parse format spec
    const spec = parseFormatSpec(fmt, i);
    i = spec.end;

    if (spec.starWidth) spec.width = args[argIdx++]?.value ?? 0;
    if (spec.starPrec) spec.precision = args[argIdx++]?.value ?? 0;

    if (spec.arrayMode) {
      const arr = args[argIdx++];
      if (arr && arr.type === T_ARRAY) {
        const parts = arr.value.map(item => formatValue(spec, item));
        result += parts.join('');
      }
    } else {
      result += formatValue(spec, args[argIdx++] ?? SVALUE_ZERO);
    }
  }

  return result;
}

function parseFormatSpec(fmt, pos) {
  const spec = {
    leftAlign: false, center: false, padZero: false,
    plusSign: false, spaceSign: false,
    columnMode: false, tableMode: false, arrayMode: false,
    padChar: ' ', width: 0, precision: -1,
    specifier: '', end: pos,
    starWidth: false, starPrec: false,
  };

  let i = pos;

  // Parse flags
  let parsingFlags = true;
  while (i < fmt.length && parsingFlags) {
    switch (fmt[i]) {
      case '-': spec.leftAlign = true; i++; break;
      case '|': spec.center = true; i++; break;
      case '+': spec.plusSign = true; i++; break;
      case ' ': spec.spaceSign = true; i++; break;
      case '0': spec.padZero = true; spec.padChar = '0'; i++; break;
      case '=': spec.columnMode = true; i++; break;
      case '#': spec.tableMode = true; i++; break;
      case '@': spec.arrayMode = true; i++; break;
      case "'":
        i++; // skip opening quote
        spec.padChar = '';
        while (i < fmt.length && fmt[i] !== "'") {
          if (fmt[i] === '\\') { i++; spec.padChar += fmt[i] ?? ''; }
          else spec.padChar += fmt[i];
          i++;
        }
        if (i < fmt.length) i++; // skip closing quote
        break;
      default: parsingFlags = false;
    }
  }

  // Parse width
  if (i < fmt.length && fmt[i] === '*') {
    spec.starWidth = true; i++;
  } else {
    let w = '';
    while (i < fmt.length && fmt[i] >= '0' && fmt[i] <= '9') w += fmt[i++];
    if (w) spec.width = parseInt(w, 10);
  }

  // Parse precision or colon
  if (i < fmt.length && fmt[i] === '.') {
    i++;
    if (i < fmt.length && fmt[i] === '*') {
      spec.starPrec = true; i++;
    } else {
      let p = '';
      while (i < fmt.length && fmt[i] >= '0' && fmt[i] <= '9') p += fmt[i++];
      spec.precision = p ? parseInt(p, 10) : 0;
    }
  } else if (i < fmt.length && fmt[i] === ':') {
    i++;
    if (i < fmt.length && fmt[i] === '*') {
      spec.starWidth = true; spec.starPrec = true; i++;
    } else {
      let p = '';
      while (i < fmt.length && fmt[i] >= '0' && fmt[i] <= '9') p += fmt[i++];
      if (p) { spec.width = parseInt(p, 10); spec.precision = spec.width; }
    }
  }

  // Parse specifier
  if (i < fmt.length) {
    spec.specifier = fmt[i];
    i++;
  }
  spec.end = i;
  return spec;
}

function formatValue(spec, sv) {
  let str;

  switch (spec.specifier) {
    case 's':
      str = sv.type === T_STRING ? sv.value : String(sv.value ?? '');
      if (spec.precision >= 0 && str.length > spec.precision) {
        str = str.slice(0, spec.precision);
      }
      if (spec.columnMode && spec.width > 0) return formatColumn(str, spec.width);
      if (spec.tableMode && spec.width > 0) return formatTable(str, spec.width, spec.precision >= 0 ? spec.precision : -1);
      break;

    case 'd': case 'i': {
      const n = sv.type === T_FLOAT ? Math.trunc(sv.value) : Number(sv.value ?? 0);
      str = String(Math.trunc(n));
      if (n >= 0 && spec.plusSign) str = '+' + str;
      else if (n >= 0 && spec.spaceSign) str = ' ' + str;
      if (spec.precision > str.replace(/[-+ ]/, '').length) {
        const digits = str.replace(/^[-+ ]*/, '');
        const prefix = str.slice(0, str.length - digits.length);
        str = prefix + digits.padStart(spec.precision, '0');
      }
      break;
    }

    case 'f': {
      const f = Number(sv.value ?? 0);
      const prec = spec.precision >= 0 ? spec.precision : 6;
      str = f.toFixed(prec);
      if (f >= 0 && spec.plusSign) str = '+' + str;
      else if (f >= 0 && spec.spaceSign) str = ' ' + str;
      break;
    }

    case 'c':
      str = String.fromCharCode(Number(sv.value ?? 0));
      break;

    case 'o':
      str = (Number(sv.value ?? 0) >>> 0).toString(8);
      break;

    case 'x':
      str = (Number(sv.value ?? 0) >>> 0).toString(16);
      break;

    case 'X':
      str = (Number(sv.value ?? 0) >>> 0).toString(16).toUpperCase();
      break;

    case 'O':
      str = svalueToString(sv, 0);
      break;

    default:
      str = '';
  }

  return padString(str, spec);
}

function padString(str, spec) {
  if (spec.width <= 0 || str.length >= spec.width) return str;
  const pad = spec.width - str.length;
  const padStr = spec.padChar.repeat(Math.ceil(pad / spec.padChar.length)).slice(0, pad);

  if (spec.center) {
    const left = Math.floor(pad / 2);
    const right = pad - left;
    const lp = spec.padChar.repeat(Math.ceil(left / spec.padChar.length)).slice(0, left);
    const rp = spec.padChar.repeat(Math.ceil(right / spec.padChar.length)).slice(0, right);
    return lp + str + rp;
  }
  if (spec.leftAlign) return str + padStr;

  // For zero-padded numbers, put pad after sign
  if (spec.padChar === '0' && (str[0] === '-' || str[0] === '+' || str[0] === ' ')) {
    return str[0] + padStr + str.slice(1);
  }
  return padStr + str;
}

function formatColumn(text, width) {
  const words = text.split(/\s+/);
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    if (currentLine === '') {
      currentLine = word;
    } else if (currentLine.length + 1 + word.length <= width) {
      currentLine += ' ' + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);

  return lines.map(l => l.padEnd(width)).join('\n');
}

function formatTable(text, width, numCols) {
  const items = text.split(/[\s\n]+/).filter(Boolean);
  if (items.length === 0) return '';

  if (numCols <= 0) {
    // Auto-calculate: find widest item, fit as many columns as possible
    const maxItemWidth = Math.max(...items.map(s => s.length));
    numCols = Math.max(1, Math.floor(width / (maxItemWidth + 2)));
  }

  // Adjust columns so last row is full (or close)
  while (numCols > 1 && items.length % numCols !== 0 && items.length < numCols) {
    numCols--;
  }

  const colWidth = Math.floor(width / numCols);
  const rows = Math.ceil(items.length / numCols);
  const lines = [];

  for (let r = 0; r < rows; r++) {
    let line = '';
    for (let c = 0; c < numCols; c++) {
      const idx = r * numCols + c;
      if (idx < items.length) {
        const item = items[idx];
        line += c < numCols - 1 ? item.padEnd(colWidth) : item;
      }
    }
    lines.push(line);
  }

  return lines.join('\n');
}

function svalueToString(sv, indent) {
  if (indent > 20) return '...';
  const pad = ' '.repeat(indent);

  switch (sv.type) {
    case T_INT: return String(sv.value);
    case T_FLOAT: return String(sv.value);
    case T_STRING: return '"' + sv.value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"';
    case T_ARRAY: {
      if (sv.value.length === 0) return '({ })';
      const items = sv.value.map(v => pad + '  ' + svalueToString(v, indent + 2) + ',\n');
      return `({ /* sizeof() == ${sv.value.length} */\n${items.join('')}${pad}})`;
    }
    case T_MAPPING: {
      if (sv.value.size === 0) return '([ ])';
      const entries = [];
      for (const [k, v] of sv.value) {
        entries.push(`${pad}  "${k}" : ${svalueToString(v, indent + 2)},\n`);
      }
      return `([ /* sizeof() == ${sv.value.size} */\n${entries.join('')}${pad}])`;
    }
    case T_OBJECT: return sv.value?.objectId ?? '(destructed)';
    case T_FUNCTION: return '(: <function> :)';
    case T_BUFFER: return '<buffer>';
    case T_CLASS: {
      const members = sv.value?.members ?? [];
      return `CLASS( ${members.length} elements)`;
    }
    default: return '0';
  }
}

export { lpcSprintf, svalueToString };
