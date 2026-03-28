export const OP = {
  // Push constants
  PUSH_INT:     0x01,
  PUSH_STRING:  0x02,
  PUSH_FLOAT:   0x03,
  PUSH_0:       0x04,
  PUSH_1:       0x05,

  // Variables
  LOAD_LOCAL:   0x10,
  STORE_LOCAL:  0x11,
  LOAD_GLOBAL:  0x12,
  STORE_GLOBAL: 0x13,

  // Arithmetic
  ADD:          0x20,
  SUB:          0x21,
  MUL:          0x22,
  DIV:          0x23,
  MOD:          0x24,
  NEGATE:       0x25,

  // Comparison
  EQ:           0x30,
  NE:           0x31,
  LT:           0x32,
  LE:           0x33,
  GT:           0x34,
  GE:           0x35,

  // Bitwise
  BITAND:       0x38,
  BITOR:        0x39,
  BITXOR:       0x3A,
  LSH:          0x3B,
  RSH:          0x3C,
  BITNOT:       0x3D,

  // Logical
  NOT:          0x3E,

  // Jump
  JUMP:             0x40,
  JUMP_IF_ZERO:     0x41,
  JUMP_IF_NONZERO:  0x42,

  // Function
  CALL_LOCAL:   0x50,
  CALL_EFUN:    0x51,
  CALL_OTHER:   0x52,
  CALL_SIMUL:   0x53,
  RETURN:       0x54,
  RETURN_ZERO:  0x55,

  // Compound assignment
  ADD_EQ:       0x60,
  SUB_EQ:       0x61,
  MUL_EQ:       0x62,
  DIV_EQ:       0x63,
  MOD_EQ:       0x64,
  INC:          0x65,
  DEC:          0x66,

  // Collections
  INDEX:        0x70,
  INDEX_LVALUE: 0x71,
  RANGE:        0x72,
  MAKE_ARRAY:   0x73,
  MAKE_MAPPING: 0x74,

  // Object
  CALL_INHERITED: 0x80,
  THIS_OBJECT:    0x81,

  // Loops
  FOREACH_INIT: 0x90,
  FOREACH_NEXT: 0x91,
  FOREACH_END:  0x92,
  FOREACH_INIT_MAP: 0x93,
  FOREACH_NEXT_MAP: 0x94,

  // Reverse index
  RINDEX:       0x75,

  // Function pointers
  MAKE_FUNCTION:     0x76,
  CALL_FUNCTION_PTR: 0x77,
  MAKE_CLOSURE:      0x78,

  // Index store
  STORE_INDEX:       0x79,

  // Special
  CATCH:        0xA0,
  END_CATCH:    0xA1,
  SWITCH:       0xA2,
  THROW:        0xA3,
  CLASS_NEW:    0xC0,
  CLASS_GET:    0xC1,
  CLASS_SET:    0xC2,
  POP:          0xB0,
  DUP:          0xB1,
};

const nameMap = new Map(Object.entries(OP).map(([k, v]) => [v, k]));

export function opName(code) {
  return nameMap.get(code) ?? `UNKNOWN(${code})`;
}
