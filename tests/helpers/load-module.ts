import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { transpileModule, ModuleKind, ScriptTarget } from "typescript";

/** Run actual service/route code with unavailable external boundaries replaced. */
export function loadModule<T>(path: string, stubs: Record<string, unknown>, globals: Record<string, unknown> = {}): T {
  const filename = resolve(path);
  const requireActual = createRequire(filename);
  const code = transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const loaded = { exports: {} };
  const require = (name: string) => name in stubs ? stubs[name] : requireActual(name);
  new Function("require", "module", "exports", ...Object.keys(globals), code)(
    require, loaded, loaded.exports, ...Object.values(globals),
  );
  return loaded.exports as T;
}
