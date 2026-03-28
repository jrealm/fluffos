import { LpcObject } from './object.mjs';
import { apply } from './apply.mjs';
import { compileWithInherit } from '../compiler/codegen.mjs';

export class ObjectManager {
  constructor(options = {}) {
    this.readFile = options.readFile ?? null;
    this.includePaths = options.includePaths ?? [];
    this.objects = new Map();
    this.cloneCounter = 0;
    this.programCache = new Map();
    this.onObjectCreated = null; // callback: (obj) => void, for UID setup
  }

  load(filename) {
    const existing = this.objects.get(filename);
    if (existing && !existing.isDestructed()) return existing;

    const prog = this._compile(filename);
    const obj = new LpcObject(filename, prog);
    this.objects.set(filename, obj);

    if (this.onObjectCreated) this.onObjectCreated(obj);
    apply('create', obj, []);

    return obj;
  }

  clone(filename) {
    const master = this.load(filename);
    this.cloneCounter++;
    const clone = master.clone(this.cloneCounter);
    const cloneId = `${filename}#${this.cloneCounter}`;
    this.objects.set(cloneId, clone);

    if (this.onObjectCreated) this.onObjectCreated(clone);
    apply('create', clone, []);

    return clone;
  }

  destruct(obj) {
    obj.destruct();
    this.objects.delete(obj.objectId);
    if (obj.cloneNumber === 0) {
      this.objects.delete(obj.filename);
      this.programCache.delete(obj.filename);
    }
  }

  find(filename) {
    return this.objects.get(filename) ?? null;
  }

  _compile(filename) {
    if (this.programCache.has(filename)) return this.programCache.get(filename);

    const self = this;
    const files = {};

    function collectFile(fname) {
      if (files[fname] !== undefined) return;
      const source = self.readFile(fname);
      if (source === null) throw new Error(`File not found: ${fname}`);
      files[fname] = source;

      const inheritPattern = /inherit\s+"([^"]+)"\s*;/g;
      let match;
      while ((match = inheritPattern.exec(source)) !== null) {
        let path = match[1];
        if (!path.endsWith('.c')) path += '.c';
        collectFile(path);
      }
    }

    collectFile(filename);
    const prog = compileWithInherit(filename, files);
    this.programCache.set(filename, prog);
    return prog;
  }
}
