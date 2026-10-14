import { config } from "../server/config.js";
import { openStore } from "../server/store.js";
import { lookup, id } from "../server/security.js";
import { now } from "../server/domain.js";
const c = config();
if (c.mode !== "demo" || c.env === "production")
  throw new Error("Dados fictícios somente em ambiente demo.");
const s = openStore(c);
try {
  if (s.all("patients").length) {
    console.log("Base contém pacientes; nenhum dado foi substituído.");
  } else {
    s.transaction(() => {
      for (const [name, cpf, pack, price, sessions, used] of [
        ["Marina Oliveira (fictícia)", "52998224725", "Mensal", 88000, 4, 3],
        ["Lucas Ferreira (fictício)", "11144477735", "Quinzenal", 44000, 2, 1],
        ["Beatriz Almeida (fictícia)", "12345678909", "Mensal", 88000, 4, 0],
      ]) {
        const p = s.add(
          "patients",
          {
            name,
            cpf,
            phone: "47900000000",
            email: "paciente@example.invalid",
            emergency: "Contato fictício • 47900000001",
            createdAt: now(),
            archived: 0,
            demo: true,
          },
          { cpf_hash: lookup(cpf, c.key), archived: 0 },
        );
        const pkg = s.add(
          "packages",
          {
            name: pack,
            price,
            sessions,
            paymentMethod: "Pix",
            installments: 1,
            dueDate: new Date().toISOString().slice(0, 10),
            chargeAbsenceAllowed: false,
            clientConfirmed: true,
          },
          { patient_id: p.id, created_at: now() },
        );
        for (let n = 0; n < used; n++) {
          const input = {
            date: now(),
            status: "realizada",
            charged: false,
            note: "Exemplo administrativo",
          };
          const a = s.add("appointments", input, { package_id: pkg.id });
          s.add(
            "session_versions",
            { ...input, reason: "Registro inicial fictício" },
            { session_id: a.id, created_at: now() },
          );
        }
        if (used)
          s.add(
            "ledger",
            {
              type: "receipt",
              amount: price,
              date: new Date().toISOString().slice(0, 10),
              description: "Recebimento fictício",
              reference: "DEMO-" + id(),
              method: "manual",
              verified: true,
            },
            { package_id: pkg.id, created_at: now() },
          );
      }
      s.add(
        "requests",
        {
          name: "Marina Oliveira (fictícia)",
          kind: "reagendamento",
          message: "Gostaria de sugerir outro horário para a próxima sessão.",
          status: "pendente",
          source: "Demonstração local",
          availabilityConfirmed: false,
        },
        { dedupe_key: "demo-request", created_at: now() },
      );
      s.add(
        "ledger",
        {
          type: "expense",
          amount: 12000,
          date: new Date().toISOString().slice(0, 10),
          description: "Despesa fictícia de demonstração",
          reference: "DEMO-DESPESA",
          method: "manual",
        },
        { package_id: null, created_at: now() },
      );
      s.audit("demo.seeded");
    });
    console.log(
      "Três pacientes fictícios e registros administrativos criados. Nenhum dado clínico real.",
    );
  }
} finally {
  s.close();
}
