# Stripe — acesso pago ao Diário Emocional

O Diário Emocional de Jeniffer Pires custa **R$47,90, pagamento único**. A compra libera o diário da conta autenticada por e-mail. A interface e as APIs privadas exigem uma compra confirmada; login, catálogo e página de pagamento continuam disponíveis antes da compra. Connect não é necessário, pois são vendas próprias, sem repasses.

O plugin Stripe e o MCP estão conectados. O plano oficial atualizado foi aceito no `stripe_implementation_planner`: guia `iguide_61VZIrdMvLki0WoDb41JrMgiYpeV3`, Checkout hospedado na web. O MCP não fornece automaticamente a chave de API ao Worker.

## Produto confirmado

Em 12/10/2026, a leitura da Stripe confirmou os seguintes objetos **de teste**:

| Campo | Valor |
| --- | --- |
| Conta sandbox | `acct_1UPoTeJrMgiYpeV3` |
| Product ativo | `prod_VQgSqVZLZxRXA2` — Diário Emocional |
| Price ativo | `price_1UPp5LJrMgiYpeV3zHYmbWH7` |
| Moeda e valor | `brl`, `4790` centavos |
| Tipo | `one_time`, sem recorrência |
| Chave interna da oferta | `diario-emocional` |

Esses IDs não servem para cobrar em produção. Usar Product/Price equivalentes, chave de API e webhook do ambiente live para ativar vendas reais. Não há assinatura mensal nessa oferta.

## Liberação e proteção

O servidor cria Checkout com preço fixo escolhido pelo mapa de ofertas, quantidade 1, Customer próprio do usuário e identificador persistido da tentativa. O navegador não escolhe valores, Price IDs, Customers ou URLs de retorno. Dados emocionais não são enviados à Stripe.

Somente um webhook assinado de uma sessão criada pelo aplicativo estabelece uma autorização de acesso. O handler verifica conta, ambiente, usuário, Customer, tentativa, metadados, preço, quantidade, moeda, valor pago, PaymentIntent e Charge atuais. A volta do Checkout e o botão “Já paguei” consultam o servidor, sem criar autorização por si mesmos.

`GET /api/billing/access` retorna apenas o acesso da conta autenticada. As APIs de registros, reflexões, configurações e cadastro promocional exigem o mesmo acesso e retornam `402` sem compra válida. A interface só monta o diário após `allowed: true`; respostas `402` também retiram conteúdo já aberto. Erros de verificação bloqueiam acesso até nova tentativa.

Reembolso total e disputas ativas/perdidas revogam a autorização. Reembolso parcial mantém acesso. Disputa ganha ou investigação encerrada pode restaurar somente uma compra já vinculada por webhook. O servidor reconsulta a Stripe para compras existentes; um cache de até 60 segundos nas APIs privadas reduz chamadas, e o webhook atualiza o estado imediatamente quando recebido. O botão de verificação força uma consulta atual. Falha da Stripe após o cache expirar retorna indisponibilidade. Acesso não tem expiração periódica enquanto a compra for válida. Compra duplicada com autorização ativa é recusada.

O histórico de Billing e o Customer Portal permanecem disponíveis. Outras ofertas recorrentes podem ser suportadas no catálogo, mas não liberam esse diário: a oferta de acesso exige preço avulso. Não há implementação de liberação de diário por assinatura.

## Variáveis do Worker

| Nome | Configuração |
| --- | --- |
| `STRIPE_MODE` | `test` em homologação; `live` em produção. |
| `STRIPE_ACCOUNT_ID` | Conta correspondente à chave, conferida pelo servidor. |
| `STRIPE_DIARY_OFFER_KEY` | `diario-emocional`. |
| `STRIPE_OFFERS_JSON` | Em teste: `{"diario-emocional":"price_1UPp5LJrMgiYpeV3zHYmbWH7"}`. Substituir por Price live em produção. |
| `STRIPE_SECRET_KEY` | Secret do runtime; preferir chave restrita. |
| `STRIPE_WEBHOOK_SECRET` | Signing secret do endpoint no mesmo ambiente. |
| `AUTH_ORIGIN` | Origem HTTPS exata do ambiente, sem barra final: produção `https://diario.jenifferpires.life`. |
| `AUTH_SECRET` | Secret aleatório de pelo menos 32 bytes. |
| `AUTH_EMAIL_FROM` | Remetente de domínio verificado no Resend. |
| `RESEND_API_KEY` | Chave restrita a envio de e-mail. |
| `DB` | Binding D1 do ambiente. |

Inserir secrets no painel Cloudflare ou por prompt seguro do `wrangler secret put`. Nunca inserir chaves em Git, argumentos de shell, logs, frontend ou chat. A chave Stripe precisa ler a própria conta, Products/Prices, PaymentIntents, Charges, Disputes e Subscriptions; criar/ler Customers e Checkout Sessions; e criar sessões do Billing Portal. Conferir permissões no Dashboard e validar em teste.

Se o Customer Portal for usado, configurá-lo em cada ambiente. Métodos de pagamento disponíveis são controlados no Dashboard. Impostos automáticos não estão habilitados; avaliar a configuração fiscal antes de incluí-los.

## Banco e webhooks

As migrações `0003_secure_auth.sql`, `0004_stripe_billing.sql` e `0005_paid_diary.sql` são aditivas. Preservam dados históricos e não associam registros antigos a usuários por e-mail/UUID autodeclarados. A recuperação desses registros segue `docs/authentication.md`.

Cadastrar endpoint snapshot da própria conta em `https://ORIGEM/api/stripe/webhook`, compatível com `stripe@23.0.0`, com os seguintes eventos:

- `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`;
- `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`;
- `charge.refunded`, `charge.updated`;
- `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`, `charge.dispute.funds_withdrawn`, `charge.dispute.funds_reinstated`;
- `refund.created`, `refund.updated`, `refund.failed`;
- `payment_intent.succeeded`, `payment_intent.payment_failed`.

Event ID e efeitos são persistidos em um `D1.batch()` transacional. Um contador de versão com constraint impede gravar uma leitura anterior sobre atualização concorrente; em conflito, o servidor consulta novamente a Stripe. Falhas retornam erro temporário para reenviar, sem confirmar antes da persistência. Eventos de Connect são ignorados.

Customers e tentativas usam chaves de idempotência persistidas, com parâmetros estáveis. Após 23 horas de tentativa remota incerta, é necessária reconciliação operacional; não apagar a tentativa e recriar automaticamente.

## Publicação e validação

A hospedagem existente é o Worker Cloudflare `diario-emocional-mqc`, conta `cc7940c7f264073841c3efe80ad8417a`, D1 `e6ad6e91-1b18-4990-8d22-05ca9e253af7`. Não alterar o banco de produção para homologar. Previews automáticos de PR comprovam compilação/publicação de uma versão; não comprovam configuração de secrets, migrações ou uma compra real.

Separar homologação e produção em Worker, D1, chaves, Price IDs e webhook. Antes do corte, verificar backup/restauração do D1 e os procedimentos da autenticação; preparar todos os secrets. Homologar OTP, compra bem-sucedida, recusa, compra assíncrona, repetição de eventos, preço/Customer incorretos, reembolso, disputa e acesso por outro usuário. Aplicar as migrações no banco correto, publicar a versão testada e verificar domínio, login e bloqueio de APIs.

Os testes automatizados usam SQLite/D1 e Stripe simulada; a assinatura do webhook é verificada pelo SDK real. Rodar `npm test`, `npm run typecheck` e `npm run build` no Node 24. Esses testes não substituem a homologação no runtime real com secrets configurados.

Fontes: [Checkout e liberação de compras](https://docs.stripe.com/checkout/fulfillment), [webhooks](https://docs.stripe.com/webhooks), [idempotência](https://docs.stripe.com/api/idempotent_requests), [secrets do Workers](https://developers.cloudflare.com/workers/configuration/secrets/).
