/**
 * Compile-time options for lpc-js, analogous to FluffOS options.h / local_options.
 *
 * Usage:
 *   import { LpcOptions } from './options.mjs';
 *   const opts = new LpcOptions({ NO_ADD_ACTION: true });
 *   if (opts.get('NO_ADD_ACTION')) { ... }
 */

const DEFAULTS = {
  // Feature toggles (equivalent to FluffOS options.h)
  NO_ADD_ACTION: false,      // Disable add_action command system
  NO_SHADOWS: false,         // Disable object shadowing
  NO_ENVIRONMENT: false,     // Disable environment/inventory system
  NO_SNOOP: false,           // Disable snoop mechanism
  NO_RESETS: false,          // Disable periodic reset() calls
  NO_WIZARDS: false,         // Disable wizard tracking

  // Behaviour modifiers
  SENSIBLE_MODIFIERS: true,  // Enforce access modifiers (private/protected/public)
  CALLOUT_HANDLES: false,    // call_out returns handle int instead of void
  THIS_PLAYER_IN_CALL_OUT: true, // Preserve this_player() in call_out callbacks

  // Resource limits
  MAX_LOCAL_VARIABLES: 50,
  MAX_CALL_DEPTH: 150,
  MAX_EVAL_COST: 1_000_000,
  MAX_ARRAY_SIZE: 15000,
  MAX_MAPPING_SIZE: 15000,
  MAX_STRING_LENGTH: 200_000,
  MAX_BUFFER_SIZE: 65536,
  MAX_BYTE_TRANSFER: 10240,
  CALLOUT_CYCLE_SIZE: 512,

  // String / output
  LARGEST_PRINTABLE_STRING: 8192,
  NO_ANSI: false,            // Strip ANSI escape codes from output

  // Packages (all enabled by default in lpc-js)
  PACKAGE_ASYNC: true,
  PACKAGE_COMPRESS: true,
  PACKAGE_CONTRIB: true,
  PACKAGE_DB: true,
  PACKAGE_MATH: true,
  PACKAGE_PCRE: true,
  PACKAGE_SOCKETS: true,
  PACKAGE_UIDS: true,
  PACKAGE_EXTERNAL: true,
};

export class LpcOptions {
  constructor(overrides = {}) {
    this._options = { ...DEFAULTS };
    for (const [key, value] of Object.entries(overrides)) {
      if (key in this._options) {
        this._options[key] = value;
      }
    }
  }

  get(name) {
    return this._options[name];
  }

  set(name, value) {
    this._options[name] = value;
  }

  has(name) {
    return name in this._options;
  }

  /**
   * Load options from a FluffOS-style config object.
   * Config keys like "no add_action : 1" map to NO_ADD_ACTION: true.
   */
  static fromConfig(config) {
    const overrides = {};
    const boolMappings = {
      'no add_action': 'NO_ADD_ACTION',
      'no shadows': 'NO_SHADOWS',
      'no environment': 'NO_ENVIRONMENT',
      'no snoop': 'NO_SNOOP',
      'no resets': 'NO_RESETS',
      'no wizards': 'NO_WIZARDS',
      'sensible modifiers': 'SENSIBLE_MODIFIERS',
      'callout handles': 'CALLOUT_HANDLES',
      'this player in call_out': 'THIS_PLAYER_IN_CALL_OUT',
      'no ansi': 'NO_ANSI',
    };
    const intMappings = {
      'max local variables': 'MAX_LOCAL_VARIABLES',
      'max call depth': 'MAX_CALL_DEPTH',
      'max eval cost': 'MAX_EVAL_COST',
      'max array size': 'MAX_ARRAY_SIZE',
      'max mapping size': 'MAX_MAPPING_SIZE',
      'max string length': 'MAX_STRING_LENGTH',
      'max buffer size': 'MAX_BUFFER_SIZE',
      'max byte transfer': 'MAX_BYTE_TRANSFER',
    };

    for (const [configKey, optKey] of Object.entries(boolMappings)) {
      if (configKey in config) {
        overrides[optKey] = config[configKey] === '1' || config[configKey] === 'true';
      }
    }
    for (const [configKey, optKey] of Object.entries(intMappings)) {
      if (configKey in config) {
        overrides[optKey] = parseInt(config[configKey], 10);
      }
    }

    return new LpcOptions(overrides);
  }

  /**
   * Return all options as defines for the preprocessor.
   * e.g., NO_ADD_ACTION: true => __NO_ADD_ACTION__ defined
   */
  toDefines() {
    const defines = {};
    for (const [key, value] of Object.entries(this._options)) {
      if (value === true) {
        defines[`__${key}__`] = '1';
      } else if (typeof value === 'number') {
        defines[`__${key}__`] = String(value);
      }
    }
    return defines;
  }
}
