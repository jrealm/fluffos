export function program(body, line) {
  return { type: 'Program', body, line };
}

export function functionDecl(name, returnType, params, body, flags, line) {
  return { type: 'FunctionDecl', name, returnType, params, body, flags, line };
}

export function varDecl(varType, name, init, flags, line) {
  return { type: 'VarDecl', varType, name, init, flags, line };
}

export function block(statements, line) {
  return { type: 'Block', statements, line };
}

export function ifStatement(condition, consequent, alternate, line) {
  return { type: 'IfStatement', condition, consequent, alternate, line };
}

export function whileStatement(condition, body, line) {
  return { type: 'WhileStatement', condition, body, line };
}

export function doWhileStatement(condition, body, line) {
  return { type: 'DoWhileStatement', condition, body, line };
}

export function forStatement(init, condition, update, body, line) {
  return { type: 'ForStatement', init, condition, update, body, line };
}

export function foreachStatement(varType, varName, expr, body, line) {
  return { type: 'ForeachStatement', varType, varName, expr, body, line };
}

export function switchStatement(discriminant, cases, line) {
  return { type: 'SwitchStatement', discriminant, cases, line };
}

export function switchCase(test, body, line) {
  return { type: 'SwitchCase', test, body, line };
}

export function returnStatement(value, line) {
  return { type: 'ReturnStatement', value, line };
}

export function breakStatement(line) {
  return { type: 'BreakStatement', line };
}

export function continueStatement(line) {
  return { type: 'ContinueStatement', line };
}

export function expressionStatement(expression, line) {
  return { type: 'ExpressionStatement', expression, line };
}

export function binaryExpr(operator, left, right, line) {
  return { type: 'BinaryExpression', operator, left, right, line };
}

export function unaryExpr(operator, operand, prefix, line) {
  return { type: 'UnaryExpression', operator, operand, prefix, line };
}

export function updateExpr(operator, operand, prefix, line) {
  return { type: 'UpdateExpression', operator, operand, prefix, line };
}

export function assignExpr(operator, left, right, line) {
  return { type: 'AssignExpression', operator, left, right, line };
}

export function ternaryExpr(condition, consequent, alternate, line) {
  return { type: 'TernaryExpression', condition, consequent, alternate, line };
}

export function callExpr(name, args, line) {
  return { type: 'CallExpression', name, args, line };
}

export function callOther(object, method, args, line) {
  return { type: 'CallOther', object, method, args, line };
}

export function scopeResolution(name, line) {
  return { type: 'ScopeResolution', name, line };
}

export function indexExpr(object, index, line) {
  return { type: 'IndexExpression', object, index, line };
}

export function rangeExpr(object, from, to, line) {
  return { type: 'RangeExpression', object, from, to, line };
}

export function identifier(name, line) {
  return { type: 'Identifier', name, line };
}

export function intLiteral(value, line) {
  return { type: 'IntLiteral', value, line };
}

export function floatLiteral(value, line) {
  return { type: 'FloatLiteral', value, line };
}

export function stringLiteral(value, line) {
  return { type: 'StringLiteral', value, line };
}

export function arrayLiteral(elements, line) {
  return { type: 'ArrayLiteral', elements, line };
}

export function mappingLiteral(entries, line) {
  return { type: 'MappingLiteral', entries, line };
}

export function inheritDecl(path, flags, line) {
  return { type: 'InheritDecl', path, flags, line };
}

export function classDecl(name, members, line) {
  return { type: 'ClassDecl', name, members, line };
}

export function classMemberAccess(object, member, line) {
  return { type: 'ClassMemberAccess', object, member, line };
}

export function scopeCallExpr(name, args, line) {
  return { type: 'ScopeCallExpression', name, args, line };
}

export function negativeIndex(object, index, line) {
  return { type: 'NegativeIndex', object, index, line };
}

export function rangeExprWithFlags(object, from, fromReverse, to, toReverse, line) {
  return { type: 'RangeExpressionEx', object, from, fromReverse, to, toReverse, line };
}

export function catchExpr(expression, line) {
  return { type: 'CatchExpression', expression, line };
}

export function throwStatement(expression, line) {
  return { type: 'ThrowStatement', expression, line };
}

export function lambdaExpr(kind, name, partialArgs, body, line) {
  return { type: 'LambdaExpression', kind, name, partialArgs, body, line };
}
