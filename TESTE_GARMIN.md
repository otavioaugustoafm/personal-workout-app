# Teste do Garmin (antes da Fase 2)

Objetivo: descobrir o que a API pessoal do Garmin entrega de verdade para a sua conta, antes de escrevermos a
sincronização. Leva uns 15 minutos. Nada disso mexe no app que está no ar.

## O que precisamos confirmar

| Pergunta | Por que importa |
|---|---|
| A chave pessoal funciona na sua conta e gera o token? | É a base de tudo |
| As **séries de musculação** (exercício, repetições, carga) aparecem? Onde: no detalhe, em "workouts" ou só no arquivo .FIT? | Define se dá para preencher o que você não anotar e comparar com o que anotou |
| Os **nomes dos exercícios** que o relógio grava | São eles que vão no campo "nome no Garmin" da ficha |
| A **carga** vem preenchida ou só as repetições? | Se não vier, o app usa a carga da última vez e pede confirmação |
| A **bike indoor** vem com distância 0? | Confirma a regra: na bike indoor vale a distância que você anota |
| Corrida: distância, tempo, FC, cadência, efeito do treino | Os campos do cardio |
| Sono, HRV e Body Battery respondem? | Fase 3 |

## Antes de rodar

Tenha no relógio, nos últimos 30 dias, pelo menos **um treino de musculação** gravado (de preferência com os
exercícios e as cargas), **uma corrida** e **uma bike indoor**. Se faltar algum, rode depois de fazer.

## Passo a passo

### 1. Criar a chave

1. Entre no **Garmin Connect pela web** (computador) → **Configurações** → **Personal API Key** (perto do fim da lista).
2. **Create Key** → aceite os termos → escolha a validade (sugiro 90 dias para o teste; a definitiva a gente cria
   depois, já para a Lambda).
3. **Copie a chave na hora**: ela aparece uma vez só. Trate como senha. **Não cole aqui no chat.**

Se a opção "Personal API Key" não aparecer na sua conta, me avise: aí o teste muda.

### 2. Guardar a chave num arquivo (só no seu computador)

No PowerShell:

```powershell
mkdir $env:USERPROFILE\.config\garmin -Force
notepad $env:USERPROFILE\.config\garmin\connect-personal-api-key
```

Cole a chave no Bloco de Notas, salve e feche. (O arquivo não tem extensão; se o Bloco de Notas perguntar, salve
como "Todos os arquivos".) Esse é o lugar padrão onde o cliente oficial da Garmin procura a chave.

### 3. Instalar o cliente oficial da Garmin

```powershell
cd C:\projetos\app-treinos\app-treinos-backend
.venv\Scripts\Activate.ps1
pip install garmin-connect-personal-api-python garmin-fit-sdk
```

(`garmin-connect-personal-api-python` é o cliente publicado pela própria Garmin; `garmin-fit-sdk` é o leitor oficial
de arquivos .FIT. Os dois são só para este teste: não entram no zip da Lambda.)

### 4. Rodar o teste

```powershell
python scripts\testar_garmin.py
```

Para olhar mais para trás: `python scripts\testar_garmin.py --dias 60`.

Ele gera `app-treinos-backend\relatorio_garmin.txt`.

### 5. Me mandar o relatório

Abra o `relatorio_garmin.txt`, dê uma olhada e mande o arquivo aqui. Ele **não** tem a chave, o token, nomes de
atividades, horários, GPS, dados do perfil nem valores de saúde (sono, HRV e Body Battery aparecem só como lista de
campos). Das atividades vão só tipo, distância, duração, se tem FC e, na musculação, as séries (exercício,
repetições, carga), que é o que precisamos ver.

O `.gitignore` já impede que o relatório e a chave vão para o GitHub.

## Se der erro

| Mensagem | O que fazer |
|---|---|
| `Instale antes: pip install ...` | Rode o passo 3 com a `.venv` ativa |
| `obter token falhou ... (HTTP 401)` | Chave copiada pela metade ou expirada: crie outra e salve de novo no arquivo |
| `listar atividades falhou ... (HTTP 403)` | A chave não tem acesso: me mande o relatório assim mesmo |
| Qualquer outro erro | O script salva o relatório parcial; mande ele |

Quer ver tudo o que veio, completo? Rode com `--salvar-bruto`: as respostas completas ficam na pasta
`garmin_bruto\` **só para você**. Essa pasta tem seus dados de verdade: não mande, e ela também está fora do Git.

## Depois do teste

Com o relatório, eu escrevo a Fase 2 já com as regras combinadas:

- O que você **anotou** no app vale sempre. O Garmin só **preenche o que ficou sem anotação** e você **confirma**.
- Exercícios marcados "preencher à mão" (o abdômen) nunca são preenchidos pelo Garmin.
- **Bike indoor**: a distância do Garmin vem zerada, então vale a que você anotar; tempo e FC vêm do relógio.
- Treino gravado no relógio num dia em que você não abriu o app vira um registro "Importado do Garmin", para não
  contar como falta.
- A sincronização roda numa segunda Lambda (`treinos-sync-garmin`) agendada, com a chave numa variável só dela.
  Como a chave expira (30 dias a 1 ano), o app vai avisar quando estiver perto de vencer.
