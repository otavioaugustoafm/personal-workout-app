"""Fase 2: traz as atividades do Garmin para o banco.

Roda numa Lambda separada (handler `src.garmin.handler`), de hora em hora pelo EventBridge Scheduler,
e também pelo botão "Sincronizar agora" do app. Só ESTA Lambda conhece a chave do Garmin.

O que ela faz: lista as atividades dos últimos dias, guarda as que ainda não estão no banco e, na
musculação, lê as séries do arquivo .FIT. Ela nunca mexe nas suas sessões: quem decide o que entra
é você, confirmando no app.
"""
from __future__ import annotations

import io
import os
import zipfile
from datetime import date, datetime, timedelta, timezone

from psycopg.types.json import Jsonb

from src.database import get_db_connection

BRASILIA = timezone(timedelta(hours=-3))

# Tipos do Garmin que o app entende. O resto (caminhada, yoga...) é ignorado.
TIPOS = {
    "strength_training": "forca",
    "running": "corrida", "treadmill_running": "corrida", "trail_running": "corrida", "track_running": "corrida",
    "indoor_cycling": "bike", "virtual_ride": "bike",
    "cycling": "bikerua", "road_biking": "bikerua", "mountain_biking": "bikerua", "gravel_cycling": "bikerua",
    "lap_swimming": "natacao", "open_water_swimming": "natacao", "swimming": "natacao",
}


# ---------------------------------------------------------------- leitura do .FIT

def primeiro(v):
    """Alguns campos do FIT vêm como lista (ex.: ['shoulder_press']); fica com o primeiro valor."""
    if isinstance(v, (list, tuple)):
        return v[0] if v else None
    return v


def texto_limpo(v) -> str:
    """Textos do FIT às vezes vêm numa lista com lixo binário depois; pega o primeiro texto legível."""
    itens = v if isinstance(v, (list, tuple)) else [v]
    for item in itens:
        if isinstance(item, str) and item.strip() and item.isprintable():
            return item.strip()
    return ""


def ler_fit(arquivo_zip: bytes) -> dict:
    """Abre o ZIP que o Garmin entrega e decodifica o primeiro .FIT."""
    from garmin_fit_sdk import Decoder, Stream

    z = zipfile.ZipFile(io.BytesIO(arquivo_zip))
    for nome in z.namelist():
        if nome.lower().endswith(".fit"):
            mensagens, _erros = Decoder(Stream.from_byte_array(bytearray(z.read(nome)))).read()
            return mensagens
    raise ValueError("O arquivo da atividade não tem .FIT")


def montar_exercicios(mensagens: dict, passos_api: list | None = None) -> list[dict]:
    """Agrupa as séries ativas por exercício, na ordem em que foram feitas.

    Cada grupo: passo do treino, categoria, nome (da biblioteca do Garmin), descrição (que você escreve
    no passo do treino no Garmin Connect), séries (reps, kg) e se foi pulado (tudo zerado).
    Nenhuma série é descartada pela duração: você costuma marcar as séries em sequência no fim.
    """
    titulos: dict[tuple, str] = {}
    for t in mensagens.get("exercise_title_mesgs") or []:
        titulos[(str(t.get("exercise_category")), str(t.get("exercise_name")))] = texto_limpo(t.get("wkt_step_name"))
    passos = {p.get("message_index"): p for p in mensagens.get("workout_step_mesgs") or []}
    notas_api: dict[int, str] = {}
    for treino in passos_api or []:
        for i, st in enumerate((treino or {}).get("steps") or []):
            if st.get("notes"):
                notas_api[st.get("stepIndex") or i] = str(st["notes"]).strip()

    grupos: list[dict] = []
    for s in mensagens.get("set_mesgs") or []:
        if str(s.get("set_type")).lower() not in ("active", "1"):
            continue
        passo = s.get("wkt_step_index")
        cat, sub = primeiro(s.get("category")), primeiro(s.get("category_subtype"))
        chave = (passo, str(cat), str(sub))
        if not grupos or grupos[-1]["_chave"] != chave:
            grupos.append({"_chave": chave, "passo": passo, "categoria": str(cat) if cat is not None else "",
                           "nome": titulos.get((str(cat), str(sub))) or "", "series": []})
        peso = s.get("weight")
        grupos[-1]["series"].append({"reps": int(s.get("repetitions") or 0),
                                     "kg": round(float(peso), 1) if isinstance(peso, (int, float)) else 0.0})
    for g in grupos:
        g.pop("_chave")
        p = passos.get(g["passo"]) or {}
        g["descricao"] = texto_limpo(p.get("notes")) or notas_api.get(g["passo"], "")
        g["pulado"] = all(x["reps"] == 0 and x["kg"] == 0 for x in g["series"])
    return grupos


def resumo_da_lista(a: dict) -> dict:
    """Só o que o app usa, de um item da lista de atividades."""
    dist = a.get("distance") or 0

    def num(chave):
        v = a.get(chave)
        return round(float(v), 1) if isinstance(v, (int, float)) and v else None

    return {
        "nome": a.get("activityName") or "",
        "dist_km": round(dist / 1000, 2) if dist else None,
        "dur_s": round(a["duration"]) if a.get("duration") else None,
        "fc": round(a["averageHR"]) if a.get("averageHR") else None,
        "fc_max": round(a["maxHR"]) if a.get("maxHR") else None,
        "calorias": round(a["calories"]) if a.get("calories") else None,
        "te_aerobico": num("aerobicTrainingEffect"),
        "te_anaerobico": num("anaerobicTrainingEffect"),
        "cadencia": round(a["averageRunningCadenceInStepsPerMinute"]) if a.get("averageRunningCadenceInStepsPerMinute") else None,
        "elevacao_m": num("elevationGain"),
        "inicio": a.get("startTimeLocal") or "",
    }


# ---------------------------------------------------------------- sincronização

def _cliente(chave: str):
    from garmin_personal_api import GarminPersonalApiClient, PersonalApiAuthenticator
    # Na Lambda só /tmp aceita escrita; o cliente guarda ali o token (vale 24 h e é reaproveitado entre execuções)
    with PersonalApiAuthenticator(bearer_token_cache_file="/tmp/garmin-token.json") as auth:
        token = auth.obtain_token(chave)
    return GarminPersonalApiClient(token.access_token)


def sincronizar(dias: int = 3, cliente=None) -> dict:
    """Busca as atividades dos últimos `dias` e guarda as novas. Devolve quantas entraram."""
    hoje = datetime.now(BRASILIA).date()
    inicio = hoje - timedelta(days=dias)
    if cliente is None:
        chave = os.getenv("GARMIN_PERSONAL_API_KEY", "").strip()
        if not chave:
            raise RuntimeError("GARMIN_PERSONAL_API_KEY não configurada nesta Lambda.")
        cliente = _cliente(chave)

    novas = 0
    with cliente as c:
        atividades: list[dict] = []
        pagina = 0
        while True:
            lote = c.search_activities(start=pagina * 100, limit=100, start_date=inicio, end_date=hoje) or []
            atividades += lote
            if len(lote) < 100:
                break
            pagina += 1
        atividades = [a for a in atividades if ((a.get("activityType") or {}).get("typeKey")) in TIPOS]
        if atividades:
            with get_db_connection() as conn:
                ids = [int(a["activityId"]) for a in atividades]
                ja = {r[0] for r in conn.execute("SELECT id FROM garmin_atividades WHERE id = ANY(%s)", (ids,)).fetchall()}
            for a in atividades:
                aid = int(a["activityId"])
                if aid in ja:
                    continue
                tipo = a["activityType"]["typeKey"]
                exercicios = None
                if TIPOS[tipo] == "forca":
                    try:
                        passos_api = c.get_activity_workouts(aid)
                    except Exception:  # noqa: BLE001 - o treino planejado é só para a descrição; sem ele, segue
                        passos_api = None
                    if isinstance(passos_api, dict):
                        passos_api = [passos_api]
                    # se o .FIT ainda não estiver pronto, não grava: tenta de novo na próxima hora
                    exercicios = montar_exercicios(ler_fit(c.download_activity(aid)), passos_api)
                data = (a.get("startTimeLocal") or hoje.isoformat())[:10]
                with get_db_connection() as conn:
                    conn.execute(
                        """INSERT INTO garmin_atividades (id, data, tipo, resumo, exercicios)
                           VALUES (%s, %s, %s, %s, %s) ON CONFLICT (id) DO NOTHING""",
                        (aid, data, tipo, Jsonb(resumo_da_lista(a)), Jsonb(exercicios) if exercicios is not None else None),
                    )
                novas += 1
    return {"novas": novas, "vistas": len(atividades)}


def _registrar(erro: str | None) -> None:
    expira = os.getenv("GARMIN_CHAVE_EXPIRA", "").strip() or None
    if expira:
        date.fromisoformat(expira)  # formato AAAA-MM-DD
    with get_db_connection() as conn:
        if erro is None:
            conn.execute("UPDATE garmin_estado SET ultima_sync = now(), ultimo_erro = NULL, chave_expira = %s WHERE id = 1", (expira,))
        else:
            conn.execute("UPDATE garmin_estado SET ultimo_erro = %s, chave_expira = %s WHERE id = 1", (erro[:300], expira))


def handler(event, context):
    """Ponto de entrada da Lambda de sincronização. Evento opcional: {"dias": 30} para buscar mais para trás."""
    dias = 3
    if isinstance(event, dict) and event.get("dias"):
        dias = max(1, min(int(event["dias"]), 90))
    try:
        resultado = sincronizar(dias)
    except Exception as e:  # noqa: BLE001
        # a mensagem do erro vai para o app; a chave nunca aparece nela
        _registrar(f"{type(e).__name__}: {e}".replace(os.getenv("GARMIN_PERSONAL_API_KEY", "") or "\0", "***"))
        raise
    _registrar(None)
    return resultado
