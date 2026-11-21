# Guia de deploy — do zero até o app de treinos no ar

Comandos em **PowerShell (Windows)**. No Mac/Linux troque `py` por `python3` e `.venv\Scripts\Activate.ps1` por
`source .venv/bin/activate`.

Tudo aqui é **separado do app financeiro**: outro repositório, outro projeto no Neon, outra Lambda (com a própria função do
IAM), outro app no Amplify, outra senha e outro segredo de login. Os dois só dividem a mesma conta da AWS.

Ordem geral: **computador → GitHub → Neon → credenciais → (teste local) → zip → Lambda → URL da função → Amplify →
ligar as pontas → trazer seus dados → alarme de custo**.

> **Região:** use a mesma região em tudo (canto superior direito do console da AWS) e crie o projeto do Neon na mesma
> região da AWS. Se o financeiro está em Ohio, use `us-east-2` aqui também.

---

## 0. O que você precisa ter

| Item | Como conferir |
|---|---|
| Python 3.12 (ou mais novo) | `py --version` |
| Node 22 (ou 20.19+) | `node --version` |
| Git | `git --version` |
| Contas: GitHub, AWS, Neon | as mesmas do financeiro |

---

## 1. Colocar o projeto no computador e no GitHub

1. Extraia o zip numa pasta nova (ex.: `C:\projetos`). Vai nascer a pasta `app-treinos`.
2. No PowerShell:

```powershell
cd C:\projetos\app-treinos
git init
git add .
git status
```

   Confira a lista: **não pode** aparecer `.env`, `.venv`, `node_modules`, `dist` nem `lambda.zip`. (O `.gitignore` já
   cuida disso; a conferência é só para você ter certeza.)

```powershell
git commit -m "App de treinos: fase 1"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/NOME_DO_REPO.git
git push -u origin main
```

> Se ao criar o repositório você marcou "Add a README" (ou .gitignore/licença), o `push` vai recusar. Nesse caso rode
> antes: `git pull origin main --allow-unrelated-histories --no-edit` e depois o `git push -u origin main`.

---

## 2. Banco de dados (Neon) — projeto novo

1. No Neon, **New Project** → nome `app-treinos` → mesma região da AWS → Create. (O plano gratuito permite vários
   projetos; cada um tem a própria cota.)
2. Abra o **SQL Editor** do projeto novo, cole todo o conteúdo de `app-treinos-backend/migrations/001_schema_treinos.sql`
   e clique em **Run**. Ele cria as tabelas e já coloca a sua semana padrão e as suas quatro fichas. Rodar de novo não
   apaga nada.
3. Clique em **Connect** e copie a string de conexão **com "Connection pooling" ligado** (o host contém `-pooler`).
   Essa é a `DATABASE_URL`.

---

## 3. Credenciais (diferentes das do financeiro)

```powershell
cd app-treinos-backend
py -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
python scripts\gerar_credenciais.py
```

O script pede a senha de acesso (mínimo 12 caracteres) e imprime `APP_PASSWORD_HASH=...` e `JWT_SECRET_KEY=...`.
Abra o `.env` e cole as duas linhas (mantenha as aspas simples do hash **no .env**) e a `DATABASE_URL` do passo 2.

Pode ser a mesma senha que você digita no financeiro, se preferir lembrar de uma só, mas o `JWT_SECRET_KEY` é sempre
novo (o script gera um aleatório a cada vez).

---

## 4. Teste local (recomendado, leva poucos minutos)

```powershell
# ainda em app-treinos-backend, com a .venv ativa
uvicorn src.main:app --reload
```

Em outro PowerShell:

```powershell
cd C:\projetos\app-treinos\app-treinos-frontend
npm install
copy .env.example .env.local
npm run dev
```

Abra <http://localhost:5173>, entre com a senha e confira: a aba **Hoje** mostra o treino do dia; **Plano** mostra as
suas fichas. Pare os dois com `Ctrl+C` quando terminar.

---

## 5. Gerar o zip da Lambda

```powershell
cd C:\projetos\app-treinos\app-treinos-backend
python scripts\montar_zip_lambda.py
```

Gera `app-treinos-backend\lambda.zip` (~9 MB). O script baixa as bibliotecas **para Linux**, que é o que a Lambda usa;
por isso não adianta zipar a pasta na mão. (Junto com o projeto eu também mandei um `lambda.zip` já pronto; ele é igual
ao que o script gera.)

---

## 6. Lambda da API

Console AWS → **Lambda** → **Create function** → *Author from scratch*:

| Campo | Valor |
|---|---|
| Function name | `treinos-api` |
| Runtime | Python 3.12 |
| Architecture | **x86_64** |
| Permissions | deixe "Create a new role with basic Lambda permissions" (ela ganha uma função do IAM só dela) |

Depois de criada:

1. Aba **Code** → **Upload from** → **.zip file** → escolha o `lambda.zip` → Save.
2. Ainda em **Code**, em **Runtime settings** → **Edit** → **Handler**: `src.main.handler` → Save.
3. Aba **Configuration** → **General configuration** → Edit: **Memory 512 MB**, **Timeout 15 s**.
4. **Configuration** → **Environment variables** → Edit. Cole os valores **sem aspas**:

| Variável | Valor |
|---|---|
| `DATABASE_URL` | string do Neon (pooled), do passo 2 |
| `JWT_SECRET_KEY` | o valor gerado no passo 3 |
| `APP_PASSWORD_HASH` | o hash do passo 3 (**sem** as aspas simples) |
| `ALLOWED_ORIGINS` | `http://localhost:5173` (provisório; troca no passo 9) |

5. (Para separar os custos) **Configuration** → **Tags** → Manage tags → `Projeto` = `treinos`.

---

## 7. URL da função (a "porta de entrada", sem API Gateway)

No financeiro usamos o API Gateway. Aqui usamos a **URL de função** da própria Lambda: ela faz o mesmo papel (um
endereço HTTPS público para o app chamar) e **não tem custo extra**, enquanto o API Gateway só tem cota grátis nos
primeiros 12 meses da conta.

1. Na `treinos-api` → **Configuration** → **Function URL** → **Create function URL**.
2. **Auth type: NONE.** (Quem protege os dados é o login do app: sem o token, a API responde 401 e não mostra nada.)
   Criando pelo console, a AWS já adiciona sozinha a permissão pública que a URL precisa.
3. **Não** marque "Configure cross-origin resource sharing (CORS)". O CORS é feito pelo próprio FastAPI; ligar nos dois
   duplica os cabeçalhos e o navegador recusa.
4. **Save** e copie a **Function URL** (`https://xxxx.lambda-url.us-east-2.on.aws/`).

**Teste:** abra `<Function URL>api/v1/estado` no navegador. Deve aparecer `{"detail":"Acesso nao autenticado."}`.
Isso prova que URL → Lambda → FastAPI → login estão funcionando.

---

## 8. Front-end no Amplify (app novo)

Console → **AWS Amplify** → **Create new app** → **GitHub** → escolha o repositório **do app de treinos** e a branch
`main`.

1. Marque **My app is a monorepo** e informe o caminho: `app-treinos-frontend`.
2. O Amplify lê o `amplify.yml` da raiz do repositório (já está pronto, com Node 22).
3. Em **Environment variables**, adicione `VITE_API_URL` = a **Function URL** do passo 7, **sem a barra no final**
   (ex.: `https://xxxx.lambda-url.us-east-2.on.aws`).
4. **Save and deploy**. Ao terminar, copie o endereço do app (`https://main.yyyy.amplifyapp.com`).

> A `VITE_API_URL` é gravada no site na hora do build. Se mudar depois, faça um novo deploy (Redeploy this version).

---

## 9. Ligar as pontas

Volte na Lambda `treinos-api` → **Configuration → Environment variables** e troque:

```
ALLOWED_ORIGINS = https://main.yyyy.amplifyapp.com
```

(sem barra no final; para manter o teste local também, separe por vírgula:
`https://main.yyyy.amplifyapp.com,http://localhost:5173`).

Abra o endereço do Amplify no celular, entre com a senha e, no Safari, use **Compartilhar → Adicionar à Tela de Início**
para abrir como app.

---

## 10. Trazer o que você já anotou na página antiga

1. Na página antiga (o artefato no Claude), toque em **Backup → Copiar dados**.
2. No app novo, toque em **Backup**, cole no campo **Importar** e toque em **Importar backup** e depois em
   **Confirmar: substituir tudo**.

Vem tudo: semana padrão, fichas (com as suas edições, o bi-set e o "preencher à mão" do abdômen), treinos, cardios,
dores e respostas de "não treinei". Se o backup tiver algum problema, nada é apagado.

Depois disso, use só o app novo.

---

## 11. Custo zero: o que é grátis e o alarme

| Serviço | Grátis | Uso esperado deste app |
|---|---|---|
| **Neon** (plano Free) | por projeto: 1 GB de armazenamento e 100 CU-horas de computação por mês; o banco "dorme" quando ninguém usa | poucos MB; computação só enquanto você usa o app |
| **Lambda + URL da função** | 1 milhão de requisições e 400 mil GB-s por mês, **sempre** (não expira) | algumas centenas a poucos milhares de requisições por mês |
| **Amplify Hosting** | grátis só dentro do Free Tier da conta (12 meses / créditos) | fora dele, alguns **centavos de dólar** por mês (cada build de ~2 min custa cerca de US$ 0,02; o site tem menos de 1 MB) |

Faça uma vez (se ainda não fez para o financeiro, ele vale para a conta toda):

Console → **Billing and Cost Management → Budgets** → **Create budget** → modelo **Zero spend budget** (ou um orçamento
mensal de US$ 1) com alerta por e-mail.

Para ver o custo da Lambda deste app separado: **Billing → Cost allocation tags** → ative a tag `Projeto` (aparece depois
que a função com a tag for usada) e filtre o **Cost Explorer** por `Projeto = treinos`.

---

## Quando algo der errado

Onde olhar: Lambda → aba **Monitor** → **View CloudWatch logs** → abra o log mais recente.

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| Tela de login: "Não foi possível falar com o servidor" | `VITE_API_URL` errada, ou CORS | confira a URL (sem barra final) e o `ALLOWED_ORIGINS`; depois, redeploy no Amplify |
| Login: "Senha incorreta" com a senha certa | hash colado com aspas ou cortado | cole o hash **sem aspas** na variável da Lambda |
| "Não foi possível carregar seus treinos" depois do login | migração não rodada, ou `DATABASE_URL` errada | passo 2 e a variável; o log diz qual |
| `{"Message":"Forbidden"}` ao abrir a Function URL | URL com Auth type `AWS_IAM`, ou falta permissão na política da função | confira que o Auth type é **NONE**; em **Configuration → Permissions → Resource-based policy statements** devem existir duas permissões públicas (`lambda:InvokeFunctionUrl` e `lambda:InvokeFunction`). Se faltar a segunda: **Add permissions → Function URL**, Auth type NONE, ação `lambda:InvokeFunction` |
| Erro de CORS no console do navegador com cabeçalho duplicado | CORS ligado na Function URL | desligue o CORS da Function URL (passo 7.3) |
| `Task timed out after 3.00 seconds` | timeout padrão | passo 6.3 |
| `No module named 'pydantic_core._pydantic_core'` | zip montado fora do script, ou arquitetura errada | refaça o zip com o script e confirme Python 3.12 + x86_64 |
| `RuntimeError: Variavel ... ausente` | variável de ambiente faltando | a mensagem diz qual |

---

## Atualizar depois

- **Mudou o banco (arquivo novo em `migrations/`)?** Rode o SQL novo no SQL Editor do Neon **antes** de subir o código.
- **Código do backend:** `python scripts\montar_zip_lambda.py` e suba o zip novo na `treinos-api` (Code → Upload from →
  .zip file).
- **Front-end:** é só `git push`; o Amplify faz o deploy sozinho.

## Próxima fase (Garmin)

A sincronização com o Garmin vai ser uma segunda Lambda (`treinos-sync-garmin`, com o mesmo zip) chamada por um
agendamento do **EventBridge Scheduler**, com o token pessoal da API do Garmin numa variável de ambiente só dela. O
banco já tem o campo `garmin` em cada treino esperando por isso.
