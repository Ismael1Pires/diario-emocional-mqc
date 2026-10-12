# Stripe — vendas próprias de Jeniffer Pires

Esta proposta depende da autenticação OTP do PR #1. Adiciona Payments e suporte opcional a Billing sem cobrar pelo Diário Emocional. Connect não é necessário: a Jeniffer vende suas próprias ofertas, sem repasses a terceiros. Não foram criados produtos, preços, assinaturas ou pagamentos reais.

O plugin `stripe@openai-curated` foi instalado e o MCP `https://mcp.stripe.com` autenticado. O `stripe_implementation_planner` foi invocado e finalizado em modo de teste na conta **Área restrita de Jeniffer Pires**, com guia `iguide_61VZCgga8xZcistrO41JrMgiYpeV3` e Checkout hospedado na web. A conexão MCP permite planejar e administrar a conta; ela não fornece automaticamente uma API key ao servidor do site.

## Comportamento

`/pagamentos` reutiliza o login por e-mail, mostra somente ofertas configuradas e valores retornados pela Stripe, encaminha para Checkout e permite abrir o Customer Portal. O catálogo determina o modo `payment` ou `subscription` a partir do Price. O histórico apresenta estado confirmado no servidor. O retorno do Checkout não comprova pagamento. A página principal do diário permanece sem paywall e sem novas ofertas ou valores inventados.

| Endpoint | Proteção e uso |
| --- | --- |
| `GET /api/billing/catalog` | Catálogo público restrito ao mapa de ofertas do servidor; sem dados de clientes. |
| `GET /api/billing/status` | Sessão OTP; histórico limitado ao usuário, conta Stripe e modo. |
| `POST /api/billing/checkout` | Sessão, Origin e cabeçalho CSRF; aceita somente `offerKey` e `requestId` UUID. |
| `POST /api/billing/portal` | Sessão e CSRF; usa exclusivamente o Customer persistido para o usuário. |
| `POST /api/stripe/webhook` | Corpo bruto limitado, assinatura Stripe com Web Crypto e conferência da conta/modo; sem cookies ou Origin de navegador. |

O frontend não determina Price ID, Customer ID, valor ou endereço de retorno. Metadados contêm somente identificadores internos de usuário e oferta. Registros, emoções e reflexões não são enviados à Stripe. A chave de API nunca entra no bundle React.

## Configuração necessária

Definir primeiro o nome, valor, moeda e periodicidade de cada oferta. Criar um Product para cada oferta e um Price avulso ou recorrente conforme a decisão comercial. Esta implementação suporta preços fixos `per_unit`, positivos, com recorrência `licensed`; não suporta preços por uso, faixas ou valores escolhidos pelo cliente. Não habilita coleta automática de impostos.

No ambiente do Cloudflare Workers, manter estas variáveis:

| Variável | Conteúdo |
| --- | --- |
| `STRIPE_MODE` | `test` ou `live`. |
| `STRIPE_ACCOUNT_ID` | ID exato da conta correspondente à API key. Conta sandbox verificada: `acct_1UPoTeJrMgiYpeV3`. Verificar separadamente a conta live. |
| `STRIPE_OFFERS_JSON` | Objeto JSON de chaves de oferta para Price IDs: `{"oferta-avulsa":"price_SUBSTITUIR","oferta-recorrente":"price_SUBSTITUIR"}`. Usar IDs reais do mesmo ambiente. |
| `STRIPE_SECRET_KEY` | API key restrita, preferencialmente, guardada como secret do runtime. |
| `STRIPE_WEBHOOK_SECRET` | Signing secret do endpoint, guardado como secret do runtime. |

As configurações `AUTH_ORIGIN`, `AUTH_SECRET`, `AUTH_EMAIL_FROM`, `RESEND_API_KEY` e o D1 `DB` continuam necessárias. `AUTH_ORIGIN` deve ser a origem HTTPS exata do ambiente. Sem configuração válida, as APIs de cobrança retornam indisponibilidade.

Inserir secrets pelo painel da hospedagem ou por um prompt local seguro, por exemplo `wrangler secret put STRIPE_SECRET_KEY` e `wrangler secret put STRIPE_WEBHOOK_SECRET`. Nunca inserir os valores em argumentos de shell, Git, arquivos de exemplo, logs ou no chat. A API key precisa permitir leitura da própria conta, Products/Prices e Subscriptions, criação/leitura de Customers e Checkout Sessions e criação de sessões do Billing Portal. Conferir os nomes das permissões no Dashboard e validar a chave restrita no sandbox antes de produção.

Configurar o Customer Portal no Dashboard de cada ambiente, com as regras comerciais aprovadas de cancelamento, mudança de plano e atualização de pagamento. Se houver assinaturas, definir também política de inadimplência e recuperação; não implementar renovações manuais.

**Impostos:** Billing não resolve a tributação por si só. Antes de habilitar Stripe Tax, confirmar a aplicabilidade e os registros fiscais necessários; `automatic_tax` não deve ser habilitado apenas como um booleano sem essa verificação. [Documentação de impostos recorrentes](https://docs.stripe.com/billing/taxes/collect-taxes).

## Webhooks e banco

Aplicar a migração aditiva `0004_stripe_billing.sql` após a migração de autenticação, no D1 correspondente ao ambiente. Ela não altera nem apaga dados do diário. Cadastrar um endpoint de eventos snapshot da própria conta em `https://ORIGEM/api/stripe/webhook`, usando a versão de API compatível com o SDK instalado. Esta proposta usa `stripe@23.0.0` e o cliente com versão padrão daquele SDK.

Selecionar:

- `checkout.session.completed`;
- `checkout.session.async_payment_succeeded` e `checkout.session.async_payment_failed`;
- `checkout.session.expired`;
- `customer.subscription.created`, `customer.subscription.updated` e `customer.subscription.deleted`.

O handler consulta a sessão/assinatura atual na Stripe e verifica o vínculo de Customer, usuário e tentativa de Checkout antes de gravar estado. A criação de novos vínculos de assinatura passa por uma sessão Checkout própria. Eventos que chegam antes desse vínculo retornam erro temporário para a Stripe reenviar. Eventos de Connect são ignorados.

Event ID e efeitos são gravados no mesmo `D1.batch()` transacional. Um contador de versão com constraint protege contra commits concorrentes baseados em leituras anteriores; conflito repete a consulta atual da Stripe. Falhas não recebem confirmação de processamento antes de persistir os efeitos. A serialização é por conta/modo e prioriza simplicidade; cargas maiores podem exigir processamento por recurso ou fila durável.

Customers e tentativas possuem identificadores de idempotência persistidos no D1. Os parâmetros de criação ficam estáveis entre retries. Após 23 horas de uma tentativa remota incerta, o servidor bloqueia novas criações automáticas, pois a Stripe pode remover chaves de idempotência após 24 horas. Um operador deve reconciliar a tentativa com a Stripe e atualizar o vínculo validado antes de retomar. Não apagar linhas pendentes para tentar novamente sem reconciliação.

O histórico é uma projeção de pagamentos/assinaturas, sem conceder benefícios automaticamente. A política dos serviços pagos ainda não foi definida. Reembolsos, disputas, histórico de faturas e `invoice.paid`/`invoice.payment_failed` não são processados neste escopo; ficam no Dashboard/Portal. Se futuramente houver liberação de conteúdo pago ou cumprimento automático de serviços, adicionar esses eventos e políticas antes de ativá-los. O diário gratuito não depende da projeção.

## Validação e ativação

Separar staging e produção em Workers, D1, keys, Price IDs, Portal e signing secrets. Embora as tabelas também tenham escopo por conta/modo, isso não substitui ambientes separados. Homologar OTP, Checkout, pagamentos recusados/assíncronos, retornos, renovação, cancelamento, Portal, retries e reenvios de eventos em staging. Não confiar no retorno do navegador para cumprir uma venda.

Testes locais usam um adaptador SQLite/D1 e uma Stripe simulada, sem chaves reais ou rede. A assinatura do webhook é validada pelo verificador real do SDK. Eles verificam CSRF, isolamento, manipulação de dados, idempotência, duplicação, falha transacional, ordem e concorrência de eventos. Verificações de código e build não substituem uma compra em sandbox no runtime Workers/D1 real.

As pendências de autenticação, hospedagem e dependências do PR #1 permanecem aplicáveis. A auditoria atual de dependências de produção continua com 12 alertas altos e zero críticos. Os secrets não foram configurados, nenhuma migração remota foi aplicada e nenhum site foi publicado. O projeto Sites declarado na fonte retornou `project_not_found` para a conexão atual; será necessário acesso à hospedagem correta para a ativação.

Fontes: [Checkout](https://docs.stripe.com/api/checkout/sessions/create), [Customer Portal](https://docs.stripe.com/customer-management/integrate-customer-portal), [webhooks](https://docs.stripe.com/webhooks), [idempotência](https://docs.stripe.com/api/idempotent_requests), [secrets do Workers](https://developers.cloudflare.com/workers/configuration/secrets/).
