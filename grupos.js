if (!sessionStorage.getItem('usuarioAtivo')) window.location.href = 'login.html';

const usuarioLogado = JSON.parse(sessionStorage.getItem('usuarioAtivo'));
const isMaster = usuarioLogado.perfilMaster === true;

document.addEventListener('DOMContentLoaded', () => {
    ajustarSidebar();
    carregarGruposExistentes();
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

const CORES_SEGMENTO = {
    "Urubupungá": "seg-dark-blue",
    "Viação Cidade Caieiras": "seg-dark-blue",
    "Cidade de Caieiras - Municipal Caieiras": "seg-light-yellow",
    "Cidade de Caieiras - Municipal Franco da Rocha": "seg-light-blue",
    "Urubupungá Municipal Cajamar": "seg-dark-red",
    "Urubupungá Municipal Santana": "seg-light-red",
    "Urubupungá Municipal Osasco": "seg-light-green"
};

function obterPrefixo(nomeLinha) {
    if (!nomeLinha) return "";
    return nomeLinha.split(' - ')[0].trim();
}

function alternarModoFiltro() {
    const isFiltroAtivo = document.getElementById('flag-filtro').checked;
    const btnGerar = document.getElementById('btn-gerar');
    btnGerar.disabled = isFiltroAtivo;
    btnGerar.style.opacity = isFiltroAtivo ? "0.4" : "1";
    carregarGruposExistentes();
}

function reagirAosFiltros() {
    if (document.getElementById('flag-filtro').checked) {
        carregarGruposExistentes();
    }
}

// GERAÇÃO DE GRUPOS
async function distribuirLinhasParaGrupos() {
    const empresa = document.getElementById('filt-empresa').value;
    const periodo = document.getElementById('filt-periodo').value;
    const diaCampo = document.getElementById('filt-dia').value;
    const qtdFunc = parseInt(document.getElementById('filt-qtd').value);

    try {
        const snap = await db.collection("monitoramento_viagens")
            .where("empresa", "==", empresa)
            .where("periodo", "==", periodo)
            .get();

        let linhasAlvo = [];
        snap.forEach(doc => {
            const data = doc.data();
            if (data[diaCampo] && parseInt(data[diaCampo]) > 0) {
                linhasAlvo.push(data);
            }
        });

        if (linhasAlvo.length === 0) { alert("Nenhum dado encontrado."); return; }
        linhasAlvo.sort((a, b) => (parseInt(b[diaCampo]) || 0) - (parseInt(a[diaCampo]) || 0));

        let grupos = Array.from({ length: qtdFunc }, (_, i) => ({
            num: String(i + 1).padStart(2, '0'),
            totalViagens: 0,
            linhas: []
        }));

        linhasAlvo.forEach(linha => {
            grupos.sort((a, b) => a.totalViagens - b.totalViagens);
            const qtd = parseInt(linha[diaCampo]) || 0;
            grupos[0].linhas.push({ prefixo: obterPrefixo(linha.linha), qtd: qtd, segmento: linha.segmento });
            grupos[0].totalViagens += qtd;
        });

        const batch = db.batch();
        const batchId = Date.now().toString();
        const diaTexto = document.querySelector(`#filt-dia option[value="${diaCampo}"]`).text;
        const perTexto = (periodo === 'manha' ? 'Manhã' : 'Tarde');

        for (const g of grupos) {
            g.linhas.sort((a, b) => a.segmento.localeCompare(b.segmento));
            const gFinal = {
                batchId: batchId,
                tituloCard: `Monitoramento ${g.num} - Total de Viagens: ${g.totalViagens}`,
                tituloBloco: `Grupo de Monitoramento ${empresa} ${perTexto} - ${diaTexto} para ${qtdFunc} funcionários`,
                total: g.totalViagens,
                linhas: g.linhas,
                empresa: empresa, 
                periodo: periodo, 
                diaCampo: diaCampo,
                qtdFunc: qtdFunc,
                criadoEm: Date.now()
            };
            batch.set(db.collection("monitoramento_grupos").doc(), gFinal);
        }

        await batch.commit();
        carregarGruposExistentes();
    } catch (e) { console.error(e); }
}

// CARREGAMENTO DOS BLOCOS
async function carregarGruposExistentes() {
    const container = document.getElementById('container-blocos-grupos');
    const isFiltroAtivo = document.getElementById('flag-filtro').checked;
    
    let query = db.collection("monitoramento_grupos");
    if (isFiltroAtivo) {
        const emp = document.getElementById('filt-empresa').value;
        const per = document.getElementById('filt-periodo').value;
        const dia = document.getElementById('filt-dia').value;
        const qtd = parseInt(document.getElementById('filt-qtd').value);
        query = query.where("empresa", "==", emp).where("periodo", "==", per).where("diaCampo", "==", dia).where("qtdFunc", "==", qtd);
    }

    try {
        const snap = await query.get();
        container.innerHTML = "";

        if (snap.empty) {
            container.innerHTML = "<p style='text-align: center; color: #999; padding: 40px;'>Nenhum histórico encontrado.</p>";
            return;
        }

        let sessoes = {};
        snap.forEach(doc => {
            const data = doc.data();
            const bId = data.batchId || "antigo";
            if (!sessoes[bId]) sessoes[bId] = [];
            sessoes[bId].push({ id: doc.id, ...data });
        });

        const chavesOrdenadas = Object.keys(sessoes).sort((a, b) => b - a);

        chavesOrdenadas.forEach(bId => {
            const gruposSessao = sessoes[bId];
            gruposSessao.sort((a, b) => a.tituloCard.localeCompare(b.tituloCard));

            const sessaoDiv = document.createElement('div');
            sessaoDiv.className = "secao-bloco-monitoramento";
            sessaoDiv.id = `bloco-${bId}`;
            
            sessaoDiv.innerHTML = `
                <div class="titulo-sessao-bloco">
                    <span>${gruposSessao[0].tituloBloco}</span>
                    <div class="box-selecao-bloco no-print">
                        <input type="checkbox" class="check-bloco" value="${bId}">
                    </div>
                </div>
                <div class="grid-cards-lado-a-lado" id="grid-${bId}"></div>
            `;
            container.appendChild(sessaoDiv);

            const grid = document.getElementById(`grid-${bId}`);
            gruposSessao.forEach(g => {
                const card = document.createElement('div');
                card.className = "card-grupo-monitor";
                const headerClass = (g.empresa === "AVUL") ? "item-avul" : "item-vccl";
                
                let listaItens = g.linhas.map(l => {
                    const corClass = CORES_SEGMENTO[l.segmento] || "";
                    return `<li class="${corClass}"><span>${l.prefixo}</span> <span>${l.qtd}</span></li>`;
                }).join('');

                card.innerHTML = `
                    <div class="header-card-grupo ${headerClass}">
                        <h3>${g.tituloCard}</h3>
                    </div>
                    <div class="sub-header-card">
                        <span>Linha</span>
                        <span>Viagens</span>
                    </div>
                    <ul class="lista-linhas-grupo">${listaItens}</ul>
                `;
                grid.appendChild(card);
            });
        });
    } catch (error) { console.error(error); }
}

function imprimirSelecionados() {
    const selecionados = Array.from(document.querySelectorAll('.check-bloco:checked')).map(cb => cb.value);
    if (selecionados.length === 0) { alert("Selecione ao menos um bloco para imprimir."); return; }

    document.querySelectorAll('.secao-bloco-monitoramento').forEach(bloco => {
        const id = bloco.id.replace('bloco-', '');
        if (!selecionados.includes(id)) {
            bloco.style.display = "none";
        }
    });

    window.print();
    carregarGruposExistentes();
}

async function limparGruposFiltrados() {
    const selecionados = Array.from(document.querySelectorAll('.check-bloco:checked')).map(cb => cb.value);
    
    if (selecionados.length === 0) {
        alert("Selecione ao menos um bloco para apagar.");
        return;
    }

    if (!confirm("Deseja apagar permanentemente os blocos selecionados?")) return;

    try {
        const batch = db.batch();
        const snap = await db.collection("monitoramento_grupos").get();
        
        snap.forEach(doc => {
            if (selecionados.includes(doc.data().batchId)) {
                batch.delete(doc.ref);
            }
        });

        await batch.commit();
        carregarGruposExistentes();
    } catch (e) { console.error(e); }
}