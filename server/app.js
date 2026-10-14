import express from "express";
import helmet from "helmet";
import multer from "multer";
import { fileURLToPath } from "node:url";
import { openStore } from "./store.js";
import { auth } from "./auth.js";
import { id, hash, lookup, encrypt, decrypt } from "./security.js";
import {
  fail,
  now,
  text,
  date,
  cents,
  patientInput,
  packageView,
  progress,
  ensureRenewal,
  financial,
} from "./domain.js";
import { pdf, word, money, contractLines } from "./documents.js";
export function createApp(c) {
  const s = openStore(c),
    app = express(),
    a = auth(s, c);
  const account = s.db.prepare("SELECT email FROM account WHERE id=1").get();
  if (account && account.email.toLowerCase() !== c.email.toLowerCase()) {
    s.close();
    throw new Error(
      "PROFESSIONAL_EMAIL difere da conta existente. Migração de conta exige revisão.",
    );
  }
  app.disable("x-powered-by");
  if (c.env === "production") app.set("trust proxy", 1);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", "data:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: c.env === "production" ? [] : null,
        },
      },
      strictTransportSecurity: c.env === "production",
    }),
  );
  app.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (c.env === "production" && !req.secure)
      return res.status(426).json({ error: "HTTPS obrigatório." });
    if (
      !["GET", "HEAD"].includes(req.method) &&
      req.headers.origin &&
      req.headers.origin !== new URL(c.url).origin
    )
      return res.status(403).json({ error: "Origem não autorizada." });
    next();
  });
  app.use(express.json({ limit: "256kb" }));
  app.use("/api/auth", a.router);
  app.use("/api", a.guard);
  const read = (table, key) => {
    const record = s.get(table, key);
    if (!record) throw fail("Registro não encontrado.", 404);
    return record;
  };
  const auditRead = (action, key) => s.audit(action, key);
  function mutate(route, fn, method = "post") {
    app[method](route, (req, res) => {
      const key = req.headers["idempotency-key"];
      if (typeof key !== "string" || !/^[a-zA-Z0-9-]{16,80}$/.test(key))
        throw fail("Identificador da operação ausente.");
      const fingerprint = lookup(
        req.method + req.path + JSON.stringify(req.body),
        c.key,
      );
      const old = s.db.prepare("SELECT * FROM operations WHERE key=?").get(key);
      if (old) {
        if (old.fingerprint !== fingerprint)
          throw fail("Identificador já usado para outra operação.", 409);
        return res.json(decrypt(old.response, c.key));
      }
      const result = s.transaction(() => {
        const data = fn(req);
        s.db
          .prepare("INSERT INTO operations VALUES (?,?,?)")
          .run(key, fingerprint, encrypt(data, c.key));
        return data;
      });
      res.json(result);
    });
  }
  app.get("/api/me", (req, res) =>
    res.json({
      name: "Samira Costa",
      crp: "12/11679",
      email: c.email,
      csrf: req.session.csrf,
      mode: c.mode,
      idleMinutes: c.idle / 60000,
    }),
  );
  app.post("/api/activity", (req, res) => res.json({ ok: true }));
  app.post("/api/logout", (req, res) => {
    s.db
      .prepare("DELETE FROM sessions WHERE token_hash=?")
      .run(req.session.hash);
    res.clearCookie("sc_session", { path: "/" });
    s.audit("auth.logout");
    res.json({ ok: true });
  });
  app.get("/api/dashboard", (req, res) => {
    const packages = s.all("packages").map((p) => packageView(s, p));
    const f = financial(
      s,
      req.query.month || new Date().toISOString().slice(0, 7),
    );
    res.json({
      activePatients: s.all("patients").filter((p) => !p.archived).length,
      pendingSessions: packages.reduce((n, p) => n + p.remaining, 0),
      endingPackages: packages.filter((p) => p.remaining === 1).length,
      pendingRequests: s.all("requests").filter((r) => r.status === "pendente")
        .length,
      pendingPayments: packages.filter((p) => p.pending > 0).length,
      finance: f.totals,
      recentRequests: s
        .all("requests")
        .filter((r) => r.status === "pendente")
        .slice(-4)
        .reverse(),
    });
  });
  app.get("/api/patients", (req, res) => {
    auditRead("patients.read");
    res.json(
      s.all("patients").map((p) => ({
        ...p,
        cpf: undefined,
        emergency: undefined,
        packages: s
          .all("packages")
          .filter((x) => x.patient_id === p.id)
          .map((x) => packageView(s, x)),
      })),
    );
  });
  app.get("/api/patients/:id", (req, res) => {
    const p = read("patients", req.params.id);
    auditRead("patient.read", p.id);
    res.json({
      ...p,
      packages: s
        .all("packages")
        .filter((x) => x.patient_id === p.id)
        .map((x) => packageView(s, x)),
      history: s.db
        .prepare("SELECT * FROM audit WHERE entity=? ORDER BY at DESC")
        .all(p.id),
    });
  });
  mutate("/api/patients", (req) => {
    const input = patientInput(req.body);
    const cpfHash = lookup(input.cpf, c.key);
    if (s.db.prepare("SELECT id FROM patients WHERE cpf_hash=?").get(cpfHash))
      throw fail("CPF já cadastrado, inclusive em arquivos.", 409);
    const p = s.add(
      "patients",
      { ...input, createdAt: now(), archived: 0 },
      { cpf_hash: cpfHash, archived: 0 },
    );
    s.audit("patient.created", p.id);
    return p;
  });
  mutate(
    "/api/patients/:id",
    (req) => {
      read("patients", req.params.id);
      const input = patientInput(req.body),
        cpfHash = lookup(input.cpf, c.key);
      if (
        s.db
          .prepare("SELECT id FROM patients WHERE cpf_hash=? AND id<>?")
          .get(cpfHash, req.params.id)
      )
        throw fail("CPF já cadastrado.", 409);
      const p = s.update("patients", req.params.id, input, {
        cpf_hash: cpfHash,
      });
      s.audit("patient.updated", p.id);
      return p;
    },
    "put",
  );
  mutate("/api/patients/:id/archive", (req) => {
    const archived = req.body.archived === true ? 1 : 0;
    const p = s.update("patients", req.params.id, { archived }, { archived });
    s.audit(archived ? "patient.archived" : "patient.reactivated", p.id);
    return p;
  });
  app.get("/api/catalog", (req, res) => res.json(s.all("catalog")));
  mutate(
    "/api/catalog/:id",
    (req) => {
      read("catalog", req.params.id);
      const p = s.update("catalog", req.params.id, {
        price: cents(req.body.price),
      });
      s.audit("catalog.price_updated", p.id);
      return p;
    },
    "put",
  );
  function createContract(p, overrides = {}) {
    const patient = read("patients", p.patient_id),
      settings = read("settings", "practice");
    const version =
      s.all("contracts").filter((x) => x.package_id === p.id).length + 1;
    const created_at = now();
    return s.add(
      "contracts",
      {
        patient: {
          name: patient.name,
          cpf: patient.cpf,
          email: patient.email,
          phone: patient.phone,
        },
        professionalEmail: c.email,
        address: settings.address,
        package: {
          name: p.name,
          sessions: p.sessions,
          price: p.price,
          paymentMethod: p.paymentMethod,
          installments: p.installments,
          dueDate: p.dueDate,
        },
        terms: settings.terms,
        feeBearer: settings.feeBearer,
        provisional: !settings.termsApproved || !settings.address,
        version,
        status: "minuta",
        history: [{ at: created_at, status: "minuta" }],
        ...overrides,
      },
      { package_id: p.id, version, created_at },
    );
  }
  mutate("/api/packages", (req) => {
    const patient = read("patients", req.body.patientId);
    if (patient.archived)
      throw fail("Paciente arquivado. Reative antes de contratar.");
    if (req.body.clientConfirmed !== true)
      throw fail("Confirme o consentimento do cliente para contratar.");
    const catalog = read("catalog", req.body.catalogId);
    const paymentMethod = text(
      req.body.paymentMethod,
      "Forma de pagamento",
      30,
    );
    if (!["Pix", "Cartão", "Dinheiro", "Transferência"].includes(paymentMethod))
      throw fail("Forma de pagamento inválida.");
    const installments = Number(req.body.installments || 1);
    if (
      !Number.isInteger(installments) ||
      installments < 1 ||
      installments > 6 ||
      (paymentMethod !== "Cartão" && installments !== 1)
    )
      throw fail("Parcelas inválidas.");
    const dueDate = date(req.body.dueDate, "Vencimento");
    if (req.body.renewalId) {
      const r = read("requests", req.body.renewalId);
      if (
        r.kind !== "renovacao" ||
        r.patientId !== patient.id ||
        r.renewedPackageId
      )
        throw fail("Renovação inválida ou já processada.", 409);
      s.update("requests", r.id, { status: "atendida", confirmation: true });
    }
    const p = s.add(
      "packages",
      {
        name: catalog.name,
        sessions: catalog.sessions,
        price: catalog.price,
        paymentMethod,
        installments,
        dueDate,
        clientConfirmed: true,
        chargeAbsenceAllowed: req.body.chargeAbsenceAllowed === true,
      },
      { patient_id: patient.id, created_at: now() },
    );
    const contract = createContract(p);
    if (req.body.renewalId)
      s.update("requests", req.body.renewalId, { renewedPackageId: p.id });
    s.audit("package.contracted", patient.id);
    return { package: packageView(s, p), contract };
  });
  app.get("/api/packages", (req, res) =>
    res.json(s.all("packages").map((p) => packageView(s, p))),
  );
  app.get("/api/packages/:id/sessions", (req, res) => {
    read("packages", req.params.id);
    res.json(
      s
        .all("appointments")
        .filter((x) => x.package_id === req.params.id)
        .map((x) => ({
          ...x,
          versions: s
            .all("session_versions")
            .filter((v) => v.session_id === x.id),
        })),
    );
  });
  function sessionInput(b, p) {
    const status = text(b.status, "Situação", 20);
    if (!["realizada", "falta", "cancelada", "remarcada"].includes(status))
      throw fail("Situação inválida.");
    const charged = status === "falta" && b.charged === true;
    if (charged && !p.chargeAbsenceAllowed)
      throw fail("Este contrato não autoriza cobrança de falta.");
    return {
      date: date(b.date, "Data do atendimento"),
      status,
      charged,
      note: text(b.note || "", "Observação administrativa", 500, false),
      suggestion: b.suggestion
        ? date(b.suggestion, "Sugestão de remarcação")
        : null,
    };
  }
  mutate("/api/sessions", (req) => {
    const p = read("packages", req.body.packageId),
      input = sessionInput(req.body, p);
    if (
      (input.status === "realizada" || input.charged) &&
      progress(s, p).remaining <= 0
    )
      throw fail("Saldo de sessões esgotado.", 409);
    const appointment = s.add("appointments", input, { package_id: p.id });
    s.add(
      "session_versions",
      { ...input, reason: "Registro inicial" },
      { session_id: appointment.id, created_at: now() },
    );
    ensureRenewal(s, p);
    s.audit("session.created", p.patient_id);
    return appointment;
  });
  mutate(
    "/api/sessions/:id",
    (req) => {
      const old = read("appointments", req.params.id),
        p = read("packages", old.package_id),
        input = sessionInput(req.body, p);
      const reason = text(req.body.reason, "Motivo da correção", 500);
      const oldUsed =
        old.status === "realizada" || (old.status === "falta" && old.charged);
      if (
        (input.status === "realizada" || input.charged) &&
        !oldUsed &&
        progress(s, p).remaining <= 0
      )
        throw fail("Saldo esgotado.", 409);
      s.add(
        "session_versions",
        { ...input, reason },
        { session_id: old.id, created_at: now() },
      );
      const result = s.update("appointments", old.id, input);
      ensureRenewal(s, p);
      if (progress(s, p).remaining > 0) {
        const r = s
          .all("requests")
          .find((x) => x.dedupe_key === `renewal:${p.id}`);
        if (r && !r.renewedPackageId)
          s.update("requests", r.id, {
            status: "cancelada",
            note: "Correção de sessão devolveu saldo.",
          });
      }
      s.audit("session.corrected", p.patient_id);
      return result;
    },
    "put",
  );
  // Todas as interfaces clínicas são exclusivas de sessão autenticada da profissional.
  app.get("/api/clinical/:patientId", (req, res) => {
    read("patients", req.params.patientId);
    auditRead("clinical.read", req.params.patientId);
    res.json(
      s
        .all("clinical")
        .filter((x) => x.patient_id === req.params.patientId)
        .map((x) => ({
          ...x,
          versions: s
            .all("clinical_versions")
            .filter((v) => v.clinical_id === x.id),
        }))
        .sort((x, y) => y.date.localeCompare(x.date)),
    );
  });
  mutate("/api/clinical", (req) => {
    read("patients", req.body.patientId);
    if (req.body.reviewed !== true)
      throw fail("Revise o texto antes de salvar.");
    const data = {
      date: date(req.body.date, "Data do atendimento"),
      text: text(req.body.text, "Evolução", 20000),
      professional: "Samira Costa — CRP 12/11679",
    };
    const entry = s.add("clinical", data, {
      patient_id: req.body.patientId,
      created_at: now(),
    });
    s.add(
      "clinical_versions",
      { ...data, kind: "original", reason: "Registro inicial" },
      { clinical_id: entry.id, created_at: now() },
    );
    s.audit("clinical.created", req.body.patientId);
    return { id: entry.id };
  });
  mutate(
    "/api/clinical/:id",
    (req) => {
      const old = read("clinical", req.params.id);
      if (req.body.reviewed !== true)
        throw fail("Revise o texto antes de salvar.");
      const kind = req.body.kind;
      if (!["correcao", "complemento"].includes(kind))
        throw fail("Tipo de alteração inválido.");
      const newText = text(req.body.text, "Texto", 20000),
        reason = text(req.body.reason, "Motivo", 500);
      const updatedText =
        kind === "complemento"
          ? old.text + "\n\nComplemento (" + now() + "): " + newText
          : newText;
      if (updatedText.length > 100000)
        throw fail("Registro muito extenso. Crie outra evolução.");
      s.add(
        "clinical_versions",
        {
          text: newText,
          date: old.date,
          professional: old.professional,
          kind,
          reason,
        },
        { clinical_id: old.id, created_at: now() },
      );
      s.update("clinical", old.id, { text: updatedText });
      s.audit("clinical.revised", old.patient_id);
      return { id: old.id };
    },
    "put",
  );
  app.post("/api/clinical/:patientId/export", async (req, res) => {
    const patient = read("patients", req.params.patientId);
    if (
      !Array.isArray(req.body.ids) ||
      !req.body.ids.length ||
      req.body.reviewed !== true
    )
      throw fail("Selecione registros e confirme revisão.");
    const selected = req.body.ids.map((key) => read("clinical", key));
    if (selected.some((x) => x.patient_id !== patient.id))
      throw fail("Registro de outro paciente.", 403);
    auditRead("clinical.export", patient.id);
    const lines = [
      `Paciente: ${patient.name}. CPF: ${patient.cpf}.`,
      "Cópia dos registros selecionados para revisão da profissional. Não constitui diagnóstico ou relatório psicológico conclusivo.",
      ...selected.flatMap((x) => [
        `${x.date} | ${x.professional}`,
        x.text,
        ...s
          .all("clinical_versions")
          .filter((v) => v.clinical_id === x.id)
          .flatMap((v) => [
            `Versão ${v.created_at} | ${v.kind} | ${v.reason}`,
            v.text,
          ]),
      ]),
    ];
    res
      .type("pdf")
      .attachment("evolucoes-revisao.pdf")
      .send(await pdf("Registros clínicos para revisão", lines));
  });
  app.get("/api/contracts", (req, res) =>
    res.json(
      s.all("contracts").map((x) => ({
        ...x,
        signedFiles: s
          .all("signed_files")
          .filter((f) => f.contract_id === x.id)
          .map((f) => ({
            id: f.id,
            name: f.name,
            sha256: f.sha256,
            validation: f.validation,
          })),
      })),
    ),
  );
  mutate("/api/contracts/:id/revise", (req) => {
    const old = read("contracts", req.params.id),
      p = read("packages", old.package_id);
    const terms = text(req.body.terms, "Condições", 30000);
    const result = createContract(p, {
      terms,
      provisional:
        req.body.reviewed !== true || !read("settings", "practice").address,
      revisionReason: text(req.body.reason, "Motivo da versão", 500),
    });
    s.audit("contract.version_created", old.package_id);
    return result;
  });
  mutate("/api/contracts/:id/status", (req) => {
    const old = read("contracts", req.params.id);
    const status = req.body.status;
    const next = {
      minuta: ["enviado"],
      enviado: ["aguardando assinatura"],
      "aguardando assinatura": [],
    };
    if (!next[old.status]?.includes(status))
      throw fail("Transição inválida. A assinatura exige importar o PDF.");
    if (old.provisional || req.body.reviewed !== true)
      throw fail(
        "Revise a minuta, configure o endereço e confirme revisão antes de registrar envio.",
      );
    const history = [
      ...old.history,
      { at: now(), status, method: "Registro manual pela profissional" },
    ];
    s.audit("contract.status", old.id);
    return s.update("contracts", old.id, { status, history });
  });
  app.get("/api/contracts/:id/download/:format", async (req, res) => {
    const contract = read("contracts", req.params.id);
    const format = req.params.format;
    if (!["pdf", "docx"].includes(format)) throw fail("Formato inválido.");
    auditRead("contract.export", contract.id);
    res
      .type(
        format === "pdf"
          ? "application/pdf"
          : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      )
      .attachment(`contrato-v${contract.version}.${format}`)
      .send(
        await (format === "pdf"
          ? pdf("Minuta de atendimento psicológico", contractLines(contract))
          : word("Minuta de atendimento psicológico", contractLines(contract))),
      );
  });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  });
  app.post("/api/contracts/:id/signed", upload.single("file"), (req, res) => {
    const old = read("contracts", req.params.id);
    if (!req.file || req.file.buffer.subarray(0, 5).toString() !== "%PDF-")
      throw fail("Envie um PDF de até 10 MB.");
    if (old.provisional)
      throw fail("Não importar assinatura de minuta provisória.");
    if (req.body.validated !== "true")
      throw fail(
        "Valide ambas as assinaturas no ITI e confirme antes de importar.",
      );
    const digest = hash(req.file.buffer);
    const existing = s.all("signed_files").find((f) => f.sha256 === digest);
    if (existing) {
      if (existing.contract_id !== old.id)
        throw fail("Arquivo já importado em outro contrato.", 409);
      return res.json({ id: existing.id });
    }
    const file = s.transaction(() => {
      const f = s.add(
        "signed_files",
        {
          name: "contrato-assinado.pdf",
          data: req.file.buffer.toString("base64"),
          sha256: digest,
          validation:
            "Validação declarada pela profissional no ITI; sistema não verificou assinaturas criptográficas.",
          uploadedAt: now(),
        },
        { contract_id: old.id },
      );
      s.update("contracts", old.id, {
        status: "assinado",
        history: [
          ...old.history,
          {
            at: now(),
            status: "assinado",
            method: "Importação com validação manual declarada",
          },
        ],
      });
      s.audit("contract.signed_import", old.id);
      return f;
    });
    res.json({ id: file.id });
  });
  app.get("/api/signed/:id", (req, res) => {
    const f = read("signed_files", req.params.id);
    auditRead("contract.signed_download", f.id);
    res.type("pdf").attachment(f.name).send(Buffer.from(f.data, "base64"));
  });
  app.get("/api/requests", (req, res) =>
    res.json(
      s
        .all("requests")
        .sort((x, y) => y.created_at.localeCompare(x.created_at)),
    ),
  );
  mutate("/api/requests", (req) => {
    const kind = req.body.kind;
    if (
      !["primeiro contato", "reagendamento", "pacotes", "outros"].includes(kind)
    )
      throw fail("Tipo inválido.");
    const name = text(req.body.name, "Identificação", 150),
      message = text(req.body.message, "Solicitação administrativa", 1000);
    const patientId = req.body.patientId || null;
    if (patientId) read("patients", patientId);
    const suggestion = req.body.suggestion
      ? date(req.body.suggestion, "Sugestão")
      : null;
    const r = s.add(
      "requests",
      {
        kind,
        name,
        message,
        patientId,
        suggestion,
        status: "pendente",
        source: c.mode === "demo" ? "Demonstração local" : "Registro manual",
        availabilityConfirmed: false,
      },
      { created_at: now(), dedupe_key: `manual:${id()}` },
    );
    s.audit("request.created", r.id);
    return r;
  });
  mutate(
    "/api/requests/:id",
    (req) => {
      const old = read("requests", req.params.id);
      if (!["pendente", "atendida"].includes(req.body.status))
        throw fail("Estado inválido.");
      const note = text(
        req.body.note || "",
        "Resposta administrativa",
        1000,
        false,
      );
      s.audit("request.updated", old.id);
      return s.update("requests", old.id, {
        status: req.body.status,
        note,
        updatedAt: now(),
      });
    },
    "put",
  );
  app.post("/api/requests/:id/payment-link", (req, res) => {
    const r = read("requests", req.params.id);
    if (req.body.clientConfirmed !== true)
      throw fail("Solicite confirmação do cliente antes de preparar cobrança.");
    read("patients", r.patientId);
    res.status(501).json({
      error:
        "Integração pendente: processador não ativado. Nenhum link ou cobrança foi gerado. Use registro manual de recebimento verificado.",
    });
  });
  app.get("/api/finance", (req, res) =>
    res.json(financial(s, req.query.month)),
  );
  mutate("/api/ledger", (req) => {
    const type = req.body.type;
    if (!["receipt", "refund", "fee", "expense"].includes(type))
      throw fail("Tipo financeiro inválido.");
    const amount = cents(req.body.amount),
      entryDate = date(req.body.date);
    const description = text(req.body.description, "Descrição", 250);
    let pkg = null;
    if (["receipt", "refund"].includes(type)) {
      pkg = read("packages", req.body.packageId);
      const v = packageView(s, pkg);
      if (type === "receipt" && amount > v.pending)
        throw fail("Recebimento excede o saldo pendente.", 409);
      if (type === "refund" && amount > v.paid)
        throw fail("Restituição excede o valor recebido.", 409);
      if (req.body.verified !== true)
        throw fail("Confirme verificação do recebimento ou restituição.");
    }
    const reference = text(
      req.body.reference,
      "Referência única do comprovante",
      150,
    );
    if (s.all("ledger").some((x) => x.reference === reference))
      throw fail("Comprovante/referência já registrado.", 409);
    const entry = s.add(
      "ledger",
      {
        type,
        amount,
        date: entryDate,
        description,
        reference,
        method: "manual",
        verified: req.body.verified === true,
      },
      { package_id: pkg?.id || null, created_at: now() },
    );
    s.audit("finance.manual_entry", entry.id);
    return entry;
  });
  app.get("/api/finance/export/:format", async (req, res) => {
    const f = financial(s, req.query.month);
    auditRead("finance.export", f.month);
    const labels = {
      receipt: "Recebimento",
      refund: "Restituição",
      fee: "Taxa",
      expense: "Despesa",
    };
    if (req.params.format === "csv") {
      const cell = (v) =>
        '"' +
        String(v)
          .replace(/^[=+@-]/, "'$&")
          .replace(/"/g, '""') +
        '"';
      const rows = [
        [
          "Data",
          "Tipo",
          "Descrição",
          "Referência",
          "Valor R$",
          "Identificador",
        ],
        ...f.ledger.map((l) => [
          l.date,
          labels[l.type],
          l.description,
          l.reference,
          (l.amount / 100).toFixed(2).replace(".", ","),
          l.id,
        ]),
        [],
        ["Mês", f.month],
        ...Object.entries(f.totals).map(([k, v]) => [
          k,
          (v / 100).toFixed(2).replace(".", ","),
        ]),
        ["Escopo pendências", f.pendingScope],
      ];
      return res
        .type("text/csv; charset=utf-8")
        .attachment(`demonstrativo-${f.month}.csv`)
        .send(
          "\uFEFF" + rows.map((row) => row.map(cell).join(";")).join("\r\n"),
        );
    }
    if (req.params.format !== "pdf") throw fail("Formato inválido.");
    const lines = [
      `Competência: ${f.month}. Datas de recebimento independem das datas de atendimento.`,
      ...Object.entries(f.totals).map(
        ([k, v]) =>
          `${{ contracted: "Contratado no mês", received: "Recebido no mês", refunds: "Restituições", fees: "Taxas", expenses: "Despesas", pending: "Pendências de todos os contratos", balance: "Saldo de caixa do mês" }[k]}: ${money(v)}`,
      ),
      "Saldo não representa lucro contábil.",
      ...f.ledger.map(
        (l) =>
          `${l.date} | ${labels[l.type]} | ${l.description} | ${money(l.amount)} | ref. ${l.reference} | ${l.id}`,
      ),
      `Sessões registradas no mês: ${f.sessions.length}.`,
      ...f.sessions.map((x) => `${x.date} | ${x.status} | ${x.id}`),
    ];
    res
      .type("pdf")
      .attachment(`demonstrativo-${f.month}.pdf`)
      .send(await pdf("Demonstrativo financeiro mensal", lines));
  });
  app.get("/api/settings", (req, res) =>
    res.json(read("settings", "practice")),
  );
  mutate(
    "/api/settings",
    (req) => {
      const address = text(req.body.address || "", "Endereço", 500, false),
        terms = text(req.body.terms, "Condições", 30000);
      if (!["professional", "client"].includes(req.body.feeBearer))
        throw fail("Responsável pelas taxas inválido.");
      s.audit("settings.updated");
      return s.update("settings", "practice", {
        address,
        terms,
        termsApproved: req.body.termsApproved === true,
        feeBearer: req.body.feeBearer,
      });
    },
    "put",
  );
  app.get("/api/integrations", (req, res) =>
    res.json({
      email: { active: c.mail === "smtp", mode: c.mail, recipient: c.email },
      whatsapp: {
        active: false,
        phone: "+55 47 99765-2192",
        status:
          "Conector oficial pendente; demonstração local não envia mensagens.",
      },
      payment: {
        active: false,
        status:
          "Processador e webhooks verificáveis pendentes; nenhum dado de cartão armazenado.",
      },
      transcription: {
        active: false,
        status:
          "Motor local pendente. Importação manual de texto e revisão disponíveis. Nenhum áudio enviado.",
      },
      govbr: {
        active: false,
        status:
          "Assinatura externa manual e importação do PDF; sem integração direta.",
      },
    }),
  );
  app.get("/api/audit", (req, res) =>
    res.json(
      s.db.prepare("SELECT * FROM audit ORDER BY at DESC LIMIT 200").all(),
    ),
  );
  app.use("/api", (req, res) =>
    res.status(404).json({ error: "Rota não encontrada." }),
  );
  app.use(
    express.static(fileURLToPath(new URL("../public", import.meta.url)), {
      etag: false,
    }),
  );
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const status = err.status || (err.code === "LIMIT_FILE_SIZE" ? 413 : 500);
    if (status === 500) console.error("Falha interna:", err.code || err.name);
    res.status(status).json({
      error:
        status === 500
          ? "Falha interna. Consulte o servidor sem registrar dados clínicos."
          : err.message,
    });
  });
  return { app, store: s };
}
