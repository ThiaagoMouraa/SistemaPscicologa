import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { createApp } from "../server/app.js";
import { config } from "../server/config.js";
import { passwordHash, hash } from "../server/security.js";
import { backupStore, restoreBackup } from "../server/backup.js";
import { openStore } from "../server/store.js";
import { welcome, administrativeReply } from "../server/administrative.js";

test("Fluxos essenciais do consultório, segurança e restauração", async (t) => {
  const dir = path.resolve("test-output", randomUUID()),
    messages = [];
  const c = config({
    env: "test",
    mode: "demo",
    host: "127.0.0.1",
    url: "http://127.0.0.1:3000",
    dir: path.join(dir, "database"),
    key: randomBytes(32).toString("hex"),
    backupKey: randomBytes(32).toString("hex"),
    mail: "local",
    onMail: (message) => messages.push(message),
  });
  const { app, store } = createApp(c);
  const pass = "Somente-teste-123456!";
  store.db
    .prepare("INSERT INTO account VALUES (1,?,?)")
    .run(c.email, passwordHash(pass));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = "",
    csrf = "",
    patientId = "",
    packageId = "",
    contractId = "",
    sessionId = "",
    clinicalId = "";
  async function call(
    route,
    body,
    method = body ? "POST" : "GET",
    options = {},
  ) {
    const headers = { Cookie: options.anonymous ? "" : cookie };
    if (body) {
      headers["Content-Type"] = "application/json";
      headers["X-CSRF-Token"] = options.noCsrf ? "" : csrf;
      headers["Idempotency-Key"] = options.key || randomUUID();
    }
    const response = await fetch(base + "/api" + route, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const type = response.headers.get("content-type") || "";
    const data = type.includes("json")
      ? await response.json()
      : Buffer.from(await response.arrayBuffer());
    return { status: response.status, data, response };
  }
  async function signin() {
    const login = await call("/auth/login", { email: c.email, password: pass });
    assert.equal(login.status, 200);
    const code = messages.at(-1).code;
    const result = await call("/auth/verify", {
      challengeId: login.data.challengeId,
      code,
    });
    assert.equal(result.status, 200);
    cookie = result.response.headers.get("set-cookie").split(";")[0];
    csrf = result.data.csrf;
    return { challengeId: login.data.challengeId, code };
  }
  try {
    await t.test("Rotas e exportações negadas antes do login", async () => {
      for (const route of [
        "/me",
        "/dashboard",
        "/patients",
        "/clinical/abc",
        "/contracts/abc/download/pdf",
        "/signed/abc",
        "/finance/export/csv?month=2026-10",
      ])
        assert.equal(
          (await call(route, undefined, "GET", { anonymous: true })).status,
          401,
        );
      const index = await fetch(base);
      assert.equal(index.status, 200);
      assert.match(await index.text(), /lang="pt-BR"/);
      assert.match(
        index.headers.get("content-security-policy"),
        /frame-ancestors 'none'/,
      );
    });
    await t.test(
      "Senha incorreta, código inválido e código de uso único",
      async () => {
        assert.equal(
          (await call("/auth/login", { email: c.email, password: "errada" }))
            .status,
          401,
        );
        const login = await call("/auth/login", {
          email: c.email,
          password: pass,
        });
        assert.equal(login.status, 200);
        assert.equal(
          (
            await call("/auth/verify", {
              challengeId: login.data.challengeId,
              code: "000000",
            })
          ).status,
          400,
        );
        const code = messages.at(-1).code;
        const result = await call("/auth/verify", {
          challengeId: login.data.challengeId,
          code,
        });
        assert.equal(result.status, 200);
        cookie = result.response.headers.get("set-cookie").split(";")[0];
        csrf = result.data.csrf;
        assert.equal(
          (
            await call("/auth/verify", {
              challengeId: login.data.challengeId,
              code,
            })
          ).status,
          400,
        );
        assert.equal((await call("/me")).data.email, c.email);
      },
    );
    await t.test("CSRF e origem de requisição protegidos", async () => {
      assert.equal(
        (await call("/patients", {}, "POST", { noCsrf: true })).status,
        403,
      );
      const response = await fetch(base + "/api/activity", {
        method: "POST",
        headers: {
          Cookie: cookie,
          Origin: "https://hostil.invalid",
          "X-CSRF-Token": csrf,
        },
      });
      assert.equal(response.status, 403);
    });
    const patient = {
      name: "Paciente de teste fictício",
      cpf: "52998224725",
      phone: "47900000000",
      email: "paciente@example.invalid",
      emergency: "Contato fictício 47900000001",
    };
    await t.test(
      "Validação, CPF duplicado e idempotência de cadastro",
      async () => {
        assert.equal(
          (await call("/patients", { ...patient, cpf: "11111111111" })).status,
          400,
        );
        assert.equal(
          (await call("/patients", { ...patient, email: "invalido" })).status,
          400,
        );
        const key = randomUUID();
        const result = await call("/patients", patient, "POST", { key });
        assert.equal(result.status, 200);
        patientId = result.data.id;
        assert.equal(
          (await call("/patients", patient, "POST", { key })).data.id,
          patientId,
        );
        assert.equal(
          (
            await call("/patients", { ...patient, name: "Mudou" }, "POST", {
              key,
            })
          ).status,
          409,
        );
        assert.equal((await call("/patients", patient)).status, 409);
        assert.equal(store.all("patients").length, 1);
        const stored = store.db.prepare("SELECT body FROM patients").get().body;
        assert.ok(
          !stored.includes(patient.name) && !stored.includes(patient.cpf),
        );
        const response = store.db
          .prepare("SELECT response FROM operations WHERE key=?")
          .get(key).response;
        assert.ok(!response.includes(patient.name));
        const edit = await call(
          "/patients/" + patientId,
          { ...patient, name: "Paciente editado fictício" },
          "PUT",
        );
        assert.equal(edit.status, 200);
      },
    );
    await t.test(
      "Contratação confirmada, minuta e preservação do preço original",
      async () => {
        const b = {
          patientId,
          catalogId: "quinzenal",
          paymentMethod: "Pix",
          installments: 1,
          dueDate: "2026-10-13",
          clientConfirmed: true,
          chargeAbsenceAllowed: false,
        };
        assert.equal(
          (await call("/packages", { ...b, clientConfirmed: false })).status,
          400,
        );
        assert.equal(
          (await call("/packages", { ...b, installments: 2 })).status,
          400,
        );
        assert.equal(
          (await call("/packages", { ...b, dueDate: "2026-02-30" })).status,
          400,
        );
        const r = await call("/packages", b);
        assert.equal(r.status, 200);
        packageId = r.data.package.id;
        contractId = r.data.contract.id;
        assert.equal(r.data.package.price, 44000);
        assert.equal(r.data.contract.provisional, true);
        assert.equal(
          (await call("/catalog/quinzenal", { price: 46000 }, "PUT")).status,
          200,
        );
        assert.equal(store.get("packages", packageId).price, 44000);
      },
    );
    await t.test(
      "Sessões: faltas não cobradas, cancelamentos, correção e renovação única",
      async () => {
        const b = {
          packageId,
          date: "2026-10-13T13:00:00.000Z",
          status: "falta",
          charged: true,
          note: "Administrativo",
        };
        assert.equal((await call("/sessions", b)).status, 400);
        const a = await call("/sessions", { ...b, charged: false });
        assert.equal(a.status, 200);
        sessionId = a.data.id;
        assert.equal((await call("/packages")).data[0].used, 0);
        assert.equal(
          (
            await call(
              "/sessions/" + sessionId,
              {
                ...b,
                charged: false,
                status: "realizada",
                reason: "Atendimento realizado",
              },
              "PUT",
            )
          ).status,
          200,
        );
        assert.equal((await call("/packages")).data[0].used, 1);
        const key = randomUUID();
        const b2 = {
          ...b,
          status: "realizada",
          charged: false,
          date: "2026-10-14T13:00:00.000Z",
        };
        assert.equal(
          (await call("/sessions", b2, "POST", { key })).status,
          200,
        );
        assert.equal(
          (await call("/sessions", b2, "POST", { key })).status,
          200,
        );
        assert.equal((await call("/packages")).data[0].used, 2);
        assert.equal(
          store.all("requests").filter((r) => r.kind === "renovacao").length,
          1,
        );
        assert.equal((await call("/sessions", b2)).status, 409);
        assert.equal(
          (await call("/sessions", { ...b2, status: "cancelada" })).status,
          200,
        );
        assert.equal(
          (
            await call("/sessions", {
              ...b2,
              status: "remarcada",
              suggestion: "2026-10-20T15:00:00.000Z",
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await call(
              "/sessions/" + sessionId,
              {
                ...b,
                status: "cancelada",
                charged: false,
                reason: "Correção administrativa",
              },
              "PUT",
            )
          ).status,
          200,
        );
        assert.equal((await call("/packages")).data[0].used, 1);
        assert.equal(
          store
            .all("session_versions")
            .filter((v) => v.session_id === sessionId).length,
          3,
        );
        assert.equal(store.all("requests")[0].status, "cancelada");
      },
    );
    await t.test(
      "Evolução revisada, correção e complemento com versões, sem vazamento nos logs",
      async () => {
        const data = {
          patientId,
          date: "2026-10-13T13:00:00.000Z",
          text: "CONTEUDO_CLINICO_FICTICIO_EXCLUSIVO",
          reviewed: true,
        };
        assert.equal(
          (await call("/clinical", { ...data, reviewed: false })).status,
          400,
        );
        const r = await call("/clinical", data);
        assert.equal(r.status, 200);
        clinicalId = r.data.id;
        assert.equal(
          (
            await call(
              "/clinical/" + clinicalId,
              {
                kind: "correcao",
                text: "Texto fictício corrigido",
                reason: "Correção revisada",
                reviewed: true,
              },
              "PUT",
            )
          ).status,
          200,
        );
        assert.equal(
          (
            await call(
              "/clinical/" + clinicalId,
              {
                kind: "complemento",
                text: "Complemento fictício",
                reason: "Complementação revisada",
                reviewed: true,
              },
              "PUT",
            )
          ).status,
          200,
        );
        const entries = (await call("/clinical/" + patientId)).data;
        assert.equal(entries[0].versions.length, 3);
        assert.match(entries[0].text, /Complemento fictício/);
        assert.ok(
          !JSON.stringify((await call("/dashboard")).data).includes(data.text),
        );
        assert.ok(
          !JSON.stringify((await call("/audit")).data).includes(data.text),
        );
        assert.ok(
          !JSON.stringify(
            store.db.prepare("SELECT body FROM clinical_versions").all(),
          ).includes(data.text),
        );
        const exportResult = await call("/clinical/" + patientId + "/export", {
          ids: [clinicalId],
          reviewed: true,
        });
        assert.equal(exportResult.status, 200);
        assert.equal(exportResult.data.subarray(0, 5).toString(), "%PDF-");
      },
    );
    await t.test(
      "Minuta individual PDF/Word, revisão, estados e arquivo assinado preservado",
      async () => {
        const result = await call("/contracts/" + contractId + "/download/pdf");
        assert.equal(result.status, 200);
        assert.equal(result.data.subarray(0, 5).toString(), "%PDF-");
        const word = await call("/contracts/" + contractId + "/download/docx");
        assert.equal(word.data.subarray(0, 2).toString(), "PK");
        assert.equal(
          (
            await call("/contracts/" + contractId + "/status", {
              status: "enviado",
              reviewed: true,
            })
          ).status,
          400,
        );
        const settings = store.get("settings", "practice");
        assert.equal(
          (
            await call(
              "/settings",
              {
                ...settings,
                address: "Endereço fictício para teste",
                terms:
                  "Condições fictícias de teste revisadas manualmente. Sem negativação automática.",
                termsApproved: true,
              },
              "PUT",
            )
          ).status,
          200,
        );
        const revision = await call("/contracts/" + contractId + "/revise", {
          terms:
            "Condições fictícias de teste revisadas. Documento utilizado apenas em teste.",
          reason: "Revisão fictícia",
          reviewed: true,
        });
        assert.equal(revision.data.version, 2);
        const revisedId = revision.data.id;
        assert.equal(
          (
            await call("/contracts/" + revisedId + "/status", {
              status: "enviado",
              reviewed: true,
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await call("/contracts/" + revisedId + "/status", {
              status: "aguardando assinatura",
              reviewed: true,
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await call("/contracts/" + revisedId + "/status", {
              status: "assinado",
              reviewed: true,
            })
          ).status,
          400,
        );
        const signedBytes = (
          await call("/contracts/" + revisedId + "/download/pdf")
        ).data;
        const form = new FormData();
        form.set("validated", "true");
        form.set(
          "file",
          new Blob([signedBytes], { type: "application/pdf" }),
          "teste-ficticio.pdf",
        );
        const r = await fetch(
          base + "/api/contracts/" + revisedId + "/signed",
          {
            method: "POST",
            headers: { Cookie: cookie, "X-CSRF-Token": csrf },
            body: form,
          },
        );
        assert.equal(r.status, 200);
        const signed = (await r.json()).id;
        const file = await call("/signed/" + signed);
        assert.equal(hash(file.data), hash(signedBytes));
        assert.equal(store.get("contracts", revisedId).status, "assinado");
        assert.match(
          store.get("signed_files", signed).validation,
          /sistema não verificou/,
        );
        assert.equal(store.get("contracts", contractId).status, "minuta");
      },
    );
    await t.test(
      "Solicitações: pendência independente de mensagem e renovação sem cobrança",
      async () => {
        const r = await call("/requests", {
          kind: "reagendamento",
          name: "Solicitante fictício",
          message: "Sugerir outro horário, sem motivo clínico.",
          patientId,
          suggestion: "2026-10-21T15:00:00.000Z",
        });
        assert.equal(r.status, 200);
        assert.equal(r.data.availabilityConfirmed, false);
        assert.equal(
          (
            await call(
              "/requests/" + r.data.id,
              {
                status: "atendida",
                note: "Resposta administrativa registrada manualmente.",
              },
              "PUT",
            )
          ).data.status,
          "atendida",
        );
        assert.equal(
          (
            await call("/requests/" + r.data.id + "/payment-link", {
              clientConfirmed: true,
            })
          ).status,
          501,
        );
        assert.equal(store.all("ledger").length, 0);
        const flow = welcome(9);
        assert.match(flow, /Bom dia/);
        assert.match(
          administrativeReply("1", store.all("catalog")),
          /Evite detalhes clínicos/,
        );
        assert.match(
          administrativeReply("2", store.all("catalog")),
          /confirmada pela profissional/,
        );
        assert.match(administrativeReply("3", store.all("catalog")), /460/);
        assert.equal((await call("/integrations")).data.whatsapp.active, false);
      },
    );
    await t.test(
      "Financeiro conciliável: recebimento, duplicações, restituição, taxas, despesas e exportação",
      async () => {
        const b = {
          type: "receipt",
          packageId,
          amount: 44000,
          date: "2026-10-13",
          description: "Recebimento fictício",
          reference: "REC-001-TESTE",
          verified: true,
        };
        assert.equal(
          (await call("/ledger", { ...b, verified: false })).status,
          400,
        );
        assert.equal((await call("/ledger", { ...b, amount: -1 })).status, 400);
        const key = randomUUID();
        const r = await call("/ledger", b, "POST", { key });
        assert.equal(r.status, 200);
        assert.equal(
          (await call("/ledger", b, "POST", { key })).data.id,
          r.data.id,
        );
        assert.equal((await call("/ledger", b)).status, 409);
        assert.equal(
          (await call("/ledger", { ...b, amount: 1, reference: "REC-EXCESSO" }))
            .status,
          409,
        );
        assert.equal(
          (
            await call("/ledger", {
              ...b,
              type: "refund",
              amount: 4000,
              reference: "REF-001",
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await call("/ledger", {
              ...b,
              type: "expense",
              packageId: null,
              amount: 5000,
              reference: "DES-001",
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await call("/ledger", {
              ...b,
              type: "fee",
              packageId: null,
              amount: 1000,
              reference: "TAX-001",
            })
          ).status,
          200,
        );
        const f = (await call("/finance?month=2026-10")).data;
        assert.equal(f.totals.received, 44000);
        assert.equal(f.totals.refunds, 4000);
        assert.equal(f.totals.expenses, 5000);
        assert.equal(f.totals.fees, 1000);
        assert.equal(f.totals.balance, 34000);
        assert.equal(f.totals.pending, 4000);
        assert.equal(f.totals.contracted, 44000);
        assert.ok(f.sessions.length >= 3);
        assert.equal(
          (await call("/finance/export/pdf?month=2026-10")).data
            .subarray(0, 5)
            .toString(),
          "%PDF-",
        );
        const csv = (
          await call("/finance/export/csv?month=2026-10")
        ).data.toString("utf8");
        assert.match(csv, /REC-001-TESTE/);
        assert.match(csv, /340,00/);
        assert.equal((await call("/finance?month=2026-99")).status, 400);
      },
    );
    await t.test(
      "Backup cifrado e restauração em diretório novo com integridade e versões",
      async () => {
        const target = path.join(dir, "backups", "teste.scbackup");
        backupStore(store, target);
        assert.ok(
          !fs.readFileSync(target, "utf8").includes("CONTEUDO_CLINICO"),
        );
        assert.throws(() =>
          restoreBackup(
            { ...c, backupKey: randomBytes(32).toString("hex") },
            target,
            path.join(dir, "wrong"),
          ),
        );
        assert.throws(() =>
          restoreBackup(
            { ...c, mode: "production" },
            target,
            path.join(dir, "wrongmode"),
          ),
        );
        const restored = path.join(dir, "restored");
        restoreBackup(c, target, restored);
        const other = openStore({ ...c, dir: restored });
        try {
          assert.equal(other.all("patients").length, 1);
          assert.equal(other.all("clinical_versions").length, 3);
          assert.equal(other.all("contracts").length, 2);
          assert.equal(other.all("ledger").length, 4);
          assert.equal(
            other.db.prepare("SELECT count(*) AS n FROM sessions").get().n,
            0,
          );
          assert.equal(
            other.get("clinical", clinicalId).text,
            store.get("clinical", clinicalId).text,
          );
        } finally {
          other.close();
        }
        assert.throws(
          () => restoreBackup(c, target, restored),
          /diretório novo/,
        );
        assert.throws(() => backupStore(store, target), /sobrescrito/);
      },
    );
    await t.test(
      "Arquivamento preserva registros e bloqueia nova contratação",
      async () => {
        assert.equal(
          (
            await call("/patients/" + patientId + "/archive", {
              archived: true,
            })
          ).status,
          200,
        );
        assert.equal((await call("/patients", patient)).status, 409);
        assert.equal(
          (
            await call("/packages", {
              patientId,
              catalogId: "avulso",
              paymentMethod: "Pix",
              dueDate: "2026-10-13",
              clientConfirmed: true,
            })
          ).status,
          400,
        );
        assert.equal((await call("/clinical/" + patientId)).data.length, 1);
        assert.equal(
          (
            await call("/patients/" + patientId + "/archive", {
              archived: false,
            })
          ).status,
          200,
        );
      },
    );
    await t.test(
      "Expiração por inatividade, limites de tentativas e recuperação de senha",
      async () => {
        store.db
          .prepare("UPDATE sessions SET last_seen=?")
          .run(Date.now() - c.idle - 1);
        assert.equal((await call("/me")).status, 401);
        const recover = await call("/auth/recover", { email: c.email });
        assert.equal(recover.status, 200);
        const code = messages.at(-1).code;
        assert.equal(
          (
            await call("/auth/reset", {
              challengeId: recover.data.challengeId,
              code,
              password: "curta",
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await call("/auth/reset", {
              challengeId: recover.data.challengeId,
              code,
              password: "Nova-senha-teste-123!",
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await call("/auth/reset", {
              challengeId: recover.data.challengeId,
              code,
              password: "Outra-senha-123!",
            })
          ).status,
          400,
        );
        store.db.exec("DELETE FROM rate_limits");
        const login = await call("/auth/login", {
          email: c.email,
          password: "Nova-senha-teste-123!",
        });
        store.db
          .prepare("UPDATE challenges SET expires=? WHERE id=?")
          .run(Date.now() - 1, login.data.challengeId);
        assert.equal(
          (
            await call("/auth/verify", {
              challengeId: login.data.challengeId,
              code: messages.at(-1).code,
            })
          ).status,
          400,
        );
        const login2 = await call("/auth/login", {
          email: c.email,
          password: "Nova-senha-teste-123!",
        });
        for (let i = 0; i < 5; i++)
          assert.equal(
            (
              await call("/auth/verify", {
                challengeId: login2.data.challengeId,
                code: "000000",
              })
            ).status,
            400,
          );
        assert.equal(
          (
            await call("/auth/verify", {
              challengeId: login2.data.challengeId,
              code: messages.at(-1).code,
            })
          ).status,
          400,
        );
        store.db.exec("DELETE FROM rate_limits");
        for (let i = 0; i < 5; i++)
          assert.equal(
            (
              await call("/auth/login", {
                email: c.email,
                password: "invalida",
              })
            ).status,
            401,
          );
        assert.equal(
          (await call("/auth/login", { email: c.email, password: "invalida" }))
            .status,
          429,
        );
      },
    );
    await t.test("Produção recusa correio local, HTTP e base demo", () => {
      assert.throws(() =>
        config({ ...c, env: "production", mode: "production" }),
      );
      assert.throws(() =>
        config({
          ...c,
          env: "test",
          mode: "production",
          mail: "smtp",
          dir: path.resolve("data/demo"),
        }),
      );
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    store.close();
    if (dir.startsWith(path.resolve("test-output") + path.sep))
      fs.rmSync(dir, { recursive: true, force: true });
  }
});
