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
import { apply, setMachine, setApplyHook } from './apply.mjs';
import { mkInt, mkString, mkArray, SVALUE_ZERO, T_OBJECT } from '../vm/svalue.mjs';

export class Driver {
  constructor(config, options = {}) {
    this.config = config;
    this.vm = new Machine();
    this.efuns = new EfunRegistry();
    this.callOuts = new CallOutManager();
    this.heartBeatList = new Set();
    this.currentObject = null;

    this.efuns.loadDefaults();
    this._registerDriverEfuns();

    this.vm.efunHandler = (name, args) => this.efuns.call(name, args);
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
    });

    this.callOuts.onFire = (func, obj, args) => {
      apply(func, obj, args);
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

    const mudlibDir = config['mudlib directory'] ?? '/';
    registerFileEfuns(this.efuns, mudlibDir);
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
      const func = args[0].value;
      const delay = args[1].value;
      const extraArgs = args.slice(2);
      if (driver.currentObject) {
        driver.callOuts.add(func, driver.currentObject, delay, extraArgs);
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
        } else {
          driver.heartBeatList.delete(driver.currentObject);
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
  }

  mainLoop() {
    this.callOuts.tick();
    this.heartBeatTick();
    this._processReplaceProgramQueue();
  }

  _processReplaceProgramQueue() {
    for (const [, obj] of this.objects.objects) {
      if (obj.replaceProgramPending) {
        obj.applyReplaceProgram();
      }
    }
  }

  heartBeatTick() {
    for (const obj of this.heartBeatList) {
      if (!obj.isDestructed()) {
        this.currentObject = obj;
        apply('heart_beat', obj, []);
      }
    }
    this.currentObject = null;
  }

  async startServer(port) {
    this.server = new Server();
    this.server.onConnection = (conn) => this._handleNewConnection(conn);
    await this.server.listen(port);
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
      conn.send(this._notifyFailMsg);
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
