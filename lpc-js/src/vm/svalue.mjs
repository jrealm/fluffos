export const T_INT = 0;
export const T_STRING = 1;
export const T_FLOAT = 2;
export const T_ARRAY = 3;
export const T_MAPPING = 4;
export const T_OBJECT = 5;
export const T_FUNCTION = 6;
export const T_BUFFER = 7;
export const T_CLASS = 8;

export function mkInt(value) {
  return { type: T_INT, value };
}

export function mkString(value) {
  return { type: T_STRING, value };
}

export function mkFloat(value) {
  return { type: T_FLOAT, value };
}

export function mkArray(value) {
  return { type: T_ARRAY, value };
}

export function mkMapping(value) {
  return { type: T_MAPPING, value };
}

export const SVALUE_ZERO = Object.freeze(mkInt(0));
export const SVALUE_ONE = Object.freeze(mkInt(1));

export function isTruthy(sv) {
  switch (sv.type) {
    case T_INT:
      return sv.value !== 0;
    case T_STRING:
      return sv.value.length > 0;
    case T_FLOAT:
      return sv.value !== 0.0;
    case T_ARRAY:
      return sv.value.length > 0;
    case T_MAPPING:
      return sv.value.size > 0;
    default:
      return true;
  }
}
