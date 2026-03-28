import { mkInt, SVALUE_ZERO, T_OBJECT } from '../../vm/svalue.mjs';
import { apply } from '../apply.mjs';

export function registerShadowEfuns(reg, driver) {
  reg.register('shadow', (args) => {
    const target = args[0].type === T_OBJECT ? args[0].value : null;
    if (!target || !driver.currentObject) return SVALUE_ZERO;

    const master = driver.objects.find(driver.config['master file'] + '.c')
                || driver.objects.find(driver.config['master file']);
    if (master) {
      const valid = apply('valid_shadow', master, [{ type: T_OBJECT, value: driver.currentObject }]);
      if (!valid || !valid.value) return SVALUE_ZERO;
    }

    const shadowObj = driver.currentObject;
    shadowObj.shadowTarget = target;
    target.shadowedBy = shadowObj;
    return mkInt(1);
  });

  reg.register('query_shadowing', (args) => {
    const obj = args[0].type === T_OBJECT ? args[0].value : null;
    if (obj && obj.shadowedBy) return { type: T_OBJECT, value: obj.shadowedBy };
    return SVALUE_ZERO;
  });
}
