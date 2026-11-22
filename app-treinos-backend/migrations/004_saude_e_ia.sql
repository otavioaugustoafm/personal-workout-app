-- Fase 3: sono, HRV, Body Battery e a prontidao do dia; e as analises da IA (com o custo de cada uma).
-- Rode uma vez no SQL Editor do Neon, depois da 003. So cria tabelas novas.

CREATE TABLE IF NOT EXISTS saude_diaria (
    data          DATE PRIMARY KEY,        -- o dia (o sono e o da noite que termina nesse dia)
    sono          JSONB,                   -- duracao, fases, nota, FC, respiracao
    hrv           JSONB,                   -- media da noite, media semanal, faixa normal, status
    resumo        JSONB,                   -- Body Battery, FC de repouso, estresse, minutos de intensidade
    prontidao     JSONB,                   -- nota 0-100 e as partes que a compoem (calculada pelo app)
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS analises_ia (
    id          SERIAL PRIMARY KEY,
    tipo        TEXT NOT NULL CHECK (tipo IN ('prontidao', 'treino', 'semana', 'musculacao', 'cardio', 'sono')),
    chave       TEXT NOT NULL,             -- data, id da sessao ou segunda-feira da semana
    modelo      TEXT NOT NULL,
    texto       TEXT NOT NULL,
    tokens_in   INT NOT NULL DEFAULT 0,
    tokens_out  INT NOT NULL DEFAULT 0,
    custo_usd   NUMERIC(10, 6) NOT NULL DEFAULT 0,
    criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tipo, chave)
);
CREATE INDEX IF NOT EXISTS analises_ia_criado ON analises_ia (criado_em);

-- O que a IA sabe sobre voce (editavel na aba Plano do app).
ALTER TABLE configuracao ADD COLUMN IF NOT EXISTS contexto_ia TEXT;
UPDATE configuracao SET contexto_ia = 'Treino todos os dias. Musculação em 4 fichas: Peito e Tríceps (seg), Costas e Bíceps (qua), Perna (qui, à noite) e Ombro e Antebraço (sex). Corrida de qualidade na terça, bike indoor Z2 no sábado (bike da academia, no máximo 1h30; não tenho bike própria) e longão no domingo de manhã.
Perna só uma vez por semana. Protejo o joelho: nunca corrida ou bike logo depois do dia de perna.
Abdômen no fim do treino de peito.
Objetivos: (escreva aqui suas provas e metas, ex.: próxima meia maratona)'
WHERE id = 1 AND contexto_ia IS NULL;
