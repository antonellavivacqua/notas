const cursosDiv = document.getElementById("cursos");
const alumnosDiv = document.getElementById("alumnos-contenido");
const detalleDiv = document.getElementById("detalle");
const buscador = document.getElementById("buscador");

let cursoActual = null;                    // curso que se está explorando
let seleccion = { curso: null, id: null }; // alumno activo
let temporizador = null;                   // debounce del buscador
let ultimaBusqueda = 0;                    // evita respuestas viejas del buscador
let tokenDetalle = 0;                      // evita que una ficha vieja pise a una nueva
let alumnosCurso = [];                     // lista del curso cargado
let alumnosCursoNombre = null;
let soloPendientes = false;                // filtro "solo con pendientes"

const TEXTO_INICIAL = "<h2>Seleccione un curso</h2>";

const CAMPOS_NOTAS = [
    "primer_bimestre",
    "segundo_bimestre",
    "nota_primer_cuatrimestre",
    "tercer_bimestre",
    "cuarto_bimestre",
    "nota_segundo_cuatrimestre",
    "primer_cierre",
    "segundo_cierre",
    "tercer_cierre"
];

const CAMPOS_CUATRIMESTRE = new Set([
    "nota_primer_cuatrimestre",
    "nota_segundo_cuatrimestre"
]);


/* ===== Tema claro / oscuro ===== */

const temaBtn = document.getElementById("tema-toggle");
const TEMA_KEY = "tema";
const prefiereOscuro = window.matchMedia("(prefers-color-scheme: dark)");

function temaGuardado() {
    try {
        return localStorage.getItem(TEMA_KEY);
    } catch (e) {
        return null;
    }
}

function aplicarTema(tema) {

    const raiz = document.documentElement;

    // Apaga las transiciones un instante para que todo cambie de tema a la vez
    raiz.classList.add("sin-transiciones");

    raiz.setAttribute("data-theme", tema);

    requestAnimationFrame(() =>
        requestAnimationFrame(() => raiz.classList.remove("sin-transiciones"))
    );

    const oscuro = tema === "dark";

    temaBtn.textContent = oscuro ? "☀️" : "🌙";

    const etiqueta = oscuro
        ? "Cambiar a modo claro"
        : "Cambiar a modo oscuro";

    temaBtn.setAttribute("aria-label", etiqueta);
    temaBtn.title = etiqueta;
}

function temaInicial() {

    const guardado = temaGuardado();

    if (guardado === "light" || guardado === "dark") {
        return guardado;
    }

    return prefiereOscuro.matches ? "dark" : "light";
}

temaBtn.addEventListener("click", () => {

    const actual = document.documentElement.getAttribute("data-theme");
    const nuevo = actual === "dark" ? "light" : "dark";

    aplicarTema(nuevo);

    try {
        localStorage.setItem(TEMA_KEY, nuevo);
    } catch (e) {}
});

// Si el usuario nunca eligió un tema, acompaña los cambios del sistema
prefiereOscuro.addEventListener("change", e => {
    if (!temaGuardado()) {
        aplicarTema(e.matches ? "dark" : "light");
    }
});

aplicarTema(temaInicial());


/* ===== Utilidades ===== */

// Escapa texto antes de meterlo en innerHTML
function esc(texto) {
    return String(texto ?? "").replace(/[&<>"']/g, c => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    }[c]));
}

// "7", 7 o "7,5" -> número. Cualquier otra cosa -> null
function aNota(valor) {

    if (valor === null || valor === undefined || valor === "") return null;

    const n = parseFloat(String(valor).replace(",", "."));

    return Number.isFinite(n) && n >= 1 && n <= 10 ? n : null;
}

// Clase de color según la nota: verde / rojo / gris
function claseNota(valor, minima) {

    const n = aNota(valor);

    if (n === null) return "nota-vacia";

    return n >= minima ? "nota-ok" : "nota-bad";
}

// 7.25 -> "7,3"
function fmt(n) {

    if (n === null || n === undefined) return "–";

    return n.toLocaleString("es-AR", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1
    });
}

function celdaNota(valor, campo, minima) {

    const n = aNota(valor);

    const clases = [
        claseNota(valor, minima),
        CAMPOS_CUATRIMESTRE.has(campo) ? "col-cuat" : ""
    ].join(" ").trim();

    return `<td class="${clases}">${n === null ? "–" : esc(valor)}</td>`;
}

function mostrarInicio() {

    detalleDiv.innerHTML = `
        <div class="estado-vacio">
            <span class="estado-icono">🎓</span>
            <p>Elegí un curso para ver su resumen,<br>
               o buscá un alumno por nombre.</p>
        </div>
    `;
}


/* ===== Cursos ===== */

async function cargarCursos() {

    const response = await fetch("/api/cursos");
    const cursos = await response.json();

    cursosDiv.innerHTML = "<h2>Cursos</h2>";

    const grupos = {
        "📚 Ciclo Básico": [],
        "💻 Computación": [],
        "🔧 Automotor": [],
        "📁 Otros": []
    };

    cursos.forEach(curso => {

        const nombre = curso.toUpperCase();

        // 1° y 2°
        if (
            nombre.startsWith("1°") ||
            nombre.startsWith("2°")
        ) {
            grupos["📚 Ciclo Básico"].push(curso);
        }

        // Cursos con orientación Computación
        else if (nombre.includes("C")) {
            grupos["💻 Computación"].push(curso);
        }

        // Cursos con orientación Automotor
        else if (nombre.includes("A")) {
            grupos["🔧 Automotor"].push(curso);
        }

        else {
            grupos["📁 Otros"].push(curso);
        }
    });

    for (const categoria in grupos) {

        if (grupos[categoria].length === 0)
            continue;

        const titulo = document.createElement("div");

        titulo.className = "categoria";

        titulo.textContent = categoria;

        cursosDiv.appendChild(titulo);

        grupos[categoria].forEach(curso => {

            const boton = document.createElement("button");

            boton.className = "curso-btn";

            boton.textContent = curso;

            boton.dataset.curso = curso;

            boton.onclick = () => {
                buscador.value = "";       // limpia el buscador
                cargarAlumnos(curso);
            };

            cursosDiv.appendChild(boton);
        });
    }

    marcarActivo();
}


/* ===== Lista de alumnos de un curso ===== */

async function cargarAlumnos(curso, limpiarDetalle = true) {

    cursoActual = curso;

    if (limpiarDetalle) {
        seleccion = { curso: null, id: null };
        cargarResumenCurso(curso);           // el detalle muestra el resumen del curso
    }

    let alumnos;

    try {
        const response =
            await fetch(`/api/curso/${encodeURIComponent(curso)}`);

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        alumnos = await response.json();

    } catch (error) {

        console.error("Error al cargar alumnos:", error);

        alumnosDiv.innerHTML = "<h2>Error</h2>";
        alumnosDiv.insertAdjacentHTML(
            "beforeend",
            '<p class="sin-resultados">No se pudo cargar la lista de alumnos.</p>'
        );
        return;
    }

    // Si eligió otro curso mientras tanto, o empezó a buscar, no pisar la vista
    if (curso !== cursoActual) return;
    if (!limpiarDetalle && buscador.value.trim() !== "") return;

    alumnosCurso = alumnos;
    alumnosCursoNombre = curso;

    dibujarListaAlumnos();
}

function etiquetaAlumnos(n) {
    return `${n} ${n === 1 ? "alumno" : "alumnos"}`;
}

function dibujarListaAlumnos(enfocarFiltro = false) {

    const lista = soloPendientes
        ? alumnosCurso.filter(a => a.pendientes > 0)
        : alumnosCurso;

    alumnosDiv.innerHTML = "";

    // Título
    const titulo = document.createElement("h2");
    titulo.textContent = alumnosCursoNombre;
    alumnosDiv.appendChild(titulo);

    // Barra: contador + filtro
    const barra = document.createElement("div");
    barra.className = "lista-toolbar";

    const contador = document.createElement("span");
    contador.className = "contador";
    contador.textContent = soloPendientes
        ? `${lista.length} de ${etiquetaAlumnos(alumnosCurso.length)}`
        : etiquetaAlumnos(alumnosCurso.length);

    const etiqueta = document.createElement("label");
    etiqueta.className = "filtro-check";

    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = soloPendientes;

    check.addEventListener("change", () => {
        soloPendientes = check.checked;
        dibujarListaAlumnos(true);
    });

    etiqueta.append(check, " Solo con pendientes");
    barra.append(contador, etiqueta);
    alumnosDiv.appendChild(barra);

    // Lista
    if (lista.length === 0) {

        const p = document.createElement("p");
        p.className = "sin-resultados";
        p.textContent = "Ningún alumno con pendientes en este curso.";
        alumnosDiv.appendChild(p);

    } else {

        const grid = document.createElement("div");
        grid.className = "alumnos-grid";

        lista.forEach(alumno => {

            const item = document.createElement("div");

            item.className = "alumno-item";
            item.textContent = alumno.nombre;
            item.title = alumno.nombre;

            item.dataset.curso = alumnosCursoNombre;
            item.dataset.id = String(alumno.id);

            if (alumno.pendientes > 0) {
                item.classList.add("con-pendientes");
                item.title = `${alumno.nombre} — ${alumno.pendientes} ` +
                    (alumno.pendientes === 1 ? "materia pendiente" : "materias pendientes");
            }

            item.onclick = () => cargarAlumno(alumnosCursoNombre, alumno.id);

            grid.appendChild(item);
        });

        alumnosDiv.appendChild(grid);
    }

    marcarActivo();

    if (enfocarFiltro) check.focus();
}


/* ===== Resumen del curso (panel de detalle) ===== */

async function cargarResumenCurso(curso) {

    const token = ++tokenDetalle;

    detalleDiv.innerHTML = '<p class="estado-vacio">Cargando resumen...</p>';

    try {
        const response =
            await fetch(`/api/curso/${encodeURIComponent(curso)}/resumen`);

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const resumen = await response.json();

        if (token !== tokenDetalle) return;

        detalleDiv.innerHTML = htmlResumen(resumen);

    } catch (error) {

        if (token !== tokenDetalle) return;

        console.error("Error al cargar el resumen:", error);

        detalleDiv.innerHTML =
            '<p class="estado-vacio">No se pudo cargar el resumen del curso.</p>';
    }
}

function htmlResumen(r) {

    const min = r.nota_aprobacion;

    const porcentaje = r.cantidad_alumnos
        ? Math.round(r.con_pendientes * 100 / r.cantidad_alumnos)
        : 0;

    const barras = r.materias.map(m => `
        <div class="barra-fila">
            <span class="barra-nombre" title="${esc(m.nombre)}">${esc(m.nombre)}</span>
            <div class="barra-pista">
                <div class="barra-relleno ${claseNota(m.promedio, min)}"
                     style="width: ${(m.promedio ?? 0) * 10}%"></div>
            </div>
            <span class="barra-valor ${claseNota(m.promedio, min)}">${fmt(m.promedio)}</span>
        </div>
    `).join("");

    return `
        <div class="ficha-head">
            <div>
                <h2>${esc(r.curso)}</h2>
                <p class="ficha-sub">Resumen del curso</p>
            </div>
            <button type="button" class="btn-imprimir no-imprimir"
                    data-imprimir data-titulo="Resumen ${esc(r.curso)}">
                🖨 Imprimir / PDF
            </button>
        </div>

        <p class="solo-impresion">
            Sistema de Gestión de Calificaciones · Emitido el
            ${new Date().toLocaleDateString("es-AR")}
        </p>

        <div class="kpis">

            <div class="kpi">
                <span class="kpi-label">Alumnos</span>
                <span class="kpi-valor">${r.cantidad_alumnos}</span>
            </div>

            <div class="kpi">
                <span class="kpi-label">Con pendientes</span>
                <span class="kpi-valor ${r.con_pendientes ? "nota-bad" : "nota-ok"}">${r.con_pendientes}</span>
                <span class="kpi-nota">${porcentaje}% del curso</span>
            </div>

            <div class="kpi">
                <span class="kpi-label">Promedio del curso</span>
                <span class="kpi-valor ${claseNota(r.promedio_general, min)}">${fmt(r.promedio_general)}</span>
                <span class="kpi-nota">
                    1° cuat. ${fmt(r.promedio_primer_cuatrimestre)} ·
                    2° cuat. ${fmt(r.promedio_segundo_cuatrimestre)}
                </span>
            </div>

            <div class="kpi">
                <span class="kpi-label">Con materias desaprobadas</span>
                <span class="kpi-valor ${r.con_desaprobadas ? "nota-bad" : "nota-ok"}">${r.con_desaprobadas}</span>
                <span class="kpi-nota">en algún cuatrimestre</span>
            </div>

        </div>

        <h3 class="seccion-titulo">Promedio por materia (de menor a mayor)</h3>

        <div class="barras">${barras}</div>

        <p class="nota-pie">
            Promedios calculados con las notas de 1° y 2° cuatrimestre.
            Se considera aprobada una nota igual o mayor a ${min}.
        </p>

        <p class="estado-pista no-imprimir">
            Elegí un alumno de la lista para ver su ficha completa.
        </p>
    `;
}


/* ===== Ficha del alumno ===== */

// Mini gráfico de evolución por bimestre (SVG en línea)
function sparkline(materia, minima) {

    const etiquetas = ["1° Bim", "2° Bim", "3° Bim", "4° Bim"];

    const valores = [
        materia.primer_bimestre,
        materia.segundo_bimestre,
        materia.tercer_bimestre,
        materia.cuarto_bimestre
    ].map(aNota);

    if (valores.filter(v => v !== null).length < 2) return "";

    const W = 120, H = 40, PX = 8, PY = 6;
    const ESCALA_MIN = 3, ESCALA_MAX = 10;

    const x = i => PX + i * ((W - 2 * PX) / 3);

    const y = v => {
        const t = (ESCALA_MAX - Math.max(v, ESCALA_MIN)) / (ESCALA_MAX - ESCALA_MIN);
        return PY + t * (H - 2 * PY);
    };

    const linea = valores
        .map((v, i) => v === null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`)
        .filter(Boolean)
        .join(" ");

    const yMin = y(minima).toFixed(1);

    const puntos = valores.map((v, i) => v === null ? "" : `
        <circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3"
                class="${v >= minima ? "punto-ok" : "punto-bad"}">
            <title>${etiquetas[i]}: ${v}</title>
        </circle>
    `).join("");

    return `
        <svg class="spark" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"
             role="img" aria-label="Evolución de las notas por bimestre">
            <line class="spark-min" x1="${PX}" x2="${W - PX}" y1="${yMin}" y2="${yMin}"/>
            <polyline class="spark-linea" points="${linea}"/>
            ${puntos}
        </svg>
    `;
}

function tarjetaMateria(nombre, materia, promedio, minima) {

    const chip = promedio === null || promedio === undefined
        ? ""
        : `<span class="prom-chip ${claseNota(promedio, minima)}">Prom. ${fmt(promedio)}</span>`;

    const celdas = CAMPOS_NOTAS
        .map(campo => celdaNota(materia[campo], campo, minima))
        .join("");

    return `
        <div class="materia-card">

            <div class="materia-head">
                <h3>${esc(nombre)}</h3>
                <div class="materia-meta">
                    ${chip}
                    ${sparkline(materia, minima)}
                </div>
            </div>

            <table class="tabla-notas">

                <thead>

                    <tr>
                        <th colspan="3" class="grupo-cuatrimestre">1° Cuatrimestre</th>
                        <th colspan="3" class="grupo-cuatrimestre">2° Cuatrimestre</th>
                        <th colspan="3" class="grupo-cierres">Cierres</th>
                    </tr>

                    <tr>
                        <th>1° Bim</th>
                        <th>2° Bim</th>
                        <th>Nota Cuat.</th>

                        <th>3° Bim</th>
                        <th>4° Bim</th>
                        <th>Nota Cuat.</th>

                        <th>1°</th>
                        <th>2°</th>
                        <th>3°</th>
                    </tr>

                </thead>

                <tbody>
                    <tr>${celdas}</tr>
                </tbody>

            </table>

        </div>
    `;
}

function htmlFicha(alumno, curso) {

    const a = alumno.analisis;
    const min = a.nota_aprobacion;

    const pendientes = a.pendientes.length
        ? `
            <div class="pendientes-box">
                <span class="pendientes-titulo">⚠ Materias pendientes (${a.pendientes.length})</span>
                <div class="pendientes-lista">
                    ${a.pendientes.map(p => `<span class="pendiente-tag">${esc(p)}</span>`).join("")}
                </div>
            </div>
        `
        : `
            <div class="pendientes-box sin-pendientes">
                <span class="pendientes-titulo">✓ Sin materias pendientes</span>
            </div>
        `;

    const desaprobadas = a.materias_desaprobadas.length;

    const tarjetas = Object.keys(alumno.materias)
        .map(nombre => tarjetaMateria(
            nombre,
            alumno.materias[nombre],
            a.promedios_materias[nombre],
            min
        ))
        .join("");

    return `
        <div class="ficha-head">
            <div>
                <h2>${esc(alumno.nombre)}</h2>
                <p class="ficha-sub">N° ${esc(alumno.id)} · Curso ${esc(curso)}</p>
            </div>
            <button type="button" class="btn-imprimir no-imprimir"
                    data-imprimir data-titulo="Calificaciones ${esc(alumno.nombre)}">
                🖨 Imprimir / PDF
            </button>
        </div>

        <p class="solo-impresion">
            Sistema de Gestión de Calificaciones · Emitido el
            ${new Date().toLocaleDateString("es-AR")}
        </p>

        ${pendientes}

        <div class="kpis">

            <div class="kpi">
                <span class="kpi-label">Promedio general</span>
                <span class="kpi-valor ${claseNota(a.promedio_general, min)}">${fmt(a.promedio_general)}</span>
            </div>

            <div class="kpi">
                <span class="kpi-label">1° Cuatrimestre</span>
                <span class="kpi-valor ${claseNota(a.promedio_primer_cuatrimestre, min)}">${fmt(a.promedio_primer_cuatrimestre)}</span>
            </div>

            <div class="kpi">
                <span class="kpi-label">2° Cuatrimestre</span>
                <span class="kpi-valor ${claseNota(a.promedio_segundo_cuatrimestre, min)}">${fmt(a.promedio_segundo_cuatrimestre)}</span>
            </div>

            <div class="kpi">
                <span class="kpi-label">Materias desaprobadas</span>
                <span class="kpi-valor ${desaprobadas ? "nota-bad" : "nota-ok"}">${desaprobadas}</span>
                <span class="kpi-nota">${desaprobadas
                    ? esc(a.materias_desaprobadas.join(", "))
                    : "Ninguna en los cuatrimestres"}</span>
            </div>

        </div>

        ${tarjetas}

        <p class="nota-pie">
            Promedios calculados con las notas de 1° y 2° cuatrimestre.
            Verde: aprobada (${min} o más) · Rojo: desaprobada.
        </p>
    `;
}

async function cargarAlumno(curso, idAlumno) {

    seleccion = { curso: curso, id: String(idAlumno) };
    marcarActivo();

    const token = ++tokenDetalle;

    try {
        const response =
            await fetch(`/api/alumno/${encodeURIComponent(curso)}/${idAlumno}`);

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const alumno = await response.json();

        if (token !== tokenDetalle) return;

        detalleDiv.innerHTML = htmlFicha(alumno, curso);

    } catch (error) {

        if (token !== tokenDetalle) return;

        console.error("Error al cargar el alumno:", error);

        detalleDiv.innerHTML =
            '<p class="estado-vacio">No se pudo cargar la ficha del alumno.</p>';
    }
}


/* ===== Imprimir / guardar como PDF ===== */

function imprimir(titulo) {

    const tituloOriginal = document.title;

    if (titulo) document.title = titulo;    // el nombre sugerido del PDF

    window.addEventListener(
        "afterprint",
        () => { document.title = tituloOriginal; },
        { once: true }
    );

    window.print();
}

detalleDiv.addEventListener("click", e => {

    const boton = e.target.closest("[data-imprimir]");

    if (boton) imprimir(boton.dataset.titulo);
});


/* ===== Selección activa ===== */

// Resalta el alumno activo y el curso que se está explorando
function marcarActivo() {

    document.querySelectorAll(".alumno-item").forEach(el => {
        el.classList.toggle(
            "activo",
            el.dataset.curso === seleccion.curso &&
            el.dataset.id === seleccion.id
        );
    });

    document.querySelectorAll(".curso-btn").forEach(btn => {
        btn.classList.toggle("activo", btn.dataset.curso === cursoActual);
    });
}


/* ===== Buscador global ===== */

// Vuelve al estado normal cuando el buscador queda vacío
function restaurarVista() {

    if (!cursoActual) {
        alumnosDiv.innerHTML = TEXTO_INICIAL;
        return;
    }

    if (alumnosCursoNombre === cursoActual) {
        dibujarListaAlumnos();                 // ya está en memoria
    } else {
        cargarAlumnos(cursoActual, false);     // no borra el detalle abierto
    }
}

// Muestra un mensaje simple en el panel de alumnos
function mostrarMensajeBusqueda(mensaje) {

    alumnosDiv.innerHTML = "<h2>Resultados</h2>";

    const p = document.createElement("p");
    p.className = "sin-resultados";
    p.textContent = mensaje;

    alumnosDiv.appendChild(p);
}

async function buscarAlumnos(texto) {

    const idBusqueda = ++ultimaBusqueda;

    mostrarMensajeBusqueda("Buscando...");

    try {
        const response =
            await fetch(`/api/alumnos/buscar?q=${encodeURIComponent(texto)}`);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const resultados = await response.json();

        // si el usuario siguió escribiendo o vació el campo, se descarta
        if (idBusqueda !== ultimaBusqueda) return;

        mostrarResultados(resultados);

    } catch (error) {

        if (idBusqueda !== ultimaBusqueda) return;

        console.error("Error en la búsqueda:", error);

        mostrarMensajeBusqueda(
            "No se pudo realizar la búsqueda. Revisá que el servidor esté activo."
        );
    }
}

function mostrarResultados(resultados) {

    alumnosDiv.innerHTML = `<h2>Resultados (${resultados.length})</h2>`;

    if (resultados.length === 0) {
        const p = document.createElement("p");
        p.className = "sin-resultados";
        p.textContent = "No se encontraron alumnos.";
        alumnosDiv.appendChild(p);
        return;
    }

    const grid = document.createElement("div");
    grid.className = "alumnos-grid resultados";

    resultados.forEach(a => {

        const item = document.createElement("div");
        item.className = "alumno-item resultado";
        item.dataset.curso = a.curso;
        item.dataset.id = String(a.id);
        item.title = `${a.nombre} - ${a.curso}`;

        if (a.pendientes > 0) item.classList.add("con-pendientes");

        const nombre = document.createElement("span");
        nombre.className = "alumno-nombre";
        nombre.textContent = a.nombre;

        const curso = document.createElement("span");
        curso.className = "alumno-curso";
        curso.textContent = a.curso;

        item.append(nombre, curso);

        item.onclick = () => {
            cursoActual = a.curso;           // al vaciar, vuelve a este curso
            cargarAlumno(a.curso, a.id);     // carga la ficha y marca activo
        };

        grid.appendChild(item);
    });

    alumnosDiv.appendChild(grid);

    marcarActivo();
}

function procesarBusqueda() {

    clearTimeout(temporizador);
    ultimaBusqueda++;                       // invalida búsquedas en curso

    const texto = buscador.value.trim();    // siempre lee el valor actual

    // 1) Vacío -> vista normal
    if (texto === "") {
        restaurarVista();
        return;
    }

    // 2) Muy corto -> aviso
    if (texto.length < 2) {
        mostrarMensajeBusqueda("Escribí al menos 2 letras...");
        return;
    }

    // 3) 2 o más letras -> buscar tras el debounce
    temporizador = setTimeout(() => buscarAlumnos(texto), 250);
}

buscador.addEventListener("input", procesarBusqueda);
buscador.addEventListener("search", procesarBusqueda);


/* ===== Inicio ===== */

mostrarInicio();
cargarCursos();