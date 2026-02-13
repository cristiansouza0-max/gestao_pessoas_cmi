let cacheFuncionariosCompleto = [];

document.addEventListener('DOMContentLoaded', async () => {
    await carregarCacheFuncionarios();
    atualizarInterfaceCompleta();
});

async function carregarCacheFuncionarios() {
    try {
        const snap = await db.collection("funcionarios").where("status", "==", "Ativo").get();
        cacheFuncionariosCompleto = [];
        snap.forEach(doc => cacheFuncionariosCompleto.push({ id: doc.id, ...doc.data() }));
    } catch (e) { console.error(e); }
}

function atualizarInterfaceCompleta() {
    popularFuncionarios();
    renderizarUsuarios();
}

function popularFuncionarios() {
    const select = document.getElementById('select-funcionario-usuario');
    const empGlobal = document.getElementById('global-empresa').value;
    const setGlobal = document.getElementById('global-setor').value;
    select.innerHTML = '<option value="">Selecione o funcionário...</option>';
    const filtrados = cacheFuncionariosCompleto.filter(f => (empGlobal === "TODAS" || f.empresa === empGlobal) && (setGlobal === "TODOS" || f.setor === setGlobal));
    filtrados.sort((a, b) => a.nome.localeCompare(b.nome)).forEach(f => { select.innerHTML += `<option value="${f.nome}">${f.nome} (${f.empresa})</option>`; });
}

document.getElementById('form-usuario').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-id-usuario').value;
    const dados = { nomeCompleto: document.getElementById('select-funcionario-usuario').value, login: document.getElementById('usuario-login').value, senha: document.getElementById('usuario-senha').value, status: document.querySelector('input[name="usuario-status"]:checked').value, perfilMaster: document.getElementById('usuario-master').checked, permissoes: Array.from(document.querySelectorAll('.chk-permissao input:checked')).map(cb => cb.value), precisaTrocarSenha: true, atualizadoEm: Date.now() };
    try {
        if (id === "") await db.collection("usuarios").add(dados);
        else await db.collection("usuarios").doc(id).update(dados);
        limparFormUsuario(); renderizarUsuarios(); alert("Sucesso!");
    } catch (err) { alert("Erro ao salvar."); }
});

async function renderizarUsuarios() {
    const container = document.getElementById('lista-usuarios-grid');
    const empGlobal = document.getElementById('global-empresa').value;
    const setGlobal = document.getElementById('global-setor').value;
    const perLocal = document.getElementById('filtro-periodo-usuarios').value;
    container.innerHTML = "Carregando...";
    try {
        const snap = await db.collection("usuarios").orderBy("nomeCompleto").get();
        container.innerHTML = "";
        snap.forEach(doc => {
            const u = doc.data();
            const dadosF = cacheFuncionariosCompleto.find(f => f.nome === u.nomeCompleto);
            let passa = true;
            if (empGlobal !== "TODAS" && (!dadosF || dadosF.empresa !== empGlobal)) passa = false;
            if (setGlobal !== "TODOS" && (!dadosF || dadosF.setor !== setGlobal)) passa = false;
            if (perLocal !== "TODOS" && (!dadosF || dadosF.periodo !== perLocal)) passa = false;
            if (passa) {
                container.innerHTML += `<div class="card-usuario"><div class="card-usuario-header"><h3>${u.nomeCompleto}</h3>${u.perfilMaster ? '<span class="badge-master">MASTER</span>':''}</div><div class="card-usuario-body">${dadosF?`<small>${dadosF.empresa} - ${dadosF.periodo}</small>`:''}<div><b>Login:</b> ${u.login}</div><div class="status-badge-inline ${u.status==='Ativo'?'status-user-ativo':'status-user-bloqueado'}">${u.status}</div><div class="permissoes-list-card">${(u.permissoes || []).map(p => `<span class="tag-permissao">${p}</span>`).join('')}</div></div><div class="card-usuario-footer"><i class="fa-solid fa-user-pen" onclick="editarUsuario('${doc.id}')"></i><i class="fa-solid fa-trash-can" onclick="excluirUsuario('${doc.id}')"></i></div></div>`;
            }
        });
    } catch (e) { console.error(e); }
}

async function editarUsuario(id) {
    const doc = await db.collection("usuarios").doc(id).get();
    const u = doc.data();
    const select = document.getElementById('select-funcionario-usuario');
    if (!Array.from(select.options).some(o => o.value === u.nomeCompleto)) select.innerHTML += `<option value="${u.nomeCompleto}">${u.nomeCompleto}</option>`;
    document.getElementById('select-funcionario-usuario').value = u.nomeCompleto;
    document.getElementById('usuario-login').value = u.login;
    document.getElementById('usuario-senha').value = u.senha;
    document.getElementById('usuario-master').checked = u.perfilMaster || false;
    document.querySelector(`input[name="usuario-status"][value="${u.status}"]`).checked = true;
    document.querySelectorAll('.chk-permissao input').forEach(cb => { cb.checked = u.permissoes && u.permissoes.includes(cb.value); });
    document.getElementById('edit-id-usuario').value = id;
    document.getElementById('btn-save-usuario').innerText = "Atualizar Usuário";
    window.scrollTo({top: 0, behavior: 'smooth'});
}

function limparFormUsuario() { document.getElementById('form-usuario').reset(); document.querySelectorAll('.chk-permissao input').forEach(cb => cb.checked = false); document.getElementById('edit-id-usuario').value = ""; document.getElementById('btn-save-usuario').innerText = "Salvar Usuário"; }
async function excluirUsuario(id) { if (confirm("Excluir?")) { await db.collection("usuarios").doc(id).delete(); renderizarUsuarios(); } }
function logout() { sessionStorage.removeItem('usuarioAtivo'); window.location.href = 'login.html'; }