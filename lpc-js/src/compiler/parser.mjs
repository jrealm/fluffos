import { tokenize, T } from './lexer.mjs';
import * as AST from './ast.mjs';

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }

  peek() { return this.tokens[this.pos]; }
  advance() { return this.tokens[this.pos++]; }

  at(type) { return this.peek().type === type; }

  expect(type) {
    const tok = this.advance();
    if (tok.type !== type) {
      throw new Error(`Expected ${type} but got ${tok.type} ('${tok.value}') at ${tok.file}:${tok.line}`);
    }
    return tok;
  }

  match(type) {
    if (this.at(type)) { this.advance(); return true; }
    return false;
  }

  // ---- Top-Level ----

  parseProgram() {
    const body = [];
    while (!this.at(T.EOF)) {
      body.push(this.parseTopLevel());
    }
    return AST.program(body, 1);
  }

  parseTopLevel() {
    if (this.at(T.INHERIT)) {
      return this.parseInherit();
    }
    let flags = 0;
    while (this.isModifier()) {
      this.advance();
    }
    const typeTok = this.parseTypeName();
    let typeName = typeTok;
    if (this.match(T.STAR)) {
      typeName = typeName + '*';
    }
    const name = this.expect(T.IDENT).value;
    if (this.at(T.LPAREN)) {
      return this.parseFunctionDecl(typeName, name, flags);
    } else {
      return this.parseGlobalVarDecl(typeName, name, flags);
    }
  }

  isModifier() {
    const t = this.peek().type;
    return t === T.PRIVATE || t === T.PROTECTED || t === T.PUBLIC ||
           t === T.STATIC || t === T.NOMASK || t === T.NOSAVE || t === T.VARARGS;
  }

  isType() {
    const t = this.peek().type;
    return t === T.TYPE_INT || t === T.TYPE_STRING || t === T.TYPE_FLOAT ||
           t === T.TYPE_OBJECT || t === T.TYPE_MAPPING || t === T.TYPE_MIXED ||
           t === T.TYPE_VOID || t === T.TYPE_BUFFER || t === T.TYPE_FUNCTION ||
           t === T.TYPE_STATUS;
  }

  parseTypeName() {
    const tok = this.advance();
    return tok.value;
  }

  parseInherit() {
    const line = this.peek().line;
    this.expect(T.INHERIT);
    const path = this.expect(T.STRING_LIT).value;
    this.expect(T.SEMICOLON);
    return AST.inheritDecl(path, 0, line);
  }

  parseFunctionDecl(returnType, name, flags) {
    const line = this.peek().line;
    this.expect(T.LPAREN);
    const params = this.parseParamList();
    this.expect(T.RPAREN);
    if (this.match(T.SEMICOLON)) {
      return AST.functionDecl(name, returnType, params, null, flags, line);
    }
    const body = this.parseBlock();
    return AST.functionDecl(name, returnType, params, body, flags, line);
  }

  parseParamList() {
    const params = [];
    if (this.at(T.RPAREN) || this.at(T.TYPE_VOID)) {
      if (this.at(T.TYPE_VOID)) this.advance();
      return params;
    }
    do {
      if (this.at(T.ELLIPSIS)) {
        this.advance();
        params.push({ typeName: '...', name: null });
        break;
      }
      let typeName = this.parseTypeName();
      if (this.match(T.STAR)) typeName += '*';
      if (this.at(T.ELLIPSIS)) {
        this.advance();
        params.push({ typeName: typeName + '...', name: null });
        break;
      }
      const name = this.expect(T.IDENT).value;
      params.push({ typeName, name });
    } while (this.match(T.COMMA));
    return params;
  }

  parseGlobalVarDecl(typeName, name, flags) {
    const line = this.peek().line;
    let init = null;
    if (this.match(T.EQ)) {
      init = this.parseExpression();
    }
    this.expect(T.SEMICOLON);
    return AST.varDecl(typeName, name, init, flags, line);
  }

  // ---- Statements ----

  parseBlock() {
    const line = this.peek().line;
    this.expect(T.LBRACE);
    const stmts = [];
    while (!this.at(T.RBRACE) && !this.at(T.EOF)) {
      stmts.push(this.parseStatement());
    }
    this.expect(T.RBRACE);
    return AST.block(stmts, line);
  }

  parseStatement() {
    const tok = this.peek();

    if (tok.type === T.LBRACE) return this.parseBlock();
    if (tok.type === T.IF) return this.parseIf();
    if (tok.type === T.WHILE) return this.parseWhile();
    if (tok.type === T.DO) return this.parseDoWhile();
    if (tok.type === T.FOR) return this.parseFor();
    if (tok.type === T.FOREACH) return this.parseForeach();
    if (tok.type === T.SWITCH) return this.parseSwitch();
    if (tok.type === T.RETURN) return this.parseReturn();
    if (tok.type === T.BREAK) { this.advance(); this.expect(T.SEMICOLON); return AST.breakStatement(tok.line); }
    if (tok.type === T.CONTINUE) { this.advance(); this.expect(T.SEMICOLON); return AST.continueStatement(tok.line); }

    if (this.isType()) {
      return this.parseLocalVarDecl();
    }

    const expr = this.parseExpression();
    this.expect(T.SEMICOLON);
    return AST.expressionStatement(expr, tok.line);
  }

  parseLocalVarDecl() {
    const line = this.peek().line;
    let typeName = this.parseTypeName();
    if (this.match(T.STAR)) typeName += '*';
    const name = this.expect(T.IDENT).value;
    let init = null;
    if (this.match(T.EQ)) {
      init = this.parseExpression();
    }
    this.expect(T.SEMICOLON);
    return AST.varDecl(typeName, name, init, 0, line);
  }

  parseIf() {
    const line = this.peek().line;
    this.expect(T.IF);
    this.expect(T.LPAREN);
    const cond = this.parseExpression();
    this.expect(T.RPAREN);
    const consequent = this.parseStatement();
    let alternate = null;
    if (this.match(T.ELSE)) {
      alternate = this.parseStatement();
    }
    return AST.ifStatement(cond, consequent, alternate, line);
  }

  parseWhile() {
    const line = this.peek().line;
    this.expect(T.WHILE);
    this.expect(T.LPAREN);
    const cond = this.parseExpression();
    this.expect(T.RPAREN);
    const body = this.parseStatement();
    return AST.whileStatement(cond, body, line);
  }

  parseDoWhile() {
    const line = this.peek().line;
    this.expect(T.DO);
    const body = this.parseStatement();
    this.expect(T.WHILE);
    this.expect(T.LPAREN);
    const cond = this.parseExpression();
    this.expect(T.RPAREN);
    this.expect(T.SEMICOLON);
    return AST.doWhileStatement(cond, body, line);
  }

  parseFor() {
    const line = this.peek().line;
    this.expect(T.FOR);
    this.expect(T.LPAREN);
    let init = null;
    if (!this.at(T.SEMICOLON)) {
      if (this.isType()) {
        const typeName = this.parseTypeName();
        const name = this.expect(T.IDENT).value;
        let varInit = null;
        if (this.match(T.EQ)) varInit = this.parseExpression();
        init = AST.varDecl(typeName, name, varInit, 0, line);
      } else {
        init = this.parseExpression();
      }
    }
    this.expect(T.SEMICOLON);
    let cond = null;
    if (!this.at(T.SEMICOLON)) cond = this.parseExpression();
    this.expect(T.SEMICOLON);
    let update = null;
    if (!this.at(T.RPAREN)) update = this.parseExpression();
    this.expect(T.RPAREN);
    const body = this.parseStatement();
    return AST.forStatement(init, cond, update, body, line);
  }

  parseForeach() {
    const line = this.peek().line;
    this.expect(T.FOREACH);
    this.expect(T.LPAREN);
    let varType = this.parseTypeName();
    const varName = this.expect(T.IDENT).value;
    this.expect(T.IN);
    const expr = this.parseExpression();
    this.expect(T.RPAREN);
    const body = this.parseStatement();
    return AST.foreachStatement(varType, varName, expr, body, line);
  }

  parseSwitch() {
    const line = this.peek().line;
    this.expect(T.SWITCH);
    this.expect(T.LPAREN);
    const disc = this.parseExpression();
    this.expect(T.RPAREN);
    this.expect(T.LBRACE);
    const cases = [];
    while (!this.at(T.RBRACE) && !this.at(T.EOF)) {
      if (this.match(T.CASE)) {
        const test = this.parseExpression();
        this.expect(T.COLON);
        const body = [];
        while (!this.at(T.CASE) && !this.at(T.DEFAULT) && !this.at(T.RBRACE) && !this.at(T.EOF)) {
          body.push(this.parseStatement());
        }
        cases.push(AST.switchCase(test, body, test.line));
      } else if (this.match(T.DEFAULT)) {
        this.expect(T.COLON);
        const body = [];
        while (!this.at(T.CASE) && !this.at(T.DEFAULT) && !this.at(T.RBRACE) && !this.at(T.EOF)) {
          body.push(this.parseStatement());
        }
        cases.push(AST.switchCase(null, body, line));
      }
    }
    this.expect(T.RBRACE);
    return AST.switchStatement(disc, cases, line);
  }

  parseReturn() {
    const line = this.peek().line;
    this.expect(T.RETURN);
    if (this.match(T.SEMICOLON)) {
      return AST.returnStatement(null, line);
    }
    const value = this.parseExpression();
    this.expect(T.SEMICOLON);
    return AST.returnStatement(value, line);
  }

  // ---- Expressions (precedence climbing) ----

  parseExpression() {
    return this.parseAssignment();
  }

  parseAssignment() {
    const left = this.parseTernary();
    if (this.at(T.EQ) || this.at(T.PLUS_EQ) || this.at(T.MINUS_EQ) ||
        this.at(T.STAR_EQ) || this.at(T.SLASH_EQ) || this.at(T.PERCENT_EQ) ||
        this.at(T.AMP_EQ) || this.at(T.PIPE_EQ) || this.at(T.CARET_EQ) ||
        this.at(T.LT_LT_EQ) || this.at(T.GT_GT_EQ)) {
      const op = this.advance();
      const right = this.parseAssignment();
      return AST.assignExpr(op.value, left, right, op.line);
    }
    return left;
  }

  parseTernary() {
    let expr = this.parseLogicalOr();
    if (this.match(T.QUESTION)) {
      const consequent = this.parseAssignment();
      this.expect(T.COLON);
      const alternate = this.parseAssignment();
      return AST.ternaryExpr(expr, consequent, alternate, expr.line);
    }
    return expr;
  }

  parseLogicalOr() {
    let left = this.parseLogicalAnd();
    while (this.match(T.PIPE_PIPE)) {
      const right = this.parseLogicalAnd();
      left = AST.binaryExpr('||', left, right, left.line);
    }
    return left;
  }

  parseLogicalAnd() {
    let left = this.parseBitwiseOr();
    while (this.match(T.AMP_AMP)) {
      const right = this.parseBitwiseOr();
      left = AST.binaryExpr('&&', left, right, left.line);
    }
    return left;
  }

  parseBitwiseOr() {
    let left = this.parseBitwiseXor();
    while (this.match(T.PIPE)) {
      const right = this.parseBitwiseXor();
      left = AST.binaryExpr('|', left, right, left.line);
    }
    return left;
  }

  parseBitwiseXor() {
    let left = this.parseBitwiseAnd();
    while (this.match(T.CARET)) {
      const right = this.parseBitwiseAnd();
      left = AST.binaryExpr('^', left, right, left.line);
    }
    return left;
  }

  parseBitwiseAnd() {
    let left = this.parseEquality();
    while (this.match(T.AMP)) {
      const right = this.parseEquality();
      left = AST.binaryExpr('&', left, right, left.line);
    }
    return left;
  }

  parseEquality() {
    let left = this.parseComparison();
    while (this.at(T.EQ_EQ) || this.at(T.BANG_EQ)) {
      const op = this.advance();
      const right = this.parseComparison();
      left = AST.binaryExpr(op.value, left, right, left.line);
    }
    return left;
  }

  parseComparison() {
    let left = this.parseShift();
    while (this.at(T.LT) || this.at(T.LT_EQ) || this.at(T.GT) || this.at(T.GT_EQ)) {
      const op = this.advance();
      const right = this.parseShift();
      left = AST.binaryExpr(op.value, left, right, left.line);
    }
    return left;
  }

  parseShift() {
    let left = this.parseAdditive();
    while (this.at(T.LT_LT) || this.at(T.GT_GT)) {
      const op = this.advance();
      const right = this.parseAdditive();
      left = AST.binaryExpr(op.value, left, right, left.line);
    }
    return left;
  }

  parseAdditive() {
    let left = this.parseMultiplicative();
    while (this.at(T.PLUS) || this.at(T.MINUS)) {
      const op = this.advance();
      const right = this.parseMultiplicative();
      left = AST.binaryExpr(op.value, left, right, left.line);
    }
    return left;
  }

  parseMultiplicative() {
    let left = this.parseUnary();
    while (this.at(T.STAR) || this.at(T.SLASH) || this.at(T.PERCENT)) {
      const op = this.advance();
      const right = this.parseUnary();
      left = AST.binaryExpr(op.value, left, right, left.line);
    }
    return left;
  }

  parseUnary() {
    if (this.at(T.MINUS) || this.at(T.BANG) || this.at(T.TILDE)) {
      const op = this.advance();
      const operand = this.parseUnary();
      return AST.unaryExpr(op.value, operand, true, op.line);
    }
    if (this.at(T.PLUS_PLUS) || this.at(T.MINUS_MINUS)) {
      const op = this.advance();
      const operand = this.parsePostfix();
      return AST.updateExpr(op.value, operand, true, op.line);
    }
    return this.parsePostfix();
  }

  parsePostfix() {
    let expr = this.parsePrimary();
    while (true) {
      if (this.at(T.LBRACKET)) {
        this.advance();
        const index = this.parseExpression();
        if (this.match(T.DOT_DOT)) {
          const to = this.parseExpression();
          this.expect(T.RBRACKET);
          expr = AST.rangeExpr(expr, index, to, expr.line);
        } else {
          this.expect(T.RBRACKET);
          expr = AST.indexExpr(expr, index, expr.line);
        }
      } else if (this.at(T.ARROW)) {
        this.advance();
        const method = this.expect(T.IDENT).value;
        this.expect(T.LPAREN);
        const args = this.parseArgList();
        this.expect(T.RPAREN);
        expr = AST.callOther(expr, method, args, expr.line);
      } else if (this.at(T.PLUS_PLUS) || this.at(T.MINUS_MINUS)) {
        const op = this.advance();
        expr = AST.updateExpr(op.value, expr, false, op.line);
      } else {
        break;
      }
    }
    return expr;
  }

  parsePrimary() {
    const tok = this.peek();

    if (tok.type === T.INT_LIT) {
      this.advance();
      return AST.intLiteral(tok.value, tok.line);
    }

    if (tok.type === T.FLOAT_LIT) {
      this.advance();
      return AST.floatLiteral(tok.value, tok.line);
    }

    if (tok.type === T.STRING_LIT) {
      this.advance();
      return AST.stringLiteral(tok.value, tok.line);
    }

    if (tok.type === T.ARRAY_OPEN) {
      this.advance();
      const elements = [];
      if (!this.at(T.ARRAY_CLOSE)) {
        do { elements.push(this.parseExpression()); } while (this.match(T.COMMA));
      }
      this.expect(T.ARRAY_CLOSE);
      return AST.arrayLiteral(elements, tok.line);
    }

    if (tok.type === T.MAPPING_OPEN) {
      this.advance();
      const entries = [];
      if (!this.at(T.MAPPING_CLOSE)) {
        do {
          const key = this.parseExpression();
          this.expect(T.COLON);
          const value = this.parseExpression();
          entries.push({ key, value });
        } while (this.match(T.COMMA));
      }
      this.expect(T.MAPPING_CLOSE);
      return AST.mappingLiteral(entries, tok.line);
    }

    if (tok.type === T.LPAREN) {
      this.advance();
      const expr = this.parseExpression();
      this.expect(T.RPAREN);
      return expr;
    }

    if (tok.type === T.IDENT) {
      this.advance();
      if (this.at(T.LPAREN)) {
        this.advance();
        const args = this.parseArgList();
        this.expect(T.RPAREN);
        return AST.callExpr(tok.value, args, tok.line);
      }
      return AST.identifier(tok.value, tok.line);
    }

    throw new Error(`Unexpected token ${tok.type} ('${tok.value}') at ${tok.file}:${tok.line}`);
  }

  parseArgList() {
    const args = [];
    if (this.at(T.RPAREN)) return args;
    do { args.push(this.parseExpression()); } while (this.match(T.COMMA));
    return args;
  }
}

export function parse(source, file = '<input>') {
  const tokens = tokenize(source, file);
  const parser = new Parser(tokens);
  return parser.parseProgram();
}
