# Pagamentos pausados

Desde 19/10/2026, por decisão da responsável, o diário exige somente login por e-mail. Não é necessário comprar nem configurar Stripe para acessar as APIs privadas. A sessão, CSRF e os filtros de propriedade continuam obrigatórios.

A página /pagamentos redireciona para /. As rotas de checkout, portal, catálogo, status e autorização de pagamento respondem 410. O antigo webhook confirma recebimento sem executar ações, evitando reprocessamento enquanto a integração está pausada.

O código anterior de cobrança e os registros históricos permanecem preservados para eventual reativação. Não houve migração, exclusão de dados, reembolso nem cancelamento automático de compras ou assinaturas. Os módulos antigos de cobrança não são importados pelas rotas em produção.

Reativar pagamentos exige mudança explícita de código, validação de conta e preço e nova revisão dos testes e webhooks.
