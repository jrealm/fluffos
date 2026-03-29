import { mkInt, mkString, SVALUE_ZERO, T_OBJECT, T_STRING, T_ARRAY, T_INT, T_FUNCTION } from '../../vm/svalue.mjs';
import { lpcSprintf } from './sprintf.mjs';
import { lookup as dnsLookup } from 'node:dns';

// Helper: send message to an object (interactive or NPC via catch_tell)
function tellObject(driver, obj, msg) {
  if (!obj) return;
  if (obj.interactive) {
    obj.interactive.send(msg);
  } else {
    // NPC: call catch_tell() apply (C behavior)
    try {
      driver.apply('catch_tell', obj, [mkString(msg)]);
    } catch { /* object may not have catch_tell */ }
  }
}

// Helper: check if object should receive messages (interactive or has O_LISTENER/catch_tell)
function isListener(obj) {
  if (obj.interactive) return true;
  if (obj.isListener) return true;
  // Check if object has catch_tell function
  if (obj.program?.findFunction?.('catch_tell') ||
      obj.program?.findInheritedFunction?.('catch_tell')) return true;
  return false;
}

export function registerInteractiveEfuns(reg, driver) {
  // write: sends to command_giver (this_player), NOT current_object
  // C: do_write() sends to command_giver, fallback to current_object
  reg.register('write', (args) => {
    const sv = args[0];
    // In FluffOS, write(0) and write(undefined) produce no output
    if (!sv || (sv.type === T_INT && sv.value === 0)) return SVALUE_ZERO;
    const text = sv.type === T_STRING ? sv.value : String(sv.value);
    const target = driver.currentPlayer ?? driver.currentObject;
    if (target) {
      tellObject(driver, target, text);
    }
    return SVALUE_ZERO;
  });

  // tell_object: sends to NPC via catch_tell if not interactive
  reg.register('tell_object', (args) => {
    const obj = args[0].type === T_OBJECT ? args[0].value : null;
    const sv = args[1];
    if (!sv || (sv.type === T_INT && sv.value === 0)) return SVALUE_ZERO;
    const msg = sv.type === T_STRING ? sv.value : String(sv.value);
    if (obj) {
      tellObject(driver, obj, msg);
    }
    return SVALUE_ZERO;
  });

  reg.register('message', (args) => {
    const msgType = args[0];
    const sv1 = args[1];
    if (!sv1 || (sv1.type === T_INT && sv1.value === 0)) return SVALUE_ZERO;
    const msg = sv1.type === T_STRING ? sv1.value : String(sv1.value);
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
      // Call receive_message() apply (C behavior)
      const hasFn = obj.program?.findFunction?.('receive_message') ||
                    obj.program?.findInheritedFunction?.('receive_message');
      if (hasFn) {
        driver.apply('receive_message', obj, [msgType, args[1]]);
      } else if (obj.interactive) {
        obj.interactive.send(msg);
      } else {
        // Non-listener, non-interactive: recurse into inventory (C behavior)
        for (const inv of obj.inventory) {
          sendTo(inv);
        }
      }
    }

    if (targets.type === T_OBJECT) {
      sendTo(targets.value);
    } else if (targets.type === T_ARRAY) {
      for (const sv of targets.value) {
        if (sv.type === T_OBJECT) sendTo(sv.value);
      }
    } else if (targets.type === T_STRING) {
      const obj = driver.objects?.find(targets.value) ?? driver.objects?.find(targets.value + '.c');
      if (obj) {
        sendTo(obj);
      }
    }
    return SVALUE_ZERO;
  });

  reg.register('input_to', (args) => {
    const func = args[0];
    let flag = 0;
    let extraArgs = [];
    for (let i = 1; i < args.length; i++) {
      if (args[i].type === T_INT) {
        flag |= args[i].value;
      } else {
        extraArgs.push(args[i]);
      }
    }

    const player = driver.currentPlayer ?? driver.currentObject;
    if (player?.interactive) {
      const obj = driver.currentObject;
      const conn = player.interactive;
      conn.setInputTo((line) => {
        driver.currentObject = obj;
        driver.currentPlayer = player;
        driver.vm._currentObject = obj;
        driver.vm.evalCost = 0;
        const callArgs = [mkString(line), ...extraArgs];
        try {
          if (func.type === T_FUNCTION) {
            const savedProg = driver.vm.currentProgram;
            const savedGlobals = driver.vm.globals;
            driver.vm.currentProgram = obj.program;
            driver.vm.globals = obj.variables;
            try {
              driver.vm._callFunctionPtr(func.value, callArgs);
            } finally {
              obj.variables = driver.vm.globals;
              driver.vm.currentProgram = savedProg;
              driver.vm.globals = savedGlobals;
            }
          } else {
            driver.apply(func.value, obj, callArgs);
          }
        } catch (e) {
          if (e.message?.includes('undefined')) {
            console.error(`[input_to] ${e.message}`);
            console.error(e.stack?.split('\n').slice(1, 5).join('\n'));
          }
          const tb = driver.vm.collectTraceback(e.message ?? String(e));
          driver.callErrorHandler(tb, 0);
        }
        driver.currentPlayer = null;
      });
      return mkInt(1); // success
    }
    return SVALUE_ZERO; // failure
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
    driver._notifyFailMsg = args[0];
    return SVALUE_ZERO;
  });

  reg.register('this_player', () => {
    if (driver.currentPlayer) {
      return { type: T_OBJECT, value: driver.currentPlayer };
    }
    return SVALUE_ZERO;
  });

  // say: sends to all listeners in environment (interactive + NPC with catch_tell)
  // C: excludes command_giver, sends to env itself + env's inventory
  reg.register('say', (args) => {
    const msg = args[0].type === T_STRING ? args[0].value : String(args[0].value);
    const curObj = driver.currentObject;
    const env = curObj?.environment;
    if (!env) return SVALUE_ZERO;

    const excludeSet = new Set();
    excludeSet.add(curObj);
    if (args[1]) {
      if (args[1].type === T_ARRAY) {
        for (const sv of args[1].value) {
          if (sv.type === T_OBJECT) excludeSet.add(sv.value);
        }
      } else if (args[1].type === T_OBJECT) {
        excludeSet.add(args[1].value);
      }
    }

    // Send to environment itself if it's a listener
    if (!excludeSet.has(env) && isListener(env)) {
      tellObject(driver, env, msg);
    }

    // Send to all listeners in environment's inventory
    for (const obj of env.inventory) {
      if (!excludeSet.has(obj) && isListener(obj)) {
        tellObject(driver, obj, msg);
      }
    }
    return SVALUE_ZERO;
  });

  // tell_room: sends to all listeners in room (supports string room arg)
  reg.register('tell_room', (args) => {
    let room;
    if (args[0].type === T_OBJECT) {
      room = args[0].value;
    } else if (args[0].type === T_STRING) {
      room = driver.objects?.find(args[0].value) ?? driver.objects?.find(args[0].value + '.c');
    }
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
      if (!excludeSet.has(obj) && isListener(obj)) {
        tellObject(driver, obj, msg);
      }
    }
    return SVALUE_ZERO;
  });

  // shout: sends to all interactive/listener objects
  reg.register('shout', (args) => {
    const msg = args[0].type === T_STRING ? args[0].value : String(args[0].value);
    for (const [, obj] of driver.objects.objects) {
      if (obj.isDestructed?.()) continue;
      if (!obj.environment) continue; // skip objects without environment
      if (isListener(obj)) {
        tellObject(driver, obj, msg);
      }
    }
    return SVALUE_ZERO;
  });

  // receive: sends to current_object (self)
  reg.register('receive', (args) => {
    const sv = args[0];
    if (!sv || (sv.type === T_INT && sv.value === 0)) return SVALUE_ZERO;
    const msg = sv.type === T_STRING ? sv.value : String(sv.value);
    if (driver.currentObject?.interactive) {
      driver.currentObject.interactive.send(msg);
    }
    return SVALUE_ZERO;
  });

  // get_char: supports flag and extra args
  reg.register('get_char', (args) => {
    const func = args[0];
    let flag = 0;
    let extraArgs = [];
    for (let i = 1; i < args.length; i++) {
      if (args[i].type === T_INT) {
        flag |= args[i].value;
      } else {
        extraArgs.push(args[i]);
      }
    }

    const player = driver.currentPlayer ?? driver.currentObject;
    if (player?.interactive) {
      const obj = driver.currentObject;
      const conn = player.interactive;
      conn.charMode = true;
      conn.charCallback = (ch) => {
        driver.currentPlayer = player;
        driver.currentObject = obj;
        const callArgs = [mkString(ch), ...extraArgs];
        if (func.type === T_FUNCTION) {
          driver.vm._callFunctionPtr(func.value, callArgs);
        } else {
          driver.apply(func.value, obj, callArgs);
        }
        driver.currentPlayer = null;
      };
      return mkInt(1); // success
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
      // Return resolved hostname if available, otherwise IP
      const hostname = obj.interactive.resolvedHostname;
      if (hostname) return mkString(hostname);
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
      return mkInt(1);
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

  // printf: sends to command_giver (this_player), not current_object
  reg.register('printf', (args) => {
    const text = lpcSprintf(args);
    const target = driver.currentPlayer ?? driver.currentObject;
    if (target) {
      tellObject(driver, target, text);
    }
    return SVALUE_ZERO;
  });

  reg.register('websocket_handshake_done', () => {
    if (driver.currentObject?.interactive) {
      const conn = driver.currentObject.interactive;
      conn.protocol = 'websocket';
      conn.websocketReady = true;
    }
    return SVALUE_ZERO;
  });

  reg.register('enable_player', () => {
    if (driver.currentObject) {
      driver.currentObject.commandsEnabled = true;
      driver.currentObject._playerDisabled = false;
    }
    return SVALUE_ZERO;
  });

  reg.register('disable_player', () => {
    if (driver.currentObject) {
      driver.currentObject._playerDisabled = true;
    }
    return SVALUE_ZERO;
  });

  reg.register('in_edit', (args) => {
    // ed editor not implemented — always return 0
    return SVALUE_ZERO;
  });

  reg.register('in_input', (args) => {
    const obj = args.length > 0 && args[0].type === T_OBJECT ? args[0].value : driver.currentObject;
    if (obj?.interactive) {
      return mkInt(obj.interactive.inputTo ? 1 : 0);
    }
    return SVALUE_ZERO;
  });

  reg.register('has_zmp', (args) => {
    const obj = args.length > 0 && args[0].type === T_OBJECT ? args[0].value : driver.currentObject;
    if (obj?.interactive) {
      return mkInt(obj.interactive.zmpEnabled ? 1 : 0);
    }
    return SVALUE_ZERO;
  });

  reg.register('send_zmp', (args) => {
    const cmd = args[0]?.type === T_STRING ? args[0].value : '';
    const zmpArgs = args[1]?.type === T_ARRAY ? args[1].value.map(sv => sv.value) : [];
    if (driver.currentObject?.interactive?.sendZmp) {
      driver.currentObject.interactive.sendZmp(cmd, zmpArgs);
    }
    return SVALUE_ZERO;
  });

  reg.register('request_term_type', () => {
    if (driver.currentObject?.interactive?.requestTermType) {
      driver.currentObject.interactive.requestTermType();
    }
    return SVALUE_ZERO;
  });

  reg.register('start_request_term_type', () => {
    if (driver.currentObject?.interactive?.requestTermType) {
      driver.currentObject.interactive.requestTermType();
    }
    return SVALUE_ZERO;
  });

  reg.register('request_term_size', (args) => {
    const flag = args.length > 0 ? args[0].value : 1;
    if (driver.currentObject?.interactive?.requestTermSize) {
      driver.currentObject.interactive.requestTermSize(flag);
    }
    return SVALUE_ZERO;
  });

  reg.register('resolve', (args) => {
    const host = args[0]?.type === T_STRING ? args[0].value : '';
    const callback = args[1];
    dnsLookup(host, (err, address) => {
      const result = err ? '' : address;
      if (callback.type === T_FUNCTION) {
        driver.vm._callFunctionPtr(callback.value, [mkString(host), mkString(result), mkInt(err ? 0 : 1)]);
      } else if (callback.type === T_STRING) {
        driver.apply(callback.value, driver.currentObject, [mkString(host), mkString(result), mkInt(err ? 0 : 1)]);
      }
    });
    return SVALUE_ZERO;
  });
}
