"""Sono, HRV, Body Battery e a nota de prontidão do dia.

A coleta roda na Lambda de sincronização (junto com as atividades). A nota de prontidão é uma fórmula fixa,
sem IA: cada parte compara o dia com a SUA média recente, então a nota é estável e dá para acompanhar num
gráfico. A IA só explica a nota e recomenda o que fazer com o treino.
"""
from __future__ import annotations

from datetime import date, timedelta
from statistics import mean

from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from src.database import get_db_connection

# ---------------------------------------------------------------- extração das respostas do Garmin


def _num(v, casas=0):
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return round(float(v), casas) if casas else round(v)
    return None


def extrair_sono(r) -> dict | None:
    d = (r or {}).get("dailySleepDTO", r) if isinstance(r, dict) else None
    if not d or not d.get("sleepTimeSeconds"):
        return None
    notas = d.get("sleepScores") or {}
    return {
        "seg": _num(d.get("sleepTimeSeconds")),
        "profundo": _num(d.get("deepSleepSeconds")),
        "leve": _num(d.get("lightSleepSeconds")),
        "rem": _num(d.get("remSleepSeconds")),
        "acordado": _num(d.get("awakeSleepSeconds")),
        "despertares": _num(d.get("awakeCount")),
        "nota": _num((notas.get("overall") or {}).get("value")),
        "fc": _num(d.get("avgHeartRate")),
        "respiracao": _num(d.get("averageRespirationValue"), 1),
        "estresse": _num(d.get("avgSleepStress"), 1),
        "necessidade_min": _num((d.get("sleepNeed") or {}).get("actual")),
    }


def extrair_hrv(r) -> dict | None:
    s = (r or {}).get("hrvSummary") if isinstance(r, dict) else None
    if not s or not s.get("lastNightAvg"):
        return None
    b = s.get("baseline") or {}
    return {
        "noite": _num(s.get("lastNightAvg")),
        "semana": _num(s.get("weeklyAvg")),
        "faixa_min": _num(b.get("balancedLow")),
        "faixa_max": _num(b.get("balancedUpper")),
        "status": s.get("status") or "",
    }


def extrair_resumos(r) -> dict[str, dict]:
    """get_daily_summaries devolve {"data": [um item por dia]}."""
    itens = (r or {}).get("data") if isinstance(r, dict) else r
    out: dict[str, dict] = {}
    for d in itens or []:
        if not isinstance(d, dict) or not d.get("calendarDate"):
            continue
        bb, fc, es, im = (d.get("bodyBattery") or {}), (d.get("heartRate") or {}), (d.get("stress") or {}), (d.get("intensityMinutes") or {})
        out[d["calendarDate"]] = {
            "bb_max": _num(bb.get("maxValue")), "bb_min": _num(bb.get("minValue")),
            "bb_carregou": _num(bb.get("chargedValue")), "bb_gastou": _num(bb.get("drainedValue")),
            "bb_atual": _num(bb.get("latestValue")),
            "fc_repouso": _num(fc.get("restingValue")),
            "estresse": _num(es.get("avgLevel")),
            "min_moderados": _num(im.get("moderate")), "min_vigorosos": _num(im.get("vigorous")),
        }
    return out


def coletar(cliente, inicio: date, fim: date) -> tuple[int, list[str]]:
    """Busca e grava os dias de `inicio` a `fim`. Um endpoint que falha não derruba os outros."""
    erros: list[str] = []
    dias: dict[str, dict] = {}
    d = inicio
    while d <= fim:
        k = d.isoformat()
        dias[k] = {}
        for campo, chamada, extrair in (("sono", cliente.get_daily_sleep, extrair_sono), ("hrv", cliente.get_daily_hrv, extrair_hrv)):
            try:
                dias[k][campo] = extrair(chamada(d))
            except Exception as e:  # noqa: BLE001
                erros.append(f"{campo} {k}: {type(e).__name__}")
        d += timedelta(days=1)
    try:
        for k, v in extrair_resumos(cliente.get_daily_summaries(inicio, fim)).items():
            if k in dias:
                dias[k]["resumo"] = v
    except Exception as e:  # noqa: BLE001
        erros.append(f"resumo: {type(e).__name__}")
    with get_db_connection() as conn:
        for k, v in dias.items():
            if not any(v.get(c) for c in ("sono", "hrv", "resumo")):
                continue
            conn.execute(
                """INSERT INTO saude_diaria (data, sono, hrv, resumo) VALUES (%s, %s, %s, %s)
                   ON CONFLICT (data) DO UPDATE SET
                     sono = COALESCE(EXCLUDED.sono, saude_diaria.sono),
                     hrv = COALESCE(EXCLUDED.hrv, saude_diaria.hrv),
                     resumo = COALESCE(EXCLUDED.resumo, saude_diaria.resumo),
                     atualizado_em = now()""",
                (k, Jsonb(v.get("sono")), Jsonb(v.get("hrv")), Jsonb(v.get("resumo"))),
            )
    return len(dias), erros


# ---------------------------------------------------------------- prontidão

PESOS = {"sono": 25, "hrv": 25, "bb": 20, "fc": 15, "carga": 15}
NOMES = {"sono": "Sono", "hrv": "HRV", "bb": "Body Battery", "fc": "FC de repouso", "carga": "Carga recente"}


def _clip(x: float) -> int:
    return int(max(0, min(100, round(x))))


def carga_sessao(s: dict) -> float:
    """Carga aproximada de um treino, em 'minutos de esforço'. Cardio pesa pela FC; musculação pela duração."""
    g = s.get("garmin") or {}
    c = s.get("cardio") or {}
    dur = (c.get("dur_s") or g.get("dur_s") or (3600 if s.get("tipo") == "forca" else 0)) / 60
    fc = c.get("fc") or g.get("fc")
    fator = (fc / 140) ** 2 if fc else 1.0
    return dur * fator


def calcular_prontidao(dia: date, saude: dict[str, dict], sessoes: list[dict]) -> dict | None:
    """Nota 0-100 do dia e o que pesou. `saude`: data ISO -> linha de saude_diaria; `sessoes`: data, tipo, cardio, garmin, dores."""
    hoje = saude.get(dia.isoformat()) or {}
    ant = [saude[k] for k in sorted(saude) if (dia - timedelta(days=28)).isoformat() <= k < dia.isoformat()]
    partes: dict[str, dict] = {}

    sono = hoje.get("sono")
    if sono:
        h = sono["seg"] / 3600
        nota = sono.get("nota") if sono.get("nota") is not None else _clip(h / 8 * 100)
        partes["sono"] = {"nota": _clip(nota), "txt": f"{int(h)}h{int(round((h % 1) * 60)):02d}" + (f", nota {sono['nota']}" if sono.get("nota") is not None else "")}

    hrv = hoje.get("hrv")
    if hrv and hrv.get("noite"):
        v, lo, hi = hrv["noite"], hrv.get("faixa_min"), hrv.get("faixa_max")
        if not (lo and hi):
            hist = [x["hrv"]["noite"] for x in ant if x.get("hrv") and x["hrv"].get("noite")]
            if len(hist) >= 5:
                m = mean(hist)
                lo, hi = m * 0.92, m * 1.08
        if lo and hi:
            n = 75 + 25 * min(1, (v - lo) / max(1, hi - lo)) if v >= lo else 75 - (lo - v) / lo * 300
            partes["hrv"] = {"nota": _clip(n), "txt": f"{v} ms (sua faixa {round(lo)}–{round(hi)})"}

    res = hoje.get("resumo") or {}
    if res.get("bb_max") is not None:
        partes["bb"] = {"nota": _clip(res["bb_max"]), "txt": f"chegou a {res['bb_max']}" + (f", carregou {res['bb_carregou']} na noite" if res.get("bb_carregou") else "")}

    if res.get("fc_repouso"):
        hist = [x["resumo"]["fc_repouso"] for x in ant if (x.get("resumo") or {}).get("fc_repouso")]
        if len(hist) >= 5:
            d = res["fc_repouso"] - mean(hist)
            partes["fc"] = {"nota": _clip(100 - max(0, d) * 10), "txt": f"{res['fc_repouso']} bpm ({'+' if d >= 0 else ''}{d:.0f} vs sua média)"}

    def carga(de: date, ate: date) -> float:
        return sum(carga_sessao(s) for s in sessoes if de.isoformat() <= s["data"] < ate.isoformat())
    aguda, cronica = carga(dia - timedelta(days=7), dia), carga(dia - timedelta(days=28), dia) / 4
    if cronica > 0:
        r = aguda / cronica
        n = 100 if r <= 1.0 else 100 - (r - 1) * 100 if r <= 1.3 else 70 - (r - 1.3) * 150
        partes["carga"] = {"nota": _clip(n), "txt": f"últimos 7 dias = {r:.2f}× a média de 4 semanas"}

    if not partes:
        return None
    total = sum(PESOS[k] for k in partes)
    nota = sum(p["nota"] * PESOS[k] for k, p in partes.items()) / total
    doeu = [k for s in sessoes if (dia - timedelta(days=3)).isoformat() <= s["data"] < dia.isoformat()
            for k, v in (s.get("dores") or {}).items() if v == "dor"]
    if doeu:
        nota -= 10
    nota = _clip(nota)
    return {
        "nota": nota,
        "faixa": "alta" if nota >= 75 else "moderada" if nota >= 50 else "baixa",
        "partes": {k: {**p, "nome": NOMES[k], "peso": PESOS[k]} for k, p in partes.items()},
        "dor_recente": sorted(set(doeu)),
        "completa": len(partes) == len(PESOS),
    }


def recalcular_prontidao(dias: list[date]) -> None:
    """Recalcula e grava a nota dos dias pedidos (usa 28 dias de histórico antes de cada um)."""
    if not dias:
        return
    de = min(dias) - timedelta(days=29)
    with get_db_connection() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute("SELECT data, sono, hrv, resumo FROM saude_diaria WHERE data >= %s", (de,))
        saude = {r["data"].isoformat(): r for r in cur.fetchall()}
        cur.execute("SELECT data, tipo, cardio, garmin, dores FROM sessoes WHERE data >= %s", (de,))
        sessoes = [{**r, "data": r["data"].isoformat()} for r in cur.fetchall()]
        for d in dias:
            if d.isoformat() not in saude:
                continue
            p = calcular_prontidao(d, saude, sessoes)
            cur.execute("UPDATE saude_diaria SET prontidao = %s WHERE data = %s", (Jsonb(p), d))


def ler_saude(dias: int = 90) -> list[dict]:
    with get_db_connection() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute("SELECT data, sono, hrv, resumo, prontidao FROM saude_diaria WHERE data >= current_date - %s ORDER BY data", (dias,))
        return [{**r, "data": r["data"].isoformat()} for r in cur.fetchall()]
