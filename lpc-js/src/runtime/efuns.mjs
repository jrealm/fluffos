import { registerStringEfuns } from './efuns/strings.mjs';
import { registerArrayEfuns } from './efuns/arrays.mjs';
import { registerMappingEfuns } from './efuns/mappings.mjs';
import { registerMiscEfuns } from './efuns/misc.mjs';

export class EfunRegistry {
  constructor() {
    this.registry = new Map();
  }

  register(name, fn) {
    this.registry.set(name, fn);
  }

  call(name, args) {
    const fn = this.registry.get(name);
    if (!fn) throw new Error(`Unknown efun: ${name}`);
    return fn(args);
  }

  has(name) {
    return this.registry.has(name);
  }

  loadDefaults() {
    registerStringEfuns(this);
    registerArrayEfuns(this);
    registerMappingEfuns(this);
    registerMiscEfuns(this);
  }
}
