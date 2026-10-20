# Passos Jurídico

Sistema de gestão do escritório **Felipe Passos Advogado** (OAB/SC 58.547): processos, publicações do DJEN, tarefas com fluxo de correção, CRM, avisos ao cliente, chat da equipe e petições.

- **Site:** Next.js 15 (App Router), hospedado na Vercel
- **Banco, login e arquivos:** Supabase, região São Paulo (`sa-east-1`)
- **Regras de negócio no banco:** responsável fixo, só o responsável conclui, aprovação só por quem corrige, linha do tempo que não se apaga — ver `supabase/migrations/0001_base.sql`

## Etapas

| Etapa | Conteúdo | Situação |
|---|---|---|
| 1 | Login, equipe, clientes, processos, linha do tempo, importação do painel antigo | pronta |
| 2 | DJEN automático (7h, 12h e 17h nos dias úteis, no servidor em São Paulo), caixa de publicações, análise com Claude | pronta |
| 3 | Tarefas, correção com anexos, protocolo, Meus expedientes, Gestão | pronta |
| 4 | CRM, avisos ao cliente (WhatsApp), chat, petição inicial em Word, leitura de documentos | pronta |

Atualização para as etapas 2 a 4 num banco que já tem a etapa 1: rode `supabase/migrations/0003_etapas_2a4.sql` no SQL Editor.

## Instalação

1. **Banco:** no Supabase, abra **SQL Editor → New query**, cole o conteúdo de `supabase/instalar.sql` e clique em **Run**.
2. **Login:** em **Authentication → Sign In / Providers**, deixe só *Email* ligado e desligue *Allow new users to sign up* (só entra quem for convidado).
   Em **Authentication → URL Configuration**, coloque o endereço do site em *Site URL* e acrescente `https://SEU-SITE/auth/confirmar` em *Redirect URLs*.
3. **Primeiro acesso:** em **Authentication → Users → Add user**, crie o usuário do titular com e-mail e senha. O primeiro usuário vira titular automaticamente.
4. **Vercel:** importe este repositório e cadastre as variáveis de `.env.example`
   (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `CRON_SECRET`).
   As funções rodam em São Paulo (`vercel.json`), porque o DJEN só responde a acessos do Brasil.
5. **Dados antigos:** no painel antigo, **Dados → Exportar para o sistema novo (.zip)**; no sistema novo, **Importar dados**.

## Desenvolvimento

```bash
npm install
cp .env.example .env.local   # preencha as chaves
npm run dev                  # http://localhost:3000
npm test                     # regras de prazo, CNJ, CPF, valores por extenso
```

Teste das regras do banco num Postgres local: `supabase/tests/shim.sql` (simula o Supabase) + migrações + `supabase/tests/regras.sql` e `supabase/tests/etapas.sql`.
