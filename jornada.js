// =============================================================================
// BLOCO 1: CONTROLE DE SESSÃO E CONSTANTES
// =============================================================================

if (!sessionStorage.getItem('usuarioAtivo')) window.location.href = 'login.html';

const usuarioLogado = JSON.parse(sessionStorage.getItem('usuarioAtivo'));
const isMaster = usuarioLogado.perfilMaster === true;

const mesesNomesLongos = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
const SEQ_MANHA_BASE = ["Geovana", "Maria Ap.", "Emerson", "Valeria"];

// =============================================================================
// BLOCO 2: INICIALIZAÇÃO E INTERFACE (UI)
// =============================================================================

document.addEventListener('DOMContentLoaded', () => {
    ajustarSidebar();
    
    if (!isMaster) {
        if (document.getElementById('container-filtro-empresa')) document.getElementById('container-filtro-empresa').style.display = 'none';
        if (document.getElementById('container-filtro-periodo')) document.getElementById('container-filtro-periodo').style.display = 'none';
        if (document.getElementById('btn-salvar-jornada')) document.getElementById('btn-salvar-jornada').style.display = 'none';
    }

    const inputAno = document.getElementById('ano-jornada');
    if(inputAno && (inputAno.value === "" || inputAno.value === "2026")) {
        inputAno.value = new Date().getFullYear();
    }
    
    gerarEscalaEquipe();
});

function ajustarSidebar() {
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

function logout() { 
    sessionStorage.removeItem('usuarioAtivo'); 
    window.location.href = 'login.html'; 
}

// =============================================================================
// BLOCO 3: MOTOR DE GERAÇÃO DA ESCALA (GERARESCALAEQUIPE)
// =============================================================================

async function gerarEscalaEquipe() {
    const empresa = document.getElementById('empresa-jornada').value;
    const periodosSelecionados = Array.from(document.querySelectorAll('.filtro-per-jor:checked')).map(cb => cb.value);
    const mes = parseInt(document.getElementById('mes-jornada').value);
    const ano = parseInt(document.getElementById('ano-jornada').value);
    const container = document.getElementById('equipe-jornada-container');
    const cabecalhoMaster = document.getElementById('cabecalho-impressao');

    container.innerHTML = "<p>Sincronizando dados operacionais...</p>";
    
    let tituloTopo = isMaster ? `${empresa}` : usuarioLogado.nomeCompleto;
    if (cabecalhoMaster) cabecalhoMaster.innerText = `ESCALA DE TRABALHO - ${tituloTopo} - ${mesesNomesLongos[mes]} ${ano}`;

    try {
        const [snapFunc, snapJor, snapEsc, snapAus, docRegras, snapFerParam] = await Promise.all([
            db.collection("funcionarios").get(),
            db.collection("jornadas").get(),
            db.collection("escalas").get(),
            db.collection("ausencias").get(),
            db.collection("parametros_regras").doc("especiais").get(),
            db.collection("parametros_feriados").doc(`${ano}-${mes + 1}`).get()
        ]);

        const jornadas = snapJor.docs.map(d => ({ id: d.id, ...d.data() }));
        const escalas = {}; snapEsc.forEach(d => { escalas[d.id] = d.data(); });
        const todasAusencias = snapAus.docs.map(d => d.data());
        const feriadosParam = snapFerParam.exists ? snapFerParam.data() : {};
        
        const dataInicioMes = new Date(ano, mes, 1);
        const dataFimMes = new Date(ano, mes + 1, 0);

        // --- QUADRO VCCL RELEVANTE PARA O MÊS ATUAL ---
        const quadroVCCLTotal = snapFunc.docs.map(d => d.data()).filter(f => {
            if (f.empresa !== "VCCL" || f.funcao === "Aprendiz") return false;
            const dtAdm = new Date(f.admissao + "T00:00:00");
            const dtDem = f.demissao ? new Date(f.demissao + "T00:00:00") : null;
            return (dtAdm <= dataFimMes) && (f.status === "Ativo" || (dtDem && dtDem >= dataInicioMes));
        });

        // LISTA DE FUNCIONÁRIOS QUE APARECEM NA TELA
        let listaFuncs = snapFunc.docs.map(doc => ({id: doc.id, ...doc.data()})).filter(f => {
            if (f.funcao === "Aprendiz") return false;
            if (!isMaster && f.nome !== usuarioLogado.nomeCompleto) return false;
            if (isMaster) {
                if (empresa !== "TODAS" && f.empresa !== empresa) return false;
                if (periodosSelecionados.length > 0 && !periodosSelecionados.includes(f.periodo)) return false;
            }
            const dtAdm = new Date(f.admissao + "T00:00:00");
            const dtDem = f.demissao ? new Date(f.demissao + "T00:00:00") : null;
            return (dtAdm <= dataFimMes) && (f.status === "Ativo" || (dtDem && dtDem >= dataInicioMes));
        });

        const sim = simularEscalasSincronizadas(todasAusencias, listaFuncs, ano, docRegras.data(), feriadosParam);

        listaFuncs.forEach(f => {
            const jors = jornadas.filter(j => f.jornadasIds && f.jornadasIds.includes(j.id));
            f.jornadaPrincipal = jors.find(j => j.ordem === 1) || jors[0];
            f.jornadaSexta = jors.find(j => j.ordem === 2) || f.jornadaPrincipal;
            f.sortKey = `${f.empresa}-${f.periodo}-${f.jornadaPrincipal ? String(f.jornadaPrincipal.ordem).padStart(3, '0') : '999'}-${f.nome}`;
        });
        listaFuncs.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

        container.innerHTML = "";
        const diasNoMes = dataFimMes.getDate();

        listaFuncs.forEach(f => {
            const wrapper = document.createElement('div');
            wrapper.className = "tabela-individual-wrapper";
            const dtAdm = new Date(f.admissao + "T00:00:00");
            const dtDem = (f.status === "Inativo" && f.demissao) ? new Date(f.demissao + "T00:00:00") : null;
            let totalMinutos = 0, rowsHtml = "", jaProcessada = new Set();

            for (let d = 1; d <= diasNoMes; d++) {
                const dataAtu = new Date(ano, mes, d), sem = dataAtu.getDay(), chave = `${d}-${mes+1}-${ano}`;
                const dataFmt = `${String(d).padStart(2,'0')}/${String(mes+1).padStart(2,'0')}/${String(ano).substring(2)}`;
                const diaSemFmt = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"][sem];
                const eFeriado = feriadosParam[`${f.empresa}-${d}-${f.periodo}`] > 0;
                let classeRow = eFeriado ? "row-feriado" : (sem === 6 ? "row-sabado" : (sem === 0 ? "row-domingo" : ""));

                if (dataAtu < dtAdm) {
                    rowsHtml += `<tr class="${classeRow}"><td>${dataFmt}</td><td>${diaSemFmt}</td><td colspan="3" style="background:#eee"></td></tr>`;
                    continue;
                }
                if (dtDem && dataAtu >= dtDem) {
                    const resto = diasNoMes - d + 1;
                    rowsHtml += `<tr class="${classeRow}"><td>${dataFmt}</td><td>${diaSemFmt}</td><td colspan="3" rowspan="${resto}" class="celula-demitido-mesclada">DEMITIDO</td></tr>`;
                    break; 
                }

                const ausBloco = todasAusencias.find(a => a.funcionario === f.apelido && ["Férias", "Licença", "Afastamento", "Falta"].includes(a.tipo) && isDataNoRange(dataAtu, a));

                if (ausBloco) {
                    rowsHtml += `<tr class="${classeRow}"><td>${dataFmt}</td><td>${diaSemFmt}</td>`;
                    if (!jaProcessada.has(ausBloco.datas + ausBloco.tipo)) {
                        const dts = processarDatasJornada(ausBloco);
                        const count = dts.filter(dt => dt.getMonth() === mes && dt.getDate() >= d).length;
                        let classeCor = (ausBloco.tipo === 'Férias') ? 'ferias' : (ausBloco.tipo === 'Falta' ? 'falta' : 'outros');
                        rowsHtml += `<td colspan="3" rowspan="${count}" class="celula-${classeCor}-mesclada">${ausBloco.tipo}</td>`;
                        jaProcessada.add(ausBloco.datas + ausBloco.tipo);
                    }
                    rowsHtml += `</tr>`;
                } else {
                    const ausFolga = todasAusencias.find(a => a.funcionario === f.apelido && a.tipo === "Folga" && isDataNoRange(dataAtu, a));
                    const folgaEscala = sim[`${chave}-${f.apelido}`];

                    if (ausFolga || folgaEscala) {
                        let txt = folgaEscala ? "Folga Escala" : `Folga ${ausFolga.observacao}`;
                        let cl = folgaEscala ? "folga-escala" : (ausFolga.observacao === "Pedida" ? "folga-pedida" : (ausFolga.observacao === "Marcada" ? "folga-marcada" : "folga-programada"));
                        rowsHtml += `<tr class="${classeRow}"><td>${dataFmt}</td><td>${diaSemFmt}</td><td colspan="3" class="${cl}">${txt}</td></tr>`;
                    } else {
                        // --- LÓGICA DE COBERTURA DINÂMICA VCCL ---
                        let jTrabalho = (sem === 5 && f.periodo === "Integral") ? f.jornadaSexta : f.jornadaPrincipal;

                        if (f.empresa === "VCCL" && f.periodo === "Intermediário") {
                            
                            // Função para verificar se existe um funcionário ATIVO E PRESENTE ocupando uma ordem específica de jornada
                            const verificarVagaOcupada = (periodo, ordem) => {
                                return quadroVCCLTotal.some(colega => {
                                    if (colega.periodo !== periodo) return false;
                                    
                                    // Verifica se este colega é o dono da Jornada 1 ou 2 desse período
                                    const jorsColega = jornadas.filter(jor => colega.jornadasIds && colega.jornadasIds.includes(jor.id));
                                    const possuiJornadaAlvo = jorsColega.some(j => j.ordem === ordem);
                                    if (!possuiJornadaAlvo) return false;

                                    // Se possui a jornada, verifica se ele está ausente ou demitido hoje
                                    const ausente = precisaSubstituicao(colega.apelido, dataAtu, quadroVCCLTotal, todasAusencias, mes, ano);
                                    return !ausente; // Se NÃO está ausente, a vaga está ocupada
                                });
                            };

                            let ordemDesejada = 1; // Padrão: Jornada 1 do Intermediário

                            if (!verificarVagaOcupada("Manhã", 1)) ordemDesejada = 2; // Vaga Manhã 1 aberta
                            else if (!verificarVagaOcupada("Manhã", 2)) ordemDesejada = 3; // Vaga Manhã 2 aberta
                            else if (!verificarVagaOcupada("Tarde", 1)) ordemDesejada = 4; // Vaga Tarde 1 aberta
                            else if (!verificarVagaOcupada("Tarde", 2)) ordemDesejada = 5; // Vaga Tarde 2 aberta

                            const jDetectada = jornadas.find(jor => f.jornadasIds && f.jornadasIds.includes(jor.id) && jor.ordem === ordemDesejada);
                            if (jDetectada) jTrabalho = jDetectada;
                        }

                        let idsEscala = jTrabalho ? (eFeriado ? jTrabalho.escalas.feriado : (sem === 0 ? jTrabalho.escalas.domingo : (sem === 6 ? jTrabalho.escalas.sabado : jTrabalho.escalas.uteis))) : [];
                        const arrayIds = Array.isArray(idsEscala) ? idsEscala : (idsEscala ? [idsEscala] : []);

                        if (arrayIds.length > 0) {
                            let minDia = 0;
                            let htmlEsc = arrayIds.map(id => {
                                const esc = escalas[id];
                                if (esc) {
                                    const t = calcularHoras(esc);
                                    minDia += t.minutos;
                                    return `${esc.inicioJornada}-${esc.fimJornada}`;
                                }
                                return "";
                            }).filter(t => t !== "").join('<br>');

                            totalMinutos += minDia;
                            const hD = Math.floor(minDia/60), mD = minDia%60;
                            rowsHtml += `<tr class="${classeRow}"><td>${dataFmt}</td><td>${diaSemFmt}</td><td colspan="2" style="font-size:0.55rem">${htmlEsc}</td><td>${String(hD).padStart(2,'0')}:${String(mD).padStart(2,'0')}</td></tr>`;
                        } else {
                            rowsHtml += `<tr class="${classeRow}"><td>${dataFmt}</td><td>${diaSemFmt}</td><td colspan="3">-</td></tr>`;
                        }
                    }
                }
            }
            const hT = Math.floor(totalMinutos/60), mT = totalMinutos%60;
            wrapper.innerHTML = `<div class="box-nome-func">${f.apelido} - ${f.registro}</div><table class="tabela-jornada"><thead><tr><th style="width:50px">Data</th><th style="width:30px"></th><th colspan="2">Horários</th><th style="width:45px">Tot.</th></tr></thead><tbody>${rowsHtml}</tbody><tfoot><tr><td colspan="4" class="footer-total">TOTAL</td><td class="footer-total">${String(hT).padStart(2,'0')}:${String(mT).padStart(2,'0')}</td></tr></tfoot></table>`;
            container.appendChild(wrapper);
        });
    } catch (e) { console.error(e); }
}

// =============================================================================
// BLOCO 4: SIMULAÇÃO DE REGRAS DE RODÍZIO (SINCRO MAPA.JS)
// =============================================================================

function simularEscalasSincronizadas(ausencias, funcionarios, anoAlvo, regrasAtivas, feriadosParam) {
    let dSim = new Date(anoAlvo, 0, 1), dFim = new Date(anoAlvo, 11, 31), dataZero = new Date(2026, 0, 31);
    const dataBaseRef = new Date(2026, 0, 3);
    let mFolgas = {}, pTardeAvul = 0, pManhaRodizio = 0;

    while (dSim <= dFim) {
        const d = dSim.getDate(), m = dSim.getMonth() + 1, y = dSim.getFullYear(), sem = dSim.getDay(), chave = `${d}-${m}-${y}`;
        const idxFDSGeral = Math.abs(Math.floor((dSim.getTime() - dataBaseRef.getTime()) / (1000 * 60 * 60 * 24 * 7)));

        const funcsAtivosNoDia = funcionarios.filter(f => {
            const dtA = new Date(f.admissao + "T00:00:00");
            const dtD = f.demissao ? new Date(f.demissao + "T00:00:00") : null;
            return dSim >= dtA && (!dtD || dSim < dtD);
        });

        funcionarios.forEach(f => {
            const eFer = feriadosParam[`${f.empresa}-${d}-${f.periodo}`] > 0;
            if (f.periodo === "Integral" && (sem === 6 || sem === 0 || eFer)) mFolgas[`${chave}-${f.apelido}`] = true;
        });

        if (sem === 6 || sem === 0) {
            const m_vccl = funcsAtivosNoDia.filter(x => x.empresa === "VCCL" && x.periodo === "Manhã");
            const t_vccl = funcsAtivosNoDia.filter(x => x.empresa === "VCCL" && x.periodo === "Tarde");
            const assistenteInterVCCL = funcionarios.find(x => x.empresa === "VCCL" && x.periodo === "Intermediário" && x.funcao === "Assistente");
            const interApelido = assistenteInterVCCL ? assistenteInterVCCL.apelido : null;

            let duplas = [], interOcupado = false;

            if (m_vccl.length === 2) duplas.push({p1: m_vccl[0].apelido, p2: m_vccl[1].apelido});
            else if (m_vccl.length === 1 && interApelido) { duplas.push({p1: m_vccl[0].apelido, p2: interApelido}); interOcupado = true; }

            if (t_vccl.length === 2) duplas.push({p1: t_vccl[0].apelido, p2: t_vccl[1].apelido});
            else if (t_vccl.length === 1 && interApelido) { duplas.push({p1: t_vccl[0].apelido, p2: interApelido}); interOcupado = true; }

            duplas.forEach(dupla => {
                let tA = dupla.p1, tB = dupla.p2;
                if (tA !== interApelido && precisaSubstituicao(tA, dSim, funcionarios, ausencias, dSim.getMonth(), dSim.getFullYear()) && interApelido && !interOcupado) { tA = interApelido; interOcupado = true; }
                else if (tB !== interApelido && precisaSubstituicao(tB, dSim, funcionarios, ausencias, dSim.getMonth(), dSim.getFullYear()) && interApelido && !interOcupado) { tB = interApelido; interOcupado = true; }

                let nOff = (sem === 6) ? (idxFDSGeral % 2 === 0 ? tA : tB) : (idxFDSGeral % 2 !== 0 ? tA : tB);
                let darF = nOff;

                if (sem === 6) {
                    if (fPediuManualGlobal(nOff, d+1, m, y, ausencias) || precisaSubstituicao(nOff, new Date(y, m-1, d+2), funcionarios, ausencias, dSim.getMonth(), dSim.getFullYear())) darF = (nOff === tA ? tB : tA);
                } else if (sem === 0) {
                    if (precisaSubstituicao((nOff === tA ? tB : tA), new Date(y, m-1, d+1), funcionarios, ausencias, dSim.getMonth(), dSim.getFullYear())) darF = null;
                }
                if (fPediuManualGlobal((darF === tA ? tB : tA), d, m, y, ausencias)) darF = null;
                if (darF) mFolgas[`${chave}-${darF}`] = true;
            });
            if (!interOcupado && sem === 0 && interApelido) mFolgas[`${chave}-${interApelido}`] = true;
        }

        if (dSim >= dataZero) {
            const equipe = [...SEQ_MANHA_BASE]; if (regrasAtivas && regrasAtivas.equipeManha) equipe.push("Eloah");
            const dRef = (sem === 6 ? dSim : new Date(dSim.getTime()-86400000));
            const idxM = Math.floor((dRef.getTime() - dataZero.getTime()) / (1000*60*60*24*7));
            if (sem === 6) {
                if (idxM % 2 !== 0) mFolgas[`${chave}-Milena`] = true;
                else {
                    let t = 0; while (t < equipe.length) {
                        let tit = equipe[pManhaRodizio % equipe.length];
                        if (!precisaSubstituicao(tit, dSim, funcionarios, ausencias, dSim.getMonth(), dSim.getFullYear())) { mFolgas[`${chave}-${tit}`] = true; pManhaRodizio++; break; }
                        pManhaRodizio++; t++;
                    }
                }
            } else if (sem === 0) {
                const cS = `${new Date(dSim.getTime()-86400000).getDate()}-${m}-${y}`;
                if (!mFolgas[`${cS}-Milena`]) mFolgas[`${chave}-Milena`] = true;
                equipe.forEach(n => { if(!mFolgas[`${cS}-${n}`]) mFolgas[`${chave}-${n}`] = true; });
            }
        }
        dSim.setDate(dSim.getDate() + 1);
    }
    return mFolgas;
}

// =============================================================================
// BLOCO 5: AUXILIARES
// =============================================================================

function precisaSubstituicao(apelido, diaSim, listaFuncs, listaAus, mesAlvo, anoAlvo) {
    const dtRef = new Date(diaSim.getFullYear(), diaSim.getMonth(), diaSim.getDate());
    const temAusencia = listaAus.some(a => a.funcionario === apelido && a.tipo !== "Folga" && isDataNoRange(dtRef, a));
    if (temAusencia) return true;
    
    const f = listaFuncs.find(x => x.apelido === apelido);
    if (f && f.status === "Inativo" && f.demissao) {
        const dtDem = new Date(f.demissao + "T00:00:00");
        if (dtDem <= dtRef) return true;
    }
    return false;
}

function fPediuManualGlobal(apelido, dia, m, y, ausencias) {
    const dt = new Date(y, m - 1, dia).toDateString();
    return ausencias.some(a => a.funcionario === apelido && a.tipo === "Folga" && (a.observacao === "Pedida" || a.observacao === "Marcada") && processarDatasJornada(a).some(d => d.toDateString() === dt));
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
    let bruta = (sai - ent); 
    let liq = (bruta === 240) ? bruta : bruta - 60;
    return { minutos: liq, formatado: `${String(Math.floor(liq/60)).padStart(2,'0')}:${String(liq%60).padStart(2,'0')}` };
}