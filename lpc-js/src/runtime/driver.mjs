import { Machine } from '../vm/machine.mjs';
import { EfunRegistry } from './efuns.mjs';
import { ObjectManager } from './object-manager.mjs';
import { CallOutManager } from './callout.mjs';
import { apply, setMachine } from './apply.mjs';
import { mkInt, mkString, SVALUE_ZERO, T_OBJECT } from '../vm/svalue.mjs';

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

    const readFile = options.readFile ?? null;
    this.objects = new ObjectManager({
      readFile,
      includePaths: (config['include directories'] ?? '').split(':').filter(Boolean),
    });

    this.callOuts.onFire = (func, obj, args) => {
      apply(func, obj, args);
    };
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
  }

  mainLoop() {
    this.callOuts.tick();
    this.heartBeatTick();
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
}
