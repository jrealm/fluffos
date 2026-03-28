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
}
