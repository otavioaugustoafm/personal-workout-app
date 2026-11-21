"""Configura o ambiente de teste ANTES de importar o app.

Os testes de banco usam TEST_DATABASE_URL e APAGAM os dados das tabelas dele.
Use uma branch descartavel do Neon (ou um Postgres local), nunca o banco real.
"""
import os
from pathlib import Path

import bcrypt
import pytest

SENHA_TESTE = "senha-de-teste-123"
os.environ.setdefault("DATABASE_URL", os.getenv("TEST_DATABASE_URL", "postgresql://x/y"))
os.environ["APP_PASSWORD_HASH"] = bcrypt.hashpw(SENHA_TESTE.encode(), bcrypt.gensalt(rounds=4)).decode()
os.environ["JWT_SECRET_KEY"] = "x" * 40
os.environ["ALLOWED_ORIGINS"] = "http://localhost:5173"

MIGRACOES = sorted((Path(__file__).resolve().parent.parent / "migrations").glob("*.sql"))


@pytest.fixture()
def banco():
    url = os.getenv("TEST_DATABASE_URL")
    if not url:
        pytest.skip("Defina TEST_DATABASE_URL para rodar os testes de banco.")
    import psycopg
    with psycopg.connect(url, autocommit=True) as conn:
        conn.execute("DROP TABLE IF EXISTS sessoes, rascunhos, fichas, configuracao, garmin_atividades, garmin_estado CASCADE")
        for arq in MIGRACOES:
            conn.execute(arq.read_text(encoding="utf-8"))
    yield url


@pytest.fixture()
def cliente(banco):
    from fastapi.testclient import TestClient
    from src.main import app
    c = TestClient(app)
    token = c.post("/api/v1/auth/login", json={"senha": SENHA_TESTE}).json()["token"]
    c.headers["Authorization"] = f"Bearer {token}"
    return c
