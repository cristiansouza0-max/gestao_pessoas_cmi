if (!sessionStorage.getItem('usuarioAtivo')) window.location.href = 'login.html';

const usuarioLogado = JSON.parse(sessionStorage.getItem('usuarioAtivo'));
const isMaster = usuarioLogado.perfilMaster === true;

let fp; 
let cacheFuncionarios = [];
let cacheAusencias = [];
let unsubscribeAusencias = null; // Para gerenciar a escuta em tempo real

document.addEventListener('DOMContentLoaded', () => {
    ajustarSidebar();
    configurarCalendario();
    
    // Primeiro carregamos os funcionários, depois iniciamos as escutas
    carregarFuncionarios().then(() => {
        iniciarEscutaAusencias(); // Nova função para a lista em tempo real
        monitorarNotificacoes(); // Pop-ups
    });
});

function ajustarSidebar() {
    const usuarioLogado = JSON.parse(sessionStorage.getItem('usuarioAtivo'));
    if (!usuarioLogado) {
        window.location.href = 'login.html';
        return;
    }

    const isMaster = usuarioLogado.perfilMaster === true;
    const permissoes = usuarioLogado.permissoes || [];
    const paginaAtual = window.location.pathname.split("/").pop().replace(".html", "");

    document.querySelectorAll('.sidebar ul li a').forEach(link => {
        const href = link.getAttribute('href').replace('.html', '');
        
        // --- A CORREÇÃO ESTÁ AQUI ---
        // Se for o link de Logout (href="#"), ou a página de Início (index), não esconde nunca.
        if (link.getAttribute('href') === "#" || href === "index") {
            link.parentElement.style.display = 'block';
            return; // Pula para o próximo link
        }

        // Regra para as outras páginas
        if (!isMaster && !permissoes.includes(href)) {
            link.parentElement.style.display = 'none';
        } else {
            link.parentElement.style.display = 'block';
        }
    });

    // Trava de segurança para acesso via URL
    if (!isMaster && paginaAtual !== "index" && paginaAtual !== "" && !permissoes.includes(paginaAtual)) {
        window.location.href = "index.html";
    }
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
                if (filtroHist) filtroHist.innerHTML += opt;
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

// --- ESCUTA EM TEMPO REAL PARA OS CARTÕES ---
function iniciarEscutaAusencias() {
    // Se já houver uma escuta ativa (mudança de filtro), paramos ela
    if (unsubscribeAusencias) unsubscribeAusencias();

    // Filtros de UI
    const fEmpresa = document.getElementById('filtro-empresa-hist').value;
    const fFunc = document.getElementById('filtro-func-hist').value;
    const meuFunc = cacheFuncionarios.find(f => f.nome === usuarioLogado.nomeCompleto);
    const meuApelido = meuFunc ? meuFunc.apelido : "";

    // Criamos a consulta básica
    let query = db.collection("ausencias").orderBy("criadoEm", "desc");

    // Iniciamos a escuta (onSnapshot em vez de get)
    unsubscribeAusencias = query.onSnapshot(snapshot => {
        const containers = {
            "Folga": document.getElementById('lista-Folga'),
            "Falta": document.getElementById('lista-Falta'),
            "Férias": document.getElementById('lista-Férias'),
            "Licença": document.getElementById('lista-Outros'),
            "Afastamento": document.getElementById('lista-Outros')
        };

        Object.values(containers).forEach(c => { if(c) c.innerHTML = ""; });
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
    });
}

// Funções para reagir aos filtros do Master e reiniciar a escuta
document.getElementById('filtro-empresa-hist').addEventListener('change', iniciarEscutaAusencias);
document.getElementById('filtro-func-hist').addEventListener('change', iniciarEscutaAusencias);

// --- SALVAMENTO ---
document.getElementById('form-ausencia').addEventListener('submit', async function(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-submit');
    const idEdicao = document.getElementById('edit-id').value;
    
    const funcionarioNome = document.getElementById('select-funcionario').value;
    const tipo = document.getElementById('tipo-ausencia').value;
    const obs = document.getElementById('obs-ausencia').value;
    const datas = document.getElementById('calendario-dinamico').value;
    const modo = document.getElementById('modo-data').value;
    
    // Objeto base
    const dados = { 
        funcionario: funcionarioNome, 
        tipo: tipo, 
        observacao: obs, 
        datas: datas, 
        modo: modo, 
        status: isMaster ? "Aprovada" : "Pendente",
        notificadoMaster: isMaster ? true : false,
        notificadoUser: false,
        justificativa: "",
        solicitadoPor: usuarioLogado.nomeCompleto,
        atualizadoEm: new Date().getTime()
    };

    btn.disabled = true;
    try {
        if (idEdicao === "") {
            // Novo Registro: adiciona data de criação
            dados.criadoEm = new Date().getTime();
            await db.collection("ausencias").add(dados);
            alert(isMaster ? "Registro salvo!" : "Solicitação enviada!");
        } else {
            // Edição: Usa update sem mexer no criadoEm
            await db.collection("ausencias").doc(idEdicao).update(dados);
            alert("Registro atualizado com sucesso!");
        }
        limparFormulario();
        // O renderizarAusencias() será chamado automaticamente pelo onSnapshot se estiver ativo
    } catch (e) { 
        console.error("Erro ao salvar:", e);
        alert("Erro ao salvar. Verifique o console."); 
    }
    btn.disabled = false;
});

// --- POP-UPS E NOTIFICAÇÕES ---
function exibirNotificacaoCentral(config) {
    const overlay = document.createElement('div');
    overlay.className = 'alerta-overlay';
    overlay.innerHTML = `
        <div class="alerta-modal" style="border-top: 10px solid ${config.cor};">
            <i class="${config.icone}" style="color: ${config.cor}; font-size: 3rem; margin-bottom: 15px;"></i>
            <h2>${config.titulo}</h2>
            <p style="margin-bottom: 20px;">${config.mensagem}</p>
            <button onclick="this.closest('.alerta-overlay').remove();" style="background: ${config.cor}; color: white; border: none; padding: 12px 25px; border-radius: 8px; cursor: pointer; font-weight: bold;">ENTENDIDO</button>
        </div>`;
    document.body.appendChild(overlay);
}

async function monitorarNotificacoes() {
    if (isMaster) {
        db.collection("ausencias").where("status", "==", "Pendente").where("notificadoMaster", "==", false)
            .onSnapshot(snap => {
                let nomes = [];
                snap.forEach(doc => { 
                    nomes.push(doc.data().funcionario);
                    db.collection("ausencias").doc(doc.id).update({ notificadoMaster: true });
                });
                if (nomes.length > 0) {
                    exibirNotificacaoCentral({
                        titulo: "Novo Pedido", cor: "#3498db", icone: "fa-solid fa-bell",
                        mensagem: `Há um pedido de Ausência do(s) funcionário(s): <strong>${[...new Set(nomes)].join(", ")}</strong>`
                    });
                }
            });
    } else {
        const meuFunc = cacheFuncionarios.find(f => f.nome === usuarioLogado.nomeCompleto);
        if (!meuFunc) return;
        db.collection("ausencias").where("funcionario", "==", meuFunc.apelido).where("notificadoUser", "==", false)
            .onSnapshot(snap => {
                snap.forEach(doc => {
                    const aus = doc.data();
                    if (aus.status === "Aprovada") {
                        exibirNotificacaoCentral({
                            titulo: "Ausência Aprovada!", cor: "#27ae60", icone: "fa-solid fa-circle-check",
                            mensagem: `Sua ausência de <strong>${aus.tipo}</strong> foi APROVADA pelo Líder.`
                        });
                        db.collection("ausencias").doc(doc.id).update({ notificadoUser: true });
                    } else if (aus.status === "Recusada") {
                        exibirNotificacaoCentral({
                            titulo: "Ausência Recusada", cor: "#e74c3c", icone: "fa-solid fa-circle-xmark",
                            mensagem: `Sua ausência de <strong>${aus.tipo}</strong> foi RECUSADA pelo Líder devido a: <em>${aus.justificativa}</em>`
                        });
                        db.collection("ausencias").doc(doc.id).update({ notificadoUser: true });
                    }
                });
            });
    }
}

// --- AÇÕES DO MASTER ---
async function decidirAusencia(id, decisao, nomeFunc) {
    if (decisao === "Aprovada") {
        await db.collection("ausencias").doc(id).update({ 
            status: "Aprovada",
            notificadoUser: false 
        });
    } else {
        const motivo = prompt(`Justificativa para recusar a ausência de ${nomeFunc}:`);
        if (!motivo) return;
        await db.collection("ausencias").doc(id).update({ 
            status: "Recusada", 
            justificativa: motivo, 
            notificadoUser: false 
        });
    }
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
    document.getElementById('btn-submit').innerText = "Atualizar Registro";
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function excluirAusencia(id) {
    if (confirm("Excluir?")) {
        await db.collection("ausencias").doc(id).delete();
    }
}

// --- AUXILIARES ---
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