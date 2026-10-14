import "dotenv/config";
import path from "node:path";
export function config(overrides = {}) {
  const c = {
    env: process.env.NODE_ENV || "development",
    mode: process.env.APP_MODE || "demo",
    host: process.env.HOST || "127.0.0.1",
    port: Number(process.env.PORT || 3000),
    url: process.env.APP_URL || "http://127.0.0.1:3000",
    dir: path.resolve(process.env.DATA_DIR || "./data/demo"),
    key: process.env.DATA_KEY,
    backupKey: process.env.BACKUP_KEY,
    email: process.env.PROFESSIONAL_EMAIL || "Samira.costta@gmail.com",
    address: process.env.PROFESSIONAL_ADDRESS || "",
    idle: Number(process.env.SESSION_IDLE_MINUTES || 20) * 60000,
    mail: process.env.MAIL_MODE || "local",
    ...overrides,
  };
  if (!/^[a-f0-9]{64}$/i.test(c.key || ""))
    throw new Error("DATA_KEY ausente ou inválida. Execute npm run setup.");
  if (
    !["demo", "production"].includes(c.mode) ||
    !["local", "smtp"].includes(c.mail) ||
    !Number.isFinite(c.idle) ||
    c.idle < 60000
  )
    throw new Error("Modo, e-mail ou tempo de sessão inválido.");
  if (c.mail === "smtp" && (!process.env.SMTP_HOST || !process.env.MAIL_FROM))
    throw new Error("MAIL_MODE=smtp exige SMTP_HOST e MAIL_FROM autorizados.");
  if (
    c.env === "production" &&
    (c.mode !== "production" ||
      c.mail !== "smtp" ||
      !c.url.startsWith("https://") ||
      !process.env.SMTP_HOST ||
      !process.env.MAIL_FROM)
  )
    throw new Error(
      "Produção exige APP_MODE=production, HTTPS e SMTP com remetente autorizado.",
    );
  if (
    c.mail === "local" &&
    (c.env === "production" ||
      c.mode !== "demo" ||
      !["127.0.0.1", "localhost", "::1"].includes(c.host))
  )
    throw new Error("Correio local permitido somente em demo no loopback.");
  if (c.mode === "production" && /[\\/]demo(?:[\\/]|$)/.test(c.dir))
    throw new Error("Produção não pode usar diretório demo.");
  return c;
}
