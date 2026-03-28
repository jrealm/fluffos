import { mkInt, mkString, SVALUE_ZERO, T_OBJECT, T_STRING, T_ARRAY } from '../../vm/svalue.mjs';
import { lpcSprintf } from './sprintf.mjs';

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
    const exclude = args[3];

    const excludeSet = new Set();
    if (exclude) {
      if (exclude.type === T_ARRAY) {
        for (const sv of exclude.value) {
          if (sv.type === T_OBJECT) excludeSet.add(sv.value);
        }
      } else if (exclude.type === T_OBJECT) {
        excludeSet.add(exclude.value);
      }
    }

    function sendTo(obj) {
      if (excludeSet.has(obj)) return;
      if (obj.interactive) obj.interactive.send(msg);
      // Also call receive_message on the object
      driver.apply('receive_message', obj, [args[0], args[1]]);
    }

    if (targets.type === T_OBJECT) {
      sendTo(targets.value);
    } else if (targets.type === T_ARRAY) {
      for (const sv of targets.value) {
        if (sv.type === T_OBJECT) sendTo(sv.value);
      }
    } else if (targets.type === T_STRING) {
      // String target — look up object by name
      const obj = driver.objects.find(targets.value) ?? driver.objects.find(targets.value + '.c');
      if (obj) {
        for (const inv of obj.inventory) {
          sendTo(inv);
        }
      }
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
    // Supports both string and function pointer
    driver._notifyFailMsg = args[0];
    return SVALUE_ZERO;
  });

  reg.register('this_player', () => {
    if (driver.currentPlayer) {
      return { type: T_OBJECT, value: driver.currentPlayer };
    }
    return SVALUE_ZERO;
  });

  reg.register('say', (args) => {
    const msg = args[0].type === T_STRING ? args[0].value : String(args[0].value);
    const env = driver.currentObject?.environment;
    if (!env) return SVALUE_ZERO;

    const excludeSet = new Set();
    excludeSet.add(driver.currentObject);
    if (args[1]) {
      if (args[1].type === T_ARRAY) {
        for (const sv of args[1].value) {
          if (sv.type === T_OBJECT) excludeSet.add(sv.value);
        }
      } else if (args[1].type === T_OBJECT) {
        excludeSet.add(args[1].value);
      }
    }

    for (const obj of env.inventory) {
      if (!excludeSet.has(obj) && obj.interactive) {
        obj.interactive.send(msg);
      }
    }
    return SVALUE_ZERO;
  });

  reg.register('tell_room', (args) => {
    const room = args[0].type === T_OBJECT ? args[0].value : null;
    if (!room) return SVALUE_ZERO;
    const msg = args[1].type === T_STRING ? args[1].value : String(args[1].value);

    const excludeSet = new Set();
    if (args[2]) {
      if (args[2].type === T_ARRAY) {
        for (const sv of args[2].value) {
          if (sv.type === T_OBJECT) excludeSet.add(sv.value);
        }
      } else if (args[2].type === T_OBJECT) {
        excludeSet.add(args[2].value);
      }
    }

    for (const obj of room.inventory) {
      if (!excludeSet.has(obj) && obj.interactive) {
        obj.interactive.send(msg);
      }
    }
    return SVALUE_ZERO;
  });

  reg.register('shout', (args) => {
    const msg = args[0].type === T_STRING ? args[0].value : String(args[0].value);
    for (const [, obj] of driver.objects.objects) {
      if (obj.interactive && !obj.isDestructed()) {
        obj.interactive.send(msg);
      }
    }
    return SVALUE_ZERO;
  });

  reg.register('receive', (args) => {
    const msg = args[0].type === T_STRING ? args[0].value : String(args[0].value);
    if (driver.currentObject?.interactive) {
      driver.currentObject.interactive.send(msg);
    }
    return SVALUE_ZERO;
  });

  reg.register('get_char', (args) => {
    const funcName = args[0].value;
    if (driver.currentObject?.interactive) {
      const obj = driver.currentObject;
      const conn = obj.interactive;
      conn.charMode = true;
      conn.charCallback = (ch) => {
        driver.apply(funcName, obj, [mkString(ch)]);
      };
    }
    return SVALUE_ZERO;
  });

  reg.register('query_ip_number', (args) => {
    const obj = args.length > 0 && args[0].type === T_OBJECT ? args[0].value : driver.currentObject;
    if (obj?.interactive) {
      const addr = obj.interactive.remoteAddress ?? '';
      return mkString(addr.replace(/^::ffff:/, ''));
    }
    return SVALUE_ZERO;
  });

  reg.register('query_ip_name', (args) => {
    const obj = args.length > 0 && args[0].type === T_OBJECT ? args[0].value : driver.currentObject;
    if (obj?.interactive) {
      const addr = obj.interactive.remoteAddress ?? '';
      return mkString(addr.replace(/^::ffff:/, ''));
    }
    return SVALUE_ZERO;
  });

  reg.register('query_idle', (args) => {
    const obj = args[0].type === T_OBJECT ? args[0].value : null;
    if (obj?.interactive) {
      return mkInt(Math.floor((Date.now() - obj.interactive.lastInputTime) / 1000));
    }
    return SVALUE_ZERO;
  });

  reg.register('websocket', (args) => {
    const obj = args.length > 0 && args[0].type === T_OBJECT ? args[0].value : driver.currentObject;
    if (obj?.interactive) {
      return mkInt(obj.interactive.protocol === 'websocket' ? 1 : 0);
    }
    return SVALUE_ZERO;
  });

  reg.register('has_gmcp', (args) => {
    const obj = args.length > 0 && args[0].type === T_OBJECT ? args[0].value : driver.currentObject;
    if (obj?.interactive) {
      return mkInt(obj.interactive.gmcpEnabled ? 1 : 0);
    }
    return SVALUE_ZERO;
  });

  reg.register('send_gmcp', (args) => {
    const msg = args[0].value;
    let data = args[1]?.value ?? null;
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch {}
    }
    if (driver.currentObject?.interactive) {
      driver.currentObject.interactive.sendGmcp(msg, data);
    }
    return SVALUE_ZERO;
  });

  reg.register('has_mxp', (args) => {
    const obj = args.length > 0 && args[0].type === T_OBJECT ? args[0].value : driver.currentObject;
    if (obj?.interactive) {
      if (obj.interactive.protocol === 'websocket') return mkInt(0);
      return mkInt(obj.interactive.mxpEnabled ? 1 : 0);
    }
    return SVALUE_ZERO;
  });

  reg.register('act_mxp', () => {
    if (driver.currentObject?.interactive) {
      const conn = driver.currentObject.interactive;
      if (conn.protocol === 'telnet' && conn.mxpEnabled) {
        conn.sendSubnegotiation(91, '');
      }
    }
    return SVALUE_ZERO;
  });

  reg.register('remove_interactive', (args) => {
    const obj = args[0].type === T_OBJECT ? args[0].value : null;
    if (obj?.interactive) {
      const conn = obj.interactive;
      try { conn.close(); } catch {}
      obj.interactive = null;
      conn.object = null;
    }
    return SVALUE_ZERO;
  });

  reg.register('query_ip_port', (args) => {
    const obj = args.length > 0 && args[0].type === T_OBJECT ? args[0].value : driver.currentObject;
    if (obj?.interactive) {
      return mkInt(obj.interactive.remotePort ?? 0);
    }
    return SVALUE_ZERO;
  });

  reg.register('printf', (args) => {
    const text = lpcSprintf(args);
    if (driver.currentObject?.interactive) {
      driver.currentObject.interactive.send(text);
    }
    return SVALUE_ZERO;
  });

  // websocket_handshake_done: complete WebSocket upgrade for current connection
  reg.register('websocket_handshake_done', () => {
    if (driver.currentObject?.interactive) {
      const conn = driver.currentObject.interactive;
      conn.protocol = 'websocket';
      conn.websocketReady = true;
    }
    return SVALUE_ZERO;
  });

  // enable_player: re-enable player input processing
  reg.register('enable_player', () => {
    if (driver.currentObject) {
      driver.currentObject.commandsEnabled = true;
      driver.currentObject._playerDisabled = false;
    }
    return SVALUE_ZERO;
  });

  // disable_player: temporarily disable player input processing
  reg.register('disable_player', () => {
    if (driver.currentObject) {
      driver.currentObject._playerDisabled = true;
    }
    return SVALUE_ZERO;
  });
}
