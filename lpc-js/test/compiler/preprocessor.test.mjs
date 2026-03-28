import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { preprocess } from '../../src/compiler/preprocessor.mjs';

describe('preprocessor — #define and #undef', () => {
  it('expands simple #define', () => {
    const result = preprocess('#define FOO 42\nint x = FOO;');
    assert.equal(result.source.trim(), 'int x = 42;');
  });

  it('expands multiple defines', () => {
    const result = preprocess('#define A 1\n#define B 2\nint x = A + B;');
    assert.equal(result.source.trim(), 'int x = 1 + 2;');
  });

  it('handles #undef', () => {
    const result = preprocess('#define FOO 10\n#undef FOO\nint x = FOO;');
    assert.equal(result.source.trim(), 'int x = FOO;');
  });

  it('expands macro with arguments', () => {
    const result = preprocess('#define MAX(a,b) ((a)>(b)?(a):(b))\nint x = MAX(3,5);');
    assert.equal(result.source.trim(), 'int x = ((3)>(5)?(3):(5));');
  });

  it('does not expand inside strings', () => {
    const result = preprocess('#define FOO bar\nstring s = "FOO";');
    assert.equal(result.source.trim(), 'string s = "FOO";');
  });

  it('handles empty define', () => {
    const result = preprocess('#define FLAG\nint x = 1;');
    assert.equal(result.source.trim(), 'int x = 1;');
  });

  it('preserves line count with blank lines for directives', () => {
    const result = preprocess('#define FOO 1\n\nint x = FOO;');
    const lines = result.source.split('\n');
    assert.equal(lines.length, 3);
    assert.equal(lines[2].trim(), 'int x = 1;');
  });
});

describe('preprocessor — conditionals', () => {
  it('#ifdef true', () => {
    const result = preprocess('#define FOO\n#ifdef FOO\nint x = 1;\n#endif');
    assert.ok(result.source.includes('int x = 1;'));
  });

  it('#ifdef false', () => {
    const result = preprocess('#ifdef FOO\nint x = 1;\n#endif');
    assert.ok(!result.source.includes('int x = 1;'));
  });

  it('#ifndef true', () => {
    const result = preprocess('#ifndef FOO\nint x = 1;\n#endif');
    assert.ok(result.source.includes('int x = 1;'));
  });

  it('#ifndef false', () => {
    const result = preprocess('#define FOO\n#ifndef FOO\nint x = 1;\n#endif');
    assert.ok(!result.source.includes('int x = 1;'));
  });

  it('#ifdef with #else', () => {
    const result = preprocess('#ifdef FOO\nint x = 1;\n#else\nint x = 2;\n#endif');
    assert.ok(!result.source.includes('int x = 1;'));
    assert.ok(result.source.includes('int x = 2;'));
  });

  it('#if with defined()', () => {
    const result = preprocess('#define FOO\n#if defined(FOO)\nint x = 1;\n#endif');
    assert.ok(result.source.includes('int x = 1;'));
  });

  it('#elif chain', () => {
    const result = preprocess('#define B 1\n#ifdef A\nint x = 1;\n#elif defined(B)\nint x = 2;\n#else\nint x = 3;\n#endif');
    assert.ok(!result.source.includes('int x = 1;'));
    assert.ok(result.source.includes('int x = 2;'));
    assert.ok(!result.source.includes('int x = 3;'));
  });

  it('nested #ifdef', () => {
    const result = preprocess('#define A\n#define B\n#ifdef A\n#ifdef B\nint x = 1;\n#endif\n#endif');
    assert.ok(result.source.includes('int x = 1;'));
  });
});

describe('preprocessor — #pragma', () => {
  it('collects pragma strict_types', () => {
    const result = preprocess('#pragma strict_types\nint x = 1;');
    assert.equal(result.pragmas['strict_types'], true);
  });

  it('collects pragma save_types', () => {
    const result = preprocess('#pragma save_types\nint x = 1;');
    assert.equal(result.pragmas['save_types'], true);
  });
});

describe('preprocessor — #include', () => {
  it('includes file content', () => {
    const readFile = (path) => {
      if (path === '/include/header.h') return 'int CONST = 42;';
      return null;
    };
    const result = preprocess('#include <header.h>\nint x = CONST;', {
      includePaths: ['/include'],
      readFile,
    });
    assert.ok(result.source.includes('int CONST = 42;'));
  });

  it('includes with quotes', () => {
    const readFile = (path) => {
      if (path === 'local.h') return '#define VAL 10';
      return null;
    };
    const result = preprocess('#include "local.h"\nint x = VAL;', { readFile });
    assert.ok(result.source.includes('int x = 10;'));
  });

  it('nested includes', () => {
    const readFile = (path) => {
      if (path === '/inc/a.h') return '#include <b.h>\nint A = 1;';
      if (path === '/inc/b.h') return 'int B = 2;';
      return null;
    };
    const result = preprocess('#include <a.h>', { includePaths: ['/inc'], readFile });
    assert.ok(result.source.includes('int B = 2;'));
    assert.ok(result.source.includes('int A = 1;'));
  });
});

describe('preprocessor — initial defines', () => {
  it('accepts initial defines via options', () => {
    const result = preprocess('int x = FOO;', { defines: { FOO: { params: null, body: '99' } } });
    assert.ok(result.source.includes('int x = 99;'));
  });
});
