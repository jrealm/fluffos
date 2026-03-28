export class Program {
  constructor(filename) {
    this.filename = filename;
    this.bytecode = new Uint8Array(0);
    this.functions = [];
    this.strings = [];
    this.variables = [];
    this.inherits = [];
    this.classes = [];
    this.lineNumbers = [];
    this.argumentTypes = [];
  }

  findFunction(name) {
    return this.functions.find(f => f.name === name) ?? null;
  }

  findInheritedFunction(name) {
    for (const inh of this.inherits) {
      const fn = inh.program.findFunction(name);
      if (fn) return { fn, program: inh.program, varOffset: inh.varOffset };
    }
    return null;
  }
}
