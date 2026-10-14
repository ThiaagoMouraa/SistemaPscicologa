# Consultório Samira Costa

Protótipo funcional de gestão de atendimentos, exclusivo de Samira Costa, CRP 12/11679. HTML, CSS e JavaScript sem framework na interface; Node.js e Express no servidor; SQLite persistente em disco. Nenhum serviço foi contratado ou publicado.

## Abrir no VS Code e executar

Abra esta pasta pelo Explorer do VS Code e use **Terminal → Novo terminal** na raiz do projeto. Recomenda-se **Node.js 24 LTS** e npm. O mínimo é Node 22.13 com `node:sqlite`; Node 23.6 disponível neste ambiente também executou os testes, mas emite aviso de SQLite experimental e uma dependência prefere versões LTS.

```powershell
npm install
npm run setup
npm start
```

No PowerShell, se a política local bloquear `npm.ps1`, use `npm.cmd` no lugar de `npm`, por exemplo `npm.cmd run setup`. O comando de instalação alternativo é `npm run install:deps`; após receber o projeto, `npm ci` reproduz o lockfile.

**Endereço:** http://127.0.0.1:3000. Abra pelo Simple Browser/preview do próprio VS Code ou pelo navegador. Live Server sozinho não executa o servidor Node nem a API.

O arquivo `.env` local foi gerado com chaves aleatórias. **A primeira senha ainda deve ser criada por você** com `npm run setup`, que solicita a senha de forma oculta no terminal, com confirmação. Não há senha padrão, cadastro público, acesso automático ou conta do paciente. Não digite segredos em mensagens. Se a conta já existir, o setup preserva sua senha; utilize a recuperação na interface.

E-mail de login: `Samira.costta@gmail.com` (comparação sem distinção entre maiúsculas e minúsculas). Após a senha correta, digite o código que aparece no **terminal do servidor** em modo de demonstração. Ele não aparece na interface nem é enviado por e-mail nesse modo. Recuperação usa outro código temporário do mesmo modo. Códigos expiram em 10 minutos, são de uso único e limitados a cinco tentativas. Sessões expiram por inatividade (20 minutos por padrão) e têm prazo absoluto de 12 horas.

## Demonstração separada

`APP_MODE=demo`, `MAIL_MODE=local` e `DATA_DIR=./data/demo` são as configurações iniciais. A base local contém três pacientes **explicitamente fictícios**, pacotes, sessões e lançamentos administrativos. Os CPFs são números sintéticos de validação, não documentos fornecidos por pessoas reais. Não use essa base para dados reais.

```powershell
npm run seed:demo
```

O seed nunca substitui dados existentes e é bloqueado em produção. Uma nova instalação pode usar o seed após o setup. Nenhuma evolução real foi criada. A base de testes é separada em `test-output/`, criada e removida automaticamente por teste. Sua conta de demonstração não recebe a senha das fixtures de teste.

## O que funciona

- Autenticação por senha com hash scrypt (N=65536, r=8, p=2 e salt aleatório) e código de confirmação; recuperação, logout, limitação persistente por IP, sessão em cookie HttpOnly/SameSite e validação CSRF. Códigos temporários são armazenados como HMAC, com chave do ambiente.
- Cadastro, edição, pesquisa e arquivamento de pacientes; CPF com dígitos verificadores e índice único, inclusive para arquivados. Cartões sem conteúdo clínico. Histórico administrativo e prontuário separados.
- Catálogo inicial: Avulso 1 sessão/R$ 250; Quinzenal 2/R$ 440; Mensal 4/R$ 880. Ajuste de preços somente para novas contratações. A base fictícia não muda o catálogo inicial.
- Contratação confirmada pelo cliente e snapshot do preço; progresso; realizadas, faltas contratuais cobradas, faltas não cobradas, canceladas e remarcadas. Correções preservam versões. Sugestões de horário não confirmam disponibilidade.
- Ao esgotar pacotes de 2/4 sessões, uma solicitação administrativa de renovação é criada, sem cobrança ou contratação automática. Uma correção que devolve saldo cancela a solicitação não contratada; esgotar novamente reabre a mesma solicitação. Confirmar renovação registra o consentimento, forma de pagamento e até seis parcelas para cartão, gerando nova contratação/minuta uma única vez.
- Evoluções manuais revisadas, complementos, correções e versões cronológicas. Importação local de `.txt` produzido por ditado local. Exportação PDF dos registros selecionados, com versões, para revisão. Sem inferência de diagnóstico e sem serviços externos de IA.
- Minutas individuais Word (`.docx`) e PDF geradas por contratação; revisão cria nova versão; estados registrados manualmente: minuta, enviado, aguardando assinatura, assinado. Download e upload protegidos por autenticação. PDF assinado preservado sem modificar seus bytes, criptografado em banco, com hash SHA-256.
- Solicitações e notificações administrativas pendentes/atendidas. Demonstração dos quatro assuntos do WhatsApp, sem envio de mensagens. Atendimento clínico não faz parte da automação.
- Registro manual identificado de recebimentos verificados, restituições/estornos, taxas e despesas. Referência única e idempotência previnem duplicação. Recebimentos não podem exceder o contrato e restituições não podem exceder o recebido.
- Demonstrativo mensal em PDF e **planilha CSV UTF-8**, aberta por Excel/LibreOffice (separador `;`, decimais com vírgula). Não é arquivo `.xlsx`. Mostra recebido, contratado, restituições, taxas, despesas e saldo, com detalhes conciliáveis e referência. Pendências têm escopo explícito de todos os contratos, não apenas os contratados no mês. Não é contracheque nem apuração de lucro contábil.
- Temas claro/escuro, layout responsivo, campos rotulados, navegação por teclado, foco visível, redução de movimento e avisos de erro/carregamento. Logo SVG original, árvore estilizada criada para este projeto. Nenhuma referência visual estava anexada.

## Contrato-base e documentos

**`Contrato_consultas_psicologicas.pdf` não foi encontrado na pasta.** As minutas iniciais avisam expressamente que são provisórias. Não reproduzem um contrato que não foi disponibilizado nem inventam a cláusula de 90 dias. O envio/importação de assinatura fica bloqueado enquanto a minuta estiver provisória.

Quando o documento estiver disponível, preserve seu original, revise-o e incorpore suas condições em **Configurações → Dados e condições**. Configure o endereço profissional e marque as condições revisadas. Depois, em **Contratos → Revisar**, confira os dados, informe motivo e gere nova versão. A profissional deverá validar conteúdo, vencimentos, condições de cancelamento, faltas, prazos, a cláusula de 90 dias e os requisitos legais aplicáveis. O sistema não realiza negativação.

O estado “enviado” é declaração manual de uma etapa executada fora do sistema, não confirmação de entrega por e-mail/WhatsApp. A assinatura GOV.BR acontece externamente: cada parte utiliza o portal, quando elegível; conferir o PDF final em https://validar.iti.gov.br/ e importar com declaração de validação de **ambas** as assinaturas. O servidor valida formato/tamanho do arquivo, mas **não valida criptograficamente suas assinaturas**; a declaração e o hash são registrados. Uma imagem de assinatura não faz parte desse fluxo.

A exportação clínica é uma cópia dos registros para revisão, **não um relatório psicológico conclusivo**. Não gera diagnósticos. Modelos profissionais de declaração, atestado, relatório, laudo ou parecer exigem elaboração/revisão da psicóloga conforme o tipo de documento e as normas vigentes. O contrato-base, a operação concreta, os termos e os documentos não foram certificados juridicamente ou pelo CFP. A geração e a estrutura dos arquivos PDF/DOCX foram testadas; a paginação ainda requer revisão visual local, pois não havia navegador, Poppler ou LibreOffice conectado neste ambiente.

## Configuração e integrações pendentes

Copie `.env.example` quando preparar outro ambiente. O setup cria chaves aleatórias apenas quando `.env` não existe; um `.env` copiado com chaves vazias deve receber segredos gerados por mecanismo seguro, nunca valores fixos. Não publique `.env`, bases, backups ou arquivos exportados em Git.

| Integração  | Situação                                                                      | O que falta e custos possíveis                                                                                                                                                                                                                                                                                                             |
| ----------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| E-mail      | Adaptador SMTP implementado; demo não envia                                   | Serviço SMTP, domínio/remetente autorizado, SPF/DKIM/DMARC, credenciais e validação de entrega; possível mensalidade/limite por volume. Um endereço Gmail como destinatário não autoriza envio.                                                                                                                                            |
| WhatsApp    | Textos e interface administrativa isolada preparados; conector não ativado    | Conta/numero Business, API oficial/fornecedor autorizado, verificação de webhooks, deduplicação de eventos, revisão das políticas e modelos aprovados conforme janela/fluxo; possíveis tarifas Meta e do fornecedor. Preencher variáveis não ativa o serviço.                                                                              |
| Pix/cartão  | Registro manual verificado ativo; criação de link retorna integração pendente | Escolher processador, implementar seu adaptador e webhooks com verificação de assinatura/evento, configurar Pix e cartão até 6x sem juros e testar sandbox. Taxas/antecipação/parcelamento dependem do contrato comercial. A profissional absorve taxas por padrão, alterável com revisão das condições. Nenhum dado de cartão é coletado. |
| GOV.BR      | Assinatura externa e importação manual                                        | Elegibilidade de cada signatário, assinatura no portal e validação ITI. Não presumimos disponibilidade de integração direta para profissional privada. Nenhuma credencial GOV.BR é solicitada.                                                                                                                                             |
| Transcrição | Escrita e importação de texto ativas; motor local pendente                    | Instalar/configurar motor offline (por exemplo whisper.cpp) com modelo obtido de fonte confiável, capacidade de CPU/GPU e armazenamento; integrar endpoint privado em loopback, sem rede externa, depois de validar retenção e permissões. Não há captura de áudio ativa nem reconhecimento de voz do navegador.                           |
| Hospedagem  | Não contratada                                                                | Servidor Node, domínio/TLS, disco persistente, gestão de segredos, backups externos cifrados e monitoramento; custos dependem do provedor.                                                                                                                                                                                                 |

Configure SMTP com `MAIL_MODE=smtp`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` e `MAIL_FROM`. A implementação aceita SMTP de fornecedor configurável. `PROFESSIONAL_EMAIL` define a conta inicial e o destinatário; não altere o e-mail sem uma migração revisada da conta existente. O endereço é configurável pela interface ou no ambiente inicial. O modo SMTP não foi testado com serviço real: teste entrega/erros usando sua configuração antes da operação.

`server/administrative.js` define uma interface de textos limitada a catálogo e identificações administrativas. Não recebe o banco, CPF, evolução, áudio, sessão profissional ou chaves. Não existe token externo com acesso às rotas clínicas. Ao implementar conectores, exponha somente operações administrativas específicas, com credenciais e permissões separadas; nunca dê ao fornecedor a sessão da profissional nem acesso ao banco inteiro. `GET /api/integrations` reflete o estado real; as integrações pendentes permanecem desligadas mesmo que variáveis de preparação sejam preenchidas.

## Banco, proteção e migrações

O arquivo persistente é `data/demo/consultorio.sqlite` em desenvolvimento. O SQLite utiliza WAL, chaves estrangeiras e transações; a migração versionada é `db/migrations/001_initial.sql` e `npm run migrate` aplica a estrutura de forma idempotente. O JSON interno de entidades é criptografado com AES-256-GCM e IV aleatório. Isso inclui dados identificáveis do paciente, evoluções, versões, contratos, anexos e respostas armazenadas para idempotência. CPF para deduplicação usa HMAC com chave, não CPF em claro. Metadados de relacionamentos, datas, IDs e autenticação necessários à operação não são integralmente cifrados. A política de arquivo/disco e as permissões do sistema operacional continuam necessárias.

`DATA_KEY` cifra registros. **Se perdida, os registros não podem ser recuperados.** `BACKUP_KEY` cifra os backups completos. Armazene ambas em gestor de segredos e mantenha cópia de recuperação controlada, separada do arquivo de backup. Não há rotação automática das chaves; uma futura rotação requer migração cuidadosamente validada.

Logs de auditoria guardam ação, hora e identificador, sem texto clínico. Rotas clínicas e exportações exigem sessão no servidor. Os únicos arquivos públicos são HTML/CSS/JS/logo, sem dados do consultório. Download autenticado perde a proteção do servidor após salvo no computador: proteja o dispositivo e o diretório de exportações. Limites de acesso ao banco e backups dependem também de ACLs, criptografia de disco, cópias externas e acesso restrito da hospedagem.

## Backup e restauração

O backup usa snapshot consistente `VACUUM INTO`, cifra o SQLite completo, inclui hash de integridade, identificação do ambiente e referência da chave de dados. Comandos devem ser executados na raiz do workspace; saídas e restaurações são restritas a caminhos dentro dele. Nenhuma operação sobrescreve backup ou diretório de restauração existente.

```powershell
npm run backup
# Ou nome escolhido:
npm run backup -- backups/consultorio.scbackup
# Restaurar em diretório NOVO:
npm run restore -- backups/consultorio.scbackup data/restaurado-revisao
```

A restauração exige o mesmo ambiente e as chaves originais, verifica integridade do SQLite e relações e invalida sessões/códigos restaurados. Para usar o banco restaurado, pare o servidor, altere `DATA_DIR=./data/restaurado-revisao` no `.env` e execute `npm start`. Confira pacientes, versões e financeiro antes de considerar a restauração aceita. Nunca restaure uma base demo em produção. Guarde o banco original e as chaves enquanto revisa; não há exclusão automática de registros.

Teste de restauração automatizado inclui pacientes, versões clínicas, contratos, lançamentos, sessões invalidadas e rejeição de chave/ambiente incorretos. Para operação real, estabeleça frequência, retenção, responsáveis, cópia externa cifrada e simulações periódicas de recuperação. Guarda, arquivamento, acesso e descarte devem ser validados com a profissional conforme normas aplicáveis; o protótipo preserva registros e não implementa expurgo.

## Implantação futura

1. Utilize Node.js 24 LTS em servidor privado com disco persistente, processo gerenciado e permissões exclusivas no volume de dados. SQLite requer filesystem local confiável; não usar armazenamento efêmero de funções serverless nem volume de rede sem avaliar locking. Este projeto assume **uma instância**. Para múltiplas instâncias, migrar para banco apropriado e sessões compartilhadas.
2. Instale via `npm ci --omit=dev`. Não copie dados demo para produção. Configure `NODE_ENV=production`, `APP_MODE=production`, `DATA_DIR=./data/production`, chaves novas seguras, SMTP autorizado e `APP_URL=https://seu-dominio`. Não há endpoint público de primeira senha; execute o setup em terminal seguro no ambiente de destino.
3. Use proxy reverso com TLS/HTTPS na frente do Node, encaminhando `X-Forwarded-Proto` de forma confiável. A configuração assume **um proxy confiável** (`trust proxy=1`); impeça acesso público direto à porta Node e ajuste essa política caso sua arquitetura seja diferente. Cookie Secure, CSP, proteção de frames e HSTS são habilitados. HTTP e modo local de códigos não são aceitos na configuração de produção.
4. Configure backup cifrado, disco cifrado/ACLs, restauração de teste, monitoramento sem dados clínicos, atualização de dependências e acesso administrativo mínimo. Revise tempos de sessão, limites, logs e mecanismos de segurança antes de dados reais.
5. Revise o contrato-base, política de guarda, operação LGPD e normas CFP com os responsáveis. Teste SMTP, acesso negado sem login, exportações e recuperação. Integrações externas exigem implementação/configuração e testes independentes antes de ativação.

Não usar hospedagem puramente estática. Não há deploy automático, aquisição de serviços, coleta pública de dados, renovação automática, negativação ou cobrança automática neste projeto.

## Testes e revisão

```powershell
npm test
npm run check
npm audit
```

Testes usam Node Test Runner, banco isolado e API HTTP real. O teste da interface usa jsdom (DOM sem renderização visual), com login, navegação, criação de paciente, contratação, sessão, evolução, pesquisa, troca de tema e logout. A suíte cobre dados inválidos, CPF duplicado, idempotência, preço contratado, faltas/cancelamentos/correções, renovação única, versões clínicas, ausência de conteúdo clínico nos logs/painel, contratos PDF/DOCX, estados, preservação do arquivo importado, lançamentos e conciliação, CSV/PDF, backup/restauração, sessão, recuperação, CSRF/origem e limites de códigos/login.

Não há teste real de SMTP, WhatsApp, processador, assinaturas GOV.BR ou motor de transcrição; continuam pendentes. Arquivos assinados usados em testes são PDFs fictícios; o teste verifica preservação e declaração manual, não validade de uma assinatura. Nenhum navegador estava conectado para validar aparência, foco modal, responsividade e contraste renderizado. Faça essa revisão no preview do VS Code, nos temas claro/escuro e em larguras de celular e desktop, e confira PDFs/Word localmente.

Revise os arquivos no **Explorer** e no **Source Control** do VS Code. Estrutura:

```text
public/           interface, estilos e árvore original
server/           API, autenticação, domínio, documentos e proteção
db/migrations/    estrutura do banco
scripts/          setup, demo, migração, backup e restauração
test/             testes dos fluxos e interface
.env.example      variáveis sem credenciais reais
data/             bases persistentes locais (ignorado no Git)
backups/          backups cifrados locais (ignorado no Git)
```

## Referências para validação antes da ativação

Referências oficiais consultadas em 13/10/2026; conferir atualizações e adequação ao serviço concreto antes da operação:

- [CFP — Resolução 06/2019 e documentos escritos](https://site.cfp.org.br/cfp-publica-versao-comentada-da-resolucao-sobre-a-elaboracao-de-documentos-escritos/).
- [CRP 12 — registro documental e prontuário](https://transparencia.cfp.org.br/crp12/pergunta-frequente/registro-documental/).
- [GOV.BR — assinatura eletrônica](https://www.gov.br/pt-br/servicos/assinatura-eletronica) e [ITI — validação](https://validar.iti.gov.br/).
- [Documentação de integração da assinatura GOV.BR](https://manual-integracao-assinatura-eletronica.servicos.gov.br/pt-br/latest/iniciarintegracao.html); consultar elegibilidade, sem presumir integração para esta profissional.
- [WhatsApp — políticas de mensagens de negócios](https://business.whatsapp.com/policy/). Aprovar textos/modelos e requisitos do fornecedor na data de ativação, sem fixar preços ou presumir políticas imutáveis.
