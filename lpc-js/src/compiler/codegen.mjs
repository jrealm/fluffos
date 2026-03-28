import { parse } from './parser.mjs';
import { preprocess } from './preprocessor.mjs';
import { Program } from '../vm/program.mjs';
import { OP } from '../vm/opcodes.mjs';
import * as AST from './ast.mjs';

class Emitter {
  constructor() {
    this.code = [];
    this.strings = [];
    this.functions = [];
    this.variables = [];
    this.inherits = [];
  }

  emit(byte) { this.code.push(byte); }
  emitOp(op) { this.code.push(op); }

  emitShort(value) {
    this.code.push((value >> 8) & 0xFF);
    this.code.push(value & 0xFF);
  }

  patchShort(offset, value) {
    this.code[offset] = (value >> 8) & 0xFF;
    this.code[offset + 1] = value & 0xFF;
  }

  currentOffset() { return this.code.length; }

  addString(s) {
    let idx = this.strings.indexOf(s);
    if (idx === -1) { idx = this.strings.length; this.strings.push(s); }
    return idx;
  }

  toProgram(filename) {
    const prog = new Program(filename);
    prog.bytecode = new Uint8Array(this.code);
    prog.functions = this.functions;
    prog.strings = this.strings;
    prog.variables = this.variables;
    prog.inherits = this.inherits;
    return prog;
  }
}

class CodeGen {
  constructor(ast) {
    this.ast = ast;
    this.emitter = new Emitter();
    this.locals = null;
    this.params = null;
    this.globals = new Map();
    this.functionNames = new Map();
    this.localFunctionNames = new Set();
    this.inheritedFunctions = new Map();
    this.inheritPrograms = [];
    this.pragmas = {};
    this.breakStack = [];
    this.continueStack = [];
  }

  compile() {
    // First pass: register all function names and global variables
    for (const decl of this.ast.body) {
      if (decl.type === 'FunctionDecl') {
        this.localFunctionNames.add(decl.name);
        this.functionNames.set(decl.name, this.functionNames.size);
      } else if (decl.type === 'VarDecl') {
        const idx = this.globals.size;
        this.globals.set(decl.name, idx);
        this.emitter.variables.push({ name: decl.name, type: decl.varType });
      }
    }

    // Second pass: generate code
    for (const decl of this.ast.body) {
      if (decl.type === 'FunctionDecl' && decl.body) {
        this.compileFunction(decl);
      } else if (decl.type === 'FunctionDecl' && !decl.body) {
        this.emitter.functions.push({
          name: decl.name, numArgs: decl.params.length, numLocals: 0,
          offset: -1, flags: 0, type: 0,
        });
      }
    }

    return this.emitter.toProgram('<input>');
  }

  compileFunction(decl) {
    this.params = new Map();
    this.locals = new Map();

    for (let i = 0; i < decl.params.length; i++) {
      this.params.set(decl.params[i].name, i);
    }

    const offset = this.emitter.currentOffset();
    this.scanLocals(decl.body);
    this.genBlock(decl.body);

    // Implicit return
    if (decl.returnType === 'void') {
      this.emitter.emitOp(OP.RETURN_ZERO);
    } else {
      const lastOp = this.emitter.code[this.emitter.currentOffset() - 1];
      if (lastOp !== OP.RETURN && lastOp !== OP.RETURN_ZERO) {
        this.emitter.emitOp(OP.PUSH_0);
        this.emitter.emitOp(OP.RETURN);
      }
    }

    this.emitter.functions.push({
      name: decl.name, numArgs: decl.params.length, numLocals: this.locals.size,
      offset, flags: 0, type: 0,
    });

    this.params = null;
    this.locals = null;
  }

  scanLocals(node) {
    if (!node) return;
    if (node.type === 'Block') {
      for (const s of node.statements) this.scanLocals(s);
    } else if (node.type === 'VarDecl') {
      if (!this.locals.has(node.name)) {
        this.locals.set(node.name, this.params.size + this.locals.size);
      }
    } else if (node.type === 'IfStatement') {
      this.scanLocals(node.consequent);
      this.scanLocals(node.alternate);
    } else if (node.type === 'WhileStatement' || node.type === 'DoWhileStatement') {
      this.scanLocals(node.body);
    } else if (node.type === 'ForStatement') {
      this.scanLocals(node.init);
      this.scanLocals(node.body);
    } else if (node.type === 'SwitchStatement') {
      for (const c of node.cases) {
        for (const s of c.body) this.scanLocals(s);
      }
    }
  }

  resolveVar(name) {
    if (this.params && this.params.has(name)) {
      return { scope: 'local', index: this.params.get(name) };
    }
    if (this.locals && this.locals.has(name)) {
      return { scope: 'local', index: this.locals.get(name) };
    }
    if (this.globals.has(name)) {
      return { scope: 'global', index: this.globals.get(name) };
    }
    return null;
  }

  // ---- Statement generation ----

  genBlock(node) {
    for (const s of node.statements) {
      this.genStatement(s);
    }
  }

  genStatement(node) {
    switch (node.type) {
      case 'Block': this.genBlock(node); break;
      case 'VarDecl': this.genVarDecl(node); break;
      case 'ExpressionStatement':
        this.genExpr(node.expression);
        this.emitter.emitOp(OP.POP);
        break;
      case 'ReturnStatement': this.genReturn(node); break;
      case 'IfStatement': this.genIf(node); break;
      case 'WhileStatement': this.genWhile(node); break;
      case 'DoWhileStatement': this.genDoWhile(node); break;
      case 'ForStatement': this.genFor(node); break;
      case 'SwitchStatement': this.genSwitch(node); break;
      case 'BreakStatement': this.genBreak(); break;
      case 'ContinueStatement': this.genContinue(); break;
      default:
        throw new Error(`Unknown statement type: ${node.type}`);
    }
  }

  genVarDecl(node) {
    if (node.init) {
      this.genExpr(node.init);
    } else {
      this.emitter.emitOp(OP.PUSH_0);
    }
    const v = this.resolveVar(node.name);
    if (v.scope === 'local') {
      this.emitter.emitOp(OP.STORE_LOCAL);
      this.emitter.emit(v.index);
    } else {
      this.emitter.emitOp(OP.STORE_GLOBAL);
      this.emitter.emitShort(v.index);
    }
  }

  genReturn(node) {
    if (node.value) {
      this.genExpr(node.value);
      this.emitter.emitOp(OP.RETURN);
    } else {
      this.emitter.emitOp(OP.RETURN_ZERO);
    }
  }

  genIf(node) {
    this.genExpr(node.condition);
    this.emitter.emitOp(OP.JUMP_IF_ZERO);
    const elseHole = this.emitter.currentOffset();
    this.emitter.emitShort(0);

    this.genStatement(node.consequent);

    if (node.alternate) {
      this.emitter.emitOp(OP.JUMP);
      const endHole = this.emitter.currentOffset();
      this.emitter.emitShort(0);
      this.emitter.patchShort(elseHole, this.emitter.currentOffset());
      this.genStatement(node.alternate);
      this.emitter.patchShort(endHole, this.emitter.currentOffset());
    } else {
      this.emitter.patchShort(elseHole, this.emitter.currentOffset());
    }
  }

  genWhile(node) {
    const loopStart = this.emitter.currentOffset();
    this.breakStack.push([]);
    this.continueStack.push(loopStart);

    this.genExpr(node.condition);
    this.emitter.emitOp(OP.JUMP_IF_ZERO);
    const exitHole = this.emitter.currentOffset();
    this.emitter.emitShort(0);

    this.genStatement(node.body);

    this.emitter.emitOp(OP.JUMP);
    this.emitter.emitShort(loopStart);

    const exitAddr = this.emitter.currentOffset();
    this.emitter.patchShort(exitHole, exitAddr);

    for (const hole of this.breakStack.pop()) {
      this.emitter.patchShort(hole, exitAddr);
    }
    this.continueStack.pop();
  }

  genDoWhile(node) {
    const loopStart = this.emitter.currentOffset();
    this.breakStack.push([]);
    this.continueStack.push(loopStart);

    this.genStatement(node.body);

    this.genExpr(node.condition);
    this.emitter.emitOp(OP.JUMP_IF_NONZERO);
    this.emitter.emitShort(loopStart);

    const exitAddr = this.emitter.currentOffset();
    for (const hole of this.breakStack.pop()) {
      this.emitter.patchShort(hole, exitAddr);
    }
    this.continueStack.pop();
  }

  genFor(node) {
    if (node.init) {
      if (node.init.type === 'VarDecl') {
        this.genVarDecl(node.init);
      } else {
        this.genExpr(node.init);
        this.emitter.emitOp(OP.POP);
      }
    }

    const loopStart = this.emitter.currentOffset();
    this.breakStack.push([]);
    this.continueStack.push(-1); // patched below

    let exitHole = -1;
    if (node.condition) {
      this.genExpr(node.condition);
      this.emitter.emitOp(OP.JUMP_IF_ZERO);
      exitHole = this.emitter.currentOffset();
      this.emitter.emitShort(0);
    }

    this.genStatement(node.body);

    // Continue target is just before the update
    const updateStart = this.emitter.currentOffset();
    this.continueStack[this.continueStack.length - 1] = updateStart;

    if (node.update) {
      this.genExpr(node.update);
      this.emitter.emitOp(OP.POP);
    }

    this.emitter.emitOp(OP.JUMP);
    this.emitter.emitShort(loopStart);

    const exitAddr = this.emitter.currentOffset();
    if (exitHole >= 0) {
      this.emitter.patchShort(exitHole, exitAddr);
    }

    for (const hole of this.breakStack.pop()) {
      this.emitter.patchShort(hole, exitAddr);
    }
    this.continueStack.pop();
  }

  genSwitch(node) {
    this.genExpr(node.discriminant);
    this.breakStack.push([]);

    const caseHoles = [];
    let defaultIdx = -1;

    for (let i = 0; i < node.cases.length; i++) {
      const c = node.cases[i];
      if (c.test) {
        this.emitter.emitOp(OP.DUP);
        this.genExpr(c.test);
        this.emitter.emitOp(OP.EQ);
        this.emitter.emitOp(OP.JUMP_IF_NONZERO);
        caseHoles.push(this.emitter.currentOffset());
        this.emitter.emitShort(0);
      } else {
        defaultIdx = i;
        caseHoles.push(-1);
      }
    }

    this.emitter.emitOp(OP.JUMP);
    const defaultJumpHole = this.emitter.currentOffset();
    this.emitter.emitShort(0);

    const bodyAddrs = [];
    for (let i = 0; i < node.cases.length; i++) {
      bodyAddrs.push(this.emitter.currentOffset());
      for (const s of node.cases[i].body) {
        this.genStatement(s);
      }
    }

    // Patch case jumps
    for (let i = 0; i < caseHoles.length; i++) {
      if (caseHoles[i] >= 0) {
        this.emitter.patchShort(caseHoles[i], bodyAddrs[i]);
      }
    }

    // Patch default jump
    if (defaultIdx >= 0) {
      this.emitter.patchShort(defaultJumpHole, bodyAddrs[defaultIdx]);
    } else {
      this.emitter.patchShort(defaultJumpHole, this.emitter.currentOffset());
    }

    this.emitter.emitOp(OP.POP); // pop discriminant

    const exitAddr = this.emitter.currentOffset();
    for (const hole of this.breakStack.pop()) {
      this.emitter.patchShort(hole, exitAddr);
    }
  }

  genBreak() {
    this.emitter.emitOp(OP.JUMP);
    this.breakStack[this.breakStack.length - 1].push(this.emitter.currentOffset());
    this.emitter.emitShort(0);
  }

  genContinue() {
    this.emitter.emitOp(OP.JUMP);
    const target = this.continueStack[this.continueStack.length - 1];
    this.emitter.emitShort(target >= 0 ? target : 0);
  }

  // ---- Expression generation ----

  genExpr(node) {
    switch (node.type) {
      case 'IntLiteral':
        if (node.value === 0) { this.emitter.emitOp(OP.PUSH_0); }
        else if (node.value === 1) { this.emitter.emitOp(OP.PUSH_1); }
        else {
          this.emitter.emitOp(OP.PUSH_INT);
          this.emitInt32(node.value);
        }
        break;

      case 'FloatLiteral':
        this.emitter.emitOp(OP.PUSH_FLOAT);
        this.emitFloat64(node.value);
        break;

      case 'StringLiteral': {
        const idx = this.emitter.addString(node.value);
        this.emitter.emitOp(OP.PUSH_STRING);
        this.emitter.emitShort(idx);
        break;
      }

      case 'Identifier': {
        const v = this.resolveVar(node.name);
        if (!v) throw new Error(`Undefined variable: ${node.name} at line ${node.line}`);
        if (v.scope === 'local') {
          this.emitter.emitOp(OP.LOAD_LOCAL);
          this.emitter.emit(v.index);
        } else {
          this.emitter.emitOp(OP.LOAD_GLOBAL);
          this.emitter.emitShort(v.index);
        }
        break;
      }

      case 'BinaryExpression':
        this.genExpr(node.left);
        this.genExpr(node.right);
        this.emitBinaryOp(node.operator);
        break;

      case 'UnaryExpression':
        this.genExpr(node.operand);
        if (node.operator === '-') this.emitter.emitOp(OP.NEGATE);
        else if (node.operator === '!') this.emitter.emitOp(OP.NOT);
        else if (node.operator === '~') this.emitter.emitOp(OP.BITNOT);
        break;

      case 'UpdateExpression':
        this.genUpdate(node);
        break;

      case 'AssignExpression':
        this.genAssign(node);
        break;

      case 'TernaryExpression': {
        this.genExpr(node.condition);
        this.emitter.emitOp(OP.JUMP_IF_ZERO);
        const elseHole = this.emitter.currentOffset();
        this.emitter.emitShort(0);
        this.genExpr(node.consequent);
        this.emitter.emitOp(OP.JUMP);
        const endHole = this.emitter.currentOffset();
        this.emitter.emitShort(0);
        this.emitter.patchShort(elseHole, this.emitter.currentOffset());
        this.genExpr(node.alternate);
        this.emitter.patchShort(endHole, this.emitter.currentOffset());
        break;
      }

      case 'CallExpression': {
        for (const arg of node.args) {
          this.genExpr(arg);
        }
        if (this.localFunctionNames.has(node.name)) {
          // Local function — CALL_LOCAL
          const fnIdx = this.functionNames.get(node.name);
          this.emitter.emitOp(OP.CALL_LOCAL);
          this.emitter.emitShort(fnIdx);
          this.emitter.emit(node.args.length);
        } else if (this.inheritedFunctions.has(node.name)) {
          // Inherited function — CALL_INHERITED
          const nameIdx = this.emitter.addString(node.name);
          this.emitter.emitOp(OP.CALL_INHERITED);
          this.emitter.emitShort(nameIdx);
          this.emitter.emit(node.args.length);
        } else {
          // Unknown — assume efun
          const nameIdx = this.emitter.addString(node.name);
          this.emitter.emitOp(OP.CALL_EFUN);
          this.emitter.emitShort(nameIdx);
          this.emitter.emit(node.args.length);
        }
        break;
      }

      case 'ScopeCallExpression': {
        for (const arg of node.args) {
          this.genExpr(arg);
        }
        const nameIdx = this.emitter.addString(node.name);
        this.emitter.emitOp(OP.CALL_INHERITED);
        this.emitter.emitShort(nameIdx);
        this.emitter.emit(node.args.length);
        break;
      }

      case 'CallOther': {
        this.genExpr(node.object);
        const methodIdx = this.emitter.addString(node.method);
        for (const arg of node.args) {
          this.genExpr(arg);
        }
        this.emitter.emitOp(OP.CALL_OTHER);
        this.emitter.emitShort(methodIdx);
        this.emitter.emit(node.args.length);
        break;
      }

      case 'IndexExpression':
        this.genExpr(node.object);
        this.genExpr(node.index);
        this.emitter.emitOp(OP.INDEX);
        break;

      case 'RangeExpression':
        this.genExpr(node.object);
        this.genExpr(node.from);
        this.genExpr(node.to);
        this.emitter.emitOp(OP.RANGE);
        break;

      case 'ArrayLiteral':
        for (const el of node.elements) {
          this.genExpr(el);
        }
        this.emitter.emitOp(OP.MAKE_ARRAY);
        this.emitter.emitShort(node.elements.length);
        break;

      case 'MappingLiteral':
        for (const entry of node.entries) {
          this.genExpr(entry.key);
          this.genExpr(entry.value);
        }
        this.emitter.emitOp(OP.MAKE_MAPPING);
        this.emitter.emitShort(node.entries.length);
        break;

      default:
        throw new Error(`Unknown expression type: ${node.type}`);
    }
  }

  genUpdate(node) {
    const uv = this.resolveVar(node.operand.name);
    if (!uv) throw new Error(`Undefined variable: ${node.operand.name}`);

    const loadOp = uv.scope === 'local' ? OP.LOAD_LOCAL : OP.LOAD_GLOBAL;
    const storeOp = uv.scope === 'local' ? OP.STORE_LOCAL : OP.STORE_GLOBAL;
    const emitIdx = () => {
      if (uv.scope === 'local') this.emitter.emit(uv.index);
      else this.emitter.emitShort(uv.index);
    };

    if (node.prefix) {
      this.emitter.emitOp(loadOp); emitIdx();
      this.emitter.emitOp(OP.PUSH_1);
      this.emitter.emitOp(node.operator === '++' ? OP.ADD : OP.SUB);
      this.emitter.emitOp(OP.DUP);
      this.emitter.emitOp(storeOp); emitIdx();
    } else {
      this.emitter.emitOp(loadOp); emitIdx();
      this.emitter.emitOp(OP.DUP);
      this.emitter.emitOp(OP.PUSH_1);
      this.emitter.emitOp(node.operator === '++' ? OP.ADD : OP.SUB);
      this.emitter.emitOp(storeOp); emitIdx();
    }
  }

  genAssign(node) {
    const av = this.resolveVar(node.left.name);
    if (!av) throw new Error(`Undefined variable: ${node.left.name}`);

    if (node.operator === '=') {
      this.genExpr(node.right);
    } else {
      // Compound: left OP right
      if (av.scope === 'local') {
        this.emitter.emitOp(OP.LOAD_LOCAL); this.emitter.emit(av.index);
      } else {
        this.emitter.emitOp(OP.LOAD_GLOBAL); this.emitter.emitShort(av.index);
      }
      this.genExpr(node.right);
      const opMap = { '+=': OP.ADD, '-=': OP.SUB, '*=': OP.MUL, '/=': OP.DIV, '%=': OP.MOD,
                      '&=': OP.BITAND, '|=': OP.BITOR, '^=': OP.BITXOR,
                      '<<=': OP.LSH, '>>=': OP.RSH };
      this.emitter.emitOp(opMap[node.operator]);
    }

    this.emitter.emitOp(OP.DUP);
    if (av.scope === 'local') {
      this.emitter.emitOp(OP.STORE_LOCAL); this.emitter.emit(av.index);
    } else {
      this.emitter.emitOp(OP.STORE_GLOBAL); this.emitter.emitShort(av.index);
    }
  }

  emitBinaryOp(op) {
    const map = {
      '+': OP.ADD, '-': OP.SUB, '*': OP.MUL, '/': OP.DIV, '%': OP.MOD,
      '==': OP.EQ, '!=': OP.NE, '<': OP.LT, '<=': OP.LE, '>': OP.GT, '>=': OP.GE,
      '&': OP.BITAND, '|': OP.BITOR, '^': OP.BITXOR, '<<': OP.LSH, '>>': OP.RSH,
      '&&': OP.BITAND, '||': OP.BITOR,
    };
    const opcode = map[op];
    if (opcode === undefined) throw new Error(`Unknown binary operator: ${op}`);
    this.emitter.emitOp(opcode);
  }

  emitInt32(value) {
    this.emitter.emit((value >> 24) & 0xFF);
    this.emitter.emit((value >> 16) & 0xFF);
    this.emitter.emit((value >> 8) & 0xFF);
    this.emitter.emit(value & 0xFF);
  }

  emitFloat64(value) {
    const buf = new ArrayBuffer(8);
    new DataView(buf).setFloat64(0, value);
    const bytes = new Uint8Array(buf);
    for (const b of bytes) this.emitter.emit(b);
  }
}

export function compile(source, filename = '<input>') {
  const ppResult = preprocess(source);
  const ast = parse(ppResult.source, filename);
  const gen = new CodeGen(ast);
  gen.pragmas = ppResult.pragmas;
  const prog = gen.compile();
  prog.filename = filename;
  return prog;
}

export function compileWithInherit(filename, files) {
  const cache = new Map();

  function compileFile(fname) {
    if (cache.has(fname)) return cache.get(fname);
    // Try with and without .c extension
    const source = files[fname] ?? files[fname + '.c'] ?? files[fname.replace(/\.c$/, '')];
    if (source === undefined) throw new Error(`File not found: ${fname}`);
    const ast = parse(source, fname);

    // Separate inherits from other declarations
    const inheritPrograms = [];
    const bodyWithoutInherits = [];
    for (const decl of ast.body) {
      if (decl.type === 'InheritDecl') {
        const parentFile = decl.path.endsWith('.c') ? decl.path : decl.path + '.c';
        const parentProg = compileFile(parentFile);
        inheritPrograms.push(parentProg);
      } else {
        bodyWithoutInherits.push(decl);
      }
    }

    const gen = new CodeGen(AST.program(bodyWithoutInherits, ast.line));
    gen.inheritPrograms = inheritPrograms;

    // Register inherited functions and variables before compile
    for (const parent of inheritPrograms) {
      const funcOffset = gen.functionNames.size;
      const varOffset = gen.globals.size;
      for (const fn of parent.functions) {
        if (!gen.inheritedFunctions.has(fn.name)) {
          gen.inheritedFunctions.set(fn.name, { fn, program: parent });
        }
      }
      for (const v of parent.variables) {
        if (!gen.globals.has(v.name)) {
          gen.globals.set(v.name, gen.globals.size);
          gen.emitter.variables.push({ name: v.name, type: v.type });
        }
      }
      gen.emitter.inherits.push({ program: parent, funcOffset, varOffset });
    }

    const prog = gen.compile();
    prog.filename = fname;
    prog.inherits = gen.emitter.inherits;

    cache.set(fname, prog);
    return prog;
  }

  return compileFile(filename);
}
