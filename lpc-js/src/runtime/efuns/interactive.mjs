import { mkInt, mkString, SVALUE_ZERO, T_OBJECT, T_STRING } from '../../vm/svalue.mjs';

export function registerInteractiveEfuns(reg, driver) {
  reg.register('write', (args) => {
    const text = args[0].type === T_STRING ? args[0].value : String(args[0].value);
    if (driver.currentObject && driver.currentObject.interactive) {
      driver.currentObject.interactive.send(text);
    }
    return SVALUE_ZERO;
  });

  reg.register('tell_object', (args) => {
    const obj = args[0].type === T_OBJECT ? args[0].value : null;
    const msg = args[1].type === T_STRING ? args[1].value : String(args[1].value);
    if (obj && obj.interactive) {
      obj.interactive.send(msg);
    }
    return SVALUE_ZERO;
  });

  reg.register('message', (args) => {
    const msg = args[1].type === T_STRING ? args[1].value : String(args[1].value);
    const targets = args[2];
    if (targets.type === T_OBJECT) {
      const obj = targets.value;
      if (obj.interactive) obj.interactive.send(msg);
    }
    return SVALUE_ZERO;
  });

  reg.register('input_to', (args) => {
    const funcName = args[0].value;
    if (driver.currentObject && driver.currentObject.interactive) {
      const obj = driver.currentObject;
      const conn = obj.interactive;
      conn.setInputTo((line) => {
        driver.apply(funcName, obj, [mkString(line)]);
      });
    }
    return SVALUE_ZERO;
  });

  reg.register('interactive', (args) => {
    const obj = args.length > 0 && args[0].type === T_OBJECT ? args[0].value : driver.currentObject;
    return mkInt(obj && obj.interactive ? 1 : 0);
  });

  reg.register('add_action', (args) => {
    const func = args[0].value;
    const verb = args[1].value;
    const flag = args.length > 2 ? args[2].value : 0;
    if (driver.currentObject) {
      driver.commands.addAction(driver.currentObject, func, verb, flag);
    }
    return SVALUE_ZERO;
  });

  reg.register('notify_fail', (args) => {
    if (driver.currentObject && driver.currentObject.interactive) {
      driver._notifyFailMsg = args[0].value;
    }
    return SVALUE_ZERO;
  });

  reg.register('this_player', () => {
    if (driver.currentPlayer) {
      return { type: T_OBJECT, value: driver.currentPlayer };
    }
    return SVALUE_ZERO;
  });
}
