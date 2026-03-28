import { mkInt, mkFloat, T_INT, T_FLOAT, T_ARRAY, SVALUE_ZERO } from '../../vm/svalue.mjs';

function toNum(sv) {
  return Number(sv.value ?? 0);
}

function mkNum(v, forceFloat) {
  if (forceFloat || !Number.isInteger(v)) return mkFloat(v);
  return mkInt(v);
}

export function registerMathEfuns(reg) {
  // Trigonometry
  reg.register('sin', (args) => mkFloat(Math.sin(toNum(args[0]))));
  reg.register('cos', (args) => mkFloat(Math.cos(toNum(args[0]))));
  reg.register('tan', (args) => mkFloat(Math.tan(toNum(args[0]))));
  reg.register('asin', (args) => mkFloat(Math.asin(toNum(args[0]))));
  reg.register('acos', (args) => mkFloat(Math.acos(toNum(args[0]))));
  reg.register('atan', (args) => mkFloat(Math.atan(toNum(args[0]))));

  // Powers and roots
  reg.register('sqrt', (args) => {
    const v = toNum(args[0]);
    return args[0].type === T_INT ? mkInt(Math.floor(Math.sqrt(v))) : mkFloat(Math.sqrt(v));
  });

  reg.register('pow', (args) => {
    const base = toNum(args[0]);
    const exp = toNum(args[1]);
    const result = Math.pow(base, exp);
    if (args[0].type === T_INT && args[1].type === T_INT && Number.isInteger(result)) {
      return mkInt(result);
    }
    return mkFloat(result);
  });

  // Logarithms
  reg.register('log', (args) => mkFloat(Math.log(toNum(args[0]))));
  reg.register('log10', (args) => mkFloat(Math.log10(toNum(args[0]))));
  reg.register('log2', (args) => mkFloat(Math.log2(toNum(args[0]))));
  reg.register('exp', (args) => mkFloat(Math.exp(toNum(args[0]))));

  // Rounding
  reg.register('floor', (args) => mkInt(Math.floor(toNum(args[0]))));
  reg.register('ceil', (args) => mkInt(Math.ceil(toNum(args[0]))));
  reg.register('round', (args) => mkInt(Math.round(toNum(args[0]))));

  // Vector operations
  reg.register('norm', (args) => {
    if (args[0].type !== T_ARRAY) return SVALUE_ZERO;
    let sum = 0;
    for (const sv of args[0].value) sum += toNum(sv) ** 2;
    return mkFloat(Math.sqrt(sum));
  });

  reg.register('dotprod', (args) => {
    if (args[0].type !== T_ARRAY || args[1].type !== T_ARRAY) return SVALUE_ZERO;
    const a = args[0].value, b = args[1].value;
    const len = Math.min(a.length, b.length);
    let sum = 0;
    for (let i = 0; i < len; i++) sum += toNum(a[i]) * toNum(b[i]);
    return mkFloat(sum);
  });

  reg.register('distance', (args) => {
    if (args[0].type !== T_ARRAY || args[1].type !== T_ARRAY) return SVALUE_ZERO;
    const a = args[0].value, b = args[1].value;
    const len = Math.min(a.length, b.length);
    let sum = 0;
    for (let i = 0; i < len; i++) sum += (toNum(a[i]) - toNum(b[i])) ** 2;
    return mkFloat(Math.sqrt(sum));
  });

  reg.register('angle', (args) => {
    if (args[0].type !== T_ARRAY || args[1].type !== T_ARRAY) return SVALUE_ZERO;
    const a = args[0].value, b = args[1].value;
    const len = Math.min(a.length, b.length);
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < len; i++) {
      const av = toNum(a[i]), bv = toNum(b[i]);
      dot += av * bv;
      na += av * av;
      nb += bv * bv;
    }
    const denom = Math.sqrt(na) * Math.sqrt(nb);
    if (denom === 0) return mkFloat(0);
    return mkFloat(Math.acos(Math.max(-1, Math.min(1, dot / denom))));
  });
}
