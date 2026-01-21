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
    const mesA = dataHoje.getMonth();
    const anoA = dataHoje.getFullYear();

    const mesPassado = mesA === 0 ? 11 : mesA - 1;
    const anoPassado = mesA === 0 ? anoA - 1 : anoA;

    const mesProximo = mesA === 11 ? 0 : mesA + 1;
    const anoProximo = mesA === 11 ? anoA + 1 : anoA;

    // Acumuladores de dados por funcionário
    let faltasData = {}, folgasData = {}, afastData = { anterior: {}, atual: {}, proximo: {} };

    // Funções auxiliares de formatação
    const formatarDiasLista = (dias) => {
        const d = [...new Set(dias)].sort((a, b) => a - b);
        if (d.length === 1) return String(d[0]).padStart(2, '0');
        const ultimo = d.pop();
        return d.map(n => String(n).padStart(2, '0')).join(', ') + ' e ' + String(ultimo).padStart(2, '0');
    };

    const formatarDeAa = (dias) => {
        const d = [...new Set(dias)].sort((a, b) => a - b);
        if (d.length === 1) return String(d[0]).padStart(2, '0');
        return `de ${String(d[0]).padStart(2, '0')} a ${String(d[d.length - 1]).padStart(2, '0')}`;
    };

    ausencias.forEach(a => {
        const dts = parseDatas(a);
        dts.forEach(d => {
            const diaNum = d.getDate();
            const m = d.getMonth();
            const y = d.getFullYear();

            // Faltas (Mês Atual)
            if (a.tipo === "Falta" && m === mesA && y === anoA) {
                if (!faltasData[a.funcionario]) faltasData[a.funcionario] = [];
                faltasData[a.funcionario].push(diaNum);
            }

            // Folgas (Próximo Mês)
            if (a.tipo === "Folga" && m === mesProximo && y === anoProximo) {
                const dataFormatada = `${String(diaNum).padStart(2, '0')}/${String(m + 1).padStart(2, '0')}`;
                if (!folgasData[a.funcionario]) folgasData[a.funcionario] = { texto: dataFormatada, qtd: 0 };
                folgasData[a.funcionario].qtd++;
            }

            // Afastamentos / Licenças
            if (["Afastamento", "Licença"].includes(a.tipo)) {
                let ref;
                if (m === mesPassado && y === anoPassado) ref = afastData.anterior;
                else if (m === mesA && y === anoA) ref = afastData.atual;
                else if (m === mesProximo && y === anoProximo) ref = afastData.proximo;

                if (ref) {
                    if (!ref[a.funcionario]) ref[a.funcionario] = [];
                    ref[a.funcionario].push(diaNum);
                }
            }
        });
    });

    // Renderizar Faltas
    const elFaltas = document.getElementById('lista-faltas-mes');
    elFaltas.innerHTML = Object.entries(faltasData).map(([nome, dias]) => 
        `<li class="summary-item"><span>${nome} - ${formatarDiasLista(dias)}</span> <span class="qty">${dias.length} dias</span></li>`
    ).join('') || '<li class="empty-info">Nenhuma falta</li>';

    // Renderizar Folgas
    const elFolgas = document.getElementById('lista-folgas-proximo');
    elFolgas.innerHTML = Object.entries(folgasData).map(([nome, info]) => 
        `<li class="summary-item"><span>${nome} ${info.texto}</span> <span class="qty">${info.qtd} ${info.qtd > 1 ? 'dias' : 'dia'}</span></li>`
    ).join('') || '<li class="empty-info">Nenhuma folga</li>';

    // Renderizar Afastamentos
    const elAfast = document.getElementById('lista-afastamentos-ativos');
    const gerarSetor = (titulo, obj) => {
        const itens = Object.entries(obj);
        if (itens.length === 0) return "";
        let html = `<li class="summary-item" style="background:#fff3e0; font-weight:bold; font-size:0.65rem; color:#e67e22; border:none; margin-top:5px; padding-left:5px;">${titulo}</li>`;
        html += itens.map(([nome, dias]) => 
            `<li class="summary-item"><span>${nome} ${formatarDeAa(dias)}</span> <span class="qty">${dias.length} dias</span></li>`
        ).join('');
        return html;
    };

    let htmlAfast = gerarSetor(`${mesesNomes[mesPassado]} (Anterior)`, afastData.anterior) +
                    gerarSetor(`${mesesNomes[mesA]} (Atual)`, afastData.atual) +
                    gerarSetor(`${mesesNomes[mesProximo]} (Próximo)`, afastData.proximo);
    elAfast.innerHTML = htmlAfast || '<li class="empty-info">Nenhum registro</li>';
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
    const hojeObj = new Date();
    const hojeD = diasS[hojeObj.getDay()];
    const el = document.getElementById('lista-aprendizes-hoje');
    if (!el) return;

    try {
        const [sConf, sEsc] = await Promise.all([
            db.collection("config_aprendizes").get(), 
            db.collection("escalas").get()
        ]);
        const confs = {}; sConf.forEach(d => confs[d.id] = d.data());
        const escs = {}; sEsc.forEach(d => escs[d.id] = d.data());
        
        const hojeDataApenas = new Date(hojeObj.getFullYear(), hojeObj.getMonth(), hojeObj.getDate());
        let listaParaSort = [];

        cacheFuncionarios.filter(f => f.funcao === "Aprendiz").forEach(f => {
            if (empFiltro !== "TODAS" && f.empresa !== empFiltro) return;

            const dtDem = f.demissao ? new Date(f.demissao + "T00:00:00") : null;
            
            // 1. Caso: Demitido (Tarja Preta)
            if (f.status === "Inativo" && dtDem && hojeDataApenas >= dtDem) {
                const mesAtual = hojeObj.getMonth();
                const anoAtual = hojeObj.getFullYear();
                if (dtDem.getMonth() === mesAtual && dtDem.getFullYear() === anoAtual) {
                    listaParaSort.push({
                        apelido: f.apelido,
                        empresa: f.empresa,
                        horario: "99:99", // Vai para o fim da lista no sort de horário
                        exibicao: "DEMITIDO",
                        estilo: "background:#000; color:#fff; padding:2px 8px; border-radius:4px; margin-bottom:2px;"
                    });
                }
                return;
            }

            // 2. Caso: Ativo ou Demissão Futura (Horário Normal)
            const c = confs[f.id];
            if (c && c.dias.includes(hojeD)) {
                const e = escs[c.escalaId];
                const h = e ? e.inicioJornada : "00:00";
                listaParaSort.push({
                    apelido: f.apelido,
                    empresa: f.empresa,
                    horario: h,
                    exibicao: h,
                    estilo: ""
                });
            }
        });

        // --- ORDENAÇÃO: Primeiro por Horário (Jornada), depois por Empresa ---
        listaParaSort.sort((a, b) => {
            if (a.horario !== b.horario) return a.horario.localeCompare(b.horario);
            return a.empresa.localeCompare(b.empresa);
        });

        // Gerar HTML final
        let html = "";
        listaParaSort.forEach(item => {
            const corTextoHorario = item.exibicao === "DEMITIDO" ? "color:#fff" : "";
            html += `<li class="anniversary-item" style="${item.estilo}">
                        <span>${item.apelido} <small style="font-size:0.6rem; opacity:0.6">(${item.empresa})</small></span>
                        <span class="anniversary-date" style="${corTextoHorario}">${item.exibicao}</span>
                     </li>`;
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