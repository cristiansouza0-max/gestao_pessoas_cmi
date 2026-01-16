if (!sessionStorage.getItem('usuarioAtivo')) window.location.href = 'login.html';

const usuarioLogado = JSON.parse(sessionStorage.getItem('usuarioAtivo'));
const isMaster = usuarioLogado.perfilMaster === true;

const mesesNomesLongos = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
const SEQ_MANHA_BASE = ["Geovana", "Maria Ap.", "Emerson", "Valeria"];

document.addEventListener('DOMContentLoaded', () => {
    ajustarSidebar();
    if (!isMaster) {
        const filtros = document.querySelectorAll('.filter-group');
        if (filtros[2]) filtros[2].style.display = 'none'; // Empresa
        if (filtros[3]) filtros[3].style.display = 'none'; // Período
        if (document.querySelector('.btn-save-blue')) document.querySelector('.btn-save-blue').style.display = 'none';
    }
    const inputAno = document.getElementById('ano-jornada');
    if(inputAno && inputAno.value === "") inputAno.value = new Date().getFullYear();
    gerarEscalaEquipe();
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

async function gerarEscalaEquipe() {
    const empresa = document.getElementById('empresa-jornada').value;
    const periodo = document.getElementById('periodo-jornada').value;
    const mes = parseInt(document.getElementById('mes-jornada').value);
    const ano = parseInt(document.getElementById('ano-jornada').value);
    const container = document.getElementById('equipe-jornada-container');
    const cabecalhoMaster = document.getElementById('cabecalho-impressao');

    container.innerHTML = "<p>Sincronizando dados...</p>";
    
    let tituloTopo = isMaster ? `${empresa} (${periodo})` : usuarioLogado.nomeCompleto;
    if (cabecalhoMaster) cabecalhoMaster.innerText = `ESCALA DE TRABALHO - ${tituloTopo} - ${mesesNomesLongos[mes]} ${ano}`;

    try {
        let query = db.collection("funcionarios").where("status", "==", "Ativo");
        const snapFunc = await query.get();
        let listaFuncs = [];
        
        snapFunc.forEach(doc => { 
            const f = doc.data();
            if (f.funcao !== "Aprendiz") {
                if (!isMaster) {
                    if (f.nome === usuarioLogado.nomeCompleto) listaFuncs.push({id: doc.id, ...f});
                } else {
                    let passa = true;
                    if (empresa !== "TODAS" && f.empresa !== empresa) passa = false;
                    if (periodo !== "TODOS" && f.periodo !== periodo) passa = false;
                    if (passa) listaFuncs.push({id: doc.id, ...f});
                }
            }
        });

       const [snapJor, snapEsc, snapAus, docRegras, snapFerParam] = await Promise.all([
    db.collection("jornadas").get(),
    db.collection("escalas").get(),
    db.collection("ausencias").get(), // Removemos o .where("status", "==", "Aprovado")
    db.collection("parametros_regras").doc("especiais").get(),
    db.collection("parametros_feriados").doc(`${ano}-${mes + 1}`).get()
]);

        const jornadas = snapJor.docs.map(d => ({ id: d.id, ...d.data() }));
        const escalas = {}; snapEsc.forEach(d => { escalas[d.id] = d.data(); });
        const todasAusencias = snapAus.docs .map(d => d.data()).filter(a => a.status !== "Reprovado");
        const regrasAtivas = docRegras.exists ? docRegras.data() : {};
        const feriadosParam = snapFerParam.exists ? snapFerParam.data() : {};

        const sim = simularEscalasSincronizadas(todasAusencias, listaFuncs, ano, regrasAtivas, feriadosParam);

        listaFuncs.forEach(f => {
            const jors = jornadas.filter(j => f.jornadasIds && f.jornadasIds.includes(j.id));
            f.jornadaPrincipal = jors.find(j => j.ordem === 1) || jors[0];
            f.jornadaSexta = jors.find(j => j.ordem === 2) || f.jornadaPrincipal;
            f.sortKey = `${f.empresa}-${f.periodo}-${f.jornadaPrincipal ? String(f.jornadaPrincipal.ordem).padStart(3, '0') : '999'}-${f.nome}`;
        });
        listaFuncs.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

        container.innerHTML = "";
        const diasNoMes = new Date(ano, mes + 1, 0).getDate();

        listaFuncs.forEach(f => {
            const wrapper = document.createElement('div');
            wrapper.className = "tabela-individual-wrapper";
            let totalMinutos = 0, rowsHtml = "", jaProcessada = new Set();

            for (let d = 1; d <= diasNoMes; d++) {
                const dataAtu = new Date(ano, mes, d), sem = dataAtu.getDay(), chave = `${d}-${mes+1}-${ano}`;
                const dataFmt = `${String(d).padStart(2,'0')}/${String(mes+1).padStart(2,'0')}/${String(ano).substring(2)}`;
                const diaSemFmt = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"][sem];
                const eFeriado = feriadosParam[`${f.empresa}-${d}-${f.periodo}`] > 0;
                let classeRow = eFeriado ? "row-feriado" : (sem === 6 ? "row-sabado" : (sem === 0 ? "row-domingo" : ""));
                const ausBloco = todasAusencias.find(a => 
    a.funcionario.trim() === f.apelido.trim() && 
    ["Férias", "Licença", "Afastamento", "Falta"].includes(a.tipo) && // Adicionado "Falta" aqui
    isDataNoRange(dataAtu, a)
);

                if (ausBloco) { rowsHtml += `<tr class="${classeRow}"><td>${dataFmt}</td><td>${diaSemFmt}</td>`;
                const idMesclagem = `${f.apelido}-${ausBloco.datas}-${ausBloco.tipo}`;
    
                if (!jaProcessada.has(idMesclagem)) {
                const dts = processarDatasJornada(ausBloco);
                 const count = dts.filter(dt => dt.getMonth() === mes && dt.getFullYear() === ano && dt.getDate() >= d).length;
        
        // Mapeamento de classe de cor
            let classeCor = "outros";
            if (ausBloco.tipo === 'Férias') classeCor = "ferias";
            if (ausBloco.tipo === 'Falta') classeCor = "falta"; // Nova classe para falta
        
                rowsHtml += `<td colspan="3" rowspan="${count}" class="celula-${classeCor}-mesclada">${ausBloco.tipo}</td>`;
                jaProcessada.add(idMesclagem);}
                rowsHtml += `</tr>`;
            } else {
                    const ausFolga = todasAusencias.find(a => a.funcionario === f.apelido && a.tipo === "Folga" && isDataNoRange(dataAtu, a));
                    const folgaEscala = sim[`${chave}-${f.apelido}`];
                    if (ausFolga || folgaEscala) {
                        let txt = folgaEscala ? "Folga Escala" : `Folga ${ausFolga.observacao}`;
                        let cl = folgaEscala ? "folga-escala" : (ausFolga.observacao === "Pedida" ? "folga-pedida" : (ausFolga.observacao === "Marcada" ? "folga-marcada" : "folga-programada"));
                        rowsHtml += `<tr class="${classeRow}"><td>${dataFmt}</td><td>${diaSemFmt}</td><td colspan="3" class="${cl}">${txt}</td></tr>`;
                    } else {
                        const j = (sem === 5 && f.periodo === "Integral") ? f.jornadaSexta : f.jornadaPrincipal;
                        let idEsc = j ? (eFeriado ? j.escalas.feriado : (sem === 0 ? j.escalas.domingo : (sem === 6 ? j.escalas.sabado : j.escalas.uteis))) : "";
                        const esc = escalas[idEsc];
                        if (esc) {
                            const t = calcularHoras(esc); totalMinutos += t.minutos;
                            rowsHtml += `<tr class="${classeRow}"><td>${dataFmt}</td><td>${diaSemFmt}</td><td>${esc.inicioJornada}</td><td>${esc.fimJornada}</td><td>${t.formatado}</td></tr>`;
                        } else rowsHtml += `<tr class="${classeRow}"><td>${dataFmt}</td><td>${diaSemFmt}</td><td colspan="3">-</td></tr>`;
                    }
                }
            }
            const hT = Math.floor(totalMinutos/60), mT = totalMinutos%60;
            wrapper.innerHTML = `<div class="box-nome-func">${f.apelido} - ${f.registro}</div><table class="tabela-jornada"><thead><tr><th style="width:50px">Data</th><th style="width:30px"></th><th style="width:45px">Ent.</th><th style="width:45px">Sai.</th><th style="width:45px">Tot.</th></tr></thead><tbody>${rowsHtml}</tbody><tfoot><tr><td colspan="4" class="footer-total">TOTAL</td><td class="footer-total">${String(hT).padStart(2,'0')}:${String(mT).padStart(2,'0')}</td></tr></tfoot></table>`;
            container.appendChild(wrapper);
        });
    } catch (e) { console.error(e); }
}

function simularEscalasSincronizadas(ausencias, funcionarios, anoAlvo, regrasAtivas, feriadosParam) {
    let dSim = new Date(anoAlvo, 0, 1), dFim = new Date(anoAlvo, 11, 31), dataZero = new Date(2026, 0, 31);
    let mFolgas = {};
    while (dSim <= dFim) {
        const d = dSim.getDate(), m = dSim.getMonth() + 1, y = dSim.getFullYear(), sem = dSim.getDay(), chave = `${d}-${m}-${y}`;
        const idxFDS = Math.abs(Math.floor((dSim.getTime() - new Date(2026, 0, 3).getTime()) / (1000 * 60 * 60 * 24 * 7)));
        funcionarios.forEach(f => {
            const eFer = feriadosParam[`${f.empresa}-${d}-${f.periodo}`] > 0;
            if (f.periodo === "Integral" && (sem === 6 || sem === 0 || eFer)) mFolgas[`${chave}-${f.apelido}`] = true;
        });
        const duplas = [{p1: "Cristiane", p2: "Vanessa"}, {p1: "Jaqueline", p2: "Evandro"}];
        if (sem === 6 || sem === 0) {
            const idxV = (sem === 6) ? idxFDS : Math.abs(Math.floor((new Date(dSim.getTime()-86400000).getTime() - new Date(2026,0,3).getTime())/(1000*60*60*24*7)));
            duplas.forEach(dupla => {
                const off = (sem === 6) ? (idxV % 2 === 0 ? dupla.p1 : dupla.p2) : (idxV % 2 !== 0 ? dupla.p1 : dupla.p2);
                mFolgas[`${chave}-${off}`] = true;
            });
        }
        if (dSim >= dataZero) {
            const idxM = Math.floor(((sem === 6 ? dSim : new Date(dSim.getTime()-86400000)).getTime() - dataZero.getTime()) / (1000 * 60 * 60 * 24 * 7));
            if (sem === 6) { if (idxM % 2 !== 0) mFolgas[`${chave}-Milena`] = true; else mFolgas[`${chave}-${SEQ_MANHA_BASE[Math.floor(idxM/2)%4]}`] = true; }
            else if (sem === 0) { const cS = `${new Date(dSim.getTime()-86400000).getDate()}-${m}-${y}`; if (!mFolgas[`${cS}-Milena`]) mFolgas[`${chave}-Milena`] = true; SEQ_MANHA_BASE.forEach(n => { if(!mFolgas[`${cS}-${n}`]) mFolgas[`${chave}-${n}`] = true; }); }
        }
        dSim.setDate(dSim.getDate() + 1);
    }
    return mFolgas;
}

function isDataNoRange(data, reg) {
    const toD = (s) => { const [d, m, y] = s.split('/').map(Number); return new Date(y, m - 1, d); };
    if (reg.modo === 'range') { const [i, f] = reg.datas.split(' até '); return data >= toD(i) && data <= toD(f); }
    return reg.datas.split(' ; ').some(d => toD(d).toDateString() === data.toDateString());
}

function processarDatasJornada(reg) {
    const toD = (s) => { const [d, m, y] = s.split('/').map(Number); return new Date(y, m - 1, d); };
    if (reg.modo === 'range') { const [i, f] = reg.datas.split(' até '); let cur = toD(i), end = toD(f), arr = []; while (cur <= end) { arr.push(new Date(cur)); cur.setDate(cur.getDate() + 1); } return arr; }
    return reg.datas.split(' ; ').map(toD);
}

function calcularHoras(esc) {
    const toM = (t) => { if(!t || t === '--:--') return 0; const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    let ent = toM(esc.inicioJornada), sai = toM(esc.fimJornada); if (sai < ent) sai += 1440;
    let bruta = (sai - ent); let liq = (bruta === 240) ? bruta : bruta - 60;
    return { minutos: liq, formatado: `${String(Math.floor(liq/60)).padStart(2,'0')}:${String(liq%60).padStart(2,'0')}` };
}