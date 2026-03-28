import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../../src/compiler/parser.mjs';

// Helper: parse a single expression from a function body
function parseExpr(src) {
  const prog = parse(`mixed __test__() { return ${src}; }`);
  const func = prog.body[0];
  const ret = func.body.statements[0];
  return ret.value;
}

describe('parser — expressions', () => {
  it('parses integer literal', () => {
    const e = parseExpr('42');
    assert.equal(e.type, 'IntLiteral');
    assert.equal(e.value, 42);
  });

  it('parses float literal', () => {
    const e = parseExpr('3.14');
    assert.equal(e.type, 'FloatLiteral');
    assert.equal(e.value, 3.14);
  });

  it('parses string literal', () => {
    const e = parseExpr('"hello"');
    assert.equal(e.type, 'StringLiteral');
    assert.equal(e.value, 'hello');
  });

  it('parses identifier', () => {
    const e = parseExpr('foo');
    assert.equal(e.type, 'Identifier');
    assert.equal(e.name, 'foo');
  });

  it('parses binary arithmetic', () => {
    const e = parseExpr('1 + 2');
    assert.equal(e.type, 'BinaryExpression');
    assert.equal(e.operator, '+');
    assert.equal(e.left.value, 1);
    assert.equal(e.right.value, 2);
  });

  it('respects precedence: * before +', () => {
    const e = parseExpr('1 + 2 * 3');
    assert.equal(e.operator, '+');
    assert.equal(e.right.operator, '*');
  });

  it('parses parenthesized expression', () => {
    const e = parseExpr('(1 + 2) * 3');
    assert.equal(e.operator, '*');
    assert.equal(e.left.operator, '+');
  });

  it('parses comparison operators', () => {
    const e = parseExpr('a > b');
    assert.equal(e.operator, '>');
  });

  it('parses equality operators', () => {
    const e = parseExpr('a == b');
    assert.equal(e.operator, '==');
  });

  it('parses logical and/or', () => {
    const e = parseExpr('a && b || c');
    assert.equal(e.operator, '||');
    assert.equal(e.left.operator, '&&');
  });

  it('parses unary minus', () => {
    const e = parseExpr('-x');
    assert.equal(e.type, 'UnaryExpression');
    assert.equal(e.operator, '-');
    assert.equal(e.operand.name, 'x');
  });

  it('parses unary not', () => {
    const e = parseExpr('!x');
    assert.equal(e.type, 'UnaryExpression');
    assert.equal(e.operator, '!');
  });

  it('parses bitwise not', () => {
    const e = parseExpr('~x');
    assert.equal(e.type, 'UnaryExpression');
    assert.equal(e.operator, '~');
  });

  it('parses ternary expression', () => {
    const e = parseExpr('a ? 1 : 2');
    assert.equal(e.type, 'TernaryExpression');
  });

  it('parses function call', () => {
    const e = parseExpr('write(1, 2)');
    assert.equal(e.type, 'CallExpression');
    assert.equal(e.name, 'write');
    assert.equal(e.args.length, 2);
  });

  it('parses index expression', () => {
    const e = parseExpr('arr[0]');
    assert.equal(e.type, 'IndexExpression');
    assert.equal(e.object.name, 'arr');
    assert.equal(e.index.value, 0);
  });

  it('parses call_other arrow syntax', () => {
    const e = parseExpr('obj->func(1)');
    assert.equal(e.type, 'CallOther');
    assert.equal(e.object.name, 'obj');
    assert.equal(e.method, 'func');
    assert.equal(e.args.length, 1);
  });

  it('parses assignment expression', () => {
    const e = parseExpr('x = 5');
    assert.equal(e.type, 'AssignExpression');
    assert.equal(e.operator, '=');
    assert.equal(e.left.name, 'x');
    assert.equal(e.right.value, 5);
  });

  it('parses compound assignment', () => {
    const e = parseExpr('x += 3');
    assert.equal(e.type, 'AssignExpression');
    assert.equal(e.operator, '+=');
  });

  it('parses prefix increment', () => {
    const e = parseExpr('++x');
    assert.equal(e.type, 'UpdateExpression');
    assert.equal(e.operator, '++');
    assert.equal(e.prefix, true);
  });

  it('parses postfix increment', () => {
    const e = parseExpr('x++');
    assert.equal(e.type, 'UpdateExpression');
    assert.equal(e.operator, '++');
    assert.equal(e.prefix, false);
  });

  it('parses array literal', () => {
    const e = parseExpr('({ 1, 2, 3 })');
    assert.equal(e.type, 'ArrayLiteral');
    assert.equal(e.elements.length, 3);
  });

  it('parses mapping literal', () => {
    const e = parseExpr('([ "a": 1, "b": 2 ])');
    assert.equal(e.type, 'MappingLiteral');
    assert.equal(e.entries.length, 2);
    assert.equal(e.entries[0].key.value, 'a');
    assert.equal(e.entries[0].value.value, 1);
  });

  it('parses bitwise operators', () => {
    const e = parseExpr('a & b | c ^ d');
    assert.equal(e.operator, '|');
  });

  it('parses shift operators', () => {
    const e = parseExpr('a << 2');
    assert.equal(e.operator, '<<');
  });

  it('parses range expression', () => {
    const e = parseExpr('arr[1..3]');
    assert.equal(e.type, 'RangeExpression');
    assert.equal(e.from.value, 1);
    assert.equal(e.to.value, 3);
  });
});

describe('parser — statements', () => {
  function parseBody(funcSrc) {
    const prog = parse(funcSrc);
    return prog.body[0].body.statements;
  }

  it('parses variable declaration', () => {
    const stmts = parseBody('void f() { int x = 5; }');
    assert.equal(stmts[0].type, 'VarDecl');
    assert.equal(stmts[0].name, 'x');
    assert.equal(stmts[0].init.value, 5);
  });

  it('parses if/else', () => {
    const stmts = parseBody('void f() { if (x) { return 1; } else { return 2; } }');
    assert.equal(stmts[0].type, 'IfStatement');
    assert.notEqual(stmts[0].alternate, null);
  });

  it('parses while loop', () => {
    const stmts = parseBody('void f() { while (x > 0) { x -= 1; } }');
    assert.equal(stmts[0].type, 'WhileStatement');
  });

  it('parses for loop', () => {
    const stmts = parseBody('void f() { for (int i = 0; i < 10; i++) { write(i); } }');
    assert.equal(stmts[0].type, 'ForStatement');
    assert.equal(stmts[0].init.type, 'VarDecl');
  });

  it('parses do-while', () => {
    const stmts = parseBody('void f() { do { x++; } while (x < 10); }');
    assert.equal(stmts[0].type, 'DoWhileStatement');
  });

  it('parses switch', () => {
    const stmts = parseBody('void f() { switch(x) { case 1: return 1; default: return 0; } }');
    assert.equal(stmts[0].type, 'SwitchStatement');
    assert.equal(stmts[0].cases.length, 2);
    assert.equal(stmts[0].cases[1].test, null);
  });

  it('parses break and continue', () => {
    const stmts = parseBody('void f() { while(1) { break; continue; } }');
    const body = stmts[0].body.statements;
    assert.equal(body[0].type, 'BreakStatement');
    assert.equal(body[1].type, 'ContinueStatement');
  });

  it('parses return with no value', () => {
    const stmts = parseBody('void f() { return; }');
    assert.equal(stmts[0].type, 'ReturnStatement');
    assert.equal(stmts[0].value, null);
  });

  it('parses expression statement', () => {
    const stmts = parseBody('void f() { write("hi"); }');
    assert.equal(stmts[0].type, 'ExpressionStatement');
    assert.equal(stmts[0].expression.type, 'CallExpression');
  });
});

describe('parser — declarations', () => {
  it('parses function declaration', () => {
    const prog = parse('int add(int a, int b) { return a + b; }');
    const func = prog.body[0];
    assert.equal(func.type, 'FunctionDecl');
    assert.equal(func.name, 'add');
    assert.equal(func.returnType, 'int');
    assert.equal(func.params.length, 2);
    assert.equal(func.params[0].typeName, 'int');
    assert.equal(func.params[0].name, 'a');
  });

  it('parses function prototype', () => {
    const prog = parse('void setup(string name);');
    assert.equal(prog.body[0].type, 'FunctionDecl');
    assert.equal(prog.body[0].body, null);
  });

  it('parses global variable', () => {
    const prog = parse('int counter = 0;');
    assert.equal(prog.body[0].type, 'VarDecl');
    assert.equal(prog.body[0].name, 'counter');
  });

  it('parses inherit declaration', () => {
    const prog = parse('inherit "/std/object";');
    assert.equal(prog.body[0].type, 'InheritDecl');
    assert.equal(prog.body[0].path, '/std/object');
  });

  it('parses multiple functions', () => {
    const prog = parse('void a() { } void b() { }');
    assert.equal(prog.body.length, 2);
    assert.equal(prog.body[0].name, 'a');
    assert.equal(prog.body[1].name, 'b');
  });

  it('parses array type parameter', () => {
    const prog = parse('void f(string* arr) { }');
    assert.equal(prog.body[0].params[0].typeName, 'string*');
  });
});

describe('parser — modifiers', () => {
  it('parses private function', () => {
    const prog = parse('private int secret() { return 1; }');
    assert.equal(prog.body[0].flags & 0x01, 0x01);
  });

  it('parses nomask function', () => {
    const prog = parse('nomask void setup() { }');
    assert.ok(prog.body[0].flags & 0x10);
  });

  it('parses static nosave variable', () => {
    const prog = parse('static nosave int cache = 0;');
    assert.ok(prog.body[0].flags);
  });
});

describe('parser — class declaration', () => {
  it('parses class definition', () => {
    const prog = parse('class point { int x; int y; }');
    assert.equal(prog.body[0].type, 'ClassDecl');
    assert.equal(prog.body[0].name, 'point');
    assert.equal(prog.body[0].members.length, 2);
    assert.equal(prog.body[0].members[0].typeName, 'int');
    assert.equal(prog.body[0].members[0].name, 'x');
  });
});

describe('parser — scope resolution', () => {
  it('parses ::func() call', () => {
    const prog = parse('void f() { ::create(); }');
    const stmt = prog.body[0].body.statements[0];
    assert.equal(stmt.expression.type, 'ScopeCallExpression');
    assert.equal(stmt.expression.name, 'create');
  });
});
