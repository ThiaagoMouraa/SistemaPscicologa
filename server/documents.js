import PDFDocument from "pdfkit";
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";
export const money = (n) =>
  (n / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export async function pdf(title, lines) {
  const doc = new PDFDocument({
    size: "A4",
    margin: 50,
    info: { Title: title, Author: "Samira Costa" },
  });
  const chunks = [];
  const output = new Promise((resolve, reject) => {
    doc.on("data", (x) => chunks.push(x));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  doc.font("Helvetica-Bold").fontSize(18).fillColor("#1d382e").text(title);
  doc
    .moveDown()
    .font("Helvetica")
    .fontSize(10)
    .fillColor("#222222")
    .text("Samira Costa | CRP 12/11679");
  doc.moveDown();
  for (const line of lines) {
    doc.fontSize(11).text(String(line), { lineGap: 4 });
    doc.moveDown(0.55);
  }
  doc.end();
  return output;
}
export async function word(title, lines) {
  return Packer.toBuffer(
    new Document({
      creator: "Samira Costa",
      title,
      styles: {
        default: {
          document: {
            run: { font: "Calibri", size: 22 },
            paragraph: { spacing: { after: 180 } },
          },
        },
      },
      sections: [
        {
          properties: {
            page: {
              margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 },
            },
          },
          children: [
            new Paragraph({ text: title, heading: HeadingLevel.TITLE }),
            new Paragraph({
              children: [
                new TextRun({
                  text: "Samira Costa | CRP 12/11679",
                  bold: true,
                }),
              ],
            }),
            ...lines.map((text) => new Paragraph({ text: String(text) })),
          ],
        },
      ],
    }),
  );
}
export function contractLines(contract) {
  return [
    `Versão ${contract.version} | Estado: ${contract.status} | Gerado em: ${contract.created_at}`,
    contract.provisional
      ? "MINUTA PROVISÓRIA: documento-base ausente ou termos ainda não aprovados. Não enviar para assinatura."
      : "MINUTA PARA REVISÃO: conferir dados e condições antes do envio.",
    `Profissional: Samira Costa, pessoa física, CRP 12/11679. E-mail: ${contract.professionalEmail}. Endereço: ${contract.address || "PENDENTE DE CONFIGURAÇÃO"}.`,
    `Paciente: ${contract.patient.name}. CPF: ${contract.patient.cpf}. E-mail: ${contract.patient.email}. Telefone: ${contract.patient.phone}.`,
    `Pacote: ${contract.package.name}. Sessões: ${contract.package.sessions}. Valor contratado: ${money(contract.package.price)}.`,
    `Forma de pagamento: ${contract.package.paymentMethod}. Parcelas: ${contract.package.installments}. Vencimento: ${contract.package.dueDate}.`,
    `Taxas: ${contract.feeBearer === "professional" ? "absorvidas pela profissional" : "condições a revisar com o cliente"}. Parcelamento em até 6x sem juros depende da configuração comercial do processador.`,
    contract.terms,
    "Assinatura eletrônica do paciente: __________________________________",
    "Assinatura eletrônica da profissional: _______________________________",
    "Assinar o PDF pelo serviço GOV.BR, quando aplicável, e importar o arquivo assinado. Este documento não contém assinatura eletrônica. Validar em https://validar.iti.gov.br.",
  ];
}
