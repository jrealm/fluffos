import fs from 'node:fs';
import path from 'node:path';
import { mkInt, mkString, mkArray, SVALUE_ZERO } from '../../vm/svalue.mjs';

export function registerFileEfuns(reg, mudlibDir) {
  function resolve(lpcPath) {
    const p = lpcPath.startsWith('/') ? lpcPath.slice(1) : lpcPath;
    return path.join(mudlibDir, p);
  }

  reg.register('read_file', (args) => {
    try {
      return mkString(fs.readFileSync(resolve(args[0].value), 'utf8'));
    } catch { return SVALUE_ZERO; }
  });

  reg.register('write_file', (args) => {
    try {
      const fullPath = resolve(args[0].value);
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(fullPath, args[1].value);
      return mkInt(1);
    } catch { return SVALUE_ZERO; }
  });

  reg.register('file_size', (args) => {
    try {
      const stat = fs.statSync(resolve(args[0].value));
      if (stat.isDirectory()) return mkInt(-2);
      return mkInt(stat.size);
    } catch { return mkInt(-1); }
  });

  reg.register('mkdir', (args) => {
    try {
      fs.mkdirSync(resolve(args[0].value), { recursive: true });
      return mkInt(1);
    } catch { return SVALUE_ZERO; }
  });

  reg.register('rm', (args) => {
    try {
      fs.unlinkSync(resolve(args[0].value));
      return mkInt(1);
    } catch { return SVALUE_ZERO; }
  });

  reg.register('get_dir', (args) => {
    try {
      const pattern = args[0].value;
      const dir = path.dirname(resolve(pattern));
      const glob = path.basename(pattern);
      const files = fs.readdirSync(dir);
      const regex = new RegExp('^' + glob.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
      return mkArray(files.filter(f => regex.test(f)).map(f => mkString(f)));
    } catch { return mkArray([]); }
  });

  reg.register('stat', (args) => {
    try {
      const s = fs.statSync(resolve(args[0].value));
      return mkArray([mkInt(s.size), mkInt(Math.floor(s.mtimeMs / 1000))]);
    } catch { return SVALUE_ZERO; }
  });

  reg.register('read_bytes', (args) => {
    try {
      const fd = fs.openSync(resolve(args[0].value), 'r');
      const start = args[1]?.value ?? 0;
      const length = args[2]?.value ?? 0;
      const buf = Buffer.alloc(length);
      fs.readSync(fd, buf, 0, length, start);
      fs.closeSync(fd);
      return mkString(buf.toString('utf8'));
    } catch { return SVALUE_ZERO; }
  });

  reg.register('write_bytes', (args) => {
    try {
      const fullPath = resolve(args[0].value);
      const start = args[1].value;
      const data = args[2].value;
      const fd = fs.openSync(fullPath, 'r+');
      fs.writeSync(fd, data, start);
      fs.closeSync(fd);
      return mkInt(1);
    } catch { return SVALUE_ZERO; }
  });

  reg.register('cp', (args) => {
    try {
      fs.copyFileSync(resolve(args[0].value), resolve(args[1].value));
      return mkInt(0);
    } catch { return mkInt(-1); }
  });

  reg.register('rename', (args) => {
    try {
      fs.renameSync(resolve(args[0].value), resolve(args[1].value));
      return mkInt(0);
    } catch { return mkInt(-1); }
  });
}
