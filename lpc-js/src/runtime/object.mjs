import { SVALUE_ZERO } from '../vm/svalue.mjs';

export const O_HEART_BEAT  = 0x01;
export const O_CLONE       = 0x02;
export const O_DESTRUCTED  = 0x04;
export const O_RESET       = 0x08;
export const O_VIRTUAL     = 0x10;

export class LpcObject {
  constructor(filename, program) {
    this.filename = filename;
    this.program = program;
    this.variables = new Array(program.variables.length).fill(SVALUE_ZERO);
    this.flags = 0;
    this.cloneNumber = 0;
    this.environment = null;
    this.inventory = new Set();
    this.interactive = null;
    this.shadowedBy = null;
    this.shadowTarget = null;
    this.commandsEnabled = false;
    this.livingName = null;
    this.uid = '';
    this.euid = '';
    this.replaceProgramPending = null;
    this.heartBeatErrors = 0;
    this.nextReset = 0;
    this.lastAccess = Date.now();
  }

  clone(cloneNumber) {
    const obj = new LpcObject(this.filename, this.program);
    obj.cloneNumber = cloneNumber;
    obj.flags |= O_CLONE;
    obj.uid = this.uid;
    obj.euid = this.euid;
    return obj;
  }

  replaceProgram(newProgram) {
    this.replaceProgramPending = newProgram;
  }

  applyReplaceProgram() {
    if (this.replaceProgramPending) {
      this.program = this.replaceProgramPending;
      this.variables = new Array(this.replaceProgramPending.variables.length).fill(SVALUE_ZERO);
      this.replaceProgramPending = null;
    }
  }

  moveTo(dest) {
    if (this.environment) {
      this.environment.inventory.delete(this);
    }
    this.environment = dest;
    if (dest) {
      dest.inventory.add(this);
    }
  }

  destruct() {
    this.flags |= O_DESTRUCTED;
    if (this.environment) {
      this.environment.inventory.delete(this);
      this.environment = null;
    }
  }

  isDestructed() {
    return (this.flags & O_DESTRUCTED) !== 0;
  }

  get objectId() {
    return this.cloneNumber > 0
      ? `${this.filename}#${this.cloneNumber}`
      : this.filename;
  }
}
