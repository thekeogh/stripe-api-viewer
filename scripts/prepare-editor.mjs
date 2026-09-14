import { cpSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";

const require = createRequire(import.meta.url);
const monacoDistribution = dirname(require.resolve("monaco-editor"));
mkdirSync("public", { recursive: true });
cpSync(monacoDistribution, "public/monaco", { recursive: true });
