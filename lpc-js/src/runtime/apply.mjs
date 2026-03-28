import { SVALUE_ZERO } from '../vm/svalue.mjs';

let _machine = null;
let _applyHook = null;

export function setMachine(vm) {
  _machine = vm;
}

export function getMachine() {
  return _machine;
}

export function setApplyHook(hook) {
  _applyHook = hook;
}

export function apply(funcName, object, args) {
  if (!object || object.isDestructed()) return SVALUE_ZERO;

  // Check local functions first, then inherited
  const fn = object.program.findFunction(funcName);
  const inherited = fn ? null : object.program.findInheritedFunction(funcName);
  if (!fn && !inherited) return SVALUE_ZERO;

  const vm = _machine;
  const savedProgram = vm.currentProgram;
  const savedGlobals = vm.globals;
  let savedHookState = null;

  if (_applyHook) savedHookState = _applyHook.before(object);

  vm.currentProgram = fn ? object.program : inherited.program;
  vm.globals = object.variables;

  let result;
  try {
    result = vm.callFunction(fn ?? inherited.fn, args);
  } finally {
    object.variables = vm.globals;
    vm.currentProgram = savedProgram;
    vm.globals = savedGlobals;
    if (_applyHook) _applyHook.after(savedHookState);
  }

  return result;
}
