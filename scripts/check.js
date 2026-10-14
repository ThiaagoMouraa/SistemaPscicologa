import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
let count = 0;
for (const dir of ["public", "server", "scripts", "test"])
  for (const name of fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".js"))) {
    const result = spawnSync(
      process.execPath,
      ["--check", path.join(dir, name)],
      { stdio: "inherit" },
    );
    if (result.status !== 0) process.exit(result.status || 1);
    count++;
  }
console.log(`Sintaxe verificada em ${count} arquivos JavaScript.`);
