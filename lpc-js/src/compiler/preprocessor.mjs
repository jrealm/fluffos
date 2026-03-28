export function preprocess(source, options = {}) {
  const defines = new Map(Object.entries(options.defines ?? {}));
  const includePaths = options.includePaths ?? [];
  const readFile = options.readFile ?? null;
  const pragmas = {};
  const lines = source.split('\n');
  const output = [];
  const condStack = [];

  function isActive() {
    return condStack.length === 0 || condStack[condStack.length - 1].active;
  }

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    if (trimmed.startsWith('#')) {
      const directive = parseDirective(trimmed);

      if (directive.name === 'define' && isActive()) {
        const { macroName, params, body } = parseDefine(directive.rest);
        defines.set(macroName, { params, body });
        output.push('');
        continue;
      }

      if (directive.name === 'undef' && isActive()) {
        defines.delete(directive.rest.trim());
        output.push('');
        continue;
      }

      if (directive.name === 'ifdef') {
        const name = directive.rest.trim();
        const parentActive = isActive();
        condStack.push({ active: parentActive && defines.has(name), elseAllowed: true, parentActive });
        output.push('');
        continue;
      }

      if (directive.name === 'ifndef') {
        const name = directive.rest.trim();
        const parentActive = isActive();
        condStack.push({ active: parentActive && !defines.has(name), elseAllowed: true, parentActive });
        output.push('');
        continue;
      }

      if (directive.name === 'if') {
        const parentActive = isActive();
        const val = evaluateConstExpr(directive.rest.trim(), defines);
        condStack.push({ active: parentActive && val, elseAllowed: true, parentActive });
        output.push('');
        continue;
      }

      if (directive.name === 'elif') {
        const top = condStack[condStack.length - 1];
        if (top.active) {
          top.active = false;
          top.elseAllowed = false;
        } else if (top.elseAllowed && top.parentActive) {
          top.active = evaluateConstExpr(directive.rest.trim(), defines);
        }
        output.push('');
        continue;
      }

      if (directive.name === 'else') {
        const top = condStack[condStack.length - 1];
        if (top.active) {
          top.active = false;
        } else if (top.elseAllowed && top.parentActive) {
          top.active = true;
        }
        top.elseAllowed = false;
        output.push('');
        continue;
      }

      if (directive.name === 'endif') {
        condStack.pop();
        output.push('');
        continue;
      }

      if (directive.name === 'include' && isActive()) {
        const included = resolveInclude(directive.rest.trim(), includePaths, readFile);
        if (included !== null) {
          const sub = preprocess(included, { defines: Object.fromEntries(defines), includePaths, readFile });
          Object.assign(pragmas, sub.pragmas);
          // Merge defines from included file back into parent
          for (const [k, v] of sub.defines) {
            defines.set(k, v);
          }
          output.push(sub.source);
        } else {
          output.push(`/* failed to include ${directive.rest.trim()} */`);
        }
        continue;
      }

      if (directive.name === 'pragma' && isActive()) {
        const pragmaName = directive.rest.trim();
        pragmas[pragmaName] = true;
        output.push('');
        continue;
      }

      output.push('');
      continue;
    }

    if (isActive()) {
      output.push(expandMacros(rawLine, defines));
    } else {
      output.push('');
    }
  }

  return { source: output.join('\n'), pragmas, defines };
}

function parseDirective(line) {
  const match = line.match(/^#\s*(\w+)\s*(.*)?$/);
  if (!match) return { name: '', rest: '' };
  return { name: match[1], rest: match[2] ?? '' };
}

function parseDefine(rest) {
  const match = rest.match(/^(\w+)(?:\(([^)]*)\))?\s*(.*)?$/);
  if (!match) return { macroName: rest.trim(), params: null, body: '' };
  const macroName = match[1];
  const params = match[2] !== undefined ? match[2].split(',').map(p => p.trim()) : null;
  const body = (match[3] ?? '').trim();
  return { macroName, params, body };
}

function expandMacros(line, defines) {
  let result = '';
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      const end = findStringEnd(line, i);
      result += line.slice(i, end);
      i = end;
      continue;
    }
    if (line[i] === "'") {
      const end = line.indexOf("'", i + 1);
      if (end >= 0) {
        result += line.slice(i, end + 1);
        i = end + 1;
        continue;
      }
    }
    if (isIdentStart(line[i])) {
      let ident = '';
      while (i < line.length && isIdentChar(line[i])) {
        ident += line[i++];
      }
      const macro = defines.get(ident);
      if (macro) {
        if (macro.params !== null && line[i] === '(') {
          const { args, end } = parseMacroArgs(line, i);
          i = end;
          let expanded = macro.body;
          for (let p = 0; p < macro.params.length; p++) {
            expanded = expanded.replaceAll(macro.params[p], args[p] ?? '');
          }
          result += expanded;
        } else if (macro.params === null) {
          result += macro.body;
        } else {
          result += ident;
        }
      } else {
        result += ident;
      }
      continue;
    }
    result += line[i++];
  }
  return result;
}

function findStringEnd(line, start) {
  let i = start + 1;
  while (i < line.length) {
    if (line[i] === '\\') { i += 2; continue; }
    if (line[i] === '"') return i + 1;
    i++;
  }
  return line.length;
}

function parseMacroArgs(line, start) {
  let depth = 0;
  let i = start + 1;
  const args = [];
  let current = '';
  while (i < line.length) {
    if (line[i] === '(') { depth++; current += line[i++]; continue; }
    if (line[i] === ')') {
      if (depth === 0) {
        args.push(current.trim());
        return { args, end: i + 1 };
      }
      depth--;
      current += line[i++];
      continue;
    }
    if (line[i] === ',' && depth === 0) {
      args.push(current.trim());
      current = '';
      i++;
      continue;
    }
    current += line[i++];
  }
  args.push(current.trim());
  return { args, end: i };
}

function evaluateConstExpr(expr, defines) {
  const expanded = expr.replace(/defined\s*\(\s*(\w+)\s*\)/g, (_, name) => {
    return defines.has(name) ? '1' : '0';
  });
  const withValues = expanded.replace(/\b[A-Za-z_]\w*\b/g, (name) => {
    const macro = defines.get(name);
    if (macro && macro.params === null) return macro.body || '0';
    return '0';
  });
  try {
    const sanitized = withValues.replace(/[^0-9+\-*/%<>=!&|() ]/g, '');
    return Boolean(Function(`"use strict"; return (${sanitized})`)());
  } catch {
    return false;
  }
}

function resolveInclude(pathSpec, includePaths, readFile) {
  if (!readFile) return null;
  const path = pathSpec.replace(/^["<]|[">]$/g, '');
  for (const dir of includePaths) {
    const fullPath = dir + '/' + path;
    const content = readFile(fullPath);
    if (content !== null) return content;
  }
  return readFile(path);
}

function isIdentStart(c) {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';
}

function isIdentChar(c) {
  return isIdentStart(c) || (c >= '0' && c <= '9');
}
