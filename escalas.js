if (!sessionStorage.getItem('usuarioAtivo')) window.location.href = 'login.html';

let cacheEscalasParaChecks = [];

document.addEventListener('DOMContentLoaded', () => {
    renderizarEscalas();
    renderizarJornadas();
});

function calcularCargaInteligente(inicio, fim) {
    if (!inicio || !fim) return "00h00m";
    const toM = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    let d = toM(fim) - toM(inicio);
    if (d < 0) d += 1440; 
    let liquido = (d === 240) ? d : d - 60;
    if (liquido < 0) liquido = 0;
    return `${String(Math.floor(liquido/60)).padStart(2,'0')}h${String(liquido%60).padStart(2,'0')}m`;
}

// --- ESCALAS ---
document.getElementById('form-escala').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-id-escala').value;
    const dados = {
        inicioJornada: document.getElementById('inicio-jornada').value,
        fimJornada: document.getElementById('fim-jornada').value,
        atualizadoEm: Date.now()
    };
    if (id === "") await db.collection("escalas").add(dados);
    else await db.collection("escalas").doc(id).update(dados);
    limparFormEscala();
    renderizarEscalas();
});

async function renderizarEscalas() {
    const snap = await db.collection("escalas").orderBy("inicioJornada").get();
    const containersChecks = [
        document.getElementById('container-check-util'),
        document.getElementById('container-check-sabado'),
        document.getElementById('container-check-domingo'),
        document.getElementById('container-check-feriado')
    ];

    document.getElementById('lista-escalas-cards').innerHTML = "";
    cacheEscalasParaChecks = [];
    containersChecks.forEach(c => c.innerHTML = "");

    snap.forEach(doc => {
        const e = doc.data(); const id = doc.id;
        const carga = calcularCargaInteligente(e.inicioJornada, e.fimJornada);
        cacheEscalasParaChecks.push({ id, ...e });

        document.getElementById('lista-escalas-cards').innerHTML += `
            <div class="card-escala-mini">
                <div class="info-escala-mini"><b>${e.inicioJornada}-${e.fimJornada}</b><span>${carga}</span></div>
                <div class="actions"><i class="fa-solid fa-pencil" onclick="editarEscala('${id}')"></i><i class="fa-solid fa-trash-can" onclick="excluirEscala('${id}')"></i></div>
            </div>`;

        containersChecks.forEach(container => {
            const grupo = container.id.split('-').pop();
            // FORMATO ALTERADO PARA INÍCIO/FIM
            container.innerHTML += `
                <label class="scale-option">
                    <input type="checkbox" class="chk-escala-${grupo}" value="${id}">
                    <span>${e.inicioJornada.substring(0,5)}/${e.fimJornada.substring(0,5)}</span>
                </label>`;
        });
    });
}

// --- JORNADAS ---
document.getElementById('form-jornada').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-id-jornada').value;
    const getSelecionados = (classe) => Array.from(document.querySelectorAll(classe + ':checked')).map(cb => cb.value);

    const empresa = document.getElementById('filtro-empresa-jornada').value;
    const setor = document.getElementById('filtro-setor-jornada').value;
    const periodo = document.getElementById('filtro-periodo-jornada').value;

    if (empresa === "TODAS" || setor === "TODOS" || periodo === "TODOS") {
        alert("Selecione Empresa, Setor e Período específicos para salvar.");
        return;
    }

    const dados = {
        empresa, setor, periodo,
        ordem: parseInt(document.getElementById('jornada-ordem').value) || 1,
        escalas: {
            uteis: getSelecionados('.chk-escala-util'),
            sabado: getSelecionados('.chk-escala-sabado'),
            domingo: getSelecionados('.chk-escala-domingo'),
            feriado: getSelecionados('.chk-escala-feriado')
        },
        atualizadoEm: Date.now()
    };

    if (id === "") await db.collection("jornadas").add(dados);
    else await db.collection("jornadas").doc(id).update(dados);
    
    limparFormJornada();
    renderizarJornadas();
});

async function renderizarJornadas() {
    const empresaFiltro = document.getElementById('filtro-empresa-jornada').value;
    const setorFiltro = document.getElementById('filtro-setor-jornada').value;
    const periodoFiltro = document.getElementById('filtro-periodo-jornada').value;

    document.getElementById('label-periodo-atual').innerText = periodoFiltro === "TODOS" ? "TODAS AS JORNADAS" : periodoFiltro.toUpperCase();
    
    const [snapJor, snapEsc] = await Promise.all([db.collection("jornadas").get(), db.collection("escalas").get()]);
    const escalasMap = {}; snapEsc.forEach(d => { escalasMap[d.id] = d.data(); });
    const container = document.getElementById('grid-jornadas-cadastradas');
    container.innerHTML = "";

    let lista = []; snapJor.forEach(doc => { lista.push({ id: doc.id, ...doc.data() }); });
    
    lista.filter(j => 
        (empresaFiltro === "TODAS" || j.empresa === empresaFiltro) && 
        (setorFiltro === "TODOS" || j.setor === setorFiltro) && 
        (periodoFiltro === "TODOS" || j.periodo === periodoFiltro)
    )
    .sort((a, b) => a.ordem - b.ordem).forEach(j => {
        const formatarMiniTags = (ids) => {
            if (!ids || ids.length === 0 || ids === "") return '<span class="mini-tag-folga">F</span>';
            const normalizedIds = Array.isArray(ids) ? ids : [ids];
            return normalizedIds.map(id => {
                const e = escalasMap[id];
                return e ? `<span class="mini-tag-horario">${e.inicioJornada.substring(0,5)}</span>` : "";
            }).join('');
        };

        container.innerHTML += `
            <div class="mini-card-jornada">
                <div class="mini-card-header">
                    <span>${j.periodo.substring(0,3)} - J${j.ordem}</span>
                    <div class="mini-actions">
                        <i class="fa-solid fa-pencil" onclick="editarJornada('${j.id}')"></i>
                        <i class="fa-solid fa-trash-can" onclick="excluirJornada('${j.id}')"></i>
                    </div>
                </div>
                <div class="mini-card-content">
                    <div class="mini-row"><b>U:</b> ${formatarMiniTags(j.escalas.uteis)}</div>
                    <div class="mini-row"><b>S:</b> ${formatarMiniTags(j.escalas.sabado)}</div>
                    <div class="mini-row"><b>D:</b> ${formatarMiniTags(j.escalas.domingo)}</div>
                    <div class="mini-row"><b>F:</b> ${formatarMiniTags(j.escalas.feriado)}</div>
                </div>
            </div>`;
    });
}

async function editarJornada(id) {
    const doc = await db.collection("jornadas").doc(id).get();
    const j = doc.data();
    document.getElementById('filtro-empresa-jornada').value = j.empresa;
    document.getElementById('filtro-setor-jornada').value = j.setor;
    document.getElementById('filtro-periodo-jornada').value = j.periodo;
    document.getElementById('jornada-ordem').value = j.ordem;
    document.querySelectorAll('[class^="chk-escala-"]').forEach(cb => cb.checked = false);
    const marcar = (ids, classe) => {
        if (!ids || ids === "") return;
        const normalizedIds = Array.isArray(ids) ? ids : [ids];
        normalizedIds.forEach(idItem => {
            const cb = document.querySelector(`${classe}[value="${idItem}"]`);
            if(cb) cb.checked = true;
        });
    };
    marcar(j.escalas.uteis, '.chk-escala-util');
    marcar(j.escalas.sabado, '.chk-escala-sabado');
    marcar(j.escalas.domingo, '.chk-escala-domingo');
    marcar(j.escalas.feriado, '.chk-escala-feriado');
    document.getElementById('edit-id-jornada').value = id;
    document.getElementById('btn-save-jornada').innerText = "Atualizar";
}

function limparFormJornada() { 
    document.getElementById('form-jornada').reset(); 
    document.querySelectorAll('[class^="chk-escala-"]').forEach(cb => cb.checked = false);
    document.getElementById('edit-id-jornada').value = ""; 
    document.getElementById('btn-save-jornada').innerText = "Salvar Jornada";
}
async function excluirJornada(id) { if (confirm("Excluir?")) { await db.collection("jornadas").doc(id).delete(); renderizarJornadas(); } }
async function editarEscala(id) { 
    const doc = await db.collection("escalas").doc(id).get();
    const e = doc.data();
    document.getElementById('inicio-jornada').value = e.inicioJornada;
    document.getElementById('fim-jornada').value = e.fimJornada;
    document.getElementById('edit-id-escala').value = id;
    document.getElementById('btn-save-escala').innerText = "Atualizar";
}
function limparFormEscala() { document.getElementById('form-escala').reset(); document.getElementById('edit-id-escala').value = ""; document.getElementById('btn-save-escala').innerText = "Salvar Escala"; }
async function excluirEscala(id) { if (confirm("Excluir horário?")) { await db.collection("escalas").doc(id).delete(); renderizarEscalas(); renderizarJornadas(); } }
function logout() { sessionStorage.removeItem('usuarioAtivo'); window.location.href = 'login.html'; }