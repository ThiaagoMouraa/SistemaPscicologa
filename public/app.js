const $ = (selector) => document.querySelector(selector);
const root = $("#root"),
  modal = $("#modal");
const state = {
  me: null,
  csrf: "",
  view: "dashboard",
  patients: [],
  packages: [],
  catalog: [],
  requests: [],
  contracts: [],
  clinicalPatient: null,
  month: new Date().toLocaleDateString("sv-SE").slice(0, 7),
  search: "",
  archived: false,
};
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const money = (value) =>
  (Number(value || 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
const dateLabel = (value) =>
  value
    ? new Date(
        value.length === 10 ? value + "T12:00:00" : value,
      ).toLocaleString(
        "pt-BR",
        value.length === 10
          ? { dateStyle: "short" }
          : { dateStyle: "short", timeStyle: "short" },
      )
    : "—";
const today = () => new Date().toLocaleDateString("sv-SE");
const localNow = () =>
  new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
const initials = (name) =>
  String(name || "")
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("");
const icons = {
  dashboard: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  patients:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M20 21v-2a4 4 0 0 0-3-3.87 M16 3a4 4 0 0 1 0 8",
  packages: "M3 7l9-4 9 4-9 4-9-4z M3 7v10l9 4 9-4V7 M12 11v10",
  clinical: "M6 3h12v18H6z M9 8h6 M9 12h6 M9 16h4",
  contracts: "M14 2H6v20h12V6l-4-4z M14 2v5h5 M9 12h6 M9 16h5",
  requests:
    "M21 11a8 8 0 0 1-8 8H7l-4 3V11a9 9 0 0 1 18 0z M8 11h.01 M12 11h.01 M16 11h.01",
  finance:
    "M3 5h18v14H3z M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M6 12h.01 M18 12h.01",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2",
  lock: "M6 10h12v11H6z M8 10V6a4 4 0 0 1 8 0v4 M12 14v3",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1 1 M18 18l1 1 M5 19l1-1 M18 6l1-1",
  plus: "M12 5v14 M5 12h14",
  search: "M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14 M15 15l6 6",
  arrow: "M5 12h14 M14 7l5 5-5 5",
  logout: "M9 3H4v18h5 M10 12h11 M17 8l4 4-4 4",
  close: "M6 6l12 12 M6 18L18 6",
  menu: "M3 6h18 M3 12h18 M3 18h18",
  check: "M5 12l4 4L19 6",
  calendar: "M3 5h18v16H3z M7 3v4 M17 3v4 M3 10h18",
  download: "M12 3v12 M7 10l5 5 5-5 M4 17v4h16v-4",
};
const icon = (name) =>
  `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${icons[name] || icons.dashboard}"/></svg>`;
const button = (label, action, id = "", cls = "", ic = "") =>
  `<button type="button" class="${cls}" data-action="${action}" data-id="${escape(id)}">${ic ? icon(ic) : ""}${label}</button>`;
const badge = (label, variant = "") =>
  `<span class="pill ${variant}">${escape(label)}</span>`;
const brand = () =>
  '<div class="brand"><img src="/logo.svg" alt="Árvore estilizada original"><div><div class="brand-name">Samira Costa</div><small>CRP 12/11679</small></div></div>';
const empty = (title, message) =>
  `<div class="empty"><h3>${title}</h3><p>${message}</p></div>`;
const field = (label, name, type = "text", value = "", extra = "") =>
  `<label class="field">${label}<input name="${name}" type="${type}" value="${escape(value)}" ${extra}></label>`;
const textarea = (label, name, value = "", extra = "") =>
  `<label class="field">${label}<textarea name="${name}" ${extra}>${escape(value)}</textarea></label>`;
const select = (label, name, options, value = "", extra = "") =>
  `<label class="field">${label}<select name="${name}" ${extra}>${options.map(([v, l]) => `<option value="${escape(v)}" ${String(v) === String(value) ? "selected" : ""}>${escape(l)}</option>`).join("")}</select></label>`;
const check = (label, name, checked = false) =>
  `<label class="check"><input name="${name}" type="checkbox" ${checked ? "checked" : ""}>${label}</label>`;
const patientName = (id) =>
  state.patients.find((p) => p.id === id)?.name || "Paciente arquivado";
function toast(message, error = false) {
  const t = $("#toast");
  t.textContent = message;
  t.className = "toast show" + (error ? " error" : "");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.className = "toast"), 5500);
}
function clearSession() {
  state.me = null;
  state.csrf = "";
  for (const key of [
    "patients",
    "packages",
    "requests",
    "contracts",
    "clinicalEntries",
    "sessionList",
  ])
    state[key] = [];
  state.settings = null;
  state.clinicalPatient = null;
  modal.close();
  $("#modal-content").innerHTML = "";
}
document.documentElement.dataset.theme =
  localStorage.getItem("samira-theme") || "light";
async function api(path, body, method = body ? "POST" : "GET", key) {
  const headers = {};
  if (body) {
    headers["Content-Type"] = "application/json";
    headers["X-CSRF-Token"] = state.csrf;
    headers["Idempotency-Key"] = key || crypto.randomUUID();
  }
  const response = await fetch("/api" + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && state.me) {
      clearSession();
      await loginScreen();
    }
    throw new Error(data.error || "Não foi possível completar a operação.");
  }
  return data;
}
async function download(path, body, filename) {
  const response = await fetch("/api" + path, {
    method: body ? "POST" : "GET",
    headers: body
      ? { "Content-Type": "application/json", "X-CSRF-Token": state.csrf }
      : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error);
  }
  const url = URL.createObjectURL(await response.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("Arquivo exportado. Guarde-o em local protegido.");
}
let loginInfo = {},
  authStep = "login",
  challengeId = "";
async function loginScreen(step = "login") {
  authStep = step;
  loginInfo = await api("/auth/info");
  const local = loginInfo.localMail
    ? '<div class="notice"><strong>Demonstração local</strong><br>O código aparece no terminal do servidor. Nenhum e-mail é enviado neste modo.</div>'
    : "";
  let form = "";
  if (loginInfo.setupRequired) {
    form =
      '<div class="notice">Crie sua primeira senha no terminal do VS Code com <code>npm run setup</code>. Não há senha padrão.</div>' +
      button("Verificar configuração", "login-reload", "", "primary");
  } else if (step === "login") {
    form = `<form id="login-form">${field("E-mail profissional", "email", "email", loginInfo.email, 'required autocomplete="username"')}${field("Senha", "password", "password", "", 'required autocomplete="current-password" maxlength="128"')}<div class="login-error notice error" role="alert"></div><button class="primary">Entrar ${icon("arrow")}</button></form>${button("Esqueci minha senha", "recover", "", "ghost small")}`;
  } else if (step === "verify") {
    form = `<form id="verify-form">${field("Código de confirmação", "code", "text", "", 'required inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code"')}<div class="login-error notice error" role="alert"></div><button class="primary">Confirmar acesso ${icon("arrow")}</button></form>${local}${button("Voltar ao login", "login-reload", "", "ghost small")}`;
  } else if (step === "recover") {
    form = `<form id="recover-form">${field("E-mail da conta", "email", "email", loginInfo.email, 'required autocomplete="username"')}<div class="login-error notice error" role="alert"></div><button class="primary">Solicitar recuperação</button></form>${button("Voltar ao login", "login-reload", "", "ghost small")}`;
  } else {
    form = `<form id="reset-form">${field("Código de recuperação", "code", "text", "", 'required inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code"')}${field("Nova senha (12 a 128 caracteres)", "password", "password", "", 'required minlength="12" maxlength="128" autocomplete="new-password"')}${field("Confirmar nova senha", "confirmation", "password", "", 'required minlength="12" maxlength="128" autocomplete="new-password"')}<div class="login-error notice error" role="alert"></div><button class="primary">Salvar nova senha</button></form>${local}${button("Voltar ao login", "login-reload", "", "ghost small")}`;
  }
  root.innerHTML = `<div class="login"><aside class="login-story">${brand()}<img class="login-art" src="/logo.svg" alt=""><h1>Um espaço para cuidar.<br>E se organizar.</h1><p>Seu consultório, com a atenção e a tranquilidade que o seu trabalho merece.</p><div class="login-footer">Gestão de atendimentos psicológicos<br>Área exclusiva da profissional</div></aside><main class="login-panel" id="main">${button("", "theme", "", "ghost theme-toggle", "sun").replace("data-action", 'aria-label="Alternar tema" data-action')}<div class="login-box"><div class="eyebrow">SEU CONSULTÓRIO</div><h2>${{ login: "Bem-vinda, Samira.", verify: "Confirme seu acesso.", recover: "Recuperar acesso.", reset: "Crie uma nova senha." }[step]}</h2><p class="muted">${{ login: "Entre para acompanhar seus atendimentos.", verify: "Use o código de 6 dígitos. Ele expira em 10 minutos.", recover: "Enviaremos um código temporário à conta cadastrada.", reset: "Após a alteração, todas as sessões serão encerradas." }[step]}</p>${form}<div class="private-note">${icon("lock")} Acesso exclusivo • Informações protegidas</div></div></main></div>`;
  root.querySelector("input")?.focus();
}
const views = [
  ["dashboard", "Visão geral"],
  ["patients", "Pacientes"],
  ["packages", "Pacotes e sessões"],
  ["clinical", "Prontuários"],
  ["contracts", "Contratos"],
  ["requests", "Solicitações"],
  ["finance", "Financeiro"],
  ["settings", "Configurações"],
];
function shell() {
  root.innerHTML = `<div class="shell"><aside class="sidebar">${brand()}<div class="nav-label">CONSULTÓRIO</div><nav class="nav-group" aria-label="Menu principal">${views
    .slice(0, 6)
    .map(([v, l]) => button(l, "nav", v, state.view === v ? "active" : "", v))
    .join(
      "",
    )}</nav><div class="nav-label">GESTÃO</div><nav class="nav-group" aria-label="Gestão">${views
    .slice(6)
    .map(([v, l]) => button(l, "nav", v, state.view === v ? "active" : "", v))
    .join(
      "",
    )}</nav><div class="sidebar-bottom"><div class="notice"><span class="eyebrow">AMBIENTE ${state.me.mode === "demo" ? "DEMO" : "PRIVADO"}</span><br>${state.me.mode === "demo" ? "Use somente dados fictícios." : "Acesso exclusivo da profissional."}</div><div class="profile"><div class="avatar">SC</div><div class="text">Samira Costa<small>Psicóloga • CRP 12/11679</small></div>${button("", "logout", "", "ghost small", "logout").replace("data-action", 'aria-label="Encerrar sessão" data-action')}</div></div></aside><div class="workspace"><header class="topbar"><div class="topbar-label">${button("", "menu", "", "ghost mobile-menu", "menu").replace("data-action", 'aria-label="Abrir menu" data-action')}<span class="secure-dot"></span> Área privada da profissional</div><div class="topbar-actions"><span class="date-label">${new Date().toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" })}</span><span class="mode-badge">${state.me.mode === "demo" ? "Demonstração" : "Privado"}</span>${button("", "theme", "", "ghost small", "sun").replace("data-action", 'aria-label="Alternar tema" data-action')}</div></header><main id="main"><div class="loading" role="status">Carregando informações…</div></main></div></div>`;
}
function heading(title, subtitle, actions = "") {
  return `<div class="page-head"><div><h1>${title}</h1><p>${subtitle}</p></div><div class="actions">${actions}</div></div>`;
}
function metric(label, value, ic, hint) {
  return `<div class="metric"><div class="metric-top"><span class="metric-icon">${icon(ic)}</span><span class="eyebrow">${ic === "finance" ? "NO MÊS" : "CONSULTÓRIO"}</span></div><div class="metric-value">${value}</div><div class="metric-label">${label}</div><div class="metric-hint">${hint}</div></div>`;
}
function financeSummary(f) {
  return `<div class="financial-summary"><div><span>Recebimentos</span><strong class="money-green">${money(f.received)}</strong></div><div><span>Despesas e taxas</span><strong>${money(f.expenses + f.fees)}</strong></div><div><span>Restituições</span><strong>${money(f.refunds)}</strong></div></div><div class="finance-bottom"><span>Saldo de caixa do mês</span><strong>${money(f.balance)}</strong></div>`;
}
async function render() {
  if (!state.me) return;
  const view = state.view;
  shell();
  try {
    [
      state.patients,
      state.packages,
      state.catalog,
      state.requests,
      state.contracts,
    ] = await Promise.all([
      api("/patients"),
      api("/packages"),
      api("/catalog"),
      api("/requests"),
      api("/contracts"),
    ]);
    if (view !== state.view) return;
    let html = "";
    if (view === "dashboard") {
      const d = await api("/dashboard?month=" + state.month);
      html =
        heading(
          "Seu consultório, em dia.",
          "Uma visão tranquila dos seus atendimentos e da sua gestão.",
          button("Novo paciente", "patient-new", "", "primary", "plus"),
        ) +
        `<div class="welcome-banner"><div><div class="eyebrow">BEM-VINDA AO SEU ESPAÇO</div><h2>Cuidar também é ter tudo no lugar.</h2><p>Acompanhe seus pacientes, organize as próximas etapas e reserve tempo para o que importa.</p></div><img src="/logo.svg" alt=""></div><div class="metrics">${metric("Pacientes ativos", d.activePatients, "patients", "Cadastros em acompanhamento")}${metric("Sessões pendentes", d.pendingSessions, "calendar", d.endingPackages + " pacote(s) com 1 sessão restante")}${metric("Solicitações pendentes", d.pendingRequests, "requests", "Aguardando sua resposta")}${metric("Pagamentos pendentes", d.pendingPayments, "finance", money(d.finance.pending) + " em aberto")}</div><div class="dashboard-grid"><section class="panel"><div class="panel-head"><h2>Solicitações para você</h2>${button("Ver todas", "nav", "requests", "ghost small", "arrow")}</div>${d.recentRequests.length ? d.recentRequests.map((r) => `<div class="request-row"><div class="avatar">${escape(initials(r.name))}</div><div class="row-body"><h3>${escape(r.name)}</h3><p>${escape(r.kind)} • ${dateLabel(r.created_at)}</p></div>${badge("Pendente", "warn")}</div>`).join("") : empty("Tudo em dia", "Nenhuma solicitação aguardando resposta.")}<p class="subtle-note">Solicitações administrativas. Não incluem conteúdo do prontuário.</p></section><section class="panel"><div class="panel-head"><h2>Financeiro do mês</h2><span class="pill neutral">${new Date(state.month + "-15").toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</span></div>${financeSummary(d.finance)}<div class="finance-bars"><div class="bar-row"><span>Recebido</span><progress class="progress" value="${d.finance.received}" max="${Math.max(1, d.finance.received, d.finance.expenses + d.finance.fees)}" aria-label="Recebido"></progress><span>${money(d.finance.received)}</span></div><div class="bar-row"><span>Saídas</span><progress class="progress" value="${d.finance.expenses + d.finance.fees + d.finance.refunds}" max="${Math.max(1, d.finance.received, d.finance.expenses + d.finance.fees + d.finance.refunds)}" aria-label="Saídas"></progress><span>${money(d.finance.expenses + d.finance.fees + d.finance.refunds)}</span></div></div>${button("Abrir financeiro", "nav", "finance", "ghost small", "arrow")}<p class="subtle-note">Recebimentos por data de pagamento. Saldo não representa lucro contábil.</p></section></div><section class="panel"><div class="panel-head"><h2>Pacotes próximos do término</h2>${badge(d.endingPackages + " pacote(s)")}</div>${state.packages.filter((p) => p.remaining === 1).length ? packageTable(state.packages.filter((p) => p.remaining === 1)) : empty("Nenhum pacote próximo do término", "A renovação sempre exige confirmação do cliente.")}</section>`;
    } else if (view === "patients") {
      html =
        heading(
          "Pacientes",
          "Informações administrativas organizadas. Prontuários com acesso separado.",
          button("Novo paciente", "patient-new", "", "primary", "plus"),
        ) +
        `<div class="toolbar"><div class="search">${icon("search")}<input id="patient-search" aria-label="Pesquisar pacientes por nome, telefone ou e-mail" placeholder="Pesquisar paciente…" value="${escape(state.search)}"></div><label class="check"><input id="archived-filter" type="checkbox" ${state.archived ? "checked" : ""}> Mostrar arquivados</label></div><div class="cards" id="patient-cards">${patientCards()}</div>`;
    } else if (view === "packages") {
      html =
        heading(
          "Pacotes e sessões",
          "Preços preservados por contratação. Remarcações dependem da sua confirmação.",
          button("Contratar pacote", "package-new", "", "primary", "plus"),
        ) +
        `<div class="metrics">${state.catalog.map((p) => `<div class="metric"><div class="metric-top"><span class="metric-icon">${icon("packages")}</span>${badge(p.sessions + " sessão(ões)")}</div><h3>${escape(p.name)}</h3><div class="metric-value">${money(p.price)}</div><p class="metric-label">Valor para novas contratações</p><div class="metric-hint">${button("Alterar preço", "catalog-edit", p.id, "ghost small")}</div></div>`).join("")}</div><section class="panel"><div class="panel-head"><h2>Contratações</h2>${badge(state.packages.length + " pacote(s)")}</div>${state.packages.length ? packageTable(state.packages) : empty("Comece com uma contratação", "Cadastre um paciente e confirme o pacote com ele.")}</section>`;
    } else if (view === "clinical") {
      const active = state.patients.filter((p) => !p.archived);
      if (!state.clinicalPatient) state.clinicalPatient = active[0]?.id;
      const entries = state.clinicalPatient
        ? await api("/clinical/" + state.clinicalPatient)
        : [];
      state.clinicalEntries = entries;
      html =
        heading(
          "Prontuários",
          "Área clínica exclusiva. Nenhum registro é compartilhado com integrações administrativas.",
        ) +
        `<div class="clinical-layout"><section class="panel patient-list"><h2>Selecionar paciente</h2>${state.patients.map((p) => button(escape(p.name), "clinical-patient", p.id, p.id === state.clinicalPatient ? "selected" : "")).join("") || '<p class="muted">Cadastre um paciente.</p>'}</section><div>${state.clinicalPatient ? `<section class="panel"><div class="panel-head"><div><span class="eyebrow">REGISTROS CLÍNICOS</span><h2>${escape(patientName(state.clinicalPatient))}</h2></div>${button("Nova evolução", "clinical-new", state.clinicalPatient, "primary small", "plus")}</div><div class="notice">Ditado é da profissional, sem gravação da consulta. Motor de transcrição local pendente; escrita manual e importação de texto disponíveis.</div>${entries.length ? entries.map((x) => `<article class="record"><div class="record-head"><label class="check"><input type="checkbox" class="export-entry" value="${x.id}"><strong>${dateLabel(x.date)}</strong></label><div class="inline-actions">${button("Corrigir", "clinical-edit", x.id, "small")}${button("Complementar", "clinical-complement", x.id, "small")}</div></div><p>${escape(x.text)}</p><div class="record-meta">${escape(x.professional)} • ${x.versions.length} versão(ões)</div><details><summary>Histórico de versões</summary>${x.versions.map((v) => `<p><strong>${dateLabel(v.created_at)} • ${escape(v.kind)}</strong><br>Motivo: ${escape(v.reason)}<br>${escape(v.text)}</p>`).join("")}</details></article>`).join("") : empty("Nenhuma evolução registrada", "Escreva e revise o texto antes de salvar.")}<div class="notice">Exportação de registros selecionados para revisão, sem diagnósticos ou conclusões automáticas. Documentos psicológicos exigem elaboração profissional conforme as normas aplicáveis do CFP.</div>${button("Exportar selecionados para revisão", "clinical-export", state.clinicalPatient, "", "download")}</section>` : empty("Selecione um paciente", "O acesso clínico exige sessão autenticada no servidor.")}</div></div>`;
    } else if (view === "contracts") {
      html =
        heading(
          "Contratos",
          "Revise a minuta, acompanhe as versões e preserve o PDF assinado.",
        ) +
        `<div class="notice"><strong>Contrato-base não fornecido.</strong> As minutas iniciais são provisórias. Incorpore o documento original, incluindo a cláusula de 90 dias, e revise as condições antes de registrar envio. Não há negativação automática.</div><section class="panel">${
          state.contracts.length
            ? `<div class="list-table"><table><thead><tr><th>Paciente / pacote</th><th>Versão</th><th>Estado</th><th>Documentos</th><th>Ações</th></tr></thead><tbody>${state.contracts
                .sort((a, b) => b.created_at.localeCompare(a.created_at))
                .map(
                  (x) =>
                    `<tr><td>${escape(x.patient.name)}<small>${escape(x.package.name)} • ${money(x.package.price)}</small></td><td>v${x.version}<small>${dateLabel(x.created_at)}</small></td><td>${badge(x.status, x.provisional ? "warn" : "")}<small>${x.provisional ? "Minuta provisória" : "Revisão registrada"}</small></td><td><div class="table-actions"><a href="/api/contracts/${x.id}/download/pdf" download>PDF</a><a href="/api/contracts/${x.id}/download/docx" download>Word</a></div>${x.signedFiles.map((f) => `<small><a href="/api/signed/${f.id}" download>PDF assinado</a></small>`).join("")}</td><td><div class="table-actions">${button("Revisar", "contract-review", x.id, "small")}${button("Estado / assinatura", "contract-status", x.id, "small")}</div></td></tr>`,
                )
                .join("")}</tbody></table></div>`
            : empty(
                "Nenhum contrato gerado",
                "Contratar um pacote gera a primeira minuta individual.",
              )
        }</section><section class="panel"><h2>Assinatura pelo GOV.BR</h2><p class="muted">Cada parte pode usar o portal de assinatura, se elegível. Baixe o PDF revisado, faça as assinaturas fora do sistema e preserve o arquivo final. O sistema não recebe credenciais GOV.BR nem valida criptograficamente as assinaturas.</p><div class="inline-actions"><a href="https://www.gov.br/pt-br/servicos/assinatura-eletronica" target="_blank" rel="noopener noreferrer">Portal de assinatura</a><a href="https://validar.iti.gov.br/" target="_blank" rel="noopener noreferrer">Validar assinaturas no ITI</a></div></section>`;
    } else if (view === "requests") {
      html =
        heading(
          "Solicitações",
          "Registre, responda e acompanhe cada etapa administrativa.",
          button("Nova solicitação", "request-new", "", "primary", "plus"),
        ) +
        `<div class="notice">WhatsApp não ativado. Os registros abaixo são locais ou manuais; registrar uma resposta não envia mensagem e não confirma disponibilidade.</div><section class="panel">${state.requests.length ? `<div class="list-table"><table><thead><tr><th>Solicitante</th><th>Assunto</th><th>Solicitação</th><th>Estado</th><th>Ações</th></tr></thead><tbody>${state.requests.map((r) => `<tr><td>${escape(r.name)}<small>${dateLabel(r.created_at)}</small></td><td>${escape(r.kind)}<small>${escape(r.source || "Solicitação interna")}</small></td><td>${escape(r.message)}${r.note ? `<small>Resposta: ${escape(r.note)}</small>` : ""}${r.suggestion ? `<small>Sugestão: ${dateLabel(r.suggestion)}</small>` : ""}</td><td>${badge(r.status, r.status === "pendente" ? "warn" : "")}</td><td><div class="table-actions">${r.status !== "cancelada" ? button("Responder", "request-edit", r.id, "small") : ""}${r.kind === "renovacao" && !r.renewedPackageId && r.status !== "cancelada" ? button("Confirmar renovação", "renewal", r.id, "small") : ""}</div></td></tr>`).join("")}</tbody></table></div>` : empty("Nenhuma solicitação", "A renovação também aparecerá aqui ao esgotar pacotes de 2 ou 4 sessões.")}</section><section class="panel"><div class="panel-head"><h2>Fluxo de WhatsApp • demonstração local</h2>${badge("Não envia mensagens", "warn")}</div><p class="preformatted">Bom dia / Boa tarde / Boa noite! Seja bem-vindo ao atendimento remoto do consultório da Samira Costa. Escolha uma opção:
1 — Primeiro contato
2 — Reagendar consulta
3 — Pacotes de atendimento
4 — Outros assuntos</p><div class="inline-actions">${["Primeiro contato", "Reagendamento", "Pacotes", "Outros assuntos"].map((l, i) => button(l, "whatsapp-demo", String(i + 1), "small")).join("")}</div><p class="subtle-note">Automação administrativa, sem acesso ao prontuário e sem atendimento clínico. Textos devem ser aprovados antes da ativação.</p></section>`;
    } else if (view === "finance") {
      const f = await api("/finance?month=" + state.month);
      html =
        heading(
          "Financeiro",
          "Demonstrativo de caixa. Pagamentos por data de recebimento.",
          button("Novo lançamento", "ledger-new", "", "primary", "plus"),
        ) +
        `<div class="toolbar"><label class="field month-field">Competência<input id="finance-month" type="month" value="${state.month}"></label><div class="inline-actions"><a href="/api/finance/export/pdf?month=${state.month}" download>Exportar PDF</a><a href="/api/finance/export/csv?month=${state.month}" download>Planilha CSV</a></div></div><div class="metrics">${metric("Contratado no mês", money(f.totals.contracted), "packages", "Valores dos contratos do mês")}${metric("Recebido no mês", money(f.totals.received), "finance", "Recebimentos efetivos verificados")}${metric("Pendências totais", money(f.totals.pending), "calendar", "Contratos de todas as competências")}${metric("Saldo de caixa", money(f.totals.balance), "finance", "Não representa lucro contábil")}</div><section class="panel">${financeSummary(f.totals)}<p class="subtle-note">Taxas: ${money(f.totals.fees)} • Despesas: ${money(f.totals.expenses)} • Restituições: ${money(f.totals.refunds)}. Correções financeiras devem usar lançamento compensatório identificado; recebimentos nunca são confirmados pela abertura de links.</p></section><section class="panel"><h2>Lançamentos da competência</h2>${f.ledger.length ? `<div class="list-table"><table><thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th>Referência</th><th>Valor</th></tr></thead><tbody>${f.ledger.map((l) => `<tr><td>${dateLabel(l.date)}</td><td>${{ receipt: "Recebimento", refund: "Restituição", fee: "Taxa", expense: "Despesa" }[l.type]}<small>Registro manual</small></td><td>${escape(l.description)}</td><td>${escape(l.reference)}</td><td>${money(l.amount)}</td></tr>`).join("")}</tbody></table></div>` : empty("Nenhum lançamento no mês", "Registre recebimentos verificados, despesas e taxas.")}<p class="subtle-note">${f.sessions.length} registro(s) de sessão por data de atendimento no mês, contabilizados separadamente.</p></section>`;
    } else if (view === "settings") {
      const settings = await api("/settings"),
        integrations = await api("/integrations");
      state.settings = settings;
      html =
        heading(
          "Configurações",
          "Identidade profissional, condições e integrações.",
        ) +
        `<div class="dashboard-grid"><section class="panel"><div class="panel-head"><h2>Dados e condições</h2>${button("Editar", "settings-edit", "", "small")}</div><p><strong>Samira Costa</strong><br>CRP 12/11679 • Pessoa física</p><p class="muted">${escape(state.me.email)}<br>WhatsApp: +55 47 99765-2192<br>Endereço: ${escape(settings.address || "Pendente")}</p><p class="subtle-note">E-mail de acesso e segredos são configurados no ambiente. Nenhuma credencial deve ser compartilhada por mensagem.</p>${badge(settings.termsApproved ? "Condições revisadas" : "Condições provisórias", settings.termsApproved ? "" : "warn")}</section><section class="panel"><h2>Segurança e guarda</h2><p class="muted">Sessão expira após ${state.me.idleMinutes} minutos de inatividade. Dados persistentes são criptografados. Backups exigem a chave separada.</p><p class="subtle-note">Valide política de guarda e descarte, controles da hospedagem e operação concreta antes do uso com dados reais. Não há declaração automática de conformidade LGPD ou CFP.</p>${button("Ver registro de acessos", "audit", "", "small")}</section></div><section class="panel"><h2>Integrações</h2><div class="integration-grid">${Object.entries(
          integrations,
        )
          .map(
            ([key, i]) =>
              `<div class="integration"><div class="panel-head"><h3>${{ email: "E-mail", whatsapp: "WhatsApp oficial", payment: "Pix e cartão", transcription: "Ditado local", govbr: "GOV.BR" }[key]}</h3>${badge(i.active ? "Configurado" : "Pendente", i.active ? "" : "warn")}</div><p>${escape(i.status || `${i.mode === "local" ? "Demonstração: códigos no terminal." : "Envio SMTP configurado."} Destinatário: ${i.recipient}`)}</p></div>`,
          )
          .join("")}</div></section>`;
    }
    $("#main").innerHTML =
      html +
      `<div class="footer-note"><span>Samira Costa • CRP 12/11679</span><span>${icon("lock")} Gestão privada do consultório</span></div>`;
  } catch (err) {
    if (!state.me) return;
    $("#main").innerHTML =
      `<div class="notice error" role="alert">${escape(err.message)}</div>${button("Tentar novamente", "refresh")}`;
  }
}
function patientCards() {
  const items = state.patients.filter(
    (p) =>
      Boolean(p.archived) === state.archived &&
      [p.name, p.phone, p.email]
        .join(" ")
        .toLowerCase()
        .includes(state.search.toLowerCase()),
  );
  return items.length
    ? items
        .map((p) => {
          const pkg =
            [...p.packages].reverse().find((x) => x.remaining > 0) ||
            p.packages.at(-1);
          return `<article class="patient-card"><div class="patient-top"><span class="avatar">${escape(initials(p.name))}</span><div><h3>${escape(p.name)}</h3><small>${escape(p.phone)}</small></div></div><div class="patient-package"><span>${escape(pkg?.name || "Sem pacote")}</span><strong>${pkg ? pkg.used + "/" + pkg.sessions : "—"}</strong></div><progress class="progress" value="${pkg?.used || 0}" max="${pkg?.sessions || 1}" aria-label="Sessões realizadas ou faltas cobradas"></progress><div class="metric-label">${pkg ? pkg.remaining + " sessão(ões) restante(s)" : "Contratação ainda não registrada"}</div><div class="card-badges">${badge(p.archived ? "Arquivado" : pkg?.remaining === 0 ? "Pacote concluído" : "Em acompanhamento", p.archived ? "neutral" : "")}${pkg ? badge(pkg.pending > 0 ? "Pagamento pendente" : "Pagamento recebido", pkg.pending > 0 ? "warn" : "") : ""}</div><div class="card-actions">${button("Administrativo", "patient-detail", p.id, "small")}${button("Prontuário", "clinical-patient", p.id, "small", "lock")}</div></article>`;
        })
        .join("")
    : empty(
        "Nenhum paciente encontrado",
        "Cadastre um paciente ou ajuste a pesquisa.",
      );
}
function packageTable(items) {
  return `<div class="list-table"><table><thead><tr><th>Paciente</th><th>Pacote</th><th>Progresso</th><th>Pagamento</th><th>Acompanhamento</th></tr></thead><tbody>${items.map((p) => `<tr><td>${escape(patientName(p.patient_id))}</td><td>${escape(p.name)}<small>${money(p.price)} • ${dateLabel(p.created_at)}</small></td><td>${badge(p.used + "/" + p.sessions)}<small>${p.remaining} restante(s)</small></td><td>${badge(p.pending > 0 ? "Pendente" : "Recebido", p.pending > 0 ? "warn" : "")}<small>${money(p.pending)} em aberto</small></td><td><div class="table-actions">${button("Sessões", "session-list", p.id, "small")}${button("Registrar", "session-new", p.id, "small", "plus")}</div></td></tr>`).join("")}</tbody></table></div>`;
}
function openModal(title, body) {
  $("#modal-content").innerHTML =
    `<div class="modal-head"><h2 id="modal-title">${title}</h2>${button("", "modal-close", "", "ghost small", "close").replace("data-action", 'aria-label="Fechar" data-action')}</div><div class="modal-body">${body}</div>`;
  if (!modal.open) modal.showModal();
  modal.querySelector("input:not([type=hidden]),textarea,select")?.focus();
}
function form(name, fields, id = "", submit = "Salvar", intro = "") {
  return `${intro}<form data-form="${name}" data-id="${escape(id)}" data-key="${crypto.randomUUID()}">${fields}<div class="modal-error" role="alert"></div><div class="modal-footer">${button("Cancelar", "modal-close")}<button class="primary" type="submit">${submit}</button></div></form>`;
}
async function patientForm(id) {
  const p = id ? await api("/patients/" + id) : {};
  openModal(
    id ? "Editar paciente" : "Novo paciente",
    form(
      "patient",
      `<div class="form-grid">${field("Nome completo", "name", "text", p.name, 'required maxlength="150" autocomplete="off"')}${field("CPF", "cpf", "text", p.cpf, 'required inputmode="numeric" maxlength="14"')}${field("Telefone", "phone", "tel", p.phone, 'required maxlength="30"')}${field("E-mail", "email", "email", p.email, 'required maxlength="254"')}${field("Contato de emergência (nome e telefone)", "emergency", "text", p.emergency, 'required maxlength="250"')}</div>`,
      id,
      "Salvar paciente",
      '<p class="muted">Informações administrativas. CPF único e validado no servidor.</p>',
    ),
  );
}
async function packageForm(patientId = "", renewalId = "") {
  const p = state.patients.filter((p) => !p.archived);
  if (!p.length)
    throw new Error("Cadastre um paciente ativo antes de contratar.");
  openModal(
    renewalId ? "Confirmar renovação" : "Contratar pacote",
    form(
      "package",
      `<div class="form-grid">${select(
        "Paciente",
        "patientId",
        p.map((x) => [x.id, x.name]),
        patientId,
      )}${select(
        "Pacote",
        "catalogId",
        state.catalog.map((x) => [
          x.id,
          x.name + " • " + x.sessions + " sessão(ões) • " + money(x.price),
        ]),
      )}${select(
        "Forma de pagamento",
        "paymentMethod",
        ["Pix", "Cartão", "Dinheiro", "Transferência"].map((x) => [x, x]),
      )}${select(
        "Parcelas (somente cartão)",
        "installments",
        Array.from({ length: 6 }, (_, i) => [i + 1, i + 1 + "x"]),
      )}${field("Vencimento", "dueDate", "date", today(), "required")}<input type="hidden" name="renewalId" value="${escape(renewalId)}"></div>${check("O cliente confirmou o interesse, o pacote e a forma de pagamento.", "clientConfirmed")}${check("O contrato revisado prevê a cobrança de faltas.", "chargeAbsenceAllowed")}`,
      renewalId,
      "Salvar contratação",
      '<div class="notice">Nenhuma cobrança ou envio automático. O preço atual será preservado nesta contratação. A primeira minuta será gerada para revisão. Cartão em até 6x sem juros depende do processador; taxas conforme condições revisadas.</div>',
    ),
  );
}
async function sessionForm(packageId, session = null) {
  const p = state.packages.find((x) => x.id === packageId);
  if (!p) throw new Error("Pacote não encontrado.");
  openModal(
    session ? "Corrigir sessão" : "Registrar sessão",
    form(
      "session",
      `<input type="hidden" name="packageId" value="${packageId}"><div class="form-grid">${field("Data e hora do atendimento", "date", "datetime-local", session ? toLocal(session.date) : localNow(), "required")}${select(
        "Situação",
        "status",
        ["realizada", "falta", "cancelada", "remarcada"].map((x) => [
          x,
          x[0].toUpperCase() + x.slice(1),
        ]),
        session?.status || "realizada",
      )}${field("Sugestão de remarcação (sem confirmar disponibilidade)", "suggestion", "datetime-local", session?.suggestion ? toLocal(session.suggestion) : "")}${textarea("Observação administrativa (sem conteúdo clínico)", "note", session?.note || "", 'maxlength="500"')}${session ? field("Motivo da correção", "reason", "text", "", 'required maxlength="500"') : ""}</div>${check("Cobrar a falta conforme o contrato.", "charged", session?.charged)}`,
      session?.id || "",
      "Salvar sessão",
      `<div class="notice">${escape(patientName(p.patient_id))} • ${escape(p.name)} • ${p.used}/${p.sessions}. Apenas realizadas e faltas contratuais cobradas consomem saldo. Histórico de correções preservado.</div>`,
    ),
  );
}
function toLocal(value) {
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
async function sessionList(id) {
  const list = await api("/packages/" + id + "/sessions");
  state.sessionList = list;
  openModal(
    "Histórico de sessões",
    `${
      list.length
        ? list
            .sort((a, b) => b.date.localeCompare(a.date))
            .map(
              (x) =>
                `<article class="record"><div class="record-head"><strong>${dateLabel(x.date)}</strong>${badge(x.status)}${button("Corrigir", "session-edit", x.id, "small")}</div><p>${escape(x.note || "Sem observação administrativa")}</p><div class="record-meta">${x.charged ? "Falta cobrada" : "Sem cobrança de falta"}${x.suggestion ? " • Sugestão: " + dateLabel(x.suggestion) : ""}</div><details><summary>Ver ${x.versions.length} versão(ões)</summary>${x.versions.map((v) => `<p>${dateLabel(v.created_at)} • ${escape(v.status)} • ${escape(v.reason)}<br>${escape(v.note)}</p>`).join("")}</details></article>`,
            )
            .join("")
        : empty(
            "Nenhuma sessão registrada",
            "Registre a situação após o atendimento.",
          )
    }<div class="modal-footer">${button("Registrar sessão", "session-new", id, "primary", "plus")}</div>`,
  );
}
function clinicalForm(patientId, entry = null, kind = "") {
  openModal(
    entry
      ? kind === "complemento"
        ? "Complementar evolução"
        : "Corrigir evolução"
      : "Nova evolução",
    form(
      "clinical",
      `<input type="hidden" name="patientId" value="${escape(patientId)}"><input type="hidden" name="kind" value="${kind}">${entry ? `<p class="muted">Atendimento: ${dateLabel(entry.date)}. Versões anteriores serão preservadas.</p>` : field("Data e hora do atendimento", "date", "datetime-local", localNow(), "required")}${textarea(kind === "complemento" ? "Texto do complemento" : "Texto da evolução", "text", kind === "correcao" ? entry?.text || "" : "", 'required maxlength="20000" rows="9"')}${entry ? field("Motivo da alteração", "reason", "text", "", 'required maxlength="500"') : ""}<label class="field">Importar texto de ditado transcrito localmente (.txt)<input type="file" id="dictation-text" accept=".txt,text/plain"></label><p class="subtle-note">Apenas o texto escolhido é lido localmente e só será enviado ao seu próprio servidor ao salvar. Motor de transcrição local ainda não disponível. Não gravamos consultas nem enviamos áudio para IA.</p>${check("Revisei o texto e confirmo o registro clínico.", "reviewed")}`,
      entry?.id || "",
      "Salvar evolução",
      `<p class="muted">${escape(patientName(patientId))} • Samira Costa, CRP 12/11679</p>`,
    ),
  );
}
function requestForm(kind = "outros") {
  openModal(
    "Solicitação administrativa",
    form(
      "request",
      `${select(
        "Assunto",
        "kind",
        ["primeiro contato", "reagendamento", "pacotes", "outros"].map((x) => [
          x,
          x,
        ]),
        kind,
      )}${field("Nome / identificação", "name", "text", "", 'required maxlength="150"')}${select("Paciente (opcional)", "patientId", [["", "Sem vínculo"], ...state.patients.map((p) => [p.id, p.name])])}${textarea("Descrição breve (sem detalhes clínicos)", "message", "", 'required maxlength="1000"')}${field("Sugestão de data e hora (opcional)", "suggestion", "datetime-local", "")}`,
      "",
      "Registrar solicitação",
      '<div class="notice">Registro local/manual. Motivo de remarcação opcional. Resposta e disponibilidade dependem da psicóloga; nenhuma mensagem será enviada.</div>',
    ),
  );
}
function ledgerForm() {
  openModal(
    "Novo lançamento financeiro",
    form(
      "ledger",
      `<div class="form-grid">${select("Tipo", "type", [
        ["receipt", "Recebimento"],
        ["refund", "Estorno / restituição"],
        ["fee", "Taxa de pagamento"],
        ["expense", "Despesa"],
      ])}${select("Contrato (obrigatório para recebimento/restituição)", "packageId", [["", "Selecionar"], ...state.packages.map((p) => [p.id, patientName(p.patient_id) + " • " + p.name + " • pendente " + money(p.pending)])])}${field("Data efetiva do pagamento / saída", "date", "date", today(), "required")}${field("Valor em R$", "amount", "number", "", 'required min="0.01" max="1000000" step="0.01"')}${field("Descrição administrativa", "description", "text", "", 'required maxlength="250"')}${field("Referência única do comprovante", "reference", "text", "", 'required maxlength="150"')}</div>${check("Verifiquei o recebimento/restituição efetivo por comprovante ou extrato.", "verified")}`,
      "",
      "Registrar lançamento",
      '<div class="notice">Registro manual identificado. Nenhum dado de cartão é armazenado. Referências e operações duplicadas são rejeitadas. Link aberto ou declaração do cliente não confirmam pagamento.</div>',
    ),
  );
}
async function action(name, id) {
  switch (name) {
    case "theme":
      document.documentElement.dataset.theme =
        document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      localStorage.setItem(
        "samira-theme",
        document.documentElement.dataset.theme,
      );
      break;
    case "menu":
      $(".shell").classList.toggle("menu-open");
      break;
    case "nav":
      state.view = id;
      await render();
      break;
    case "refresh":
      await render();
      break;
    case "logout":
      await api("/logout", {});
      clearSession();
      await loginScreen();
      break;
    case "login-reload":
      await loginScreen();
      break;
    case "recover":
      await loginScreen("recover");
      break;
    case "modal-close":
      modal.close();
      break;
    case "patient-new":
      await patientForm();
      break;
    case "patient-edit":
      await patientForm(id);
      break;
    case "patient-detail": {
      const p = await api("/patients/" + id);
      openModal(
        "Histórico administrativo",
        `<h3>${escape(p.name)}</h3><div class="form-grid"><p>CPF: ${escape(p.cpf)}<br>Telefone: ${escape(p.phone)}<br>E-mail: ${escape(p.email)}</p><p>Emergência: ${escape(p.emergency)}<br>${p.archived ? "Arquivado" : "Paciente ativo"}</p></div><div class="inline-actions">${button("Editar cadastro", "patient-edit", id, "small")}${button(p.archived ? "Reativar" : "Arquivar", "patient-archive", id, "small")}${button("Contratar pacote", "package-patient", id, "small")}${button("Prontuário", "clinical-patient", id, "small", "lock")}</div><h3 class="form-section">Pacotes contratados</h3>${p.packages.length ? packageTable(p.packages) : '<p class="muted">Sem contratações.</p>'}<h3 class="form-section">Histórico administrativo</h3>${p.history.map((x) => `<p class="record-meta">${dateLabel(x.at)} • ${escape({ "patient.created": "Cadastro criado", "patient.updated": "Cadastro editado", "patient.archived": "Paciente arquivado", "patient.reactivated": "Paciente reativado", "package.contracted": "Pacote contratado", "session.created": "Sessão registrada", "session.corrected": "Sessão corrigida", "patient.read": "Cadastro consultado" }[x.action] || x.action)}</p>`).join("")}`,
      );
      break;
    }
    case "patient-archive": {
      const p = await api("/patients/" + id);
      openModal(
        p.archived ? "Reativar paciente" : "Arquivar paciente",
        form(
          "archive",
          `<p>O cadastro, os contratos e o prontuário serão preservados. ${p.archived ? "O paciente voltará à lista ativa." : "Novas contratações exigirão reativação."}</p><input type="hidden" name="archived" value="${!p.archived}">`,
          id,
          "Confirmar",
        ),
      );
      break;
    }
    case "package-new":
      await packageForm();
      break;
    case "package-patient":
      await packageForm(id);
      break;
    case "renewal": {
      const r = state.requests.find((x) => x.id === id);
      await packageForm(r.patientId, id);
      break;
    }
    case "catalog-edit": {
      const p = state.catalog.find((x) => x.id === id);
      openModal(
        "Preço de novas contratações",
        form(
          "catalog",
          field(
            "Valor em R$",
            "price",
            "number",
            p.price / 100,
            'required min="0.01" step="0.01"',
          ),
          id,
          "Salvar preço",
          '<p class="muted">Os valores de pacotes já contratados serão preservados.</p>',
        ),
      );
      break;
    }
    case "session-list":
      await sessionList(id);
      break;
    case "session-new":
      await sessionForm(id);
      break;
    case "session-edit": {
      const entry = state.sessionList.find((x) => x.id === id);
      await sessionForm(entry.package_id, entry);
      break;
    }
    case "clinical-patient":
      modal.close();
      state.clinicalPatient = id;
      state.view = "clinical";
      await render();
      break;
    case "clinical-new":
      clinicalForm(id);
      break;
    case "clinical-edit":
    case "clinical-complement": {
      const x = state.clinicalEntries.find((x) => x.id === id);
      clinicalForm(
        x.patient_id,
        x,
        name === "clinical-edit" ? "correcao" : "complemento",
      );
      break;
    }
    case "clinical-export": {
      const ids = [...document.querySelectorAll(".export-entry:checked")].map(
        (x) => x.value,
      );
      if (!ids.length)
        throw new Error("Selecione ao menos uma evolução para exportar.");
      openModal(
        "Exportar registros selecionados",
        form(
          "clinical-export",
          `<p>${ids.length} registro(s) selecionado(s), com suas versões anteriores. O arquivo conterá dados clínicos e deverá ser guardado em local protegido.</p><input type="hidden" name="ids" value="${escape(JSON.stringify(ids))}">${check("Revisei a seleção e autorizo a exportação para revisão.", "reviewed")}`,
          id,
          "Exportar PDF",
        ),
      );
      break;
    }
    case "request-new":
      requestForm();
      break;
    case "request-edit": {
      const r = state.requests.find((x) => x.id === id);
      openModal(
        "Responder solicitação",
        form(
          "request-edit",
          `<p><strong>${escape(r.name)}</strong> • ${escape(r.kind)}</p><p>${escape(r.message)}</p>${textarea("Resposta / observação administrativa", "note", r.note || "", 'maxlength="1000"')}${select(
            "Estado da solicitação",
            "status",
            [
              ["pendente", "Pendente"],
              ["atendida", "Atendida"],
            ],
            r.status,
          )}`,
          id,
          "Salvar acompanhamento",
          '<div class="notice">Salvar não envia uma mensagem. Marque atendida somente após resolver a solicitação.</div>',
        ),
      );
      break;
    }
    case "whatsapp-demo": {
      if (id === "3") {
        openModal(
          "Pacotes • mensagem de demonstração",
          `<div class="notice">Demonstração local. Nenhuma mensagem enviada.</div>${state.catalog.map((p) => `<p>${escape(p.name)} • ${p.sessions} sessão(ões) • ${money(p.price)}</p>`).join("")}<p class="muted">Formas de pagamento: Pix, transferência, dinheiro ou cartão em até 6x sem juros conforme contratação e configuração comercial. Confirme com a profissional.</p>${button("Registrar solicitação sobre pacotes", "request-package", "", "primary")}`,
        );
      } else
        requestForm(
          { 1: "primeiro contato", 2: "reagendamento", 4: "outros" }[id],
        );
      break;
    }
    case "request-package":
      requestForm("pacotes");
      break;
    case "ledger-new":
      ledgerForm();
      break;
    case "contract-review": {
      const x = state.contracts.find((x) => x.id === id);
      openModal(
        "Revisar contrato • versão " + x.version,
        form(
          "contract-revise",
          `<p><strong>${escape(x.patient.name)}</strong><br>CPF: ${escape(x.patient.cpf)}<br>${escape(x.package.name)} • ${x.package.sessions} sessões • ${money(x.package.price)}<br>${escape(x.package.paymentMethod)} • ${x.package.installments}x • vencimento ${dateLabel(x.package.dueDate)}<br>Endereço: ${escape(x.address || "Pendente de configuração")}</p>${textarea("Condições contratuais completas", "terms", x.terms, 'required maxlength="30000" rows="10"')}${field("Motivo desta versão", "reason", "text", "", 'required maxlength="500"')}${check("Revisei o documento-base, os dados e as condições legais, incluindo a cláusula de 90 dias.", "reviewed")}`,
          id,
          "Gerar nova versão",
          '<div class="notice">Versões anteriores e PDFs assinados serão preservados. Sem o contrato-base, não é possível garantir fidelidade às cláusulas. Configure o endereço antes de finalizar a revisão.</div>',
        ),
      );
      break;
    }
    case "contract-status": {
      const x = state.contracts.find((x) => x.id === id);
      const next =
        x.status === "minuta"
          ? "enviado"
          : x.status === "enviado"
            ? "aguardando assinatura"
            : null;
      openModal(
        "Estado e assinatura",
        `<p>${escape(x.patient.name)} • versão ${x.version}</p>${badge(x.status)}<div class="notice">Envio e assinatura acontecem fora do sistema. Estes estados são registros manuais da profissional. Importar um PDF exige validar as assinaturas de ambas as partes no ITI.</div>${x.provisional ? '<div class="notice error">Minuta provisória: revise condições e configure endereço antes de enviar ou importar assinatura.</div>' : ""}${next ? form("contract-state", `<input type="hidden" name="status" value="${next}">${check("Revisei e realizei esta etapa externamente. Nenhuma mensagem será enviada pelo sistema.", "reviewed")}`, id, "Registrar como " + next) : ""}${form("signed-file", `<label class="field">PDF assinado (até 10 MB)<input name="file" type="file" accept="application/pdf,.pdf" required></label>${check("Validei ambas as assinaturas no ITI e conferi o documento completo. O sistema registra minha declaração, sem validação criptográfica automática.", "validated")}`, id, "Preservar arquivo assinado")}<details><summary>Histórico de estados</summary>${x.history.map((h) => `<p>${dateLabel(h.at)} • ${escape(h.status)}<br>${escape(h.method || "Minuta gerada")}</p>`).join("")}</details><p><a href="https://validar.iti.gov.br/" target="_blank" rel="noopener noreferrer">Validar assinaturas no ITI</a></p>`,
      );
      break;
    }
    case "settings-edit": {
      const x = state.settings;
      openModal(
        "Dados e condições do consultório",
        form(
          "settings",
          `${field("Endereço profissional", "address", "text", x.address, 'maxlength="500"')}${textarea("Condições do contrato-base (preservar cláusulas legais)", "terms", x.terms, 'required maxlength="30000" rows="10"')}${select(
            "Quem absorve taxas do pagamento",
            "feeBearer",
            [
              ["professional", "Profissional"],
              ["client", "Cliente — exige revisão comercial e contratual"],
            ],
            x.feeBearer,
          )}${check("Condições conferidas com o documento original e revisadas para utilização.", "termsApproved", x.termsApproved)}`,
          "",
          "Salvar configurações",
        ),
      );
      break;
    }
    case "audit": {
      const logs = await api("/audit");
      openModal(
        "Acessos e alterações",
        `<p class="muted">Metadados de até 200 eventos. O conteúdo clínico não é registrado neste log.</p><div class="list-table"><table><thead><tr><th>Data</th><th>Evento</th><th>Identificador</th></tr></thead><tbody>${logs.map((l) => `<tr><td>${dateLabel(l.at)}</td><td>${escape(l.action)}</td><td>${escape(l.entity)}</td></tr>`).join("")}</tbody></table></div>`,
      );
      break;
    }
  }
}
document.addEventListener("click", (event) => {
  const b = event.target.closest("[data-action]");
  if (b) {
    event.preventDefault();
    action(b.dataset.action, b.dataset.id).catch((err) =>
      toast(err.message, true),
    );
  }
});
document.addEventListener("input", (event) => {
  if (event.target.id === "patient-search") {
    state.search = event.target.value;
    $("#patient-cards").innerHTML = patientCards();
  }
});
document.addEventListener("change", async (event) => {
  try {
    if (event.target.id === "archived-filter") {
      state.archived = event.target.checked;
      $("#patient-cards").innerHTML = patientCards();
    }
    if (event.target.id === "finance-month") {
      state.month = event.target.value;
      await render();
    }
    if (event.target.id === "dictation-text") {
      const file = event.target.files[0];
      if (!file) return;
      if (file.size > 100000)
        throw new Error("Texto muito grande. Limite: 100 KB.");
      const value = await file.text();
      if (value.length > 20000)
        throw new Error("Limite da evolução: 20.000 caracteres.");
      modal.querySelector("[name=text]").value = value;
      toast("Texto importado localmente. Revise antes de salvar.");
    }
  } catch (err) {
    toast(err.message, true);
  }
});
document.addEventListener("submit", async (event) => {
  const f = event.target;
  if (!f.matches("form")) return;
  event.preventDefault();
  const submit =
    f.querySelector("[type=submit]") || f.querySelector("button.primary");
  if (submit.disabled) return;
  submit.disabled = true;
  const original = submit.innerHTML;
  submit.textContent = "Aguarde…";
  const error = f.querySelector(".modal-error,.login-error");
  if (error) error.textContent = "";
  const b = Object.fromEntries(new FormData(f));
  for (const input of f.querySelectorAll("input[type=checkbox]"))
    b[input.name] = input.checked;
  const key = f.dataset.key,
    id = f.dataset.id;
  try {
    if (f.id === "login-form") {
      const result = await api("/auth/login", b);
      challengeId = result.challengeId;
      await loginScreen("verify");
      return;
    }
    if (f.id === "verify-form") {
      const result = await api("/auth/verify", { ...b, challengeId });
      state.csrf = result.csrf;
      state.me = await api("/me");
      await render();
      return;
    }
    if (f.id === "recover-form") {
      const result = await api("/auth/recover", b);
      challengeId = result.challengeId;
      await loginScreen("reset");
      return;
    }
    if (f.id === "reset-form") {
      if (b.password !== b.confirmation) throw new Error("Senhas diferentes.");
      await api("/auth/reset", { ...b, challengeId });
      await loginScreen();
      toast("Senha alterada. Entre com a nova senha.");
      return;
    }
    switch (f.dataset.form) {
      case "patient":
        await api(
          "/patients" + (id ? "/" + id : ""),
          b,
          id ? "PUT" : "POST",
          key,
        );
        break;
      case "archive":
        await api(
          "/patients/" + id + "/archive",
          { archived: b.archived === "true" },
          "POST",
          key,
        );
        break;
      case "package":
        b.installments = Number(b.installments);
        if (!b.renewalId) delete b.renewalId;
        await api("/packages", b, "POST", key);
        break;
      case "catalog":
        b.price = Math.round(Number(b.price) * 100);
        await api("/catalog/" + id, b, "PUT", key);
        break;
      case "session":
        b.date = new Date(b.date).toISOString();
        if (b.suggestion) b.suggestion = new Date(b.suggestion).toISOString();
        await api(
          "/sessions" + (id ? "/" + id : ""),
          b,
          id ? "PUT" : "POST",
          key,
        );
        break;
      case "clinical":
        if (b.date) b.date = new Date(b.date).toISOString();
        await api(
          "/clinical" + (id ? "/" + id : ""),
          b,
          id ? "PUT" : "POST",
          key,
        );
        break;
      case "clinical-export":
        await download(
          "/clinical/" + id + "/export",
          { ids: JSON.parse(b.ids), reviewed: b.reviewed },
          "evolucoes-revisao.pdf",
        );
        break;
      case "request":
        if (b.suggestion) b.suggestion = new Date(b.suggestion).toISOString();
        await api("/requests", b, "POST", key);
        break;
      case "request-edit":
        await api("/requests/" + id, b, "PUT", key);
        break;
      case "ledger":
        b.amount = Math.round(Number(b.amount) * 100);
        await api("/ledger", b, "POST", key);
        break;
      case "contract-revise":
        await api("/contracts/" + id + "/revise", b, "POST", key);
        break;
      case "contract-state":
        await api("/contracts/" + id + "/status", b, "POST", key);
        break;
      case "settings":
        await api("/settings", b, "PUT", key);
        break;
      case "signed-file": {
        if (!b.validated)
          throw new Error(
            "Confirme a validação manual de ambas as assinaturas.",
          );
        const fd = new FormData(f);
        fd.set("validated", "true");
        const r = await fetch("/api/contracts/" + id + "/signed", {
          method: "POST",
          headers: { "X-CSRF-Token": state.csrf },
          body: fd,
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        break;
      }
    }
    modal.close();
    await render();
    toast(
      f.dataset.form === "clinical-export"
        ? "Exportação concluída. Proteja o arquivo."
        : "Registro salvo.",
    );
  } catch (err) {
    if (error) error.textContent = err.message;
    else toast(err.message, true);
  } finally {
    if (submit.isConnected) {
      submit.disabled = false;
      submit.innerHTML = original;
    }
  }
});
let lastActivity = Date.now();
for (const event of ["pointerdown", "keydown"])
  document.addEventListener(event, () => (lastActivity = Date.now()), {
    passive: true,
  });
setInterval(async () => {
  if (!state.me) return;
  const elapsed = Date.now() - lastActivity;
  if (elapsed >= state.me.idleMinutes * 60000) {
    try {
      await api("/logout", {});
    } catch {}
    clearSession();
    await loginScreen();
    toast("Sessão encerrada por inatividade.");
  } else if (elapsed < 60000) {
    try {
      await api("/activity", {});
    } catch {}
  }
}, 45000);
(async () => {
  try {
    state.me = await api("/me");
    state.csrf = state.me.csrf;
    await render();
  } catch {
    await loginScreen();
  }
})().catch((err) => {
  root.innerHTML = `<main><div class="notice error">${escape(err.message)}</div><p>Verifique o servidor no terminal.</p></main>`;
});
