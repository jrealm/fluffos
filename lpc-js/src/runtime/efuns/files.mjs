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

  reg.register('read_file', (args) => {
    try {
      const lpcPath = checkRead(args[0].value, 'read_file');
      return mkString(fs.readFileSync(resolve(lpcPath), 'utf8'));
    } catch (e) {
      return SVALUE_ZERO;
    }
  });

  reg.register('write_file', (args) => {
    try {
      const lpcPath = checkWrite(args[0].value, 'write_file');
      const fullPath = resolve(lpcPath);
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(fullPath, args[1].value);
      return mkInt(1);
    } catch (e) {
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
      return mkInt(-1);
    }
  });

  reg.register('mkdir', (args) => {
    try {
      const lpcPath = checkWrite(args[0].value, 'mkdir');
      fs.mkdirSync(resolve(lpcPath), { recursive: true });
      return mkInt(1);
    } catch (e) {
      return SVALUE_ZERO;
    }
  });

  reg.register('rm', (args) => {
    try {
      const lpcPath = checkWrite(args[0].value, 'rm');
      fs.unlinkSync(resolve(lpcPath));
      return mkInt(1);
    } catch (e) {
      return SVALUE_ZERO;
    }
  });

  reg.register('get_dir', (args) => {
    try {
      const lpcPath = checkRead(args[0].value, 'get_dir');
      const dir = path.dirname(resolve(lpcPath));
      const glob = path.basename(lpcPath);
      const files = fs.readdirSync(dir);
      const regex = new RegExp('^' + glob.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
      return mkArray(files.filter(f => regex.test(f)).map(f => mkString(f)));
    } catch (e) {
      if (e instanceof RuntimeError) throw e;
      return mkArray([]);
    }
  });

  reg.register('stat', (args) => {
    try {
      const lpcPath = checkRead(args[0].value, 'stat');
      const s = fs.statSync(resolve(lpcPath));
      return mkArray([mkInt(s.size), mkInt(Math.floor(s.mtimeMs / 1000))]);
    } catch (e) {
      return SVALUE_ZERO;
    }
  });

  reg.register('read_bytes', (args) => {
    try {
      const lpcPath = checkRead(args[0].value, 'read_bytes');
      const fd = fs.openSync(resolve(lpcPath), 'r');
      const start = args[1]?.value ?? 0;
      const length = args[2]?.value ?? 0;
      const buf = Buffer.alloc(length);
      fs.readSync(fd, buf, 0, length, start);
      fs.closeSync(fd);
      return mkString(buf.toString('utf8'));
    } catch (e) {
      return SVALUE_ZERO;
    }
  });

  reg.register('write_bytes', (args) => {
    try {
      const lpcPath = checkWrite(args[0].value, 'write_bytes');
      const fullPath = resolve(lpcPath);
      const start = args[1].value;
      const data = args[2].value;
      const fd = fs.openSync(fullPath, 'r+');
      fs.writeSync(fd, data, start);
      fs.closeSync(fd);
      return mkInt(1);
    } catch (e) {
      return SVALUE_ZERO;
    }
  });

  reg.register('cp', (args) => {
    try {
      const srcPath = checkRead(args[0].value, 'cp');
      const dstPath = checkWrite(args[1].value, 'cp');
      fs.copyFileSync(resolve(srcPath), resolve(dstPath));
      return mkInt(0);
    } catch (e) {
      return mkInt(-1);
    }
  });

  reg.register('rename', (args) => {
    try {
      const srcPath = checkWrite(args[0].value, 'rename');
      const dstPath = checkWrite(args[1].value, 'rename');
      fs.renameSync(resolve(srcPath), resolve(dstPath));
      return mkInt(0);
    } catch (e) {
      return mkInt(-1);
    }
  });

  reg.register('rmdir', (args) => {
    try {
      const lpcPath = checkWrite(args[0].value, 'rmdir');
      fs.rmdirSync(resolve(lpcPath));
      return mkInt(1);
    } catch (e) {
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
      return mkInt(-1);
    }
  });
}
