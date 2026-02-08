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
    const containerCards = document.getElementById('lista-escalas-cards');
    const containersChecks = [
        document.getElementById('container-check-util'),
        document.getElementById('container-check-sabado'),
        document.getElementById('container-check-domingo'),
        document.getElementById('container-check-feriado')
    ];

    containerCards.innerHTML = "";
    cacheEscalasParaChecks = [];
    containersChecks.forEach(c => c.innerHTML = "");

    snap.forEach(doc => {
        const e = doc.data();
        const id = doc.id;
        const carga = calcularCargaInteligente(e.inicioJornada, e.fimJornada);
        cacheEscalasParaChecks.push({ id, ...e });

        containerCards.innerHTML += `
            <div class="card-escala-mini">
                <div class="info-escala-mini">
                    <b>${e.inicioJornada} - ${e.fimJornada}</b>
                    <span>${carga}</span>
                </div>
                <div class="actions">
                    <i class="fa-solid fa-pencil" style="color:#f39c12" onclick="editarEscala('${id}')"></i>
                    <i class="fa-solid fa-trash-can" style="color:#e74c3c" onclick="excluirEscala('${id}')"></i>
                </div>
            </div>`;

        containersChecks.forEach(container => {
            const grupo = container.id.split('-').pop();
            container.innerHTML += `
                <label class="scale-option">
                    <input type="checkbox" class="chk-escala-${grupo}" value="${id}">
                    ${e.inicioJornada}-${e.fimJornada}
                </label>`;
        });
    });
}

// --- JORNADAS ---
document.getElementById('form-jornada').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-id-jornada').value;
    const getSelecionados = (classe) => Array.from(document.querySelectorAll(classe + ':checked')).map(cb => cb.value);

    const dados = {
        empresa: document.getElementById('jornada-empresa').value,
        setor: document.getElementById('jornada-setor').value, // Novo campo
        periodo: document.getElementById('jornada-periodo').value,
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
    const setorFiltro = document.getElementById('filtro-setor-jornada').value; // Novo Filtro

    const [snapJor, snapEsc] = await Promise.all([db.collection("jornadas").get(), db.collection("escalas").get()]);
    const escalasMap = {}; snapEsc.forEach(d => { escalasMap[d.id] = d.data(); });

    const periodos = ["Manhã", "Intermediário", "Tarde", "Noite", "Integral"];
    periodos.forEach(p => { document.getElementById(`col-j-${p}`).innerHTML = ""; });

    let lista = []; snapJor.forEach(doc => { lista.push({ id: doc.id, ...doc.data() }); });
    
    lista.filter(j => j.empresa === empresaFiltro && (j.setor === setorFiltro || !j.setor))
    .sort((a, b) => a.ordem - b.ordem).forEach(j => {
        
        const formatarLinhaEscala = (ids) => {
            if (!ids || ids.length === 0 || ids === "") return '<span class="tag-escala-jornada">Folga</span>';
            const normalizedIds = Array.isArray(ids) ? ids : [ids];
            let tagsHtml = normalizedIds.map(id => {
                const e = escalasMap[id];
                return e ? `<span class="tag-escala-jornada">${e.inicioJornada}-${e.fimJornada}</span>` : "";
            }).join('');
            return `<div class="tags-wrapper-jornada">${tagsHtml}</div>`;
        };

        const container = document.getElementById(`col-j-${j.periodo}`);
        if (container) {
            container.innerHTML += `
                <div class="card-jornada">
                    <div class="card-jornada-header">
                        <span>Jornada ${j.ordem} ${j.setor ? '('+j.setor.substring(0,3)+')' : ''}</span>
                        <div class="actions-j">
                            <i class="fa-solid fa-pencil" style="color:#f39c12" onclick="editarJornada('${j.id}')"></i>
                            <i class="fa-solid fa-trash-can" style="color:#e74c3c" onclick="excluirJornada('${j.id}')"></i>
                        </div>
                    </div>
                    <div class="card-jornada-body">
                        <div><b>Útil:</b> ${formatarLinhaEscala(j.escalas.uteis)}</div>
                        <div><b>Sábado:</b> ${formatarLinhaEscala(j.escalas.sabado)}</div>
                        <div><b>Domingo:</b> ${formatarLinhaEscala(j.escalas.domingo)}</div>
                        <div><b>Feriado:</b> ${formatarLinhaEscala(j.escalas.feriado)}</div>
                    </div>
                </div>`;
        }
    });
}

async function editarJornada(id) {
    const doc = await db.collection("jornadas").doc(id).get();
    const j = doc.data();
    
    document.getElementById('jornada-empresa').value = j.empresa;
    document.getElementById('jornada-setor').value = j.setor || "Tráfego"; // Novo campo
    document.getElementById('jornada-periodo').value = j.periodo;
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
}

function limparFormJornada() { 
    document.getElementById('form-jornada').reset(); 
    document.querySelectorAll('[class^="chk-escala-"]').forEach(cb => cb.checked = false);
    document.getElementById('edit-id-jornada').value = ""; 
}

async function excluirJornada(id) { if (confirm("Excluir jornada?")) { await db.collection("jornadas").doc(id).delete(); renderizarJornadas(); } }
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