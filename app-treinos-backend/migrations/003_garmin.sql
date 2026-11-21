-- Fase 2: atividades trazidas do Garmin. Rode uma vez no SQL Editor do Neon (depois da 001 e da 002).
-- Nada aqui mexe nas suas sessoes: o Garmin so entra numa sessao quando voce confirma no app.

CREATE TABLE IF NOT EXISTS garmin_atividades (
    id            BIGINT PRIMARY KEY,                 -- activityId do Garmin
    data          DATE NOT NULL,                      -- dia local do treino
    tipo          TEXT NOT NULL,                      -- strength_training, running, indoor_cycling...
    resumo        JSONB NOT NULL,                     -- distancia, duracao, FC, efeito do treino...
    exercicios    JSONB,                              -- musculacao: series agrupadas por exercicio (do .FIT)
    situacao      TEXT NOT NULL DEFAULT 'nova' CHECK (situacao IN ('nova', 'usada', 'ignorada')),
    sessao_id     TEXT,                               -- sessao do app que recebeu os dados
    importado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS garmin_atividades_data ON garmin_atividades (data);

CREATE TABLE IF NOT EXISTS garmin_estado (
    id            INT PRIMARY KEY CHECK (id = 1),
    ultima_sync   TIMESTAMPTZ,
    ultimo_erro   TEXT,
    chave_expira  DATE
);
INSERT INTO garmin_estado (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
