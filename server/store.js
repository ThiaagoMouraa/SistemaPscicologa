import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { encrypt, decrypt, id } from "./security.js";
const allowed = new Set([
  "patients",
  "catalog",
  "packages",
  "appointments",
  "session_versions",
  "clinical",
  "clinical_versions",
  "contracts",
  "signed_files",
  "requests",
  "ledger",
  "settings",
]);
export function openStore(c) {
  fs.mkdirSync(c.dir, { recursive: true });
  const db = new DatabaseSync(path.join(c.dir, "consultorio.sqlite"));
  db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
  db.exec(
    fs.readFileSync(
      fileURLToPath(
        new URL("../db/migrations/001_initial.sql", import.meta.url),
      ),
      "utf8",
    ),
  );
  const check = (t) => {
    if (!allowed.has(t)) throw new Error("Tabela inválida");
  };
  const decode = (r) =>
    r ? { ...r, ...decrypt(r.body, c.key), body: undefined } : null;
  const store = {
    db,
    c,
    all(t) {
      check(t);
      return db.prepare(`SELECT * FROM ${t}`).all().map(decode);
    },
    get(t, key) {
      check(t);
      return decode(db.prepare(`SELECT * FROM ${t} WHERE id=?`).get(key));
    },
    add(t, value, cols = {}) {
      check(t);
      const key = value.id || id();
      const names = ["id", ...Object.keys(cols), "body"];
      db.prepare(
        `INSERT INTO ${t} (${names.join(",")}) VALUES (${names.map(() => "?").join(",")})`,
      ).run(key, ...Object.values(cols), encrypt({ ...value, id: key }, c.key));
      return store.get(t, key);
    },
    update(t, key, value, cols = {}) {
      check(t);
      const old = store.get(t, key);
      if (!old)
        throw Object.assign(new Error("Registro não encontrado"), {
          status: 404,
        });
      db.prepare(
        `UPDATE ${t} SET body=?${Object.keys(cols)
          .map((n) => `,${n}=?`)
          .join("")} WHERE id=?`,
      ).run(
        encrypt({ ...old, ...value, id: key }, c.key),
        ...Object.values(cols),
        key,
      );
      return store.get(t, key);
    },
    audit(action, entity = "") {
      db.prepare("INSERT INTO audit VALUES (?,?,?,?)").run(
        id(),
        new Date().toISOString(),
        action,
        entity,
      );
    },
    transaction(fn) {
      db.exec("BEGIN IMMEDIATE");
      try {
        const value = fn();
        db.exec("COMMIT");
        return value;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
    close() {
      db.close();
    },
  };
  if (!store.all("catalog").length)
    for (const [key, name, sessions, price] of [
      ["avulso", "Avulso", 1, 25000],
      ["quinzenal", "Quinzenal", 2, 44000],
      ["mensal", "Mensal", 4, 88000],
    ])
      store.add("catalog", { id: key, name, sessions, price });
  if (!store.get("settings", "practice"))
    store.add("settings", {
      id: "practice",
      address: c.address,
      feeBearer: "professional",
      terms:
        "MINUTA PROVISÓRIA — contrato-base não fornecido. Revisar antes de enviar. Atendimento mediante combinação direta com a profissional. Renovação exige consentimento expresso. Faltas somente serão cobradas quando previsto no contrato revisado. Condições de cancelamento, vencimentos e demais cláusulas devem ser definidas pela profissional. A cláusula de 90 dias não foi reproduzida: incorporar exatamente as condições legais do documento original. Sem negativação automática.",
      termsApproved: false,
    });
  return store;
}
