if (!sessionStorage.getItem('usuarioAtivo')) window.location.href = 'login.html';
const usuarioLogado = JSON.parse(sessionStorage.getItem('usuarioAtivo'));
const isMaster = usuarioLogado.perfilMaster === true;

const abrevFuncao = { "Líder": "Líder", "Auxiliar": "Aux.", "Assistente": "Ass." };
const SEQ_TARDE_AVUL = ["Lucas P.", "Roberto", "Valter", "Angelo", "Renato"];
const SEQ_MANHA_BASE = ["Geovana", "Maria Ap.", "Emerson", "Valeria"];

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
    { dia: 19, mes: 2, nome: "Emancipação Osasco", tipo: "municipal", empresa: "AVUL" },
    { dia: 13, mes: 6, nome: "Santo Antônio", tipo: "municipal", empresa: "AVUL" },
    { dia: 30, mes: 11, nome: "Emancipação Franco da Rocha", tipo: "municipal", empresa: "VCCL" },
    { dia: 8, mes: 12, nome: "Imaculada Conceição", tipo: "municipal", empresa: "VCCL" }
];

function processarDatas(reg) {
    if (!reg.datas) return [];
    let dates = [];
    const parse = (s) => { const [d, m, y] = s.split('/').map(Number); return new Date(y, m - 1, d); };
    if (reg.modo === 'range') {
        const p = reg.datas.split(' até ');
        if (p.length < 2) return [];
        let curr = parse(p[0]), end = parse(p[1]);
        while (curr <= end) { dates.push(new Date(curr.getTime())); curr.setDate(curr.getDate() + 1); }
    } else { reg.datas.split(' ; ').forEach(s => { if(s) dates.push(parse(s)); }); }
    return dates;
}

function getDiasAusencia(apelido, lista, tipo, m, y) {
    let dias = [];
    lista.filter(a => a.funcionario === apelido && a.tipo === tipo).forEach(reg => {
        processarDatas(reg).forEach(dt => { if (dt.getMonth() + 1 === m && dt.getFullYear() === y) dias.push(dt.getDate()); });
    });
    return dias;
}

function getDetalhesFolgas(apelido, lista, m, y) {
    let folgas = {};
    lista.filter(a => a.funcionario === apelido && a.tipo === "Folga").forEach(reg => {
        processarDatas(reg).forEach(dt => { if (dt.getMonth() + 1 === m && dt.getFullYear() === y) folgas[dt.getDate()] = reg.observacao; });
    });
    return folgas;
}

function obterUltimoDomingo(ano, mes) {
    let d = new Date(ano, mes, 0);
    while (d.getDay() !== 0) { d.setDate(d.getDate() - 1); }
    return d.getDate();
}

function fPediuManualGlobal(apelido, dia, m, y, ausencias) {
    const dtRef = new Date(y, m - 1, dia).getTime();
    return ausencias.some(a => a.funcionario === apelido && a.tipo === "Folga" && (a.observacao === "Pedida" || a.observacao === "Marcada") && processarDatas(a).some(dt => dt.getTime() === dtRef));
}

function emFeriasGlobal(apelido, dia, m, y, ausencias) {
    const dtRef = new Date(y, m - 1, dia).getTime();
    return ausencias.some(a => a.funcionario === apelido && a.tipo === "Férias" && processarDatas(a).some(dt => dt.getTime() === dtRef));
}

function simularEscalasAnoTodo(ausencias, funcionarios, anoAlvo, regrasAtivas) {
    let dSim = new Date(anoAlvo, 0, 1);
    const dFim = new Date(anoAlvo, 11, 31);
    const dataBaseRef = new Date(2026, 0, 3); 
    const dataMarcoZeroFDSManha = new Date(2026, 0, 31); 
    let pTardeAvul = 0, pManhaRodizio = 0; 
    let mManhaAvul = {}, mTardeAvul = {}, mNoite = {}, mVCCL = {};

    while (dSim <= dFim) {
        const d = dSim.getDate(), m = dSim.getMonth() + 1, y = dSim.getFullYear();
        const chave = `${d}-${m}-${y}`, sem = dSim.getDay();
        const idxFDSGeral = Math.abs(Math.floor((dSim.getTime() - dataBaseRef.getTime()) / (1000 * 60 * 60 * 24 * 7)));

        if (sem === 6) {
            const dDom = new Date(dSim); dDom.setDate(dDom.getDate() + 1);
            const ultD = obterUltimoDomingo(y, m);
            if (d !== ultD - 1) {
                if (idxFDSGeral % 2 === 0) { mNoite[chave + "-AVUL"] = true; mNoite[`${dDom.getDate()}-${dDom.getMonth()+1}-${dDom.getFullYear()}-VCCL`] = true; }
                else { mNoite[chave + "-VCCL"] = true; mNoite[`${dDom.getDate()}-${dDom.getMonth()+1}-${dDom.getFullYear()}-AVUL`] = true; }
            }
        }
        if (regrasAtivas.equipeTarde) {
            if (sem === 6) {
                const marciaFeriasAgora = emFeriasGlobal("Márcia", d, m, y, ausencias);
                if (!marciaFeriasAgora && d !== (obterUltimoDomingo(y,m)-1)) mTardeAvul[`${chave}-Márcia`] = true;
                else {
                    let t = 0; while (t < 5) {
                        let cand = SEQ_TARDE_AVUL[pTardeAvul % 5];
                        if (!emFeriasGlobal(cand, d, m, y, ausencias)) { mTardeAvul[`${chave}-${cand}`] = true; pTardeAvul++; break; }
                        pTardeAvul++; t++;
                    }
                }
            } else if (sem === 0) {
                const dSabA = new Date(dSim.getTime() - 86400000);
                const chaveSab = `${dSabA.getDate()}-${dSabA.getMonth()+1}-${dSabA.getFullYear()}`;
                if (!mTardeAvul[`${chaveSab}-Márcia`] || (getDetalhesFolgas("Márcia", ausencias, m, y)[d] === "Programada")) mTardeAvul[`${chave}-Márcia`] = true;
                SEQ_TARDE_AVUL.forEach(nome => { if (!mTardeAvul[`${chaveSab}-${nome}`] || (getDetalhesFolgas(nome, ausencias, m, y)[d] === "Programada")) mTardeAvul[`${chave}-${nome}`] = true; });
            }
        }
        if (dSim < dataMarcoZeroFDSManha) {
            if (sem === 6) {
                let quemPediu = SEQ_MANHA_BASE.find(nome => fPediuManualGlobal(nome, d, m, y, ausencias));
                if (quemPediu) SEQ_MANHA_BASE.forEach(n => { if(n !== quemPediu) mManhaAvul[`${d+1}-${m}-${y}-${n}`] = true; });
            } else if (sem === 0) { if (m === 1 && [11, 18, 25].includes(d)) mManhaAvul[`${chave}-Milena`] = true; mManhaAvul[`${chave}-Eloah`] = true; }
        } else {
            const equipeRodManha = [...SEQ_MANHA_BASE];
            if (regrasAtivas.equipeManha) equipeRodManha.push("Eloah");
            const dRefSab = (sem === 6) ? dSim : new Date(dSim.getTime() - 86400000);
            const idxFDSManha = Math.floor((dRefSab.getTime() - dataMarcoZeroFDSManha.getTime()) / (1000 * 60 * 60 * 24 * 7));
            if (sem === 6) {
                const milenaTurnoSab = (idxFDSManha % 2 !== 0);
                if (milenaTurnoSab) mManhaAvul[`${chave}-Milena`] = true;
                else {
                    let t = 0; while (t < equipeRodManha.length) {
                        let titular = equipeRodManha[pManhaRodizio % equipeRodManha.length];
                        if (!emFeriasGlobal(titular, d, m, y, ausencias)) { mManhaAvul[`${chave}-${titular}`] = true; pManhaRodizio++; break; }
                        pManhaRodizio++; t++;
                    }
                }
            } else if (sem === 0) {
                const dSabA = new Date(dSim.getTime() - 86400000);
                const chaveSab = `${dSabA.getDate()}-${dSabA.getMonth()+1}-${dSabA.getFullYear()}`;
                if (!mManhaAvul[`${chaveSab}-Milena`] || (getDetalhesFolgas("Milena", ausencias, m, y)[d] === "Programada")) mManhaAvul[`${chave}-Milena`] = true;
                equipeRodManha.forEach(nome => { if (!mManhaAvul[`${chaveSab}-${nome}`] || (getDetalhesFolgas(nome, ausencias, m, y)[d] === "Programada")) mManhaAvul[`${chave}-${nome}`] = true; });
                if (!regrasAtivas.equipeManha) mManhaAvul[`${chave}-Eloah`] = true;
            }
        }
        if (sem === 6 || sem === 0) {
            const duplas = [{ p1: "Cristiane", p2: "Vanessa" }, { p1: "Jaqueline", p2: "Evandro" }];
            duplas.forEach(dupla => {
                let natOff = (sem === 6) ? (idxFDSGeral % 2 === 0 ? dupla.p1 : dupla.p2) : (idxFDSGeral % 2 !== 0 ? dupla.p1 : dupla.p2);
                if (natOff) mVCCL[`${chave}-${natOff}`] = true;
            });
        }
        dSim.setDate(dSim.getDate() + 1);
    }
    return { tardeAvul: mTardeAvul, manhaAvul: mManhaAvul, noite: mNoite, vccl: mVCCL };
}

async function gerarMapa() {
    const mes = parseInt(document.getElementById('mapa-mes').value), ano = parseInt(document.getElementById('mapa-ano').value);
    const empSel = isMaster ? Array.from(document.querySelectorAll('.filtro-emp:checked')).map(cb => cb.value) : ["AVUL", "VCCL", "VSBL"];
    const perSel = isMaster ? Array.from(document.querySelectorAll('.filtro-per:checked')).map(cb => cb.value) : ["Manhã", "Intermediário", "Tarde", "Noite", "Integral"];
    const container = document.getElementById('mapa-container');
    container.innerHTML = "Sincronizando...";

    try {
        const [snapFunc, snapAus, docRegras] = await Promise.all([db.collection("funcionarios").get(), db.collection("ausencias").get(), db.collection("parametros_regras").doc("especiais").get()]);
        const regrasAtivas = docRegras.exists ? docRegras.data() : {};
        let ausencias = snapAus.docs.map(d => d.data());
        let funcionarios = snapFunc.docs.map(d => d.data()).filter(f => f.funcao !== "Aprendiz" && f.status !== "Inativo");
        
        const sim = simularEscalasAnoTodo(ausencias, funcionarios, ano, regrasAtivas);
        const diasNoMes = new Date(ano, mes, 0).getDate();
        container.innerHTML = "";

        empSel.forEach(empresa => {
            const funcsEmpresa = funcionarios.filter(f => f.empresa === empresa);
            if (funcsEmpresa.length === 0) return;
            const section = document.createElement('div'); section.className = "empresa-section";
            section.innerHTML = `<div class="empresa-title">EMPRESA ${empresa}</div>`;

            perSel.forEach(per => {
                const funcsPeriodo = funcsEmpresa.filter(f => f.periodo === per);
                // --- IDENTIFICAÇÃO DO USUÁRIO LOGADO (Resiliente) ---
                const listaFinal = isMaster ? funcsPeriodo : funcsPeriodo.filter(f => f.nome.trim().toLowerCase() === usuarioLogado.nomeCompleto.trim().toLowerCase());
                if (listaFinal.length === 0) return;
                const sub = document.createElement('div'); sub.className = "periodo-subtitle"; sub.innerText = `PERÍODO: ${per}`;
                section.appendChild(sub);
                listaFinal.sort((a, b) => a.nome.localeCompare(b.nome));

                const wrapper = document.createElement('div'); wrapper.className = "table-wrapper";
                let tableHtml = `<table><thead><tr><th class="col-func">FUNCIONÁRIO</th>`;
                for (let d = 1; d <= diasNoMes; d++) {
                    const dObj = new Date(ano, mes - 1, d);
                    tableHtml += `<th>${String(d).padStart(2,'0')}/${String(mes).padStart(2,'0')}<br>${dObj.toLocaleDateString('pt-BR', {weekday:'short'}).replace('.','')}</th>`;
                }
                tableHtml += `</tr></thead><tbody>`;

                listaFinal.forEach(f => {
                    tableHtml += `<tr><td class="col-func">${f.apelido} - ${f.registro}</td>`;
                    let ferias = getDiasAusencia(f.apelido, ausencias, "Férias", mes, ano);
                    let afastamentos = getDiasAusencia(f.apelido, ausencias, "Afastamento", mes, ano);
                    let faltas = getDiasAusencia(f.apelido, ausencias, "Falta", mes, ano);
                    let folgasInfo = getDetalhesFolgas(f.apelido, ausencias, mes, ano);

                    for (let d = 1; d <= diasNoMes; d++) {
                        const sem = new Date(ano, mes-1, d).getDay(), eFer = feriadosBase.some(fer => fer.dia === d && fer.mes === mes && (fer.tipo !== "municipal" || fer.empresa === empresa));
                        const chave = `${d}-${mes}-${ano}`;
                        let simboloA = "";
                        if (f.nascimento) { const [yN, mN, dN] = f.nascimento.split('-').map(Number); if (dN === d && mN === mes) simboloA = `<span class="symbol-a">A</span>`; }
                        if (ferias.includes(d)) { let count = 1; while(ferias.includes(d+count)) count++; tableHtml += `<td colspan="${count}" class="dia-ferias">${simboloA}Férias</td>`; d += (count-1); continue; }
                        if (afastamentos.includes(d)) { let count = 1; while(afastamentos.includes(d+count)) count++; tableHtml += `<td colspan="${count}" class="dia-afastamento">${simboloA}AFAST.</td>`; d += (count-1); continue; }
                        if (faltas.includes(d)) { tableHtml += `<td class="dia-falta">${simboloA}Falta</td>`; continue; }
                        let conteudo = "", decidido = false;
                        if (folgasInfo[d]) { conteudo = `<span class="${folgasInfo[d]==='Pedida'?'folga-pedida':(folgasInfo[d]==='Marcada'?'folga-marcada':'folga-programada')}">${folgasInfo[d]==='Programada'?'F':'X'}</span>`; decidido = true; }
                        if (!decidido && empresa === "VCCL" && sim.vccl[`${chave}-${f.apelido}`]) { conteudo = '<b>X</b>'; decidido = true; }
                        if (!decidido && empresa === "AVUL" && per === "Manhã" && sim.manhaAvul[`${chave}-${f.apelido}`]) { conteudo = '<b>X</b>'; decidido = true; }
                        if (!decidido && empresa === "AVUL" && per === "Tarde" && sim.tardeAvul[`${chave}-${f.apelido}`]) { conteudo = '<b>X</b>'; decidido = true; }
                        if (!decidido && f.periodo === "Noite") { if (sem === 6) { if (f.apelido === "Fábio" && d === (obterUltimoDomingo(ano,mes)-1)) { conteudo = '<b>X</b>'; decidido = true; } else if ((sim.noite[chave + "-VCCL"] && f.empresa === "VCCL") || (sim.noite[chave + "-AVUL"] && f.empresa === "AVUL")) { conteudo = '<b>X</b>'; decidido = true; } } else if (sem === 0) { if (f.apelido === "Osmair" && d === obterUltimoDomingo(ano,mes)) { conteudo = '<b>X</b>'; decidido = true; } else if ((sim.noite[chave + "-VCCL"] && f.empresa === "VCCL") || (sim.noite[chave + "-AVUL"] && f.empresa === "AVUL")) { conteudo = '<b>X</b>'; decidido = true; } } }
                        if (!decidido) { if (f.funcao === "Líder" && (sem === 0 || sem === 6 || eFer)) conteudo = '<b>X</b>'; else if (sem === 0 && new Date(ano,mes-1,d+1).getDay() === 1 && emFeriasGlobal(f.apelido, d+1, mes, ano, ausencias)) conteudo = '<b>X</b>'; }
                        tableHtml += `<td class="${eFer?'dia-feriado':(sem===0?'dia-domingo':(sem===6?'dia-sabado':''))}">${simboloA}${conteudo}</td>`;
                    }
                    tableHtml += `</tr>`;
                });
                wrapper.innerHTML = tableHtml + `</tbody></table>`;
                section.appendChild(wrapper);
            });
            container.appendChild(section);
        });
        toggleSimbolosExtras();
    } catch (e) { console.error(e); }
}

function toggleSimbolosExtras() {
    const container = document.getElementById('mapa-container');
    const chk = document.getElementById('chk-exibir-extras');
    if (!chk) return;
    if (chk.checked) container.classList.remove('hide-extras');
    else container.classList.add('hide-extras');
}

async function salvarMapaDefinitivo() {
    const mes = document.getElementById('mapa-mes').value, ano = document.getElementById('mapa-ano').value, html = document.getElementById('mapa-container').innerHTML;
    try { await db.collection("mapas_salvos").doc(`${ano}-${mes}`).set({ html, salvoEm: Date.now() }); alert("Mapa salvo!"); } catch (e) { alert("Erro ao salvar."); }
}

function ajustarSidebar() {
    const permissoes = usuarioLogado.permissoes || [];
    document.querySelectorAll('.sidebar ul li a').forEach(link => {
        const pagina = link.getAttribute('href').replace('.html', '');
        if (!isMaster && !permissoes.includes(pagina) && pagina !== "index") link.parentElement.style.display = 'none';
    });
}

document.addEventListener('DOMContentLoaded', () => { 
    ajustarSidebar();
    if (!isMaster) { document.querySelectorAll('.filter-group-visible, .btn-generate, .btn-save-blue, .btn-print-red').forEach(el => el.style.display = 'none'); }
    const inputAno = document.getElementById('mapa-ano'), selectMes = document.getElementById('mapa-mes');
    if(inputAno && (inputAno.value === "" || inputAno.value === "2026")) inputAno.value = new Date().getFullYear();
    inputAno.addEventListener('change', gerarMapa); selectMes.addEventListener('change', gerarMapa);
    document.querySelectorAll('.filtro-emp, .filtro-per').forEach(el => el.addEventListener('change', gerarMapa));
    gerarMapa(); 
});