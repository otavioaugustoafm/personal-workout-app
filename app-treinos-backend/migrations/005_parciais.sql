-- Parciais (voltas) de corrida, bike e natação, lidas do .FIT. Rode uma vez no SQL Editor do Neon, depois da 004.
ALTER TABLE garmin_atividades ADD COLUMN IF NOT EXISTS voltas JSONB;
