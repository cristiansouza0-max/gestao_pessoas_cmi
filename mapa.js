if (!sessionStorage.getItem('usuarioAtivo')) window.location.href = 'login.html';
const usuarioLogado = JSON.parse(sessionStorage.getItem('usuarioAtivo'));
const isMaster = usuarioLogado.perfilMaster === true;

const SEQ_TARDE_AVUL = ["Lucas Pazorine", "José Roberto", "Valter Lúcio", "Angelo de Melo", "Claudio Renato"];
const SEQ_MANHA_BASE = ["Geovana Fanyne", "Maria Aparecida", "Emerson Silva", "Valeria Ribeiro", "Milena Benites"];

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

function getTipoAusenciaNoDia(apelido, dia, mes, ano, ausencias) {
    const dtRef = new Date(ano, mes - 1, dia).getTime();
    const reg = ausencias.find(a => a.funcionario === apelido && a.tipo !== "Folga" && processarDatas(a).some(dt => dt.getTime() === dtRef));
    return reg ? reg.tipo : null;
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

function estaAusenteGlobal(apelido, dia, m, y, ausencias) {
    const dtRef = new Date(y, m - 1, dia).getTime();
    return ausencias.some(a => a.funcionario === apelido && a.tipo !== "Folga" && processarDatas(a).some(dt => dt.getTime() === dtRef));
}

function emFeriasGlobal(apelido, dia, m, y, ausencias) {
    const dtRef = new Date(y, m - 1, dia).getTime();
    return ausencias.some(a => a.funcionario === apelido && a.tipo === "Férias" && processarDatas(a).some(dt => dt.getTime() === dtRef));
}

function fPediuManualGlobal(apelido, dia, m, y, ausencias) {
    const dtRef = new Date(y, m - 1, dia).getTime();
    return ausencias.some(a => a.funcionario === apelido && a.tipo === "Folga" && (a.observacao === "Pedida" || a.observacao === "Marcada" || a.observacao === "Programada") && processarDatas(a).some(dt => dt.getTime() === dtRef));
}

function simularEscalasAnoTodo(ausencias, funcionarios, anoAlvo, regrasAtivas) {
    let dSim = new Date(anoAlvo, 0, 1);
    const dFim = new Date(anoAlvo, 11, 31);
    const dataBaseRef = new Date(2026, 0, 3); 
    const dataMarcoZeroFDSManha = new Date(2026, 0, 31); 
    const dataNovaRegraMarço = new Date(2026, 2, 1); 
    
    let pTardeAvul = 0, pManhaRodizio = 0; 
    let mManhaAvul = {}, mTardeAvul = {}, mNoite = {}, mVCCL = {};
    let quemFolgouSabadoManha = null;

    const assistenteInterVCCL = funcionarios.find(f => f.empresa === "VCCL" && f.periodo === "Intermediário" && f.funcao === "Assistente");
    const interApelido = assistenteInterVCCL ? assistenteInterVCCL.apelido : null;

    const precisaSubstituicao = (apelido, diaSim) => {
        if (estaAusenteGlobal(apelido, diaSim.getDate(), diaSim.getMonth() + 1, diaSim.getFullYear(), ausencias)) return true;
        const fInfo = funcionarios.find(x => x.apelido === apelido);
        if (fInfo && fInfo.status === "Inativo" && fInfo.demissao) {
            const dtDem = new Date(fInfo.demissao + "T00:00:00");
            return diaSim >= dtDem;
        }
        return false;
    };

    while (dSim <= dFim) {
        const d = dSim.getDate(), m = dSim.getMonth() + 1, y = dSim.getFullYear();
        const chave = `${d}-${m}-${y}`, sem = dSim.getDay();
        const idxFDSGeral = Math.abs(Math.floor((dSim.getTime() - dataBaseRef.getTime()) / (1000 * 60 * 60 * 24 * 7)));

        const funcsDia = funcionarios.filter(f => {
            const dtAdm = new Date(f.admissao + "T00:00:00");
            const dtDem = f.demissao ? new Date(f.demissao + "T00:00:00") : null;
            return dSim >= dtAdm && (!dtDem || dSim < dtDem);
        });

        if (dSim < dataNovaRegraMarço) {
            if (sem === 6) {
                const equipeBase = ["Geovana Fanyne", "Maria Aparecida", "Emerson Silva", "Valeria Ribeiro"];
                const idxFDS = Math.floor((dSim.getTime() - dataMarcoZeroFDSManha.getTime()) / (1000 * 60 * 60 * 24 * 7));
                let manual = equipeBase.find(n => fPediuManualGlobal(n, d, m, y, ausencias)) || (fPediuManualGlobal("Milena Benites", d, m, y, ausencias) ? "Milena Benites" : null);
                if (manual) { mManhaAvul[`${chave}-${manual}`] = true; quemFolgouSabadoManha = manual; }
                else if (dSim >= dataMarcoZeroFDSManha) {
                    let escala = (idxFDS % 2 !== 0) ? "Milena Benites" : equipeBase[pManhaRodizio % equipeBase.length];
                    mManhaAvul[`${chave}-${escala}`] = true; quemFolgouSabadoManha = escala;
                    if (idxFDS % 2 === 0) pManhaRodizio++;
                }
            } else if (sem === 0) {
                const equipeEspelho = ["Geovana Fanyne", "Maria Aparecida", "Emerson Silva", "Valeria Ribeiro", "Milena Benites"];
                equipeEspelho.forEach(n => { if(n !== quemFolgouSabadoManha) mManhaAvul[`${chave}-${n}`] = true; });
                mManhaAvul[`${chave}-Eloah Batista`] = true;
            }
        } else {
            const equipeNova = [...SEQ_MANHA_BASE];
            if (regrasAtivas.equipeManha) equipeNova.push("Eloah Batista");
            if (sem === 6) {
                quemFolgouSabadoManha = null;
                let manual = equipeNova.find(n => fPediuManualGlobal(n, d, m, y, ausencias));
                if (manual) { mManhaAvul[`${chave}-${manual}`] = true; quemFolgouSabadoManha = manual; }
                else {
                    let limiteLoop = 0;
                    while (limiteLoop < equipeNova.length) {
                        let titular = equipeNova[pManhaRodizio % equipeNova.length];
                        if (!precisaSubstituicao(titular, dSim)) {
                            mManhaAvul[`${chave}-${titular}`] = true;
                            quemFolgouSabadoManha = titular;
                            pManhaRodizio++; break;
                        }
                        pManhaRodizio++; limiteLoop++;
                    }
                }
            } else if (sem === 0) {
                equipeNova.forEach(nome => { if (nome !== quemFolgouSabadoManha) mManhaAvul[`${chave}-${nome}`] = true; });
                if (!regrasAtivas.equipeManha) mManhaAvul[`${chave}-Eloah Batista`] = true;
            }
        }

        if (regrasAtivas.equipeTarde && sem === 6) {
            const ultDom = obterUltimoDomingo(y, m);
            const ehSabadoAntesUltimoDom = (d === ultDom - 1);
            let marciaJaFolgouDomingoEsteMes = false;
            for (let diaA = 1; diaA < d; diaA++) {
                const dataA = new Date(y, m - 1, diaA);
                if (dataA.getDay() === 0 && mTardeAvul[`${diaA}-${m}-${y}-Márcia Cristina`]) { marciaJaFolgouDomingoEsteMes = true; break; }
            }
            const dSeg = new Date(dSim.getTime() + (2 * 86400000));
            const marciaComecaFeriasNaSegunda = emFeriasGlobal("Márcia Cristina", dSeg.getDate(), dSeg.getMonth() + 1, dSeg.getFullYear(), ausencias) && !emFeriasGlobal("Márcia Cristina", dSim.getDate(), dSim.getMonth() + 1, dSim.getFullYear(), ausencias);
            let marciaTrabalhaSabado = (ehSabadoAntesUltimoDom && !marciaJaFolgouDomingoEsteMes) || marciaComecaFeriasNaSegunda || precisaSubstituicao("Márcia Cristina", dSim);
            if (!marciaTrabalhaSabado) { mTardeAvul[`${chave}-Márcia Cristina`] = true; } 
            else {
                let t = 0; while (t < 5) {
                    let cand = SEQ_TARDE_AVUL[pTardeAvul % 5];
                    if (!precisaSubstituicao(cand, dSim)) { mTardeAvul[`${chave}-${cand}`] = true; pTardeAvul++; break; }
                    pTardeAvul++; t++;
                }
            }
        } else if (regrasAtivas.equipeTarde && sem === 0) {
            const dOntem = new Date(dSim.getTime() - 86400000);
            const chaveSab = `${dOntem.getDate()}-${dOntem.getMonth() + 1}-${dOntem.getFullYear()}`;
            const dAmanha = new Date(dSim.getTime() + 86400000);
            const marciaComecaFeriasNaSegunda = emFeriasGlobal("Márcia Cristina", dAmanha.getDate(), dAmanha.getMonth() + 1, dAmanha.getFullYear(), ausencias) && !emFeriasGlobal("Márcia Cristina", dSim.getDate(), dSim.getMonth() + 1, dSim.getFullYear(), ausencias);
            if (!mTardeAvul[`${chaveSab}-Márcia Cristina`] || marciaComecaFeriasNaSegunda) { if (!precisaSubstituicao("Márcia Cristina", dSim)) mTardeAvul[`${chave}-Márcia Cristina`] = true; }
            SEQ_TARDE_AVUL.forEach(nome => { if (!mTardeAvul[`${chaveSab}-${nome}`]) { if (!precisaSubstituicao(nome, dSim)) mTardeAvul[`${chave}-${nome}`] = true; } });
        }

        if (sem === 6) {
            const dDom = new Date(dSim); dDom.setDate(dDom.getDate() + 1);
            const ultD = obterUltimoDomingo(y, m);
            if (d !== ultD - 1) {
                if (idxFDSGeral % 2 === 0) { mNoite[chave + "-AVUL"] = true; mNoite[`${dDom.getDate()}-${dDom.getMonth()+1}-${dDom.getFullYear()}-VCCL`] = true; } 
                else { mNoite[chave + "-VCCL"] = true; mNoite[`${dDom.getDate()}-${dDom.getMonth()+1}-${dDom.getFullYear()}-AVUL`] = true; }
            }
        }

        if (sem === 6 || sem === 0) {
            const m_vccl = funcsDia.filter(f => f.empresa === "VCCL" && f.periodo === "Manhã");
            const t_vccl = funcsDia.filter(f => f.empresa === "VCCL" && f.periodo === "Tarde");
            let duplas = []; let interOcupado = false;
            if (m_vccl.length === 2) duplas.push({ p1: m_vccl[0].apelido, p2: m_vccl[1].apelido });
            else if (m_vccl.length === 1 && interApelido) { duplas.push({ p1: m_vccl[0].apelido, p2: interApelido }); interOcupado = true; }
            if (t_vccl.length === 2) duplas.push({ p1: t_vccl[0].apelido, p2: t_vccl[1].apelido });
            else if (t_vccl.length === 1 && interApelido) { duplas.push({ p1: t_vccl[0].apelido, p2: interApelido }); interOcupado = true; }
            duplas.forEach(dupla => {
                let tA = dupla.p1, tB = dupla.p2;
                if (tA !== interApelido && precisaSubstituicao(tA, dSim) && interApelido && !interOcupado) { tA = interApelido; interOcupado = true; }
                else if (tB !== interApelido && precisaSubstituicao(tB, dSim) && interApelido && !interOcupado) { tB = interApelido; interOcupado = true; }
                let nOff = (sem === 6) ? (idxFDSGeral % 2 === 0 ? tA : tB) : (idxFDSGeral % 2 !== 0 ? tA : tB);
                let darF = nOff;
                if (sem === 6) { if (fPediuManualGlobal(nOff, d+1, m, y, ausencias) || precisaSubstituicao(nOff, new Date(y, m-1, d+2))) darF = (nOff === tA ? tB : tA); }
                else if (sem === 0) { if (precisaSubstituicao((nOff === tA ? tB : tA), new Date(y, m-1, d+1))) darF = null; }
                if (darF) mVCCL[`${chave}-${darF}`] = true;
            });
            if (!interOcupado && sem === 0 && interApelido) mVCCL[`${chave}-${interApelido}`] = true;
        }
        dSim.setDate(dSim.getDate() + 1);
    }
    return { tardeAvul: mTardeAvul, manhaAvul: mManhaAvul, noite: mNoite, vccl: mVCCL };
}

async function gerarMapa() {
    const mes = parseInt(document.getElementById('mapa-mes').value), ano = parseInt(document.getElementById('mapa-ano').value);
    
    // Captura dos Filtros Selecionados
    const empSel = isMaster ? Array.from(document.querySelectorAll('.filtro-emp:checked')).map(cb => cb.value) : ["AVUL", "VCCL", "VSBL"];
    const setSel = isMaster ? Array.from(document.querySelectorAll('.filtro-set:checked')).map(cb => cb.value) : ["Tráfego", "Monitoramento"];
    const perSel = isMaster ? Array.from(document.querySelectorAll('.filtro-per:checked')).map(cb => cb.value) : ["Manhã", "Intermediário", "Tarde", "Noite", "Integral"];
    
    const container = document.getElementById('mapa-container');
    container.innerHTML = "Sincronizando...";

    try {
        const [snapFunc, snapAus, docRegras] = await Promise.all([db.collection("funcionarios").get(), db.collection("ausencias").get(), db.collection("parametros_regras").doc("especiais").get()]);
        const regrasAtivas = docRegras.exists ? docRegras.data() : {};
        let ausencias = snapAus.docs.map(d => d.data());
        const dataFimMes = new Date(ano, mes, 0);

        let funcionarios = snapFunc.docs.map(d => d.data()).filter(f => {
            // LÓGICA DE FILTRAGEM CORRIGIDA PARA INCLUIR SETOR
            if (f.funcao === "Aprendiz") return false;
            if (!empSel.includes(f.empresa)) return false;
            if (!setSel.includes(f.setor || "Tráfego")) return false; // Default para Tráfego se setor for vazio
            if (!perSel.includes(f.periodo)) return false;
            
            return new Date(f.admissao + "T00:00:00") <= dataFimMes && (f.status === "Ativo" || (f.demissao && new Date(f.demissao + "T00:00:00") >= new Date(ano, mes-1, 1)));
        });

        const sim = simularEscalasAnoTodo(ausencias, funcionarios, ano, regrasAtivas);
        const diasNoMes = dataFimMes.getDate();
        container.innerHTML = "";

        ["AVUL", "VCCL", "VSBL"].forEach(empresa => {
            if (!empSel.includes(empresa)) return;
            const funcsEmpresa = funcionarios.filter(f => f.empresa === empresa);
            if (funcsEmpresa.length === 0) return;
            const section = document.createElement('div'); section.className = "empresa-section";
            section.innerHTML = `<div class="empresa-title">EMPRESA ${empresa}</div>`;
            
            perSel.forEach(per => {
                const funcsPeriodo = funcsEmpresa.filter(f => f.periodo === per);
                if (funcsPeriodo.length === 0) return;
                section.appendChild(Object.assign(document.createElement('div'), { className: "periodo-subtitle", innerText: `PERÍODO: ${per}` }));
                const wrapper = document.createElement('div'); wrapper.className = "table-wrapper";
                let tableHtml = `<table><thead><tr><th class="col-func">FUNCIONÁRIO</th>`;
                for (let d = 1; d <= diasNoMes; d++) {
                    const dObj = new Date(ano, mes-1, d);
                    let diaSem = dObj.toLocaleDateString('pt-BR', {weekday:'short'}).replace('.','');
                    tableHtml += `<th>${String(d).padStart(2,'0')}/${String(mes).padStart(2,'0')}<br>${diaSem.charAt(0).toUpperCase() + diaSem.slice(1)}</th>`;
                }
                tableHtml += `</tr></thead><tbody>`;

                funcsPeriodo.sort((a,b) => a.nome.localeCompare(b.nome)).forEach(f => {
                    tableHtml += `<tr><td class="col-func">${f.apelido} - ${f.registro}</td>`;
                    const dtAdm = new Date(f.admissao + "T00:00:00");
                    const dtDem = (f.status === "Inativo" && f.demissao) ? new Date(f.demissao + "T00:00:00") : null;
                    let folgasInfo = getDetalhesFolgas(f.apelido, ausencias, mes, ano);

                    for (let d = 1; d <= diasNoMes; d++) {
                        const dObj = new Date(ano, mes-1, d), sem = dObj.getDay(), chave = `${d}-${mes}-${ano}`;
                        const tipoAus = getTipoAusenciaNoDia(f.apelido, d, mes, ano, ausencias);
                        if (dObj < dtAdm) { tableHtml += `<td style="background:#eee"></td>`; continue; }
                        if (dtDem && dObj >= dtDem) { tableHtml += `<td colspan="${diasNoMes - d + 1}" class="dia-demitido">Demitido</td>`; d = diasNoMes; continue; }
                        let simboloA = ""; if (f.nascimento) { const [yN, mN, dN] = f.nascimento.split('-').map(Number); if (dN === d && mN === mes) simboloA = `<span class="symbol-a">A</span>`; }
                        if (tipoAus) {
                            let count = 1;
                            while ((d + count) <= diasNoMes && getTipoAusenciaNoDia(f.apelido, d + count, mes, ano, ausencias) === tipoAus) { count++; }
                            let cls = tipoAus === "Férias" ? "dia-ferias" : (tipoAus === "Falta" ? "dia-falta" : "dia-afastamento");
                            tableHtml += `<td colspan="${count}" class="${cls}">${simboloA}${tipoAus.toUpperCase()}</td>`;
                            d += (count - 1); continue;
                        }
                        const eFer = feriadosBase.some(fer => fer.dia === d && fer.mes === mes && (fer.tipo !== "municipal" || fer.empresa === empresa));
                        let conteudo = "", decidido = false;
                        if (folgasInfo[d]) { conteudo = `<span class="${folgasInfo[d]==='Pedida'?'folga-pedida':(folgasInfo[d]==='Marcada'?'folga-marcada':'folga-programada')}">${folgasInfo[d]==='Programada'?'F':'X'}</span>`; decidido = true; }
                        if (!decidido && ((empresa === "VCCL" && sim.vccl[`${chave}-${f.apelido}`]) || (empresa === "AVUL" && per === "Manhã" && sim.manhaAvul[`${chave}-${f.apelido}`]) || (empresa === "AVUL" && per === "Tarde" && sim.tardeAvul[`${chave}-${f.apelido}`]))) { conteudo = '<b>X</b>'; decidido = true; }
                        if (!decidido && f.periodo === "Noite") { 
                            if ((sem === 6 && ((f.apelido === "Fábio Miguel" && d === (obterUltimoDomingo(ano,mes)-1)) || (sim.noite[chave+"-VCCL"] && f.empresa === "VCCL") || (sim.noite[chave+"-AVUL"] && f.empresa === "AVUL"))) || (sem === 0 && ((f.apelido === "Osmair Lopes" && d === obterUltimoDomingo(ano,mes)) || (sim.noite[chave+"-VCCL"] && f.empresa === "VCCL") || (sim.noite[chave+"-AVUL"] && f.empresa === "AVUL")))) { conteudo = '<b>X</b>'; decidido = true; }
                        }
                        if (!decidido && (f.funcao === "Líder" && (sem === 0 || sem === 6 || eFer))) { conteudo = '<b>X</b>'; }
                        else if (!decidido && sem === 0 && d < diasNoMes && new Date(ano,mes-1,d+1).getDay() === 1 && emFeriasGlobal(f.apelido, d+1, mes, ano, ausencias)) { conteudo = '<b>X</b>'; }
                        tableHtml += `<td class="${eFer?'dia-feriado':(sem===0?'dia-domingo':(sem===6?'dia-sabado':''))}">${simboloA}${conteudo}</td>`;
                    }
                    tableHtml += `</tr>`;
                });
                wrapper.innerHTML = tableHtml + `</tbody></table>`; section.appendChild(wrapper);
            });
            container.appendChild(section);
        });
        toggleSimbolosExtras();
    } catch (e) { console.error(e); }
}

function toggleSimbolosExtras() {
    const container = document.getElementById('mapa-container'), chk = document.getElementById('chk-exibir-extras');
    if (chk && container) { if (chk.checked) container.classList.remove('hide-extras'); else container.classList.add('hide-extras'); }
}

async function salvarMapaDefinitivo() {
    const mes = document.getElementById('mapa-mes').value, ano = document.getElementById('mapa-ano').value, html = document.getElementById('mapa-container').innerHTML;
    try { await db.collection("mapas_salvos").doc(`${ano}-${mes}`).set({ html, salvoEm: Date.now() }); alert("Mapa salvo!"); } catch (e) { alert("Erro ao salvar."); }
}

function ajustarSidebar() {
    if (!usuarioLogado) return;
    const permissoes = usuarioLogado.permissoes || [];
    document.querySelectorAll('.sidebar ul li a').forEach(link => {
        const href = link.getAttribute('href').replace('.html', '');
        if (href === "index" || link.getAttribute('href') === "#") return;
        link.parentElement.style.display = (isMaster || permissoes.includes(href)) ? 'block' : 'none';
    });
}

function logout() { sessionStorage.removeItem('usuarioAtivo'); window.location.href = 'login.html'; }

document.addEventListener('DOMContentLoaded', () => { 
    ajustarSidebar();
    if (!isMaster) document.querySelectorAll('.filter-group-visible, .btn-save-blue').forEach(el => el.style.display = 'none');
    
    const inputAno = document.getElementById('mapa-ano');
    if(inputAno && inputAno.value === "") inputAno.value = new Date().getFullYear();
    
    document.getElementById('mapa-mes').addEventListener('change', gerarMapa);
    inputAno.addEventListener('change', gerarMapa);
    
    // ADICIONADO: ESCUTAR MUDANÇAS NO FILTRO DE SETOR
    document.querySelectorAll('.filtro-emp, .filtro-set, .filtro-per').forEach(el => el.addEventListener('change', gerarMapa));
    
    gerarMapa(); 
});