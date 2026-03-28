import { OP } from './opcodes.mjs';
import {
  T_INT, T_STRING, T_FLOAT, T_ARRAY, T_MAPPING, T_FUNCTION, T_CLASS,
  mkInt, mkString, mkFloat, mkArray, mkMapping, mkFunction, mkClass,
  SVALUE_ZERO, SVALUE_ONE, isTruthy
} from './svalue.mjs';

export class RuntimeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RuntimeError';
  }
}

export class Machine {
  constructor() {
    this.stack = [];
    this.callStack = [];
    this.pc = 0;
    this.currentProgram = null;
    this.locals = null;
    this.globals = null;
    this.maxEvalCost = 1_000_000;
    this.evalCost = 0;
    this.efunHandler = null;
    this.callOtherHandler = null;
    this._catchStack = [];
    this._foreachStack = [];
  }

  execute(program, functionName, args = []) {
    this.currentProgram = program;
    this.globals = new Array(program.variables.length).fill(SVALUE_ZERO);

    const fn = program.findFunction(functionName);
    if (!fn) throw new Error(`Function '${functionName}' not found in ${program.filename}`);

    return this.callFunction(fn, args);
  }

  callFunction(fn, args) {
    this.callStack.push({
      pc: this.pc,
      locals: this.locals,
      program: this.currentProgram,
    });

    const localCount = fn.numArgs + fn.numLocals;
    this.locals = new Array(localCount).fill(SVALUE_ZERO);
    for (let i = 0; i < args.length && i < fn.numArgs; i++) {
      this.locals[i] = args[i];
    }

    this.pc = fn.offset;
    const result = this.run();

    const frame = this.callStack.pop();
    this.pc = frame.pc;
    this.locals = frame.locals;

    return result;
  }

  run() {
    const bc = this.currentProgram.bytecode;
    const catchBase = this._catchStack.length;

    while (this.pc < bc.length) {
      if (++this.evalCost > this.maxEvalCost) {
        throw new RuntimeError('Too long evaluation. Execution aborted.');
      }

      const op = bc[this.pc++];

      try { switch (op) {
        case OP.PUSH_0:
          this.stack.push(SVALUE_ZERO);
          break;

        case OP.PUSH_1:
          this.stack.push(SVALUE_ONE);
          break;

        case OP.PUSH_INT: {
          const val = this.readInt32();
          this.stack.push(mkInt(val));
          break;
        }

        case OP.PUSH_FLOAT: {
          const val = this.readFloat64();
          this.stack.push(mkFloat(val));
          break;
        }

        case OP.PUSH_STRING: {
          const idx = this.readShort();
          this.stack.push(mkString(this.currentProgram.strings[idx]));
          break;
        }

        case OP.LOAD_LOCAL: {
          const idx = bc[this.pc++];
          this.stack.push(this.locals[idx]);
          break;
        }

        case OP.STORE_LOCAL: {
          const idx = bc[this.pc++];
          this.locals[idx] = this.stack.pop();
          break;
        }

        case OP.LOAD_GLOBAL: {
          const idx = this.readShort();
          this.stack.push(this.globals[idx]);
          break;
        }

        case OP.STORE_GLOBAL: {
          const idx = this.readShort();
          this.globals[idx] = this.stack.pop();
          break;
        }

        case OP.ADD: {
          const b = this.stack.pop();
          const a = this.stack.pop();
          if (a.type === T_STRING || b.type === T_STRING) {
            const as = a.type === T_STRING ? a.value : String(a.value);
            const bs = b.type === T_STRING ? b.value : String(b.value);
            this.stack.push(mkString(as + bs));
          } else if (a.type === T_FLOAT || b.type === T_FLOAT) {
            this.stack.push(mkFloat(a.value + b.value));
          } else if (a.type === T_ARRAY && b.type === T_ARRAY) {
            this.stack.push(mkArray([...a.value, ...b.value]));
          } else {
            this.stack.push(mkInt(a.value + b.value));
          }
          break;
        }

        case OP.SUB: {
          const b = this.stack.pop();
          const a = this.stack.pop();
          if (a.type === T_FLOAT || b.type === T_FLOAT) {
            this.stack.push(mkFloat(a.value - b.value));
          } else {
            this.stack.push(mkInt(a.value - b.value));
          }
          break;
        }

        case OP.MUL: {
          const b = this.stack.pop();
          const a = this.stack.pop();
          if (a.type === T_FLOAT || b.type === T_FLOAT) {
            this.stack.push(mkFloat(a.value * b.value));
          } else {
            this.stack.push(mkInt(a.value * b.value));
          }
          break;
        }

        case OP.DIV: {
          const b = this.stack.pop();
          const a = this.stack.pop();
          if (b.value === 0) throw new RuntimeError('Division by zero');
          if (a.type === T_FLOAT || b.type === T_FLOAT) {
            this.stack.push(mkFloat(a.value / b.value));
          } else {
            this.stack.push(mkInt(Math.trunc(a.value / b.value)));
          }
          break;
        }

        case OP.MOD: {
          const b = this.stack.pop();
          const a = this.stack.pop();
          if (b.value === 0) throw new RuntimeError('Modulo by zero');
          this.stack.push(mkInt(a.value % b.value));
          break;
        }

        case OP.NEGATE: {
          const a = this.stack.pop();
          if (a.type === T_FLOAT) this.stack.push(mkFloat(-a.value));
          else this.stack.push(mkInt(-a.value));
          break;
        }

        case OP.EQ: {
          const b = this.stack.pop();
          const a = this.stack.pop();
          this.stack.push(a.value === b.value ? SVALUE_ONE : SVALUE_ZERO);
          break;
        }

        case OP.NE: {
          const b = this.stack.pop();
          const a = this.stack.pop();
          this.stack.push(a.value !== b.value ? SVALUE_ONE : SVALUE_ZERO);
          break;
        }

        case OP.LT: {
          const b = this.stack.pop();
          const a = this.stack.pop();
          this.stack.push(a.value < b.value ? SVALUE_ONE : SVALUE_ZERO);
          break;
        }

        case OP.LE: {
          const b = this.stack.pop();
          const a = this.stack.pop();
          this.stack.push(a.value <= b.value ? SVALUE_ONE : SVALUE_ZERO);
          break;
        }

        case OP.GT: {
          const b = this.stack.pop();
          const a = this.stack.pop();
          this.stack.push(a.value > b.value ? SVALUE_ONE : SVALUE_ZERO);
          break;
        }

        case OP.GE: {
          const b = this.stack.pop();
          const a = this.stack.pop();
          this.stack.push(a.value >= b.value ? SVALUE_ONE : SVALUE_ZERO);
          break;
        }

        case OP.BITAND: { const b = this.stack.pop(); const a = this.stack.pop(); this.stack.push(mkInt(a.value & b.value)); break; }
        case OP.BITOR:  { const b = this.stack.pop(); const a = this.stack.pop(); this.stack.push(mkInt(a.value | b.value)); break; }
        case OP.BITXOR: { const b = this.stack.pop(); const a = this.stack.pop(); this.stack.push(mkInt(a.value ^ b.value)); break; }
        case OP.LSH:    { const b = this.stack.pop(); const a = this.stack.pop(); this.stack.push(mkInt(a.value << b.value)); break; }
        case OP.RSH:    { const b = this.stack.pop(); const a = this.stack.pop(); this.stack.push(mkInt(a.value >> b.value)); break; }
        case OP.BITNOT: { const a = this.stack.pop(); this.stack.push(mkInt(~a.value)); break; }

        case OP.NOT: {
          const a = this.stack.pop();
          this.stack.push(isTruthy(a) ? SVALUE_ZERO : SVALUE_ONE);
          break;
        }

        case OP.JUMP: {
          this.pc = this.readShort();
          break;
        }

        case OP.JUMP_IF_ZERO: {
          const target = this.readShort();
          const val = this.stack.pop();
          if (!isTruthy(val)) this.pc = target;
          break;
        }

        case OP.JUMP_IF_NONZERO: {
          const target = this.readShort();
          const val = this.stack.pop();
          if (isTruthy(val)) this.pc = target;
          break;
        }

        case OP.CALL_LOCAL: {
          const fnIdx = this.readShort();
          const argCount = bc[this.pc++];
          const args = [];
          for (let i = 0; i < argCount; i++) {
            args.unshift(this.stack.pop());
          }
          const fn = this.currentProgram.functions[fnIdx];
          const result = this.callFunction(fn, args);
          this.stack.push(result);
          break;
        }

        case OP.CALL_EFUN: {
          const nameIdx = this.readShort();
          const argCount = bc[this.pc++];
          const args = [];
          for (let i = 0; i < argCount; i++) {
            args.unshift(this.stack.pop());
          }
          const name = this.currentProgram.strings[nameIdx];
          if (this.efunHandler) {
            const result = this.efunHandler(name, args);
            this.stack.push(result);
          } else {
            throw new Error(`Unknown efun: ${name}`);
          }
          break;
        }

        case OP.CALL_OTHER: {
          const methodIdx = this.readShort();
          const argCount = bc[this.pc++];
          const args = [];
          for (let i = 0; i < argCount; i++) {
            args.unshift(this.stack.pop());
          }
          const obj = this.stack.pop();
          const method = this.currentProgram.strings[methodIdx];
          if (this.callOtherHandler) {
            const result = this.callOtherHandler(obj, method, args);
            this.stack.push(result);
          } else {
            throw new Error(`call_other not available: ${method}`);
          }
          break;
        }

        case OP.CALL_INHERITED: {
          const nameIdx = this.readShort();
          const argCount = bc[this.pc++];
          const args = [];
          for (let i = 0; i < argCount; i++) {
            args.unshift(this.stack.pop());
          }
          const name = this.currentProgram.strings[nameIdx];
          const found = this.currentProgram.findInheritedFunction(name);
          if (found) {
            const savedProgram = this.currentProgram;
            const savedGlobals = this.globals;
            this.currentProgram = found.program;
            // Share globals — inherited functions access the same global variable space
            const result = this.callFunction(found.fn, args);
            this.currentProgram = savedProgram;
            this.globals = savedGlobals;
            this.stack.push(result);
          } else {
            throw new Error(`Inherited function not found: ${name}`);
          }
          break;
        }

        case OP.RETURN:
          return this.stack.pop();

        case OP.RETURN_ZERO:
          return SVALUE_ZERO;

        case OP.POP:
          this.stack.pop();
          break;

        case OP.DUP:
          this.stack.push(this.stack[this.stack.length - 1]);
          break;

        case OP.MAKE_ARRAY: {
          const count = this.readShort();
          const elements = [];
          for (let i = 0; i < count; i++) {
            elements.unshift(this.stack.pop());
          }
          this.stack.push(mkArray(elements));
          break;
        }

        case OP.MAKE_MAPPING: {
          const count = this.readShort();
          const pairs = [];
          for (let i = 0; i < count; i++) {
            const value = this.stack.pop();
            const key = this.stack.pop();
            pairs.unshift({ key, value });
          }
          const map = new Map();
          for (const { key, value } of pairs) {
            map.set(key.value, value);
          }
          this.stack.push(mkMapping(map));
          break;
        }

        case OP.INDEX: {
          const index = this.stack.pop();
          const obj = this.stack.pop();
          if (obj.type === T_ARRAY) {
            const idx = index.value;
            if (idx < 0 || idx >= obj.value.length) {
              throw new RuntimeError(`Array index out of bounds: ${idx}`);
            }
            this.stack.push(obj.value[idx]);
          } else if (obj.type === T_MAPPING) {
            const result = obj.value.get(index.value);
            this.stack.push(result ?? SVALUE_ZERO);
          } else if (obj.type === T_STRING) {
            this.stack.push(mkInt(obj.value.charCodeAt(index.value)));
          } else {
            throw new RuntimeError(`Cannot index type ${obj.type}`);
          }
          break;
        }

        case OP.RINDEX: {
          const index = this.stack.pop();
          const obj = this.stack.pop();
          if (obj.type === T_ARRAY) {
            this.stack.push(obj.value[obj.value.length - index.value]);
          } else if (obj.type === T_STRING) {
            this.stack.push(mkInt(obj.value.charCodeAt(obj.value.length - index.value)));
          } else {
            throw new RuntimeError(`Cannot reverse-index type ${obj.type}`);
          }
          break;
        }

        case OP.RANGE: {
          const flags = bc[this.pc++];
          const to = this.stack.pop();
          const from = this.stack.pop();
          const obj = this.stack.pop();
          const len = obj.type === T_ARRAY ? obj.value.length : obj.value.length;
          const fromIdx = (flags & 1) ? len - from.value : from.value;
          const toIdx = (flags & 2) ? len - to.value : to.value;
          if (obj.type === T_ARRAY) {
            this.stack.push(mkArray(obj.value.slice(fromIdx, toIdx + 1)));
          } else if (obj.type === T_STRING) {
            this.stack.push(mkString(obj.value.slice(fromIdx, toIdx + 1)));
          } else {
            throw new RuntimeError(`Cannot range type ${obj.type}`);
          }
          break;
        }

        case OP.CATCH: {
          const endOffset = this.readShort();
          this._catchStack.push({
            endOffset,
            savedSp: this.stack.length,
            savedCallSp: this.callStack.length,
          });
          break;
        }

        case OP.END_CATCH: {
          this._catchStack.pop();
          break;
        }

        case OP.THROW: {
          const value = this.stack.pop();
          const msg = value.type === T_STRING ? value.value : String(value.value);
          throw new RuntimeError(msg);
        }

        case OP.MAKE_FUNCTION: {
          const nameIdx = this.readShort();
          const partialCount = bc[this.pc++];
          const partialArgs = [];
          for (let i = 0; i < partialCount; i++) {
            partialArgs.unshift(this.stack.pop());
          }
          const name = this.currentProgram.strings[nameIdx];
          this.stack.push(mkFunction({ kind: 'named', name, partialArgs, program: this.currentProgram }));
          break;
        }

        case OP.MAKE_CLOSURE: {
          const fnIdx = this.readShort();
          this.stack.push(mkFunction({ kind: 'closure', fnIdx, program: this.currentProgram }));
          break;
        }

        case OP.CALL_FUNCTION_PTR: {
          const argCount = bc[this.pc++];
          const args = [];
          for (let i = 0; i < argCount; i++) {
            args.unshift(this.stack.pop());
          }
          const fp = this.stack.pop();
          if (fp.type !== T_FUNCTION) throw new RuntimeError('Not a function pointer');
          const result = this._callFunctionPtr(fp.value, args);
          this.stack.push(result);
          break;
        }

        case OP.CLASS_NEW: {
          const nameIdx = this.readShort();
          this.stack.push(mkClass(new Map()));
          break;
        }

        case OP.CLASS_GET: {
          const memberIdx = this.readShort();
          const memberName = this.currentProgram.strings[memberIdx];
          const obj = this.stack.pop();
          if (obj.type === T_CLASS) {
            this.stack.push(obj.value.get(memberName) ?? SVALUE_ZERO);
          } else {
            throw new RuntimeError(`Cannot access member '${memberName}' on non-class`);
          }
          break;
        }

        case OP.CLASS_SET: {
          const memberIdx = this.readShort();
          const memberName = this.currentProgram.strings[memberIdx];
          const value = this.stack.pop();
          const classObj = this.stack.pop();
          if (classObj.type === T_CLASS) {
            classObj.value.set(memberName, value);
          }
          this.stack.push(value); // assignment result
          break;
        }

        case OP.FOREACH_INIT: {
          const collection = this.stack.pop();
          if (collection.type === T_ARRAY) {
            this._foreachStack.push({ type: 'array', items: collection.value, index: 0 });
          } else {
            throw new RuntimeError('foreach requires array');
          }
          break;
        }

        case OP.FOREACH_NEXT: {
          const exitOffset = this.readShort();
          const scope = bc[this.pc++];
          const varIdx = bc[this.pc++];
          const state = this._foreachStack[this._foreachStack.length - 1];
          if (state.index >= state.items.length) {
            this.pc = exitOffset;
          } else {
            const val = state.items[state.index++];
            if (scope === 0) this.locals[varIdx] = val;
            else this.globals[varIdx] = val;
          }
          break;
        }

        case OP.FOREACH_INIT_MAP: {
          const collection = this.stack.pop();
          if (collection.type === T_MAPPING) {
            this._foreachStack.push({ type: 'mapping', entries: [...collection.value.entries()], index: 0 });
          } else {
            throw new RuntimeError('foreach mapping requires mapping');
          }
          break;
        }

        case OP.FOREACH_NEXT_MAP: {
          const exitOffset = this.readShort();
          const keyIdx = bc[this.pc++];
          const valIdx = bc[this.pc++];
          const state = this._foreachStack[this._foreachStack.length - 1];
          if (state.index >= state.entries.length) {
            this.pc = exitOffset;
          } else {
            const [key, val] = state.entries[state.index++];
            this.locals[keyIdx] = mkString(String(key));
            this.locals[valIdx] = val;
          }
          break;
        }

        case OP.FOREACH_END: {
          this._foreachStack.pop();
          break;
        }

        default:
          throw new RuntimeError(`Unknown opcode: 0x${op.toString(16)} at pc=${this.pc - 1}`);
      } } catch (e) {
        if (this._catchStack.length > catchBase) {
          const handler = this._catchStack.pop();
          this.stack.length = handler.savedSp;
          this.callStack.length = handler.savedCallSp;
          this.pc = handler.endOffset;
          const msg = e instanceof RuntimeError ? e.message : e.message;
          this.stack.push(mkString(msg));
        } else {
          throw e;
        }
      }
    }

    return SVALUE_ZERO;
  }

  _callFunctionPtr(fp, args) {
    if (fp.kind === 'named') {
      const allArgs = [...fp.partialArgs, ...args];
      const fn = fp.program.findFunction(fp.name);
      if (fn) {
        const savedProgram = this.currentProgram;
        this.currentProgram = fp.program;
        const result = this.callFunction(fn, allArgs);
        this.currentProgram = savedProgram;
        return result;
      }
      const inherited = fp.program.findInheritedFunction(fp.name);
      if (inherited) {
        const savedProgram = this.currentProgram;
        this.currentProgram = inherited.program;
        const result = this.callFunction(inherited.fn, allArgs);
        this.currentProgram = savedProgram;
        return result;
      }
      throw new RuntimeError(`Function not found: ${fp.name}`);
    } else if (fp.kind === 'closure') {
      const fn = fp.program.functions[fp.fnIdx];
      const savedProgram = this.currentProgram;
      this.currentProgram = fp.program;
      const result = this.callFunction(fn, args);
      this.currentProgram = savedProgram;
      return result;
    }
    throw new RuntimeError('Invalid function pointer');
  }

  readShort() {
    const bc = this.currentProgram.bytecode;
    const val = (bc[this.pc] << 8) | bc[this.pc + 1];
    this.pc += 2;
    return val;
  }

  readInt32() {
    const bc = this.currentProgram.bytecode;
    const val = (bc[this.pc] << 24) | (bc[this.pc + 1] << 16) | (bc[this.pc + 2] << 8) | bc[this.pc + 3];
    this.pc += 4;
    return val;
  }

  readFloat64() {
    const bc = this.currentProgram.bytecode;
    const buf = new ArrayBuffer(8);
    const view = new Uint8Array(buf);
    for (let i = 0; i < 8; i++) view[i] = bc[this.pc + i];
    this.pc += 8;
    return new DataView(buf).getFloat64(0);
  }
}
