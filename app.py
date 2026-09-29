from flask import Flask, jsonify, render_template, request
import json
import os
import unicodedata

app = Flask(
    __name__,
    static_folder="static",
    template_folder="templates"
)

JSON_FILE = os.path.join("data", "escuela.json")

# Nota mínima para considerar aprobada una materia (cambiar si la escuela usa otra)
NOTA_APROBACION = 6


# ----------------------------------------------------------------------
# Utilidades
# ----------------------------------------------------------------------

def cargar_datos():
    if not os.path.exists(JSON_FILE):
        return {}

    with open(JSON_FILE, "r", encoding="utf-8") as archivo:
        return json.load(archivo)


def normalizar(texto):
    """Minúsculas y sin tildes: 'Pérez' -> 'perez'."""
    texto = unicodedata.normalize("NFD", str(texto))
    texto = "".join(c for c in texto if unicodedata.category(c) != "Mn")
    return texto.lower().strip()


def a_nota(valor):
    """Convierte '7', 7 o '7,5' en float. Devuelve None si no es una nota válida."""
    if valor is None:
        return None

    try:
        nota = float(str(valor).strip().replace(",", "."))
    except ValueError:
        return None

    if nota != nota or not (1 <= nota <= 10):   # NaN o fuera de escala
        return None

    return nota


def media(notas):
    """Promedio de una lista de notas (ignora los None). None si no hay notas."""
    notas = [n for n in notas if n is not None]

    if not notas:
        return None

    return round(sum(notas) / len(notas), 2)


def parsear_pendientes(texto):
    """
    '2, Inglés 2°, Física 3°' -> ['Inglés 2°', 'Física 3°']
    '-' o vacío              -> []
    """
    texto = str(texto or "").strip()

    if texto.lower() in ("", "-", "0", "no", "ninguna", "ninguno"):
        return []

    partes = [p.strip() for p in texto.split(",") if p.strip()]

    # el primer elemento suele ser la cantidad ("2, Materia A, Materia B")
    if partes and partes[0].isdigit():
        partes = partes[1:]

    return partes


def notas_cuatrimestre(materia):
    """Devuelve (nota 1° cuatrimestre, nota 2° cuatrimestre) como floats o None."""
    return (
        a_nota(materia.get("nota_primer_cuatrimestre")),
        a_nota(materia.get("nota_segundo_cuatrimestre"))
    )


def analizar_alumno(alumno):
    """
    Calcula promedios y alertas de un alumno.

    - Promedio de una materia: promedio de sus notas de 1° y 2° cuatrimestre.
    - Promedio por cuatrimestre: promedio de esa nota en todas las materias.
    - Promedio general: promedio de todas las notas de cuatrimestre.
    - Materia desaprobada: alguna nota de cuatrimestre menor a NOTA_APROBACION.
    """
    promedios_materias = {}
    materias_desaprobadas = []
    notas_1 = []
    notas_2 = []

    for nombre, materia in alumno.get("materias", {}).items():

        n1, n2 = notas_cuatrimestre(materia)

        if n1 is not None:
            notas_1.append(n1)

        if n2 is not None:
            notas_2.append(n2)

        propias = [n for n in (n1, n2) if n is not None]

        promedios_materias[nombre] = media(propias)

        if any(n < NOTA_APROBACION for n in propias):
            materias_desaprobadas.append(nombre)

    return {
        "nota_aprobacion": NOTA_APROBACION,
        "pendientes": parsear_pendientes(alumno.get("pendientes")),
        "promedio_general": media(notas_1 + notas_2),
        "promedio_primer_cuatrimestre": media(notas_1),
        "promedio_segundo_cuatrimestre": media(notas_2),
        "promedios_materias": promedios_materias,
        "materias_desaprobadas": materias_desaprobadas
    }


# ----------------------------------------------------------------------
# Rutas
# ----------------------------------------------------------------------

@app.route("/")
def inicio():
    return render_template("index.html")


@app.route("/api/cursos")
def obtener_cursos():

    datos = cargar_datos()

    cursos = list(datos.keys())

    return jsonify(cursos)


@app.route("/api/curso/<curso>")
def obtener_alumnos(curso):

    datos = cargar_datos()

    if curso not in datos:
        return jsonify([])

    alumnos = []

    for alumno in datos[curso]["alumnos"]:

        alumnos.append({
            "id": alumno["id"],
            "nombre": alumno["nombre"],
            # cantidad de materias pendientes (0 = ninguna)
            "pendientes": len(parsear_pendientes(alumno.get("pendientes")))
        })

    return jsonify(alumnos)


@app.route("/api/curso/<curso>/resumen")
def resumen_curso(curso):

    datos = cargar_datos()

    if curso not in datos:
        return jsonify({
            "error": "Curso no encontrado"
        }), 404

    alumnos = datos[curso]["alumnos"]

    notas_por_materia = {}
    notas_1 = []
    notas_2 = []
    con_pendientes = 0
    con_desaprobadas = 0

    for alumno in alumnos:

        analisis = analizar_alumno(alumno)

        if analisis["pendientes"]:
            con_pendientes += 1

        if analisis["materias_desaprobadas"]:
            con_desaprobadas += 1

        for nombre, materia in alumno.get("materias", {}).items():

            n1, n2 = notas_cuatrimestre(materia)

            lista = notas_por_materia.setdefault(nombre, [])

            if n1 is not None:
                lista.append(n1)
                notas_1.append(n1)

            if n2 is not None:
                lista.append(n2)
                notas_2.append(n2)

    materias = [
        {"nombre": nombre, "promedio": media(notas)}
        for nombre, notas in notas_por_materia.items()
    ]

    # de menor a mayor promedio (las materias más flojas primero)
    materias.sort(key=lambda m: (m["promedio"] is None, m["promedio"] or 0))

    return jsonify({
        "curso": curso,
        "nota_aprobacion": NOTA_APROBACION,
        "cantidad_alumnos": len(alumnos),
        "con_pendientes": con_pendientes,
        "con_desaprobadas": con_desaprobadas,
        "promedio_general": media(notas_1 + notas_2),
        "promedio_primer_cuatrimestre": media(notas_1),
        "promedio_segundo_cuatrimestre": media(notas_2),
        "materias": materias
    })


@app.route("/api/alumno/<curso>/<id_alumno>")
def obtener_alumno(curso, id_alumno):

    datos = cargar_datos()

    if curso not in datos:
        return jsonify({
            "error": "Curso no encontrado"
        }), 404

    for alumno in datos[curso]["alumnos"]:

        if str(alumno["id"]) == str(id_alumno):

            resultado = dict(alumno)
            resultado["analisis"] = analizar_alumno(alumno)

            return jsonify(resultado)

    return jsonify({
        "error": "Alumno no encontrado"
    }), 404


@app.route("/api/alumnos/buscar")
def buscar_alumnos():

    q = normalizar(request.args.get("q", ""))

    if len(q) < 2:
        return jsonify([])

    palabras = q.split()          # "juan perez" -> ["juan", "perez"]
    datos = cargar_datos()
    resultados = []

    for nombre_curso, curso in datos.items():

        for alumno in curso.get("alumnos", []):

            nombre_normalizado = normalizar(alumno.get("nombre", ""))

            # todas las palabras deben aparecer, en cualquier orden
            if all(p in nombre_normalizado for p in palabras):

                resultados.append({
                    "id": alumno["id"],
                    "nombre": alumno["nombre"],
                    "curso": nombre_curso,
                    "pendientes": len(parsear_pendientes(alumno.get("pendientes")))
                })

    resultados.sort(key=lambda a: normalizar(a["nombre"]))

    return jsonify(resultados[:100])


# SIEMPRE al final del archivo
if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=5000,
        debug=True
    )