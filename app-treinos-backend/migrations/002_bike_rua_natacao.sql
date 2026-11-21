-- =============================================================================
-- 002 - Bike de rua (BR) e Natação (NT) como opções de treino
-- Rode no SQL Editor do Neon ANTES de subir o lambda.zip novo. Seguro rodar de novo.
-- Só amplia a lista de treinos aceitos; não mexe em nenhum dado.
-- =============================================================================
ALTER TABLE sessoes DROP CONSTRAINT IF EXISTS sessoes_item_check;
ALTER TABLE sessoes ADD CONSTRAINT sessoes_item_check
    CHECK (item IN ('A','B','C','D','RQ','RL','LG','BK','BI','BR','NT','OFF'));
