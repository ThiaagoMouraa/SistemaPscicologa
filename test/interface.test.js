import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { JSDOM } from "jsdom";
import { createApp } from "../server/app.js";
import { config } from "../server/config.js";
import { passwordHash } from "../server/security.js";
test("Interface DOM com API real: login, navegação, paciente, pacote, sessão e evolução", async () => {
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
    .run(c.email, passwordHash("Senha-Interface-teste-123!"));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const dom = new JSDOM(fs.readFileSync("public/index.html", "utf8"), {
    url: base,
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const w = dom.window;
  let cookie = "";
  w.fetch = async (url, opts = {}) => {
    const response = await fetch(new URL(url, base), {
      ...opts,
      headers: { ...opts.headers, Cookie: cookie },
    });
    const set = response.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    return response;
  };
  w.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  const q = (selector) => w.document.querySelector(selector);
  async function until(condition) {
    const deadline = Date.now() + 6000;
    while (!condition()) {
      if (Date.now() > deadline)
        throw new Error(
          "Estado esperado não apareceu. DOM: " +
            w.document.body.textContent.slice(-1500),
        );
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  function fill(selector, value) {
    const el = q(selector);
    assert.ok(el, selector);
    el.value = value;
  }
  function click(selector) {
    const el = q(selector);
    assert.ok(el, selector);
    el.click();
  }
  function submit(selector) {
    q(selector).dispatchEvent(
      new w.Event("submit", { bubbles: true, cancelable: true }),
    );
  }
  try {
    w.eval(fs.readFileSync("public/app.js", "utf8"));
    await until(() => q("#login-form"));
    fill("#login-form [name=password]", "Senha-Interface-teste-123!");
    submit("#login-form");
    await until(() => q("#verify-form"));
    fill("#verify-form [name=code]", messages.at(-1).code);
    submit("#verify-form");
    await until(() => q("#main h1")?.textContent.includes("em dia"));
    click("[data-action=theme]");
    assert.equal(w.document.documentElement.dataset.theme, "dark");
    click("[data-action=patient-new]");
    await until(() => q("[data-form=patient]"));
    for (const [name, value] of Object.entries({
      name: "Pessoa fictícia interface",
      cpf: "52998224725",
      phone: "47900000000",
      email: "teste@example.invalid",
      emergency: "Contato fictício 47900000001",
    }))
      fill(`[data-form=patient] [name=${name}]`, value);
    submit("[data-form=patient]");
    await until(() => !q("#modal").open && store.all("patients").length === 1);
    const patientId = store.all("patients")[0].id;
    click("[data-action=nav][data-id=patients]");
    await until(() => q("#patient-cards"));
    assert.match(q("#patient-cards").textContent, /Pessoa fictícia interface/);
    fill("#patient-search", "sem correspondencia");
    q("#patient-search").dispatchEvent(new w.Event("input", { bubbles: true }));
    assert.match(q("#patient-cards").textContent, /Nenhum paciente encontrado/);
    fill("#patient-search", "");
    q("#patient-search").dispatchEvent(new w.Event("input", { bubbles: true }));
    click("[data-action=patient-detail]");
    await until(() => q("[data-action=package-patient]"));
    click("[data-action=package-patient]");
    await until(() => q("[data-form=package]"));
    fill("[data-form=package] [name=catalogId]", "mensal");
    q("[data-form=package] [name=clientConfirmed]").checked = true;
    submit("[data-form=package]");
    await until(() => !q("#modal").open && store.all("packages").length === 1);
    const packageId = store.all("packages")[0].id;
    click("[data-action=nav][data-id=packages]");
    await until(() => q("[data-action=session-new]"));
    click(`[data-action=session-new][data-id="${packageId}"]`);
    await until(() => q("[data-form=session]"));
    submit("[data-form=session]");
    await until(
      () => !q("#modal").open && store.all("appointments").length === 1,
    );
    click("[data-action=nav][data-id=clinical]");
    await until(() => q("[data-action=clinical-new]"));
    click(`[data-action=clinical-new][data-id="${patientId}"]`);
    await until(() => q("[data-form=clinical]"));
    fill(
      "[data-form=clinical] [name=text]",
      "Texto clínico fictício para testar a interface.",
    );
    q("[data-form=clinical] [name=reviewed]").checked = true;
    submit("[data-form=clinical]");
    await until(() => !q("#modal").open && q(".record p"));
    assert.match(q(".record p").textContent, /Texto clínico fictício/);
    for (const [view, heading] of [
      ["contracts", "Contratos"],
      ["requests", "Solicitações"],
      ["finance", "Financeiro"],
      ["settings", "Configurações"],
    ]) {
      click(`[data-action=nav][data-id=${view}]`);
      await until(() => q("#main h1")?.textContent === heading);
      assert.ok(!q("#main [role=alert]"));
    }
    click("[data-action=logout]");
    await until(() => q("#login-form"));
    assert.equal(
      (
        await fetch(base + "/api/clinical/" + patientId, {
          headers: { Cookie: cookie },
        })
      ).status,
      401,
    );
  } finally {
    w.close();
    await new Promise((resolve) => server.close(resolve));
    store.close();
    if (dir.startsWith(path.resolve("test-output") + path.sep))
      fs.rmSync(dir, { recursive: true, force: true });
  }
});
