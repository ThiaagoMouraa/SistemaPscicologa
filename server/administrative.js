// Interface isolada: recebe somente dados administrativos. Nunca recebe o store,
// evoluções, diagnósticos, áudio, CPF ou credenciais da sessão profissional.
export function welcome(hour = new Date().getHours()) {
  const greeting =
    hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  return `${greeting}! Seja bem-vindo ao atendimento remoto do consultório da Samira Costa. Escolha uma opção:\n1 — Primeiro contato\n2 — Reagendar consulta\n3 — Pacotes de atendimento\n4 — Outros assuntos`;
}
export function administrativeReply(option, catalog) {
  switch (String(option)) {
    case "1":
      return "Informe seu nome e uma descrição breve da necessidade. Evite detalhes clínicos. A psicóloga responderá pessoalmente.";
    case "2":
      return "Informe sua identificação e sugestão de data ou horário. Motivo opcional. A disponibilidade será confirmada pela profissional.";
    case "3":
      return (
        catalog
          .map(
            (p) =>
              `${p.name}: ${p.sessions} sessão(ões), ${(p.price / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`,
          )
          .join("\n") +
        "\nPix e cartão em até 6 vezes sem juros dependem da configuração comercial. Confirme com a psicóloga."
      );
    case "4":
      return "Descreva brevemente o assunto administrativo, sem informações clínicas. Encaminharemos para atendimento humano.";
    default:
      return welcome();
  }
}
