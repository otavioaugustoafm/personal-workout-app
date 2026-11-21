"""Teste da API pessoal do Garmin, ANTES da Fase 2.

Roda no seu computador, com o cliente oficial da Garmin, e gera o arquivo `relatorio_garmin.txt`
com a ESTRUTURA do que a API devolve (nomes dos campos, tipos, se a distância vem preenchida,
se as séries de musculação aparecem...). Esse relatório é o que você me manda.

O que NÃO vai para o relatório: a sua chave, o token, nomes de atividades, horários, locais/GPS,
IDs, dados do perfil e valores de saúde (sono, HRV, Body Battery aparecem só como lista de campos).
Das atividades entram apenas tipo, distância, duração, FC média e, na musculação, as séries
(exercício, repetições, carga), que é justamente o que precisamos confirmar.

Instalação (uma vez, na .venv do backend):
    pip install garmin-connect-personal-api-python garmin-fit-sdk

Uso:
    python scripts/testar_garmin.py              # últimos 30 dias
    python scripts/testar_garmin.py --dias 60
    python scripts/testar_garmin.py --salvar-bruto   # também salva as respostas completas em garmin_bruto/ (só para você; não mande)

A chave é lida de GARMIN_PERSONAL_API_KEY ou do arquivo ~/.config/garmin/connect-personal-api-key
(no Windows: %USERPROFILE%\\.config\\garmin\\connect-personal-api-key). Se não achar, o script pergunta
sem mostrar o que você digita. Nunca cole a chave no chat.
"""
from __future__ import annotations

import argparse
import getpass
import io
import json
import sys
import traceback
import zipfile
from collections import Counter
from datetime import date, timedelta
from pathlib import Path

try:
    from garmin_personal_api import GarminPersonalApiClient, PersonalApiAuthenticator, resolve_api_key
except ImportError:
    sys.exit("Instale antes: pip install garmin-connect-personal-api-python garmin-fit-sdk")

RAIZ = Path(__file__).resolve().parent.parent
SAIDA = RAIZ / "relatorio_garmin.txt"
BRUTO = RAIZ / "garmin_bruto"

linhas: list[str] = []


def out(texto: str = "") -> None:
    print(texto)
    linhas.append(texto)


def titulo(t: str) -> None:
    out()
    out("=" * 70)
    out(t)
    out("=" * 70)


def estrutura(obj, prof: int = 0, max_prof: int = 4, recuo: str = "  ") -> None:
    """Imprime só nomes de campos e tipos (nunca os valores)."""
    pre = recuo * prof
    if prof > max_prof:
        out(f"{pre}...")
        return
    if isinstance(obj, dict):
        for k, v in list(obj.items())[:80]:
            if isinstance(v, (dict, list)):
                desc = f"lista[{len(v)}]" if isinstance(v, list) else "objeto"
                out(f"{pre}{k}: {desc}")
                estrutura(v, prof + 1, max_prof, recuo)
            else:
                out(f"{pre}{k}: {type(v).__name__}{' (vazio)' if v in (None, '', 0) else ''}")
        if len(obj) > 80:
            out(f"{pre}... (+{len(obj) - 80} campos)")
    elif isinstance(obj, list):
        if obj:
            out(f"{pre}[primeiro item]")
            estrutura(obj[0], prof + 1, max_prof, recuo)


def tentar(nome: str, fn):
    try:
        return fn()
    except Exception as e:  # noqa: BLE001 - o relatório precisa registrar qualquer falha
        status = getattr(getattr(e, "response", None), "status_code", None) or getattr(e, "status_code", None)
        out(f"  !! {nome} falhou: {type(e).__name__}{f' (HTTP {status})' if status else ''}: {str(e)[:200]}")
        return None


def salvar_bruto(ativo: bool, nome: str, dados) -> None:
    if not ativo or dados is None:
        return
    BRUTO.mkdir(exist_ok=True)
    caminho = BRUTO / nome
    if isinstance(dados, (bytes, bytearray)):
        caminho.write_bytes(dados)
    else:
        caminho.write_text(json.dumps(dados, ensure_ascii=False, indent=2, default=str), encoding="utf-8")


def tipo_de(a: dict) -> str:
    t = a.get("activityType")
    if isinstance(t, dict):
        return str(t.get("typeKey") or t.get("typeId") or "?")
    return str(t or "?")


def resumo_atividade(a: dict) -> str:
    dist = a.get("distance")
    dur = a.get("duration") or a.get("movingDuration")
    fc = a.get("averageHR")
    km = f"{dist / 1000:.2f} km" if isinstance(dist, (int, float)) and dist else "distância vazia/0"
    mins = f"{dur / 60:.0f} min" if isinstance(dur, (int, float)) and dur else "duração vazia"
    return f"{km} | {mins} | FC média {'presente' if fc else 'ausente'}"


def analisar_fit(dados: bytes) -> None:
    """Abre o ZIP baixado, decodifica o .FIT e mostra o que interessa para musculação."""
    try:
        from garmin_fit_sdk import Decoder, Stream
    except ImportError:
        out("  (garmin-fit-sdk não instalado: pip install garmin-fit-sdk)")
        return
    try:
        z = zipfile.ZipFile(io.BytesIO(dados))
    except zipfile.BadZipFile:
        out("  O download não é um ZIP. Primeiros bytes: " + dados[:12].hex())
        return
    out(f"  Arquivos no ZIP: {[n.split('.')[-1] for n in z.namelist()]}")
    for nome in z.namelist():
        if not nome.lower().endswith(".fit"):
            continue
        decoder = Decoder(Stream.from_byte_array(bytearray(z.read(nome))))
        mensagens, erros = decoder.read()
        if erros:
            out(f"  Erros ao ler o FIT: {[str(e)[:80] for e in erros[:3]]}")
        out("  Mensagens no FIT (tipo: quantidade):")
        for tipo, lista in sorted(mensagens.items(), key=lambda x: -len(x[1])):
            out(f"    {tipo}: {len(lista)}")
        sessoes = mensagens.get("session_mesgs") or []
        if sessoes:
            s0 = sessoes[0]
            out(f"  Sessão: sport={s0.get('sport')} sub_sport={s0.get('sub_sport')} "
                f"distância={'presente' if s0.get('total_distance') else 'vazia/0'} "
                f"séries ativas (num_active_lengths/total_sets)={s0.get('total_sets') or s0.get('num_active_lengths')}")
        titulos = mensagens.get("exercise_title_mesgs") or []
        nomes: dict[tuple, str] = {}
        if titulos:
            out("  Títulos de exercício gravados no relógio (categoria / código -> nome):")
            for t in titulos[:40]:
                nome = texto_limpo(t.get("wkt_step_name"))
                nomes[(str(t.get("exercise_category")), str(t.get("exercise_name")))] = nome
                out(f"    {t.get('exercise_category')} / {t.get('exercise_name')} -> '{nome}'")
        passos = mensagens.get("workout_step_mesgs") or []
        if passos:
            out(f"  Passos do treino no relógio: {len(passos)} (campos: {sorted(str(k) for k in passos[0].keys())[:25]})")
            for ps in passos:
                if ps.get("exercise_category") is not None:
                    out(f"    passo {ps.get('message_index')} | {ps.get('exercise_category')} / {ps.get('exercise_name')} | "
                        f"descrição='{texto_limpo(ps.get('notes'))}' nome='{texto_limpo(ps.get('wkt_step_name'))}'")
        series = mensagens.get("set_mesgs") or []
        if not series:
            out("  >> Nenhuma mensagem de SÉRIE (set_mesgs) no FIT.")
            continue
        ativas = [s for s in series if str(s.get("set_type")).lower() in ("active", "1")]
        out(f"  >> Séries no FIT: {len(series)} no total, {len(ativas)} ativas (o resto é descanso).")
        out(f"  Campos de uma série: {sorted(str(k) for k in series[0].keys() if isinstance(k, str))}")
        out("  Séries ativas (exercício | reps | carga | duração | passo do treino):")
        for s in ativas[:80]:
            cat, sub = primeiro(s.get("category")), primeiro(s.get("category_subtype"))
            nome = nomes.get((str(cat), str(sub))) or ""
            peso = s.get("weight")
            out(f"    {cat} / {sub}{f' ({nome})' if nome else ''} | reps={s.get('repetitions')} | "
                f"carga={peso if peso not in (None, 0) else 'vazia'} | {s.get('duration')}s | passo={s.get('wkt_step_index')}")


def primeiro(v):
    """Alguns campos vêm como lista (ex.: ['shoulder_press']); fica com o primeiro valor."""
    if isinstance(v, (list, tuple)):
        return v[0] if v else None
    return v


def texto_limpo(v) -> str:
    """O nome do exercício às vezes vem numa lista com lixo binário depois; pega o primeiro texto legível."""
    itens = v if isinstance(v, (list, tuple)) else [v]
    for item in itens:
        if isinstance(item, str) and item.strip() and item.isprintable():
            return item.strip()
    return ""


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dias", type=int, default=30, help="quantos dias para trás olhar (padrão 30)")
    ap.add_argument("--salvar-bruto", action="store_true", help="salva as respostas completas em garmin_bruto/ (não mande essa pasta)")
    args = ap.parse_args()

    titulo("1. Conexão")
    try:
        chave = resolve_api_key()
        out("  Chave encontrada (arquivo ou variável de ambiente).")
    except Exception:  # noqa: BLE001
        chave = getpass.getpass("Cole a chave pessoal da API do Garmin (não aparece na tela): ").strip()
        out("  Chave digitada no terminal.")
    with PersonalApiAuthenticator() as auth:
        token = tentar("obter token", lambda: auth.obtain_token(chave))
    if token is None:
        out("  Sem token, não dá para seguir. Confira se a chave foi copiada inteira e se não expirou.")
        return
    out("  Token obtido com sucesso.")

    hoje = date.today()
    inicio = hoje - timedelta(days=args.dias)
    ontem = hoje - timedelta(days=1)

    with GarminPersonalApiClient(token.access_token) as c:
        titulo(f"2. Atividades de {inicio.isoformat()} a {hoje.isoformat()}")
        atividades: list[dict] = []
        pagina = 0
        while True:
            lote = tentar("listar atividades", lambda: c.search_activities(start=pagina * 100, limit=100,
                                                                          start_date=inicio, end_date=hoje))
            if not isinstance(lote, list) or not lote:
                break
            atividades += lote
            if len(lote) < 100:
                break
            pagina += 1
        salvar_bruto(args.salvar_bruto, "atividades.json", atividades)
        out(f"  Total: {len(atividades)}")
        por_tipo = Counter(tipo_de(a) for a in atividades)
        for t, n in por_tipo.most_common():
            out(f"    {t}: {n}")
        if atividades:
            out("  Campos de uma atividade na lista:")
            estrutura(atividades[0], 2, 2)

        exemplos: dict[str, list[dict]] = {}
        for a in atividades:
            exemplos.setdefault(tipo_de(a), []).append(a)

        titulo("3. Por tipo de atividade (até 3 mais recentes de cada)")
        for t, lista in exemplos.items():
            out(f"  [{t}]")
            for a in lista[:3]:
                out(f"    {resumo_atividade(a)}")

        forca = next((lista for t, lista in exemplos.items() if "strength" in t), None)
        titulo("4. Musculação: as séries aparecem? (treino mais recente)")
        if not forca:
            out("  Nenhuma atividade de musculação no período. Rode de novo depois de um treino gravado no relógio.")
        else:
            aid = forca[0].get("activityId")
            detalhe = tentar("detalhe da atividade", lambda: c.get_activity(aid))
            salvar_bruto(args.salvar_bruto, "musculacao_detalhe.json", detalhe)
            if isinstance(detalhe, dict):
                out("  Campos do detalhe:")
                estrutura(detalhe, 2, 4)
            treinos = tentar("treinos da atividade (activity-workouts)", lambda: c.get_activity_workouts(aid))
            salvar_bruto(args.salvar_bruto, "musculacao_workouts.json", treinos)
            out("  Estrutura de activity-workouts:")
            if treinos in (None, [], {}):
                out("    (vazio)")
            else:
                estrutura(treinos, 2, 5)
                lista = treinos if isinstance(treinos, list) else [treinos]
                out("  Passos com exercício (índice | categoria / exercício | descrição):")
                for tr in lista:
                    for i, st in enumerate((tr or {}).get("steps") or []):
                        if st.get("exerciseName") or st.get("exerciseCategory"):
                            out(f"    {st.get('stepIndex', i)} | {st.get('exerciseCategory')} / {st.get('exerciseName')} | "
                                f"descrição='{st.get('notes') or ''}' nome='{st.get('name') or ''}'")
            arquivo = tentar("download do arquivo da atividade", lambda: c.download_activity(aid))
            salvar_bruto(args.salvar_bruto, "musculacao.zip", arquivo)
            if arquivo:
                out(f"  Download: {len(arquivo) // 1024} KB")
                analisar_fit(arquivo)

        indoor = next((lista for t, lista in exemplos.items() if "indoor_cycling" in t or "virtual_ride" in t), None)
        titulo("5. Bike indoor: vem distância?")
        if not indoor:
            out("  Nenhuma bike indoor no período.")
        else:
            for a in indoor[:3]:
                out(f"    {resumo_atividade(a)}")

        corrida = next((lista for t, lista in exemplos.items() if "running" in t), None)
        titulo("6. Corrida: campos que usaríamos")
        if corrida:
            a = corrida[0]
            for campo in ["distance", "duration", "movingDuration", "averageHR", "maxHR", "averageRunningCadenceInStepsPerMinute",
                          "aerobicTrainingEffect", "anaerobicTrainingEffect", "averageSpeed", "elevationGain", "vO2MaxValue"]:
                out(f"    {campo}: {'presente' if a.get(campo) not in (None, 0, '') else 'ausente/0'}")
        else:
            out("  Nenhuma corrida no período.")

        titulo(f"7. Saúde ({ontem.isoformat()}): só os nomes dos campos")
        for nome, fn in [
            ("sono", lambda: c.get_daily_sleep(ontem)),
            ("HRV", lambda: c.get_daily_hrv(ontem)),
            ("Body Battery (7 dias)", lambda: c.get_daily_body_battery(ontem - timedelta(days=6), ontem)),
            ("resumo diário", lambda: c.get_daily_summaries(ontem, ontem)),
        ]:
            dados = tentar(nome, fn)
            salvar_bruto(args.salvar_bruto, f"saude_{nome.split()[0].lower()}.json", dados)
            out(f"  [{nome}]")
            if dados in (None, [], {}):
                out("    (vazio)")
            else:
                estrutura(dados, 2, 5)

    SAIDA.write_text("\n".join(linhas), encoding="utf-8")
    print()
    print(f"Relatório salvo em: {SAIDA}")
    print("Mande esse arquivo no chat. Ele não tem a chave, o token nem seus dados de saúde.")
    if args.salvar_bruto:
        print(f"As respostas completas ficaram em {BRUTO} (só para você; não mande).")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nCancelado.")
    except Exception:  # noqa: BLE001
        traceback.print_exc()
        SAIDA.write_text("\n".join(linhas) + "\n\nERRO:\n" + traceback.format_exc(limit=3), encoding="utf-8")
        print(f"\nDeu erro, mas o relatório parcial ficou em {SAIDA}. Pode mandar ele.")
