if (!sessionStorage.getItem("usuarioAtivo"))
  window.location.href = "login.html";

const usuarioLogado = JSON.parse(sessionStorage.getItem("usuarioAtivo"));
const isMaster = usuarioLogado.perfilMaster === true;

document.addEventListener('DOMContentLoaded', () => {
    popularAnosFiltro();
    ajustarSidebar();
    carregarDashboard();
});

const mesesNomes = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez"
];
let cacheFuncionarios = [];
let cacheAusencias = [];

function popularAnosFiltro() {
    const s = document.getElementById('filtro-ano-timeline');
    const anoAtual = new Date().getFullYear();
    if(!s) return;
    s.innerHTML = "";
    for (let i = 2020; i <= 2035; i++) {
        let opt = document.createElement('option');
        opt.value = i;
        opt.text = i;
        if (i === anoAtual ) opt.selected = true;
        s.appendChild(opt);
    }
}

function ajustarSidebar() {
    const permissoes = usuarioLogado.permissoes || [];
    document.querySelectorAll('.sidebar ul li a').forEach(link => {
        const href = link.getAttribute('href').replace('.html', '');
        if (link.getAttribute('href') === "#" || href === "index") return;
        if (!isMaster && !permissoes.includes(href)) link.parentElement.style.display = 'none';
        else link.parentElement.style.display = 'block';
    });
}

function calcularVencimentoNoAno(admissaoStr, anoFiltro) {
    if (!admissaoStr) return null;
    const [anoA, mesA, diaA] = admissaoStr.split('-').map(Number);
    let dataVenc = new Date(anoFiltro, mesA - 1, diaA);
    dataVenc.setDate(dataVenc.getDate() - 1);
    return dataVenc;
}

async function carregarDashboard() {
    const fEmpresa = document.getElementById('filtro-empresa-home').value;
    const fSetor = document.getElementById('filtro-setor-home').value; 
    const dataHoje = new Date();
    configurarTitulosDinamicos(dataHoje);

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
        if (fEmpresa !== "TODAS") funcsAtivos = funcsAtivos.filter(f => f.empresa === fEmpresa);
        if (fSetor !== "TODOS") funcsAtivos = funcsAtivos.filter(f => f.setor === fSetor);

        renderizarResumos(funcsAtivos, dataHoje);
        processarResumosAusencia(cacheAusencias, dataHoje);
        renderizarAprendizesDashboard(fEmpresa, fSetor);
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
    const v = lista.filter(f => f.nascimento && parseInt(f.nascimento.split('-')[1]) === mesA);
    const e = lista.filter(f => f.admissao && parseInt(f.admissao.split('-')[1]) === mesA);
    document.getElementById('lista-aniversario-vida').innerHTML = v.length ? v.map(f => `<li class="anniversary-item"><span>${f.apelido}</span><span class="anniversary-date">Dia ${f.nascimento.split('-')[2]}</span></li>`).join('') : '<li class="empty-info">Sem aniversariantes</li>';
    document.getElementById('lista-aniversario-empresa').innerHTML = e.length ? e.map(f => `<li class="anniversary-item"><span>${f.apelido} - Dia ${f.admissao.split('-')[2]}</span><span class="anniversary-date">${hoje.getFullYear() - parseInt(f.admissao.split('-')[0])} anos</span></li>`).join('') : '<li class="empty-info">Sem registros</li>';
}

function processarResumosAusencia(ausencias, dataHoje) {
    const mesA = dataHoje.getMonth();
    const anoA = dataHoje.getFullYear();
    const mesProximo = mesA === 11 ? 0 : mesA + 1;
    const anoProximo = mesA === 11 ? anoA + 1 : anoA;

    let faltasData = {}, folgasData = {};

    ausencias.forEach(a => {
        const dts = parseDatas(a);
        dts.forEach(d => {
            if (a.tipo === "Falta" && d.getMonth() === mesA && d.getFullYear() === anoA) {
                if (!faltasData[a.funcionario]) faltasData[a.funcionario] = 0;
                faltasData[a.funcionario]++;
            }
            if (a.tipo === "Folga" && d.getMonth() === mesProximo && d.getFullYear() === anoProximo) {
                if (!folgasData[a.funcionario]) folgasData[a.funcionario] = { texto: d.toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'}), qtd: 0 };
                folgasData[a.funcionario].qtd++;
            }
        });
    });

    document.getElementById('lista-faltas-mes').innerHTML = Object.entries(faltasData).map(([nome, qtd]) => `<li class="summary-item"><span>${nome}</span> <span class="qty">${qtd} d</span></li>`).join('') || '<li class="empty-info">Nenhuma falta</li>';
    document.getElementById('lista-folgas-proximo').innerHTML = Object.entries(folgasData).map(([nome, info]) => `<li class="summary-item"><span>${nome} ${info.texto}</span> <span class="qty">${info.qtd} d</span></li>`).join('') || '<li class="empty-info">Nenhuma folga</li>';
}

async function renderizarTimelineFerias() {
    const fEmpresa = document.getElementById('filtro-empresa-home').value;
    const fSetor = document.getElementById('filtro-setor-home').value;
    const fPeriodo = document.getElementById('filtro-periodo-timeline').value;
    const fFunc = document.getElementById('filtro-func-timeline').value;
    const anoFiltro = parseInt(document.getElementById('filtro-ano-timeline').value);
    const mesValor = document.getElementById('filtro-mes-timeline').value;

    let dInic, dFim;
    if (mesValor === "TODOS") {
        dInic = new Date(anoFiltro, 0, 1); dFim = new Date(anoFiltro, 11, 31);
    } else {
        const m = parseInt(mesValor); dInic = new Date(anoFiltro, m, 1); dFim = new Date(anoFiltro, m + 1, 0);
    }

    const corpo = document.getElementById('corpo-timeline');
    const header = document.getElementById('header-timeline');
    if (!corpo || !header) return;

    let lista = cacheFuncionarios.filter(f => f.status !== "Inativo" && f.funcao !== "Aprendiz");
    
    // --- NOVA LÓGICA: FILTRAR APENAS VENCIMENTOS ATIVOS ---
    lista = lista.filter(f => {
        if (!f.admissao) return false;
        const [anoA, mesA, diaA] = f.admissao.split('-').map(Number);
        const dataAdmissao = new Date(anoA, mesA - 1, diaA);
        
        // Calcula o vencimento para o ano do filtro (Ex: 18/03/2025)
        const vencNoAno = calcularVencimentoNoAno(f.admissao, anoFiltro);
        
        // Só mostra se a data de vencimento for no mínimo 1 ano após a admissão
        return vencNoAno >= dataAdmissao;
    });

    if (fEmpresa !== "TODAS") lista = lista.filter(f => f.empresa === fEmpresa);
    if (fSetor !== "TODOS") lista = lista.filter(f => f.setor === fSetor);
    
    if (!isMaster) {
        lista = lista.filter(f => f.nome === usuarioLogado.nomeCompleto);
    } else {
        if (fPeriodo !== "TODOS") lista = lista.filter(f => f.periodo === fPeriodo);
        if (fFunc !== "TODOS") lista = lista.filter(f => f.apelido === fFunc);
    }

    lista.sort((a, b) => calcularVencimentoNoAno(a.admissao, anoFiltro) - calcularVencimentoNoAno(b.admissao, anoFiltro));

    const dias = []; let t = new Date(dInic);
    while (t <= dFim) { dias.push(new Date(t)); t.setDate(t.getDate() + 1); }

    const diasSemana = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    header.innerHTML = '<th class="col-fixa">Funcionários</th><th class="col-vencimento">Vencimento</th>';
    dias.forEach(d => {
        header.innerHTML += `<th>${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}<br><span style="font-size: 0.55rem; opacity: 0.8;">${diasSemana[d.getDay()]}</span></th>`;
    });

    corpo.innerHTML = "";
    lista.forEach(f => {
        const vObj = calcularVencimentoNoAno(f.admissao, anoFiltro);
        const vencFmt = vObj ? vObj.toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit', year:'2-digit'}) : "--";
        const vencReferenciaComparar = vObj ? vObj.toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit', year:'numeric'}) : "";

        const todasAsFeriasDesteVenc = cacheAusencias.filter(a => 
            a.funcionario === f.apelido && a.tipo === "Férias" && a.vencimentoReferencia === vencReferenciaComparar
        );

        let estiloFundoVencimento = ""; 
        if (todasAsFeriasDesteVenc.length > 0) {
            let diasMarcados = 0; let diasProgramados = 0;
            todasAsFeriasDesteVenc.forEach(feria => {
                const qtdDias = parseDatas(feria).length;
                if ((feria.observacao || "").toLowerCase().includes("programada")) diasProgramados += qtdDias;
                else diasMarcados += qtdDias;
            });

            const pctMarcada = Math.min((diasMarcados / 30) * 100, 100);
            const pctProgramada = Math.min((diasProgramados / 30) * 100, 100 - pctMarcada);
            const stop1 = pctMarcada; const stop2 = pctMarcada + pctProgramada;

            estiloFundoVencimento = `background: linear-gradient(to right, #e1bee7 0%, #e1bee7 ${stop1}%, #ffe0b2 ${stop1}%, #ffe0b2 ${stop2}%, #ffffff ${stop2}%, #ffffff 100%) !important;`;
        }

        let tr = `<tr><td class="col-fixa">${f.apelido}</td><td class="col-vencimento" style="${estiloFundoVencimento}">${vencFmt}</td>`;
        
        for (let i = 0; i < dias.length; i++) {
            const dStr = dias[i].toDateString();
            const aus = cacheAusencias.find(a => a.funcionario === f.apelido && a.tipo === "Férias" && parseDatas(a).some(dt => dt.toDateString() === dStr));
            
            if (aus) {
                const datesInAus = parseDatas(aus).filter(dt => dt >= dias[i] && dt <= dFim);
                const span = datesInAus.length;
                const obsLimpa = (aus.observacao || "").toLowerCase().trim();
                
                let corBarra = (obsLimpa === "programada") ? "#f39c12" : "#9b59b6";
                let textoBarra = (obsLimpa === "programada") ? "Férias Programada" : "Férias Marcada";

                if (aus.vencimentoReferencia) {
                    if (span < 4) textoBarra += ` ref. ${aus.vencimentoReferencia}`;
                    else textoBarra += ` referente a ${aus.vencimentoReferencia}`;
                }

                tr += `<td colspan="${span}" style="background:${corBarra}; color:white; font-size:10px; font-weight:bold; text-align:center; white-space: nowrap; border: 1px solid black; overflow:hidden; text-overflow:ellipsis; padding: 0 4px;" title="${textoBarra}">${textoBarra}</td>`;
                i += (span - 1);
            } else {
                tr += `<td></td>`;
            }
        }
        corpo.innerHTML += tr + "</tr>";
    });
}

function parseDatas(reg) {
  const toD = (s) => {
    const [d, m, y] = s.split("/").map(Number);
    return new Date(y, m - 1, d);
  };
  if (reg.modo === "range") {
    const p = reg.datas.split(" até ");
    if (p.length < 2) return [];
    let cur = toD(p[0]),
      end = toD(p[1]),
      arr = [];
    while (cur <= end) {
      arr.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return arr;
  }
  return reg.datas.split(" ; ").map(toD);
}

function popularFiltroFuncTimeline(lista) {
    const s = document.getElementById('filtro-func-timeline');
    if (!s) return;
    const atual = s.value;
    s.innerHTML = isMaster ? '<option value="TODOS">Todos</option>' : '';
    lista.sort((a,b) => a.apelido.localeCompare(b.apelido)).forEach(f => {
        s.innerHTML += `<option value="${f.apelido}" ${f.apelido === atual ? 'selected':''}>${f.apelido}</option>`;
    });
}

function configurarTitulosDinamicos(data) {
    const format = (offset) => {
        let d = new Date(data.getFullYear(), data.getMonth() + offset, 1);
        return `${mesesNomes[d.getMonth()]}/${d.getFullYear()}`;
    };
    document.getElementById('titulo-faltas-mes').innerText = `Faltas do Mês (${format(0)})`;
    document.getElementById('titulo-folgas-proximo').innerText = `Próximas Folgas (${format(1)})`;
}

async function renderizarAprendizesDashboard(empFiltro, setorFiltro) {
    const hojeObj = new Date();
    const hojeD = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][hojeObj.getDay()];
    const el = document.getElementById('lista-aprendizes-hoje');
    if (!el) return;
    try {
        const [sConf, sEsc] = await Promise.all([db.collection("config_aprendizes").get(), db.collection("escalas").get()]);
        const confs = {}; sConf.forEach(d => confs[d.id] = d.data());
        const escs = {}; sEsc.forEach(d => escs[d.id] = d.data());
        let lista = cacheFuncionarios.filter(f => f.funcao === "Aprendiz" && f.status === "Ativo");
        if (empFiltro !== "TODAS") lista = lista.filter(f => f.empresa === empFiltro);
        let html = lista.map(f => {
            const c = confs[f.id];
            if (c && c.dias.includes(hojeD)) {
                const e = escs[c.escalaId];
                return `<li class="anniversary-item"><span>${f.apelido} <small>(${f.empresa})</small></span><span class="anniversary-date">${e ? e.inicioJornada : '00:00'}</span></li>`;
            }
            return "";
        }).join('');
        el.innerHTML = html || '<li class="empty-info">Ninguém hoje</li>';
    } catch (e) { console.error(e); }
}

function logout() { sessionStorage.removeItem('usuarioAtivo'); window.location.href = 'login.html'; }