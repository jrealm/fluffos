import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, T } from '../../src/compiler/lexer.mjs';

describe('lexer', () => {
  it('tokenizes integers', () => {
    const tokens = tokenize('42');
    assert.equal(tokens.length, 2);
    assert.equal(tokens[0].type, T.INT_LIT);
    assert.equal(tokens[0].value, 42);
    assert.equal(tokens[1].type, T.EOF);
  });

  it('tokenizes negative as unary minus + int', () => {
    const tokens = tokenize('-5');
    assert.equal(tokens[0].type, T.MINUS);
    assert.equal(tokens[1].type, T.INT_LIT);
    assert.equal(tokens[1].value, 5);
  });

  it('tokenizes hex literals', () => {
    const tokens = tokenize('0xff');
    assert.equal(tokens[0].type, T.INT_LIT);
    assert.equal(tokens[0].value, 255);
  });

  it('tokenizes float literals', () => {
    const tokens = tokenize('3.14');
    assert.equal(tokens[0].type, T.FLOAT_LIT);
    assert.equal(tokens[0].value, 3.14);
  });

  it('tokenizes string literals', () => {
    const tokens = tokenize('"hello world"');
    assert.equal(tokens[0].type, T.STRING_LIT);
    assert.equal(tokens[0].value, 'hello world');
  });

  it('tokenizes string with escape sequences', () => {
    const tokens = tokenize('"a\\nb\\t"');
    assert.equal(tokens[0].value, 'a\nb\t');
  });

  it('tokenizes identifiers', () => {
    const tokens = tokenize('foo bar_baz');
    assert.equal(tokens[0].type, T.IDENT);
    assert.equal(tokens[0].value, 'foo');
    assert.equal(tokens[1].type, T.IDENT);
    assert.equal(tokens[1].value, 'bar_baz');
  });

  it('tokenizes keywords', () => {
    const tokens = tokenize('if else while for return int string');
    assert.equal(tokens[0].type, T.IF);
    assert.equal(tokens[1].type, T.ELSE);
    assert.equal(tokens[2].type, T.WHILE);
    assert.equal(tokens[3].type, T.FOR);
    assert.equal(tokens[4].type, T.RETURN);
    assert.equal(tokens[5].type, T.TYPE_INT);
    assert.equal(tokens[6].type, T.TYPE_STRING);
  });

  it('tokenizes operators', () => {
    const tokens = tokenize('+ - * / % == != < <= > >= && || !');
    const types = tokens.slice(0, -1).map(t => t.type);
    assert.deepEqual(types, [
      T.PLUS, T.MINUS, T.STAR, T.SLASH, T.PERCENT,
      T.EQ_EQ, T.BANG_EQ, T.LT, T.LT_EQ, T.GT, T.GT_EQ,
      T.AMP_AMP, T.PIPE_PIPE, T.BANG
    ]);
  });

  it('tokenizes compound assignment', () => {
    const tokens = tokenize('+= -= *= /= %=');
    const types = tokens.slice(0, -1).map(t => t.type);
    assert.deepEqual(types, [
      T.PLUS_EQ, T.MINUS_EQ, T.STAR_EQ, T.SLASH_EQ, T.PERCENT_EQ
    ]);
  });

  it('tokenizes increment/decrement', () => {
    const tokens = tokenize('++ --');
    assert.equal(tokens[0].type, T.PLUS_PLUS);
    assert.equal(tokens[1].type, T.MINUS_MINUS);
  });

  it('tokenizes bitwise operators', () => {
    const tokens = tokenize('& | ^ ~ << >>');
    const types = tokens.slice(0, -1).map(t => t.type);
    assert.deepEqual(types, [T.AMP, T.PIPE, T.CARET, T.TILDE, T.LT_LT, T.GT_GT]);
  });

  it('tokenizes delimiters', () => {
    const tokens = tokenize('( ) { } [ ] ; , . ::');
    const types = tokens.slice(0, -1).map(t => t.type);
    assert.deepEqual(types, [
      T.LPAREN, T.RPAREN, T.LBRACE, T.RBRACE,
      T.LBRACKET, T.RBRACKET, T.SEMICOLON, T.COMMA, T.DOT,
      T.COLON_COLON
    ]);
  });

  it('tokenizes arrow operator', () => {
    const tokens = tokenize('obj->func');
    assert.equal(tokens[0].type, T.IDENT);
    assert.equal(tokens[1].type, T.ARROW);
    assert.equal(tokens[2].type, T.IDENT);
  });

  it('tokenizes LPC array/mapping literals', () => {
    const tokens = tokenize('({ }) ([ ])');
    assert.equal(tokens[0].type, T.ARRAY_OPEN);
    assert.equal(tokens[1].type, T.ARRAY_CLOSE);
    assert.equal(tokens[2].type, T.MAPPING_OPEN);
    assert.equal(tokens[3].type, T.MAPPING_CLOSE);
  });

  it('tokenizes function pointer syntax', () => {
    const tokens = tokenize('(: :)');
    assert.equal(tokens[0].type, T.FP_OPEN);
    assert.equal(tokens[1].type, T.FP_CLOSE);
  });

  it('tokenizes ternary and assignment', () => {
    const tokens = tokenize('? : =');
    assert.equal(tokens[0].type, T.QUESTION);
    assert.equal(tokens[1].type, T.COLON);
    assert.equal(tokens[2].type, T.EQ);
  });

  it('tokenizes range operator', () => {
    const tokens = tokenize('..');
    assert.equal(tokens[0].type, T.DOT_DOT);
  });

  it('skips single-line comments', () => {
    const tokens = tokenize('42 // comment\n7');
    assert.equal(tokens[0].type, T.INT_LIT);
    assert.equal(tokens[0].value, 42);
    assert.equal(tokens[1].type, T.INT_LIT);
    assert.equal(tokens[1].value, 7);
  });

  it('skips block comments', () => {
    const tokens = tokenize('1 /* block */ 2');
    assert.equal(tokens[0].value, 1);
    assert.equal(tokens[1].value, 2);
  });

  it('tracks line numbers', () => {
    const tokens = tokenize('a\nb\nc');
    assert.equal(tokens[0].line, 1);
    assert.equal(tokens[1].line, 2);
    assert.equal(tokens[2].line, 3);
  });

  it('tokenizes varargs ellipsis', () => {
    const tokens = tokenize('...');
    assert.equal(tokens[0].type, T.ELLIPSIS);
  });

  it('tokenizes a simple function', () => {
    const tokens = tokenize('int add(int a, int b) { return a + b; }');
    const types = tokens.slice(0, -1).map(t => t.type);
    assert.deepEqual(types, [
      T.TYPE_INT, T.IDENT, T.LPAREN, T.TYPE_INT, T.IDENT, T.COMMA,
      T.TYPE_INT, T.IDENT, T.RPAREN, T.LBRACE,
      T.RETURN, T.IDENT, T.PLUS, T.IDENT, T.SEMICOLON,
      T.RBRACE
    ]);
  });
});
