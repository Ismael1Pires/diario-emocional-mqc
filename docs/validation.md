# Validação e pendências para revisão

## Verificado localmente

- `npm test`: 14 testes usando handlers reais e SQLite em memória com adaptador D1. Cobre OTP, vínculo ao navegador, cookies, hash de sessão, expiração, logout, uso único/concorrência, bloqueio após 5 tentativas, limites persistentes, falha de entrega, CSRF, rejeição de `X-Visitor-ID`, identidade injetada no payload, isolamento entre usuários, escrita/leitura/exclusão existentes, preferências recuperadas e aprovações de legado.
- A migração foi executada somente em bancos efêmeros locais: comparação de todos os valores históricos em registros, reflexões, configurações e leads; proprietários antigos continuam nulos. Aprovações exigem recurso explícito ainda sem proprietário e auditoria imutável.
- `npm run typecheck`: passou.
- Lint das novas rotas, componentes de autenticação, cliente HTTP, schema, testes e scripts: passou (`npx oxlint app/api app/auth-gate.tsx app/client-api.ts app/marketing-signup.tsx db tests scripts`).
- Build Vinext/Worker: passou. `WRANGLER_LOG_PATH=.wrangler/logs` e `MINIFLARE_REGISTRY_PATH=.wrangler/registry` mantêm artefatos locais no workspace. Os assets originais permanecem no Git e o CSS da aplicação não foi alterado.
- Dependência de testes `esbuild` foi tornada explícita. React/React DOM/React Server DOM foram atualizados de 19.2.6 para 19.2.8 por correção de segurança; dependências transitivas receberam correções compatíveis pelo npm. Não houve atualização forçada de versão principal.

## Pendências que bloqueiam liberação

- Homologação em staging com secrets, domínio de envio e entrega real de OTP; testes em browsers/mobile reais, duas sessões, cookie flags, logout/expiração e D1 Cloudflare. Nenhum serviço externo foi ativado e nenhum e-mail real enviado nesta tarefa. Testes SQLite não são confirmação de comportamento distribuído/consistência no D1.
- O runtime local do lockfile suporta compatibility_date até `2026-05-22`, enquanto o repositório configura `2026-09-15`. O dev server não iniciou com essa configuração. A data de produção não foi rebaixada para contornar isso. Alinhar Wrangler/workerd e homologar a data antes do lançamento. Build estático do Worker passou, mas isso não confirma execução no runtime alvo.
- `npm audit --omit=dev` final: **12 alertas altos, zero críticos**, contra 35 alertas (4 críticos) na árvore inicial instalada. Permanecem cadeias de `vinext`, `vite`, `image-size`, `undici`, geradores `shadcn` e dependências de globbing/ts-morph. Avaliar alcance em runtime/build, aplicar atualização compatível ou remover ferramentas não usadas em mudança revisada, e repetir a auditoria antes da liberação. O código de autenticação não elimina riscos das dependências existentes. Não usar `npm audit fix --force` sem revisão.
- O lint geral já contém problemas em `app/emotional-journal.tsx` e `app/reflections.tsx` (regras React Compiler, uso de imagens/exportação por document.write, entre outros). Esses componentes mantêm as funcionalidades existentes e não receberam reescrita geral neste PR; o lint global não está verde. TypeScript e build foram verificados separadamente. A CI adicionada exige testes, typecheck e build, sem disfarçar o estado do lint global.
- Nenhum backup/export de produção foi acessado, nenhuma migração remota foi aplicada e nenhuma propriedade histórica foi atribuída. A operação de produção, recuperação assistida e sua revisão humana permanecem separadas do PR, conforme solicitado.

O PR é apresentado como rascunho para revisão da implementação. Não habilitar auto-merge, deploy ou recuperação automática.
