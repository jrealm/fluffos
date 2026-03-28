import { mkInt, T_INT, T_STRING, T_FLOAT, T_ARRAY, T_MAPPING, T_OBJECT, T_FUNCTION, T_BUFFER } from '../../vm/svalue.mjs';
import { O_CLONE } from '../object.mjs';

export function registerTypeEfuns(reg) {
  reg.register('intp', (args) => mkInt(args[0].type === T_INT ? 1 : 0));
  reg.register('stringp', (args) => mkInt(args[0].type === T_STRING ? 1 : 0));
  reg.register('floatp', (args) => mkInt(args[0].type === T_FLOAT ? 1 : 0));
  reg.register('arrayp', (args) => mkInt(args[0].type === T_ARRAY ? 1 : 0));
  reg.register('mapp', (args) => mkInt(args[0].type === T_MAPPING ? 1 : 0));
  reg.register('objectp', (args) => mkInt(args[0].type === T_OBJECT ? 1 : 0));
  reg.register('functionp', (args) => mkInt(args[0].type === T_FUNCTION ? 1 : 0));

  reg.register('undefinedp', (args) => {
    return mkInt(args[0].type === T_INT && args[0].value === 0 ? 1 : 0);
  });

  reg.register('clonep', (args) => {
    if (args[0].type !== T_OBJECT) return mkInt(0);
    return mkInt((args[0].value.flags & O_CLONE) ? 1 : 0);
  });

  reg.register('userp', (args) => {
    if (args[0].type !== T_OBJECT) return mkInt(0);
    return mkInt(args[0].value.interactive ? 1 : 0);
  });

  reg.register('living', (args) => {
    if (args[0].type !== T_OBJECT) return mkInt(0);
    return mkInt(args[0].value.livingName ? 1 : 0);
  });

  reg.register('bufferp', (args) => mkInt(args[0].type === T_BUFFER ? 1 : 0));
}
