if (!sessionStorage.getItem('usuarioAtivo')) window.location.href = 'login.html';

const usuarioLogado = JSON.parse(sessionStorage.getItem('usuarioAtivo'));
const isMaster = usuarioLogado.perfilMaster === true;

const feriadosBase = [
    { dia: 1, mes: 1, nome: "Confraternização Universal", tipo: "nacional" },
    { dia: 25, mes: 1, nome: "Aniversário São Paulo", tipo: "municipal", empresa: "VSBL" },
    { dia: 21, mes: 4, nome: "Tiradentes", tipo: "nacional" },
    { dia: 1, mes: 5, nome: "Dia do Trabalho", tipo: "nacional" },
    { dia: 9, mes: 7, nome: "Revolução Constitucionalista", tipo: "estadual" },
    { dia: 7, mes: 9, nome: "Independência do Brasil", tipo: "nacional" },
    { dia: 12, mes: 10, nome: "Nossa Sra. Aparecida", tipo: "nacional" },
    { dia: 2, mes: 11, nome: "Finados", tipo: "nacional" },
    { dia: 15, mes: 11, nome: "Proclamação da República", tipo: "nacional" },
    { dia: 20, mes: 11, nome: "Consciência Negra", tipo: "nacional" },
    { dia: 25, mes: 12, nome: "Natal", tipo: "nacional" },
    { dia: 19, mes: 2, nome: "Emancipação de Osasco", tipo: "municipal", empresa: "AVUL" },
    { dia: 13, mes: 6, nome: "Santo Antônio", tipo: "municipal", empresa: "AVUL" },
    { dia: 30, mes: 11, nome: "Emancipação de Franco da Rocha", tipo: "municipal", empresa: "VCCL" },
    { dia: 8, mes: 12, nome: "Imaculada Conceição", tipo: "municipal", empresa: "VCCL" }
];

const periodosNomes = ["Manhã", "Intermediário", "Tarde", "Noite", "Integral"];
const diasSemanaArr = ["Seg", "Ter", "Qua", "Qui", "Sex"];

document.addEventListener('DOMContentLoaded', () => {
    ajustarSidebar();
    configurarDataPadrao();
    renderizarFeriados();
    renderizarAprendizes();
    carregarRegrasEspeciais();
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

function configurarDataPadrao() {
    const data = new Date();
    let mesSeguinte = data.getMonth() + 2; 
    let ano = data.getFullYear();
    if (mesSeguinte > 12) { mesSeguinte = 1; ano++; }
    document.getElementById('filtro-mes-param').value = mesSeguinte;
    document.getElementById('filtro-ano-param').value = ano;
}

async function renderizarFeriados() {
    const mes = parseInt(document.getElementById('filtro-mes-param').value);
    const ano = parseInt(document.getElementById('filtro-ano-param').value);
    const docSnap = await db.collection("parametros_feriados").doc(`${ano}-${mes}`).get();
    const dados = docSnap.exists ? docSnap.data() : {};
    document.getElementById('folgas-mes-param').value = dados.folgasDoMes || 5;
    const containers = { "AVUL": document.getElementById('lista-feriados-avul'), "VCCL": document.getElementById('lista-feriados-vccl'), "VSBL": document.getElementById('lista-feriados-vsbl') };
    Object.values(containers).forEach(c => { if(c) c.innerHTML = ""; });
    feriadosBase.filter(f => f.mes === mes).forEach(f => {
        ["AVUL", "VCCL", "VSBL"].forEach(empresa => {
            if (f.tipo === "municipal" && f.empresa !== empresa) return;
            const d = new Date(ano, mes - 1, f.dia);
            const diaSem = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][d.getDay()];
            const card = document.createElement('div');
            card.className = `card-feriado`;
            let inputs = "";
            periodosNomes.forEach(p => {
                const idRef = `${empresa}-${f.dia}-${p}`;
                inputs += `<div class="periodo-input-box"><label>${p.substring(0,3)}</label><input type="number" class="input-feriado-val" data-ref="${idRef}" value="${dados[idRef] || 0}"></div>`;
            });
            card.innerHTML = `<div class="feriado-header"><span>${f.dia.toString().padStart(2,'0')}/${mes.toString().padStart(2,'0')} - ${diaSem} - ${f.nome}</span></div><div class="grid-periodos">${inputs}</div>`;
            if(containers[empresa]) containers[empresa].appendChild(card);
        });
    });
}

async function salvarConfiguracaoFeriados() {
    const mes = document.getElementById('filtro-mes-param').value;
    const ano = document.getElementById('filtro-ano-param').value;
    const dados = { folgasDoMes: document.getElementById('folgas-mes-param').value };
    document.querySelectorAll('.input-feriado-val').forEach(i => { dados[i.dataset.ref] = i.value; });
    try {
        await db.collection("parametros_feriados").doc(`${ano}-${mes}`).set(dados);
        alert("Parâmetros de feriados salvos com sucesso!");
    } catch (e) { alert("Erro ao salvar parâmetros."); }
}

async function carregarRegrasEspeciais() {
    const doc = await db.collection("parametros_regras").doc("especiais").get();
    if (doc.exists) {
        const d = doc.data();
        // Mapeia os dados do banco para os novos IDs do HTML
        if (document.getElementById('regra-equipe-manha')) 
            document.getElementById('regra-equipe-manha').checked = d.equipeManha || false;
        
        if (document.getElementById('regra-equipe-noite')) 
            document.getElementById('regra-equipe-noite').checked = d.equipeNoite || false;
        
        if (document.getElementById('regra-equipe-tarde')) 
            document.getElementById('regra-equipe-tarde').checked = d.equipeTarde || false;
    }
}

async function salvarRegraEspecial(regra) {
    let idElemento = "";
    
    // Define qual ID de elemento HTML ler com base no nome da regra
    switch(regra) {
        case 'equipeManha': idElemento = 'regra-equipe-manha'; break;
        case 'equipeNoite': idElemento = 'regra-equipe-noite'; break;
        case 'equipeTarde': idElemento = 'regra-equipe-tarde'; break;
    }

    if (idElemento) {
        const status = document.getElementById(idElemento).checked;
        try {
            await db.collection("parametros_regras").doc("especiais").set({ 
                [regra]: status 
            }, { merge: true });
            console.log(`Regra ${regra} atualizada para ${status}`);
        } catch (error) {
            console.error("Erro ao salvar regra:", error);
            alert("Erro ao salvar a configuração.");
        }
    }
}

// --- LOGICA ATUALIZADA DOS APRENDIZES ---
async function renderizarAprendizes() {
    const container = document.getElementById('lista-aprendizes');
    const mesFiltro = parseInt(document.getElementById('filtro-mes-param').value);
    const anoFiltro = parseInt(document.getElementById('filtro-ano-param').value);
    
    // Data de referência: primeiro dia do mês selecionado para o cálculo histórico
    const dataRefInicio = new Date(anoFiltro, mesFiltro - 1, 1);

    const [snapEscalas, snapFuncs, snapConfigs] = await Promise.all([
        db.collection("escalas").get(),
        db.collection("funcionarios").where("funcao", "==", "Aprendiz").get(),
        db.collection("config_aprendizes").get()
    ]);

    const escalas = []; snapEscalas.forEach(doc => escalas.push({ id: doc.id, ...doc.data() }));
    const configs = {}; snapConfigs.forEach(doc => configs[doc.id] = doc.data());

    container.innerHTML = "";

    snapFuncs.forEach(doc => {
        const fId = doc.id, f = doc.data();
        const c = configs[fId] || { dias: [], escalaId: "" };
        
        // LOGICA DE FILTRO:
        // 1. Mostrar se o status for "Ativo"
        // 2. Se for "Inativo", mostrar apenas se a data de demissão for maior ou igual ao mês selecionado
        let deveMostrar = false;
        if (f.status === "Ativo") {
            deveMostrar = true;
        } else if (f.status === "Inativo" && f.demissao) {
            const dtDem = new Date(f.demissao + "T00:00:00");
            // Se a demissão ocorreu depois ou durante o mês selecionado, ele ainda era "atuante" para essa escala
            if (dtDem >= dataRefInicio) deveMostrar = true;
        }

        if (!deveMostrar) return;

        const card = document.createElement('div'); 
        card.className = "card-aprendiz";
        let flags = diasSemanaArr.map(d => `<label class="flag-dia">${d}<input type="checkbox" class="chk-${fId}" value="${d}" ${c.dias.includes(d)?'checked':''}></label>`).join('');
        let options = escalas.map(e => `<option value="${e.id}" ${c.escalaId===e.id?'selected':''}>${e.inicioJornada}-${e.fimJornada}</option>`).join('');

        card.innerHTML = `
            <div class="card-aprendiz-header">
                <h4>${f.nome} ${f.status === 'Inativo' ? '<small style="color:red">(INATIVO)</small>' : ''}</h4>
                <div class="aprendiz-actions"><i class="fa-solid fa-floppy-disk" onclick="salvarAprendiz('${fId}')"></i></div>
            </div>
            <div class="card-aprendiz-body">
                <div class="dias-uteis-group">${flags}</div>
                <div class="escala-aprendiz-group"><select id="sel-escala-${fId}"><option value="">Escala...</option>${options}</select></div>
            </div>`;
        container.appendChild(card);
    });
}

async function salvarAprendiz(id) {
    const dias = Array.from(document.querySelectorAll(`.chk-${id}:checked`)).map(cb => cb.value);
    const escId = document.getElementById(`sel-escala-${id}`).value;
    await db.collection("config_aprendizes").doc(id).set({ dias, escalaId: escId });
    alert("Configuração do aprendiz salva!");
}

function abrirCalendarioConsulta() {
    const mes = parseInt(document.getElementById('filtro-mes-param').value);
    const ano = parseInt(document.getElementById('filtro-ano-param').value);
    const grid = document.getElementById('calendar-grid');
    const meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    document.getElementById('modal-titulo').innerText = `${meses[mes-1]} / ${ano}`;
    grid.innerHTML = "";
    const pDia = new Date(ano, mes - 1, 1).getDay();
    const uDia = new Date(ano, mes, 0).getDate();
    for (let i = 0; i < pDia; i++) grid.appendChild(Object.assign(document.createElement('div'), {className: "calendar-day day-empty"}));
    for (let dia = 1; dia <= uDia; dia++) {
        const d = document.createElement('div'); 
        d.className = "calendar-day"; 
        d.innerText = dia;
        if (new Date(ano, mes - 1, dia).getDay() === 0) d.classList.add('day-sunday');
        if (feriadosBase.some(f => f.dia === dia && f.mes === mes)) d.classList.add('day-holiday');
        grid.appendChild(d);
    }
    document.getElementById('modal-calendario').style.display = "block";
}

function fecharModal() { document.getElementById('modal-calendario').style.display = "none"; }
window.onclick = function(e) { if (e.target == document.getElementById('modal-calendario')) fecharModal(); }

function logout() { sessionStorage.removeItem('usuarioAtivo'); window.location.href = 'login.html'; }