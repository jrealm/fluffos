import { Machine } from '../vm/machine.mjs';
import { EfunRegistry } from './efuns.mjs';
import { ObjectManager } from './object-manager.mjs';
import { CallOutManager } from './callout.mjs';
import { CommandManager } from './commands.mjs';
import { Server } from '../net/server.mjs';
import { CONN_LOGGED_IN } from '../net/connection.mjs';
import { registerInteractiveEfuns } from './efuns/interactive.mjs';
import { registerSaveEfuns } from './efuns/save.mjs';
import { registerFileEfuns } from './efuns/files.mjs';
import { registerShadowEfuns } from './efuns/shadow.mjs';
import { registerDatabaseEfuns } from './efuns/database.mjs';
import { registerSnoopEfuns } from './efuns/snoop.mjs';
import { registerSocketEfuns } from './efuns/sockets.mjs';
import { registerContribEfuns } from './efuns/contrib.mjs';
import { registerObjectEfuns } from './efuns/objects.mjs';
import { registerEncodingEfuns } from './efuns/encoding.mjs';
import { registerAsyncEfuns } from './efuns/async.mjs';
import { registerCompressEfuns } from './efuns/compress.mjs';
import { spawn } from 'node:child_process';
import { LpcSocketManager } from '../net/lpc-socket.mjs';
import { apply, setMachine, setApplyHook } from './apply.mjs';
import { mkInt, mkString, mkArray, mappingKey, SVALUE_ZERO, T_OBJECT, T_MAPPING, T_STRING, T_ARRAY, T_FUNCTION } from '../vm/svalue.mjs';
import { O_HEART_BEAT } from './object.mjs';
import { setSimulEfunNames } from '../compiler/codegen.mjs';
import { RuntimeError } from '../vm/machine.mjs';
import { LpcOptions } from './options.mjs';

export class Driver {
  constructor(config, options = {}) {
    this.config = config;
    this.options = options.lpcOptions ?? LpcOptions.fromConfig(config);
    this.vm = new Machine();
    this.efuns = new EfunRegistry();
    this.callOuts = new CallOutManager();
    this.callOuts.maxCallOuts = parseInt(config['max call outs'] ?? '1000', 10);
    this.heartBeatList = new Set();
    this.currentObject = null;
    this.bootTime = Date.now();
    this.sockets = new LpcSocketManager();
    this.master = null;
    this.simulEfunObject = null;
    this.simulEfunNames = new Set();
    this.resetInterval = parseInt(config['time to reset'] ?? '1800', 10) * 1000;
    this.cleanUpInterval = parseInt(config['time to clean up'] ?? '900', 10) * 1000;

    this.efuns.loadDefaults();
    this._registerDriverEfuns();

    this.vm.efunHandler = (name, args) => {
      if (this.efuns.has(name)) {
        return this.efuns.call(name, args);
      }
      return this.callSimulEfun(name, args);
    };
    this.vm.simulEfunHandler = (name, args) => this.callSimulEfun(name, args);
    this.vm.callOtherHandler = (objSv, method, args) => {
      let obj;
      if (objSv.type === T_OBJECT) {
        obj = objSv.value;
      } else if (objSv.type === T_STRING) {
        const path = objSv.value.endsWith('.c') ? objSv.value : objSv.value + '.c';
        obj = this.objects.find(path);
        if (!obj) {
          try {
            obj = this.objects.load(path);
          } catch (e) {
            // In FluffOS, call_other with a non-existent or compile-error object returns 0 silently.
            // Throwing here would propagate as a runtime error to the player — avoid that.
            console.error(`[call_other] Failed to load ${path}: ${e.message.slice(0, 150)}`);
            return SVALUE_ZERO;
          }
        }
      } else {
        return SVALUE_ZERO;
      }
      if (!obj || obj.isDestructed()) return SVALUE_ZERO;
      return apply(method, obj, args);
    };
    this.vm.maxEvalCost = parseInt(config['max eval cost'] ?? '1000000', 10);
    setMachine(this.vm);

    const self = this;
    setApplyHook({
      before: (obj) => {
        const saved = self.currentObject;
        self.currentObject = obj;
        self.vm._currentObject = obj;
        return saved;
      },
      after: (saved) => {
        self.currentObject = saved;
        self.vm._currentObject = saved;
      },
    });

    const readFile = options.readFile ?? null;
    // Build compiler defines — combine options + FluffOS built-in macros
    const compilerDefines = {
      ...this.options.toDefines(),
      MUD_NAME: `"${config['name'] ?? 'LPC-JS'}"`,
      __ARCH__: '"lpc-js"',
      __COMPILER__: '"lpc-js"',
      __VERSION__: '"1.0"',
      __PORT__: config['port number'] ?? '5000',
      __SAVE_EXTENSION__: '".o"',
      __HEARTBEAT_INTERVAL__: '1',
      HAS_RUSAGE: '0',
      HAS_DEBUG_LEVEL: '0',
    };

    this.objects = new ObjectManager({
      readFile,
      includePaths: (config['include directories'] ?? '').split(':').filter(Boolean),
      defines: compilerDefines,
      globalInclude: config['global include file'] ?? null,
    });

    this.callOuts.onFire = (func, obj, args) => {
      if (typeof func === 'object' && func.type === T_FUNCTION) {
        this.vm._callFunctionPtr(func.value, args);
      } else {
        apply(func, obj, args);
      }
    };

    // Set UIDs on newly created objects — use creator_file() if master provides it,
    // otherwise fall back to first-path-component semantics (FluffOS default).
    this.objects.onObjectCreated = (obj) => {
      // First-path-component fallback (used when master not yet loaded or no creator_file)
      const parts = obj.filename.split('/').filter(Boolean);
      const dir = parts.length > 0 ? parts[0] : '';
      let uid;
      if (dir === 'u' && parts.length >= 3) {
        uid = parts[2];
      } else {
        uid = dir || 'Root';
      }

      // If master is loaded and has creator_file, delegate to it (e.g. CatWorld maps /adm/ → Root)
      if (this.master && !this.master.isDestructed()) {
        try {
          const result = apply('creator_file', this.master, [mkString(obj.filename)]);
          if (result && result.type === T_STRING && result.value) {
            uid = result.value;
          }
        } catch {
          // If creator_file fails (not defined, circular load, etc.) keep first-path-component uid
        }
      }

      obj.uid = uid;
      obj.euid = uid;
    };

    this.commands = new CommandManager();
    this.server = null;
    this.currentPlayer = null;
    this._notifyFailMsg = null;
    this._currentVerb = null;
    this.apply = apply;

    registerInteractiveEfuns(this.efuns, this);
    registerSaveEfuns(this.efuns, this);
    registerShadowEfuns(this.efuns, this);
    registerDatabaseEfuns(this.efuns);
    registerSnoopEfuns(this.efuns, this);
    registerSocketEfuns(this.efuns, this);
    registerContribEfuns(this.efuns, this);
    registerObjectEfuns(this.efuns, this);
    registerEncodingEfuns(this.efuns, this);
    registerAsyncEfuns(this.efuns, this);
    registerCompressEfuns(this.efuns);

    const mudlibDir = config['mudlib directory'] ?? '/';
    registerFileEfuns(this.efuns, mudlibDir, this);

    // Apply compile-time options — disable features
    this._applyOptions();
  }

  _applyOptions() {
    const opts = this.options;
    const noop = () => SVALUE_ZERO;

    if (opts.get('NO_ADD_ACTION')) {
      this.efuns.register('add_action', noop);
      this.efuns.register('remove_action', noop);
      this.efuns.register('query_verb', noop);
      this.efuns.register('commands', () => mkArray([]));
      this.efuns.register('enable_commands', noop);
      this.efuns.register('disable_commands', noop);
      this.efuns.register('command', noop);
      this.efuns.register('notify_fail', noop);
    }

    if (opts.get('NO_SHADOWS')) {
      this.efuns.register('shadow', noop);
      this.efuns.register('query_shadowing', noop);
    }

    if (opts.get('NO_ENVIRONMENT')) {
      this.efuns.register('environment', noop);
      this.efuns.register('move_object', noop);
      this.efuns.register('all_inventory', () => mkArray([]));
      this.efuns.register('deep_inventory', () => mkArray([]));
      this.efuns.register('first_inventory', noop);
      this.efuns.register('next_inventory', noop);
      this.efuns.register('present', noop);
    }

    if (opts.get('NO_SNOOP')) {
      this.efuns.register('snoop', noop);
      this.efuns.register('query_snoop', noop);
      this.efuns.register('query_snooping', noop);
    }

    this.vm.maxEvalCost = opts.get('MAX_EVAL_COST') ?? this.vm.maxEvalCost;
  }

  _registerDriverEfuns() {
    const driver = this;

    this.efuns.register('this_object', () => {
      if (driver.currentObject) {
        return { type: T_OBJECT, value: driver.currentObject };
      }
      return SVALUE_ZERO;
    });

    // call_other(ob, func, args...) — function form of ob->func(args)
    this.efuns.register('call_other', (args) => {
      if (args.length < 2) return SVALUE_ZERO;
      const objSv = args[0];
      const method = args[1].value;
      const callArgs = args.slice(2);
      return this.vm.callOtherHandler(objSv, method, callArgs);
    });

    this.efuns.register('call_out', (args) => {
      const func = args[0]; // Can be string or function pointer
      const delay = args[1].value;
      const extraArgs = args.slice(2);
      if (driver.currentObject) {
        if (func.type === T_FUNCTION) {
          driver.callOuts.add(func, driver.currentObject, delay, extraArgs);
        } else {
          driver.callOuts.add(func.value, driver.currentObject, delay, extraArgs);
        }
      }
      return SVALUE_ZERO;
    });

    this.efuns.register('remove_call_out', (args) => {
      const func = args[0].value;
      if (driver.currentObject) {
        const entry = driver.callOuts.findCallOut(driver.currentObject, func);
        if (entry) {
          driver.callOuts.remove(entry);
          return mkInt(1);
        }
      }
      return mkInt(-1);
    });

    this.efuns.register('clone_object', (args) => {
      const path = args[0].value;
      const obj = driver.objects.clone(path);
      return { type: T_OBJECT, value: obj };
    });

    this.efuns.register('destruct', (args) => {
      const obj = args[0].type === T_OBJECT ? args[0].value : null;
      if (obj) driver.objects.destruct(obj);
      return SVALUE_ZERO;
    });

    this.efuns.register('find_object', (args) => {
      // Try exact path first, then with .c extension (FluffOS convention)
      const path = args[0].value;
      const obj = driver.objects.find(path)
               ?? driver.objects.find(path.endsWith('.c') ? path : path + '.c');
      if (obj) return { type: T_OBJECT, value: obj };
      return SVALUE_ZERO;
    });

    this.efuns.register('move_object', (args) => {
      let dest = args[0].type === T_OBJECT ? args[0].value : null;
      if (!dest && args[0].type === T_STRING) {
        const path = args[0].value.endsWith('.c') ? args[0].value : args[0].value + '.c';
        dest = driver.objects.find(path);
        if (!dest) try { dest = driver.objects.load(path); } catch {}
      }
      const mover = driver.currentObject;
      if (mover && dest) {
        mover.moveTo(dest);
        // FluffOS calls init() on the moved object and everything in the room
        const savedObj = driver.currentObject;
        try {
          // Call init() on the room for the moved object
          driver.currentObject = dest;
          try { apply('init', dest, []); } catch {}
          // Call init() on each object in the room for the moved object
          for (const ob of dest.inventory) {
            if (ob !== mover && !ob.isDestructed()) {
              driver.currentObject = ob;
              try { apply('init', ob, []); } catch {}
            }
          }
          // Call init() on the moved object itself (to pick up environment actions)
          driver.currentObject = mover;
          try { apply('init', mover, []); } catch {}
        } finally {
          driver.currentObject = savedObj;
        }
      }
      return SVALUE_ZERO;
    });

    this.efuns.register('environment', (args) => {
      const obj = args.length > 0 && args[0].type === T_OBJECT ? args[0].value : driver.currentObject;
      if (obj && obj.environment) return { type: T_OBJECT, value: obj.environment };
      return SVALUE_ZERO;
    });

    this.efuns.register('set_heart_beat', (args) => {
      if (driver.currentObject) {
        if (args[0].value) {
          driver.heartBeatList.add(driver.currentObject);
          driver.currentObject.flags |= O_HEART_BEAT;
        } else {
          driver.heartBeatList.delete(driver.currentObject);
          driver.currentObject.flags &= ~O_HEART_BEAT;
        }
      }
      return SVALUE_ZERO;
    });

    this.efuns.register('previous_object', (args) => {
      // Walk the VM call stack to find the previous distinct object
      const idx = args.length > 0 && args[0].type === T_INT ? args[0].value : 0;
      const frames = driver.vm.callStack;
      const current = driver.currentObject;
      let found = 0;
      for (let i = frames.length - 1; i >= 0; i--) {
        const obj = frames[i].object;
        if (obj && obj !== current) {
          if (found === idx) return { type: T_OBJECT, value: obj };
          found++;
        }
      }
      return SVALUE_ZERO;
    });

    this.efuns.register('query_verb', () => {
      return driver._currentVerb ? mkString(driver._currentVerb) : SVALUE_ZERO;
    });

    this.efuns.register('query_notify_fail', () => {
      if (driver._notifyFailMsg) {
        if (driver._notifyFailMsg.type === T_STRING) return driver._notifyFailMsg;
        if (driver._notifyFailMsg.type === T_FUNCTION) return driver._notifyFailMsg;
      }
      return SVALUE_ZERO;
    });

    this.efuns.register('enable_commands', () => {
      if (driver.currentObject) driver.currentObject.commandsEnabled = true;
      return SVALUE_ZERO;
    });

    this.efuns.register('disable_commands', () => {
      if (driver.currentObject) driver.currentObject.commandsEnabled = false;
      return SVALUE_ZERO;
    });

    this.efuns.register('set_living_name', (args) => {
      if (driver.currentObject) driver.currentObject.livingName = args[0].value;
      return SVALUE_ZERO;
    });

    this.efuns.register('load_object', (args) => {
      const path = args[0].value;
      const obj = driver.objects.load(path.endsWith('.c') ? path : path + '.c');
      return { type: T_OBJECT, value: obj };
    });

    this.efuns.register('children', (args) => {
      const fname = args[0].value;
      const result = [];
      for (const [, obj] of driver.objects.objects) {
        if (obj.filename === fname || obj.filename === fname + '.c') {
          result.push({ type: T_OBJECT, value: obj });
        }
      }
      return mkArray(result);
    });

    this.efuns.register('command', (args) => {
      const cmd = args[0].value;
      if (driver.currentObject && driver.currentObject.interactive) {
        driver._handleInput(driver.currentObject.interactive, cmd);
        return mkInt(1);
      }
      return SVALUE_ZERO;
    });

    this.efuns.register('query_heart_beat', (args) => {
      const obj = args.length > 0 && args[0].type === T_OBJECT ? args[0].value : driver.currentObject;
      return mkInt(obj && driver.heartBeatList.has(obj) ? 1 : 0);
    });

    // UID permission system
    this.efuns.register('getuid', (args) => {
      const obj = args.length > 0 && args[0].type === T_OBJECT ? args[0].value : driver.currentObject;
      return obj ? mkString(obj.uid || '') : SVALUE_ZERO;
    });

    this.efuns.register('geteuid', (args) => {
      const obj = args.length > 0 && args[0].type === T_OBJECT ? args[0].value : driver.currentObject;
      return obj ? mkString(obj.euid || '') : SVALUE_ZERO;
    });

    this.efuns.register('seteuid', (args) => {
      if (driver.currentObject) {
        driver.currentObject.euid = args[0].value;
        return mkInt(1);
      }
      return SVALUE_ZERO;
    });

    this.efuns.register('export_uid', () => {
      // In FluffOS this transfers uid from caller to target; simplified version
      return SVALUE_ZERO;
    });

    // exec: transfer interactive connection between objects
    this.efuns.register('exec', (args) => {
      const to = args[0].type === T_OBJECT ? args[0].value : null;
      const from = args[1].type === T_OBJECT ? args[1].value : null;
      if (!to || !from || !from.interactive) return SVALUE_ZERO;

      // Transfer connection
      const conn = from.interactive;
      from.interactive = null;
      to.interactive = conn;
      conn.object = to;
      to.onceInteractive = true;
      // Update currentPlayer so write() targets the new object
      if (driver.currentPlayer === from) driver.currentPlayer = to;
      return mkInt(1);
    });

    // replace_program: schedule program replacement
    this.efuns.register('replace_program', (args) => {
      const path = args[0].value;
      if (!driver.currentObject) return SVALUE_ZERO;
      const prog = driver.objects._compile(path.endsWith('.c') ? path : path + '.c');
      driver.currentObject.replaceProgram(prog);
      return SVALUE_ZERO;
    });

    // users: return all interactive objects
    this.efuns.register('users', () => {
      const result = [];
      for (const [, obj] of driver.objects.objects) {
        if (obj.interactive && !obj.isDestructed()) {
          result.push({ type: T_OBJECT, value: obj });
        }
      }
      return mkArray(result);
    });

    // find_living: find object by living name
    this.efuns.register('find_living', (args) => {
      const name = args[0].value;
      for (const [, obj] of driver.objects.objects) {
        if (obj.livingName === name && !obj.isDestructed()) {
          return { type: T_OBJECT, value: obj };
        }
      }
      return SVALUE_ZERO;
    });

    // find_player: find interactive by living name
    this.efuns.register('find_player', (args) => {
      const name = args[0].value;
      for (const [, obj] of driver.objects.objects) {
        if (obj.livingName === name && obj.interactive && !obj.isDestructed()) {
          return { type: T_OBJECT, value: obj };
        }
      }
      return SVALUE_ZERO;
    });

    // inherits: check if object inherits from a given file
    this.efuns.register('inherits', (args) => {
      const parentPath = args[0].value;
      const obj = args[1]?.type === T_OBJECT ? args[1].value : driver.currentObject;
      if (!obj) return SVALUE_ZERO;
      for (const inh of obj.program.inherits) {
        if (inh.program.filename === parentPath || inh.program.filename === parentPath + '.c') {
          return mkInt(1);
        }
      }
      return SVALUE_ZERO;
    });

    // error: raise a runtime error
    this.efuns.register('error', (args) => {
      throw new Error(args[0].value);
    });

    // log_file: append to a log file
    this.efuns.register('log_file', (args) => {
      const logDir = driver.config['log directory'] ?? '/log';
      const writeFile = driver.efuns.registry.get('write_file');
      if (writeFile) {
        try { writeFile([mkString(logDir + '/' + args[0].value), mkString(args[1].value)]); } catch {}
      }
      return SVALUE_ZERO;
    });

    this.efuns.register('objects', () => {
      const result = [];
      for (const [, obj] of driver.objects.objects) {
        if (!obj.isDestructed()) result.push({ type: T_OBJECT, value: obj });
      }
      return mkArray(result);
    });

    this.efuns.register('livings', () => {
      const result = [];
      for (const [, obj] of driver.objects.objects) {
        if (obj.livingName && !obj.isDestructed()) {
          result.push({ type: T_OBJECT, value: obj });
        }
      }
      return mkArray(result);
    });

    this.efuns.register('shutdown', (args) => {
      const code = args.length > 0 ? args[0].value : 0;
      driver.stopServer();
      if (typeof process !== 'undefined') process.exit(code);
      return SVALUE_ZERO;
    });

    this.efuns.register('call_out_info', () => {
      const result = [];
      for (const entry of driver.callOuts.getAll()) {
        if (!entry.cancelled) {
          const remaining = Math.max(0, Math.floor((entry.expireAt - Date.now()) / 1000));
          result.push(mkArray([
            { type: T_OBJECT, value: entry.object },
            mkString(entry.func),
            mkInt(remaining),
            ...entry.args,
          ]));
        }
      }
      return mkArray(result);
    });

    this.efuns.register('uptime', () => {
      return mkInt(Math.floor((Date.now() - driver.bootTime) / 1000));
    });

    this.efuns.register('boot_time', () => {
      return mkInt(Math.floor(driver.bootTime / 1000));
    });

    this.efuns.register('commands', () => {
      if (!driver.currentObject) return mkArray([]);
      const result = [];
      const searchList = driver.commands.getSearchList(driver.currentObject);
      for (const obj of searchList) {
        for (const action of driver.commands.getActions(obj)) {
          result.push(mkArray([
            mkString(action.verb),
            mkString(action.func),
            { type: T_OBJECT, value: obj },
            mkInt(action.flag),
          ]));
        }
      }
      return mkArray(result);
    });

    this.efuns.register('master', () => {
      if (driver.master) return { type: T_OBJECT, value: driver.master };
      return SVALUE_ZERO;
    });

    this.efuns.register('remove_action', (args) => {
      const verb = args[0].value;
      const obj = args[1]?.type === T_OBJECT ? args[1].value : driver.currentObject;
      if (obj) {
        driver.commands.removeAction(obj, verb);
        return mkInt(1);
      }
      return SVALUE_ZERO;
    });

    this.efuns.register('deep_inherit_list', (args) => {
      const obj = args[0]?.type === T_OBJECT ? args[0].value : driver.currentObject;
      if (!obj?.program) return mkArray([]);
      const result = [];
      function collect(program) {
        for (const inh of program.inherits) {
          result.push(mkString(inh.program.filename));
          collect(inh.program);
        }
      }
      collect(obj.program);
      return mkArray(result);
    });

    this.efuns.register('shallow_inherit_list', (args) => {
      const obj = args[0]?.type === T_OBJECT ? args[0].value : driver.currentObject;
      if (!obj?.program) return mkArray([]);
      return mkArray(obj.program.inherits.map(inh => mkString(inh.program.filename)));
    });

    // Eval cost control
    this.efuns.register('set_eval_limit', (args) => {
      const limit = args[0].value;
      driver.vm.maxEvalCost = limit === 0 ? Infinity : limit;
      return SVALUE_ZERO;
    });

    this.efuns.register('reset_eval_cost', () => {
      driver.vm.evalCost = 0;
      return SVALUE_ZERO;
    });

    this.efuns.register('eval_cost', () => {
      return mkInt(driver.vm.evalCost);
    });

    this.efuns.register('max_eval_cost', () => {
      return mkInt(driver.vm.maxEvalCost === Infinity ? 0 : driver.vm.maxEvalCost);
    });

    this.efuns.register('defer', (args) => {
      const func = args[0];
      if (func.type === T_FUNCTION && func.value) {
        // Schedule for next tick
        const obj = driver.currentObject;
        setTimeout(() => {
          if (obj && !obj.isDestructed()) {
            const vm = driver.vm;
            try {
              vm._callFunctionPtr(func.value, []);
            } catch (e) {
              const tb = vm.collectTraceback(e.message ?? String(e));
              driver.callErrorHandler(tb, 0);
            }
          }
        }, 0);
      }
      return SVALUE_ZERO;
    });

    this.efuns.register('all_previous_objects', () => {
      const frames = driver.vm.callStack;
      const result = [];
      const seen = new Set();
      for (let i = frames.length - 1; i >= 0; i--) {
        const obj = frames[i].object;
        if (obj && !seen.has(obj)) {
          seen.add(obj);
          result.push({ type: T_OBJECT, value: obj });
        }
      }
      return mkArray(result);
    });

    this.efuns.register('external_start', (args) => {
      const cmd = args[0].value;
      const cmdArgs = args[1]?.type === T_ARRAY
        ? args[1].value.map(sv => String(sv.value))
        : [];
      const stdoutCb = args[2];
      const stderrCb = args[3];
      const exitCb = args[4];

      const child = spawn(cmd, cmdArgs);

      if (stdoutCb?.type === T_FUNCTION) {
        child.stdout?.on('data', (data) => {
          try { driver.vm._callFunctionPtr(stdoutCb.value, [mkString(data.toString())]); } catch {}
        });
      }
      if (stderrCb?.type === T_FUNCTION) {
        child.stderr?.on('data', (data) => {
          try { driver.vm._callFunctionPtr(stderrCb.value, [mkString(data.toString())]); } catch {}
        });
      }
      if (exitCb?.type === T_FUNCTION) {
        child.on('close', (code) => {
          try { driver.vm._callFunctionPtr(exitCb.value, [mkInt(code ?? 0)]); } catch {}
        });
      }

      return mkInt(child.pid ?? 0);
    });

    // debug_info(flag, ob) — return debug information about an object
    this.efuns.register('debug_info', (args) => {
      const flag = args[0].value;
      const obj = args[1]?.type === T_OBJECT ? args[1].value : driver.currentObject;
      if (!obj) return SVALUE_ZERO;

      if (flag === 0) {
        // Basic object info
        const lines = [
          `O_FILE_NAME: ${obj.filename}`,
          `O_OBJECT_ID: ${obj.objectId}`,
          `O_CLONE_NUM: ${obj.cloneNumber}`,
          `O_FLAGS: ${obj.flags}`,
          `O_NUM_VARS: ${obj.variables?.length ?? 0}`,
          `O_NUM_FUNCS: ${obj.program?.functions?.length ?? 0}`,
          `O_UID: ${obj.uid}`,
          `O_EUID: ${obj.euid}`,
          `O_HEART_BEAT: ${driver.heartBeatList.has(obj) ? 1 : 0}`,
          `O_INTERACTIVE: ${obj.interactive ? 1 : 0}`,
          `O_ENVIRONMENT: ${obj.environment?.objectId ?? 'NONE'}`,
          `O_INVENTORY: ${obj.inventory?.size ?? 0}`,
          `O_LIVING_NAME: ${obj.livingName ?? 'NONE'}`,
        ];
        return mkString(lines.join('\n'));
      }

      if (flag === 1) {
        // Program info — list functions
        if (!obj.program) return mkString('No program');
        const funcs = obj.program.functions.map(f =>
          `${f.name}(${f.numArgs} args, ${f.numLocals} locals)`
        );
        return mkString(funcs.join('\n'));
      }

      if (flag === 2) {
        // Variables with values
        if (!obj.program) return mkString('No program');
        const vars = obj.program.variables.map((v, i) => {
          const val = obj.variables[i];
          return `${v.name} = ${val?.value ?? 0}`;
        });
        return mkString(vars.join('\n'));
      }

      return SVALUE_ZERO;
    });

    // dump_prog(ob) — disassemble program bytecode
    this.efuns.register('dump_prog', (args) => {
      const obj = args[0]?.type === T_OBJECT ? args[0].value : driver.currentObject;
      if (!obj?.program) return mkString('No program');
      const prog = obj.program;
      const lines = [`Program: ${prog.filename}`];
      lines.push(`Functions: ${prog.functions.length}`);
      lines.push(`Variables: ${prog.variables.length}`);
      lines.push(`Strings: ${prog.strings.length}`);
      lines.push(`Inherits: ${prog.inherits.length}`);
      lines.push(`Bytecode: ${prog.bytecode.length} bytes`);
      lines.push('');
      for (const fn of prog.functions) {
        lines.push(`  ${fn.name}: offset=${fn.offset}, args=${fn.numArgs}, locals=${fn.numLocals}`);
      }
      return mkString(lines.join('\n'));
    });

    // trace(level) — set execution tracing level
    this.efuns.register('trace', (args) => {
      const level = args[0].value;
      const oldLevel = driver.vm._traceLevel ?? 0;
      driver.vm._traceLevel = level;
      return mkInt(oldLevel);
    });

    // traceprefix(prefix) — set trace prefix filter
    this.efuns.register('traceprefix', (args) => {
      const prefix = args[0].type === T_STRING ? args[0].value : null;
      const old = driver.vm._tracePrefix ?? SVALUE_ZERO;
      driver.vm._tracePrefix = prefix;
      return old ? mkString(old) : SVALUE_ZERO;
    });

    // reload_object(ob) — recompile and reload an object's program
    this.efuns.register('reload_object', (args) => {
      const obj = args[0]?.type === T_OBJECT ? args[0].value : null;
      if (!obj || obj.isDestructed()) return SVALUE_ZERO;

      // Clear program cache so it recompiles
      driver.objects.programCache.delete(obj.filename);

      // Recompile
      try {
        const newProg = driver.objects._compile(obj.filename);
        obj.program = newProg;
        // Resize variables array to match new program
        const newVars = new Array(newProg.variables.length).fill(SVALUE_ZERO);
        // Preserve existing variable values by name
        const oldProg = obj.program;
        for (let i = 0; i < newProg.variables.length; i++) {
          const name = newProg.variables[i].name;
          if (oldProg?.variables) {
            const oldIdx = oldProg.variables.findIndex(v => v.name === name);
            if (oldIdx >= 0 && oldIdx < obj.variables.length) {
              newVars[i] = obj.variables[oldIdx];
            }
          }
        }
        obj.variables = newVars;
        return mkInt(1);
      } catch {
        return SVALUE_ZERO;
      }
    });

    // find_call_out: find a pending call_out by name or handle
    this.efuns.register('find_call_out', (args) => {
      const sv = args[0];
      if (sv.type === T_STRING) {
        const entry = driver.callOuts.findCallOut(driver.currentObject, sv.value);
        if (entry) {
          return mkInt(Math.max(0, Math.ceil((entry.expireAt - Date.now()) / 1000)));
        }
      }
      return mkInt(-1);
    });

    // hb_time: return the heartbeat interval in seconds
    this.efuns.register('hb_time', () => {
      return mkInt(driver._heartBeatInterval ?? 1);
    });

    // set_reset: set reset time for an object
    this.efuns.register('set_reset', (args) => {
      const obj = args[0].type === T_OBJECT ? args[0].value : null;
      if (!obj) return SVALUE_ZERO;
      if (args.length > 1) {
        obj.nextReset = Date.now() + args[1].value * 1000;
      } else {
        obj.nextReset = 0;
      }
      return SVALUE_ZERO;
    });

    // set_hide: hide/unhide object (stub — no effect in lpc-js)
    this.efuns.register('set_hide', () => SVALUE_ZERO);

    // set_light: set light level (stub — no lighting system in lpc-js)
    this.efuns.register('set_light', () => mkInt(0));

    // reclaim_objects: reclaim destructed objects, return count reclaimed
    this.efuns.register('reclaim_objects', () => {
      let count = 0;
      for (const [id, obj] of driver.objects.objects) {
        if (obj.isDestructed()) {
          driver.objects.objects.delete(id);
          count++;
        }
      }
      return mkInt(count);
    });

    // flush_messages: flush pending output to connection
    this.efuns.register('flush_messages', (args) => {
      if (args.length > 0 && args[0].type === T_OBJECT) {
        const obj = args[0].value;
        if (obj.interactive?.flush) obj.interactive.flush();
      } else {
        for (const [, obj] of driver.objects.objects) {
          if (obj.interactive?.flush) obj.interactive.flush();
        }
      }
      return SVALUE_ZERO;
    });

    // query_load_average: return load average string
    this.efuns.register('query_load_average', () => {
      const cmdsPerSec = driver._commandsPerSecond ?? 0;
      const lpcCost = driver._lpcCostPerSecond ?? 0;
      return mkString(`${cmdsPerSec.toFixed(2)} cmds/s, ${lpcCost.toFixed(2)} comp lines/s`);
    });

    // malloc_status: return memory allocator status
    this.efuns.register('malloc_status', () => {
      const mem = process.memoryUsage();
      return mkString(
        `Heap used: ${(mem.heapUsed / 1024 / 1024).toFixed(1)}MB\n` +
        `Heap total: ${(mem.heapTotal / 1024 / 1024).toFixed(1)}MB\n` +
        `RSS: ${(mem.rss / 1024 / 1024).toFixed(1)}MB\n` +
        `External: ${(mem.external / 1024 / 1024).toFixed(1)}MB`
      );
    });

    // dumpallobj: dump all objects info
    this.efuns.register('dumpallobj', (args) => {
      const lines = [];
      for (const [id, obj] of driver.objects.objects) {
        if (!obj.isDestructed()) {
          lines.push(`${id} refs:${obj.refCount ?? 0}`);
        }
      }
      if (args.length > 0 && args[0].type === T_STRING) {
        try {
          const { writeFileSync } = require('node:fs');
          writeFileSync(args[0].value, lines.join('\n') + '\n');
        } catch { /* ignore */ }
      }
      return SVALUE_ZERO;
    });

    // dump_file_descriptors: return string describing open connections
    this.efuns.register('dump_file_descriptors', () => {
      const lines = [];
      let fd = 0;
      for (const [, obj] of driver.objects.objects) {
        if (obj.interactive) {
          lines.push(`${fd++}: ${obj.objectId} (${obj.interactive.remoteAddress ?? 'unknown'})`);
        }
      }
      return mkString(lines.join('\n'));
    });

    // enable_wizard / disable_wizard: wizard mode toggle
    this.efuns.register('enable_wizard', () => {
      if (driver.currentObject) driver.currentObject._wizard = true;
      return SVALUE_ZERO;
    });

    this.efuns.register('disable_wizard', () => {
      if (driver.currentObject) driver.currentObject._wizard = false;
      return SVALUE_ZERO;
    });

    // set_this_player: manually set the current player
    this.efuns.register('set_this_player', (args) => {
      if (args[0].type === T_OBJECT) {
        driver.currentPlayer = args[0].value;
      } else {
        driver.currentPlayer = null;
      }
      return SVALUE_ZERO;
    });

    // this_interactive: return the current interactive user (not NPC)
    this.efuns.register('this_interactive', () => {
      if (driver.currentPlayer?.interactive) {
        return { type: T_OBJECT, value: driver.currentPlayer };
      }
      return SVALUE_ZERO;
    });

    // this_user: alias for this_player
    this.efuns.register('this_user', () => {
      if (driver.currentPlayer) {
        return { type: T_OBJECT, value: driver.currentPlayer };
      }
      return SVALUE_ZERO;
    });

    // query_privs / set_privs: privilege system
    this.efuns.register('query_privs', (args) => {
      const obj = args.length > 0 && args[0].type === T_OBJECT ? args[0].value : driver.currentObject;
      if (!obj) return SVALUE_ZERO;
      return obj._privs ? mkString(obj._privs) : SVALUE_ZERO;
    });

    this.efuns.register('set_privs', (args) => {
      const obj = args[0].type === T_OBJECT ? args[0].value : null;
      if (!obj) return SVALUE_ZERO;
      obj._privs = args[1].type === T_STRING ? args[1].value : String(args[1].value);
      return SVALUE_ZERO;
    });

    // COMPAT_32 aliases
    this.efuns.register('strstr', (args) => this.efuns.call('strsrch', args));
    this.efuns.register('m_delete', (args) => this.efuns.call('map_delete', args));
    this.efuns.register('m_values', (args) => this.efuns.call('values', args));
    this.efuns.register('m_indices', (args) => this.efuns.call('keys', args));
    this.efuns.register('inherit_list', (args) => this.efuns.call('shallow_inherit_list', args));
    this.efuns.register('query_once_interactive', (args) => this.efuns.call('userp', args));
    this.efuns.register('raise_error', (args) => this.efuns.call('error', args));
    this.efuns.register('get_eval_cost', () => this.efuns.call('eval_cost', []));

    // get_config: get driver configuration value by index
    this.efuns.register('get_config', (args) => {
      const configKeys = [
        'mudlib directory', 'driver log', 'name', 'port number',
        'max users', 'max bits', 'max array size', 'max mapping size',
        'max buffer size', 'max string length', 'max byte transfer',
        'reserved size', 'hash table size', 'object table size',
        'max call outs', 'max eval cost', 'time to reset', 'time to clean up',
        'default error message', 'default fail message',
      ];
      const idx = args[0].value;
      if (idx < 0 || idx >= configKeys.length) return SVALUE_ZERO;
      const key = configKeys[idx];
      const val = driver.config[key];
      if (val === undefined) return SVALUE_ZERO;
      const num = parseInt(val, 10);
      if (!isNaN(num) && String(num) === val) return mkInt(num);
      return mkString(String(val));
    });
  }

  mainLoop() {
    this.callOuts.tick();
    this.heartBeatTick();
    this.resetTick();
    this.cleanUpTick();
    this._processReplaceProgramQueue();
  }

  _processReplaceProgramQueue() {
    for (const [, obj] of this.objects.objects) {
      if (obj.replaceProgramPending) {
        obj.applyReplaceProgram();
      }
    }
  }

  boot() {
    // 1. Load master
    const masterFile = this.config['master file'];
    this.master = this.objects.load(masterFile);

    // 2. Load simul_efun (optional)
    try {
      this.loadSimulEfun();
    } catch (e) {
      console.error(`Warning: simul_efun load failed: ${e.message}`);
    }

    // 3. Call epilog → get preload list
    const preloadList = apply('epilog', this.master, []);
    if (preloadList?.type === T_ARRAY) {
      const paths = preloadList.value;
      console.log(`Preloading ${paths.length} objects...`);
      for (let i = 0; i < paths.length; i++) {
        const entry = paths[i];
        if (!entry || entry.type !== T_STRING) continue;
        const objPath = entry.value;
        console.log(`[${i + 1}/${paths.length}] ${objPath}`);
        try {
          apply('preload', this.master, [mkString(objPath)]);
        } catch (e) {
          console.error(`  Failed: ${e.message}`);
          const tb = this.vm.collectTraceback(e.message ?? String(e));
          this.callErrorHandler(tb, 0);
        }
      }
      console.log('Preload complete.');
    }
  }

  loadSimulEfun() {
    // Try master->get_simul_efun() first, fallback to config
    let simulPath;
    const pathResult = apply('get_simul_efun', this.master, []);
    if (pathResult && pathResult.type === T_STRING) {
      simulPath = pathResult.value;
    } else if (this.config['simul efun file']) {
      simulPath = this.config['simul efun file'];
    } else {
      return;
    }
    if (!simulPath) return;

    this.simulEfunObject = this.objects.load(simulPath.endsWith('.c') ? simulPath : simulPath + '.c');
    this.simulEfunNames.clear();
    for (const func of this.simulEfunObject.program.functions) {
      if (func.name !== 'create') {
        this.simulEfunNames.add(func.name);
      }
    }
    setSimulEfunNames(this.simulEfunNames);
  }

  callSimulEfun(name, args) {
    if (!this.simulEfunObject || this.simulEfunObject.isDestructed()) {
      if (this.master && !this.master.isDestructed()) {
        this.loadSimulEfun();
      }
    }
    if (!this.simulEfunObject) {
      throw new RuntimeError(`Unknown function: ${name}`);
    }
    if (this.simulEfunNames.has(name)) {
      if (name === 'write') console.error(`[simul write] player=${this.currentPlayer?.filename} arg=${String(args[0]?.value).slice(0,30)}`);
      return apply(name, this.simulEfunObject, args);
    }
    throw new RuntimeError(`Unknown function: ${name}`);
  }

  checkFileAccess(type, filePath, func) {
    if (!this.master || this.master.isDestructed()) return filePath;

    const applyName = type === 'read' ? 'valid_read' : 'valid_write';
    const ob = this.currentObject;
    const result = apply(applyName, this.master, [
      mkString(filePath),
      ob ? { type: T_OBJECT, value: ob } : SVALUE_ZERO,
      mkString(func),
    ]);

    if (result?.type === T_STRING) return result.value;
    if (result?.value) return filePath;
    return null;
  }

  checkSocketAccess(func, args = []) {
    if (!this.master || this.master.isDestructed()) return true;

    const ob = this.currentObject;
    const applyArgs = [
      ob ? { type: T_OBJECT, value: ob } : SVALUE_ZERO,
      mkString(func),
      ...args,
    ];
    const result = apply('valid_socket', this.master, applyArgs);
    return !!result?.value;
  }

  callErrorHandler(tracebackOrError, caught) {
    if (!this.master || this.master.isDestructed()) return;

    let tb;
    if (tracebackOrError && tracebackOrError.frames) {
      tb = tracebackOrError;
    } else if (tracebackOrError instanceof Error) {
      tb = this.vm.collectTraceback(tracebackOrError.message);
    } else {
      tb = { message: String(tracebackOrError), frames: [] };
    }

    const traceArray = mkArray(
      tb.frames.map(f => {
        const m = new Map();
        m.set(mappingKey(mkString('function')), { key: mkString('function'), value: mkString(f.function ?? '<unknown>') });
        m.set(mappingKey(mkString('program')), { key: mkString('program'), value: mkString(f.file ?? '<unknown>') });
        m.set(mappingKey(mkString('object')), { key: mkString('object'), value: mkString(f.object ?? '<none>') });
        m.set(mappingKey(mkString('line')), { key: mkString('line'), value: mkInt(f.line ?? 0) });
        return { type: T_MAPPING, value: m };
      })
    );

    const firstFile = tb.frames[0]?.file ?? '<unknown>';
    const firstObj = tb.frames[0]?.object;
    const firstObjRef = firstObj ? this.objects.find(firstObj) ?? this.objects.find(firstObj + '.c') : null;

    const errorMap = new Map();
    const setKey = (k, v) => errorMap.set(mappingKey(mkString(k)), { key: mkString(k), value: v });
    setKey('error', mkString(tb.message));
    setKey('file', mkString(firstFile));
    setKey('program', mkString(firstFile));
    setKey('object', firstObjRef ? { type: T_OBJECT, value: firstObjRef } : mkString(firstObj ?? '<none>'));
    setKey('line', mkInt(tb.frames[0]?.line ?? 0));
    setKey('trace', traceArray);

    try {
      apply('error_handler', this.master, [
        { type: T_MAPPING, value: errorMap },
        mkInt(caught),
      ]);
    } catch (e) {
      console.error(`error_handler threw: ${e.message}`);
    }
  }

  heartBeatTick() {
    const maxErrors = parseInt(this.config['max heart beat errors'] ?? '10', 10);
    const toRemove = [];
    for (const obj of this.heartBeatList) {
      if (obj.isDestructed()) {
        toRemove.push(obj);
        continue;
      }
      this.currentObject = obj;
      try {
        apply('heart_beat', obj, []);
        obj.heartBeatErrors = 0;
      } catch (e) {
        const tb = this.vm.collectTraceback(e.message ?? String(e));
        this.callErrorHandler(tb, 0);
        obj.heartBeatErrors = (obj.heartBeatErrors ?? 0) + 1;
        if (obj.heartBeatErrors >= maxErrors) {
          obj.flags &= ~O_HEART_BEAT;
          toRemove.push(obj);
        }
      }
    }
    for (const obj of toRemove) {
      this.heartBeatList.delete(obj);
    }
    this.currentObject = null;
  }

  _jitteredResetInterval() {
    const jitter = 1.0 + (Math.random() * 0.3 - 0.15);
    return Math.round(this.resetInterval * jitter);
  }

  resetTick() {
    const now = Date.now();
    for (const obj of this.objects.objects.values()) {
      if (obj.isDestructed()) continue;
      if (obj.nextReset === 0 || obj.nextReset > now) continue;
      // Only reset objects that were accessed since last reset was scheduled
      if (obj.lastAccess < obj.nextReset - this.resetInterval) continue;

      obj.nextReset = now + this._jitteredResetInterval();
      this.currentObject = obj;
      try {
        apply('reset', obj, []);
      } catch (e) {
        const tb = this.vm.collectTraceback(e.message ?? String(e));
        this.callErrorHandler(tb, 0);
      }
    }
    this.currentObject = null;
  }

  cleanUpTick() {
    const now = Date.now();
    for (const obj of this.objects.objects.values()) {
      if (obj.isDestructed()) continue;
      if (obj.interactive) continue;
      if (obj.flags & O_HEART_BEAT) continue;
      if (now - obj.lastAccess < this.cleanUpInterval) continue;

      this.currentObject = obj;
      try {
        const result = apply('clean_up', obj, []);
        if (!result?.value) {
          obj.lastAccess = now; // Declined — delay next check
        }
      } catch (e) {
        const tb = this.vm.collectTraceback(e.message ?? String(e));
        this.callErrorHandler(tb, 0);
      }
    }
    this.currentObject = null;
  }

  async startServer(port) {
    this.server = new Server();
    this.server.onConnection = (conn) => this._handleNewConnection(conn);
    await this.server.listen(port);

    const wsPort = this.config['websocket port number'];
    if (wsPort) {
      await this.server.listenWebSocket(parseInt(wsPort, 10));
    }

    return this.server.port;
  }

  _handleNewConnection(conn) {
    const masterFile = this.config['master file'];
    const master = this.objects.find(masterFile + '.c')
                || this.objects.find(masterFile);
    if (!master) {
      conn.send('No master object.\n');
      conn.close();
      return;
    }

    const loginResult = apply('connect', master, []);
    if (!loginResult || loginResult.value === 0) {
      conn.send('Connection refused.\n');
      conn.close();
      return;
    }

    const loginObj = loginResult.type === T_OBJECT ? loginResult.value : null;
    if (!loginObj) {
      conn.send('Connection refused.\n');
      conn.close();
      return;
    }

    loginObj.interactive = conn;
    loginObj.onceInteractive = true;
    conn.object = loginObj;
    conn.state = CONN_LOGGED_IN;

    this.currentObject = loginObj;
    this.currentPlayer = loginObj;
    apply('logon', loginObj, []);
    this.currentObject = null;
    this.currentPlayer = null;

    conn.onLine = (line) => this._handleInput(conn, line);
    conn.onClose = () => this._handleDisconnect(conn);

    // GMCP receive handler — always dispatch to conn.object (follows exec())
    conn.onGmcp = (msg, data) => {
      const target = conn.object;
      if (target && !target.isDestructed()) {
        this.currentObject = target;
        this.currentPlayer = target;
        apply('gmcp', target, [mkString(data != null ? `${msg} ${JSON.stringify(data)}` : msg)]);
        this.currentObject = null;
        this.currentPlayer = null;
      }
    };

    // Negotiate GMCP and MXP for Telnet connections
    if (conn.protocol === 'telnet') {
      conn.sendTelnetCommand(251, 201); // IAC WILL GMCP
      conn.sendTelnetCommand(251, 91);  // IAC WILL MXP

      conn.telnet.onCommand = (cmd, option) => {
        if (cmd === 253 && option === 201) conn.gmcpEnabled = true;  // DO GMCP
        if (cmd === 254 && option === 201) conn.gmcpEnabled = false; // DONT GMCP
        if (cmd === 253 && option === 91) conn.mxpEnabled = true;    // DO MXP
        if (cmd === 254 && option === 91) conn.mxpEnabled = false;   // DONT MXP
      };
    }
  }

  _handleInput(conn, line) {
    const player = conn.object;
    if (!player || player.isDestructed()) return;

    this.currentObject = player;
    this.currentPlayer = player;
    this._notifyFailMsg = null;
    this.vm.evalCost = 0;

    try {
      const piResult = apply('process_input', player, [mkString(line)]);
      if (piResult && piResult.value === 1) {
        this.currentObject = null;
        this.currentPlayer = null;
        return;
      }
      // process_input can return a modified command string
      const processedLine = (piResult && piResult.type === T_STRING) ? piResult.value : line;

      const searchList = this.commands.getSearchList(player);
      const handled = this.commands.dispatch(processedLine, (func, obj, arg, verb) => {
        this.currentObject = obj;
        this.vm._currentObject = obj;
        this._currentVerb = verb;
        let result;
        if (typeof func === 'object' && func.kind) {
          // Function pointer from add_action((: func :), ...)
          // Must set globals to the object's variables (like apply does)
          const savedProg = this.vm.currentProgram;
          const savedGlobals = this.vm.globals;
          this.vm.currentProgram = obj.program;
          this.vm.globals = obj.variables;
          try {
            result = this.vm._callFunctionPtr(func, [mkString(arg)]);
          } finally {
            obj.variables = this.vm.globals;
            this.vm.currentProgram = savedProg;
            this.vm.globals = savedGlobals;
          }
        } else {
          result = apply(func, obj, [mkString(arg)]);
        }
        return result && result.value;
      }, searchList);

      if (!handled && this._notifyFailMsg) {
        const nf = this._notifyFailMsg;
        if (nf.type === T_FUNCTION) {
          this.vm._callFunctionPtr(nf.value, []);
        } else {
          if (nf.type === T_STRING) conn.send(nf.value);
          else if (nf.type !== T_INT || nf.value !== 0) conn.send(String(nf.value));
        }
      } else if (!handled) {
        conn.send('What?\n');
      }
    } catch (e) {
      const tb = this.vm.collectTraceback(e.message ?? String(e));
      this.callErrorHandler(tb, 0);
    }

    this.currentObject = null;
    this.currentPlayer = null;
  }

  _handleDisconnect(conn) {
    const obj = conn.object;
    if (obj) {
      obj.interactive = null;
      conn.object = null;
    }
  }

  stopServer() {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}
