import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
  createHmac,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
export const id = () => randomBytes(16).toString("hex");
export const hash = (value) =>
  createHash("sha256")
    .update(Buffer.isBuffer(value) ? value : String(value))
    .digest("hex");
export const lookup = (value, key) =>
  createHmac("sha256", Buffer.from(key, "hex"))
    .update(String(value))
    .digest("hex");
export function passwordHash(password) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt:65536:8:2:${salt}:${scryptSync(password, salt, 64, { N: 65536, r: 8, p: 2, maxmem: 128 * 1024 * 1024 }).toString("hex")}`;
}
export function passwordValid(password, stored) {
  const options = { N: 65536, r: 8, p: 2, maxmem: 128 * 1024 * 1024 };
  if (!stored) {
    scryptSync(password, "dummy", 64, options);
    return false;
  }
  const [algorithm, n, r, p, salt, digest] = stored.split(":");
  if (
    algorithm !== "scrypt" ||
    n !== "65536" ||
    r !== "8" ||
    p !== "2" ||
    !/^[a-f0-9]{32}$/.test(salt || "") ||
    !/^[a-f0-9]{128}$/.test(digest || "")
  )
    return false;
  return timingSafeEqual(
    scryptSync(password, salt, 64, options),
    Buffer.from(digest, "hex"),
  );
}
export function encrypt(value, key) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", Buffer.from(key, "hex"), iv);
  const b = Buffer.concat([c.update(JSON.stringify(value), "utf8"), c.final()]);
  return [
    iv.toString("base64"),
    c.getAuthTag().toString("base64"),
    b.toString("base64"),
  ].join(".");
}
export function decrypt(value, key) {
  const [iv, tag, body] = value.split(".");
  const d = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(key, "hex"),
    Buffer.from(iv, "base64"),
  );
  d.setAuthTag(Buffer.from(tag, "base64"));
  return JSON.parse(
    Buffer.concat([d.update(Buffer.from(body, "base64")), d.final()]).toString(
      "utf8",
    ),
  );
}
export function validPassword(value) {
  return typeof value === "string" && value.length >= 12 && value.length <= 128;
}
export function validCPF(value) {
  const cpf = String(value || "").replace(/\D/g, "");
  if (cpf.length !== 11 || /^(.)\1+$/.test(cpf)) return false;
  for (let size = 9; size <= 10; size++) {
    let sum = 0;
    for (let i = 0; i < size; i++) sum += Number(cpf[i]) * (size + 1 - i);
    if (Number(cpf[size]) !== ((sum * 10) % 11) % 10) return false;
  }
  return true;
}
