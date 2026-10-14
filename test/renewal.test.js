import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { config } from "../server/config.js";
import { createApp } from "../server/app.js";
import { passwordHash } from "../server/security.js";
test("Renovação: reabertura após correção, consentimento e contratação única sem pagamento automático", async () => {
  const dir = path.resolve("test-output", randomUUID()),
    messages = [];
  const c = config({
    env: "test",
    mode: "demo",
    host: "127.0.0.1",
    dir,
    key: randomBytes(32).toString("hex"),
    backupKey: randomBytes(32).toString("hex"),
    mail: "local",
    onMail: (x) => messages.push(x),
  });
  const { app, store } = createApp(c);
  store.db
    .prepare("INSERT INTO account VALUES (1,?,?)")
    .run(c.email, passwordHash("Senha-renovacao-teste-123!"));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = "",
    csrf = "";
  async function call(route, body, method = "POST", key = randomUUID()) {
    const response = await fetch(base + "/api" + route, {
      method,
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json",
        "X-CSRF-Token": csrf,
        "Idempotency-Key": key,
      },
      body: JSON.stringify(body),
    });
    return { status: response.status, data: await response.json(), response };
  }
  try {
    const login = await call("/auth/login", {
      email: c.email,
      password: "Senha-renovacao-teste-123!",
    });
    const verify = await call("/auth/verify", {
      challengeId: login.data.challengeId,
      code: messages.at(-1).code,
    });
    cookie = verify.response.headers.get("set-cookie").split(";")[0];
    csrf = verify.data.csrf;
    const patient = await call("/patients", {
      name: "Paciente fictício renovação",
      cpf: "11144477735",
      phone: "47900000000",
      email: "renew@example.invalid",
      emergency: "Contato fictício 47900000001",
    });
    const payload = {
      patientId: patient.data.id,
      catalogId: "quinzenal",
      paymentMethod: "Cartão",
      installments: 6,
      dueDate: "2026-10-13",
      clientConfirmed: true,
      chargeAbsenceAllowed: true,
    };
    const original = await call("/packages", payload);
    const packageId = original.data.package.id;
    assert.equal(original.status, 200);
    const session = await call("/sessions", {
      packageId,
      date: "2026-10-13T15:00:00Z",
      status: "falta",
      charged: true,
      note: "Falta com cobrança contratual fictícia",
    });
    assert.equal(session.status, 200);
    await call("/sessions", {
      packageId,
      date: "2026-10-14T15:00:00Z",
      status: "realizada",
      charged: false,
      note: "",
    });
    const request = store.all("requests")[0];
    assert.equal(request.status, "pendente");
    assert.equal(store.all("ledger").length, 0);
    const correction = {
      date: "2026-10-13T15:00:00Z",
      status: "cancelada",
      charged: false,
      note: "",
      reason: "Correção fictícia",
    };
    await call("/sessions/" + session.data.id, correction, "PUT");
    assert.equal(store.get("requests", request.id).status, "cancelada");
    await call(
      "/sessions/" + session.data.id,
      { ...correction, status: "realizada" },
      "PUT",
    );
    assert.equal(store.get("requests", request.id).status, "pendente");
    assert.equal(store.all("requests").length, 1);
    assert.equal(
      (
        await call("/packages", {
          ...payload,
          renewalId: request.id,
          clientConfirmed: false,
        })
      ).status,
      400,
    );
    const key = randomUUID();
    const renewed = await call(
      "/packages",
      { ...payload, renewalId: request.id },
      "POST",
      key,
    );
    assert.equal(renewed.status, 200);
    assert.equal(
      (
        await call(
          "/packages",
          { ...payload, renewalId: request.id },
          "POST",
          key,
        )
      ).data.package.id,
      renewed.data.package.id,
    );
    assert.equal(
      (await call("/packages", { ...payload, renewalId: request.id })).status,
      409,
    );
    assert.equal(store.all("packages").length, 2);
    assert.equal(store.all("ledger").length, 0);
    assert.equal(
      store.get("requests", request.id).renewedPackageId,
      renewed.data.package.id,
    );
    assert.equal(store.get("requests", request.id).confirmation, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    store.close();
    if (dir.startsWith(path.resolve("test-output") + path.sep))
      fs.rmSync(dir, { recursive: true, force: true });
  }
});
