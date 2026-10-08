# Autenticação e implantação segura

## Arquitetura e decisão

A versão anterior é React/Vinext (rotas compatíveis com Next), Worker Cloudflare, Drizzle e D1. O cadastro em `leads` retornava um UUID, persistido no navegador; o cabeçalho `X-Visitor-ID` concedia acesso aos dados. Nem esse UUID, nem o e-mail/telefone informado sem verificação, comprovam propriedade.

Esta alteração mantém Workers/D1 e usa OTP por e-mail com entrega pelo Resend via API no servidor. Não adiciona banco externo nem copia registros emocionais para o provedor. O Resend recebe somente destinatário e mensagem de autenticação. A aplicação mantém a identidade em `auth_users`; novos dispositivos autenticados no mesmo e-mail usam o mesmo usuário.

Infraestrutura proposta, apresentada antes da integração: domínio HTTPS para o app, domínio de envio verificado (DNS/DKIM/SPF/DMARC), chave de envio restrita no Worker, tabelas e índices adicionais no D1. Nenhuma conta, DNS, assinatura, secret ou publicação foi criada por este PR.

Custos consultados em 08/10/2026: o plano Free do Resend é gratuito (US$ 0/mês, 3.000 e-mails/mês) e limita envios a 100/dia; esta implementação limita solicitações globalmente a 90 por janela UTC diária. Workers e D1 usam a conta existente, com consumo adicional de requisições, CPU, leituras, escritas e armazenamento, conforme plano/franquia. Como referência, Workers Paid tem assinatura mínima de US$ 5/mês; D1 Free inclui 5 milhões de linhas lidas/dia, 100 mil escritas/dia e 5 GB. Resend Pro custa US$ 20/mês para 50 mil e-mails. Esses planos não foram contratados. Não existe garantia de custo zero: domínio, excedentes e eventual upgrade são decisões do responsável. Confirme os preços antes de ativar. Não habilite excedentes pagos automaticamente.

Fontes: [Resend](https://resend.com/pricing), [Workers](https://developers.cloudflare.com/workers/platform/pricing/), [D1](https://developers.cloudflare.com/d1/platform/pricing/), [API de envio](https://resend.com/docs/api-reference/emails/send-email).

## Propriedades de segurança

- Código aleatório de 8 dígitos, validade de 10 minutos, no máximo 5 verificações por desafio. HMAC-SHA256 com secret do servidor; código nunca retornado pela API ou gravado em logs. Desafio vinculado ao navegador por cookie secreto HttpOnly. Ao reenviar, o cookie muda; use o último código no navegador solicitante.
- Verificação consumida por UPDATE condicional atômico; só um vencedor pode criar sessão. Falhas posteriores exigem novo código. Sessão aleatória de 256 bits, apenas SHA256 no D1, expiração absoluta de 7 dias, revogação no logout. Login revoga a sessão anterior apresentada naquele navegador; outros dispositivos permanecem conectados.
- Cookies `__Host-*`, `Path=/`, sem Domain, `HttpOnly; Secure; SameSite=Strict`. Tokens nunca vão a localStorage, URLs ou payloads de resposta. Não há modo inseguro de desenvolvimento.
- Escritas, inclusive login, verificação e logout, exigem Origin HTTPS exata, URL da origem configurada, cabeçalho `X-Diary-Request: 1`, e rejeitam `Sec-Fetch-Site` incompatível. JSON obrigatório nas operações com corpo; sem CORS permissivo. GET não altera dados. Respostas privadas usam `Cache-Control: no-store` e `Vary: Cookie`.
- SQL parametrizado. A identidade vem exclusivamente de sessão válida; filtros `user_id` em todas as consultas, exclusões e atualizações atuais. Propriedade enviada no corpo ou no cabeçalho antigo é ignorada. Dados legados com `user_id IS NULL` são inacessíveis pelo app.
- Limites persistentes no D1: solicitação 20/IP/hora, 1/e-mail/minuto, 5/e-mail/hora e 90 globais/dia; verificação 40/IP/hora, mais o limite de 5/desafio. IPs e chaves de limite têm HMAC, não texto aberto. Janelas fixas admitem rajadas na virada. O limite global pode ser esgotado por abuso: é proteção de orçamento, não garantia de disponibilidade. Avaliar regras WAF/limites na borda antes do lançamento, de acordo com o tráfego, sem habilitar serviços pagos automaticamente. `CF-Connecting-IP` só deve ser aceito do runtime Cloudflare confiável, nunca de proxy que preserve um valor fornecido pelo cliente.
- Entradas JSON limitadas a 100 KB reais, inclusive streaming; validação de tipos, tamanhos, emoções, intensidade, datas, horários e categorias. Erros de banco/provedor não expõem conteúdo, tokens ou parâmetros. O cadastro promocional permanece, opcional e separado do login, autenticado e limitado a 3 envios/usuário/dia.
- Sem troca de e-mail, recuperação alternativa, MFA ou painel administrativo público nesta versão. A segurança da conta depende também da caixa de e-mail. Nenhum dado legado é associado só porque o e-mail coincide.

## Variáveis

`DB`: binding D1 existente. Não altere o `database_id` para outro banco durante a atualização.

`AUTH_ORIGIN`: origem exata, por exemplo `https://diario.example.com`, sem barra final/caminho. Uma origem por ambiente; previews e staging têm configuração e D1 próprios.

`AUTH_SECRET`: secret aleatório de pelo menos 32 bytes (por exemplo, 64 caracteres hexadecimais gerados localmente). Não copie o placeholder. Usado para HMAC de OTP/limites. A rotação invalida desafios pendentes e chaves de limite; para revogar sessões existentes, use o procedimento de rollback/revogação.

`RESEND_API_KEY`: chave com permissão apenas de envio, do ambiente correspondente.

`AUTH_EMAIL_FROM`: remetente de domínio verificado, por exemplo `Meu Diário Emocional <acesso@example.com>`.

Configure valores via painel/secrets do Worker (`wrangler secret put NOME`), nunca `NEXT_PUBLIC_*`, `vars` com credenciais, logs, PR ou commits. Há placeholders em `docs/environment.example`; arquivos `.env*` e `.dev.vars*` permanecem ignorados. Configure o provedor sem rastreamento de abertura/cliques para mensagens de login. Não use dados emocionais em telemetria ou mensagens de e-mail.

## Validação e implantação manual

1. Revisar o PR, a auditoria de dependências e as limitações de validação em `docs/validation.md`. Não efetuar merge/deploy automaticamente.
2. Node 24 para os testes (usa SQLite local embutido), `npm ci`, `npm test`, `npm run typecheck`, `npm run build`. Os testes não usam secrets reais, provedor de e-mail ou produção.
3. Criar ambiente de staging separado com D1 sem dados reais. `wrangler d1 migrations apply DB --local` é exclusivamente local. Não usar o banco de produção para testes.
4. Configurar HTTPS também no desenvolvimento (proxy HTTPS confiável para o dev server, preservando Origin/Host) e definir `AUTH_ORIGIN` correspondente em `.dev.vars` ignorado. Não remover Secure ou checagens de origem para facilitar o desenvolvimento.
5. Em staging, configurar secrets/remetente e aplicar as migrações no D1 de staging por ação manual autorizada. Validar entrega real, dois navegadores/dispositivos, logout, expiração, cookie flags no navegador, ataque de origem diferente, não exposição de secrets no bundle e navegação/exportações/lembretes/mobile. Testes locais de SQLite não substituem essa homologação no runtime D1.
6. Antes de qualquer operação de produção: confirmar conta/binding/banco exato, exportar backup consistente e registrar hash/contagens por tabela; verificar restauração em ambiente isolado. Guardar backup criptografado fora do Git. Pausar escritas e login durante a troca; nunca deixar o backend antigo acessível por domínio alternativo/versão antiga após o corte.
7. Apenas com autorização operacional separada, aplicar `0003_secure_auth.sql` pelo fluxo de migrações existente. É aditiva: cria tabelas, índices e colunas nulas, sem apagar/recriar tabelas históricas nem associar registros. Conferir esquema, contagens e hashes dos campos antigos antes/depois. Drizzle metadata foi atualizado; triggers customizados estão no SQL e devem ser preservados nas próximas migrações.
8. Publicar o Worker apenas após aprovação explícita do responsável, configurar secrets nele, conferir isolamento e monitorar métricas sem dados pessoais. O PR não executa este passo. Nunca rodar comandos `--remote`, `deploy`, nem scripts de migração sobre produção como parte dos testes/CI.
9. Informar usuários sobre o novo login e a recuperação assistida. Cadastro local antigo permanece no navegador como referência, mas não é enviado como prova ou credencial.

## Recuperação assistida dos registros antigos

Não há maneira criptograficamente confiável de reconstruir propriedade a partir do UUID antigo. O e-mail dos leads era autodeclarado. Quem controla hoje esse e-mail não demonstra, por isso só, que produziu registros no passado. Casos sem prova independente permanecem preservados, sem associação. Não mostrar conteúdo, existência de registros ou dados de terceiros como desafio de recuperação.

Processo operacional restrito:

1. Usuário cria/verifica a nova conta por OTP. Solicita análise pelo canal privado da responsável, sem publicar UUID ou conteúdo emocional em issues/PRs.
2. Responsável identifica evidência independente anterior ao pedido que vincule aquela pessoa aos registros específicos: por exemplo, documentação de atendimento com origem e cadeia de custódia verificáveis, mantida antes da mudança, e confirmação de identidade por canal previamente estabelecido. Conhecer UUID, possuir o navegador, coincidir nome/telefone/e-mail, conhecer textos ou responder perguntas sobre o diário não são, isoladamente, provas suficientes. Não inventar uma prova quando ela não existe.
3. Revisor autorizado documenta a decisão em sistema privado com acesso restrito. Registrar apenas referência opaca da evidência no banco, sem cópias de documentos ou relatos emocionais. Confirmar o `auth_users.id` da conta verificada e uma lista explícita de IDs dos recursos aprovados. Não vincular um conjunto inteiro só por compartilhar `visitor_id`; `legacy-owner` pode conter dados de pessoas diferentes.
4. Uma segunda revisão confirma evidência, escopo, destinatário e backup. Preparar manifesto privado (fora do checkout/Git), com um objeto por registro: `userId`, `resourceType` (`entries`, `reflections`, `settings`), `resourceId`, `evidenceReference`, `approvedBy` e `independentOwnershipVerified: true`. Esse booleano é atestado do operador, não prova automática.
5. Executar **offline** `node scripts/prepare-legacy-migration.mjs /caminho-privado/approved-manifest.json > /caminho-privado/proposal.sql`. A ferramenta não acessa rede/banco e não executa a proposta. Revisar todo o SQL e testar em cópia isolada. O arquivo contém identificadores pessoais: não versionar nem anexar ao PR.
6. Operador com acesso restrito ao D1, após autorização específica, executa os INSERTs aprovados. Cada INSERT e seus triggers são atômicos: validam recurso ainda sem proprietário, registram auditoria imutável e atualizam **somente** `user_id` daquele recurso. Não alteram ID, visitor_id, textos, datas ou preferências. IDs inexistentes, reatribuição e provas/revisor vazios são rejeitados. A API pública não permite inserir aprovações. Para conjuntos, usar `DB.batch` por ferramenta administrativa privada aprovada para atomicidade do lote; uma execução linha a linha é atômica por registro, não pelo conjunto.
7. Se a conta já possuir configurações e o legado também tiver, o índice único rejeita a associação. Não sobrescrever preferências: revisar com a pessoa e manter o legado preservado até decisão específica sobre esse conflito.
8. Conferir contagens, valores históricos e acesso somente pela conta destinatária; registrar resultado no caso privado. Encerrar o acesso de manutenção. Auditar privilégios do operador e manter comprovantes conforme política de retenção da responsável.

Erro de associação é incidente de privacidade: revogar sessões e bloquear acesso ao recurso durante investigação. Se necessário, um operador autorizado pode retirar somente `user_id` do recurso afetado, com nova evidência corretiva no sistema privado, sem apagar a auditoria original. Não reatribuir sem revisão. Nunca apagar registros para resolver conflito.

## Rollback e manutenção

O rollback seguro é interromper autenticação/escritas, aplicar manualmente `rollback/0003_revoke_sessions.sql` para expirar sessões/desafios e manter o esquema aditivo. Voltar ao código que aceita `X-Visitor-ID` reabre o acesso indevido e é proibido como rollback de segurança. Preservar todos os dados, contas, `user_id` e auditoria. Não há down migration destrutiva automática: remover colunas/tabelas perderia identidades/propriedade de novos dados. Se a migração falhar antes de publicar, pausar e investigar em cópia; não apagar tabelas.

`AUTH_SECRET` não é chave de criptografia dos relatos; o código não altera a criptografia/armazenamento do D1. Limitar acesso administrativo e proteger exports continua necessário.

Revisar/agendar, em operação separada autorizada, `scripts/auth-maintenance.sql`: remove apenas sessões/desafios expirados e limites antigos. Nenhuma limpeza automática é executada pelo PR. Não retém código OTP em texto aberto, IP em texto aberto ou logs de conteúdo do provedor. Definir monitoramento de falhas de entrega e abuso, retenção de backups/evidências e procedimento de revogação com a responsável.
