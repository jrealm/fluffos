import fs from 'node:fs';
import { mkInt, mkString, mkArray, SVALUE_ZERO, T_FUNCTION } from '../../vm/svalue.mjs';
import { getMachine } from '../apply.mjs';

export function registerAsyncEfuns(reg, driver) {
  reg.register('async_read', (args) => {
    const filePath = args[0].value;
    const callback = args[1];
    if (callback.type !== T_FUNCTION) return SVALUE_ZERO;

    const mudlibDir = driver?.config?.['mudlib directory'] ?? '/';
    const fullPath = filePath.startsWith('/') ? mudlibDir + filePath : mudlibDir + '/' + filePath;

    fs.readFile(fullPath, 'utf8', (err, data) => {
      const vm = getMachine();
      if (vm) {
        try {
          vm._callFunctionPtr(callback.value, [
            err ? SVALUE_ZERO : mkString(data),
          ]);
        } catch {}
      }
    });
    return SVALUE_ZERO;
  });

  reg.register('async_write', (args) => {
    const filePath = args[0].value;
    const data = args[1].value;
    const flag = args[2]?.value ?? 0; // 0 = overwrite, 1 = append
    const callback = args[3];

    const mudlibDir = driver?.config?.['mudlib directory'] ?? '/';
    const fullPath = filePath.startsWith('/') ? mudlibDir + filePath : mudlibDir + '/' + filePath;
    const writeFunc = flag ? fs.appendFile : fs.writeFile;

    writeFunc(fullPath, data, (err) => {
      if (callback?.type === T_FUNCTION) {
        const vm = getMachine();
        if (vm) {
          try {
            vm._callFunctionPtr(callback.value, [mkInt(err ? 0 : 1)]);
          } catch {}
        }
      }
    });
    return SVALUE_ZERO;
  });

  reg.register('async_getdir', (args) => {
    const dirPath = args[0].value;
    const callback = args[1];
    if (callback.type !== T_FUNCTION) return SVALUE_ZERO;

    const mudlibDir = driver?.config?.['mudlib directory'] ?? '/';
    const fullPath = dirPath.startsWith('/') ? mudlibDir + dirPath : mudlibDir + '/' + dirPath;

    fs.readdir(fullPath, (err, files) => {
      const vm = getMachine();
      if (vm) {
        try {
          vm._callFunctionPtr(callback.value, [
            err ? mkArray([]) : mkArray(files.map(f => mkString(f))),
          ]);
        } catch {}
      }
    });
    return SVALUE_ZERO;
  });
}
