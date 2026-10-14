import { Router } from "express";
import { randomInt } from "node:crypto";
import nodemailer from "nodemailer";
import {
  id,
  hash,
  lookup,
  passwordValid,
  passwordHash,
  validPassword,
} from "./security.js";
export function auth(s, c) {
  const router = Router();
  const fail = (message = "Não foi possível autenticar.", status = 400) =>
    Object.assign(new Error(message), { status });
  function limit(key, max = 5, window = 15 * 60000) {
    const now = Date.now();
    const r = s.db.prepare("SELECT * FROM rate_limits WHERE key=?").get(key);
    if (r && r.reset > now && r.count >= max)
      throw fail("Muitas tentativas. Aguarde 15 minutos.", 429);
    s.db
      .prepare(
        "INSERT INTO rate_limits VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET count=excluded.count,reset=excluded.reset",
      )
      .run(
        key,
        r && r.reset > now ? r.count + 1 : 1,
        r && r.reset > now ? r.reset : now + window,
      );
  }
  async function challenge(purpose) {
    const key = id(),
      code = String(randomInt(100000, 1000000));
    s.db.prepare("UPDATE challenges SET used=1 WHERE purpose=?").run(purpose);
    s.db
      .prepare(
        "INSERT INTO challenges(id,purpose,code_hash,expires) VALUES (?,?,?,?)",
      )
      .run(
        key,
        purpose,
        lookup(`${key}:${code}`, c.key),
        Date.now() + 10 * 60000,
      );
    try {
      if (c.mail === "local") {
        if (c.onMail) c.onMail({ purpose, code, id: key });
        else
          console.log(
            `[DEMONSTRAÇÃO LOCAL] ${purpose === "login" ? "Login" : "Recuperação"} para ${c.email}: ${code} (10 minutos).`,
          );
      } else {
        await nodemailer
          .createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT || 587),
            secure: process.env.SMTP_SECURE === "true",
            auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
          })
          .sendMail({
            from: process.env.MAIL_FROM,
            to: c.email,
            subject: "Samira Costa — código de acesso",
            text: `Seu código de ${purpose === "login" ? "acesso" : "recuperação"} é ${code}. Validade: 10 minutos. Não compartilhe.`,
          });
      }
    } catch {
      s.db.prepare("UPDATE challenges SET used=1 WHERE id=?").run(key);
      throw fail("Envio de e-mail indisponível. Confira o serviço SMTP.", 503);
    }
    return key;
  }
  function consume(key, code, purpose) {
    const ch = s.db
      .prepare("SELECT * FROM challenges WHERE id=?")
      .get(String(key));
    if (
      !ch ||
      ch.used ||
      ch.purpose !== purpose ||
      ch.expires < Date.now() ||
      ch.attempts >= 5
    )
      throw fail("Código inválido ou expirado.");
    s.db
      .prepare("UPDATE challenges SET attempts=attempts+1 WHERE id=?")
      .run(key);
    if (ch.code_hash !== lookup(`${key}:${String(code)}`, c.key))
      throw fail("Código inválido ou expirado.");
    s.db.prepare("UPDATE challenges SET used=1 WHERE id=?").run(key);
  }
  router.get("/info", (req, res) =>
    res.json({
      mode: c.mode,
      localMail: c.mail === "local",
      setupRequired: !s.db.prepare("SELECT id FROM account").get(),
      email: c.email,
    }),
  );
  router.post("/login", async (req, res) => {
    limit(`login:${req.ip}`);
    const account = s.db.prepare("SELECT * FROM account WHERE id=1").get();
    const email = String(req.body.email || "").toLowerCase();
    const pass = String(req.body.password || "").slice(0, 129);
    if (
      !passwordValid(pass, account?.password_hash) ||
      email !== account.email.toLowerCase()
    ) {
      s.audit("auth.failed");
      throw fail("E-mail ou senha inválidos.", 401);
    }
    const challengeId = await challenge("login");
    res.json({ challengeId, local: c.mail === "local" });
  });
  router.post("/verify", (req, res) => {
    limit(`code:${req.ip}`, 20);
    consume(req.body.challengeId, req.body.code, "login");
    const token = id() + id(),
      csrf = id();
    s.db
      .prepare("INSERT INTO sessions VALUES (?,?,?,?)")
      .run(hash(token), csrf, Date.now(), Date.now());
    res.cookie("sc_session", token, {
      httpOnly: true,
      sameSite: "strict",
      secure: c.env === "production",
      path: "/",
      maxAge: 12 * 3600000,
    });
    s.audit("auth.login");
    res.json({ csrf });
  });
  router.post("/recover", async (req, res) => {
    limit(`recover:${req.ip}`, 3);
    const account = s.db.prepare("SELECT * FROM account WHERE id=1").get();
    let challengeId = id();
    if (
      account &&
      String(req.body.email || "").toLowerCase() === account.email.toLowerCase()
    )
      challengeId = await challenge("reset");
    res.json({
      challengeId,
      message: "Se o e-mail corresponder à conta, o código será enviado.",
      local: c.mail === "local",
    });
  });
  router.post("/reset", (req, res) => {
    limit(`reset:${req.ip}`, 10);
    if (!validPassword(req.body.password))
      throw fail("Use uma senha de 12 a 128 caracteres.");
    consume(req.body.challengeId, req.body.code, "reset");
    s.db
      .prepare("UPDATE account SET password_hash=? WHERE id=1")
      .run(passwordHash(req.body.password));
    s.db.exec("DELETE FROM sessions; UPDATE challenges SET used=1;");
    s.audit("auth.password_reset");
    res.json({ ok: true });
  });
  function guard(req, res, next) {
    const cookie = (req.headers.cookie || "")
      .split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("sc_session="));
    const token = cookie?.substring(11);
    const h = hash(token || "");
    const session = s.db
      .prepare("SELECT * FROM sessions WHERE token_hash=?")
      .get(h);
    if (
      !session ||
      Date.now() - session.last_seen > c.idle ||
      Date.now() - session.created > 12 * 3600000
    ) {
      s.db.prepare("DELETE FROM sessions WHERE token_hash=?").run(h);
      return res
        .status(401)
        .json({ error: "Sessão expirada. Entre novamente." });
    }
    if (
      !["GET", "HEAD"].includes(req.method) &&
      req.headers["x-csrf-token"] !== session.csrf
    )
      return res.status(403).json({
        error: "Validação de segurança inválida. Recarregue a página.",
      });
    s.db
      .prepare("UPDATE sessions SET last_seen=? WHERE token_hash=?")
      .run(Date.now(), h);
    req.session = { ...session, hash: h };
    next();
  }
  return { router, guard };
}
