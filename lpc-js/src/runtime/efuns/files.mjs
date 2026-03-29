import fs from 'node:fs';
import path from 'node:path';
import { mkInt, mkString, mkArray, SVALUE_ZERO } from '../../vm/svalue.mjs';
import { RuntimeError } from '../../vm/machine.mjs';

export function registerFileEfuns(reg, mudlibDir, driver = null) {
  const normalizedBase = path.resolve(mudlibDir);

  function resolve(lpcPath) {
    const p = lpcPath.startsWith('/') ? lpcPath.slice(1) : lpcPath;
    const resolved = path.resolve(mudlibDir, p);
    if (!resolved.startsWith(normalizedBase + path.sep) && resolved !== normalizedBase) {
      throw new Error(`Path traversal denied: ${lpcPath}`);
    }
    return resolved;
  }

  function checkRead(lpcPath, efunName) {
    if (!driver) return lpcPath;
    const result = driver.checkFileAccess('read', lpcPath, efunName);
    if (result === null) throw new RuntimeError(`Permission denied: valid_read("${lpcPath}", "${efunName}")`);
    return result;
  }

  function checkWrite(lpcPath, efunName) {
    if (!driver) return lpcPath;
    const result = driver.checkFileAccess('write', lpcPath, efunName);
    if (result === null) throw new RuntimeError(`Permission denied: valid_write("${lpcPath}", "${efunName}")`);
    return result;
  }

  // read_file: supports start line and number of lines (1-based)
  // C: read_file(path, start=1, numLines=0) where 0 = read all
  reg.register('read_file', (args) => {
    try {
      const lpcPath = checkRead(args[0].value, 'read_file');
      const content = fs.readFileSync(resolve(lpcPath), 'utf8');
      const startLine = args[1]?.value ?? 0;
      const numLines = args[2]?.value ?? 0;

      if (startLine <= 0 && numLines <= 0) {
        return mkString(content);
      }

      const lines = content.split('\n');
      const start = Math.max(1, startLine) - 1; // convert to 0-based
      if (start >= lines.length) return mkString('');

      const end = numLines > 0 ? Math.min(start + numLines, lines.length) : lines.length;
      const selected = lines.slice(start, end);
      // Re-join with \n, preserving trailing \n if original had one
      let result = selected.join('\n');
      if (end < lines.length || content.endsWith('\n')) result += '\n';
      return mkString(result);
    } catch (e) {
      if (e instanceof RuntimeError) throw e;
      return SVALUE_ZERO;
    }
  });

  // write_file: supports flags (3rd arg)
  // C: flags & 1 = overwrite (w mode), else append (a mode)
  reg.register('write_file', (args) => {
    try {
      const lpcPath = checkWrite(args[0].value, 'write_file');
      const fullPath = resolve(lpcPath);
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const flags = args[2]?.value ?? 0;
      if (flags & 1) {
        // Overwrite mode
        fs.writeFileSync(fullPath, args[1].value);
      } else {
        // Append mode (default)
        fs.appendFileSync(fullPath, args[1].value);
      }
      return mkInt(1);
    } catch (e) {
      if (e instanceof RuntimeError) throw e;
      return SVALUE_ZERO;
    }
  });

  reg.register('file_size', (args) => {
    try {
      const lpcPath = checkRead(args[0].value, 'file_size');
      const stat = fs.statSync(resolve(lpcPath));
      if (stat.isDirectory()) return mkInt(-2);
      return mkInt(stat.size);
    } catch (e) {
      if (e instanceof RuntimeError) throw e;
      return mkInt(-1);
    }
  });

  reg.register('mkdir', (args) => {
    try {
      const lpcPath = checkWrite(args[0].value, 'mkdir');
      fs.mkdirSync(resolve(lpcPath));
      return mkInt(1);
    } catch (e) {
      if (e instanceof RuntimeError) throw e;
      return SVALUE_ZERO;
    }
  });

  reg.register('rm', (args) => {
    try {
      const lpcPath = checkWrite(args[0].value, 'rm');
      fs.unlinkSync(resolve(lpcPath));
      return mkInt(1);
    } catch (e) {
      if (e instanceof RuntimeError) throw e;
      return SVALUE_ZERO;
    }
  });

  // get_dir: supports flags (-1 = detailed info)
  // C: glob uses * and ? wildcards. Properly escape regex special chars.
  // Results are sorted. Hidden files (starting with .) are filtered unless glob starts with .
  reg.register('get_dir', (args) => {
    try {
      const lpcPath = checkRead(args[0].value, 'get_dir');
      const flags = args[1]?.value ?? 0;
      const resolved = resolve(lpcPath);
      // If path ends with /, list all files in directory
      const isDir = lpcPath.endsWith('/') || (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory());
      const dir = isDir ? resolved : path.dirname(resolved);
      const glob = isDir ? '*' : path.basename(lpcPath);

      // Properly escape regex special chars, then convert glob wildcards
      const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');
      const pattern = escaped.replace(/\*/g, '.*').replace(/\?/g, '.');
      const regex = new RegExp('^' + pattern + '$');

      let files = fs.readdirSync(dir);
      // Filter hidden files unless glob starts with .
      if (!glob.startsWith('.')) {
        files = files.filter(f => !f.startsWith('.'));
      }
      files = files.filter(f => regex.test(f));
      files.sort(); // C sorts results

      if (flags === -1) {
        // Detailed mode: return array of ({ name, size, mtime }) arrays
        return mkArray(files.map(f => {
          try {
            const s = fs.statSync(path.join(dir, f));
            return mkArray([
              mkString(f),
              mkInt(s.isDirectory() ? -2 : s.size),
              mkInt(Math.floor(s.mtimeMs / 1000)),
            ]);
          } catch {
            return mkArray([mkString(f), mkInt(-1), mkInt(0)]);
          }
        }));
      }

      return mkArray(files.map(f => mkString(f)));
    } catch (e) {
      if (e instanceof RuntimeError) throw e;
      return mkArray([]);
    }
  });

  // stat: returns 3-element array ({ size, mtime, load_time })
  reg.register('stat', (args) => {
    try {
      const lpcPath = checkRead(args[0].value, 'stat');
      const s = fs.statSync(resolve(lpcPath));
      return mkArray([
        mkInt(s.size),
        mkInt(Math.floor(s.mtimeMs / 1000)),
        mkInt(0), // load_time (LPC object load time — not applicable in JS)
      ]);
    } catch (e) {
      if (e instanceof RuntimeError) throw e;
      return SVALUE_ZERO;
    }
  });

  // read_bytes: supports negative start (from end), len=0 means read all
  reg.register('read_bytes', (args) => {
    try {
      const lpcPath = checkRead(args[0].value, 'read_bytes');
      const fullPath = resolve(lpcPath);
      const fileStat = fs.statSync(fullPath);
      const fileSize = fileStat.size;
      let start = args[1]?.value ?? 0;
      let length = args[2]?.value ?? 0;

      // Negative start: offset from end of file
      if (start < 0) start = Math.max(0, fileSize + start);
      // len=0 means read entire file
      if (length <= 0) length = fileSize - start;

      const fd = fs.openSync(fullPath, 'r');
      const buf = Buffer.alloc(length);
      fs.readSync(fd, buf, 0, length, start);
      fs.closeSync(fd);
      return mkString(buf.toString('utf8'));
    } catch (e) {
      if (e instanceof RuntimeError) throw e;
      return SVALUE_ZERO;
    }
  });

  // write_bytes: creates new file if it doesn't exist (C behavior)
  // Supports negative start (from end of file)
  reg.register('write_bytes', (args) => {
    try {
      const lpcPath = checkWrite(args[0].value, 'write_bytes');
      const fullPath = resolve(lpcPath);
      let start = args[1].value;
      const data = args[2].value;

      // C: create file if it doesn't exist
      let flags = 'r+';
      if (!fs.existsSync(fullPath)) {
        // Create the file first
        fs.writeFileSync(fullPath, '');
        flags = 'r+';
      }

      // Negative start: offset from end
      if (start < 0) {
        const stat = fs.statSync(fullPath);
        start = Math.max(0, stat.size + start);
      }

      const fd = fs.openSync(fullPath, flags);
      fs.writeSync(fd, data, start);
      fs.closeSync(fd);
      return mkInt(1);
    } catch (e) {
      if (e instanceof RuntimeError) throw e;
      return SVALUE_ZERO;
    }
  });

  reg.register('cp', (args) => {
    try {
      const srcPath = checkRead(args[0].value, 'cp');
      const dstPath = checkWrite(args[1].value, 'cp');
      fs.copyFileSync(resolve(srcPath), resolve(dstPath));
      return mkInt(0); // success
    } catch (e) {
      if (e instanceof RuntimeError) throw e;
      if (e.code === 'ENOENT') return mkInt(-1); // C returns -1 for missing source
      return mkInt(1); // C returns 1 for other errors
    }
  });

  reg.register('rename', (args) => {
    try {
      const srcPath = checkWrite(args[0].value, 'rename');
      const dstPath = checkWrite(args[1].value, 'rename');
      fs.renameSync(resolve(srcPath), resolve(dstPath));
      return mkInt(0); // success
    } catch (e) {
      if (e instanceof RuntimeError) throw e;
      if (e.code === 'ENOENT') return mkInt(-1); // C returns -1 for missing source
      return mkInt(1); // C returns 1 for other errors
    }
  });

  reg.register('rmdir', (args) => {
    try {
      const lpcPath = checkWrite(args[0].value, 'rmdir');
      fs.rmdirSync(resolve(lpcPath));
      return mkInt(1);
    } catch (e) {
      if (e instanceof RuntimeError) throw e;
      return SVALUE_ZERO;
    }
  });

  reg.register('link', (args) => {
    try {
      const srcPath = checkRead(args[0].value, 'link');
      const dstPath = checkWrite(args[1].value, 'link');
      fs.linkSync(resolve(srcPath), resolve(dstPath));
      return mkInt(0);
    } catch (e) {
      if (e instanceof RuntimeError) throw e;
      return mkInt(-1);
    }
  });
}
