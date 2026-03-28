export const T = {
  // Literals
  INT_LIT: 'INT_LIT',
  FLOAT_LIT: 'FLOAT_LIT',
  STRING_LIT: 'STRING_LIT',
  IDENT: 'IDENT',

  // Keywords
  IF: 'IF', ELSE: 'ELSE', WHILE: 'WHILE', DO: 'DO', FOR: 'FOR',
  FOREACH: 'FOREACH', IN: 'IN',
  SWITCH: 'SWITCH', CASE: 'CASE', DEFAULT: 'DEFAULT',
  RETURN: 'RETURN', BREAK: 'BREAK', CONTINUE: 'CONTINUE',
  INHERIT: 'INHERIT', CLASS: 'CLASS',
  PRIVATE: 'PRIVATE', PROTECTED: 'PROTECTED', PUBLIC: 'PUBLIC',
  STATIC: 'STATIC', NOMASK: 'NOMASK', NOSAVE: 'NOSAVE',
  VARARGS: 'VARARGS',

  // Type keywords
  TYPE_INT: 'TYPE_INT', TYPE_STRING: 'TYPE_STRING', TYPE_FLOAT: 'TYPE_FLOAT',
  TYPE_OBJECT: 'TYPE_OBJECT', TYPE_MAPPING: 'TYPE_MAPPING',
  TYPE_MIXED: 'TYPE_MIXED', TYPE_VOID: 'TYPE_VOID', TYPE_BUFFER: 'TYPE_BUFFER',
  TYPE_FUNCTION: 'TYPE_FUNCTION', TYPE_STATUS: 'TYPE_STATUS',

  // Operators
  PLUS: 'PLUS', MINUS: 'MINUS', STAR: 'STAR', SLASH: 'SLASH', PERCENT: 'PERCENT',
  EQ: 'EQ', EQ_EQ: 'EQ_EQ', BANG: 'BANG', BANG_EQ: 'BANG_EQ',
  LT: 'LT', LT_EQ: 'LT_EQ', GT: 'GT', GT_EQ: 'GT_EQ',
  AMP: 'AMP', AMP_AMP: 'AMP_AMP', PIPE: 'PIPE', PIPE_PIPE: 'PIPE_PIPE',
  CARET: 'CARET', TILDE: 'TILDE', LT_LT: 'LT_LT', GT_GT: 'GT_GT',
  PLUS_EQ: 'PLUS_EQ', MINUS_EQ: 'MINUS_EQ', STAR_EQ: 'STAR_EQ',
  SLASH_EQ: 'SLASH_EQ', PERCENT_EQ: 'PERCENT_EQ',
  AMP_EQ: 'AMP_EQ', PIPE_EQ: 'PIPE_EQ', CARET_EQ: 'CARET_EQ',
  LT_LT_EQ: 'LT_LT_EQ', GT_GT_EQ: 'GT_GT_EQ',
  PLUS_PLUS: 'PLUS_PLUS', MINUS_MINUS: 'MINUS_MINUS',
  ARROW: 'ARROW', QUESTION: 'QUESTION',

  // Delimiters
  LPAREN: 'LPAREN', RPAREN: 'RPAREN', LBRACE: 'LBRACE', RBRACE: 'RBRACE',
  LBRACKET: 'LBRACKET', RBRACKET: 'RBRACKET',
  SEMICOLON: 'SEMICOLON', COMMA: 'COMMA', DOT: 'DOT', DOT_DOT: 'DOT_DOT',
  ELLIPSIS: 'ELLIPSIS',
  COLON: 'COLON', COLON_COLON: 'COLON_COLON',

  // LPC special
  ARRAY_OPEN: 'ARRAY_OPEN', ARRAY_CLOSE: 'ARRAY_CLOSE',
  MAPPING_OPEN: 'MAPPING_OPEN', MAPPING_CLOSE: 'MAPPING_CLOSE',
  FP_OPEN: 'FP_OPEN', FP_CLOSE: 'FP_CLOSE',

  // Control
  EOF: 'EOF',
};

const KEYWORDS = {
  'if': T.IF, 'else': T.ELSE, 'while': T.WHILE, 'do': T.DO, 'for': T.FOR,
  'foreach': T.FOREACH, 'in': T.IN,
  'switch': T.SWITCH, 'case': T.CASE, 'default': T.DEFAULT,
  'return': T.RETURN, 'break': T.BREAK, 'continue': T.CONTINUE,
  'inherit': T.INHERIT, 'class': T.CLASS,
  'private': T.PRIVATE, 'protected': T.PROTECTED, 'public': T.PUBLIC,
  'static': T.STATIC, 'nomask': T.NOMASK, 'nosave': T.NOSAVE,
  'varargs': T.VARARGS,
  'int': T.TYPE_INT, 'string': T.TYPE_STRING, 'float': T.TYPE_FLOAT,
  'object': T.TYPE_OBJECT, 'mapping': T.TYPE_MAPPING,
  'mixed': T.TYPE_MIXED, 'void': T.TYPE_VOID, 'buffer': T.TYPE_BUFFER,
  'function': T.TYPE_FUNCTION, 'status': T.TYPE_STATUS,
};

const ESCAPE = { 'n': '\n', 't': '\t', 'r': '\r', '\\': '\\', '"': '"', '0': '\0' };

function token(type, value, line, file) {
  return { type, value, line, file };
}

export function tokenize(source, file = '<input>') {
  const tokens = [];
  let pos = 0;
  let line = 1;

  function ch() { return source[pos]; }
  function peek(offset = 1) { return source[pos + offset]; }
  function advance() { const c = source[pos++]; if (c === '\n') line++; return c; }
  function match(expected) { if (source[pos] === expected) { advance(); return true; } return false; }
  function at(s) { return source.startsWith(s, pos); }

  while (pos < source.length) {
    // Whitespace
    if (ch() === ' ' || ch() === '\t' || ch() === '\r' || ch() === '\n') {
      advance();
      continue;
    }

    // Single-line comment
    if (at('//')) {
      while (pos < source.length && ch() !== '\n') advance();
      continue;
    }

    // Block comment
    if (at('/*')) {
      advance(); advance();
      while (pos < source.length && !at('*/')) advance();
      if (pos < source.length) { advance(); advance(); }
      continue;
    }

    const startLine = line;

    // String literal
    if (ch() === '"') {
      advance();
      let str = '';
      while (pos < source.length && ch() !== '"') {
        if (ch() === '\\') {
          advance();
          str += ESCAPE[ch()] ?? ch();
          advance();
        } else {
          str += advance();
        }
      }
      if (pos < source.length) advance(); // closing "
      tokens.push(token(T.STRING_LIT, str, startLine, file));
      continue;
    }

    // Heredoc: @TAG\n...content...\nTAG
    if (ch() === '@' && peek() !== undefined && /[A-Za-z_]/.test(peek())) {
      advance(); // skip @
      let tag = '';
      while (pos < source.length && /[A-Za-z_0-9]/.test(ch())) tag += advance();
      // Skip to next line
      while (pos < source.length && ch() !== '\n') advance();
      if (pos < source.length) advance(); // skip \n
      // Read until TAG appears at start of line
      let content = '';
      while (pos < source.length) {
        if (source.startsWith(tag, pos)) {
          pos += tag.length;
          break;
        }
        content += advance();
      }
      tokens.push(token(T.STRING_LIT, content, startLine, file));
      continue;
    }

    // Lambda parameter: $1, $2, etc.
    if (ch() === '$' && peek() >= '0' && peek() <= '9') {
      advance(); // skip $
      let num = '';
      while (pos < source.length && ch() >= '0' && ch() <= '9') num += advance();
      tokens.push(token(T.IDENT, '$' + num, startLine, file));
      continue;
    }

    // Number literal (int or float)
    if (ch() >= '0' && ch() <= '9') {
      let num = '';
      if (ch() === '0' && (peek() === 'x' || peek() === 'X')) {
        num += advance(); num += advance(); // 0x
        while (pos < source.length && /[0-9a-fA-F]/.test(ch())) num += advance();
        tokens.push(token(T.INT_LIT, parseInt(num, 16), startLine, file));
      } else {
        while (pos < source.length && ch() >= '0' && ch() <= '9') num += advance();
        if (ch() === '.' && peek() !== '.') {
          num += advance(); // .
          while (pos < source.length && ch() >= '0' && ch() <= '9') num += advance();
          tokens.push(token(T.FLOAT_LIT, parseFloat(num), startLine, file));
        } else {
          tokens.push(token(T.INT_LIT, parseInt(num, 10), startLine, file));
        }
      }
      continue;
    }

    // Identifier or keyword
    if ((ch() >= 'a' && ch() <= 'z') || (ch() >= 'A' && ch() <= 'Z') || ch() === '_') {
      let ident = '';
      while (pos < source.length && ((ch() >= 'a' && ch() <= 'z') || (ch() >= 'A' && ch() <= 'Z') || (ch() >= '0' && ch() <= '9') || ch() === '_')) {
        ident += advance();
      }
      const kw = KEYWORDS[ident];
      tokens.push(token(kw ?? T.IDENT, ident, startLine, file));
      continue;
    }

    // Two-char and LPC special tokens starting with (
    if (ch() === '(') {
      if (peek() === '{') { advance(); advance(); tokens.push(token(T.ARRAY_OPEN, '({', startLine, file)); continue; }
      if (peek() === '[') { advance(); advance(); tokens.push(token(T.MAPPING_OPEN, '([', startLine, file)); continue; }
      if (peek() === ':') { advance(); advance(); tokens.push(token(T.FP_OPEN, '(:', startLine, file)); continue; }
      advance(); tokens.push(token(T.LPAREN, '(', startLine, file)); continue;
    }

    // Closing LPC specials
    if (ch() === '}' && peek() === ')') { advance(); advance(); tokens.push(token(T.ARRAY_CLOSE, '})', startLine, file)); continue; }
    if (ch() === ']' && peek() === ')') { advance(); advance(); tokens.push(token(T.MAPPING_CLOSE, '])', startLine, file)); continue; }
    if (ch() === ':' && peek() === ')') { advance(); advance(); tokens.push(token(T.FP_CLOSE, ':)', startLine, file)); continue; }

    // Operators and delimiters
    const c = advance();
    switch (c) {
      case ')': tokens.push(token(T.RPAREN, ')', startLine, file)); break;
      case '{': tokens.push(token(T.LBRACE, '{', startLine, file)); break;
      case '}': tokens.push(token(T.RBRACE, '}', startLine, file)); break;
      case '[': tokens.push(token(T.LBRACKET, '[', startLine, file)); break;
      case ']': tokens.push(token(T.RBRACKET, ']', startLine, file)); break;
      case ';': tokens.push(token(T.SEMICOLON, ';', startLine, file)); break;
      case ',': tokens.push(token(T.COMMA, ',', startLine, file)); break;
      case '~': tokens.push(token(T.TILDE, '~', startLine, file)); break;
      case '?': tokens.push(token(T.QUESTION, '?', startLine, file)); break;

      case '.':
        if (match('.')) {
          if (match('.')) { tokens.push(token(T.ELLIPSIS, '...', startLine, file)); }
          else { tokens.push(token(T.DOT_DOT, '..', startLine, file)); }
        } else { tokens.push(token(T.DOT, '.', startLine, file)); }
        break;

      case ':':
        if (match(':')) { tokens.push(token(T.COLON_COLON, '::', startLine, file)); }
        else { tokens.push(token(T.COLON, ':', startLine, file)); }
        break;

      case '+':
        if (match('+')) { tokens.push(token(T.PLUS_PLUS, '++', startLine, file)); }
        else if (match('=')) { tokens.push(token(T.PLUS_EQ, '+=', startLine, file)); }
        else { tokens.push(token(T.PLUS, '+', startLine, file)); }
        break;

      case '-':
        if (match('-')) { tokens.push(token(T.MINUS_MINUS, '--', startLine, file)); }
        else if (match('=')) { tokens.push(token(T.MINUS_EQ, '-=', startLine, file)); }
        else if (match('>')) { tokens.push(token(T.ARROW, '->', startLine, file)); }
        else { tokens.push(token(T.MINUS, '-', startLine, file)); }
        break;

      case '*':
        if (match('=')) { tokens.push(token(T.STAR_EQ, '*=', startLine, file)); }
        else { tokens.push(token(T.STAR, '*', startLine, file)); }
        break;

      case '/':
        if (match('=')) { tokens.push(token(T.SLASH_EQ, '/=', startLine, file)); }
        else { tokens.push(token(T.SLASH, '/', startLine, file)); }
        break;

      case '%':
        if (match('=')) { tokens.push(token(T.PERCENT_EQ, '%=', startLine, file)); }
        else { tokens.push(token(T.PERCENT, '%', startLine, file)); }
        break;

      case '=':
        if (match('=')) { tokens.push(token(T.EQ_EQ, '==', startLine, file)); }
        else { tokens.push(token(T.EQ, '=', startLine, file)); }
        break;

      case '!':
        if (match('=')) { tokens.push(token(T.BANG_EQ, '!=', startLine, file)); }
        else { tokens.push(token(T.BANG, '!', startLine, file)); }
        break;

      case '<':
        if (match('<')) {
          if (match('=')) { tokens.push(token(T.LT_LT_EQ, '<<=', startLine, file)); }
          else { tokens.push(token(T.LT_LT, '<<', startLine, file)); }
        }
        else if (match('=')) { tokens.push(token(T.LT_EQ, '<=', startLine, file)); }
        else { tokens.push(token(T.LT, '<', startLine, file)); }
        break;

      case '>':
        if (match('>')) {
          if (match('=')) { tokens.push(token(T.GT_GT_EQ, '>>=', startLine, file)); }
          else { tokens.push(token(T.GT_GT, '>>', startLine, file)); }
        }
        else if (match('=')) { tokens.push(token(T.GT_EQ, '>=', startLine, file)); }
        else { tokens.push(token(T.GT, '>', startLine, file)); }
        break;

      case '&':
        if (match('&')) { tokens.push(token(T.AMP_AMP, '&&', startLine, file)); }
        else if (match('=')) { tokens.push(token(T.AMP_EQ, '&=', startLine, file)); }
        else { tokens.push(token(T.AMP, '&', startLine, file)); }
        break;

      case '|':
        if (match('|')) { tokens.push(token(T.PIPE_PIPE, '||', startLine, file)); }
        else if (match('=')) { tokens.push(token(T.PIPE_EQ, '|=', startLine, file)); }
        else { tokens.push(token(T.PIPE, '|', startLine, file)); }
        break;

      case '^':
        if (match('=')) { tokens.push(token(T.CARET_EQ, '^=', startLine, file)); }
        else { tokens.push(token(T.CARET, '^', startLine, file)); }
        break;

      default:
        throw new Error(`Unexpected character '${c}' at ${file}:${startLine}`);
    }
  }

  tokens.push(token(T.EOF, null, line, file));
  return tokens;
}
