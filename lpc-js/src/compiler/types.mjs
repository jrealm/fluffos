export const LPC_TYPES = {
  UNKNOWN: 0,
  ANY: 1,
  VOID: 2,
  INT: 3,
  STRING: 4,
  OBJECT: 5,
  MAPPING: 6,
  FUNCTION: 7,
  FLOAT: 8,
  BUFFER: 9,
  MIXED: 10,
};

export const TYPE_MOD_ARRAY = 0x100;
export const TYPE_MOD_CLASS = 0x200;

const NAME_TO_TYPE = {
  'int': LPC_TYPES.INT,
  'string': LPC_TYPES.STRING,
  'float': LPC_TYPES.FLOAT,
  'object': LPC_TYPES.OBJECT,
  'mapping': LPC_TYPES.MAPPING,
  'function': LPC_TYPES.FUNCTION,
  'mixed': LPC_TYPES.MIXED,
  'void': LPC_TYPES.VOID,
  'buffer': LPC_TYPES.BUFFER,
  'status': LPC_TYPES.INT,
};

export function parseTypeName(name) {
  if (name.endsWith('*')) {
    const base = parseTypeName(name.slice(0, -1));
    if (base === LPC_TYPES.UNKNOWN) return LPC_TYPES.UNKNOWN;
    return base | TYPE_MOD_ARRAY;
  }
  return NAME_TO_TYPE[name] ?? LPC_TYPES.UNKNOWN;
}

export function baseType(type) {
  return type & 0xFF;
}

export function isArray(type) {
  return (type & TYPE_MOD_ARRAY) !== 0;
}

export function isAssignable(target, value) {
  if (target === value) return true;
  const bt = baseType(target);
  const bv = baseType(value);
  if (bt === LPC_TYPES.UNKNOWN || bv === LPC_TYPES.UNKNOWN) return true;
  if (bt === LPC_TYPES.MIXED || bv === LPC_TYPES.MIXED) return true;
  if (bt === LPC_TYPES.ANY || bv === LPC_TYPES.ANY) return true;
  if ((bt === LPC_TYPES.INT && bv === LPC_TYPES.FLOAT) ||
      (bt === LPC_TYPES.FLOAT && bv === LPC_TYPES.INT)) return true;
  return false;
}
