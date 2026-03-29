import { mkInt, mkString, T_INT, T_STRING, T_FLOAT, T_ARRAY, T_MAPPING, T_OBJECT, T_FUNCTION, T_BUFFER, T_CLASS } from '../../vm/svalue.mjs';
import { O_CLONE, O_VIRTUAL } from '../object.mjs';
import { getMachine } from '../apply.mjs';

// Function pointer type flags (matching FluffOS C defines)
const FP_LOCAL = 0x02;
const FP_EFUN = 0x04;
const FP_SIMUL = 0x08;
const FP_FUNCTIONAL = 0x10;

export function registerTypeEfuns(reg) {
  reg.register('intp', (args) => mkInt(args[0].type === T_INT ? 1 : 0));
  reg.register('stringp', (args) => mkInt(args[0].type === T_STRING ? 1 : 0));
  reg.register('floatp', (args) => mkInt(args[0].type === T_FLOAT ? 1 : 0));
  reg.register('arrayp', (args) => mkInt(args[0].type === T_ARRAY ? 1 : 0));
  reg.register('mapp', (args) => mkInt(args[0].type === T_MAPPING ? 1 : 0));

  // objectp: returns 0 for destructed objects (C checks O_DESTRUCTED)
  reg.register('objectp', (args) => {
    if (args[0].type !== T_OBJECT) return mkInt(0);
    const obj = args[0].value;
    if (obj.isDestructed && obj.isDestructed()) return mkInt(0);
    return mkInt(1);
  });

  // functionp: returns type bitmask, not just 1
  // C returns fp->hdr.type | FP_HAS_ARGUMENTS | FP_OWNER_DESTED flags
  reg.register('functionp', (args) => {
    if (args[0].type !== T_FUNCTION) return mkInt(0);
    const fp = args[0].value;
    let flags = 0;
    if (fp.type === 'local') flags = FP_LOCAL;
    else if (fp.type === 'efun') flags = FP_EFUN;
    else if (fp.type === 'simul') flags = FP_SIMUL;
    else if (fp.type === 'functional') flags = FP_FUNCTIONAL;
    else flags = FP_FUNCTIONAL; // default for lambda/anonymous
    if (fp.args) flags |= 0x20; // FP_HAS_ARGUMENTS
    if (fp.boundObj && fp.boundObj.isDestructed?.()) flags |= 0x40; // FP_OWNER_DESTED
    return mkInt(flags || 1); // ensure non-zero for truthy
  });

  // undefinedp: checks subtype === 'undefined', NOT just value === 0
  // In C: checks (type == T_NUMBER && value == 0 && subtype == T_UNDEFINED)
  reg.register('undefinedp', (args) => {
    const sv = args[0];
    return mkInt(sv.type === T_INT && sv.value === 0 && sv.subtype === 'undefined' ? 1 : 0);
  });

  reg.register('clonep', (args) => {
    let sv = args[0];
    // clonep() with no args means clonep(this_object())
    if (!sv) {
      const obj = getMachine()?._currentObject;
      if (!obj) return mkInt(0);
      return mkInt((obj.flags & O_CLONE) ? 1 : 0);
    }
    if (sv.type !== T_OBJECT) return mkInt(0);
    return mkInt((sv.value.flags & O_CLONE) ? 1 : 0);
  });

  // userp: checks O_ONCE_INTERACTIVE — "was this object ever interactive?"
  // Not just current interactivity
  reg.register('userp', (args) => {
    if (args[0].type !== T_OBJECT) return mkInt(0);
    const obj = args[0].value;
    return mkInt(obj.onceInteractive || obj.interactive ? 1 : 0);
  });

  reg.register('living', (args) => {
    if (args[0].type !== T_OBJECT) return mkInt(0);
    return mkInt(args[0].value.livingName ? 1 : 0);
  });

  reg.register('bufferp', (args) => mkInt(args[0].type === T_BUFFER ? 1 : 0));

  reg.register('wizardp', (args) => {
    if (args[0].type !== T_OBJECT) return mkInt(0);
    return mkInt(args[0].value.isWizard ? 1 : 0);
  });

  reg.register('pointerp', (args) => mkInt(args[0].type === T_ARRAY ? 1 : 0));
  reg.register('classp', (args) => mkInt(args[0].type === T_CLASS ? 1 : 0));

  // nullp: same semantics as undefinedp
  reg.register('nullp', (args) => {
    const sv = args[0];
    return mkInt(sv.type === T_INT && sv.value === 0 && sv.subtype === 'undefined' ? 1 : 0);
  });

  // virtualp: check if object was created via virtual compile
  reg.register('virtualp', (args) => {
    if (args[0].type !== T_OBJECT) return mkInt(0);
    return mkInt(args[0].value.flags & O_VIRTUAL ? 1 : 0);
  });

  // closurep: COMPAT_32 alias for functionp
  reg.register('closurep', (args) => mkInt(args[0].type === T_FUNCTION ? 1 : 0));

  // typeof: returns type name string
  reg.register('typeof', (args) => {
    const TYPE_NAMES = {
      [T_INT]: 'int',
      [T_STRING]: 'string',
      [T_FLOAT]: 'float',
      [T_ARRAY]: 'array',
      [T_MAPPING]: 'mapping',
      [T_OBJECT]: 'object',
      [T_FUNCTION]: 'function',
      [T_BUFFER]: 'buffer',
      [T_CLASS]: 'class',
    };
    return mkString(TYPE_NAMES[args[0].type] ?? 'unknown');
  });
}
