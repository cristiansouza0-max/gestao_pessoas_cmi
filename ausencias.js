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
    try {
        const snapshot = await db.collection("funcionarios").orderBy("apelido").get();
        cacheFuncionarios = [];
        selectForm.innerHTML = '<option value="">Selecione...</option>';
        snapshot.forEach(doc => {
            const f = doc.data();
            if (f.status !== "Inativo") {
                cacheFuncionarios.push(f);
                const opt = `<option value="${f.apelido}">${f.apelido}</option>`;
                selectForm.innerHTML += opt;
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

function extrairListaDatas(str, modo) {
    const formatar = (s) => {
        const [d, m, y] = s.split('/').map(Number);
        return new Date(y, m - 1, d).toDateString();
    };
    if (modo === 'range') {
        const partes = str.split(' até ');
        if (partes.length < 2) return [];
        let dInic = new Date(partes[0].split('/')[2], partes[0].split('/')[1]-1, partes[0].split('/')[0]);
        let dFim = new Date(partes[1].split('/')[2], partes[1].split('/')[1]-1, partes[1].split('/')[0]);
        let arr = [];
        while (dInic <= dFim) {
            arr.push(new Date(dInic).toDateString());
            dInic.setDate(dInic.getDate() + 1);
        }
        return arr;
    }
    return str.split(' ; ').map(s => formatar(s));
}

function mostrarPopUpAlerta(mensagem) {
    const overlay = document.createElement('div');
    overlay.className = 'alerta-overlay';
    overlay.innerHTML = `<div class="alerta-modal"><i class="fa-solid fa-circle-exclamation"></i><h2>Duplicidade!</h2><p>${mensagem}</p><button onclick="this.parentElement.parentElement.remove()">Entendido</button></div>`;
    document.body.appendChild(overlay);
}

document.getElementById('form-ausencia').addEventListener('submit', async function(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-submit');
    const funcionarioNome = document.getElementById('select-funcionario').value;
    const tipo = document.getElementById('tipo-ausencia').value;
    const obs = document.getElementById('obs-ausencia').value;
    const datas = document.getElementById('calendario-dinamico').value;
    const modo = document.getElementById('modo-data').value;
    const statusFinal = isMaster ? "Aprovado" : "Pendente";

    if (isMaster && tipo === "Folga" && obs !== "Programada") {
        const fAlvo = cacheFuncionarios.find(x => x.apelido === funcionarioNome);
        const listaDatasNovas = extrairListaDatas(datas, modo);
        let conflitoEncontrado = false;
        for (let ausExistente of cacheAusencias) {
            if (ausExistente.status === "Reprovado") continue;
            if (ausExistente.tipo === "Folga" && ausExistente.observacao !== "Programada") {
                const fExistente = cacheFuncionarios.find(x => x.apelido === ausExistente.funcionario);
                if (fExistente && fExistente.empresa === fAlvo.empresa && fExistente.periodo === fAlvo.periodo) {
                    const datasExistentes = extrairListaDatas(ausExistente.datas, ausExistente.modo);
                    for (let d of listaDatasNovas) {
                        if (datasExistentes.includes(d)) {
                            conflitoEncontrado = true;
                            break;
                        }
                    }
                }
            }
            if (conflitoEncontrado) break;
        }
        if (conflitoEncontrado) {
            mostrarPopUpAlerta(`Já existe uma folga manual registrada para este grupo nesta data.`);
            return;
        }
    }

    const dados = { 
        funcionario: funcionarioNome, 
        tipo, observacao: obs, datas, modo, 
        status: statusFinal,
        solicitadoPor: usuarioLogado.nomeCompleto,
        criadoEm: new Date().getTime() 
    };

    btn.disabled = true;
    try {
        await db.collection("ausencias").add(dados);
        alert(isMaster ? "Registro salvo!" : "Solicitação enviada para aprovação do Master!");
        this.reset();
        if (!isMaster) carregarFuncionarios();
        configurarCalendario();
        await renderizarAusencias();
    } catch (e) { alert("Erro ao salvar."); }
    btn.disabled = false;
});

async function renderizarAusencias() {
    const fFunc = document.getElementById('filtro-func-hist') ? document.getElementById('filtro-func-hist').value : "TODOS";
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
            const statusAtual = aus.status || "Aprovado"; // Se não tiver status, assume Aprovado (antigos)
            cacheAusencias.push({ id, ...aus, status: statusAtual });

            let passaFiltro = true;
            if (!isMaster && aus.funcionario !== meuApelido) passaFiltro = false;
            if (isMaster && fFunc !== "TODOS" && aus.funcionario !== fFunc) passaFiltro = false;

            if (passaFiltro) {
                const target = containers[aus.tipo];
                if (target) {
                    const total = calcularTotalDias(aus.datas, aus.modo);
                    const isPendente = statusAtual === "Pendente";
                    
                    const card = document.createElement('div');
                    card.className = `card-ausencia ${isPendente ? 'pendente' : ''}`;

                    // Lógica de Ações e Selos
                    let badgeStatus = `<span class="badge-status-ausencia ${isPendente ? 'status-pendente' : 'status-aprovado'}">${statusAtual}</span>`;
                    let acoes = "";

                    if (isMaster) {
                        if (isPendente) {
                            acoes = `
                                <button onclick="decidirAusencia('${id}', 'Aprovado', '${aus.funcionario}')" class="btn-aprovar" title="Aprovar"><i class="fa-solid fa-circle-check"></i></button>
                                <button onclick="decidirAusencia('${id}', 'Reprovado', '${aus.funcionario}')" class="btn-reprovar" title="Reprovar"><i class="fa-solid fa-circle-xmark"></i></button>
                            `;
                        } else {
                            // Mesmo para o Master, mostramos o selo de aprovado e o botão de excluir
                            acoes = `<button onclick="excluirAusencia('${id}')" class="btn-icon-delete"><i class="fa-solid fa-trash-can"></i></button>`;
                        }
                    }

                    card.innerHTML = `
                        <div class="card-header-func">
                            <div>${aus.funcionario} ${badgeStatus}</div>
                            <span class="badge-dias">${total} ${total > 1 ? 'dias' : 'dia'}</span>
                        </div>
                        <div class="card-body-ausencia">
                            <div class="ausencia-info">${aus.datas} - ${aus.observacao}</div>
                            <div class="card-action-column">${acoes}</div>
                        </div>`;
                    target.appendChild(card);
                }
            }
        });

        // Mensagem de vazio
        Object.keys(containers).forEach(key => { 
            if(containers[key] && containers[key].innerHTML === "") {
                containers[key].innerHTML = "<p style='font-size:0.7rem; color:gray; text-align:center; padding-top:10px;'>Vazio</p>";
            }
        });

    } catch (e) { console.error(e); }
}

async function decidirAusencia(id, decisao, nomeFunc) {
    if (decisao === "Aprovado") {
        await db.collection("ausencias").doc(id).update({ status: "Aprovado" });
        alert(`Ausência de ${nomeFunc} Aprovada!`);
    } else {
        if (confirm(`Reprovar e excluir solicitação de ${nomeFunc}?`)) {
            await db.collection("ausencias").doc(id).delete();
            alert(`Solicitação de ${nomeFunc} removida.`);
        }
    }
    renderizarAusencias();
}

async function excluirAusencia(id) {
    if (confirm("Excluir este registro permanentemente?")) {
        await db.collection("ausencias").doc(id).delete();
        renderizarAusencias();
    }
}

function configurarCalendario() {
    const modo = document.getElementById('modo-data').value;
    if (fp) fp.destroy();
    fp = flatpickr("#calendario-dinamico", { mode: modo, dateFormat: "d/m/Y", locale: "pt", conjunction: " ; ", rangeSeparator: " até " });
}

function calcularTotalDias(strDatas, modo) {
    if (!strDatas) return 0;
    if (modo === 'single') return 1;
    if (modo === 'multiple') return strDatas.split(" ; ").length;
    if (modo === 'range') {
        const partes = strDatas.split(" até ");
        if (partes.length < 2) return 1;
        const toD = (s) => { const [d, m, y] = s.split('/').map(Number); return new Date(y, m-1, d); };
        return Math.ceil(Math.abs(toD(partes[1]) - toD(partes[0])) / 86400000) + 1;
    }
    return 0;
}

function limparFormulario() {
    document.getElementById('form-ausencia').reset();
    document.getElementById('edit-id').value = "";
    document.getElementById('btn-submit').innerText = "Registrar";
    configurarCalendario();
    if (!isMaster) carregarFuncionarios();
}

function logout() {
    sessionStorage.removeItem('usuarioAtivo');
    window.location.href = 'login.html';
}