if (!sessionStorage.getItem('usuarioAtivo')) window.location.href = 'login.html';

const usuarioLogado = JSON.parse(sessionStorage.getItem('usuarioAtivo'));
const isMaster = usuarioLogado.perfilMaster === true;

const mesesNomesLongos = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
const SEQ_MANHA_BASE = ["Geovana Fanyne", "Maria Aparecida", "Emerson Silva", "Valeria Ribeiro", "Milena Benites"];

document.addEventListener('DOMContentLoaded', () => {
    ajustarSidebar();
    
    const inputAno = document.getElementById('ano-jornada');
    if(inputAno) inputAno.value = new Date().getFullYear();

    if (!isMaster) {
        document.querySelectorAll('.filter-group-visible, .btn-save-blue').forEach(el => el.style.display = 'none');
    }
    
    gerarEscalaEquipe();
});

async function gerarEscalaEquipe() {
    const mes = parseInt(document.getElementById('mes-jornada').value);
    const ano = parseInt(document.getElementById('ano-jornada').value);
    
    // Captura filtros de múltiplos valores (igual ao Mapa)
    const empSel = isMaster ? Array.from(document.querySelectorAll('.filtro-emp-jor:checked')).map(cb => cb.value) : [];
    const setSel = isMaster ? Array.from(document.querySelectorAll('.filtro-set-jor:checked')).map(cb => cb.value) : [];
    const perSel = isMaster ? Array.from(document.querySelectorAll('.filtro-per-jor:checked')).map(cb => cb.value) : [];

    const container = document.getElementById('equipe-jornada-container');
    const cabecalhoMaster = document.getElementById('cabecalho-impressao');

    container.innerHTML = "<p>Sincronizando dados...</p>";
    
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
        const regrasAtivas = docRegras.exists ? docRegras.data() : {};

        const dataInicioMes = new Date(ano, mes, 1);
        const dataFimMes = new Date(ano, mes + 1, 0);

        // Filtragem de funcionários baseada nos filtros de topo
        let listaFuncs = snapFunc.docs.map(doc => ({id: doc.id, ...doc.data()})).filter(f => {
            if (f.funcao === "Aprendiz") return false;
            
            if (!isMaster) {
                return f.nome === usuarioLogado.nomeCompleto;
            } else {
                if (!empSel.includes(f.empresa)) return false;
                if (!setSel.includes(f.setor || "Tráfego")) return false;
                if (!perSel.includes(f.periodo)) return false;
            }

            const dtAdm = new Date(f.admissao + "T00:00:00");
            const dtDem = f.demissao ? new Date(f.demissao + "T00:00:00") : null;
            return (dtAdm <= dataFimMes) && (f.status === "Ativo" || (dtDem && dtDem >= dataInicioMes));
        });

        if (cabecalhoMaster) {
            cabecalhoMaster.innerText = isMaster ? `ESCALA DE TRABALHO - EQUIPE - ${mesesNomesLongos[mes]} ${ano}` : `ESCALA DE TRABALHO - ${usuarioLogado.nomeCompleto} - ${mesesNomesLongos[mes]} ${ano}`;
        }

        const sim = simularEscalasSincronizadas(todasAusencias, listaFuncs, ano, regrasAtivas, feriadosParam);

        container.innerHTML = "";
        const diasNoMes = dataFimMes.getDate();

        listaFuncs.sort((a, b) => a.nome.localeCompare(b.nome)).forEach(f => {
            const wrapper = document.createElement('div');
            wrapper.className = "tabela-individual-wrapper";
            
            const jors = jornadas.filter(j => f.jornadasIds && f.jornadasIds.includes(j.id));
            const jPrincipal = jors.find(j => j.ordem === 1) || jors[0];

            let totalMinutos = 0, rowsHtml = "", jaProcessada = new Set();

            for (let d = 1; d <= diasNoMes; d++) {
                const dataAtu = new Date(ano, mes, d), sem = dataAtu.getDay(), chave = `${d}-${mes+1}-${ano}`;
                const dataFmt = `${String(d).padStart(2,'0')}/${String(mes+1).padStart(2,'0')}`;
                const diaSemFmt = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"][sem];
                const eFeriado = feriadosParam[`${f.empresa}-${d}-${f.periodo}`] > 0;
                let classeRow = eFeriado ? "row-feriado" : (sem === 6 ? "row-sabado" : (sem === 0 ? "row-domingo" : ""));

                // Lógica de Ausências/Demitido similar ao Mapa
                const dtAdm = new Date(f.admissao + "T00:00:00");
                const dtDem = (f.status === "Inativo" && f.demissao) ? new Date(f.demissao + "T00:00:00") : null;

                if (dataAtu < dtAdm) {
                    rowsHtml += `<tr class="${classeRow}"><td>${dataFmt}</td><td>${diaSemFmt}</td><td colspan="3" style="background:#eee"></td></tr>`;
                    continue;
                }
                if (dtDem && dataAtu >= dtDem) {
                    rowsHtml += `<tr class="${classeRow}"><td>${dataFmt}</td><td>${diaSemFmt}</td><td colspan="3" class="celula-demitido-mesclada">DEMITIDO</td></tr>`;
                    continue;
                }

                const ausBloco = todasAusencias.find(a => a.funcionario === f.apelido && ["Férias", "Licença", "Afastamento", "Falta"].includes(a.tipo) && isDataNoRange(dataAtu, a));

                if (ausBloco) {
                    let classeCor = (ausBloco.tipo === 'Férias') ? 'ferias' : (ausBloco.tipo === 'Falta' ? 'falta' : 'outros');
                    rowsHtml += `<tr class="${classeRow}"><td>${dataFmt}</td><td>${diaSemFmt}</td><td colspan="3" class="celula-${classeCor}-mesclada">${ausBloco.tipo}</td></tr>`;
                } else {
                    const ausFolga = todasAusencias.find(a => a.funcionario === f.apelido && a.tipo === "Folga" && isDataNoRange(dataAtu, a));
                    const folgaEscala = sim[`${chave}-${f.apelido}`];

                    if (ausFolga || folgaEscala) {
                        let txt = folgaEscala ? "Folga" : `Folga ${ausFolga.observacao}`;
                        rowsHtml += `<tr class="${classeRow}"><td>${dataFmt}</td><td>${diaSemFmt}</td><td colspan="3">${txt}</td></tr>`;
                    } else {
                        let idsEscala = jPrincipal ? (eFeriado ? jPrincipal.escalas.feriado : (sem === 0 ? jPrincipal.escalas.domingo : (sem === 6 ? jPrincipal.escalas.sabado : jPrincipal.escalas.uteis))) : [];
                        const arrayIds = Array.isArray(idsEscala) ? idsEscala : (idsEscala ? [idsEscala] : []);

                        if (arrayIds.length > 0) {
                            let minDia = 0, txtEsc = "";
                            arrayIds.forEach(id => {
                                const esc = escalas[id];
                                if (esc) {
                                    const t = calcularHoras(esc); minDia += t.minutos;
                                    txtEsc += (txtEsc ? "<br>" : "") + `${esc.inicioJornada}-${esc.fimJornada}`;
                                }
                            });
                            totalMinutos += minDia;
                            const hD = Math.floor(minDia/60), mD = minDia%60;
                            rowsHtml += `<tr class="${classeRow}"><td>${dataFmt}</td><td>${diaSemFmt}</td><td colspan="2">${txtEsc}</td><td>${String(hD).padStart(2,'0')}:${String(mD).padStart(2,'0')}</td></tr>`;
                        } else {
                            rowsHtml += `<tr class="${classeRow}"><td>${dataFmt}</td><td>${diaSemFmt}</td><td colspan="3">-</td></tr>`;
                        }
                    }
                }
            }
            const hT = Math.floor(totalMinutos/60), mT = totalMinutos%60;
            wrapper.innerHTML = `<div class="box-nome-func">${f.apelido}</div><table class="tabela-jornada"><thead><tr><th>Data</th><th>Dia</th><th colspan="2">Horários</th><th>Tot.</th></tr></thead><tbody>${rowsHtml}</tbody><tfoot><tr><td colspan="4" class="footer-total">TOTAL</td><td class="footer-total">${String(hT).padStart(2,'0')}:${String(mT).padStart(2,'0')}</td></tr></tfoot></table>`;
            container.appendChild(wrapper);
        });
    } catch (e) { console.error(e); }
}

// Funções auxiliares (Simulação igual ao Mapa para manter sincronia)
function simularEscalasSincronizadas(ausencias, funcionarios, anoAlvo, regrasAtivas, feriadosParam) {
    let dSim = new Date(anoAlvo, 0, 1), dFim = new Date(anoAlvo, 11, 31);
    const dataBaseRef = new Date(2026, 0, 3);
    const dataNovaRegraMarço = new Date(2026, 2, 1);
    let mFolgas = {}, pManhaRodizio = 2, quemFolgouSabadoManha = null;

    while (dSim <= dFim) {
        const d = dSim.getDate(), m = dSim.getMonth() + 1, y = dSim.getFullYear(), sem = dSim.getDay(), chave = `${d}-${m}-${y}`;
        
        // Lógica Simplificada para Rodízio Manhã AVUL (Exemplo)
        if (dSim >= dataNovaRegraMarço) {
            const equipe = [...SEQ_MANHA_BASE];
            if (regrasAtivas.equipeManha) equipe.push("Eloah Batista");

            if (sem === 6) {
                let manual = equipe.find(n => fPediuManualGlobal(n, d, m, y, ausencias));
                if (manual) { quemFolgouSabadoManha = manual; mFolgas[`${chave}-${manual}`] = true; }
                else {
                    let titular = equipe[pManhaRodizio % equipe.length];
                    mFolgas[`${chave}-${titular}`] = true; quemFolgouSabadoManha = titular; pManhaRodizio++;
                }
            } else if (sem === 0) {
                equipe.forEach(n => { if (n !== quemFolgouSabadoManha) mFolgas[`${chave}-${n}`] = true; });
            }
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

function fPediuManualGlobal(apelido, dia, m, y, ausencias) {
    const dtRef = new Date(y, m - 1, dia).getTime();
    return ausencias.some(a => a.funcionario === apelido && a.tipo === "Folga" && ["Pedida", "Marcada", "Programada"].includes(a.observacao) && isDataNoRange(new Date(y, m-1, dia), a));
}

function calcularHoras(esc) {
    const toM = (t) => { if(!t || t === '--:--') return 0; const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    let ent = toM(esc.inicioJornada), sai = toM(esc.fimJornada); if (sai < ent) sai += 1440;
    let liq = (sai - ent === 240) ? 240 : (sai - ent) - 60;
    return { minutos: liq > 0 ? liq : 0 };
}

function ajustarSidebar() {
    const p = usuarioLogado.permissoes || [];
    const pag = window.location.pathname.split("/").pop().replace(".html", "");
    document.querySelectorAll('.sidebar ul li a').forEach(link => {
        const h = link.getAttribute('href').replace('.html', '');
        if (link.getAttribute('href') === "#" || h === "index") { link.parentElement.style.display = 'block'; return; }
        if (!isMaster && !p.includes(h)) link.parentElement.style.display = 'none'; else link.parentElement.style.display = 'block';
    });
}
function logout() { sessionStorage.removeItem('usuarioAtivo'); window.location.href = 'login.html'; }