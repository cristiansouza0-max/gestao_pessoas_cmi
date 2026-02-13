if (!sessionStorage.getItem('usuarioAtivo')) window.location.href = 'login.html';
const usuarioLogado = JSON.parse(sessionStorage.getItem('usuarioAtivo'));
const isMaster = usuarioLogado.perfilMaster === true;

const SEQ_TARDE_AVUL = ["Lucas P.", "Roberto", "Valter", "Angelo", "Renato"];
// --- SEQUÊNCIA MANHÃ (VIGENTE A PARTIR DE MARÇO/2026) ---
const SEQ_MANHA_BASE = ["Geovana", "Maria Ap.", "Emerson", "Valeria", "Milena"];

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
    const tiposBusca = Array.isArray(tipo) ? tipo : [tipo];
    lista.filter(a => a.funcionario === apelido && tiposBusca.includes(a.tipo)).forEach(reg => {
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
    return ausencias.some(a => a.funcionario === apelido && a.tipo === "Folga" && (a.observacao === "Pedida" || a.observacao === "Marcada" || a.observacao === "Programada") && processarDatas(a).some(dt => dt.getTime() === dtRef));
}

function estaAusenteGlobal(apelido, dia, m, y, ausencias) {
    const dtRef = new Date(y, m - 1, dia).getTime();
    return ausencias.some(a => a.funcionario === apelido && a.tipo !== "Folga" && processarDatas(a).some(dt => dt.getTime() === dtRef));
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
    const dataNovaRegraMarço = new Date(2026, 2, 1); 
    
    // Inicia o ponteiro considerando Valeria como a última de fevereiro
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

        // --- MANHÃ AVUL (MOTOR) ---
        if (dSim < dataNovaRegraMarço) {
            // JANEIRO E FEVEREIRO: REGRAS ANTIGAS
            if (sem === 6) {
                const equipeBase = ["Geovana", "Maria Ap.", "Emerson", "Valeria"];
                const dRefSab = dSim;
                const idxFDS = Math.floor((dRefSab.getTime() - dataMarcoZeroFDSManha.getTime()) / (1000 * 60 * 60 * 24 * 7));
                
                let manual = equipeBase.find(n => fPediuManualGlobal(n, d, m, y, ausencias)) || (fPediuManualGlobal("Milena", d, m, y, ausencias) ? "Milena" : null);
                
                if (manual) {
                    mManhaAvul[`${chave}-${manual}`] = true;
                    quemFolgouSabadoManha = manual;
                } else if (dSim >= dataMarcoZeroFDSManha) {
                    let escala = (idxFDS % 2 !== 0) ? "Milena" : equipeBase[pManhaRodizio % equipeBase.length];
                    mManhaAvul[`${chave}-${escala}`] = true;
                    quemFolgouSabadoManha = escala;
                    if (idxFDS % 2 === 0) pManhaRodizio++;
                }
            } else if (sem === 0) {
                const equipeEspelho = ["Geovana", "Maria Ap.", "Emerson", "Valeria", "Milena"];
                equipeEspelho.forEach(n => { if(n !== quemFolgouSabadoManha) mManhaAvul[`${chave}-${n}`] = true; });
                mManhaAvul[`${chave}-Eloah`] = true;
            }
        } else {
            // A PARTIR DE MARÇO: NOVA REGRA SEQUENCIAL
            const equipeNova = [...SEQ_MANHA_BASE];
            if (regrasAtivas.equipeManha) equipeNova.push("Eloah");

            if (sem === 6) {
                quemFolgouSabadoManha = null;
                // 1. Prioridade: Se alguém pediu folga manual
                let manual = equipeNova.find(n => fPediuManualGlobal(n, d, m, y, ausencias));
                
                if (manual) {
                    mManhaAvul[`${chave}-${manual}`] = true;
                    quemFolgouSabadoManha = manual;
                } else {
                    // 2. Escala: Busca o próximo disponível (pula férias/licenças)
                    let limiteLoop = 0;
                    while (limiteLoop < equipeNova.length) {
                        let titular = equipeNova[pManhaRodizio % equipeNova.length];
                        if (!precisaSubstituicao(titular, dSim)) {
                            mManhaAvul[`${chave}-${titular}`] = true;
                            quemFolgouSabadoManha = titular;
                            pManhaRodizio++;
                            break;
                        }
                        pManhaRodizio++; limiteLoop++;
                    }
                }
            } else if (sem === 0) {
                // DOMINGO: Quem trabalhou sábado, folga hoje (Inversão total da equipe)
                equipeNova.forEach(nome => {
                    if (nome !== quemFolgouSabadoManha) {
                        mManhaAvul[`${chave}-${nome}`] = true;
                    }
                });
                if (!regrasAtivas.equipeManha) mManhaAvul[`${chave}-Eloah`] = true;
            }
        }

        // --- DEMAIS LÓGICAS ---
        if (sem === 6) {
            const dDom = new Date(dSim); dDom.setDate(dDom.getDate() + 1);
            const ultD = obterUltimoDomingo(y, m);
            if (d !== ultD - 1) {
                if (idxFDSGeral % 2 === 0) { mNoite[chave + "-AVUL"] = true; mNoite[`${dDom.getDate()}-${dDom.getMonth()+1}-${dDom.getFullYear()}-VCCL`] = true; }
                else { mNoite[chave + "-VCCL"] = true; mNoite[`${dDom.getDate()}-${dDom.getMonth()+1}-${dDom.getFullYear()}-AVUL`] = true; }
            }
        }
        if (regrasAtivas.equipeTarde && sem === 6) {
            if (!precisaSubstituicao("Márcia", dSim) && d !== (obterUltimoDomingo(y,m)-1)) mTardeAvul[`${chave}-Márcia`] = true;
            else {
                let t = 0; while (t < 5) {
                    let cand = SEQ_TARDE_AVUL[pTardeAvul % 5];
                    if (!precisaSubstituicao(cand, dSim)) { mTardeAvul[`${chave}-${cand}`] = true; pTardeAvul++; break; }
                    pTardeAvul++; t++;
                }
            }
        } else if (regrasAtivas.equipeTarde && sem === 0) {
            const chaveSab = `${new Date(dSim.getTime() - 86400000).getDate()}-${m}-${y}`;
            if (!mTardeAvul[`${chaveSab}-Márcia`]) mTardeAvul[`${chave}-Márcia`] = true;
            SEQ_TARDE_AVUL.forEach(nome => { if (!mTardeAvul[`${chaveSab}-${nome}`]) mTardeAvul[`${chave}-${nome}`] = true; });
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
                if (fPediuManualGlobal((darF === tA ? tB : tA), d, m, y, ausencias)) darF = null;
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
    let empSel = isMaster ? Array.from(document.querySelectorAll('.filtro-emp:checked')).map(cb => cb.value) : ["AVUL", "VCCL", "VSBL"];
    let setSel = isMaster ? Array.from(document.querySelectorAll('.filtro-set:checked')).map(cb => cb.value) : ["Tráfego", "Monitoramento"];
    const perSel = isMaster ? Array.from(document.querySelectorAll('.filtro-per:checked')).map(cb => cb.value) : ["Manhã", "Intermediário", "Tarde", "Noite", "Integral"];
    const container = document.getElementById('mapa-container');
    container.innerHTML = "Sincronizando...";

    try {
        const [snapFunc, snapAus, docRegras] = await Promise.all([
            db.collection("funcionarios").get(), 
            db.collection("ausencias").get(), 
            db.collection("parametros_regras").doc("especiais").get()
        ]);
        const regrasAtivas = docRegras.exists ? docRegras.data() : {};
        let ausencias = snapAus.docs.map(d => d.data());
        const dataInicioMes = new Date(ano, mes - 1, 1);
        const dataFimMes = new Date(ano, mes, 0);

        let funcionarios = snapFunc.docs.map(d => {
            const data = d.data();
            return { ...data, setor: data.setor || "Tráfego" }; 
        }).filter(f => {
            if (f.funcao === "Aprendiz") return false;
            if (!empSel.includes(f.empresa)) return false;
            if (!setSel.includes(f.setor)) return false;
            if (!perSel.includes(f.periodo)) return false;
            const dtAdm = new Date(f.admissao + "T00:00:00");
            const dtDem = f.demissao ? new Date(f.demissao + "T00:00:00") : null;
            return (dtAdm <= dataFimMes) && (f.status === "Ativo" || (dtDem && dtDem >= dataInicioMes));
        });
        
        if (!isMaster) {
            const meuFunc = funcionarios.find(f => f.nome.trim().toLowerCase() === usuarioLogado.nomeCompleto.trim().toLowerCase());
            if (meuFunc) { empSel = [meuFunc.empresa]; setSel = [meuFunc.setor || "Tráfego"]; funcionarios = funcionarios.filter(f => f.nome.trim().toLowerCase() === usuarioLogado.nomeCompleto.trim().toLowerCase()); }
        }

        const sim = simularEscalasAnoTodo(ausencias, funcionarios, ano, regrasAtivas);
        const diasNoMes = new Date(ano, mes, 0).getDate();
        container.innerHTML = "";

        ["AVUL", "VCCL", "VSBL"].forEach(empresa => {
            if (!empSel.includes(empresa)) return;
            const funcsEmpresa = funcionarios.filter(f => f.empresa === empresa);
            if (funcsEmpresa.length === 0) return;
            const section = document.createElement('div'); section.className = "empresa-section";
            section.innerHTML = `<div class="empresa-title">EMPRESA ${empresa}</div>`;
            let temTabela = false;
            perSel.forEach(per => {
                const funcsPeriodo = funcsEmpresa.filter(f => f.periodo === per);
                if (funcsPeriodo.length === 0) return;
                temTabela = true;
                const sub = document.createElement('div'); sub.className = "periodo-subtitle"; sub.innerText = `PERÍODO: ${per}`;
                section.appendChild(sub); funcsPeriodo.sort((a, b) => a.nome.localeCompare(b.nome));
                const wrapper = document.createElement('div'); wrapper.className = "table-wrapper";
                let tableHtml = `<table><thead><tr><th class="col-func">FUNCIONÁRIO</th>`;
                for (let d = 1; d <= diasNoMes; d++) {
                    const dObj = new Date(ano, mes-1, d);
                    let diaSem = dObj.toLocaleDateString('pt-BR', {weekday:'short'}).replace('.','');
                    diaSem = diaSem.charAt(0).toUpperCase() + diaSem.slice(1);
                    tableHtml += `<th>${String(d).padStart(2,'0')}/${String(mes).padStart(2,'0')}<br>${diaSem}</th>`;
                }
                tableHtml += `</tr></thead><tbody>`;
                funcsPeriodo.forEach(f => {
                    tableHtml += `<tr><td class="col-func">${f.apelido} - ${f.registro}</td>`;
                    const dtAdm = new Date(f.admissao + "T00:00:00");
                    const dtDem = (f.status === "Inativo" && f.demissao) ? new Date(f.demissao + "T00:00:00") : null;
                    let ferias = getDiasAusencia(f.apelido, ausencias, "Férias", mes, ano);
                    let outrosAfast = getDiasAusencia(f.apelido, ausencias, ["Afastamento", "Licença"], mes, ano);
                    let folgasInfo = getDetalhesFolgas(f.apelido, ausencias, mes, ano);
                    for (let d = 1; d <= diasNoMes; d++) {
                        const dObj = new Date(ano, mes-1, d), sem = dObj.getDay(), chave = `${d}-${mes}-${ano}`;
                        const eFer = feriadosBase.some(fer => fer.dia === d && fer.mes === mes && (fer.tipo !== "municipal" || fer.empresa === empresa));
                        if (dObj < dtAdm) { tableHtml += `<td style="background:#eee"></td>`; continue; }
                        if (dtDem && dObj >= dtDem) { tableHtml += `<td colspan="${diasNoMes - d + 1}" class="dia-demitido">Demitido</td>`; d = diasNoMes; continue; }
                        let simboloA = ""; if (f.nascimento) { const [yN, mN, dN] = f.nascimento.split('-').map(Number); if (dN === d && mN === mes) simboloA = `<span class="symbol-a">A</span>`; }
                        if (ferias.includes(d)) { let count = 1; while(ferias.includes(d+count)) count++; tableHtml += `<td colspan="${count}" class="dia-ferias">${simboloA}Férias</td>`; d += (count-1); continue; }
                        if (outrosAfast.includes(d)) { let count = 1; while(outrosAfast.includes(d+count)) count++; tableHtml += `<td colspan="${count}" class="dia-afastamento">${simboloA}AF</td>`; d += (count-1); continue; }
                        let conteudo = "", decidido = false;
                        if (folgasInfo[d]) { conteudo = `<span class="${folgasInfo[d]==='Pedida'?'folga-pedida':(folgasInfo[d]==='Marcada'?'folga-marcada':'folga-programada')}">${folgasInfo[d]==='Programada'?'F':'X'}</span>`; decidido = true; }
                        if (!decidido && empresa === "VCCL" && sim.vccl[`${chave}-${f.apelido}`]) { conteudo = '<b>X</b>'; decidido = true; }
                        if (!decidido && empresa === "AVUL" && per === "Manhã" && sim.manhaAvul[`${chave}-${f.apelido}`]) { conteudo = '<b>X</b>'; decidido = true; }
                        if (!decidido && empresa === "AVUL" && per === "Tarde" && sim.tardeAvul[`${chave}-${f.apelido}`]) { conteudo = '<b>X</b>'; decidido = true; }
                        if (!decidido && f.periodo === "Noite") { 
                            if (sem === 6) { if (f.apelido === "Fábio" && d === (obterUltimoDomingo(ano,mes)-1)) { conteudo = '<b>X</b>'; decidido = true; } else if ((sim.noite[chave+"-VCCL"] && f.empresa === "VCCL") || (sim.noite[chave+"-AVUL"] && f.empresa === "AVUL")) { conteudo = '<b>X</b>'; decidido = true; } }
                            else if (sem === 0) { if (f.apelido === "Osmair" && d === obterUltimoDomingo(ano,mes)) { conteudo = '<b>X</b>'; decidido = true; } else if ((sim.noite[chave+"-VCCL"] && f.empresa === "VCCL") || (sim.noite[chave+"-AVUL"] && f.empresa === "AVUL")) { conteudo = '<b>X</b>'; decidido = true; } }
                        }
                        if (!decidido) { if (f.funcao === "Líder" && (sem === 0 || sem === 6 || eFer)) conteudo = '<b>X</b>'; else if (sem === 0 && d < diasNoMes && new Date(ano,mes-1,d+1).getDay() === 1 && emFeriasGlobal(f.apelido, d+1, mes, ano, ausencias)) conteudo = '<b>X</b>'; }
                        tableHtml += `<td class="${eFer?'dia-feriado':(sem===0?'dia-domingo':(sem===6?'dia-sabado':''))}">${simboloA}${conteudo}</td>`;
                    }
                    tableHtml += `</tr>`;
                });
                wrapper.innerHTML = tableHtml + `</tbody></table>`; section.appendChild(wrapper);
            });
            if (temTabela) container.appendChild(section);
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
    const usuarioLogado = JSON.parse(sessionStorage.getItem('usuarioAtivo')); if (!usuarioLogado) { window.location.href = 'login.html'; return; }
    const isMaster = usuarioLogado.perfilMaster === true, permissoes = usuarioLogado.permissoes || [], paginaAtual = window.location.pathname.split("/").pop().replace(".html", "");
    document.querySelectorAll('.sidebar ul li a').forEach(link => {
        const href = link.getAttribute('href').replace('.html', ''); if (link.getAttribute('href') === "#" || href === "index") { link.parentElement.style.display = 'block'; return; }
        if (!isMaster && !permissoes.includes(href)) link.parentElement.style.display = 'none'; else link.parentElement.style.display = 'block';
    });
    if (!isMaster && paginaAtual !== "index" && paginaAtual !== "" && !permissoes.includes(paginaAtual)) window.location.href = "index.html";
}

function logout() { sessionStorage.removeItem('usuarioAtivo'); window.location.href = 'login.html'; }

document.addEventListener('DOMContentLoaded', () => { 
    ajustarSidebar();
    if (!isMaster) { document.querySelectorAll('.filter-group-visible, .btn-save-blue').forEach(el => el.style.display = 'none'); }
    const inputAno = document.getElementById('mapa-ano'), selectMes = document.getElementById('mapa-mes');
    if(inputAno && (inputAno.value === "" || inputAno.value === "2026")) inputAno.value = new Date().getFullYear();
    inputAno.addEventListener('change', gerarMapa); selectMes.addEventListener('change', gerarMapa);
    document.querySelectorAll('.filtro-emp, .filtro-set, .filtro-per').forEach(el => el.addEventListener('change', gerarMapa));
    gerarMapa(); 
});