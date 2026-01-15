if (!sessionStorage.getItem('usuarioAtivo')) window.location.href = 'login.html';

const usuarioLogado = JSON.parse(sessionStorage.getItem('usuarioAtivo'));
const isMaster = usuarioLogado.perfilMaster === true;

// =============================================================================
// BLOCO 1: BASE DE FERIADOS (INCLUINDO SÃO PAULO / VSBL)
// =============================================================================
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

// =============================================================================
// BLOCO 2: INICIALIZAÇÃO E SEGURANÇA
// =============================================================================
document.addEventListener('DOMContentLoaded', () => {
    ajustarSidebar();
    configurarDataPadrao();
    renderizarFeriados();
    renderizarAprendizes();
    carregarRegrasEspeciais();
});

function ajustarSidebar() {
    const permissoes = usuarioLogado.permissoes || [];
    document.querySelectorAll('.sidebar ul li a').forEach(link => {
        const pagina = link.getAttribute('href').replace('.html', '');
        if (!isMaster && !permissoes.includes(pagina) && pagina !== "index") {
            link.parentElement.style.display = 'none';
        }
    });
}

function configurarDataPadrao() {
    const data = new Date();
    let mesSeguinte = data.getMonth() + 2; 
    let ano = data.getFullYear();
    if (mesSeguinte > 12) { mesSeguinte = 1; ano++; }
    document.getElementById('filtro-mes-param').value = mesSeguinte;
    document.getElementById('filtro-ano-param').value = ano;
}

// =============================================================================
// BLOCO 3: FERIADOS (3 COLUNAS)
// =============================================================================
async function renderizarFeriados() {
    const mes = parseInt(document.getElementById('filtro-mes-param').value);
    const ano = parseInt(document.getElementById('filtro-ano-param').value);
    
    const docSnap = await db.collection("parametros_feriados").doc(`${ano}-${mes}`).get();
    const dados = docSnap.exists ? docSnap.data() : {};
    
    document.getElementById('folgas-mes-param').value = dados.folgasDoMes || 5;

    const containers = { 
        "AVUL": document.getElementById('lista-feriados-avul'), 
        "VCCL": document.getElementById('lista-feriados-vccl'),
        "VSBL": document.getElementById('lista-feriados-vsbl') 
    };

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
                inputs += `
                    <div class="periodo-input-box">
                        <label>${p.substring(0,3)}</label>
                        <input type="number" class="input-feriado-val" data-ref="${idRef}" value="${dados[idRef] || 0}">
                    </div>`;
            });

            card.innerHTML = `
                <div class="feriado-header">
                    <span>${f.dia.toString().padStart(2,'0')}/${mes.toString().padStart(2,'0')} - ${diaSem} - ${f.nome}</span>
                </div>
                <div class="grid-periodos">${inputs}</div>
            `;
            
            if(containers[empresa]) containers[empresa].appendChild(card);
        });
    });
}

async function salvarConfiguracaoFeriados() {
    const mes = document.getElementById('filtro-mes-param').value;
    const ano = document.getElementById('filtro-ano-param').value;
    const dados = { folgasDoMes: document.getElementById('folgas-mes-param').value };
    
    document.querySelectorAll('.input-feriado-val').forEach(i => {
        dados[i.dataset.ref] = i.value;
    });

    try {
        await db.collection("parametros_feriados").doc(`${ano}-${mes}`).set(dados);
        alert("Parâmetros de feriados salvos com sucesso!");
    } catch (e) {
        alert("Erro ao salvar parâmetros.");
    }
}

// =============================================================================
// BLOCO 4: APRENDIZES E REGRAS ESPECIAIS
// =============================================================================
async function carregarRegrasEspeciais() {
    const doc = await db.collection("parametros_regras").doc("especiais").get();
    if (doc.exists) {
        const d = doc.data();
        document.getElementById('regra-osmair').checked = d.osmair || false;
        document.getElementById('regra-fabio').checked = d.fabio || false;
        document.getElementById('regra-equipe-tarde').checked = d.equipeTarde || false;
        document.getElementById('regra-equipe-manha').checked = d.equipeManha || false;
    }
}

async function salvarRegraEspecial(regra) {
    let idElemento = `regra-osmair`; 
    if(regra === 'fabio') idElemento = `regra-fabio`;
    if(regra === 'equipeTarde') idElemento = `regra-equipe-tarde`;
    if(regra === 'equipeManha') idElemento = `regra-equipe-manha`;

    const status = document.getElementById(idElemento).checked;
    await db.collection("parametros_regras").doc("especiais").set({ [regra]: status }, { merge: true });
}

async function renderizarAprendizes() {
    const container = document.getElementById('lista-aprendizes');
    const [snapEscalas, snapFuncs, snapConfigs] = await Promise.all([
        db.collection("escalas").get(),
        db.collection("funcionarios").where("funcao", "==", "Aprendiz").get(),
        db.collection("config_aprendizes").get()
    ]);

    const escalas = []; snapEscalas.forEach(doc => escalas.push({ id: doc.id, ...doc.data() }));
    const configs = {}; snapConfigs.forEach(doc => configs[doc.id] = doc.data());

    container.innerHTML = "";

    snapFuncs.forEach(doc => {
        const fId = doc.id, f = doc.data(), c = configs[fId] || { dias: [], escalaId: "" };
        const card = document.createElement('div'); 
        card.className = "card-aprendiz";

        let flags = diasSemanaArr.map(d => `
            <label class="flag-dia">
                ${d}
                <input type="checkbox" class="chk-${fId}" value="${d}" ${c.dias.includes(d)?'checked':''}>
            </label>`).join('');

        let options = escalas.map(e => `
            <option value="${e.id}" ${c.escalaId===e.id?'selected':''}>
                ${e.inicioJornada}-${e.fimJornada}
            </option>`).join('');

        card.innerHTML = `
            <div class="card-aprendiz-header">
                <h4>${f.nome}</h4>
                <div class="aprendiz-actions">
                    <i class="fa-solid fa-floppy-disk" onclick="salvarAprendiz('${fId}')"></i>
                </div>
            </div>
            <div class="card-aprendiz-body">
                <div class="dias-uteis-group">${flags}</div>
                <div class="escala-aprendiz-group">
                    <select id="sel-escala-${fId}"><option value="">Escala...</option>${options}</select>
                </div>
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

// =============================================================================
// BLOCO 5: CALENDÁRIO CONSULTA
// =============================================================================
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