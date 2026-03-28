import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ObjectManager } from '../../src/runtime/object-manager.mjs';
import { Machine } from '../../src/vm/machine.mjs';
import { EfunRegistry } from '../../src/runtime/efuns.mjs';
import { setMachine } from '../../src/runtime/apply.mjs';

describe('ObjectManager', () => {
  let mgr, vm;

  beforeEach(() => {
    vm = new Machine();
    setMachine(vm);
    const efuns = new EfunRegistry();
    efuns.loadDefaults();
    vm.efunHandler = (name, args) => efuns.call(name, args);

    mgr = new ObjectManager({
      readFile: (path) => {
        const files = {
          '/simple.c': 'int value = 10;\nint get_value() { return value; }',
          '/parent.c': 'int base() { return 1; }',
          '/child.c': 'inherit "/parent";\nint get() { return base() + 1; }',
          '/with_create.c': 'int ready = 0;\nvoid create() { ready = 1; }\nint is_ready() { return ready; }',
        };
        return files[path] ?? null;
      },
      includePaths: [],
    });
  });

  it('loads an object from file', () => {
    const obj = mgr.load('/simple.c');
    assert.equal(obj.filename, '/simple.c');
    assert.ok(obj.program);
  });

  it('returns cached object on second load', () => {
    const obj1 = mgr.load('/simple.c');
    const obj2 = mgr.load('/simple.c');
    assert.equal(obj1, obj2);
  });

  it('loads object with inheritance', () => {
    const obj = mgr.load('/child.c');
    assert.ok(obj.program.inherits.length > 0);
  });

  it('clones an object', () => {
    const clone = mgr.clone('/simple.c');
    assert.ok(clone.cloneNumber > 0);
    assert.equal(clone.filename, '/simple.c');
  });

  it('clone has independent variables', () => {
    const clone1 = mgr.clone('/simple.c');
    const clone2 = mgr.clone('/simple.c');
    assert.notEqual(clone1.variables, clone2.variables);
    assert.notEqual(clone1.cloneNumber, clone2.cloneNumber);
  });

  it('destruct removes from object table', () => {
    const obj = mgr.load('/simple.c');
    mgr.destruct(obj);
    assert.ok(obj.isDestructed());
    const obj2 = mgr.load('/simple.c');
    assert.notEqual(obj, obj2);
  });

  it('find returns object by filename', () => {
    const obj = mgr.load('/simple.c');
    assert.equal(mgr.find('/simple.c'), obj);
    assert.equal(mgr.find('/nope.c'), null);
  });

  it('calls create() on load', () => {
    const obj = mgr.load('/with_create.c');
    assert.equal(obj.variables[0].value, 1);
  });
});
