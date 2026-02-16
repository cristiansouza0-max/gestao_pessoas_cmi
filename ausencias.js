if (!sessionStorage.getItem('usuarioAtivo')) window.location.href = 'login.html';

const usuarioLogado = JSON.parse(sessionStorage.getItem('usuarioAtivo'));
const isMaster = usuarioLogado.perfilMaster === true;

let fp; 
let cacheFuncionarios = [];
let cacheAusencias = [];
let unsubscribeAusencias = null;

document.addEventListener('DOMContentLoaded', () => {
    ajustarSidebar();
    configurarCalendario();
    
    carregarFuncionarios().then(() => {
        iniciarEscutaAusencias();
        monitorarNotificacoes();
    });
});

function atualizarPaginaCompleta() {
    carregarFuncionarios();
    iniciarEscutaAusencias();
}

function ajustarSidebar() {
    const permissoes = usuarioLogado.permissoes || [];
    const paginaAtual = window.location.pathname.split("/").pop().replace(".html", "");

    document.querySelectorAll('.sidebar ul li a').forEach(link => {
        const href = link.getAttribute('href').replace('.html', '');
        if (link.getAttribute('href') === "#" || href === "index") {
            link.parentElement.style.display = 'block';
            return;
        }
        if (!isMaster && !permissoes.includes(href)) {
            link.parentElement.style.display = 'none';
        } else {
            link.parentElement.style.display = 'block';
        }
    });

    if (!isMaster && paginaAtual !== "index" && paginaAtual !== "" && !permissoes.includes(paginaAtual)) {
        window.location.href = "index.html";
    }
}

async function carregarFuncionarios() {
    const selectForm = document.getElementById('select-funcionario');
    const filtroHist = document.getElementById('filtro-func-hist');
    const empGlobal = document.getElementById('filtro-empresa-global').value;
    const setorGlobal = document.getElementById('filtro-setor-global').value;

    try {
        const snapshot = await db.collection("funcionarios").orderBy("apelido").get();
        cacheFuncionarios = [];
        
        selectForm.innerHTML = '<option value="">Selecione...</option>';
        filtroHist.innerHTML = '<option value="TODOS">Todos</option>';

        snapshot.forEach(doc => {
            const f = doc.data();
            if (f.status !== "Inativo") {
                let passa = true;
                if (empGlobal !== "TODAS" && f.empresa !== empGlobal) passa = false;
                if (setorGlobal !== "TODOS" && f.setor !== setorGlobal) passa = false;

                if (passa) {
                    cacheFuncionarios.push(f);
                    const opt = `<option value="${f.apelido}">${f.apelido}</option>`;
                    selectForm.innerHTML += opt;
                    filtroHist.innerHTML += opt;
                }
            }
        });

        if (!isMaster) {
            const meuFunc = cacheFuncionarios.find(f => f.nome === usuarioLogado.nomeCompleto);
            if (meuFunc) {
                selectForm.value = meuFunc.apelido;
                selectForm.disabled = true;
            }
        }
    } catch (e) { console.error(e); }
}

function configurarCalendario() {
    const modo = document.getElementById('modo-data').value;
    if (fp) fp.destroy();
    fp = flatpickr("#calendario-dinamico", { mode: modo, dateFormat: "d/m/Y", locale: "pt", conjunction: " ; ", rangeSeparator: " até " });
}

function iniciarEscutaAusencias() {
    if (unsubscribeAusencias) unsubscribeAusencias();

    const empGlobal = document.getElementById('filtro-empresa-global').value;
    const setorGlobal = document.getElementById('filtro-setor-global').value;
    const fFunc = document.getElementById('filtro-func-hist').value;
    
    const meuFunc = cacheFuncionarios.find(f => f.nome === usuarioLogado.nomeCompleto);
    const meuApelido = meuFunc ? meuFunc.apelido : "";

    unsubscribeAusencias = db.collection("ausencias").orderBy("criadoEm", "desc").onSnapshot(snapshot => {
        const containers = { "Folga": document.getElementById('lista-Folga'), "Falta": document.getElementById('lista-Falta'), "Férias": document.getElementById('lista-Férias'), "Licença": document.getElementById('lista-Outros'), "Afastamento": document.getElementById('lista-Outros') };
        Object.values(containers).forEach(c => { if(c) c.innerHTML = ""; });
        cacheAusencias = [];

        snapshot.forEach(doc => {
            const aus = doc.data();
            const id = doc.id;
            let statusAtual = aus.status === "Aprovado" ? "Aprovada" : (aus.status || "Aprovada");
            cacheAusencias.push({ id, ...aus, status: statusAtual });

            let passaFiltro = true;
            if (!isMaster && aus.funcionario !== meuApelido) passaFiltro = false;

            if (isMaster) {
                const dF = cacheFuncionarios.find(f => f.apelido === aus.funcionario);
                if (empGlobal !== "TODAS" && (!dF || dF.empresa !== empGlobal)) passaFiltro = false;
                if (setorGlobal !== "TODOS" && (!dF || dF.setor !== setorGlobal)) passaFiltro = false;
                if (fFunc !== "TODOS" && aus.funcionario !== fFunc) passaFiltro = false;
            }

            if (statusAtual === "Recusada") passaFiltro = false;

            if (passaFiltro) {
                const target = containers[aus.tipo];
                if (target) {
                    const total = calcularTotalDias(aus.datas, aus.modo);
                    const isPendente = statusAtual === "Pendente";
                    const card = document.createElement('div');
                    card.className = `card-ausencia ${isPendente ? 'pendente' : ''}`;
                    let acoes = isMaster ? (isPendente ? `<button onclick="decidirAusencia('${id}', 'Aprovada', '${aus.funcionario}')" class="btn-aprovar"><i class="fa-solid fa-circle-check"></i></button><button onclick="decidirAusencia('${id}', 'Recusada', '${aus.funcionario}')" class="btn-reprovar"><i class="fa-solid fa-circle-xmark"></i></button>` : `<button onclick="editarAusencia('${id}')" class="btn-icon-edit"><i class="fa-solid fa-pencil"></i></button><button onclick="excluirAusencia('${id}')" class="btn-icon-delete"><i class="fa-solid fa-trash-can"></i></button>`) : "";

                    card.innerHTML = `<div class="card-header-func">${aus.funcionario} <span class="badge-status-ausencia ${isPendente?'status-pendente':'status-aprovada'}">${statusAtual}</span> <span class="badge-dias">${total} d</span></div><div class="card-body-ausencia"><div class="ausencia-info">${aus.datas} - ${aus.observacao}</div><div class="card-action-column">${acoes}</div></div>`;
                    target.appendChild(card);
                }
            }
        });
        Object.keys(containers).forEach(k => { if(containers[k] && containers[k].innerHTML === "") containers[k].innerHTML = "<p style='font-size:0.7rem; color:gray; text-align:center;'>Vazio</p>"; });
    });
}

document.getElementById('form-ausencia').addEventListener('submit', async function(e) {
    e.preventDefault();
    const idEdicao = document.getElementById('edit-id').value;
    const dados = { funcionario: document.getElementById('select-funcionario').value, tipo: document.getElementById('tipo-ausencia').value, observacao: document.getElementById('obs-ausencia').value, datas: document.getElementById('calendario-dinamico').value, modo: document.getElementById('modo-data').value, status: isMaster ? "Aprovada" : "Pendente", notificadoMaster: isMaster, notificadoUser: false, justificativa: "", solicitadoPor: usuarioLogado.nomeCompleto, atualizadoEm: new Date().getTime() };
    try {
        if (idEdicao === "") { dados.criadoEm = new Date().getTime(); await db.collection("ausencias").add(dados); }
        else { await db.collection("ausencias").doc(idEdicao).update(dados); }
        limparFormulario();
        alert("Sucesso!");
    } catch (e) { console.error(e); }
});

function exibirNotificacaoCentral(config) {
    const overlay = document.createElement('div');
    overlay.className = 'alerta-overlay';
    overlay.innerHTML = `<div class="alerta-modal" style="border-top-color: ${config.cor};"><i class="${config.icone}" style="color: ${config.cor};"></i><h2>${config.titulo}</h2><p>${config.mensagem}</p><button onclick="this.closest('.alerta-overlay').remove();" style="background: ${config.cor}; color: white; border: none; padding: 12px 25px; border-radius: 8px; cursor: pointer; font-weight: bold;">ENTENDIDO</button></div>`;
    document.body.appendChild(overlay);
}

async function monitorarNotificacoes() {
    if (isMaster) {
        db.collection("ausencias").where("status", "==", "Pendente").where("notificadoMaster", "==", false).onSnapshot(snap => {
            let nomes = []; snap.forEach(doc => { nomes.push(doc.data().funcionario); db.collection("ausencias").doc(doc.id).update({ notificadoMaster: true }); });
            if (nomes.length > 0) exibirNotificacaoCentral({ titulo: "Novo Pedido", cor: "#3498db", icone: "fa-solid fa-bell", mensagem: `Pedido(s) de: <strong>${[...new Set(nomes)].join(", ")}</strong>` });
        });
    } else {
        const meuFunc = cacheFuncionarios.find(f => f.nome === usuarioLogado.nomeCompleto);
        if (!meuFunc) return;
        db.collection("ausencias").where("funcionario", "==", meuFunc.apelido).where("notificadoUser", "==", false).onSnapshot(snap => {
            snap.forEach(doc => {
                const aus = doc.data();
                if (aus.status === "Aprovada") { exibirNotificacaoCentral({ titulo: "Aprovada!", cor: "#27ae60", icone: "fa-solid fa-circle-check", mensagem: `Sua ausência de ${aus.tipo} foi aprovada.` }); db.collection("ausencias").doc(doc.id).update({ notificadoUser: true }); }
                else if (aus.status === "Recusada") { exibirNotificacaoCentral({ titulo: "Recusada", cor: "#e74c3c", icone: "fa-solid fa-circle-xmark", mensagem: `Sua ausência foi recusada: ${aus.justificativa}` }); db.collection("ausencias").doc(doc.id).update({ notificadoUser: true }); }
            });
        });
    }
}

async function decidirAusencia(id, decisao, nomeFunc) {
    if (decisao === "Aprovada") await db.collection("ausencias").doc(id).update({ status: "Aprovada", notificadoUser: false });
    else { const m = prompt("Motivo da recusa:"); if (m) await db.collection("ausencias").doc(id).update({ status: "Recusada", justificativa: m, notificadoUser: false }); }
}

function editarAusencia(id) {
    const aus = cacheAusencias.find(a => a.id === id); if (!aus) return;
    document.getElementById('edit-id').value = id;
    document.getElementById('select-funcionario').value = aus.funcionario;
    document.getElementById('tipo-ausencia').value = aus.tipo;
    document.getElementById('obs-ausencia').value = aus.observacao;
    document.getElementById('modo-data').value = aus.modo;
    configurarCalendario();
    fp.setDate(aus.datas.replace(" até ", " ; ").split(" ; "));
    document.getElementById('btn-submit').innerText = "Atualizar";
}

async function excluirAusencia(id) { if (confirm("Excluir?")) await db.collection("ausencias").doc(id).delete(); }

function calcularTotalDias(str, modo) {
    if (!str) return 0; if (modo === 'single') return 1; if (modo === 'multiple') return str.split(" ; ").length;
    const p = str.split(" até "); if (p.length < 2) return 1;
    const parse = (s) => { const [d, m, y] = s.split('/').map(Number); return new Date(y, m-1, d); };
    return Math.ceil(Math.abs(parse(p[1]) - parse(p[0])) / 86400000) + 1;
}

function limparFormulario() { document.getElementById('form-ausencia').reset(); document.getElementById('edit-id').value = ""; document.getElementById('btn-submit').innerText = "Registrar"; configurarCalendario(); }
function logout() { sessionStorage.removeItem('usuarioAtivo'); window.location.href = 'login.html'; }