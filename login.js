let usuarioLogadoId = null;

// Alternar visibilidade da senha
const togglePassword = document.getElementById('togglePassword');
const passwordInput = document.getElementById('login-pass');

if (togglePassword) {
    togglePassword.addEventListener('click', function () {
        const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
        passwordInput.setAttribute('type', type);
        this.classList.toggle('fa-eye');
        this.classList.toggle('fa-eye-slash');
    });
}

// LOGIN
document.getElementById('form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const login = document.getElementById('login-user').value;
    const senha = document.getElementById('login-pass').value;
    const msg = document.getElementById('error-msg');

    msg.innerText = "Verificando...";

    try {
        const snap = await db.collection("usuarios")
            .where("login", "==", login)
            .where("senha", "==", senha)
            .get();

        if (snap.empty) {
            msg.innerText = "Usuário ou senha incorretos.";
            return;
        }

        const userDoc = snap.docs[0];
        const userData = userDoc.data();

        if (userData.status === "Bloqueado") {
            msg.innerText = "Acesso bloqueado. Contate o administrador.";
            return;
        }

        // VERIFICA SE PRECISA TROCAR SENHA
        if (userData.precisaTrocarSenha === true) {
            usuarioLogadoId = userDoc.id; // Guarda o ID para o update depois
            document.getElementById('box-login').style.display = 'none';
            document.getElementById('box-reset').style.display = 'block';
            document.getElementById('reset-login').value = userData.login;
            document.getElementById('reset-prov').value = userData.senha;
        } else {
            logarSucesso(userData);
        }
    } catch (error) { msg.innerText = "Erro ao conectar."; }
});

// FORMULÁRIO DE NOVA SENHA (AQUELE QUE APARECE APÓS O RESET)
document.getElementById('form-reset').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nova = document.getElementById('new-pass').value;
    const confirma = document.getElementById('confirm-pass').value;

    if (nova.length < 4) {
        alert("A nova senha deve ter no mínimo 4 caracteres.");
        return;
    }

    if (nova !== confirma) {
        alert("As senhas não coincidem!");
        return;
    }

    try {
        // Atualiza a senha e marca que NÃO precisa mais trocar
        await db.collection("usuarios").doc(usuarioLogadoId).update({
            senha: nova,
            precisaTrocarSenha: false
        });

        alert("Senha cadastrada com sucesso!");
        
        // Busca os dados atualizados para logar
        const userDoc = await db.collection("usuarios").doc(usuarioLogadoId).get();
        logarSucesso(userDoc.data());

    } catch (e) { 
        console.error(e);
        alert("Erro ao salvar nova senha."); 
    }
});

async function solicitarReset() {
    const login = document.getElementById('login-user').value;
    if (!login) {
        alert("Digite seu 'Usuário' para identificação.");
        return;
    }
    try {
        const snap = await db.collection("usuarios").where("login", "==", login).get();
        if (snap.empty) {
            alert("Usuário não encontrado.");
            return;
        }
        const user = snap.docs[0].data();
        await db.collection("pedidos_reset").add({
            nomeCompleto: user.nomeCompleto,
            login: user.login,
            data: new Date().getTime(),
            status: "Pendente"
        });
        alert("Solicitação enviada ao Master!");
    } catch (e) { alert("Erro ao processar."); }
}

function logarSucesso(dados) {
    sessionStorage.setItem('usuarioAtivo', JSON.stringify(dados));
    window.location.href = "index.html";
}