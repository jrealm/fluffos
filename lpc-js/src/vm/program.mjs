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
    // Skip prototype entries (offset === -1)
    return this.functions.find(f => f.name === name && f.offset >= 0) ?? null;
  }

  findInheritedFunction(name) {
    for (const inh of this.inherits) {
      const fn = inh.program.findFunction(name);
      if (fn) return { fn, program: inh.program, varOffset: inh.varOffset };
      // Recurse into ancestor inherits
      const deep = inh.program.findInheritedFunction(name);
      if (deep) return deep;
    }
    return null;
  }
}
