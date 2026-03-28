import { registerStringEfuns } from './efuns/strings.mjs';
import { registerArrayEfuns } from './efuns/arrays.mjs';
import { registerMappingEfuns } from './efuns/mappings.mjs';
import { registerMiscEfuns } from './efuns/misc.mjs';
import { registerTypeEfuns } from './efuns/types.mjs';
import { registerObjectEfuns } from './efuns/objects.mjs';
import { registerFileEfuns } from './efuns/files.mjs';
import { registerRegexEfuns } from './efuns/regex.mjs';
import { registerSprintfEfuns } from './efuns/sprintf.mjs';
import { registerBitEfuns } from './efuns/bits.mjs';
import { registerContribEfuns } from './efuns/contrib.mjs';
import { registerMathEfuns } from './efuns/math.mjs';
import { registerEncodingEfuns } from './efuns/encoding.mjs';
import { registerCompressEfuns } from './efuns/compress.mjs';

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

  loadDefaults(options = {}) {
    registerStringEfuns(this);
    registerArrayEfuns(this);
    registerMappingEfuns(this);
    registerMiscEfuns(this);
    registerTypeEfuns(this);
    registerObjectEfuns(this, null);
    registerRegexEfuns(this);
    registerSprintfEfuns(this);
    registerBitEfuns(this);
    registerContribEfuns(this, null);
    registerMathEfuns(this);
    registerEncodingEfuns(this, null);
    registerCompressEfuns(this);
    if (options.mudlibDir) {
      registerFileEfuns(this, options.mudlibDir);
    }
  }
}
