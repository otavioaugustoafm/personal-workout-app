-- =============================================================================
-- 001 - Esquema do app de treinos (projeto Neon proprio, separado do financeiro)
-- Rode UMA vez no SQL Editor do Neon. E seguro rodar de novo: nao apaga nada.
-- =============================================================================

-- Configuracao geral (uma linha so): semana padrao, data em que voce comecou a usar o app
-- e as respostas "nao treinei" para dias sem registro.
CREATE TABLE IF NOT EXISTS configuracao (
    id            SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    semana_padrao JSONB NOT NULL,
    inicio        DATE NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
    respondidos   JSONB NOT NULL DEFAULT '{}'::jsonb,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fichas de musculacao (A = Peito e Triceps, B = Costas e Biceps, C = Ombro e Antebraco, D = Perna).
-- Os exercicios ficam em JSONB, na ordem da ficha, com variacoes, series modelo, ajuste da maquina,
-- nome no Garmin e a marca "manual" (nao puxar do Garmin).
CREATE TABLE IF NOT EXISTS fichas (
    id            TEXT PRIMARY KEY CHECK (id IN ('A', 'B', 'C', 'D')),
    nome          TEXT NOT NULL,
    exercicios    JSONB NOT NULL DEFAULT '[]'::jsonb,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cada treino registrado (musculacao, cardio ou descanso).
CREATE TABLE IF NOT EXISTS sessoes (
    id            TEXT PRIMARY KEY,
    data          DATE NOT NULL,
    item          TEXT NOT NULL CHECK (item IN ('A','B','C','D','RQ','RL','LG','BK','BI','OFF')), -- ampliada na 002
    tipo          TEXT NOT NULL CHECK (tipo IN ('forca','cardio','descanso')),
    exercicios    JSONB,                       -- series anotadas (musculacao)
    cardio        JSONB,                       -- distancia, tempo, FC (cardio)
    dores         JSONB NOT NULL DEFAULT '{}'::jsonb,
    sensacao      TEXT,
    notas         TEXT NOT NULL DEFAULT '',
    rapido        BOOLEAN NOT NULL DEFAULT false, -- "fiz, mas nao anotei"
    garmin        JSONB,                       -- preenchido pela sincronizacao (Fase 2)
    criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sessoes_data ON sessoes (data);

-- Treino em andamento (rascunho), um por tipo de treino: comece no celular e continue em outro lugar.
CREATE TABLE IF NOT EXISTS rascunhos (
    item          TEXT PRIMARY KEY,
    dados         JSONB NOT NULL,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Valores iniciais: a semana padrao combinada e as suas fichas.
INSERT INTO configuracao (id, semana_padrao) VALUES (1, '["A", "RQ", "B", "D", "C", "BK", "LG"]'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO fichas (id, nome, exercicios) VALUES ('A', 'Peito e Tríceps', '[{"id": "supino-inclinado", "nome": "Supino inclinado", "garmin": "", "ajuste": "", "variantes": [{"nome": "", "series": [{"t": "F", "kg": 5, "reps": 12}, {"t": "F", "kg": 7.5, "reps": 12}, {"t": "F", "kg": 10, "reps": 12}, {"t": "S", "kg": 25, "reps": 8}, {"t": "S", "kg": 20, "reps": 8}, {"t": "S", "kg": 15, "reps": 9}]}]}, {"id": "supino-reto", "nome": "Supino reto", "garmin": "", "ajuste": "", "variantes": [{"nome": "", "series": [{"t": "S", "kg": 20, "reps": 12}, {"t": "S", "kg": 20, "reps": 9}, {"t": "S", "kg": 20, "reps": 9}]}]}, {"id": "crucifixo", "nome": "Crucifixo", "garmin": "", "ajuste": "", "variantes": [{"nome": "", "series": [{"t": "S", "kg": 35, "reps": 12}, {"t": "S", "kg": 35, "reps": 12}, {"t": "S", "kg": 35, "reps": 9}]}]}, {"id": "crossover-superior", "nome": "Cross-over superior", "garmin": "", "ajuste": "Uma bolinha abaixo do 6", "variantes": [{"nome": "", "series": [{"t": "S", "kg": 10, "reps": 12}, {"t": "S", "kg": 10, "reps": 12}, {"t": "S", "kg": 10, "reps": 12}]}]}, {"id": "triceps-frances-polia", "nome": "Tríceps francês polia", "garmin": "", "ajuste": "Uma bolinha abaixo do 16", "variantes": [{"nome": "", "series": [{"t": "F", "kg": 20, "reps": 12}, {"t": "S", "kg": 30, "reps": 12}, {"t": "S", "kg": 30, "reps": 12}, {"t": "S", "kg": 30, "reps": 11}]}]}, {"id": "triceps-corda", "nome": "Tríceps polia corda", "garmin": "", "ajuste": "", "variantes": [{"nome": "", "series": [{"t": "S", "kg": 30, "reps": 10}, {"t": "S", "kg": 25, "reps": 10}, {"t": "S", "kg": 25, "reps": 10}]}]}, {"id": "triceps-press", "nome": "Tríceps press", "garmin": "", "ajuste": "", "variantes": [{"nome": "", "series": [{"t": "S", "kg": 60, "reps": 12}, {"t": "S", "kg": 60, "reps": 12}, {"t": "S", "kg": 60, "reps": 12}]}]}, {"id": "abdominal-a", "nome": "Abdominal", "garmin": "", "ajuste": "", "variantes": [{"nome": "Máquina", "series": [{"t": "A", "kg": 30, "reps": 12}, {"t": "S", "kg": 60, "reps": 12}, {"t": "S", "kg": 60, "reps": 12}, {"t": "S", "kg": 60, "reps": 12}]}, {"nome": "Livre (bi-set)", "biset": ["Abdominal no chão", "Elevação de pernas"], "series": [{"t": "S", "kg": 0, "reps": 25, "kg2": 0, "reps2": 12}, {"t": "S", "kg": 0, "reps": 25, "kg2": 0, "reps2": 8}, {"t": "S", "kg": 0, "reps": 15, "kg2": 0, "reps2": 10}, {"t": "S", "kg": 0, "reps": 15, "kg2": 0, "reps2": 8}]}], "manual": true}]'::jsonb)
ON CONFLICT (id) DO NOTHING;
INSERT INTO fichas (id, nome, exercicios) VALUES ('B', 'Costas e Bíceps', '[{"id": "barra-aberta", "nome": "Barra aberta", "garmin": "", "ajuste": "Peso corporal (0 kg = sem carga extra)", "variantes": [{"nome": "", "series": [{"t": "S", "kg": 0, "reps": 12}, {"t": "S", "kg": 0, "reps": 8}, {"t": "S", "kg": 0, "reps": 6}, {"t": "S", "kg": 0, "reps": 5}]}]}, {"id": "remada-supinada", "nome": "Remada máquina supinada", "garmin": "", "ajuste": "", "variantes": [{"nome": "", "series": [{"t": "S", "kg": 42, "reps": 12}, {"t": "S", "kg": 42, "reps": 8}, {"t": "S", "kg": 42, "reps": 8}]}]}, {"id": "puxada-unilateral", "nome": "Puxada unilateral supinada", "garmin": "", "ajuste": "", "variantes": [{"nome": "", "series": [{"t": "S", "kg": 30, "reps": 12}, {"t": "S", "kg": 30, "reps": 12}, {"t": "S", "kg": 30, "reps": 12}]}]}, {"id": "remada-neutra", "nome": "Remada máquina neutra", "garmin": "", "ajuste": "", "variantes": [{"nome": "", "series": [{"t": "S", "kg": 42, "reps": 12}, {"t": "S", "kg": 42, "reps": 12}, {"t": "S", "kg": 42, "reps": 12}]}]}, {"id": "biceps-scott", "nome": "Bíceps Scott máquina", "garmin": "", "ajuste": "", "variantes": [{"nome": "", "series": [{"t": "F", "kg": 10, "reps": 4}, {"t": "S", "kg": 20, "reps": 12}, {"t": "S", "kg": 20, "reps": 7}, {"t": "S", "kg": 20, "reps": 6}]}]}, {"id": "biceps-polia-w", "nome": "Bíceps polia barra W", "garmin": "", "ajuste": "", "variantes": [{"nome": "", "series": [{"t": "S", "kg": 20, "reps": 12}, {"t": "S", "kg": 20, "reps": 12}, {"t": "S", "kg": 20, "reps": 12}]}]}, {"id": "biceps-45", "nome": "Bíceps 45º", "garmin": "", "ajuste": "", "variantes": [{"nome": "", "series": [{"t": "S", "kg": 7, "reps": 12}, {"t": "S", "kg": 7, "reps": 9}, {"t": "S", "kg": 7, "reps": 6}]}]}, {"id": "lombar", "nome": "Lombar (hiperextensão)", "garmin": "", "ajuste": "Saiu do dia de ombro para não carregar a lombar no dia seguinte ao stiff", "variantes": [{"nome": "", "series": [{"t": "F", "kg": 0, "reps": 20}, {"t": "S", "kg": 10, "reps": 14}, {"t": "S", "kg": 10, "reps": 14}, {"t": "S", "kg": 10, "reps": 14}]}]}]'::jsonb)
ON CONFLICT (id) DO NOTHING;
INSERT INTO fichas (id, nome, exercicios) VALUES ('C', 'Ombro e Antebraço', '[{"id": "antebraco", "nome": "Antebraço", "garmin": "", "ajuste": "", "variantes": [{"nome": "", "series": [{"t": "F", "kg": 10, "reps": 16}, {"t": "F", "kg": 15, "reps": 10}, {"t": "S", "kg": 30, "reps": 12}, {"t": "S", "kg": 30, "reps": 12}, {"t": "S", "kg": 30, "reps": 12}]}]}, {"id": "desenvolvimento", "nome": "Desenvolvimento", "garmin": "", "ajuste": "", "variantes": [{"nome": "", "series": [{"t": "F", "kg": 10, "reps": 16}, {"t": "F", "kg": 20, "reps": 8}, {"t": "S", "kg": 30, "reps": 12}, {"t": "S", "kg": 30, "reps": 12}, {"t": "S", "kg": 30, "reps": 12}]}]}, {"id": "crucifixo-inverso", "nome": "Crucifixo inverso", "garmin": "", "ajuste": "", "variantes": [{"nome": "", "series": [{"t": "F", "kg": 10, "reps": 12}, {"t": "F", "kg": 15, "reps": 10}, {"t": "S", "kg": 25, "reps": 12}, {"t": "S", "kg": 25, "reps": 12}, {"t": "S", "kg": 25, "reps": 8}]}]}, {"id": "antebraco-inverso", "nome": "Antebraço inverso", "garmin": "", "ajuste": "", "variantes": [{"nome": "", "series": [{"t": "S", "kg": 25, "reps": 12}, {"t": "S", "kg": 30, "reps": 15}, {"t": "S", "kg": 35, "reps": 15}]}]}, {"id": "trapezio", "nome": "Trapézio", "garmin": "", "ajuste": "", "variantes": [{"nome": "", "series": [{"t": "S", "kg": 20, "reps": 15}, {"t": "S", "kg": 20, "reps": 15}, {"t": "S", "kg": 20, "reps": 12}]}]}, {"id": "abdomen-c", "nome": "Abdômen", "garmin": "", "ajuste": "", "variantes": [{"nome": "Máquina", "series": [{"t": "A", "kg": 25, "reps": 12}, {"t": "S", "kg": 60, "reps": 12}, {"t": "S", "kg": 60, "reps": 12}, {"t": "S", "kg": 60, "reps": 12}]}, {"nome": "Livre (bi-set)", "biset": ["Abdominal no chão", "Elevação de pernas"], "series": [{"t": "S", "kg": 0, "reps": 30, "kg2": 0, "reps2": 0}, {"t": "S", "kg": 0, "reps": 20, "kg2": 0, "reps2": 0}, {"t": "S", "kg": 0, "reps": 20, "kg2": 0, "reps2": 0}, {"t": "S", "kg": 0, "reps": 20, "kg2": 0, "reps2": 0}]}], "manual": true}]'::jsonb)
ON CONFLICT (id) DO NOTHING;
INSERT INTO fichas (id, nome, exercicios) VALUES ('D', 'Perna', '[{"id": "agachamento-hack", "nome": "Agachamento hack", "garmin": "", "ajuste": "", "variantes": [{"nome": "", "series": [{"t": "F", "kg": 5, "reps": 14}, {"t": "F", "kg": 7.5, "reps": 8}, {"t": "F", "kg": 15, "reps": 7}, {"t": "S", "kg": 25, "reps": 12}, {"t": "S", "kg": 25, "reps": 12}, {"t": "S", "kg": 25, "reps": 8}]}]}, {"id": "stiff", "nome": "Stiff", "garmin": "", "ajuste": "", "variantes": [{"nome": "", "series": [{"t": "F", "kg": 20, "reps": 12}, {"t": "F", "kg": 30, "reps": 12}, {"t": "F", "kg": 30, "reps": 3}, {"t": "S", "kg": 40, "reps": 12}, {"t": "S", "kg": 40, "reps": 12}, {"t": "S", "kg": 40, "reps": 12}]}]}, {"id": "leg-press", "nome": "Leg press", "garmin": "", "ajuste": "", "variantes": [{"nome": "", "series": [{"t": "S", "kg": 80, "reps": 12}, {"t": "S", "kg": 80, "reps": 12}, {"t": "S", "kg": 80, "reps": 12}]}]}, {"id": "cadeira-flexora", "nome": "Cadeira flexora", "garmin": "", "ajuste": "Externo na 1ª bolinha · interno na 2ª bolinha de baixo para cima · mais próximo na 2ª bolinha", "variantes": [{"nome": "", "series": [{"t": "S", "kg": 70, "reps": 12}, {"t": "S", "kg": 70, "reps": 12}, {"t": "S", "kg": 70, "reps": 12}]}]}, {"id": "elevacao-pelvica", "nome": "Elevação pélvica", "garmin": "", "ajuste": "", "variantes": [{"nome": "", "series": [{"t": "S", "kg": 20, "reps": 12}, {"t": "S", "kg": 20, "reps": 12}, {"t": "S", "kg": 20, "reps": 8}]}]}, {"id": "adutor", "nome": "Adutor", "garmin": "", "ajuste": "", "variantes": [{"nome": "", "series": [{"t": "S", "kg": 60, "reps": 12}, {"t": "S", "kg": 60, "reps": 10}, {"t": "S", "kg": 60, "reps": 5}]}]}, {"id": "abdutor", "nome": "Abdutor", "garmin": "", "ajuste": "", "variantes": [{"nome": "", "series": [{"t": "S", "kg": 55, "reps": 12}, {"t": "S", "kg": 55, "reps": 12}, {"t": "S", "kg": 55, "reps": 12}]}]}, {"id": "panturrilha-sentado", "nome": "Panturrilha sentado", "garmin": "", "ajuste": "", "variantes": [{"nome": "", "series": [{"t": "S", "kg": 30, "reps": 20}, {"t": "S", "kg": 30, "reps": 20}]}]}, {"id": "panturrilha-em-pe", "nome": "Panturrilha em pé", "garmin": "", "ajuste": "", "variantes": [{"nome": "", "series": [{"t": "S", "kg": 61, "reps": 20}, {"t": "S", "kg": 61, "reps": 17}, {"t": "S", "kg": 61, "reps": 12}]}]}]'::jsonb)
ON CONFLICT (id) DO NOTHING;
