# Plano de Treino

App pessoal para organizar a semana de musculação, corrida e bike indoor protegendo o joelho: mostra o treino do dia,
registra séries, cardio e dores, reorganiza a semana quando você falta e guarda o histórico com gráficos.
Uso pessoal, usuário único. **Separado do app financeiro** (outro repositório, outro banco, outra Lambda, outro Amplify).

| Camada | Tecnologia |
|---|---|
| Front | React + Vite + TailwindCSS (AWS Amplify), mesma identidade visual do Controle Financeiro |
| Back | Python + FastAPI + Mangum (AWS Lambda com URL de função) |
| Banco | PostgreSQL serverless no Neon (projeto próprio) |

## Roadmap

- [x] **Fase 1** — app completo com login por senha única, banco, importação do backup da página antiga e deploy
- [ ] **Fase 2** — sincronização com o Garmin (token pessoal da API): cardio e séries do relógio, com confirmação
- [ ] **Fase 3** — sono, HRV e Body Battery ao lado dos treinos

## Colocando no ar

Passo a passo completo (GitHub, Neon, Lambda, URL da função, Amplify, importar seus dados e alarme de custo):
**[GUIA_DE_DEPLOY.md](GUIA_DE_DEPLOY.md)**.

## Estrutura

```
app-treinos/
├── amplify.yml                     build do front no Amplify (monorepo)
├── GUIA_DE_DEPLOY.md
├── app-treinos-backend/
│   ├── migrations/001_schema_treinos.sql   tabelas + semana padrão + suas fichas
│   ├── scripts/gerar_credenciais.py        hash da senha e segredo do login
│   ├── scripts/montar_zip_lambda.py        gera o lambda.zip para Linux / Python 3.12
│   ├── src/main.py                         FastAPI + handler da Lambda
│   ├── src/routes/auth.py                  login (token vale até a próxima segunda)
│   ├── src/routes/treinos.py               estado, configuração, fichas, treinos, rascunhos, backup
│   └── tests/                              testes da API (com banco de teste)
└── app-treinos-frontend/
    └── src/
        ├── lib/semana.ts                   recomendação e reorganização da semana
        ├── lib/treino.ts                   cargas sugeridas, volume, dores, registro do treino
        └── components/                     Hoje, Treino, Histórico, Plano, Backup...
```

## Rodando localmente

### 1. Banco (Neon)

No SQL Editor do projeto `app-treinos`, rode `app-treinos-backend/migrations/001_schema_treinos.sql`
(ou `psql "$DATABASE_URL" -f app-treinos-backend/migrations/001_schema_treinos.sql`).

### 2. Backend

```bash
cd app-treinos-backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
python scripts/gerar_credenciais.py                 # gera APP_PASSWORD_HASH e JWT_SECRET_KEY
# preencha DATABASE_URL, APP_PASSWORD_HASH e JWT_SECRET_KEY no .env
uvicorn src.main:app --reload                       # http://localhost:8000/docs
```

### 3. Frontend

```bash
cd app-treinos-frontend
npm install
cp .env.example .env.local                          # VITE_API_URL=http://localhost:8000
npm run dev                                         # http://localhost:5173
```

## Como o app funciona

- **Hoje:** faixa com os 7 dias (feito, faltou, hoje, ajustado) e o treino do dia já aberto. Na musculação, as cargas vêm
  da última vez que você fez cada exercício; você marca cada série, pode **pular** um exercício e, ao salvar, o app pergunta
  o que aconteceu com os que ficaram sem anotação (fiz como sugerido / pulei / deixar o Garmin preencher). No cardio você
  anota distância, tempo e FC e ele calcula pace ou velocidade. No fim de todo treino: dor na articulação principal
  (joelho na perna e no cardio, cotovelo nos treinos de cima) e outras dores.
- **Rascunho na nuvem:** o treino em andamento é salvo no banco enquanto você anota, então dá para começar no celular e
  continuar em outro aparelho.
- **Reorganização da semana:** Perna, Peito, Costas e Longão são recuperados se você faltar; Corrida de qualidade, Bike e
  Ombro só caem. Nada de cardio no dia seguinte à perna, nada de duas corridas seguidas, corrida forte longe da perna, e o
  fim de semana nunca atrapalha a segunda e a terça seguintes. Na segunda tudo volta ao padrão.
- **Histórico:** semana, mês (calendário, dores, volume semanal), musculação (carga e volume por exercício; repetições
  quando não há peso, como no bi-set), cardio (km, tempo, pace) e a lista de treinos.
- **Plano:** semana padrão e fichas editáveis (exercícios, séries, variações, bi-set, ajuste da máquina, nome no Garmin e
  "preencher à mão").
- **Backup:** copia todos os dados num texto e importa o backup da página antiga.

## Como funciona o login

Igual ao financeiro, mas com senha e segredo próprios: não há usuários, existe uma única senha de acesso guardada como
hash bcrypt em `APP_PASSWORD_HASH`. `POST /api/v1/auth/login` devolve um JWT que **expira na próxima segunda-feira às
00:00 (Brasília)**. Sem o token, nenhuma rota de dados responde.

## API

Todas as rotas abaixo (menos o login) exigem `Authorization: Bearer <token>`.

| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/v1/auth/login` | `{ "senha": "..." }` → `{ token, expira_em }` |
| GET | `/api/v1/estado` | tudo de uma vez: semana padrão, início, respostas, fichas, treinos e rascunhos |
| PUT | `/api/v1/configuracao` | `semana_padrao` (7 itens), `inicio` (data), `respondidos` (`{"AAAA-MM-DD": "nao"}`) |
| PUT | `/api/v1/fichas/{A\|B\|C\|D}` | `{ "exercicios": [...] }` substitui a ficha |
| POST | `/api/v1/sessoes` | registra um treino (musculação, cardio ou descanso); repetir o mesmo `id` não duplica |
| DELETE | `/api/v1/sessoes/{id}` | exclui um registro |
| DELETE | `/api/v1/sessoes?data=AAAA-MM-DD` | exclui os registros do dia ("Desfazer registro") |
| PUT/DELETE | `/api/v1/rascunhos/{item}` | salva / descarta o treino em andamento |
| GET | `/api/v1/backup` | exporta tudo (mesmo formato do estado) |
| POST | `/api/v1/backup/importar` | substitui tudo pelo backup, numa transação (se algo falhar, nada muda) |

Itens: `A` Peito e Tríceps, `B` Costas e Bíceps, `C` Ombro e Antebraço, `D` Perna, `RQ` Corrida de qualidade, `RL` Corrida
leve, `LG` Longão, `BK` Bike indoor, `BI` Bike intervalada, `OFF` Descanso.

## Testes

```bash
cd app-treinos-backend
pip install -r requirements-dev.txt
TEST_DATABASE_URL=... pytest
```

Os testes **apagam e recriam as tabelas** do banco indicado em `TEST_DATABASE_URL`: use uma branch descartável do Neon (ou um
Postgres local), nunca o banco real.

## Segurança

- Nenhum segredo no código nem no zip: senha (hash), segredo do JWT e string do banco ficam só nas variáveis de ambiente.
- A URL da função é pública (Auth type NONE), mas toda rota de dados exige o token; sem ele a resposta é 401.
- CORS restrito ao endereço do Amplify (`ALLOWED_ORIGINS`).
- Entradas validadas pela API (tipos, tamanhos, itens e níveis de dor permitidos); consultas sempre parametrizadas.
