import pandas as pd
import json
import os

ARCHIVO_EXCEL = "CALIFICACIONES.xlsx"
ARCHIVO_JSON = "data/escuela.json"

INICIO_MATERIAS = 4
COLUMNAS_POR_MATERIA = 9

os.makedirs("data", exist_ok=True)

resultado = {}

xls = pd.ExcelFile(ARCHIVO_EXCEL)

for nombre_hoja in xls.sheet_names:

    df = pd.read_excel(
        ARCHIVO_EXCEL,
        sheet_name=nombre_hoja,
        header=None
    )

    curso = {
        "curso": nombre_hoja,
        "alumnos": []
    }

    materias = []

    fila_materias = 2

    col = INICIO_MATERIAS

    while col < len(df.columns):

        nombre_materia = df.iloc[fila_materias, col]

        if pd.isna(nombre_materia):
            break

        materias.append({
            "nombre": str(nombre_materia).strip(),
            "col_inicio": col
        })

        col += COLUMNAS_POR_MATERIA

    for fila in range(4, len(df)):

        numero = df.iloc[fila, 1]
        nombre = df.iloc[fila, 2]

        if pd.isna(nombre):
            continue

        nombre = str(nombre).strip()

        if nombre == "":
            continue

        if "APELLIDO" in nombre.upper():
            continue

        pendientes = df.iloc[fila, 3]

        if pd.isna(pendientes):
            pendientes = ""
        else:
            pendientes = str(pendientes).strip()

        alumno = {
            "id": str(numero),
            "nombre": nombre,
            "pendientes": pendientes,
            "materias": {}
        }

        for materia in materias:

            c = materia["col_inicio"]

            alumno["materias"][materia["nombre"]] = {
                "primer_bimestre": df.iloc[fila, c],
                "segundo_bimestre": df.iloc[fila, c + 1],
                "nota_primer_cuatrimestre": df.iloc[fila, c + 2],

                "tercer_bimestre": df.iloc[fila, c + 3],
                "cuarto_bimestre": df.iloc[fila, c + 4],
                "nota_segundo_cuatrimestre": df.iloc[fila, c + 5],

                "primer_cierre": df.iloc[fila, c + 6],
                "segundo_cierre": df.iloc[fila, c + 7],
                "tercer_cierre": df.iloc[fila, c + 8]
            }

        curso["alumnos"].append(alumno)

    resultado[nombre_hoja] = curso

with open(
    ARCHIVO_JSON,
    "w",
    encoding="utf-8"
) as archivo:

    json.dump(
        resultado,
        archivo,
        ensure_ascii=False,
        indent=4,
        default=str
    )

print("JSON generado correctamente.")