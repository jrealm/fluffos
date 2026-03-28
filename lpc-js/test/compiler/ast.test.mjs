import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as AST from '../../src/compiler/ast.mjs';

describe('AST nodes', () => {
  it('creates IntLiteral', () => {
    const n = AST.intLiteral(42, 1);
    assert.equal(n.type, 'IntLiteral');
    assert.equal(n.value, 42);
    assert.equal(n.line, 1);
  });

  it('creates BinaryExpression', () => {
    const left = AST.intLiteral(1, 1);
    const right = AST.intLiteral(2, 1);
    const n = AST.binaryExpr('+', left, right, 1);
    assert.equal(n.type, 'BinaryExpression');
    assert.equal(n.operator, '+');
    assert.equal(n.left.value, 1);
    assert.equal(n.right.value, 2);
  });

  it('creates FunctionDecl', () => {
    const body = AST.block([], 1);
    const n = AST.functionDecl('add', 'int', [{ typeName: 'int', name: 'a' }], body, 0, 1);
    assert.equal(n.type, 'FunctionDecl');
    assert.equal(n.name, 'add');
    assert.equal(n.returnType, 'int');
    assert.equal(n.params.length, 1);
  });

  it('creates IfStatement', () => {
    const cond = AST.intLiteral(1, 1);
    const then = AST.block([], 1);
    const n = AST.ifStatement(cond, then, null, 1);
    assert.equal(n.type, 'IfStatement');
    assert.equal(n.alternate, null);
  });

  it('creates CallExpression', () => {
    const n = AST.callExpr('write', [AST.stringLiteral('hi', 1)], 1);
    assert.equal(n.type, 'CallExpression');
    assert.equal(n.name, 'write');
    assert.equal(n.args.length, 1);
  });

  it('creates AssignExpression', () => {
    const left = AST.identifier('x', 1);
    const right = AST.intLiteral(5, 1);
    const n = AST.assignExpr('=', left, right, 1);
    assert.equal(n.type, 'AssignExpression');
    assert.equal(n.operator, '=');
  });

  it('creates VarDecl', () => {
    const n = AST.varDecl('int', 'x', AST.intLiteral(0, 1), 0, 1);
    assert.equal(n.type, 'VarDecl');
    assert.equal(n.varType, 'int');
    assert.equal(n.name, 'x');
  });

  it('creates ReturnStatement', () => {
    const n = AST.returnStatement(AST.intLiteral(1, 1), 1);
    assert.equal(n.type, 'ReturnStatement');
    assert.equal(n.value.value, 1);
  });

  it('creates WhileStatement', () => {
    const n = AST.whileStatement(AST.intLiteral(1, 1), AST.block([], 1), 1);
    assert.equal(n.type, 'WhileStatement');
  });

  it('creates ForStatement', () => {
    const n = AST.forStatement(null, AST.intLiteral(1, 1), null, AST.block([], 1), 1);
    assert.equal(n.type, 'ForStatement');
  });

  it('creates ArrayLiteral', () => {
    const n = AST.arrayLiteral([AST.intLiteral(1, 1)], 1);
    assert.equal(n.type, 'ArrayLiteral');
    assert.equal(n.elements.length, 1);
  });

  it('creates MappingLiteral', () => {
    const n = AST.mappingLiteral([{ key: AST.stringLiteral('a', 1), value: AST.intLiteral(1, 1) }], 1);
    assert.equal(n.type, 'MappingLiteral');
    assert.equal(n.entries.length, 1);
  });

  it('creates IndexExpression', () => {
    const n = AST.indexExpr(AST.identifier('arr', 1), AST.intLiteral(0, 1), 1);
    assert.equal(n.type, 'IndexExpression');
  });

  it('creates CallOther', () => {
    const n = AST.callOther(AST.identifier('obj', 1), 'func', [AST.intLiteral(1, 1)], 1);
    assert.equal(n.type, 'CallOther');
    assert.equal(n.method, 'func');
  });

  it('creates Program', () => {
    const n = AST.program([AST.functionDecl('main', 'void', [], AST.block([], 1), 0, 1)], 1);
    assert.equal(n.type, 'Program');
    assert.equal(n.body.length, 1);
  });
});
