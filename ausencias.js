if (!sessionStorage.getItem('usuarioAtivo')) window.location.href = 'login.html';

const usuarioLogado = JSON.parse(sessionStorage.getItem('usuarioAtivo'));
const isMaster = usuarioLogado.perfilMaster === true;

let fp; 
let cacheFuncionarios = [];
let cacheAusencias = [];
let unsubscribeAusencias = null;
let funcionariosVencendo = [];

document.addEventListener('DOMContentLoaded', () => {
    ajustarSidebar();
    configurarCalendario();
    carregarFuncionarios().then(() => {
        iniciarEscutaAusencias();
        monitorarNotificacoes();
    });
});

function atualizarPaginaCompleta() {
    carregarFuncionarios().then(() => {
        iniciarEscutaAusencias();
    });
}

function ajustarSidebar() {
    const permissoes = usuarioLogado.permissoes || [];
    document.querySelectorAll('.sidebar ul li a').forEach(link => {
        const href = link.getAttribute('href').replace('.html', '');
        if (link.getAttribute('href') === "#" || href === "index") {
            link.parentElement.style.display = 'block'; return;
        }
        if (!isMaster && !permissoes.includes(href)) link.parentElement.style.display = 'none';
        else link.parentElement.style.display = 'block';
    });
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
                let passa = (empGlobal === "TODAS" || f.empresa === empGlobal) && (setorGlobal === "TODOS" || f.setor === setorGlobal);
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
            if (meuFunc) { selectForm.value = meuFunc.apelido; selectForm.disabled = true; }
        }
    } catch (e) { console.error(e); }
}

function verificarTodosVencimentos() {
    funcionariosVencendo = [];
    const hoje = new Date();

    cacheFuncionarios.forEach(f => {
        if (f.funcao === "Aprendiz") return;
        const temFeriasNoHistorico = cacheAusencias.some(aus => 
            aus.funcionario === f.apelido && aus.tipo === "Férias" && 
            (aus.observacao === "Programada" || aus.observacao === "Marcada")
        );
        if (temFeriasNoHistorico) return;

        let rawData = f.dataAdmissao || f.admissao || f.data_admissao;
        let dBase = converterParaData(rawData);
        if (!dBase) return;
        const diaAdm = dBase.getDate();
        const mesAdm = dBase.getMonth();

        for (let ano = 2025; ano <= 2026; ano++) {
            let dataVenc = new Date(ano, mesAdm, diaAdm);
            dataVenc.setDate(dataVenc.getDate() - 1);
            const diffDias = Math.ceil((dataVenc - hoje) / (1000 * 60 * 60 * 24));
            if (diffDias > 0 && diffDias <= 90) {
                funcionariosVencendo.push({ nome: f.apelido, data: dataVenc.toLocaleDateString('pt-BR'), dias: diffDias });
            }
        }
    });

    funcionariosVencendo.sort((a, b) => a.dias - b.dias);
    const btn = document.getElementById('btn-alerta-vencimentos');
    const badge = document.getElementById('contagem-vencimentos');
    if (funcionariosVencendo.length > 0) {
        btn.style.display = 'flex'; btn.classList.add('pulsing');
        badge.innerText = funcionariosVencendo.length;
    } else { btn.style.display = 'none'; btn.classList.remove('pulsing'); }
}

function abrirModalResumoVencimentos() {
    const overlay = document.createElement('div');
    overlay.className = 'alerta-overlay';
    let listaHtml = funcionariosVencendo.map(item => `
        <div class="item-vencimento">
            <div class="venc-info-col"><span class="nome-func">${item.nome}</span></div>
            <div class="venc-data-col"><span class="data-venc">${item.data}</span><span class="prazo-venc">${item.dias} dias p/ vencer</span></div>
            <button class="btn-alerta-edit" onclick="preencherFeriasDeAlerta('${item.nome}')" title="Programar Férias"><i class="fa-solid fa-pencil"></i></button>
        </div>
    `).join('');

    overlay.innerHTML = `
        <div class="alerta-modal modal-lista-vencimentos">
            <i class="fa-solid fa-calendar-check" style="color: #f39c12; font-size: 2.8rem; margin-bottom:15px;"></i>
            <h2 style="font-size:1.8rem;">Próximos Vencimentos de Férias</h2>
            <div class="lista-vencimentos-container">${listaHtml}</div>
            <button onclick="this.closest('.alerta-overlay').remove();" style="background: #2c3e50; color: white; width:100%; padding:15px; font-size:1rem; margin-top:10px; border-radius:25px;">FECHAR</button>
        </div>`;
    document.body.appendChild(overlay);
}

function preencherFeriasDeAlerta(apelido) {
    const overlay = document.querySelector('.alerta-overlay');
    if (overlay) overlay.remove();
    document.getElementById('select-funcionario').value = apelido;
    document.getElementById('tipo-ausencia').value = 'Férias';
    document.getElementById('modo-data').value = 'range';
    configurarCalendario(); verificarTipoAusencia();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function verificarTipoAusencia() {
    const tipo = document.getElementById('tipo-ausencia').value;
    const colVenc = document.getElementById('col-vencimento');
    const func = document.getElementById('select-funcionario').value;
    if (tipo === 'Férias' && func) { colVenc.style.display = 'flex'; gerarOpcoesVencimento(func); } 
    else { colVenc.style.display = 'none'; }
}

function gerarOpcoesVencimento(apelido) {
    const f = cacheFuncionarios.find(x => x.apelido === apelido);
    const select = document.getElementById('vencimento-ferias');
    select.innerHTML = '<option value="">Selecione...</option>';
    if (!f) return;
    let dBase = converterParaData(f.dataAdmissao || f.admissao);
    if (!dBase) return;
    const dia = dBase.getDate(); const mes = dBase.getMonth();
    for (let ano = 2025; ano <= 2030; ano++) {
        let dataVenc = new Date(ano, mes, dia); dataVenc.setDate(dataVenc.getDate() - 1);
        const dataStr = dataVenc.toLocaleDateString('pt-BR');
        const opt = document.createElement('option'); opt.value = dataStr; opt.textContent = dataStr;
        select.appendChild(opt);
    }
}

document.getElementById('form-ausencia').addEventListener('submit', async function(e) {
    e.preventDefault();
    const tipo = document.getElementById('tipo-ausencia').value;
    const datas = document.getElementById('calendario-dinamico').value;
    const vencRef = document.getElementById('vencimento-ferias').value;
    if (tipo === 'Férias' && vencRef && datas) {
        const dInicio = converterParaData(datas.split(/ até | ; /)[0]);
        const dVenc = converterParaData(vencRef);
        if (dInicio < dVenc) {
            exibirNotificacaoCentral({ titulo: "Conflito", cor: "#e74c3c", icone: "", mensagem: "Período selecionado, antes do vencimento das Férias" });
            return;
        }
    }
    const idEdicao = document.getElementById('edit-id').value;
    const dados = { 
        funcionario: document.getElementById('select-funcionario').value, tipo, 
        observacao: document.getElementById('obs-ausencia').value, datas, 
        modo: document.getElementById('modo-data').value, vencimentoReferencia: vencRef,
        status: isMaster ? "Aprovada" : "Pendente", notificadoMaster: isMaster, notificadoUser: false, 
        justificativa: "", solicitadoPor: usuarioLogado.nomeCompleto, atualizadoEm: new Date().getTime() 
    };
    try {
        if (idEdicao === "") { dados.criadoEm = new Date().getTime(); await db.collection("ausencias").add(dados); }
        else { await db.collection("ausencias").doc(idEdicao).update(dados); }
        limparFormulario(); alert("Registrado!");
    } catch (e) { console.error(e); }
});

function converterParaData(str) {
    if (!str) return null; if (str.seconds) return str.toDate();
    let d; if (typeof str === 'string') {
        if (str.includes('/')) { const p = str.split('/'); d = new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0])); }
        else if (str.includes('-')) { const p = str.split('-'); if (p[0].length === 4) d = new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2])); else d = new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0])); }
    }
    return (d && !isNaN(d.getTime())) ? d : null;
}

function calcularTotalDias(str, modo) {
    if (!str) return 0; if (modo === 'single') return 1; if (modo === 'multiple') return str.split(" ; ").length;
    const p = str.split(" até "); if (p.length < 2) return 1;
    const d1 = converterParaData(p[0]); const d2 = converterParaData(p[1]);
    return Math.ceil(Math.abs(d2 - d1) / 86400000) + 1;
}

function iniciarEscutaAusencias() {
    if (unsubscribeAusencias) unsubscribeAusencias();
    const empGlobal = document.getElementById('filtro-empresa-global').value;
    const setorGlobal = document.getElementById('filtro-setor-global').value;
    const fHist = document.getElementById('filtro-func-hist').value;

    unsubscribeAusencias = db.collection("ausencias").orderBy("criadoEm", "desc").onSnapshot(snapshot => {
        const containers = { "Folga": document.getElementById('lista-Folga'), "Falta": document.getElementById('lista-Falta'), "Férias": document.getElementById('lista-Férias'), "Outros": document.getElementById('lista-Outros') };
        Object.values(containers).forEach(c => c.innerHTML = "");
        cacheAusencias = [];

        snapshot.forEach(doc => {
            const aus = doc.data(); const id = doc.id; let status = aus.status || "Aprovada";
            cacheAusencias.push({ id, ...aus });
            let passa = true;
            if (isMaster) {
                const f = cacheFuncionarios.find(x => x.apelido === aus.funcionario);
                if (empGlobal !== "TODAS" && (!f || f.empresa !== empGlobal)) passa = false;
                if (setorGlobal !== "TODOS" && (!f || f.setor !== setorGlobal)) passa = false;
                if (fHist !== "TODOS" && aus.funcionario !== fHist) passa = false;
            } else if (aus.funcionario !== cacheFuncionarios.find(x => x.nome === usuarioLogado.nomeCompleto)?.apelido) passa = false;
            if (status === "Recusada") passa = false;

            if (passa) {
                const tipoKey = (aus.tipo === "Folga" || aus.tipo === "Falta" || aus.tipo === "Férias") ? aus.tipo : "Outros";
                const target = containers[tipoKey]; const total = calcularTotalDias(aus.datas, aus.modo);
                let refText = (aus.tipo === "Férias" && aus.vencimentoReferencia) ? `<strong style="display:block; color:#2980b9; margin-bottom:4px; font-size:0.7rem;">Referente ao Vencimento ${aus.vencimentoReferencia}</strong>` : "";
                const card = document.createElement('div');
                card.className = `card-ausencia ${status === 'Pendente' ? 'pendente' : ''}`;
                let acoes = isMaster ? (status === 'Pendente' ? 
                    `<button onclick="decidirAusencia('${id}','Aprovada')" class="btn-aprovar"><i class="fa-solid fa-circle-check"></i></button><button onclick="decidirAusencia('${id}','Recusada')" class="btn-reprovar"><i class="fa-solid fa-circle-xmark"></i></button>` : 
                    `<button onclick="editarAusencia('${id}')" class="btn-icon-edit"><i class="fa-solid fa-pencil"></i></button><button onclick="excluirAusencia('${id}')" class="btn-icon-delete"><i class="fa-solid fa-trash-can"></i></button>`) : "";
                card.innerHTML = `<div class="card-header-func">${aus.funcionario} <span class="badge-status-ausencia ${status==='Pendente'?'status-pendente':'status-aprovada'}">${status}</span> <span class="badge-dias">${total}d</span></div><div class="card-body-ausencia"><div class="ausencia-info">${refText}${aus.datas} - ${aus.observacao}</div><div class="card-action-column">${acoes}</div></div>`;
                target.appendChild(card);
            }
        });
        verificarTodosVencimentos();
    });
}

function configurarCalendario() {
    const modo = document.getElementById('modo-data').value;
    if (fp) fp.destroy();
    fp = flatpickr("#calendario-dinamico", { mode: modo, dateFormat: "d/m/Y", locale: "pt", conjunction: " ; ", rangeSeparator: " até " });
}

function limparFormulario() { 
    document.getElementById('form-ausencia').reset(); 
    document.getElementById('edit-id').value = ""; 
    document.getElementById('btn-submit').innerText = "Registrar"; 
    document.getElementById('col-vencimento').style.display = 'none';
    configurarCalendario(); 
}

function exibirNotificacaoCentral(config) {
    const overlay = document.createElement('div'); overlay.className = 'alerta-overlay';
    let iconeHtml = config.icone ? `<i class="${config.icone}" style="color: ${config.cor};"></i>` : '';
    overlay.innerHTML = `<div class="alerta-modal" style="border-top-color: ${config.cor};">${iconeHtml}<h2>${config.titulo}</h2><p>${config.mensagem}</p><button onclick="this.closest('.alerta-overlay').remove();" style="background: ${config.cor}; color: white;">Entendido</button></div>`;
    document.body.appendChild(overlay);
}

async function decidirAusencia(id, decisao) {
    if (decisao === "Aprovada") await db.collection("ausencias").doc(id).update({ status: "Aprovada", notificadoUser: false });
    else { const m = prompt("Motivo da recusa:"); if (m) await db.collection("ausencias").doc(id).update({ status: "Recusada", justificativa: m, notificadoUser: false }); }
}

function editarAusencia(id) {
    db.collection("ausencias").doc(id).get().then(doc => {
        const aus = doc.data(); document.getElementById('edit-id').value = id;
        document.getElementById('select-funcionario').value = aus.funcionario;
        document.getElementById('tipo-ausencia').value = aus.tipo; verificarTipoAusencia();
        if(aus.tipo === 'Férias') document.getElementById('vencimento-ferias').value = aus.vencimentoReferencia || "";
        document.getElementById('obs-ausencia').value = aus.observacao; document.getElementById('modo-data').value = aus.modo;
        configurarCalendario(); fp.setDate(aus.datas.replace(" até ", " ; ").split(" ; "));
        document.getElementById('btn-submit').innerText = "Atualizar";
    });
}

async function excluirAusencia(id) { if (confirm("Excluir?")) await db.collection("ausencias").doc(id).delete(); }

async function monitorarNotificacoes() {
    if (isMaster) {
        db.collection("ausencias").where("status", "==", "Pendente").where("notificadoMaster", "==", false).onSnapshot(snap => {
            let nomes = []; snap.forEach(doc => { nomes.push(doc.data().funcionario); db.collection("ausencias").doc(doc.id).update({ notificadoMaster: true }); });
            if (nomes.length > 0) exibirNotificacaoCentral({ titulo: "Novo Pedido", cor: "#3498db", icone: "fa-solid fa-bell", mensagem: `Pedidos pendentes de: ${[...new Set(nomes)].join(", ")}` });
        });
    }
}

function logout() { sessionStorage.removeItem('usuarioAtivo'); window.location.href = 'login.html'; }