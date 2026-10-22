# Servidor do WhatsApp (Evolution API)

O sistema fica na Vercel, que não mantém conexão aberta 24 horas. Este servidor à parte mantém o WhatsApp
do escritório conectado (como "aparelho conectado", pelo QR-code) e avisa o sistema de cada mensagem.

## Variáveis na Vercel (Settings → Environment Variables)
- `EVOLUTION_URL` — endereço do servidor (ex.: `https://evolution-xxxx.up.railway.app`)
- `EVOLUTION_API_KEY` — a mesma `AUTHENTICATION_API_KEY` do servidor
- `WHATSAPP_WEBHOOK_SECRET` — uma senha longa qualquer (o servidor usa para provar ao sistema que é ele)
- `EVOLUTION_INSTANCIA` — opcional (padrão: `escritorio`)

Depois de salvar, faça um Redeploy na Vercel e conecte em Configurações → WhatsApp do escritório.

## Opção VPS (Docker)
1. Num servidor Ubuntu com Docker: copie `docker-compose.yml` e `.env.exemplo` (renomeado para `.env`, com os valores trocados).
2. `docker compose up -d`
3. Libere a porta 8080 (ou coloque um domínio com HTTPS na frente, recomendado).

Se o QR-code ficar gerando sem parar e nunca conectar, atualize a imagem para a versão mais nova da Evolution API.
