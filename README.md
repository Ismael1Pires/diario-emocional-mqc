# Meu Diário Emocional — Jeniffer Pires

Código-fonte completo da versão 7, exportado do projeto `appgprj_6a9da879edfc8191b61695e8b9dc8f0b`.
Commit original: `e9aa8d14dcd31bbea752783278c7323f19966c00`.

As telas, estilos, assets, rotas e migrações são os mesmos da versão 7. A configuração padrão foi preparada para uma conta própria do Cloudflare Workers com D1. A configuração original do Sites está em `vite.sites.config.ts`. Não foi realizada nova publicação no Sites.

## Executar localmente

Requer Node.js >=22.13 e npm.

```sh
npm ci
npm run db:migrate:local
npm run dev
```

## Publicar externamente no Cloudflare Workers

```sh
npx wrangler login
npx wrangler d1 create diario-emocional-mqc
```

Copie o `database_id` retornado para `wrangler.json`, substituindo o UUID de exemplo. O identificador do banco não é uma senha. Mantenha o binding `DB` e `migrations_dir: drizzle`.

```sh
npm run db:migrate:remote
npm run deploy
```

O build gera `dist/client` e `dist/server`, incluindo a configuração final do Worker. O aplicativo requer servidor e banco D1; não é uma exportação HTML estática.

## Dados e credenciais

Este repositório contém código, imagens e estrutura do banco, sem dados pessoais do banco em produção. A instalação externa cria um banco novo. Migrar registros existentes requer uma operação separada e autorizada. A identificação de visitante é a mesma da versão 7; mudar o domínio não transfere automaticamente os dados do armazenamento local do navegador.

Não envie `.env`, `.env.*`, `.dev.vars`, tokens, senhas ou chaves privadas ao GitHub. Configure eventuais credenciais pela plataforma de hospedagem ou pelo gerenciador de secrets. Nenhum secret é necessário no código atual para conectar ao D1: a conexão usa o binding `DB`.

## Referências

- [Cloudflare Vite plugin](https://developers.cloudflare.com/workers/vite-plugin/get-started/)
- [Migrações D1](https://developers.cloudflare.com/d1/reference/migrations/)
