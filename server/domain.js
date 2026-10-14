import { validCPF } from "./security.js";
export const fail = (text, status = 400) =>
  Object.assign(new Error(text), { status });
export const now = () => new Date().toISOString();
export const monthOf = (value) =>
  value.length === 10
    ? value.slice(0, 7)
    : new Date(value)
        .toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
        .slice(0, 7);
export function text(value, label, max = 200, required = true) {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim())
  )
    throw fail(`${label} inválido.`);
  return value.trim();
}
export function date(value, label = "Data") {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{3})?)?Z?)?$/.test(value) ||
    isNaN(Date.parse(value))
  )
    throw fail(`${label} inválida.`);
  if (
    new Date(value.slice(0, 10) + "T12:00:00Z").toISOString().slice(0, 10) !==
    value.slice(0, 10)
  )
    throw fail(`${label} inválida.`);
  return value;
}
export function cents(value, label = "Valor") {
  if (!Number.isSafeInteger(value) || value <= 0 || value > 100000000)
    throw fail(`${label} deve ser positivo, em centavos.`);
  return value;
}
export function patientInput(b) {
  const cpf = String(b.cpf || "").replace(/\D/g, "");
  if (!validCPF(cpf)) throw fail("CPF inválido.");
  const email = text(b.email, "E-mail", 254);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail("E-mail inválido.");
  const phone = text(b.phone, "Telefone", 30);
  if (phone.replace(/\D/g, "").length < 10) throw fail("Telefone inválido.");
  return {
    name: text(b.name, "Nome", 150),
    cpf,
    email,
    phone,
    emergency: text(b.emergency, "Contato de emergência", 250),
  };
}
export function progress(s, pkg) {
  const sessions = s.all("appointments").filter((a) => a.package_id === pkg.id);
  const used = sessions.filter(
    (a) => a.status === "realizada" || (a.status === "falta" && a.charged),
  ).length;
  return {
    used,
    remaining: Math.max(0, pkg.sessions - used),
    sessions: pkg.sessions,
  };
}
export function packageView(s, p) {
  const paid = s
    .all("ledger")
    .filter((l) => l.package_id === p.id)
    .reduce(
      (n, l) =>
        n +
        (l.type === "receipt" ? l.amount : l.type === "refund" ? -l.amount : 0),
      0,
    );
  return {
    ...p,
    ...progress(s, p),
    paid,
    pending: Math.max(0, p.price - paid),
  };
}
export function ensureRenewal(s, p) {
  if (p.sessions === 1 || progress(s, p).remaining > 0) return;
  const key = `renewal:${p.id}`;
  const old = s.all("requests").find((r) => r.dedupe_key === key);
  if (old) {
    if (old.status === "cancelada" && !old.renewedPackageId) {
      s.update("requests", old.id, {
        status: "pendente",
        note: "Saldo voltou a ser esgotado após correção.",
      });
      s.audit("renewal.reopened", p.id);
    }
    return;
  }
  s.add(
    "requests",
    {
      kind: "renovacao",
      patientId: p.patient_id,
      packageId: p.id,
      status: "pendente",
      name: s.get("patients", p.patient_id).name,
      message: `Seu pacote ${p.name} foi finalizado. Deseja renovar? Informe forma de pagamento e, para cartão, quantidade de parcelas (até 6). A contratação depende da sua confirmação. Nenhuma cobrança foi gerada.`,
      confirmation: false,
    },
    { dedupe_key: key, created_at: now() },
  );
  s.audit("renewal.requested", p.id);
}
export function financial(s, month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month || "")) throw fail("Mês inválido.");
  const ledger = s.all("ledger").filter((l) => monthOf(l.date) === month);
  const totals = {
    contracted: 0,
    received: 0,
    refunds: 0,
    fees: 0,
    expenses: 0,
    pending: 0,
    balance: 0,
  };
  for (const p of s.all("packages")) {
    if (monthOf(p.created_at) === month) totals.contracted += p.price;
    totals.pending += packageView(s, p).pending;
  }
  for (const l of ledger)
    totals[
      {
        receipt: "received",
        refund: "refunds",
        fee: "fees",
        expense: "expenses",
      }[l.type]
    ] += l.amount;
  totals.balance =
    totals.received - totals.refunds - totals.fees - totals.expenses;
  const sessions = s
    .all("appointments")
    .filter((a) => monthOf(a.date) === month);
  return {
    month,
    totals,
    ledger,
    sessions: sessions.map((a) => ({
      id: a.id,
      date: a.date,
      status: a.status,
      charged: a.charged,
    })),
    pendingScope: "Saldo de contratos em aberto em todas as competências",
  };
}
