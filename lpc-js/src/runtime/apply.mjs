import { SVALUE_ZERO } from '../vm/svalue.mjs';

let _machine = null;

export function setMachine(vm) {
  _machine = vm;
}

export function getMachine() {
  return _machine;
}

export function apply(funcName, object, args) {
  if (!object || object.isDestructed()) return SVALUE_ZERO;
  const fn = object.program.findFunction(funcName);
  if (!fn) return SVALUE_ZERO;

  const vm = _machine;
  const savedProgram = vm.currentProgram;
  const savedGlobals = vm.globals;

  vm.currentProgram = object.program;
  vm.globals = object.variables;

  let result;
  try {
    result = vm.callFunction(fn, args);
  } finally {
    object.variables = vm.globals;
    vm.currentProgram = savedProgram;
    vm.globals = savedGlobals;
  }

  return result;
}
