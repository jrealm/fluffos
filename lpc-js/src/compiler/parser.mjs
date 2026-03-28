import { tokenize, T } from './lexer.mjs';
import * as AST from './ast.mjs';

const MOD_PRIVATE = 0x01;
const MOD_PROTECTED = 0x02;
const MOD_PUBLIC = 0x04;
const MOD_STATIC = 0x08;
const MOD_NOMASK = 0x10;
const MOD_NOSAVE = 0x20;
const MOD_VARARGS = 0x40;

const MOD_MAP = {
  [T.PRIVATE]: MOD_PRIVATE,
  [T.PROTECTED]: MOD_PROTECTED,
  [T.PUBLIC]: MOD_PUBLIC,
  [T.STATIC]: MOD_STATIC,
  [T.NOMASK]: MOD_NOMASK,
  [T.NOSAVE]: MOD_NOSAVE,
  [T.VARARGS]: MOD_VARARGS,
};

export { MOD_PRIVATE, MOD_PROTECTED, MOD_PUBLIC, MOD_STATIC, MOD_NOMASK, MOD_NOSAVE, MOD_VARARGS };

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

  // Expect identifier or type keyword used as name (LPC allows type keywords as var/param names)
  expectName() {
    const tok = this.peek();
    if (tok.type === T.IDENT || tok.type === T.TYPE_STATUS) {
      return this.advance();
    }
    return this.expect(T.IDENT); // will throw
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
    // Class declaration: class name { ... }
    if (this.at(T.CLASS) && this.tokens[this.pos + 1]?.type === T.IDENT &&
        this.tokens[this.pos + 2]?.type === T.LBRACE) {
      return this.parseClassDecl();
    }
    let flags = 0;
    while (this.isModifier()) {
      flags |= MOD_MAP[this.advance().type];
    }
    const typeTok = this.parseTypeName();
    let typeName = typeTok;
    if (this.match(T.STAR)) {
      typeName = typeName + '*';
    }
    const name = this.expectName().value;
    if (this.at(T.LPAREN)) {
      return this.parseFunctionDecl(typeName, name, flags);
    } else {
      return this.parseGlobalVarDecl(typeName, name, flags);
    }
  }

  parseClassDecl() {
    const line = this.peek().line;
    this.expect(T.CLASS);
    const name = this.expect(T.IDENT).value;
    this.expect(T.LBRACE);
    const members = [];
    while (!this.at(T.RBRACE) && !this.at(T.EOF)) {
      let typeName = this.parseTypeName();
      if (this.match(T.STAR)) typeName += '*';
      const memberName = this.expect(T.IDENT).value;
      this.expect(T.SEMICOLON);
      members.push({ typeName, name: memberName });
    }
    this.expect(T.RBRACE);
    return AST.classDecl(name, members, line);
  }

  isModifier() {
    const t = this.peek().type;
    return t === T.PRIVATE || t === T.PROTECTED || t === T.PUBLIC ||
           t === T.STATIC || t === T.NOMASK || t === T.NOSAVE || t === T.VARARGS;
  }

  isType() {
    const t = this.peek().type;
    if (t === T.CLASS) return true;
    return t === T.TYPE_INT || t === T.TYPE_STRING || t === T.TYPE_FLOAT ||
           t === T.TYPE_OBJECT || t === T.TYPE_MAPPING || t === T.TYPE_MIXED ||
           t === T.TYPE_VOID || t === T.TYPE_BUFFER || t === T.TYPE_FUNCTION ||
           t === T.TYPE_STATUS;
  }

  parseTypeName() {
    if (this.at(T.CLASS)) {
      this.advance(); // skip 'class'
      const className = this.expect(T.IDENT).value;
      return 'class ' + className;
    }
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
      // Parameter name is optional in prototypes (e.g., void foo(string);)
      // Also allow type keywords as parameter names (e.g., string status)
      let name;
      if (this.at(T.IDENT)) {
        name = this.advance().value;
      } else if (this.isType() && !this.at(T.TYPE_VOID)) {
        // Type keyword used as variable name (e.g., "string status" where status is a param name)
        name = this.advance().value;
      } else {
        name = `_arg${params.length}`;
      }
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

    // Multi-global: int a, b, c;
    if (this.at(T.COMMA)) {
      const decls = [AST.varDecl(typeName, name, init, flags, line)];
      while (this.match(T.COMMA)) {
        let vType = typeName;
        if (this.match(T.STAR)) vType += '*';
        const vName = this.expectName().value;
        let vInit = null;
        if (this.match(T.EQ)) vInit = this.parseExpression();
        decls.push(AST.varDecl(vType, vName, vInit, flags, line));
      }
      this.expect(T.SEMICOLON);
      return AST.block(decls, line);
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

    // Empty statement: ;
    if (tok.type === T.SEMICOLON) {
      this.advance();
      return AST.expressionStatement(AST.intLiteral(0, tok.line), tok.line);
    }

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
    if (tok.type === T.THROW) {
      this.advance();
      this.expect(T.LPAREN);
      const expr = this.parseExpression();
      this.expect(T.RPAREN);
      this.expect(T.SEMICOLON);
      return AST.throwStatement(expr, tok.line);
    }

    if (this.isType()) {
      // Lookahead: type keyword followed by IDENT or * means variable declaration.
      // type keyword followed by = or ( means it's used as variable name (expression).
      const next = this.tokens[this.pos + 1];
      if (next && (next.type === T.IDENT || next.type === T.STAR ||
                   next.type === T.TYPE_STATUS || next.type === T.TYPE_INT ||
                   next.type === T.TYPE_STRING || next.type === T.TYPE_FLOAT ||
                   next.type === T.TYPE_OBJECT || next.type === T.TYPE_MAPPING ||
                   next.type === T.TYPE_MIXED || next.type === T.TYPE_FUNCTION)) {
        return this.parseLocalVarDecl();
      }
      // Otherwise treat as expression (variable name)
    }

    const expr = this.parseExpression();
    this.expect(T.SEMICOLON);
    return AST.expressionStatement(expr, tok.line);
  }

  parseLocalVarDecl() {
    const line = this.peek().line;
    let typeName = this.parseTypeName();
    if (this.match(T.STAR)) typeName += '*';
    const name = this.expectName().value;
    let init = null;
    if (this.match(T.EQ)) {
      init = this.parseExpression();
    }

    // Support multi-var: int a, b = 1, c;
    if (this.at(T.COMMA)) {
      const decls = [AST.varDecl(typeName, name, init, 0, line)];
      while (this.match(T.COMMA)) {
        let vType = typeName;
        if (this.match(T.STAR)) vType += '*';
        const vName = this.expectName().value;
        let vInit = null;
        if (this.match(T.EQ)) {
          vInit = this.parseExpression();
        }
        decls.push(AST.varDecl(vType, vName, vInit, 0, line));
      }
      this.expect(T.SEMICOLON);
      return AST.block(decls, line);
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

  parseCommaExpression() {
    let expr = this.parseExpression();
    while (this.match(T.COMMA)) {
      const right = this.parseExpression();
      expr = AST.binaryExpr(',', expr, right, expr.line);
    }
    return expr;
  }

  parseFor() {
    const line = this.peek().line;
    this.expect(T.FOR);
    this.expect(T.LPAREN);
    let init = null;
    if (!this.at(T.SEMICOLON)) {
      if (this.isType()) {
        let typeName = this.parseTypeName();
        if (this.match(T.STAR)) typeName += '*';
        const name = this.expectName().value;
        let varInit = null;
        if (this.match(T.EQ)) varInit = this.parseExpression();
        // Support: for (int i = 0, j = 0; ...)
        if (this.at(T.COMMA)) {
          const decls = [AST.varDecl(typeName, name, varInit, 0, line)];
          while (this.match(T.COMMA)) {
            const vName = this.expectName().value;
            let vInit = null;
            if (this.match(T.EQ)) vInit = this.parseExpression();
            decls.push(AST.varDecl(typeName, vName, vInit, 0, line));
          }
          init = AST.block(decls, line);
        } else {
          init = AST.varDecl(typeName, name, varInit, 0, line);
        }
      } else {
        init = this.parseCommaExpression();
      }
    }
    this.expect(T.SEMICOLON);
    let cond = null;
    if (!this.at(T.SEMICOLON)) cond = this.parseExpression();
    this.expect(T.SEMICOLON);
    let update = null;
    if (!this.at(T.RPAREN)) update = this.parseCommaExpression();
    this.expect(T.RPAREN);
    const body = this.parseStatement();
    return AST.forStatement(init, cond, update, body, line);
  }

  parseForeach() {
    const line = this.peek().line;
    this.expect(T.FOREACH);
    this.expect(T.LPAREN);

    const vars = [];

    // Check if first token is a type or just a variable name
    // If IDENT followed by IN → no type declaration (variable already declared)
    // If IDENT followed by IDENT → type + name
    // If type keyword followed by IDENT → type + name
    if (this.at(T.IDENT) && this.tokens[this.pos + 1]?.type === T.IN) {
      // No type: foreach (var in expr)
      const varName = this.advance().value;
      vars.push({ typeName: 'mixed', name: varName });
    } else if (this.at(T.IDENT) && this.tokens[this.pos + 1]?.type === T.COMMA &&
               this.tokens[this.pos + 3]?.type === T.IN) {
      // foreach (key, value in expr) — no types
      const key = this.advance().value;
      vars.push({ typeName: 'mixed', name: key });
      this.expect(T.COMMA);
      const val = this.expectName().value;
      vars.push({ typeName: 'mixed', name: val });
    } else {
      // With types: foreach (type var in expr)
      let typeName = this.parseTypeName();
      if (this.match(T.STAR)) typeName += '*';
      let varName = this.expectName().value;
      vars.push({ typeName, name: varName });

      if (this.match(T.COMMA)) {
        let typeName2 = this.parseTypeName();
        if (this.match(T.STAR)) typeName2 += '*';
        let varName2 = this.expectName().value;
        vars.push({ typeName: typeName2, name: varName2 });
      }
    }

    this.expect(T.IN);
    const expr = this.parseExpression();
    this.expect(T.RPAREN);
    const body = this.parseStatement();
    return AST.foreachStatement(vars, expr, body, line);
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
        // Case range: case expr1 .. expr2:
        if (this.match(T.DOT_DOT)) {
          const test2 = this.parseExpression();
          this.expect(T.COLON);
          const body = [];
          while (!this.at(T.CASE) && !this.at(T.DEFAULT) && !this.at(T.RBRACE) && !this.at(T.EOF)) {
            body.push(this.parseStatement());
          }
          // Expand range into individual cases — body only on the last one
          if (test.type === 'IntLiteral' && test2.type === 'IntLiteral') {
            for (let v = test.value; v < test2.value; v++) {
              cases.push(AST.switchCase(AST.intLiteral(v, test.line), [], test.line));
            }
            cases.push(AST.switchCase(AST.intLiteral(test2.value, test.line), body, test.line));
          } else {
            // Non-int range — just emit first and last with body on last
            cases.push(AST.switchCase(test, [], test.line));
            cases.push(AST.switchCase(test2, body, test.line));
          }
        } else {
          this.expect(T.COLON);
          const body = [];
          while (!this.at(T.CASE) && !this.at(T.DEFAULT) && !this.at(T.RBRACE) && !this.at(T.EOF)) {
            body.push(this.parseStatement());
          }
          cases.push(AST.switchCase(test, body, test.line));
        }
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
        let fromReverse = false;
        let toReverse = false;
        if (this.match(T.LT)) fromReverse = true;
        const index = this.parseExpression();
        if (this.match(T.DOT_DOT)) {
          if (this.match(T.LT)) toReverse = true;
          // Support open-ended range: arr[start..] means arr[start..<1]
          let to;
          if (this.at(T.RBRACKET)) {
            // Open-ended: arr[start..] → range to end (use <1 = last element)
            to = AST.intLiteral(1, expr.line);
            toReverse = true;
          } else {
            to = this.parseExpression();
          }
          this.expect(T.RBRACKET);
          expr = AST.rangeExprWithFlags(expr, index, fromReverse, to, toReverse, expr.line);
        } else {
          this.expect(T.RBRACKET);
          if (fromReverse) {
            expr = AST.negativeIndex(expr, index, expr.line);
          } else {
            expr = AST.indexExpr(expr, index, expr.line);
          }
        }
      } else if (this.at(T.ARROW)) {
        this.advance();
        const member = this.expect(T.IDENT).value;
        if (this.at(T.LPAREN)) {
          this.advance();
          const args = this.parseArgList();
          this.expect(T.RPAREN);
          expr = AST.callOther(expr, member, args, expr.line);
        } else {
          expr = AST.classMemberAccess(expr, member, expr.line);
        }
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

    // Scope resolution ::func()
    if (tok.type === T.COLON_COLON) {
      this.advance();
      const name = this.expect(T.IDENT).value;
      this.expect(T.LPAREN);
      const args = this.parseArgList();
      this.expect(T.RPAREN);
      return AST.scopeCallExpr(name, args, tok.line);
    }

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
      while (!this.at(T.ARRAY_CLOSE) && !this.at(T.EOF)) {
        elements.push(this.parseExpression());
        if (!this.match(T.COMMA)) break;
      }
      this.expect(T.ARRAY_CLOSE);
      return AST.arrayLiteral(elements, tok.line);
    }

    if (tok.type === T.MAPPING_OPEN) {
      this.advance();
      const entries = [];
      while (!this.at(T.MAPPING_CLOSE) && !this.at(T.EOF)) {
        const key = this.parseExpression();
        this.expect(T.COLON);
        const value = this.parseExpression();
        entries.push({ key, value });
        if (!this.match(T.COMMA)) break;
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

    // new(class X) or new(path, args)
    if (tok.type === T.NEW) {
      this.advance();
      this.expect(T.LPAREN);
      if (this.at(T.CLASS)) {
        this.advance();
        const className = this.expect(T.IDENT).value;
        this.expect(T.RPAREN);
        return AST.newClassExpr(className, tok.line);
      }
      const pathExpr = this.parseExpression();
      const args = [];
      while (this.match(T.COMMA)) args.push(this.parseExpression());
      this.expect(T.RPAREN);
      return AST.callExpr('clone_object', [pathExpr, ...args], tok.line);
    }

    // catch(expr)
    if (tok.type === T.CATCH) {
      this.advance();
      this.expect(T.LPAREN);
      const expr = this.parseExpression();
      this.expect(T.RPAREN);
      return AST.catchExpr(expr, tok.line);
    }

    // throw(expr) as expression (inside catch)
    if (tok.type === T.THROW) {
      this.advance();
      this.expect(T.LPAREN);
      const expr = this.parseExpression();
      this.expect(T.RPAREN);
      // Reuse ThrowStatement node but treat as expression
      return AST.throwStatement(expr, tok.line);
    }

    // Lambda: (: ... :)
    if (tok.type === T.FP_OPEN) {
      this.advance();
      return this.parseLambda(tok.line);
    }

    // Allow 'status' as identifier (it's also a type keyword but used as variable name in many mudlibs)
    if (tok.type === T.TYPE_STATUS) {
      this.advance();
      return AST.identifier(tok.value, tok.line);
    }

    if (tok.type === T.IDENT) {
      this.advance();
      // efun::func() — direct efun call bypassing simul_efun
      if (tok.value === 'efun' && this.at(T.COLON_COLON)) {
        this.advance(); // skip ::
        const funcName = this.expect(T.IDENT).value;
        this.expect(T.LPAREN);
        const args = this.parseArgList();
        this.expect(T.RPAREN);
        // Direct efun call — bypass simul_efun
        const node = AST.callExpr(funcName, args, tok.line);
        node.directEfun = true;
        return node;
      }
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

  parseLambda(line) {
    // Named: (: func_name :) or (: func_name, arg1, arg2 :)
    if (this.at(T.IDENT) && (this.tokens[this.pos + 1]?.type === T.FP_CLOSE ||
                              this.tokens[this.pos + 1]?.type === T.COMMA)) {
      const name = this.advance().value;
      const partialArgs = [];
      while (this.match(T.COMMA)) {
        partialArgs.push(this.parseExpression());
      }
      this.expect(T.FP_CLOSE);
      return AST.lambdaExpr('named', name, partialArgs, null, line);
    }
    // Inline closure: (: expr :)
    const body = this.parseExpression();
    this.expect(T.FP_CLOSE);
    return AST.lambdaExpr('inline', null, [], body, line);
  }

  parseArgList() {
    const args = [];
    while (!this.at(T.RPAREN) && !this.at(T.EOF)) {
      args.push(this.parseExpression());
      if (!this.match(T.COMMA)) break;
    }
    return args;
  }
}

export function parse(source, file = '<input>') {
  const tokens = tokenize(source, file);
  const parser = new Parser(tokens);
  return parser.parseProgram();
}
