import { mkInt, mkFloat, T_INT, T_FLOAT, T_ARRAY, SVALUE_ZERO } from '../../vm/svalue.mjs';

function toNum(sv) {
  return Number(sv.value ?? 0);
}

export function registerMathEfuns(reg) {
  // Trigonometry — all return float
  reg.register('sin', (args) => mkFloat(Math.sin(toNum(args[0]))));
  reg.register('cos', (args) => mkFloat(Math.cos(toNum(args[0]))));
  reg.register('tan', (args) => mkFloat(Math.tan(toNum(args[0]))));

  // asin/acos: domain validation — error if |x| > 1
  reg.register('asin', (args) => {
    const v = toNum(args[0]);
    if (v < -1.0 || v > 1.0) throw new Error('Bad argument 1 to math->asin()');
    return mkFloat(Math.asin(v));
  });
  reg.register('acos', (args) => {
    const v = toNum(args[0]);
    if (v < -1.0 || v > 1.0) throw new Error('Bad argument 1 to math->acos()');
    return mkFloat(Math.acos(v));
  });
  reg.register('atan', (args) => mkFloat(Math.atan(toNum(args[0]))));

  // sqrt: returns int (floor) when input is int, float otherwise
  reg.register('sqrt', (args) => {
    const v = toNum(args[0]);
    if (v < 0) throw new Error('Bad argument 1 to math->sqrt()');
    if (args[0].type === T_INT) return mkInt(Math.floor(Math.sqrt(v)));
    return mkFloat(Math.sqrt(v));
  });

  // pow: always returns float (C spec)
  reg.register('pow', (args) => {
    const base = toNum(args[0]);
    const exp = toNum(args[1]);
    return mkFloat(Math.pow(base, exp));
  });

  // log: error if x <= 0
  reg.register('log', (args) => {
    const v = toNum(args[0]);
    if (v <= 0) throw new Error('Bad argument 1 to math->log()');
    return mkFloat(Math.log(v));
  });
  reg.register('log10', (args) => {
    const v = toNum(args[0]);
    if (v <= 0) throw new Error('Bad argument 1 to math->log10()');
    return mkFloat(Math.log10(v));
  });
  reg.register('log2', (args) => {
    const v = toNum(args[0]);
    if (v <= 0) throw new Error('Bad argument 1 to math->log2()');
    return mkFloat(Math.log2(v));
  });
  reg.register('exp', (args) => mkFloat(Math.exp(toNum(args[0]))));

  // Rounding — C returns float
  reg.register('floor', (args) => mkFloat(Math.floor(toNum(args[0]))));
  reg.register('ceil', (args) => mkFloat(Math.ceil(toNum(args[0]))));
  reg.register('round', (args) => mkFloat(Math.round(toNum(args[0]))));

  // Vector operations
  reg.register('norm', (args) => {
    if (args[0].type !== T_ARRAY) return SVALUE_ZERO;
    let sum = 0;
    for (const sv of args[0].value) sum += toNum(sv) ** 2;
    return mkFloat(Math.sqrt(sum));
  });

  // dotprod: error on mismatched vector sizes (C behavior)
  reg.register('dotprod', (args) => {
    if (args[0].type !== T_ARRAY || args[1].type !== T_ARRAY) return SVALUE_ZERO;
    const a = args[0].value, b = args[1].value;
    if (a.length !== b.length) {
      throw new Error('cannot take the dotprod of vectors of different sizes');
    }
    let sum = 0;
    for (let i = 0; i < a.length; i++) sum += toNum(a[i]) * toNum(b[i]);
    return mkFloat(sum);
  });

  // distance: error on mismatched vector sizes
  reg.register('distance', (args) => {
    if (args[0].type !== T_ARRAY || args[1].type !== T_ARRAY) return SVALUE_ZERO;
    const a = args[0].value, b = args[1].value;
    if (a.length !== b.length) {
      throw new Error('cannot take the distance of vectors of different sizes');
    }
    let sum = 0;
    for (let i = 0; i < a.length; i++) sum += (toNum(a[i]) - toNum(b[i])) ** 2;
    return mkFloat(Math.sqrt(sum));
  });

  reg.register('angle', (args) => {
    if (args[0].type !== T_ARRAY || args[1].type !== T_ARRAY) return SVALUE_ZERO;
    const a = args[0].value, b = args[1].value;
    if (a.length !== b.length) {
      throw new Error('cannot take the angle of vectors of different sizes');
    }
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
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
