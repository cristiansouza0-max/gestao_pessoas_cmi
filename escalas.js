if (!sessionStorage.getItem('usuarioAtivo')) window.location.href = 'login.html';
document.addEventListener('DOMContentLoaded', () => {
    renderizarEscalas();
    renderizarJornadas();
});

// Calcula carga. Se for 04:00 bruto, não desconta. Senão, desconta 1h.
function calcularCargaInteligente(inicio, fim) {
    if (!inicio || !fim) return "00h00m";
    const toM = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    let d = toM(fim) - toM(inicio);
    if (d < 0) d += 1440; 
    
    // Se a carga for exatamente 4 horas (240 minutos), não desconta nada
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
    await renderizarEscalas();
    await renderizarJornadas();
});

async function renderizarEscalas() {
    const snap = await db.collection("escalas").orderBy("inicioJornada").get();
    const container = document.getElementById('lista-escalas-cards');
    const selects = document.querySelectorAll('.select-escala-ref');
    container.innerHTML = "";
    const optionsHtml = ['<option value="">Folga</option>'];

    snap.forEach(doc => {
        const e = doc.data();
        const carga = calcularCargaInteligente(e.inicioJornada, e.fimJornada);
        container.innerHTML += `
            <div class="card-escala-mini">
                <div class="info-escala-mini">
                    <b>${e.inicioJornada} - ${e.fimJornada}</b>
                    <span>${carga}</span>
                </div>
                <div class="actions">
                    <i class="fa-solid fa-pencil" style="color:#f39c12" onclick="editarEscala('${doc.id}')"></i>
                    <i class="fa-solid fa-trash-can" style="color:#e74c3c" onclick="excluirEscala('${doc.id}')"></i>
                </div>
            </div>`;
        optionsHtml.push(`<option value="${doc.id}">${e.inicioJornada}-${e.fimJornada}</option>`);
    });
    selects.forEach(s => { const val = s.value; s.innerHTML = optionsHtml.join(''); s.value = val; });
}

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

// --- JORNADAS ---
document.getElementById('form-jornada').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-id-jornada').value;
    const dados = {
        empresa: document.getElementById('jornada-empresa').value,
        periodo: document.getElementById('jornada-periodo').value,
        ordem: parseInt(document.getElementById('jornada-ordem').value) || 1,
        escalas: {
            uteis: document.getElementById('select-escala-util').value,
            sabado: document.getElementById('select-escala-sabado').value,
            domingo: document.getElementById('select-escala-domingo').value,
            feriado: document.getElementById('select-escala-feriado').value
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
    const [snapJor, snapEsc] = await Promise.all([db.collection("jornadas").get(), db.collection("escalas").get()]);
    const escalas = {}; snapEsc.forEach(d => { escalas[d.id] = d.data(); });

    const periodos = ["Manhã", "Intermediário", "Tarde", "Noite", "Integral"];
    periodos.forEach(p => { document.getElementById(`col-j-${p}`).innerHTML = ""; });

    let lista = []; snapJor.forEach(doc => { lista.push({ id: doc.id, ...doc.data() }); });
    lista.filter(j => j.empresa === empresaFiltro).sort((a, b) => a.ordem - b.ordem).forEach(j => {
        const getDesc = (id) => {
            const e = escalas[id];
            return e ? `Das <b>${e.inicioJornada}</b> às <b>${e.fimJornada}</b>` : "Folga";
        };
        const container = document.getElementById(`col-j-${j.periodo}`);
        if (container) {
            container.innerHTML += `
                <div class="card-jornada">
                    <div class="card-jornada-header">
                        <span>Jornada ${j.ordem}</span>
                        <div class="actions-j">
                            <i class="fa-solid fa-pencil" style="color:#f39c12" onclick="editarJornada('${j.id}')"></i>
                            <i class="fa-solid fa-trash-can" style="color:#e74c3c" onclick="excluirJornada('${j.id}')"></i>
                        </div>
                    </div>
                    <div class="card-jornada-body">
                        <div><b>Útil:</b> ${getDesc(j.escalas.uteis)}</div>
                        <div><b>Sábado:</b> ${getDesc(j.escalas.sabado)}</div>
                        <div><b>Domingo:</b> ${getDesc(j.escalas.domingo)}</div>
                        <div><b>Feriado:</b> ${getDesc(j.escalas.feriado)}</div>
                    </div>
                </div>`;
        }
    });
}

async function editarJornada(id) {
    const doc = await db.collection("jornadas").doc(id).get();
    const j = doc.data();
    document.getElementById('jornada-empresa').value = j.empresa;
    document.getElementById('jornada-periodo').value = j.periodo;
    document.getElementById('jornada-ordem').value = j.ordem;
    document.getElementById('select-escala-util').value = j.escalas.uteis;
    document.getElementById('select-escala-sabado').value = j.escalas.sabado;
    document.getElementById('select-escala-domingo').value = j.escalas.domingo;
    document.getElementById('select-escala-feriado').value = j.escalas.feriado;
    document.getElementById('edit-id-jornada').value = id;
}

function limparFormJornada() { document.getElementById('form-jornada').reset(); document.getElementById('edit-id-jornada').value = ""; }
async function excluirJornada(id) { if (confirm("Excluir jornada?")) { await db.collection("jornadas").doc(id).delete(); renderizarJornadas(); } }