import { OP, opName } from './opcodes.mjs';
import {
  T_INT, T_STRING, T_FLOAT, T_ARRAY, T_MAPPING, T_FUNCTION, T_CLASS, T_BUFFER,
  mkInt, mkString, mkFloat, mkArray, mkMapping, mkFunction, mkClass,
  SVALUE_ZERO, SVALUE_ONE, isTruthy, mappingKey
} from './svalue.mjs';

// LPC value equality: arrays/mappings compare by content, not reference
function svalueEqual(a, b) {
  if (a.type !== b.type) return false;
  if (a.type === T_ARRAY) {
    if (a.value === b.value) return true;
    if (a.value.length !== b.value.length) return false;
    for (let i = 0; i < a.value.length; i++) {
      if (!svalueEqual(a.value[i], b.value[i])) return false;
    }
    return true;
  }
  if (a.type === T_MAPPING) {
    if (a.value === b.value) return true;
    if (a.value.size !== b.value.size) return false;
    for (const [k, v] of a.value) {
      if (!b.value.has(k)) return false;
      if (!svalueEqual(v.value, b.value.get(k).value)) return false;
    }
    return true;
  }
  return a.value === b.value;
}

export class RuntimeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RuntimeError';
  }
}

class SafeStack extends Array {
  pop() {
    const val = super.pop();
    return val !== undefined ? val : SVALUE_ZERO;
  }
}

export class Machine {
  constructor() {
    this.stack = new SafeStack();
    this.callStack = [];
    this.pc = 0;
    this.currentProgram = null;
    this.locals = null;
    this.globals = null;
    this.maxEvalCost = 1_000_000;
    this.evalCost = 0;
    this.efunHandler = null;
    this.callOtherHandler = null;
    this.simulEfunHandler = null;
    this._catchStack = [];
    this._foreachStack = [];
    this._currentFunctionName = null;
    this._currentObject = null;
    this._globalOffset = 0;
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
      functionName: this._currentFunctionName,
      fileName: this.currentProgram?.filename ?? '<unknown>',
      object: this._currentObject,
      globalOffset: this._globalOffset,
    });

    this._currentFunctionName = fn.name;

    const localCount = fn.numArgs + fn.numLocals;
    // Each local gets its own mutable svalue (not the frozen SVALUE_ZERO)
    this.locals = Array.from({ length: localCount }, () => ({ type: 0, value: 0 }));
    for (let i = 0; i < args.length && i < fn.numArgs; i++) {
      this.locals[i] = args[i] ?? { type: 0, value: 0 };
    }

    this.pc = fn.offset;
    const savedCallSp = this.callStack.length; // our frame is at savedCallSp - 1
    let result;
    try {
      result = this.run();
    } finally {
      // Ensure our frame still exists (LPC catch may have truncated the stack)
      if (this.callStack.length >= savedCallSp) {
        const frame = this.callStack[savedCallSp - 1];
        this.callStack.length = savedCallSp - 1;
        this.pc = frame.pc;
        this.locals = frame.locals;
        this._currentFunctionName = frame.functionName;
      }
    }

    return result;
  }

  collectTraceback(errorMessage) {
    const frames = [];
    if (this.currentProgram) {
      frames.push({
        function: this._currentFunctionName ?? '<unknown>',
        file: this.currentProgram.filename ?? '<unknown>',
        line: this.currentProgram.getLine ? this.currentProgram.getLine(this.pc) : 0,
        object: this._currentObject?.filename ?? '<none>',
      });
    }
    for (let i = this.callStack.length - 1; i >= 0; i--) {
      const frame = this.callStack[i];
      frames.push({
        function: frame.functionName ?? '<unknown>',
        file: frame.fileName ?? '<unknown>',
        line: frame.program?.getLine ? frame.program.getLine(frame.pc) : 0,
        object: frame.object?.filename ?? '<none>',
      });
    }
    return { message: errorMessage, frames };
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
        case 0x00:
          // Invalid opcode 0 — function ran past its end, treat as implicit return
          return this.stack.length > 0 ? (this.stack.pop() ?? SVALUE_ZERO) : SVALUE_ZERO;

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
          this.stack.push(this.locals[idx] ?? SVALUE_ZERO);
          break;
        }

        case OP.STORE_LOCAL: {
          const idx = bc[this.pc++];
          this.locals[idx] = this.stack.pop();
          break;
        }

        case OP.LOAD_GLOBAL: {
          const idx = this.readShort() + this._globalOffset;
          this.stack.push(this.globals[idx] ?? SVALUE_ZERO);
          break;
        }

        case OP.STORE_GLOBAL: {
          const idx = this.readShort() + this._globalOffset;
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
          if (a.type === T_ARRAY && b.type === T_ARRAY) {
            // Array set difference
            const bSet = new Set(b.value.map(sv => `${sv.type}:${sv.value}`));
            this.stack.push(mkArray(a.value.filter(sv => !bSet.has(`${sv.type}:${sv.value}`))));
          } else if (a.type === T_FLOAT || b.type === T_FLOAT) {
            this.stack.push(mkFloat(a.value - b.value));
          } else {
            this.stack.push(mkInt((a.value ?? 0) - (b.value ?? 0)));
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
          this.stack.push(svalueEqual(a, b) ? SVALUE_ONE : SVALUE_ZERO);
          break;
        }

        case OP.NE: {
          const b = this.stack.pop();
          const a = this.stack.pop();
          this.stack.push(!svalueEqual(a, b) ? SVALUE_ONE : SVALUE_ZERO);
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

        case OP.BITAND: {
          const b = this.stack.pop(); const a = this.stack.pop();
          if (a.type === T_ARRAY && b.type === T_ARRAY) {
            // Array intersection
            const bSet = new Set(b.value.map(sv => `${sv.type}:${sv.value}`));
            const result = a.value.filter(sv => bSet.has(`${sv.type}:${sv.value}`));
            this.stack.push(mkArray(result));
          } else {
            this.stack.push(mkInt((a.value ?? 0) & (b.value ?? 0)));
          }
          break;
        }
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
          this.stack.push(result ?? SVALUE_ZERO);
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
            this.stack.push(result ?? SVALUE_ZERO);
          } else {
            throw new Error(`Unknown efun: ${name}`);
          }
          break;
        }

        case OP.CALL_SIMUL: {
          const nameIdx2 = this.readShort();
          const argCount2 = bc[this.pc++];
          const args2 = [];
          for (let i = 0; i < argCount2; i++) {
            args2.unshift(this.stack.pop());
          }
          const name2 = this.currentProgram.strings[nameIdx2];
          if (this.simulEfunHandler) {
            const result = this.simulEfunHandler(name2, args2);
            this.stack.push(result ?? SVALUE_ZERO);
          } else {
            throw new Error(`No simul_efun handler for: ${name2}`);
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
            this.stack.push(result ?? SVALUE_ZERO);
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
          let found = this.currentProgram.findInheritedFunction(name);
          // If not found in current program, search the object's full program
          if (!found && this._currentObject?.program && this._currentObject.program !== this.currentProgram) {
            found = this._currentObject.program.findInheritedFunction(name);
          }
          // Last resort: search up the call stack
          if (!found) {
            for (let fi = this.callStack.length - 1; fi >= 0 && !found; fi--) {
              const frame = this.callStack[fi];
              if (frame.program) {
                found = frame.program.findFunction(name) ? { fn: frame.program.findFunction(name), program: frame.program } : frame.program.findInheritedFunction(name);
              }
            }
          }
          if (found) {
            const savedProgram = this.currentProgram;
            const savedGlobals = this.globals;
            this.currentProgram = found.program;
            // Inherited functions share the container's globals.
            // Adjust global offset so LOAD_GLOBAL/STORE_GLOBAL in the inherited
            // function's bytecode maps to the correct position in the merged globals.
            const savedOffset = this._globalOffset;
            this._globalOffset = (found.varOffset ?? 0);
            const result = this.callFunction(found.fn, args);
            this._globalOffset = savedOffset;
            this.currentProgram = savedProgram;
            this.globals = savedGlobals;
            this.stack.push(result ?? SVALUE_ZERO);
          } else {
            // Last resort: try as efun
            if (this.efunHandler) {
              const result = this.efunHandler(name, args);
              this.stack.push(result ?? SVALUE_ZERO);
            } else {
              throw new Error(`Inherited function not found: ${name}`);
            }
          }
          break;
        }

        case OP.RETURN:
          return this.stack.pop() ?? SVALUE_ZERO;

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
            map.set(mappingKey(key), { key, value });
          }
          this.stack.push(mkMapping(map));
          break;
        }

        case OP.INDEX: {
          const index = this.stack.pop();
          const obj = this.stack.pop();
          if (obj.type === T_ARRAY) {
            let idx = index.value;
            // Support negative indexing (LPC: arr[-1] = last element)
            if (idx < 0) idx = obj.value.length + idx;
            if (idx < 0 || idx >= obj.value.length) {
              this.stack.push(SVALUE_ZERO);
            } else {
              this.stack.push(obj.value[idx]);
            }
          } else if (obj.type === T_MAPPING) {
            const entry = obj.value.get(mappingKey(index));
            this.stack.push(entry ? entry.value : SVALUE_ZERO);
          } else if (obj.type === T_STRING) {
            this.stack.push(mkInt(obj.value.charCodeAt(index.value)));
          } else if (obj.type === T_BUFFER) {
            this.stack.push(mkInt(obj.value[index.value]));
          } else if (obj.type === T_INT) {
            // Indexing int (uninitialized mapping/array) returns 0
            this.stack.push(SVALUE_ZERO);
          } else {
            throw new RuntimeError(`Cannot index type ${obj.type}`);
          }
          break;
        }

        case OP.STORE_INDEX: {
          const value = this.stack.pop();
          const index = this.stack.pop();
          const obj = this.stack.pop();
          if (obj.type === T_ARRAY) {
            let idx = index.value;
            if (idx < 0) idx = obj.value.length + idx;
            if (idx >= 0 && idx < obj.value.length) {
              obj.value[idx] = value;
            } else if (idx >= obj.value.length) {
              // Auto-extend array
              while (obj.value.length <= idx) obj.value.push(SVALUE_ZERO);
              obj.value[idx] = value;
            }
          } else if (obj.type === T_MAPPING) {
            obj.value.set(mappingKey(index), { key: index, value });
          } else if (obj.type === T_STRING) {
            // LPC string character assignment: str[i] = int_char_code
            let idx = index.value;
            if (idx < 0) idx = obj.value.length + idx;
            if (idx >= 0 && idx < obj.value.length) {
              const ch = typeof value.value === 'number' ? String.fromCharCode(value.value) : String(value.value);
              obj.value = obj.value.slice(0, idx) + ch + obj.value.slice(idx + 1);
            }
          } else if (obj.type === T_BUFFER) {
            obj.value[index.value] = value.value & 0xFF;
          } else if (obj.type === T_INT) {
            // Assigning to index of int (uninitialized/0) — silently ignore in LPC
          } else {
            throw new RuntimeError(`Cannot assign to index of type ${obj.type}`);
          }
          this.stack.push(value);
          break;
        }

        case OP.RINDEX: {
          const index = this.stack.pop();
          const obj = this.stack.pop();
          if (obj.type === T_ARRAY) {
            this.stack.push(obj.value[obj.value.length - index.value]);
          } else if (obj.type === T_STRING) {
            this.stack.push(mkInt(obj.value.charCodeAt(obj.value.length - index.value)));
          } else if (obj.type === T_BUFFER) {
            this.stack.push(mkInt(obj.value[obj.value.length - index.value]));
          } else {
            this.stack.push(SVALUE_ZERO); // LPC: reverse-index on non-indexable returns 0
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
          } else if (obj.type === T_BUFFER) {
            this.stack.push({ type: T_BUFFER, value: obj.value.subarray(fromIdx, toIdx + 1) });
          } else {
            this.stack.push(SVALUE_ZERO); // LPC: range on non-indexable returns 0
          }
          break;
        }

        case OP.CATCH: {
          const endOffset = this.readShort();
          this._catchStack.push({
            endOffset,
            savedSp: this.stack.length,
            savedCallSp: this.callStack.length,
            savedProgram: this.currentProgram,
            savedLocals: this.locals,
            savedFunctionName: this._currentFunctionName,
            savedForeachDepth: this._foreachStack.length,
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
          this.stack.push(mkFunction({ kind: 'named', name, partialArgs, program: this.currentProgram, varOffset: this._globalOffset }));
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
          this.stack.push(result ?? SVALUE_ZERO);
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
            // Non-array (e.g., 0/null) — push empty iteration
            this._foreachStack.push({ type: 'array', items: [], index: 0 });
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
            const val = state.items[state.index++] ?? SVALUE_ZERO;
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
            const [, entry] = state.entries[state.index++];
            this.locals[keyIdx] = entry.key;
            this.locals[valIdx] = entry.value;
          }
          break;
        }

        case OP.FOREACH_END: {
          this._foreachStack.pop();
          break;
        }

        default:
          if (op === undefined) {
            throw new RuntimeError(`PC out of bounds at pc=${this.pc - 1}, bytecode length=${bc.length}, function=${this._currentFunctionName}`);
          }
          throw new RuntimeError(`Unknown opcode: 0x${op.toString(16)} at pc=${this.pc - 1}`);
      } } catch (e) {
        // Convert JS TypeErrors to RuntimeErrors for better LPC error handling
        if (!(e instanceof RuntimeError)) {
          const savedPc = this.pc;
          // Find the actual opcode that was executing (pc was already advanced)
          let opByte = 0;
          for (let scan = savedPc - 1; scan >= 0; scan--) {
            if (opName(bc[scan]) !== `UNKNOWN(${bc[scan]})`) { opByte = bc[scan]; break; }
            if (savedPc - scan > 5) break;
          }
          const opStr = opName(opByte);
          console.error(`[VM TypeError] ${e.message} fn=${this._currentFunctionName} file=${this.currentProgram?.filename} pc=${savedPc} op=${opStr}(0x${opByte.toString(16)}) stack=[${this.stack.slice(-3).map(s => s ? `t${s.type}` : 'undef').join(',')}] bcLen=${bc.length}`);
          if (e.stack) console.error('  ' + e.stack.split('\n').slice(1, 4).join('\n  '));
        }
        const runtimeErr = e instanceof RuntimeError ? e : new RuntimeError(e.message ?? String(e));
        if (this._catchStack.length > catchBase) {
          const handler = this._catchStack.pop();
          this.stack.length = handler.savedSp;
          this.callStack.length = handler.savedCallSp;
          this.currentProgram = handler.savedProgram;
          this.locals = handler.savedLocals;
          this._currentFunctionName = handler.savedFunctionName;
          this._foreachStack.length = handler.savedForeachDepth;
          this.pc = handler.endOffset;
          this.stack.push(mkString(runtimeErr.message));
        } else {
          throw runtimeErr;
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
        const savedOffset = this._globalOffset;
        this.currentProgram = fp.program;
        // Set correct globalOffset for the function pointer's program
        this._globalOffset = fp.varOffset ?? this._globalOffset;
        const result = this.callFunction(fn, allArgs);
        this._globalOffset = savedOffset;
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
      // Fall back to efun/simul_efun for function pointers like (: call_other :)
      if (this.efunHandler) {
        try { return this.efunHandler(fp.name, allArgs); } catch {}
      }
      if (this.simulEfunHandler) {
        try { return this.simulEfunHandler(fp.name, allArgs); } catch {}
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
