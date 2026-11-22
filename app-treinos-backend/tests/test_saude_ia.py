"""Fase 3: sono/HRV/Body Battery, nota de prontidão e análises com IA (sem chamar a API de verdade)."""
import datetime as dt


def sono(seg=25200, nota=80):
    return {"calendarDate": "x", "sleepTimeSeconds": seg, "deepSleepSeconds": 5400, "lightSleepSeconds": 14000, "remSleepSeconds": 5800,
            "awakeSleepSeconds": 600, "awakeCount": 2, "avgHeartRate": 50.0, "averageRespirationValue": 14.2, "avgSleepStress": 12.0,
            "sleepScores": {"overall": {"value": nota, "qualifierKey": "GOOD"}}, "sleepNeed": {"actual": 480}}


class SaudeFalsa:
    def get_daily_sleep(self, d):
        return sono(21600 if d == dt.date.today() else 27000, 60 if d == dt.date.today() else 82)

    def get_daily_hrv(self, d):
        return {"hrvSummary": {"lastNightAvg": 44 if d == dt.date.today() else 55, "weeklyAvg": 54,
                               "baseline": {"balancedLow": 50, "balancedUpper": 62}, "status": "BALANCED"}}

    def get_daily_summaries(self, a, b):
        out, d = [], a
        while d <= b:
            out.append({"calendarDate": d.isoformat(), "bodyBattery": {"maxValue": 55 if d == dt.date.today() else 85, "minValue": 10,
                        "chargedValue": 50, "drainedValue": 60, "latestValue": 40},
                        "heartRate": {"restingValue": 56 if d == dt.date.today() else 50}, "stress": {"avgLevel": 30},
                        "intensityMinutes": {"moderate": 40, "vigorous": 10}})
            d += dt.timedelta(days=1)
        return {"data": out}


def test_extrair():
    from src.saude import extrair_hrv, extrair_resumos, extrair_sono
    assert extrair_sono(sono())["nota"] == 80 and extrair_sono({"dailySleepDTO": sono()})["rem"] == 5800
    assert extrair_sono({}) is None and extrair_hrv({}) is None
    assert extrair_hrv({"hrvSummary": {"lastNightAvg": 50, "baseline": {"balancedLow": 45, "balancedUpper": 60}}})["faixa_max"] == 60
    assert extrair_resumos({"data": [{"calendarDate": "2026-11-20", "bodyBattery": {"maxValue": 80}}]})["2026-11-20"]["bb_max"] == 80


def test_coletar_e_prontidao(cliente):
    from src import saude
    hoje = dt.date.today()
    n, erros = saude.coletar(SaudeFalsa(), hoje - dt.timedelta(days=20), hoje)
    assert n == 21 and not erros
    cliente.post("/api/v1/sessoes", json={"id": "c1", "data": (hoje - dt.timedelta(days=1)).isoformat(), "item": "LG",
                                          "cardio": {"dist": 16, "dur_s": 5700, "fc": 150}, "dores": {"joelho": "dor"}})
    saude.recalcular_prontidao([hoje - dt.timedelta(days=1), hoje])
    e = cliente.get("/api/v1/estado").json()
    dias = {r["data"]: r for r in e["saude"]}
    p_hoje, p_ontem = dias[hoje.isoformat()]["prontidao"], dias[(hoje - dt.timedelta(days=1)).isoformat()]["prontidao"]
    assert p_ontem["nota"] > p_hoje["nota"]                     # noite pior, HRV abaixo da faixa, FC de repouso subiu
    assert p_hoje["partes"]["hrv"]["nota"] < 75 and p_hoje["dor_recente"] == ["joelho"]
    assert set(p_hoje["partes"]) >= {"sono", "hrv", "bb", "fc"}
    assert e["contexto_ia"] and e["ia"]["gasto_mes"] == 0 and e["ia"]["configurada"] is False


def test_analises(cliente, monkeypatch):
    from src import ia, saude
    hoje = dt.date.today()
    saude.coletar(SaudeFalsa(), hoje - dt.timedelta(days=3), hoje)
    saude.recalcular_prontidao([hoje])
    cliente.post("/api/v1/sessoes", json={"id": "f1", "data": hoje.isoformat(), "item": "C", "garmin": {"atividade": "1", "dur_s": 3600, "fc": 118},
                                          "exercicios": [{"id": "x", "nome": "Desenvolvimento", "variante": 0,
                                                          "series": [{"t": "A", "kg": 10, "reps": 20}, {"t": "S", "kg": 30, "reps": 12}]}]})
    pedidos = []

    def falso(modelo, max_tokens, sistema, conteudo):
        pedidos.append((modelo, sistema, conteudo))
        return "Texto da análise.", 4000, 500

    monkeypatch.setattr(ia, "_chamar", falso)
    a = ia.analisar("prontidao", hoje.isoformat())
    assert a["modelo"] == "claude-haiku-5-5" and abs(a["custo_usd"] - (4000 * 0.10 + 500 * 0.50) / 1e6) < 1e-9
    assert "Prontidão de hoje" in pedidos[0][2] and "Protejo o joelho" in pedidos[0][1]
    assert ia.analisar("prontidao", hoje.isoformat())["texto"] == "Texto da análise." and len(pedidos) == 1   # guardada
    t = ia.analisar("treino", "f1")
    assert t["modelo"] == "claude-sonnet-5-5" and "aq 10×20, 30×12" in pedidos[1][2]
    ia.analisar("treino", "f1", forcar=True)                                                                  # refazer soma o custo
    assert ia.gasto_do_mes() == round(ia.custo("claude-haiku-5-5", 4000, 500) + 2 * ia.custo("claude-sonnet-5-5", 4000, 500), 6)

    monkeypatch.setattr(ia, "LIMITE_AUTO", 0.01)
    try:
        ia.analisar("semana", "2026-11-16", auto=True)
        raise AssertionError("deveria parar no teto automático")
    except ia.LimiteAtingido:
        pass
    assert ia.analisar("semana", "2026-11-16")["texto"]                                                       # pedida por você passa

    assert cliente.post("/api/v1/ia/sono", json={"chave": hoje.isoformat()}).status_code == 503              # sem chave configurada
    monkeypatch.setenv("ANTHROPIC_API_KEY", "teste")
    r = cliente.post("/api/v1/ia/sono", json={"chave": hoje.isoformat()})
    assert r.status_code == 200 and r.json()["gasto_mes"] > 0
    assert cliente.post("/api/v1/ia/treino", json={"chave": "nao-existe"}).status_code == 404
    e = cliente.get("/api/v1/estado").json()["ia"]
    assert len(e["analises"]) == 4 and e["configurada"] is True
    assert cliente.put("/api/v1/configuracao", json={"contexto_ia": "Meta: meia maratona em abril."}).status_code == 204
    assert cliente.get("/api/v1/estado").json()["contexto_ia"] == "Meta: meia maratona em abril."
