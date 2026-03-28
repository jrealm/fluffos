import zlib from 'node:zlib';
import fs from 'node:fs';
import { mkInt, mkString, T_STRING, T_BUFFER, SVALUE_ZERO } from '../../vm/svalue.mjs';

export function registerCompressEfuns(reg) {
  reg.register('compress', (args) => {
    try {
      const input = args[0].type === T_BUFFER
        ? args[0].value
        : Buffer.from(args[0].value);
      const compressed = zlib.deflateSync(input);
      return { type: T_BUFFER, value: compressed };
    } catch {
      return SVALUE_ZERO;
    }
  });

  reg.register('uncompress', (args) => {
    try {
      const input = args[0].type === T_BUFFER
        ? args[0].value
        : Buffer.from(args[0].value);
      const decompressed = zlib.inflateSync(input);
      return { type: T_BUFFER, value: decompressed };
    } catch {
      return SVALUE_ZERO;
    }
  });

  reg.register('compress_file', (args) => {
    try {
      const src = args[0].value;
      const dst = args[1]?.value ?? src + '.gz';
      const data = fs.readFileSync(src);
      const compressed = zlib.gzipSync(data);
      fs.writeFileSync(dst, compressed);
      return mkInt(1);
    } catch {
      return SVALUE_ZERO;
    }
  });

  reg.register('uncompress_file', (args) => {
    try {
      const src = args[0].value;
      const dst = args[1]?.value ?? src.replace(/\.gz$/, '');
      const data = fs.readFileSync(src);
      const decompressed = zlib.gunzipSync(data);
      fs.writeFileSync(dst, decompressed);
      return mkInt(1);
    } catch {
      return SVALUE_ZERO;
    }
  });
}
