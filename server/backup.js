import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { encrypt, decrypt, hash, id } from "./security.js";
function workspacePath(value) {
  const root = process.cwd(),
    resolved = path.resolve(value);
  if (resolved === root || !resolved.startsWith(root + path.sep))
    throw new Error("O caminho deve estar dentro do workspace.");
  return resolved;
}
export function backupStore(s, destination) {
  if (!/^[a-f0-9]{64}$/i.test(s.c.backupKey || ""))
    throw new Error("BACKUP_KEY inválida.");
  const target = workspacePath(destination);
  if (fs.existsSync(target))
    throw new Error("Backup existente não será sobrescrito.");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const snapshot = path.join(s.c.dir, `snapshot-${id()}.sqlite`);
  try {
    s.db.exec(`VACUUM INTO '${snapshot.replace(/'/g, "''")}'`);
    const bytes = fs.readFileSync(snapshot);
    const payload = {
      version: 1,
      mode: s.c.mode,
      keyHash: hash(s.c.key),
      sha256: hash(bytes),
      createdAt: new Date().toISOString(),
      db: bytes.toString("base64"),
    };
    fs.writeFileSync(target, encrypt(payload, s.c.backupKey), {
      flag: "wx",
      mode: 0o600,
    });
    return { path: target, sha256: payload.sha256 };
  } finally {
    if (fs.existsSync(snapshot)) fs.unlinkSync(snapshot);
  }
}
export function restoreBackup(c, source, destination) {
  const input = workspacePath(source),
    dir = workspacePath(destination);
  if (fs.existsSync(dir))
    throw new Error(
      "Restauração exige um diretório novo. Dados existentes serão preservados.",
    );
  const payload = decrypt(fs.readFileSync(input, "utf8"), c.backupKey);
  if (
    payload.version !== 1 ||
    payload.mode !== c.mode ||
    payload.keyHash !== hash(c.key)
  )
    throw new Error("Ambiente ou chave de dados não corresponde ao backup.");
  const bytes = Buffer.from(payload.db, "base64");
  if (hash(bytes) !== payload.sha256) throw new Error("Backup corrompido.");
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, "consultorio.sqlite");
  fs.writeFileSync(target, bytes, { flag: "wx", mode: 0o600 });
  const db = new DatabaseSync(target);
  try {
    if (
      db.prepare("PRAGMA integrity_check").get().integrity_check !== "ok" ||
      db.prepare("PRAGMA foreign_key_check").all().length
    )
      throw new Error("Integridade da restauração falhou.");
    db.exec("DELETE FROM sessions; UPDATE challenges SET used=1;");
  } finally {
    db.close();
  }
  return target;
}
