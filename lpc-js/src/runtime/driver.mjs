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
import { registerEncodingEfuns } from './efuns/encoding.mjs';
import { registerAsyncEfuns } from './efuns/async.mjs';
import { registerCompressEfuns } from './efuns/compress.mjs';
import { spawn } from 'node:child_process';
import { LpcSocketManager } from '../net/lpc-socket.mjs';
import { apply, setMachine, setApplyHook } from './apply.mjs';
import { mkInt, mkString, mkArray, SVALUE_ZERO, T_OBJECT, T_MAPPING, T_STRING, T_ARRAY, T_FUNCTION } from '../vm/svalue.mjs';
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
    this.vm.maxEvalCost = parseInt(config['max eval cost'] ?? '1000000', 10);
    setMachine(this.vm);

    const self = this;
    setApplyHook({
      before: (obj) => {
        const saved = self.currentObject;
        self.currentObject = obj;
        return saved;
      },
      after: (saved) => {
        self.currentObject = saved;
      },
    });

    const readFile = options.readFile ?? null;
    this.objects = new ObjectManager({
      readFile,
      includePaths: (config['include directories'] ?? '').split(':').filter(Boolean),
      defines: this.options.toDefines(),
    });

    this.callOuts.onFire = (func, obj, args) => {
      if (typeof func === 'object' && func.type === T_FUNCTION) {
        this.vm._callFunctionPtr(func.value, args);
      } else {
        apply(func, obj, args);
      }
    };

    // Set UIDs on newly created objects
    this.objects.onObjectCreated = (obj) => {
      // Default: derive uid from filename path (first directory component)
      const parts = obj.filename.split('/').filter(Boolean);
      obj.uid = parts.length > 1 ? parts[0] : 'root';
      obj.euid = obj.uid;
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
      const obj = driver.objects.find(args[0].value);
      if (obj) return { type: T_OBJECT, value: obj };
      return SVALUE_ZERO;
    });

    this.efuns.register('move_object', (args) => {
      const dest = args[0].type === T_OBJECT ? args[0].value : null;
      if (driver.currentObject && dest) {
        driver.currentObject.moveTo(dest);
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

    this.efuns.register('previous_object', () => {
      return driver.currentObject ? { type: T_OBJECT, value: driver.currentObject } : SVALUE_ZERO;
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
        writeFile([mkString(logDir + '/' + args[0].value), mkString(args[1].value)]);
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
    const pathResult = apply('get_simul_efun', this.master, []);
    if (!pathResult || pathResult.type !== T_STRING) return;

    this.simulEfunObject = this.objects.load(pathResult.value);
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
        m.set('function', mkString(f.function ?? '<unknown>'));
        m.set('program', mkString(f.file ?? '<unknown>'));
        m.set('object', mkString(f.object ?? '<none>'));
        m.set('line', mkInt(f.line ?? 0));
        return { type: T_MAPPING, value: m };
      })
    );

    const errorMap = new Map();
    errorMap.set('error', mkString(tb.message));
    errorMap.set('program', mkString(tb.frames[0]?.file ?? '<unknown>'));
    errorMap.set('object', mkString(tb.frames[0]?.object ?? '<none>'));
    errorMap.set('line', mkInt(tb.frames[0]?.line ?? 0));
    errorMap.set('trace', traceArray);

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
    conn.object = loginObj;
    conn.state = CONN_LOGGED_IN;

    this.currentObject = loginObj;
    this.currentPlayer = loginObj;
    apply('logon', loginObj, []);
    this.currentObject = null;
    this.currentPlayer = null;

    conn.onLine = (line) => this._handleInput(conn, line);
    conn.onClose = () => this._handleDisconnect(conn);

    // GMCP receive handler
    conn.onGmcp = (msg, data) => {
      if (loginObj && !loginObj.isDestructed()) {
        this.currentObject = loginObj;
        this.currentPlayer = loginObj;
        apply('receive_gmcp', loginObj, [mkString(msg), data != null ? mkString(JSON.stringify(data)) : SVALUE_ZERO]);
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

    const piResult = apply('process_input', player, [mkString(line)]);
    if (piResult && piResult.value === 1) {
      this.currentObject = null;
      this.currentPlayer = null;
      return;
    }

    const searchList = this.commands.getSearchList(player);
    const handled = this.commands.dispatch(line, (func, obj, arg) => {
      this.currentObject = obj;
      const result = apply(func, obj, [mkString(arg)]);
      return result && result.value;
    }, searchList);

    if (!handled && this._notifyFailMsg) {
      const nf = this._notifyFailMsg;
      if (nf.type === T_FUNCTION) {
        this.vm._callFunctionPtr(nf.value, []);
      } else {
        conn.send(nf.type === T_STRING ? nf.value : String(nf.value));
      }
    } else if (!handled) {
      conn.send('What?\n');
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
