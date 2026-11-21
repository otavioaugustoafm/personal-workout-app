import json
from datetime import date

from tests.conftest import SENHA_TESTE


def test_sem_token_bloqueia(banco):
    from fastapi.testclient import TestClient
    from src.main import app
    c = TestClient(app)
    assert c.get("/api/v1/estado").status_code == 401
    assert c.post("/api/v1/auth/login", json={"senha": "errada"}).status_code == 401
    assert c.post("/api/v1/auth/login", json={"senha": SENHA_TESTE}).status_code == 200


def test_estado_inicial_vem_da_migracao(cliente):
    e = cliente.get("/api/v1/estado").json()
    assert e["padrao"] == ["A", "RQ", "B", "D", "C", "BK", "LG"]
    assert set(e["fichas"]) == {"A", "B", "C", "D"}
    assert any(x["id"] == "lombar" for x in e["fichas"]["B"])          # hiperextensao no dia de costas
    abd = next(x for x in e["fichas"]["A"] if x["id"] == "abdominal-a")
    assert abd["manual"] is True and abd["variantes"][1]["biset"]     # bi-set livre, fora do Garmin
    assert e["sessoes"] == [] and e["rascunhos"] == {}


def test_sessao_criar_listar_desfazer(cliente):
    s = {"id": "s1", "data": "2026-11-20", "item": "C", "notas": "ok", "dores": {"cotovelo": "leve"},
         "exercicios": [{"id": "trapezio", "nome": "Trapézio", "variante": 0, "series": [{"t": "S", "kg": 20, "reps": 15, "feito": True}]}]}
    r = cliente.post("/api/v1/sessoes", json=s)
    assert r.status_code == 201 and r.json()["kind"] == "forca"
    assert cliente.post("/api/v1/sessoes", json=s).status_code == 201       # repetir nao duplica
    e = cliente.get("/api/v1/estado").json()
    assert len(e["sessoes"]) == 1 and e["sessoes"][0]["dores"] == {"cotovelo": "leve"}
    assert cliente.delete("/api/v1/sessoes", params={"data": "2026-11-20"}).json() == {"removidos": 1}
    assert cliente.get("/api/v1/estado").json()["sessoes"] == []


def test_cardio_e_validacao(cliente):
    ok = cliente.post("/api/v1/sessoes", json={"id": "c1", "data": "2026-11-22", "item": "LG",
                                               "cardio": {"dist": 15.2, "dur_s": 5600, "fc": 152}, "sensacao": "ok"})
    assert ok.json()["kind"] == "cardio" and ok.json()["cardio"]["dist"] == 15.2
    assert cliente.post("/api/v1/sessoes", json={"id": "x", "data": "2026-11-22", "item": "ZZ"}).status_code == 422
    assert cliente.post("/api/v1/sessoes", json={"id": "y", "data": "2026-11-22", "item": "A", "dores": {"joelho": "muito"}}).status_code == 422


def test_configuracao_e_fichas(cliente):
    assert cliente.put("/api/v1/configuracao", json={"semana_padrao": ["A"] * 6}).status_code == 422
    assert cliente.put("/api/v1/configuracao", json={"inicio": "2026-11-20", "respondidos": {"2026-11-19": "nao"}}).status_code == 204
    e = cliente.get("/api/v1/estado").json()
    assert e["inicio"] == "2026-11-20" and e["respondidos"] == {"2026-11-19": "nao"}
    ficha = e["fichas"]["C"]
    ficha.append({"id": "ex-novo", "nome": "Elevação lateral", "variantes": [{"nome": "", "series": [{"t": "S", "kg": 8, "reps": 12}]}]})
    assert cliente.put("/api/v1/fichas/C", json={"exercicios": ficha}).status_code == 204
    assert cliente.get("/api/v1/estado").json()["fichas"]["C"][-1]["nome"] == "Elevação lateral"
    assert cliente.put("/api/v1/fichas/Z", json={"exercicios": []}).status_code == 404


def test_rascunho(cliente):
    assert cliente.put("/api/v1/rascunhos/D", json={"dados": {"item": "D", "ex": {}}}).status_code == 204
    assert cliente.get("/api/v1/estado").json()["rascunhos"]["D"]["item"] == "D"
    cliente.delete("/api/v1/rascunhos/D")
    assert cliente.get("/api/v1/estado").json()["rascunhos"] == {}


def test_importar_backup_da_pagina(cliente):
    atual = cliente.get("/api/v1/backup").json()
    backup = {"versao": 2, "inicio": "2026-11-20", "fichas": atual["fichas"], "padrao": atual["padrao"],
              "respondidos": {"2026-11-19": "nao"}, "rascunhos": {},
              "sessoes": [{"id": "x1", "ts": 1795200000000, "data": "2026-11-20", "item": "C", "kind": "forca",
                           "joelho": "leve", "exercicios": [], "rapido": True, "notas": ""},
                          {"id": "x2", "ts": 1795200001000, "data": "2026-11-21", "item": "BK", "kind": "cardio",
                           "cardio": {"dist": 22.4, "dur_s": 3720, "fc": 138}, "dores": {}, "notas": "leve"}]}
    r = cliente.post("/api/v1/backup/importar", json=backup)
    assert r.status_code == 200, r.text
    e = cliente.get("/api/v1/estado").json()
    assert [s["id"] for s in e["sessoes"]] == ["x1", "x2"]
    assert e["sessoes"][0]["dores"] == {"joelho": "leve"}               # formato antigo convertido
    ruim = dict(backup, sessoes=[{"id": "z", "data": "2026-11-20", "item": "??"}])
    assert cliente.post("/api/v1/backup/importar", json=ruim).status_code == 422
    assert len(cliente.get("/api/v1/estado").json()["sessoes"]) == 2     # backup ruim nao apagou nada


def test_natacao_e_bike_de_rua(cliente):
    n = cliente.post("/api/v1/sessoes", json={"id": "n1", "data": "2026-11-21", "item": "NT",
                                              "cardio": {"dist": 1.5, "dur_s": 2100, "fc": 130}, "dores": {"ombro": "leve"}})
    assert n.status_code == 201 and n.json()["kind"] == "cardio" and n.json()["cardio"]["dist"] == 1.5
    assert cliente.post("/api/v1/sessoes", json={"id": "b1", "data": "2026-11-22", "item": "BR",
                                                 "cardio": {"dist": 35, "dur_s": 4500, "fc": 140}}).status_code == 201
    padrao = ["A", "RQ", "B", "D", "NT", "BR", "LG"]
    assert cliente.put("/api/v1/configuracao", json={"semana_padrao": padrao}).status_code == 204
    assert cliente.get("/api/v1/estado").json()["padrao"] == padrao
