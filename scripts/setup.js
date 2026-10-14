import fs from "node:fs";
import { randomBytes } from "node:crypto";
import readline from "node:readline";
import dotenv from "dotenv";
import { config } from "../server/config.js";
import { openStore } from "../server/store.js";
import { validPassword, passwordHash } from "../server/security.js";
if (!fs.existsSync(".env")) {
  let content = fs
    .readFileSync(".env.example", "utf8")
    .replace("DATA_KEY=", "DATA_KEY=" + randomBytes(32).toString("hex"))
    .replace("BACKUP_KEY=", "BACKUP_KEY=" + randomBytes(32).toString("hex"));
  fs.writeFileSync(".env", content, { flag: "wx", mode: 0o600 });
  console.log(
    ".env criado com chaves aleatórias. Guarde cópia segura das chaves.",
  );
}
dotenv.config({ override: true });
if (process.argv.includes("--generate-config")) process.exit(0);
const c = config(),
  s = openStore(c);
if (s.db.prepare("SELECT id FROM account").get()) {
  s.close();
  console.log(
    "Conta já configurada. Use a recuperação de senha pela interface.",
  );
  process.exit(0);
}
if (!process.stdin.isTTY) {
  s.close();
  throw new Error(
    "Execute npm run setup em um terminal interativo para criar sua primeira senha.",
  );
}
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: true,
});
async function secret(prompt) {
  process.stdout.write(prompt);
  const original = rl._writeToOutput;
  rl._writeToOutput = () => {};
  const answer = await new Promise((resolve) => rl.question("", resolve));
  rl._writeToOutput = original;
  process.stdout.write("\n");
  return answer;
}
try {
  const pass = await secret(
    "Primeira senha (12 a 128 caracteres; entrada oculta): ",
  );
  if (!validPassword(pass)) throw new Error("Senha inválida.");
  const confirmation = await secret("Confirme a senha: ");
  if (pass !== confirmation) throw new Error("Senhas diferentes.");
  s.db
    .prepare("INSERT INTO account VALUES (1,?,?)")
    .run(c.email, passwordHash(pass));
  s.audit("account.initialized");
  console.log(`Conta ${c.email} configurada. Não existe senha padrão.`);
} finally {
  rl.close();
  s.close();
}
