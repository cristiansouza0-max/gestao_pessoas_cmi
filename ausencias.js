if (!sessionStorage.getItem('usuarioAtivo')) window.location.href = 'login.html';

const usuarioLogado = JSON.parse(sessionStorage.getItem('usuarioAtivo'));
const isMaster = usuarioLogado.perfilMaster === true;

let fp; 
let cacheFuncionarios = [];
let cacheAusencias = [];

document.addEventListener('DOMContentLoaded', () => {
    ajustarSidebar();
    configurarCalendario();
    carregarDadosIniciais();
    if (!isMaster) verificarJustificativas();
});

function ajustarSidebar() {
    const permissoes = usuarioLogado.permissoes || [];
    const paginaAtual = window.location.pathname.split("/").pop().replace(".html", "");
    document.querySelectorAll('.sidebar ul li a').forEach(link => {
        const href = link.getAttribute('href').replace('.html', '');
        if (!isMaster && !permissoes.includes(href) && href !== "index") {
            link.parentElement.style.display = 'none';
        }
    });
    if (!isMaster && paginaAtual !== "index" && !permissoes.includes(paginaAtual)) {
        window.location.href = "index.html";
    }
}

async function carregarDadosIniciais() {
    await carregarFuncionarios();
    await renderizarAusencias();
}

async function carregarFuncionarios() {
    const selectForm = document.getElementById('select-funcionario');
    const filtroHist = document.getElementById('filtro-func-hist');
    
    try {
        const snapshot = await db.collection("funcionarios").orderBy("apelido").get();
        cacheFuncionarios = [];
        
        selectForm.innerHTML = '<option value="">Selecione...</option>';
        if (filtroHist) filtroHist.innerHTML = '<option value="TODOS">TODOS</option>';

        snapshot.forEach(doc => {
            const f = doc.data();
            if (f.status !== "Inativo") {
                cacheFuncionarios.push(f);
                
                const opt = `<option value="${f.apelido}">${f.apelido}</option>`;
                selectForm.innerHTML += opt;
                
                if (filtroHist) {
                    filtroHist.innerHTML += `<option value="${f.apelido}">${f.apelido}</option>`;
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
    fp = flatpickr("#calendario-dinamico", { 
        mode: modo, 
        dateFormat: "d/m/Y", 
        locale: "pt", 
        conjunction: " ; ", 
        rangeSeparator: " até " 
    });
}

document.getElementById('form-ausencia').addEventListener('submit', async function(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-submit');
    const idEdicao = document.getElementById('edit-id').value;
    const funcionarioNome = document.getElementById('select-funcionario').value;
    const tipo = document.getElementById('tipo-ausencia').value;
    const obs = document.getElementById('obs-ausencia').value;
    const datas = document.getElementById('calendario-dinamico').value;
    const modo = document.getElementById('modo-data').value;
    
    const statusFinal = isMaster ? "Aprovada" : "Pendente";

    const dados = { 
        funcionario: funcionarioNome, 
        tipo, observacao: obs, datas, modo, 
        status: statusFinal,
        solicitadoPor: usuarioLogado.nomeCompleto,
        criadoEm: idEdicao ? undefined : new Date().getTime(),
        atualizadoEm: new Date().getTime()
    };

    btn.disabled = true;
    try {
        if (idEdicao === "") {
            await db.collection("ausencias").add(dados);
            alert(isMaster ? "Registro salvo!" : "Solicitação enviada!");
        } else {
            await db.collection("ausencias").doc(idEdicao).update(dados);
            alert("Registro atualizado!");
        }
        limparFormulario();
        await renderizarAusencias();
    } catch (e) { alert("Erro ao salvar."); }
    btn.disabled = false;
});

async function renderizarAusencias() {
    const fEmpresa = document.getElementById('filtro-empresa-hist').value;
    const fFunc = document.getElementById('filtro-func-hist').value;
    const meuFunc = cacheFuncionarios.find(f => f.nome === usuarioLogado.nomeCompleto);
    const meuApelido = meuFunc ? meuFunc.apelido : "";

    const containers = {
        "Folga": document.getElementById('lista-Folga'),
        "Falta": document.getElementById('lista-Falta'),
        "Férias": document.getElementById('lista-Férias'),
        "Licença": document.getElementById('lista-Outros'),
        "Afastamento": document.getElementById('lista-Outros')
    };

    Object.values(containers).forEach(c => { if(c) c.innerHTML = ""; });

    try {
        const snapshot = await db.collection("ausencias").orderBy("criadoEm", "desc").get();
        cacheAusencias = [];

        snapshot.forEach(doc => {
            const aus = doc.data();
            const id = doc.id;
            let statusAtual = aus.status || "Aprovada";
            if (statusAtual === "Aprovado") statusAtual = "Aprovada";

            cacheAusencias.push({ id, ...aus, status: statusAtual });

            let passaFiltro = true;
            if (!isMaster && aus.funcionario !== meuApelido) passaFiltro = false;

            if (isMaster) {
                const dadosFunc = cacheFuncionarios.find(f => f.apelido === aus.funcionario);
                if (fEmpresa !== "TODAS" && (!dadosFunc || dadosFunc.empresa !== fEmpresa)) passaFiltro = false;
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
                    
                    let badgeStatus = `<span class="badge-status-ausencia ${isPendente ? 'status-pendente' : 'status-aprovada'}">${statusAtual}</span>`;
                    
                    let acoes = "";
                    if (isMaster) {
                        if (isPendente) {
                            acoes = `
                                <button onclick="decidirAusencia('${id}', 'Aprovada', '${aus.funcionario}')" class="btn-aprovar" title="Aprovar"><i class="fa-solid fa-circle-check"></i></button>
                                <button onclick="decidirAusencia('${id}', 'Recusada', '${aus.funcionario}')" class="btn-reprovar" title="Recusar"><i class="fa-solid fa-circle-xmark"></i></button>`;
                        } else {
                            acoes = `
                                <button onclick="editarAusencia('${id}')" class="btn-icon-edit" title="Editar"><i class="fa-solid fa-pencil"></i></button>
                                <button onclick="excluirAusencia('${id}')" class="btn-icon-delete" title="Excluir"><i class="fa-solid fa-trash-can"></i></button>`;
                        }
                    }

                    card.innerHTML = `
                        <div class="card-header-func">${aus.funcionario} ${badgeStatus} <span class="badge-dias">${total} ${total > 1 ? 'dias' : 'dia'}</span></div>
                        <div class="card-body-ausencia">
                            <div class="ausencia-info">${aus.datas} - ${aus.observacao}</div>
                            <div class="card-action-column">${acoes}</div>
                        </div>`;
                    target.appendChild(card);
                }
            }
        });

        Object.keys(containers).forEach(key => { 
            if(containers[key] && containers[key].innerHTML === "") {
                containers[key].innerHTML = "<p style='font-size:0.7rem; color:gray; text-align:center; padding-top:10px;'>Vazio</p>";
            }
        });
    } catch (e) { console.error(e); }
}

async function decidirAusencia(id, decisao, nomeFunc) {
    if (decisao === "Aprovada") {
        await db.collection("ausencias").doc(id).update({ status: "Aprovada" });
        alert(`Aprovada!`);
    } else {
        const justificativa = prompt(`Motivo da recusa para ${nomeFunc}:`);
        if (justificativa === null) return;
        if (justificativa.trim() === "") return alert("Justificativa obrigatória.");

        await db.collection("ausencias").doc(id).update({ 
            status: "Recusada", justificativa: justificativa, lida: false 
        });
        alert("Recusada!");
    }
    renderizarAusencias();
}

async function verificarJustificativas() {
    const meuFunc = cacheFuncionarios.find(f => f.nome === usuarioLogado.nomeCompleto);
    if (!meuFunc) return;
    try {
        const snap = await db.collection("ausencias")
            .where("funcionario", "==", meuFunc.apelido)
            .where("status", "==", "Recusada").where("lida", "==", false).get();

        snap.forEach(async (doc) => {
            const aus = doc.data();
            alert(`Sua solicitação de ${aus.tipo} (${aus.datas}) foi RECUSADA.\nMotivo: ${aus.justificativa}`);
            await db.collection("ausencias").doc(doc.id).update({ lida: true });
        });
    } catch (e) { console.error(e); }
}

function editarAusencia(id) {
    const aus = cacheAusencias.find(a => a.id === id);
    if (!aus) return;
    document.getElementById('edit-id').value = id;
    document.getElementById('select-funcionario').value = aus.funcionario;
    document.getElementById('tipo-ausencia').value = aus.tipo;
    document.getElementById('obs-ausencia').value = aus.observacao;
    document.getElementById('modo-data').value = aus.modo;
    configurarCalendario();
    fp.setDate(aus.datas.replace(" até ", " ; ").split(" ; "));
    document.getElementById('btn-submit').innerText = "Atualizar";
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function excluirAusencia(id) {
    if (confirm("Excluir?")) {
        await db.collection("ausencias").doc(id).delete();
        renderizarAusencias();
    }
}

function calcularTotalDias(strDatas, modo) {
    if (!strDatas) return 0;
    if (modo === 'single') return 1;
    if (modo === 'multiple') return strDatas.split(" ; ").length;
    const partes = strDatas.split(" até ");
    if (partes.length < 2) return 1;
    const toD = (s) => { const [d, m, y] = s.split('/').map(Number); return new Date(y, m-1, d); };
    return Math.ceil(Math.abs(toD(partes[1]) - toD(partes[0])) / 86400000) + 1;
}

function limparFormulario() {
    document.getElementById('form-ausencia').reset();
    document.getElementById('edit-id').value = "";
    document.getElementById('btn-submit').innerText = "Registrar";
    configurarCalendario();
}