if (!sessionStorage.getItem('usuarioAtivo')) window.location.href = 'login.html';

const usuarioLogado = JSON.parse(sessionStorage.getItem('usuarioAtivo'));
const isMaster = usuarioLogado.perfilMaster === true;

document.addEventListener('DOMContentLoaded', () => {
    ajustarSidebar();
    
    document.getElementById('filtro-periodo-timeline').addEventListener('change', renderizarTimelineFerias);
    document.getElementById('filtro-func-timeline').addEventListener('change', renderizarTimelineFerias);
    document.getElementById('filtro-data-timeline').addEventListener('change', renderizarTimelineFerias);
    document.getElementById('filtro-data-fim-timeline').addEventListener('change', renderizarTimelineFerias);
    
    carregarDashboard();
});

const mesesNomes = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
let cacheFuncionarios = [];
let cacheAusencias = [];

function ajustarSidebar() {
    const usuarioLogado = JSON.parse(sessionStorage.getItem('usuarioAtivo'));
    if (!usuarioLogado) {
        window.location.href = 'login.html';
        return;
    }

    const isMaster = usuarioLogado.perfilMaster === true;
    const permissoes = usuarioLogado.permissoes || [];
    const paginaAtual = window.location.pathname.split("/").pop().replace(".html", "");

    // 1. Esconde os links da sidebar que o usuário não tem acesso
    document.querySelectorAll('.sidebar ul li a').forEach(link => {
        const href = link.getAttribute('href').replace('.html', '');
        
        // Regra: Se não for Master E não tiver a permissão E não for a home
        if (!isMaster && !permissoes.includes(href) && href !== "index") {
            link.parentElement.style.display = 'none';
        } else {
            link.parentElement.style.display = 'block'; // Garante que os permitidos apareçam
        }
    });

    // 2. Trava de segurança: Se o usuário tentou entrar via URL em página proibida
    if (!isMaster && paginaAtual !== "index" && !permissoes.includes(paginaAtual)) {
        alert("Você não tem permissão para acessar esta tela.");
        window.location.href = "index.html";
    }
}

function calcularDataVencimento(admissaoStr) {
    if (!admissaoStr) return "--";
    const [anoA, mesA, diaA] = admissaoStr.split('-').map(Number);
    const hoje = new Date();
    let venc = new Date(hoje.getFullYear(), mesA - 1, diaA);
    venc.setDate(venc.getDate() - 1);
    if (venc < hoje) venc.setFullYear(hoje.getFullYear() + 1);
    return venc.toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit', year:'2-digit'});
}

async function carregarDashboard() {
    const fEmpresa = document.getElementById('filtro-empresa-home').value;
    const dataHoje = new Date();
    configurarTitulosDinamicos(dataHoje);

    if (!isMaster) {
        if(document.querySelector('.stats-grid')) document.querySelector('.stats-grid').style.display = 'none';
        if(document.querySelector('.header-controls')) document.querySelector('.header-controls').style.display = 'none';
    }

    try {
        const [snapFunc, snapAus] = await Promise.all([
            db.collection("funcionarios").get(),
            db.collection("ausencias").get()
        ]);

        cacheFuncionarios = [];
        snapFunc.forEach(doc => cacheFuncionarios.push({ id: doc.id, ...doc.data() }));
        cacheAusencias = [];
        snapAus.forEach(doc => cacheAusencias.push(doc.data()));

        let funcsAtivos = cacheFuncionarios.filter(f => f.status !== "Inativo");
        if (fEmpresa !== "TODAS") {
            funcsAtivos = funcsAtivos.filter(f => f.empresa === fEmpresa);
        }

        const meuFunc = cacheFuncionarios.find(f => f.nome === usuarioLogado.nomeCompleto);
        const meuApelido = meuFunc ? meuFunc.apelido : "---";

        renderizarResumos(funcsAtivos, dataHoje);
        
        let ausenciasParaResumo = cacheAusencias;
        if (!isMaster) {
            ausenciasParaResumo = cacheAusencias.filter(a => a.funcionario === meuApelido);
        } else if (fEmpresa !== "TODAS") {
            const apelidosAtivos = funcsAtivos.map(f => f.apelido);
            ausenciasParaResumo = cacheAusencias.filter(a => apelidosAtivos.includes(a.funcionario));
        }

        processarResumosAusencia(ausenciasParaResumo, dataHoje);
        renderizarAprendizesDashboard(fEmpresa);
        
        popularFiltroFuncTimeline(funcsAtivos);
        renderizarTimelineFerias();

        if (isMaster) {
            document.getElementById('total-func').innerText = funcsAtivos.length;
            document.getElementById('total-aux').innerText = funcsAtivos.filter(f => f.funcao === "Auxiliar").length;
            document.getElementById('total-ast').innerText = funcsAtivos.filter(f => f.funcao === "Assistente").length;
            document.getElementById('total-lid').innerText = funcsAtivos.filter(f => f.funcao === "Líder").length;
            document.getElementById('total-int').innerText = funcsAtivos.filter(f => f.periodo === "Intermediário").length;
            document.getElementById('total-apr').innerText = funcsAtivos.filter(f => f.funcao === "Aprendiz").length;
        }

    } catch (e) { console.error(e); }
}

function renderizarResumos(lista, hoje) {
    const mesA = hoje.getMonth() + 1;
    const anoA = hoje.getFullYear();
    const v = lista.filter(f => f.nascimento && parseInt(f.nascimento.split('-')[1]) === mesA);
    const e = lista.filter(f => f.admissao && parseInt(f.admissao.split('-')[1]) === mesA);
    document.getElementById('lista-aniversario-vida').innerHTML = v.length ? v.map(f => `<li class="anniversary-item"><span>${f.apelido}</span><span class="anniversary-date">Dia ${f.nascimento.split('-')[2]}</span></li>`).join('') : '<li class="empty-info">Sem aniversariantes</li>';
    document.getElementById('lista-aniversario-empresa').innerHTML = e.length ? e.map(f => `<li class="anniversary-item"><span>${f.apelido} - Dia ${f.admissao.split('-')[2]}</span><span class="anniversary-date">${anoA - parseInt(f.admissao.split('-')[0])} anos</span></li>`).join('') : '<li class="empty-info">Sem registros</li>';
}

function processarResumosAusencia(ausencias, dataHoje) {
    const mesA = dataHoje.getMonth(); // 0-11
    const anoA = dataHoje.getFullYear();

    // Cálculos de meses para o card de Afastamentos
    const mesPassado = mesA === 0 ? 11 : mesA - 1;
    const anoPassado = mesA === 0 ? anoA - 1 : anoA;

    const mesProximo = mesA === 11 ? 0 : mesA + 1;
    const anoProximo = mesA === 11 ? anoA + 1 : anoA;

    let faltas = {}, folgas = {};
    
    // Objetos para acumular dias de afastamento por mês
    let afastAnterior = {}, afastAtual = {}, afastProximo = {};

    ausencias.forEach(a => {
        const dts = parseDatas(a);
        
        dts.forEach(d => {
            const m = d.getMonth();
            const y = d.getFullYear();

            // 1. Lógica para Faltas (Mês Atual) - Card Vermelho
            if (a.tipo === "Falta" && m === mesA && y === anoA) {
                faltas[a.funcionario] = (faltas[a.funcionario] || 0) + 1;
            }

            // 2. Lógica para Folgas (Próximo Mês) - Card Verde
            if (a.tipo === "Folga" && m === mesProximo && y === anoProximo) {
                folgas[a.funcionario] = (folgas[a.funcionario] || 0) + 1;
            }

            // 3. Lógica para Afastamentos/Licenças - Card Laranja
            if (["Afastamento", "Licença"].includes(a.tipo)) {
                // Mês Passado
                if (m === mesPassado && y === anoPassado) {
                    afastAnterior[a.funcionario] = (afastAnterior[a.funcionario] || 0) + 1;
                }
                // Mês Atual
                if (m === mesA && y === anoA) {
                    afastAtual[a.funcionario] = (afastAtual[a.funcionario] || 0) + 1;
                }
                // Próximo Mês
                if (m === mesProximo && y === anoProximo) {
                    afastProximo[a.funcionario] = (afastProximo[a.funcionario] || 0) + 1;
                }
            }
        });
    });

    // Renderizar Faltas e Folgas
    const fill = (id, obj) => {
        const el = document.getElementById(id);
        const ent = Object.entries(obj);
        el.innerHTML = ent.length ? ent.map(([n, q]) => `<li class="summary-item"><span>${n}</span><span class="qty">${q} d</span></li>`).join('') : `<li class="empty-info">Nenhum registro</li>`;
    };
    fill('lista-faltas-mes', faltas);
    fill('lista-folgas-proximo', folgas);

    // Renderizar Afastamentos (Card Laranja com Subtítulos)
    const elAfast = document.getElementById('lista-afastamentos-ativos');
    
    const gerarHtmlSetor = (titulo, obj) => {
        const itens = Object.entries(obj);
        if (itens.length === 0) return "";
        let html = `<li class="summary-item" style="background:#fff3e0; font-weight:bold; font-size:0.65rem; border:none; margin-top:5px; color:#e67e22;">${titulo}</li>`;
        html += itens.map(([n, q]) => `<li class="summary-item"><span>${n}</span><span class="qty">${q} d</span></li>`).join('');
        return html;
    };

    let htmlFinal = "";
    htmlFinal += gerarHtmlSetor(`${mesesNomes[mesPassado]} (Anterior)`, afastAnterior);
    htmlFinal += gerarHtmlSetor(`${mesesNomes[mesA]} (Atual)`, afastAtual);
    htmlFinal += gerarHtmlSetor(`${mesesNomes[mesProximo]} (Próximo)`, afastProximo);

    elAfast.innerHTML = htmlFinal || '<li class="empty-info">Nenhum afastamento no período</li>';
}

async function renderizarTimelineFerias() {
    const fEmpresa = document.getElementById('filtro-empresa-home').value;
    const fPeriodo = document.getElementById('filtro-periodo-timeline').value;
    const fFunc = document.getElementById('filtro-func-timeline').value;
    const fDataInicio = new Date(document.getElementById('filtro-data-timeline').value + 'T00:00:00');
    const fDataFim = new Date(document.getElementById('filtro-data-fim-timeline').value + 'T00:00:00');
    const corpo = document.getElementById('corpo-timeline');
    const header = document.getElementById('header-timeline');
    if (!corpo || isNaN(fDataInicio)) return;
    let lista = cacheFuncionarios.filter(f => f.status !== "Inativo" && f.funcao !== "Aprendiz");
    if (fEmpresa !== "TODAS") lista = lista.filter(f => f.empresa === fEmpresa);
    if (!isMaster) lista = lista.filter(f => f.nome === usuarioLogado.nomeCompleto);
    else {
        if (fPeriodo !== "TODOS") lista = lista.filter(f => f.periodo === fPeriodo);
        if (fFunc !== "TODOS") lista = lista.filter(f => f.apelido === fFunc);
    }
    const dias = [];
    let temp = new Date(fDataInicio);
    while (temp <= fDataFim) { dias.push(new Date(temp)); temp.setDate(temp.getDate() + 1); }
    header.innerHTML = '<th class="col-fixa">Funcionários</th><th class="col-vencimento">Vencimento</th>';
    dias.forEach(d => header.innerHTML += `<th>${d.toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit', year:'2-digit'})}</th>`);
    corpo.innerHTML = "";
    lista.forEach(f => {
        let tr = `<tr><td class="col-fixa">${f.apelido}</td><td class="col-vencimento">${calcularDataVencimento(f.admissao)}</td>`;
        for (let i = 0; i < dias.length; i++) {
            const dStr = dias[i].toDateString();
            const aus = cacheAusencias.find(a => a.funcionario === f.apelido && a.tipo === "Férias" && parseDatas(a).some(dt => dt.toDateString() === dStr));
            if (aus) {
                const span = Math.min(dias.length - i, parseDatas(aus).filter(d => d >= dias[i]).length);
                tr += `<td colspan="${span}" style="background:#9b59b6; color:white; font-size:10px; font-weight:bold; text-align:center;">FÉRIAS</td>`;
                i += (span - 1);
            } else tr += `<td></td>`;
        }
        corpo.innerHTML += tr + "</tr>";
    });
}

function popularFiltroFuncTimeline(lista) {
    const s = document.getElementById('filtro-func-timeline');
    if (!s) return;
    const atual = s.value;
    s.innerHTML = isMaster ? '<option value="TODOS">TODOS</option>' : '';
    lista.forEach(f => s.innerHTML += `<option value="${f.apelido}" ${f.apelido === atual ? 'selected':''}>${f.apelido}</option>`);
}

function configurarTitulosDinamicos(data) {
    const format = (offset) => {
        let d = new Date(data.getFullYear(), data.getMonth() + offset, 1);
        return `${mesesNomes[d.getMonth()]}/${d.getFullYear()}`;
    };
    document.getElementById('titulo-faltas-mes').innerText = `Faltas do Mês (${format(0)})`;
    document.getElementById('titulo-folgas-proximo').innerText = `Próximas Folgas (${format(1)})`;
}

function parseDatas(reg) {
    const toD = (s) => { const [d, m, y] = s.split('/').map(Number); return new Date(y, m - 1, d); };
    if (reg.modo === 'range') {
        const p = reg.datas.split(' até ');
        if (p.length < 2) return [];
        let cur = toD(p[0]), end = toD(p[1]), arr = [];
        while (cur <= end) { arr.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }
        return arr;
    }
    return reg.datas.split(' ; ').map(toD);
}

async function renderizarAprendizesDashboard(empFiltro) {
    const diasS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const hojeD = diasS[new Date().getDay()];
    const el = document.getElementById('lista-aprendizes-hoje');
    if (!el) return;
    try {
        const [sConf, sEsc] = await Promise.all([db.collection("config_aprendizes").get(), db.collection("escalas").get()]);
        const confs = {}; sConf.forEach(d => confs[d.id] = d.data());
        const escs = {}; sEsc.forEach(d => escs[d.id] = d.data());
        let html = "";
        cacheFuncionarios.filter(f => f.funcao === "Aprendiz" && f.status === "Ativo").forEach(f => {
            if (empFiltro !== "TODAS" && f.empresa !== empFiltro) return;
            const c = confs[f.id];
            if (c && c.dias.includes(hojeD)) {
                const e = escs[c.escalaId];
                html += `<li class="anniversary-item"><span>${f.apelido}</span><span class="anniversary-date">${e ? e.inicioJornada : '--:--'}</span></li>`;
            }
        });
        el.innerHTML = html || '<li class="empty-info">Ninguém hoje</li>';
    } catch (e) { console.error(e); }
}

function verificarAlertasVencimento() {}
function verificarConflitosFerias() {}

if (isMaster) {
    db.collection("pedidos_reset").where("status", "==", "Pendente")
    .onSnapshot((snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === "added") {
                const pedido = change.doc.data();
                const confirmacao = confirm(`⚠️ SOLICITAÇÃO:\n\nO funcionário ${pedido.nomeCompleto} solicita reset de senha.\n\nDeseja marcar como visto?`);
                if (confirmacao) db.collection("pedidos_reset").doc(change.doc.id).update({ status: "Visto" });
            }
        });
    });
}
function logout() {
    sessionStorage.removeItem('usuarioAtivo');
    window.location.href = 'login.html';
}