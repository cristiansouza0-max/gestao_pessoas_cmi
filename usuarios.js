document.addEventListener('DOMContentLoaded', () => {
    popularFuncionarios();
    renderizarUsuarios();
});

async function popularFuncionarios() {
    const select = document.getElementById('select-funcionario-usuario');
    try {
        const snap = await db.collection("funcionarios").where("status", "==", "Ativo").get();
        select.innerHTML = '<option value="">Selecione o funcionário...</option>';
        let lista = [];
        snap.forEach(doc => lista.push(doc.data().nome));
        lista.sort().forEach(nome => {
            select.innerHTML += `<option value="${nome}">${nome}</option>`;
        });
    } catch (e) { console.error(e); }
}

document.getElementById('form-usuario').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-save-usuario');
    const id = document.getElementById('edit-id-usuario').value;

    const permissoes = Array.from(document.querySelectorAll('.chk-permissao input:checked')).map(cb => cb.value);
    const isMaster = document.getElementById('usuario-master').checked;

    const dados = {
        nomeCompleto: document.getElementById('select-funcionario-usuario').value,
        login: document.getElementById('usuario-login').value,
        senha: document.getElementById('usuario-senha').value,
        status: document.querySelector('input[name="usuario-status"]:checked').value,
        perfilMaster: isMaster,
        permissoes: permissoes,
        precisaTrocarSenha: true, // SEMPRE que salvar/resetar, exigirá troca no próximo login
        atualizadoEm: Date.now()
    };

    btn.disabled = true;
    try {
        if (id === "") {
            await db.collection("usuarios").add(dados);
            alert("Usuário criado! Senha provisória definida.");
        } else {
            await db.collection("usuarios").doc(id).update(dados);
            alert("Usuário atualizado! A troca de senha será exigida no próximo login deste usuário.");
        }
        limparFormUsuario();
        renderizarUsuarios();
    } catch (err) { alert("Erro ao salvar."); }
    btn.disabled = false;
});

async function renderizarUsuarios() {
    const container = document.getElementById('lista-usuarios-grid');
    container.innerHTML = "Carregando...";
    try {
        const snap = await db.collection("usuarios").orderBy("nomeCompleto").get();
        container.innerHTML = "";
        snap.forEach(doc => {
            const u = doc.data();
            const id = doc.id;
            const statusClass = u.status === "Ativo" ? "status-user-ativo" : "status-user-bloqueado";
            const tags = (u.permissoes || []).map(p => `<span class="tag-permissao">${p}</span>`).join('');
            const masterBadge = u.perfilMaster ? `<span class="badge-master"><i class="fa-solid fa-crown"></i> MASTER</span>` : '';
            const alertaTroca = u.precisaTrocarSenha ? `<p style="color: #e67e22; font-size: 10px; font-weight: bold; margin-top: 5px;">⚠️ AGUARDANDO TROCA DE SENHA</p>` : '';

            container.innerHTML += `
                <div class="card-usuario">
                    <div class="card-usuario-header">
                        <h3>${u.nomeCompleto}</h3>
                        ${masterBadge}
                    </div>
                    <div class="card-usuario-body">
                        <div><b>Login:</b> ${u.login}</div>
                        <div class="status-badge-inline ${statusClass}">${u.status}</div>
                        ${alertaTroca}
                        <div class="permissoes-list-card">${tags || '<i>Sem acessos específicos</i>'}</div>
                    </div>
                    <div class="card-usuario-footer">
                        <i class="fa-solid fa-user-pen" title="Editar" onclick="editarUsuario('${id}')"></i>
                        <i class="fa-solid fa-trash-can" title="Excluir" onclick="excluirUsuario('${id}')"></i>
                    </div>
                </div>`;
        });
    } catch (e) { console.error(e); }
}

async function editarUsuario(id) {
    const doc = await db.collection("usuarios").doc(id).get();
    const u = doc.data();
    document.getElementById('select-funcionario-usuario').value = u.nomeCompleto;
    document.getElementById('usuario-login').value = u.login;
    document.getElementById('usuario-senha').value = u.senha;
    document.getElementById('usuario-master').checked = u.perfilMaster || false;
    document.querySelector(`input[name="usuario-status"][value="${u.status}"]`).checked = true;
    document.querySelectorAll('.chk-permissao input').forEach(cb => {
        cb.checked = u.permissoes && u.permissoes.includes(cb.value);
    });
    document.getElementById('edit-id-usuario').value = id;
    document.getElementById('btn-save-usuario').innerText = "Resetar Senha / Atualizar";
    window.scrollTo({top: 0, behavior: 'smooth'});
}

async function excluirUsuario(id) {
    if (confirm("Excluir este usuário permanentemente?")) {
        await db.collection("usuarios").doc(id).delete();
        renderizarUsuarios();
    }
}

function limparFormUsuario() {
    document.getElementById('form-usuario').reset();
    document.querySelectorAll('.chk-permissao input').forEach(cb => cb.checked = false);
    document.getElementById('edit-id-usuario').value = "";
    document.getElementById('btn-save-usuario').innerText = "Salvar Usuário";
}