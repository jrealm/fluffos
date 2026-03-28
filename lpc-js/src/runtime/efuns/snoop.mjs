import { mkInt, SVALUE_ZERO, T_OBJECT } from '../../vm/svalue.mjs';

export function registerSnoopEfuns(reg, driver) {
  reg.register('snoop', (args) => {
    const snooper = args[0]?.type === T_OBJECT ? args[0].value : null;
    const target = args[1]?.type === T_OBJECT ? args[1].value : null;

    if (!snooper?.interactive) return SVALUE_ZERO;

    // Stop current snoop if any
    if (snooper.interactive.snooping) {
      snooper.interactive.snooping.snoopedBy = null;
      snooper.interactive.snooping = null;
    }

    if (!target) return mkInt(1); // Just stop snooping

    if (!target.interactive) return SVALUE_ZERO;

    // Prevent circular: walk the snoop chain from target
    let check = target.interactive;
    while (check.snooping) {
      if (check.snooping === snooper.interactive) return SVALUE_ZERO;
      check = check.snooping;
    }

    // If target is already snooped, disconnect old snooper
    if (target.interactive.snoopedBy) {
      target.interactive.snoopedBy.snooping = null;
    }

    target.interactive.snoopedBy = snooper.interactive;
    snooper.interactive.snooping = target.interactive;
    return mkInt(1);
  });

  reg.register('query_snoop', (args) => {
    const obj = args[0]?.type === T_OBJECT ? args[0].value : null;
    if (obj?.interactive?.snoopedBy?.object) {
      return { type: T_OBJECT, value: obj.interactive.snoopedBy.object };
    }
    return SVALUE_ZERO;
  });

  reg.register('query_snooping', (args) => {
    const obj = args[0]?.type === T_OBJECT ? args[0].value : null;
    if (obj?.interactive?.snooping?.object) {
      return { type: T_OBJECT, value: obj.interactive.snooping.object };
    }
    return SVALUE_ZERO;
  });
}
