if (!sessionStorage.getItem('usuarioAtivo')) window.location.href = 'login.html';

const usuarioLogado = JSON.parse(sessionStorage.getItem('usuarioAtivo'));
const isMaster = usuarioLogado.perfilMaster === true;

document.addEventListener('DOMContentLoaded', async () => {
    ajustarSidebar();
    await cachearTodasJornadas();
    atualizarFiltroJornadas(); 
    renderizarCards();
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

let todasJornadasCache = [];

function formatarData(data) {
    if (!data) return "";
    const [ano, mes, dia] = data.split("-");
    return `${dia}/${mes}/${ano}`;
}

function toggleDataStatus() {
    const status = document.querySelector('input[name="status"]:checked').value;
    document.getElementById('col-demissao').style.visibility = status === 'Inativo' ? 'visible' : 'hidden';
}

async function cachearTodasJornadas() {
    const snap = await db.collection("jornadas").get();
    todasJornadasCache = [];
    snap.forEach(doc => {
        const j = doc.data(); j.id = doc.id;
        todasJornadasCache.push(j);
    });
}

function atualizarFiltroJornadas() {
    const empresaSel = document.getElementById('empresa').value;
    const setorSel = document.getElementById('setor').value;
    const periodoSel = document.getElementById('periodo').value;
    const wrapper = document.getElementById('jornadas-selection-wrapper');
    wrapper.innerHTML = "";

    // Filtro refinado: Empresa + Setor + Período
    const filtradas = todasJornadasCache.filter(j => 
        j.empresa === empresaSel && 
        (j.setor === setorSel || !j.setor) && // Compatibilidade com jornadas sem setor salvo
        j.periodo === periodoSel
    );

    if (filtradas.length === 0) {
        wrapper.innerHTML = `<p style="font-size: 0.8rem; color: #999; padding: 10px;">Nenhuma jornada para: ${empresaSel} | ${setorSel} | ${periodoSel}</p>`;
        return;
    }

    filtradas.sort((a, b) => a.ordem - b.ordem).forEach(jor => {
        wrapper.innerHTML += `
            <div class="escala-selection-item">
                <label>
                    <input type="checkbox" value="${jor.id}" class="chk-jornada">
                    <span>${jor.periodo} - Jornada ${jor.ordem}</span>
                </label>
            </div>`;
    });
}

document.getElementById('form-func').addEventListener('submit', async function(e) {
    e.preventDefault();
    const id = document.getElementById('edit-id').value;
    const jornadasIds = Array.from(document.querySelectorAll('.chk-jornada:checked')).map(cb => cb.value);

    const dados = {
        nome: document.getElementById('nome').value,
        apelido: document.getElementById('apelido').value,
        registro: document.getElementById('registro').value,
        nascimento: document.getElementById('nascimento').value,
        empresa: document.getElementById('empresa').value,
        setor: document.getElementById('setor').value,
        funcao: document.getElementById('funcao').value,
        periodo: document.getElementById('periodo').value,
        admissao: document.getElementById('admissao').value,
        demissao: document.getElementById('demissao').value || "",
        status: document.querySelector('input[name="status"]:checked').value,
        jornadasIds: jornadasIds,
        atualizadoEm: Date.now()
    };

    try {
        if (id === "") await db.collection("funcionarios").add(dados);
        else await db.collection("funcionarios").doc(id).update(dados);
        limparFormulario();
        renderizarCards();
    } catch (error) { console.error(error); }
});

async function renderizarCards() {
    const containers = { 
        "AVUL": document.getElementById('lista-avul'), 
        "VCCL": document.getElementById('lista-vccl'),
        "VSBL": document.getElementById('lista-vsbl') 
    };
    
    const filtroSetor = document.getElementById('filtro-setor-lista').value;
    
    Object.values(containers).forEach(c => { if(c) c.innerHTML = ""; });

    const snap = await db.collection("funcionarios").orderBy("nome").get();

    snap.forEach(doc => {
        const f = doc.data();
        
        if (filtroSetor !== "TODOS" && f.setor !== filtroSetor) return;

        const textoStatus = f.status === "Ativo" 
            ? `Ativo desde ${formatarData(f.admissao)}` 
            : `Inativo em ${formatarData(f.demissao)}`;

        let jornadasHtml = "";
        if (f.jornadasIds) {
            f.jornadasIds.forEach(jid => {
                const j = todasJornadasCache.find(x => x.id === jid);
                if (j) jornadasHtml += `<div class="tag-escala-card">${j.periodo} - Jornada ${j.ordem}</div>`;
            });
        }

        const card = document.createElement('div');
        card.className = `card-func border-${f.empresa.toLowerCase()}`;
        card.innerHTML = `
            <div class="card-header-name">
                <div>${f.nome}</div>
                <span class="badge-status status-${f.status}">${textoStatus}</span>
            </div>
            <div class="card-body-container">
                <div class="card-info-content">
                    <div><span>Setor:</span> ${f.setor || 'Tráfego'}</div>
                    <div><span>Apelido:</span> ${f.apelido} - <span>Registro:</span> ${f.registro}</div>
                    <div><span>Data de Nascimento:</span> ${formatarData(f.nascimento)}</div>
                    <div><span>Período:</span> ${f.periodo} - <span>Função:</span> ${f.funcao}</div>
                    <div class="container-escalas-card">
                        <span>Jornada:</span> ${jornadasHtml || 'Não associada'}
                    </div>
                </div>
                <div class="card-action-column">
                    <button onclick="editarFunc('${doc.id}')" class="btn-icon-edit"><i class="fa-solid fa-pencil"></i></button>
                    <button onclick="excluirFunc('${doc.id}')" class="btn-icon-delete"><i class="fa-solid fa-trash-can"></i></button>
                </div>
            </div>`;
        
        if(containers[f.empresa]) containers[f.empresa].appendChild(card);
    });
}

async function editarFunc(id) {
    const doc = await db.collection("funcionarios").doc(id).get();
    const f = doc.data();
    document.getElementById('nome').value = f.nome;
    document.getElementById('apelido').value = f.apelido;
    document.getElementById('registro').value = f.registro;
    document.getElementById('nascimento').value = f.nascimento;
    document.getElementById('empresa').value = f.empresa;
    document.getElementById('setor').value = f.setor || "Tráfego";
    document.getElementById('funcao').value = f.funcao;
    document.getElementById('periodo').value = f.periodo;
    document.getElementById('admissao').value = f.admissao;
    document.getElementById('demissao').value = f.demissao || "";
    document.querySelector(`input[name="status"][value="${f.status}"]`).checked = true;
    toggleDataStatus();
    
    // Atualiza a lista de jornadas baseada nos novos dados carregados (Empresa/Setor/Período)
    atualizarFiltroJornadas();

    // Marca os checkboxes das jornadas que o funcionário já possui
    setTimeout(() => {
        document.querySelectorAll('.chk-jornada').forEach(chk => {
            chk.checked = f.jornadasIds && f.jornadasIds.includes(chk.value);
        });
    }, 150);

    document.getElementById('edit-id').value = id;
    document.getElementById('btn-submit').innerText = "Atualizar Funcionário";
    window.scrollTo({top: 0, behavior: 'smooth'});
}

async function excluirFunc(id) {
    if (confirm("Deseja realmente excluir este funcionário? Esta ação não pode ser desfeita.")) {
        try {
            await db.collection("funcionarios").doc(id).delete();
            renderizarCards();
        } catch (e) { alert("Erro ao excluir."); }
    }
}

function limparFormulario() {
    document.getElementById('form-func').reset();
    document.getElementById('edit-id').value = "";
    document.getElementById('btn-submit').innerText = "Salvar Funcionário";
    document.getElementById('col-demissao').style.visibility = 'hidden';
    atualizarFiltroJornadas();
}
function logout() {
    sessionStorage.removeItem('usuarioAtivo');
    window.location.href = 'login.html';
}