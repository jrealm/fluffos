import { SVALUE_ZERO } from '../vm/svalue.mjs';

let _machine = null;
let _applyHook = null;

// Apply cache: program -> Map<funcName, {fn, program} | null>
const _applyCache = new WeakMap();

export function setMachine(vm) {
  _machine = vm;
}

export function getMachine() {
  return _machine;
}

export function setApplyHook(hook) {
  _applyHook = hook;
}

function lookupFunction(program, funcName) {
  // Check cache first
  let cache = _applyCache.get(program);
  if (!cache) {
    cache = new Map();
    _applyCache.set(program, cache);
  }

  if (cache.has(funcName)) {
    return cache.get(funcName);
  }

  // Check local functions first
  const fn = program.findFunction(funcName);
  if (fn) {
    const result = { fn, program };
    cache.set(funcName, result);
    return result;
  }

  // Check inherited
  const inherited = program.findInheritedFunction(funcName);
  if (inherited) {
    const result = { fn: inherited.fn, program: inherited.program };
    cache.set(funcName, result);
    return result;
  }

  cache.set(funcName, null);
  return null;
}

export function invalidateApplyCache(program) {
  _applyCache.delete(program);
}

export function apply(funcName, object, args) {
  if (!object || object.isDestructed()) return SVALUE_ZERO;

  object.lastAccess = Date.now();

  // Check shadow chain
  if (object.shadowedBy && !object.shadowedBy.isDestructed()) {
    const shadowFn = object.shadowedBy.program.findFunction(funcName);
    if (shadowFn) {
      return apply(funcName, object.shadowedBy, args);
    }
  }

  // Cached function lookup
  const found = lookupFunction(object.program, funcName);
  if (!found) return SVALUE_ZERO;

  const vm = _machine;
  const savedProgram = vm.currentProgram;
  const savedGlobals = vm.globals;
  let savedHookState = null;

  if (_applyHook) savedHookState = _applyHook.before(object);

  vm.currentProgram = found.program;
  vm.globals = object.variables;

  let result;
  try {
    result = vm.callFunction(found.fn, args);
  } finally {
    object.variables = vm.globals;
    vm.currentProgram = savedProgram;
    vm.globals = savedGlobals;
    if (_applyHook) _applyHook.after(savedHookState);
  }

  return result;
}
