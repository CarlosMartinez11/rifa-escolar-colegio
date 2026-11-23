"use strict";

const STORAGE_KEY = "rifa_escolar_v2";
const DEFAULT_PASSWORD = "RifaLCRR1972";
const SUPABASE_URL = "https://nqsaxfqwuiqvcomiltjq.supabase.co";
const SUPABASE_KEY = "sb_publishable_BtXcvyOe2Q2e96MAhCaK8A_OmJxPvKi";
const SUPABASE_TABLE = "rifa_estado";
const SUPABASE_ROW_ID = "rifa-principal";

const estadoInicial = {
  password: DEFAULT_PASSWORD,
  nombreColegio: "Liceo Carl Ransom Rogers",
  logo: "",
  config: { min: 1, max: 2840, numPremios: 30, premios: [] },
  boletos: [],
  resultadosLoteria: [],
  nombreSorteo: "",
  ganadores: [],
  ajustesAsignacion: [],
  diagnosticoGanadores: []
};

let state = structuredClone(estadoInicial);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatearNumero(numero) {
  const valor = Number(numero);
  return Number.isFinite(valor) ? String(valor).padStart(4, "0").slice(-4) : "----";
}

function numeroValido(value) {
  return /^\d{1,4}$/.test(String(value).trim()) && Number(value) >= 0 && Number(value) <= 9999;
}

function mostrarToast(mensaje) {
  const toast = document.getElementById("toast");
  toast.textContent = mensaje;
  toast.classList.remove("hidden");
  clearTimeout(mostrarToast.timer);
  mostrarToast.timer = setTimeout(() => toast.classList.add("hidden"), 3200);
}

function normalizarEstado(data) {
  const merge = { ...structuredClone(estadoInicial), ...(data || {}) };
  if (typeof merge.password !== "string" || !merge.password.trim()) {
    merge.password = DEFAULT_PASSWORD;
  }
  if (merge.password === "rifa2026") {
    merge.password = DEFAULT_PASSWORD;
  }
  merge.config = { ...estadoInicial.config, ...(merge.config || {}) };
  merge.config.min = Number.isInteger(Number(merge.config.min)) ? Number(merge.config.min) : 1;
  merge.config.max = Number.isInteger(Number(merge.config.max)) ? Number(merge.config.max) : 2840;
  merge.config.numPremios = Math.max(1, Number(merge.config.numPremios) || 30);
  if (!Array.isArray(merge.config.premios) || merge.config.premios.length === 0) {
    merge.config.premios = Array.from({ length: merge.config.numPremios }, (_, i) => `Premio ${i + 1}`);
  }
  merge.boletos = Array.isArray(merge.boletos) ? merge.boletos.filter(b =>
    b && numeroValido(b.numeroA) && numeroValido(b.numeroB)
  ).map((b, i) => ({
    id: Number.isInteger(Number(b.id)) ? Number(b.id) : i + 1,
    numeroA: Number(b.numeroA),
    numeroB: Number(b.numeroB),
    vendido: Boolean(b.vendido),
    nombre: String(b.nombre || ""),
    telefono: String(b.telefono || "")
  })) : [];
  merge.resultadosLoteria = Array.isArray(merge.resultadosLoteria) ? merge.resultadosLoteria : [];
  merge.ganadores = Array.isArray(merge.ganadores) ? merge.ganadores : [];
  merge.diagnosticoGanadores = Array.isArray(merge.diagnosticoGanadores) ? merge.diagnosticoGanadores : [];
  merge.ajustesAsignacion = Array.isArray(merge.ajustesAsignacion) ? merge.ajustesAsignacion : [];
  merge.nombreColegio = String(merge.nombreColegio || "Liceo Carl Ransom Rogers");
  merge.logo = typeof merge.logo === "string" ? merge.logo : "";
  recalcularRangoResultados(merge);
  return merge;
}

function generarCandidatosPorRango(last4, last3, config) {
  const candidatos = [];
  if (last4 >= config.min && last4 <= config.max) {
    candidatos.push(last4);
  }
  for (let numero = last3; numero <= config.max; numero += 1000) {
    if (numero >= config.min && numero <= config.max) {
      if (!candidatos.includes(numero)) candidatos.push(numero);
    }
  }
  return candidatos;
}

function recalcularRangoResultados(target = state) {
  target.resultadosLoteria = target.resultadosLoteria.map((r, i) => {
    const oficialTexto = String(r.oficial ?? r.last4 ?? "").replace(/\D/g, "");
    const oficial = oficialTexto ? Number(oficialTexto) : 0;
    const last4 = oficial % 10000;
    const last3 = oficial % 1000;
    const coincidencias = generarCandidatosPorRango(last4, last3, target.config);
    return {
      orden: i + 1,
      oficial,
      last4,
      last3,
      candidatos: coincidencias,
      enRango: coincidencias.length > 0
    };
  });
}

function cargarEstado() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    state = normalizarEstado(saved ? JSON.parse(saved) : null);
  } catch (error) {
    console.warn("No se pudo cargar el respaldo local.", error);
    state = structuredClone(estadoInicial);
  }
}

function guardarEstado() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    mostrarToast("No fue posible guardar los datos en este navegador.");
  }
  publicarEstadoRemoto();
}

async function publicarEstadoRemoto() {
  if (
    state.config &&
    state.config.numPremios === 30 &&
    Array.isArray(state.ganadores) &&
    state.ganadores.length > 0 &&
    state.ganadores.length < 30
  ) {
    console.warn("Se bloqueó una publicación incompleta: se requieren 30 premios.");
    return;
  }
  const estadoPublico = structuredClone(state);
  estadoPublico.password = undefined;
  estadoPublico.boletos = Array.isArray(estadoPublico.boletos)
    ? estadoPublico.boletos.map(boleto => ({
        ...boleto,
        nombre: "",
        telefono: ""
      }))
    : [];
  estadoPublico.ganadores = Array.isArray(estadoPublico.ganadores)
    ? estadoPublico.ganadores.map(ganador => ({
        ...ganador,
        nombre: "",
        telefono: ""
      }))
    : [];
  try {
    const respuesta = await fetch(`${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}?on_conflict=id`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates"
      },
      body: JSON.stringify({
        id: SUPABASE_ROW_ID,
        state: estadoPublico,
        updated_at: new Date().toISOString()
      })
    });
    if (!respuesta.ok) {
      throw new Error(`Supabase respondió ${respuesta.status}`);
    }
  } catch (error) {
    console.warn("No se pudo publicar el estado compartido.", error);
  }
}

async function cargarEstadoRemoto() {
  try {
    const respuesta = await fetch(
      `${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}?id=eq.${encodeURIComponent(SUPABASE_ROW_ID)}&select=state`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`
        }
      }
    );
    if (!respuesta.ok) {
      throw new Error(`Supabase respondió ${respuesta.status}`);
    }
    const filas = await respuesta.json();
    if (
      Array.isArray(filas) &&
      filas.length &&
      filas[0].state &&
      typeof filas[0].state === "object" &&
      Object.keys(filas[0].state).length > 0
    ) {
      state = normalizarEstado(filas[0].state);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    }
  } catch (error) {
    console.warn("No se pudo cargar el estado compartido.", error);
  }
  return false;
}

function mostrarSeccion(name) {
  ["consulta", "admin"].forEach(nombre => {
    document.getElementById(`section-${nombre}`).classList.add("hidden");
    document.getElementById(`nav-${nombre}`).classList.remove("active");
  });
  document.getElementById(`section-${name}`).classList.remove("hidden");
  document.getElementById(`nav-${name}`).classList.add("active");
  if (name === "resultados") renderListaGanadores();
  if (name === "admin") actualizarVistaAdmin();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function actualizarVistaAdmin() {
  const autenticado = sessionStorage.getItem("rifa_admin_ok") === "1";
  document.getElementById("admin-login").classList.toggle("hidden", autenticado);
  document.getElementById("admin-panel").classList.toggle("hidden", !autenticado);
  if (autenticado) {
    renderTablaBoletos();
    cargarCamposConfiguracion();
  }
}

function mostrarTabAdmin(tab) {
  ["boletos", "resultados", "ganadores", "config"].forEach(nombre => {
    document.getElementById(`admin-tab-${nombre}`).classList.add("hidden");
    document.getElementById(`tab-${nombre}`).classList.remove("active");
  });
  document.getElementById(`admin-tab-${tab}`).classList.remove("hidden");
  document.getElementById(`tab-${tab}`).classList.add("active");
}

function renderIdentidad() {
  document.getElementById("nombre-colegio").textContent = state.nombreColegio;
  document.title = `${state.nombreColegio} | Consulta de resultados`;
  const logo = document.getElementById("logo-colegio");
  if (state.logo) {
    logo.src = state.logo;
    logo.classList.remove("hidden");
  } else {
    logo.src = "assets/escudo-liceo.png";
    logo.classList.remove("hidden");
  }
}

function renderEstadoSorteo() {
  const estado = document.getElementById("estado-sorteo");
  estado.classList.add("hidden");
}

document.getElementById("form-login").addEventListener("submit", event => {
  event.preventDefault();
  const password = document.getElementById("admin-password").value;
  if (password === state.password || password === DEFAULT_PASSWORD) {
    if (password === DEFAULT_PASSWORD) {
      state.password = DEFAULT_PASSWORD;
      guardarEstado();
    }
    sessionStorage.setItem("rifa_admin_ok", "1");
    document.getElementById("admin-password").value = "";
    actualizarVistaAdmin();
  } else {
    mostrarToast("Contraseña incorrecta.");
  }
});

function cerrarSesionAdmin() {
  sessionStorage.removeItem("rifa_admin_ok");
  mostrarSeccion("consulta");
}

function restablecerPassword() {
  if (!confirm("¿Restablecer la contraseña de administración a RifaLCRR1972?")) return;
  state.password = DEFAULT_PASSWORD;
  guardarEstado();
  document.getElementById("admin-password").value = "";
  mostrarToast("Contraseña restablecida a RifaLCRR1972.");
}

function renderTablaBoletos() {
  const tbody = document.getElementById("tabla-boletos");
  const vendidos = state.boletos.filter(b => b.vendido).length;
  document.getElementById("contador-boletos").textContent = `${state.boletos.length} boletos · ${vendidos} vendidos`;
  tbody.innerHTML = state.boletos.map((boleto, index) => `
    <tr>
      <td>${escapeHtml(boleto.id)}</td>
      <td class="font-mono">${formatearNumero(boleto.numeroA)}</td>
      <td class="font-mono">${formatearNumero(boleto.numeroB)}</td>
      <td><span class="status ${boleto.vendido ? "status--sold" : "status--available"}">${boleto.vendido ? "Vendido" : "Disponible"}</span></td>
      <td>${escapeHtml(boleto.nombre || "—")}</td>
      <td>
        <button class="button button--ghost" type="button" onclick="editarBoleto(${index})">Editar</button>
        <button class="button button--danger" type="button" onclick="eliminarBoleto(${index})">Eliminar</button>
      </td>
    </tr>
  `).join("");
}

function abrirDialogoBoleto() {
  document.getElementById("form-boleto").reset();
  document.getElementById("boleto-index").value = "";
  document.getElementById("dialog-boleto-titulo").textContent = "Agregar boleto";
  document.getElementById("boleto-vendido").checked = true;
  document.getElementById("boleto-id").value = siguienteIdBoleto();
  document.getElementById("dialog-boleto").showModal();
}

function cerrarDialogoBoleto() {
  document.getElementById("dialog-boleto").close();
}

function siguienteIdBoleto() {
  return state.boletos.length ? Math.max(...state.boletos.map(b => Number(b.id) || 0)) + 1 : 1;
}

function editarBoleto(index) {
  const b = state.boletos[index];
  if (!b) return;
  document.getElementById("boleto-index").value = index;
  document.getElementById("dialog-boleto-titulo").textContent = "Editar boleto";
  document.getElementById("boleto-id").value = b.id;
  document.getElementById("boleto-a").value = formatearNumero(b.numeroA);
  document.getElementById("boleto-b").value = formatearNumero(b.numeroB);
  document.getElementById("boleto-vendido").checked = b.vendido;
  document.getElementById("boleto-nombre").value = b.nombre;
  document.getElementById("boleto-telefono").value = b.telefono;
  document.getElementById("dialog-boleto").showModal();
}

function eliminarBoleto(index) {
  if (!confirm("¿Eliminar este boleto?")) return;
  state.boletos.splice(index, 1);
  state.ganadores = [];
  guardarEstado();
  renderTablaBoletos();
  renderListaGanadores();
  mostrarToast("Boleto eliminado.");
}

document.getElementById("form-boleto").addEventListener("submit", event => {
  event.preventDefault();
  const indexText = document.getElementById("boleto-index").value;
  const numeroA = document.getElementById("boleto-a").value.trim();
  const numeroB = document.getElementById("boleto-b").value.trim();
  const id = Number(document.getElementById("boleto-id").value);
  if (!Number.isInteger(id) || id < 1 || !numeroValido(numeroA) || !numeroValido(numeroB)) {
    mostrarToast("Revisa el folio y los dos números de cuatro cifras.");
    return;
  }
  if (state.boletos.some((b, i) => String(i) !== indexText && b.id === id)) {
    mostrarToast("Ya existe otro boleto con ese folio.");
    return;
  }
  const boleto = {
    id,
    numeroA: Number(numeroA),
    numeroB: Number(numeroB),
    vendido: document.getElementById("boleto-vendido").checked,
    nombre: document.getElementById("boleto-nombre").value.trim(),
    telefono: document.getElementById("boleto-telefono").value.trim()
  };
  if (indexText === "") state.boletos.push(boleto);
  else state.boletos[Number(indexText)] = boleto;
  state.ganadores = [];
  guardarEstado();
  renderTablaBoletos();
  cerrarDialogoBoleto();
  mostrarToast("Boleto guardado.");
});

function parseCSV(texto) {
  const filas = [];
  let fila = [], campo = "", entreComillas = false;
  for (let i = 0; i < texto.length; i++) {
    const char = texto[i];
    if (char === '"' && entreComillas && texto[i + 1] === '"') {
      campo += '"'; i++;
    } else if (char === '"') {
      entreComillas = !entreComillas;
    } else if (char === "," && !entreComillas) {
      fila.push(campo.trim()); campo = "";
    } else if ((char === "\n" || char === "\r") && !entreComillas) {
      if (char === "\r" && texto[i + 1] === "\n") i++;
      fila.push(campo.trim());
      if (fila.some(valor => valor !== "")) filas.push(fila);
      fila = []; campo = "";
    } else {
      campo += char;
    }
  }
  fila.push(campo.trim());
  if (fila.some(valor => valor !== "")) filas.push(fila);
  return filas;
}

function cargarCSVBoletos(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const filas = parseCSV(String(reader.result));
    if (filas.length && /id/i.test(filas[0][0])) filas.shift();
    const nuevos = [];
    const ids = new Set();
    let errores = 0;
    filas.forEach((parts, i) => {
      const id = Number(parts[0]) || i + 1;
      const numeroA = Number(String(parts[1] || "").trim());
      const numeroB = Number(String(parts[2] || "").trim());
      if (!numeroValido(numeroA) || !numeroValido(numeroB) || ids.has(id)) {
        errores++;
        return;
      }
      ids.add(id);
      nuevos.push({
        id,
        numeroA,
        numeroB,
        vendido: /^s|^1|pagado/i.test(String(parts[3] || "sí").trim()),
        nombre: parts[4] || "",
        telefono: parts[5] || ""
      });
    });
    if (!nuevos.length) {
      mostrarToast("No se pudo cargar ningún boleto válido.");
      event.target.value = "";
      return;
    }
    if (!confirm(`Se cargarán ${nuevos.length} boletos válidos${errores ? ` y se omitirán ${errores} filas inválidas` : ""}. ¿Continuar?`)) return;
    state.boletos = nuevos;
    state.ganadores = [];
    guardarEstado();
    renderTablaBoletos();
    mostrarToast(`${nuevos.length} boletos cargados.`);
    event.target.value = "";
  };
  reader.readAsText(file, "UTF-8");
}

function exportarBoletos() {
  const filas = [["id", "numeroA", "numeroB", "vendido", "nombre", "telefono"]];
  state.boletos.forEach(b => filas.push([b.id, formatearNumero(b.numeroA), formatearNumero(b.numeroB), b.vendido ? "Sí" : "No", b.nombre || "", b.telefono || ""]));
  const csv = filas.map(fila => fila.map(valor => `"${String(valor).replaceAll('"', '""')}"`).join(",")).join("\r\n");
  descargarArchivo(csv, "boletos_rifa.csv", "text/csv;charset=utf-8");
}

function guardarResultados() {
  const texto = document.getElementById("input-resultados").value;
  const nombre = document.getElementById("nombre-sorteo").value.trim();
  const numeros = texto.split(/[\n,;\s]+/).map(valor => valor.trim()).filter(valor => /^\d+$/.test(valor));
  state.resultadosLoteria = numeros.map((valor, i) => {
    const oficial = Number(valor);
    const last4 = oficial % 10000;
    const last3 = oficial % 1000;
    const coincidencias = generarCandidatosPorRango(last4, last3, state.config);
    return {
      orden: i + 1,
      oficial,
      last4,
      last3,
      candidatos: coincidencias,
      enRango: coincidencias.length > 0
    };
  });
  state.nombreSorteo = nombre || `Sorteo ${new Date().toLocaleDateString("es-MX")}`;
  state.ganadores = [];
  recalcularRangoResultados();
  guardarEstado();
  calcularGanadoresAutomatico();
  const enRango = state.resultadosLoteria.filter(r => r.enRango).length;
  const preview = document.getElementById("preview-resultados");
  preview.innerHTML = `Se guardaron ${state.resultadosLoteria.length} números. ${enRango} tienen últimas cuatro cifras dentro del rango configurado.`;
  preview.classList.remove("hidden");
  renderEstadoSorteo();
  mostrarToast("Resultados guardados.");
}

function calcularGanadores() {
  if (!state.resultadosLoteria.length) return mostrarToast("Primero carga los resultados oficiales.");
  const vendidos = state.boletos.filter(b => b.vendido);
  if (!vendidos.length) return mostrarToast("No hay boletos vendidos.");
  const idsUnicos = new Set(vendidos.map(b => b.id));
  if (idsUnicos.size !== vendidos.length) {
    return mostrarToast("Hay folios vendidos duplicados. Corrige los IDs antes de calcular.");
  }
  if (!confirm("¿Calcular y reemplazar la lista actual de ganadores?")) return;
  calcularGanadoresAutomatico();
  mostrarToast(`Se asignaron ${state.ganadores.length} premios.`);
}

function calcularGanadoresAutomatico() {
  if (!state.resultadosLoteria.length) return;
  const vendidos = state.boletos.filter(b => b.vendido);
  if (!vendidos.length) {
    state.ganadores = [];
    state.diagnosticoGanadores = [];
    return;
  }
  const usados = new Set();
  const resultadosUsados = new Set();
  const ganadores = [];
  const faltantes = [];
  const ajustes = [];
  for (let i = 0; i < state.resultadosLoteria.length; i++) {
    if (ganadores.length >= state.config.numPremios) break;
    if (resultadosUsados.has(i)) continue;
    const resultado = state.resultadosLoteria[i];
    const candidatos = Array.isArray(resultado.candidatos) && resultado.candidatos.length
      ? resultado.candidatos
      : generarCandidatosPorRango(resultado.last4, resultado.last3, state.config);
    let numeroGanador = null;
    let boleto = null;
    let numeroOficialGanador = resultado.oficial;
    let indiceResultadoUsado = i;
    for (const candidato of candidatos) {
      boleto = vendidos.find(b => !usados.has(b.id) && (b.numeroA === candidato || b.numeroB === candidato));
      if (boleto) {
        numeroGanador = candidato;
        break;
      }
    }
    if (!boleto) {
      for (let j = i + 1; j < state.resultadosLoteria.length; j++) {
        if (resultadosUsados.has(j)) continue;
        const resultadoSiguiente = state.resultadosLoteria[j];
        const candidatosSiguientes = Array.isArray(resultadoSiguiente.candidatos) && resultadoSiguiente.candidatos.length
          ? resultadoSiguiente.candidatos
          : generarCandidatosPorRango(resultadoSiguiente.last4, resultadoSiguiente.last3, state.config);
        for (const candidato of candidatosSiguientes) {
          boleto = vendidos.find(b => !usados.has(b.id) && (b.numeroA === candidato || b.numeroB === candidato));
          if (boleto) {
            numeroGanador = candidato;
            numeroOficialGanador = resultadoSiguiente.oficial;
            indiceResultadoUsado = j;
            resultadosUsados.add(j);
            break;
          }
        }
        if (boleto) break;
      }
    }
    if (!boleto) {
      faltantes.push({
        oficial: resultado.oficial,
        last4: resultado.last4,
        candidatos
      });
      continue;
    }
    resultadosUsados.add(i);
    resultadosUsados.add(indiceResultadoUsado);
    usados.add(boleto.id);
    const tipoAjuste = indiceResultadoUsado !== i
      ? "Siguiente número oficial disponible"
      : numeroGanador === resultado.last4
        ? "Coincidencia directa"
        : "Alternativa por últimas tres cifras";
    ajustes.push({
      premioNum: ganadores.length + 1,
      premioNombre: state.config.premios[ganadores.length] || `Premio ${ganadores.length + 1}`,
      oficialOriginal: resultado.oficial,
      oficialUsado: numeroOficialGanador,
      numeroGanador,
      boletoId: boleto.id,
      tipo: tipoAjuste
    });
    ganadores.push({
      premioNum: ganadores.length + 1,
      premioNombre: state.config.premios[ganadores.length] || `Premio ${ganadores.length + 1}`,
      numeroGanador,
      numeroOficial: numeroOficialGanador,
      boletoId: boleto.id,
      nombre: boleto.nombre || "Sin nombre",
      telefono: boleto.telefono || "",
      numeroA: boleto.numeroA,
      numeroB: boleto.numeroB
    });
  }

  for (let i = 0; i < state.resultadosLoteria.length && ganadores.length < state.config.numPremios; i++) {
    if (resultadosUsados.has(i)) continue;
    const resultado = state.resultadosLoteria[i];
    const candidatos = Array.isArray(resultado.candidatos) && resultado.candidatos.length
      ? resultado.candidatos
      : generarCandidatosPorRango(resultado.last4, resultado.last3, state.config);

    let boleto = null;
    let numeroGanador = null;
    for (const candidato of candidatos) {
      boleto = vendidos.find(b => !usados.has(b.id) && (b.numeroA === candidato || b.numeroB === candidato));
      if (boleto) {
        numeroGanador = candidato;
        break;
      }
    }
    if (!boleto) continue;

    resultadosUsados.add(i);
    usados.add(boleto.id);
    ajustes.push({
      premioNum: ganadores.length + 1,
      premioNombre: state.config.premios[ganadores.length] || `Premio ${ganadores.length + 1}`,
      oficialOriginal: resultado.oficial,
      oficialUsado: resultado.oficial,
      numeroGanador,
      boletoId: boleto.id,
      tipo: numeroGanador === resultado.last4 ? "Coincidencia directa" : "Alternativa por últimas tres cifras"
    });
    ganadores.push({
      premioNum: ganadores.length + 1,
      premioNombre: state.config.premios[ganadores.length] || `Premio ${ganadores.length + 1}`,
      numeroGanador,
      numeroOficial: resultado.oficial,
      boletoId: boleto.id,
      nombre: boleto.nombre || "Sin nombre",
      telefono: boleto.telefono || "",
      numeroA: boleto.numeroA,
      numeroB: boleto.numeroB
    });
  }

  if (ganadores.length < state.config.numPremios) {
    const boletosDisponibles = vendidos
      .filter(b => !usados.has(b.id))
      .slice()
      .sort((a, b) => Number(a.id) - Number(b.id));
    let siguienteResultado = 0;
    for (const boleto of boletosDisponibles) {
      if (ganadores.length >= state.config.numPremios) break;
      while (
        siguienteResultado < state.resultadosLoteria.length &&
        resultadosUsados.has(siguienteResultado)
      ) {
        siguienteResultado++;
      }
      const resultado = state.resultadosLoteria[siguienteResultado];
      usados.add(boleto.id);
      siguienteResultado++;
      const numeroGanador = [boleto.numeroA, boleto.numeroB]
        .find(numero => numero >= state.config.min && numero <= state.config.max) ?? boleto.numeroA;
      ajustes.push({
        premioNum: ganadores.length + 1,
        premioNombre: state.config.premios[ganadores.length] || `Premio ${ganadores.length + 1}`,
        oficialOriginal: resultado ? resultado.oficial : 0,
        oficialUsado: resultado ? resultado.oficial : 0,
        numeroGanador,
        boletoId: boleto.id,
        tipo: "Siguiente boleto vendido disponible"
      });
      ganadores.push({
        premioNum: ganadores.length + 1,
        premioNombre: state.config.premios[ganadores.length] || `Premio ${ganadores.length + 1}`,
        numeroGanador,
        numeroOficial: resultado ? resultado.oficial : 0,
        boletoId: boleto.id,
        nombre: boleto.nombre || "Sin nombre",
        telefono: boleto.telefono || "",
        numeroA: boleto.numeroA,
        numeroB: boleto.numeroB
      });
    }
  }
  state.ganadores = ganadores;
  state.diagnosticoGanadores = faltantes;
  state.ajustesAsignacion = ajustes;
  guardarEstado();
  renderResultadoCalculo();
  renderListaGanadores();
  renderEstadoSorteo();
  mostrarToast(`Se asignaron ${ganadores.length} premios.`);
}

function renderResultadoCalculo() {
  const contenedor = document.getElementById("resultado-calculo");
  if (!state.ganadores.length) {
    contenedor.innerHTML = `<p class="muted">Aún no hay ganadores calculados. Premios configurados: ${state.config.numPremios}.</p>${renderDiagnosticoFaltantes()}`;
    return;
  }
  contenedor.innerHTML = `
    <div class="notice" style="background:#effaf3;color:#166534;margin-bottom:12px">
      <strong>${state.ganadores.length} de ${state.config.numPremios} premios asignados</strong>
    </div>
  ` + state.ganadores.map(g => `
    <div class="calculation-row">
      <div class="calculation-row__number">${g.premioNum}</div>
      <div><strong>${escapeHtml(g.premioNombre)}</strong><div class="muted">Número ${formatearNumero(g.numeroGanador)} · Boleto #${escapeHtml(g.boletoId)} · ${escapeHtml(g.nombre)}</div></div>
    </div>
  `).join("") + renderRegistroAjustes() + renderDiagnosticoFaltantes();
}

function renderRegistroAjustes() {
  if (!Array.isArray(state.ajustesAsignacion) || !state.ajustesAsignacion.length) return "";
  return `
    <div class="notice" style="margin-top:16px;background:#f8fafc;color:#334155">
      <strong>Proceso de asignación</strong>
      <div style="margin-top:10px;display:grid;gap:8px">
        ${state.ajustesAsignacion.map(a => `
          <div style="border-bottom:1px solid #e2e8f0;padding-bottom:8px">
            <strong>Premio ${a.premioNum}: ${escapeHtml(a.premioNombre)}</strong>
            <div>Tipo: ${escapeHtml(a.tipo)}</div>
            <div>Número oficial original: ${escapeHtml(a.oficialOriginal || "—")}</div>
            <div>Número oficial usado: ${escapeHtml(a.oficialUsado || "—")}</div>
            <div>Número asignado: ${formatearNumero(a.numeroGanador)} · Boleto: #${escapeHtml(a.boletoId)}</div>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function renderDiagnosticoFaltantes() {
  if (!Array.isArray(state.diagnosticoGanadores) || !state.diagnosticoGanadores.length) return "";
  const faltan = Math.max(0, state.config.numPremios - state.ganadores.length);
  return `
    <div class="notice" style="margin-top:16px;background:#fff7ed;color:#9a4d18">
      <strong>Faltan ${faltan} premio(s).</strong>
      <div style="margin-top:8px">
        ${state.diagnosticoGanadores.map(faltante => `
          <div>Número oficial ${escapeHtml(faltante.oficial)} → probó ${faltante.candidatos.map(formatearNumero).join(", ")}</div>
        `).join("")}
      </div>
    </div>
  `;
}

function borrarGanadores() {
  if (!state.ganadores.length) return mostrarToast("No hay ganadores para borrar.");
  if (!confirm("¿Borrar únicamente la lista calculada de ganadores?")) return;
  state.ganadores = [];
  state.ajustesAsignacion = [];
  state.diagnosticoGanadores = [];
  guardarEstado();
  renderResultadoCalculo();
  renderListaGanadores();
  renderEstadoSorteo();
  mostrarToast("Lista de ganadores borrada.");
}

document.getElementById("form-consulta").addEventListener("submit", event => {
  event.preventDefault();
  consultarBoleto();
});

function lanzarConfeti() {
  const esMovil = window.matchMedia("(max-width: 760px)").matches;
  const colores = ["#2563eb", "#f6c445", "#16a34a", "#ec4899", "#f97316", "#7c3aed"];

  document.querySelectorAll(".confetti-piece").forEach(pieza => pieza.remove());
  const cantidad = esMovil ? 110 : 70;
  for (let i = 0; i < cantidad; i++) {
    const pieza = document.createElement("span");
    pieza.className = "confetti-piece";
    pieza.style.setProperty("--confetti-x", `${(Math.random() - 0.5) * (esMovil ? 240 : 520)}px`);
    pieza.style.setProperty("--confetti-delay", `${Math.random() * 0.35}s`);
    pieza.style.setProperty("--confetti-duration", `${2.2 + Math.random() * (esMovil ? 2.2 : 1.5)}s`);
    pieza.style.setProperty("--confetti-color", colores[i % colores.length]);
    pieza.style.left = `${Math.random() * 100}%`;
    pieza.style.top = `${-15 - Math.random() * 20}%`;
    pieza.style.setProperty("--confetti-size", `${6 + Math.random() * 7}px`);
    pieza.style.setProperty("--confetti-spin", `${360 + Math.random() * 720}deg`);
    document.body.appendChild(pieza);
  }
  setTimeout(() => {
    document.querySelectorAll(".confetti-piece").forEach(pieza => pieza.remove());
  }, esMovil ? 5200 : 4000);
}

function consultarBoleto() {
  const input = document.getElementById("input-folio");
  const contenedor = document.getElementById("resultado-consulta");
  const valor = input.value.trim();
  if (!/^\d{4}$/.test(valor)) {
    contenedor.innerHTML = `<div class="result-card result-card--warning"><div class="result-card__icon">⚠️</div><h2>Escribe las cuatro cifras</h2><p>El número debe contener exactamente cuatro dígitos, por ejemplo: 0280 o 1381.</p></div>`;
    input.focus();
    input.select();
    return;
  }
  if (!numeroValido(valor)) {
    contenedor.innerHTML = `<div class="result-card result-card--warning"><div class="result-card__icon">⚠️</div><h2>Escribe un número válido</h2><p>Debe tener exactamente cuatro cifras y estar dentro del rango configurado.</p></div>`;
    return;
  }
  const numero = Number(valor);
  const boleto = state.boletos.find(b => b.numeroA === numero || b.numeroB === numero);
  if (!boleto) {
    contenedor.innerHTML = `<div class="result-card result-card--neutral"><div class="result-card__icon">🔎</div><h2>Número no encontrado</h2><p>Verifica las cifras impresas en tu boleto físico.</p></div>`;
    return;
  }
  if (!boleto.vendido) {
    contenedor.innerHTML = `<div class="result-card result-card--warning"><div class="result-card__icon">🎫</div><h2>Boleto no vendido</h2><p>Este folio no está marcado como vendido o pagado.</p></div>`;
    return;
  }
  const ganador = state.ganadores.find(g => g.boletoId === boleto.id);
  if (ganador) {
    const medalInfo = {
      1: { clase: "diamond", icono: "1", etiqueta: "Primer premio" },
      2: { clase: "gold", icono: "2", etiqueta: "Segundo premio" },
      3: { clase: "silver", icono: "3", etiqueta: "Tercer premio" },
      4: { clase: "bronze", icono: "4", etiqueta: "Cuarto premio" }
    };
    const premioEspecial = medalInfo[ganador.premioNum];
    const claseEspecial = premioEspecial ? ` celebration-${premioEspecial.clase}` : "";
    const iconoEspecial = premioEspecial ? premioEspecial.icono : "🎉";
    const etiquetaEspecial = premioEspecial ? premioEspecial.etiqueta : "Resultado ganador";
    contenedor.innerHTML = `
      <div class="winner-celebration${claseEspecial}" role="status" aria-live="assertive">
        <div class="celebration-confetti" aria-hidden="true">
          <span></span><span></span><span></span><span></span><span></span><span></span>
          <span></span><span></span><span></span><span></span><span></span><span></span>
        </div>
        <div class="celebration-badge" aria-hidden="true">
          <div class="celebration-rays"></div>
          <div class="celebration-trophy">${iconoEspecial}</div>
        </div>
        <p class="celebration-kicker">${etiquetaEspecial}</p>
        <h2>¡Felicidades, ganaste!</h2>
        <div class="celebration-prize">${escapeHtml(ganador.premioNombre)}</div>
        <div class="celebration-ticket">
          <span>Boleto ganador</span>
          <strong>${formatearNumero(ganador.numeroGanador)}</strong>
        </div>
      </div>`;
    lanzarConfeti();
    return;
  }
  if (!state.ganadores.length) {
    contenedor.innerHTML = `<div class="result-card result-card--neutral"><div class="result-card__icon">🎟️</div><h2>Boleto válido y participando</h2><p>Aún no se han publicado los resultados o no hay premios asignados.</p><div class="details"><span>Tus números: ${formatearNumero(boleto.numeroA)} y ${formatearNumero(boleto.numeroB)}</span></div></div>`;
    return;
  }
  let distancia = Infinity;
  let masCercano = null;
  [boleto.numeroA, boleto.numeroB].forEach(n => {
    state.ganadores.forEach(g => {
      const actual = Math.abs(n - g.numeroGanador);
      if (actual < distancia) {
        distancia = actual;
        masCercano = g.numeroGanador;
      }
    });
  });
  let mensaje = `La diferencia con el número ganador más cercano fue de ${distancia}.`;
  if (distancia <= 5) mensaje = `¡Estuviste muy cerca! Solo ${distancia} número${distancia === 1 ? "" : "s"} de diferencia.`;
  else if (distancia <= 20) mensaje = `Estuviste relativamente cerca (${distancia} números de diferencia).`;
  contenedor.innerHTML = `<div class="result-card ${distancia <= 5 ? "result-card--close" : "result-card--neutral"}"><div class="result-card__icon">${distancia <= 5 ? "😅" : "🎫"}</div><h2>No resultaste ganador esta vez</h2><p>${mensaje}</p><div class="details"><span>Tus números: ${formatearNumero(boleto.numeroA)} y ${formatearNumero(boleto.numeroB)}</span><span>Número más cercano: ${formatearNumero(masCercano)}</span></div></div>`;
}

function renderListaGanadores() {
  const contenedor = document.getElementById("lista-ganadores");
  const info = document.getElementById("info-sorteo");
  if (!state.ganadores.length) {
    contenedor.innerHTML = `<p class="muted" style="text-align:center;padding:40px 0">Los resultados se publicarán después del sorteo oficial.</p>`;
    info.textContent = state.nombreSorteo ? `Sorteo: ${state.nombreSorteo}` : "Aún no se han cargado resultados.";
    return;
  }
  info.textContent = state.nombreSorteo || "Resultados publicados";
  contenedor.innerHTML = state.ganadores.map(g => `
    <article class="winner-row">
      <div class="winner-row__number">${g.premioNum}</div>
      <div><h3>${escapeHtml(g.premioNombre)}</h3><p>Boleto ganador: ${formatearNumero(g.numeroGanador)}</p></div>
    </article>
  `).join("");
}

function cargarCamposConfiguracion() {
  document.getElementById("cfg-nombre").value = state.nombreColegio;
  document.getElementById("cfg-min").value = state.config.min;
  document.getElementById("cfg-max").value = state.config.max;
  document.getElementById("cfg-premios").value = state.config.numPremios;
  document.getElementById("cfg-lista-premios").value = state.config.premios.join("\n");
  document.getElementById("nombre-sorteo").value = state.nombreSorteo;
  document.getElementById("input-resultados").value = state.resultadosLoteria.map(r => r.oficial).join("\n");
  document.getElementById("cfg-password").value = "";
  renderResultadoCalculo();
}

document.getElementById("file-logo").addEventListener("change", event => {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 1024 * 1024) {
    event.target.value = "";
    return mostrarToast("El logo debe pesar menos de 1 MB.");
  }
  const reader = new FileReader();
  reader.onload = () => {
    state.logo = String(reader.result);
    renderIdentidad();
    mostrarToast("Logo preparado. Guarda la configuración.");
  };
  reader.readAsDataURL(file);
});

function guardarConfiguracion() {
  const min = Number(document.getElementById("cfg-min").value);
  const max = Number(document.getElementById("cfg-max").value);
  const numPremios = Number(document.getElementById("cfg-premios").value);
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max > 9999 || min > max) {
    return mostrarToast("El rango de números no es válido.");
  }
  if (!Number.isInteger(numPremios) || numPremios < 1 || numPremios > 500) {
    return mostrarToast("La cantidad de premios no es válida.");
  }
  const lista = document.getElementById("cfg-lista-premios").value.split("\n").map(v => v.trim()).filter(Boolean);
  state.nombreColegio = document.getElementById("cfg-nombre").value.trim() || "Liceo Carl Ransom Rogers";
  state.config = { min, max, numPremios, premios: lista.length ? lista : Array.from({ length: numPremios }, (_, i) => `Premio ${i + 1}`) };
  const nuevaPassword = document.getElementById("cfg-password").value.trim();
  if (nuevaPassword) state.password = nuevaPassword;
  recalcularRangoResultados();
  state.ganadores = [];
  guardarEstado();
  calcularGanadoresAutomatico();
  renderIdentidad();
  renderEstadoSorteo();
  mostrarToast("Configuración guardada.");
}

function exportarTodo() {
  descargarArchivo(JSON.stringify(state, null, 2), "rifa_respaldo.json", "application/json");
}

function importarTodo(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result));
      if (!data || typeof data !== "object") throw new Error("Formato inválido");
      if (!confirm("Esta acción reemplazará los datos actuales con el respaldo. ¿Continuar?")) return;
      state = normalizarEstado(data);
      guardarEstado();
      renderIdentidad();
      renderEstadoSorteo();
      cargarCamposConfiguracion();
      renderTablaBoletos();
      renderListaGanadores();
      mostrarToast("Respaldo importado correctamente.");
    } catch (error) {
      mostrarToast("El archivo JSON no tiene un formato válido.");
    } finally {
      event.target.value = "";
    }
  };
  reader.readAsText(file, "UTF-8");
}

function resetearTodo() {
  if (!confirm("¿Eliminar todos los boletos, resultados, ganadores y configuración?")) return;
  localStorage.removeItem(STORAGE_KEY);
  sessionStorage.removeItem("rifa_admin_ok");
  state = structuredClone(estadoInicial);
  guardarEstado();
  location.reload();
}

function descargarArchivo(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function init() {
  cargarEstado();
  const tieneEstadoRemoto = await cargarEstadoRemoto();
  if (!tieneEstadoRemoto) {
    publicarEstadoRemoto();
  }
  if (
    state.resultadosLoteria.length &&
    state.boletos.length &&
    state.ganadores.length !== state.config.numPremios
  ) {
    // La lista se recalcula únicamente desde Administración.
  }
  renderIdentidad();
  renderEstadoSorteo();
  renderTablaBoletos();
  renderListaGanadores();
  renderResultadoCalculo();
  mostrarSeccion("consulta");

  const inputFolio = document.getElementById("input-folio");
  inputFolio.addEventListener("input", () => {
    inputFolio.value = inputFolio.value.replace(/\D/g, "").slice(0, 4);
  });

  setInterval(async () => {
    const autenticado = sessionStorage.getItem("rifa_admin_ok") === "1";
    if (autenticado) return;
    const cargado = await cargarEstadoRemoto();
    if (cargado) {
      renderIdentidad();
      renderEstadoSorteo();
      renderTablaBoletos();
      renderListaGanadores();
      renderResultadoCalculo();
      if (
        state.resultadosLoteria.length &&
        state.boletos.length &&
        state.ganadores.length !== state.config.numPremios
      ) {
        // Conserva la lista remota publicada sin recalcularla en la vista pública.
      }
    }
  }, 10000);
}

init();
