"""Fase 2: leitura do .FIT, sincronização (com um Garmin de mentira) e as rotas de confirmar/ignorar."""
import datetime as dt
import io
import zipfile

from garmin_fit_sdk import Encoder, Profile


def fit_de_musculacao() -> bytes:
    """FIT parecido com o seu treino de ombro: dois exercícios de antebraço com o mesmo nome, um pulado."""
    mt = Profile["mesg_num"]
    enc = Encoder()
    t0 = dt.datetime(2026, 11, 20, 21, 0, tzinfo=dt.timezone.utc)
    enc.write_mesg({"mesg_num": mt["FILE_ID"], "type": "activity", "manufacturer": "garmin", "product": 1,
                    "time_created": t0, "serial_number": 1})
    for cat, sub, nome in [("curl", 27, "Pinça anilhas com flexão de antebraços"), ("shoulder_press", 24, "Desenvolvimento de ombros com halteres"),
                           ("hyperextension", None, "Hiperextensão")]:
        m = {"mesg_num": mt["EXERCISE_TITLE"], "exercise_category": cat, "wkt_step_name": nome, "message_index": 0}
        if sub is not None:
            m["exercise_name"] = sub
        enc.write_mesg(m)
    for i, notas in [(0, "Antebraço"), (3, ""), (9, "Antebraço inverso")]:
        enc.write_mesg({"mesg_num": mt["WORKOUT_STEP"], "message_index": i, "notes": notas or None, "exercise_category": "curl"})
    series = [(0, "curl", 27, 20, 10.0), (0, "curl", 27, 12, 30.0), (3, "shoulder_press", 24, 12, 30.0),
              (9, "curl", 27, 15, 25.0), (12, "hyperextension", None, 0, 0.0)]
    for n, (passo, cat, sub, reps, kg) in enumerate(series):
        s = {"mesg_num": mt["SET"], "timestamp": t0 + dt.timedelta(minutes=n), "set_type": "active", "repetitions": reps,
             "duration": 1.0, "category": [cat], "wkt_step_index": passo, "start_time": t0}
        if kg:
            s["weight"] = kg
        if sub is not None:
            s["category_subtype"] = [sub]
        enc.write_mesg(s)
        enc.write_mesg({"mesg_num": mt["SET"], "timestamp": t0 + dt.timedelta(minutes=n, seconds=30), "set_type": "rest",
                        "duration": 60.0, "start_time": t0})
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("1_ACTIVITY.fit", bytes(enc.close()))
    return buf.getvalue()


class GarminFalso:
    def __enter__(self):
        return self

    def __exit__(self, *a):
        pass

    def search_activities(self, start, limit, start_date, end_date):
        if start:
            return []
        hoje = dt.date.today().isoformat()
        return [
            {"activityId": 11, "activityName": "Ombro", "startTimeLocal": hoje + " 18:00:00",
             "activityType": {"typeKey": "strength_training"}, "duration": 3600.0, "averageHR": 118.0},
            {"activityId": 12, "startTimeLocal": hoje + " 07:00:00", "activityType": {"typeKey": "running"},
             "distance": 5020.0, "duration": 1980.0, "averageHR": 151.0, "maxHR": 170.0,
             "averageRunningCadenceInStepsPerMinute": 168.0},
            {"activityId": 13, "startTimeLocal": hoje + " 08:00:00", "activityType": {"typeKey": "walking"}},
        ]

    def get_activity_workouts(self, aid):
        return [{"steps": [{"stepIndex": 3, "notes": "Desenvolvimento"}]}]

    def download_activity(self, aid):
        return fit_de_musculacao()

    def get_daily_sleep(self, d):
        return {}

    def get_daily_hrv(self, d):
        return {}

    def get_daily_summaries(self, a, b):
        return {"data": []}


def test_montar_exercicios():
    from src.garmin import ler_fit, montar_exercicios
    g = montar_exercicios(ler_fit(fit_de_musculacao()), [{"steps": [{"stepIndex": 3, "notes": "Desenvolvimento"}]}])
    assert [x["passo"] for x in g] == [0, 3, 9, 12]
    assert g[0]["nome"] == g[2]["nome"] == "Pinça anilhas com flexão de antebraços"     # mesmo nome, exercícios diferentes
    assert [x["descricao"] for x in g] == ["Antebraço", "Desenvolvimento", "Antebraço inverso", ""]
    assert g[0]["series"] == [{"reps": 20, "kg": 10.0}, {"reps": 12, "kg": 30.0}]          # série de 1 s não é descartada
    assert g[3]["pulado"] is True and not g[0]["pulado"]


def test_sincronizar_e_confirmar(cliente):
    from src.garmin import sincronizar
    r = sincronizar(3, cliente=GarminFalso())
    assert (r["novas"], r["vistas"]) == (2, 2)                                             # caminhada ignorada
    assert sincronizar(3, cliente=GarminFalso())["novas"] == 0                             # não duplica
    e = cliente.get("/api/v1/estado").json()["garmin"]
    forca = next(a for a in e["atividades"] if a["tipo"] == "strength_training")
    corrida = next(a for a in e["atividades"] if a["tipo"] == "running")
    assert len(forca["exercicios"]) == 4 and corrida["resumo"]["dist_km"] == 5.02 and corrida["resumo"]["cadencia"] == 168

    hoje = dt.date.today().isoformat()
    s = {"id": "g1", "data": hoje, "item": "RL", "cardio": {"dist": 5.02, "dur_s": 1980, "fc": 151}, "garmin": {"atividade": "12"}}
    r = cliente.post("/api/v1/garmin/12/usar", json={"sessao": s})
    assert r.status_code == 200 and r.json()["garmin"] == {"atividade": "12"}
    s["cardio"]["fc"] = 150                                                                 # completar de novo atualiza
    assert cliente.post("/api/v1/garmin/12/usar", json={"sessao": s}).json()["cardio"]["fc"] == 150
    e = cliente.get("/api/v1/estado").json()
    assert [a["id"] for a in e["garmin"]["atividades"]] == ["11"] and len(e["sessoes"]) == 1

    cliente.delete("/api/v1/sessoes/g1")                                                   # desfazer devolve para a fila
    assert len(cliente.get("/api/v1/estado").json()["garmin"]["atividades"]) == 2
    assert cliente.post("/api/v1/garmin/11/ignorar").status_code == 204
    assert cliente.post("/api/v1/garmin/99/ignorar").status_code == 404
    assert [a["id"] for a in cliente.get("/api/v1/estado").json()["garmin"]["atividades"]] == ["12"]
    assert cliente.post("/api/v1/garmin/sincronizar").status_code == 501                   # sem a Lambda configurada
