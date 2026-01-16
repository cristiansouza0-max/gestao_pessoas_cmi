if (!sessionStorage.getItem('usuarioAtivo')) window.location.href = 'login.html';
let tripsCalculadasGlobal = [];

const SegmentoParaEmpresa = {
    "Cidade de Caieiras - Municipal Caieiras": "VCCL",
    "Cidade de Caieiras - Municipal Franco da Rocha": "VCCL",
    "Viação Cidade Caieiras": "VCCL"
};

document.addEventListener('DOMContentLoaded', () => {
    carregarTabelas();
});

function obterPrefixo(nomeLinha) {
    if (!nomeLinha) return "";
    return nomeLinha.split(' - ')[0].trim();
}

async function lerArquivos(input) {
    const files = input.files;
    if (files.length === 0) return;
    let mapaAcumulado = {};
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });
        const json = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
        json.forEach(row => {
            const segmento = row['Segmento'] || row['SEGMENTO'];
            const linha = row['Linha'] || row['LINHA'];
            const horaBruta = row['Prev. Início'] || row['PREV. INÍCIO'];
            if (segmento && linha && horaBruta !== undefined) {
                let horaNum = typeof horaBruta === 'number' ? Math.floor(horaBruta * 24) : parseInt(horaBruta.split(':')[0]);
                const periodo = (horaNum <= 13) ? "manha" : "tarde";
                const empresa = SegmentoParaEmpresa[segmento] || "AVUL";
                const chave = `${empresa}|${segmento}|${linha}|${periodo}`;
                mapaAcumulado[chave] = (mapaAcumulado[chave] || 0) + 1;
            }
        });
    }
    exibirPrevia(mapaAcumulado);
}

function exibirPrevia(mapa) {
    const areaPrevia = document.getElementById('area-previa');
    const resumoGrid = document.getElementById('resumo-previa');
    resumoGrid.innerHTML = "";
    tripsCalculadasGlobal = [];
    for (let chave in mapa) {
        const [empresa, segmento, linha, periodo] = chave.split('|');
        tripsCalculadasGlobal.push({ empresa, segmento, linha, periodo, qtd: mapa[chave] });
        const card = document.createElement('div');
        card.className = "card-previa";
        card.innerHTML = `<b>${obterPrefixo(linha)}</b> (${empresa})<br>${periodo.toUpperCase()}: ${mapa[chave]} viagens`;
        resumoGrid.appendChild(card);
    }
    areaPrevia.style.display = (tripsCalculadasGlobal.length > 0) ? 'block' : 'none';
}

async function confirmarImportacao() {
    const tipoDia = document.getElementById('tipo-dia-importacao').value;
    const batch = db.batch();
    for (const item of tripsCalculadasGlobal) {
        const linhaID = item.linha.toString().replace(/[\/\\.]/g, '-').replace(/\s+/g, '_');
        const idDoc = `${item.periodo}_${item.empresa}_${linhaID}`;
        const docRef = db.collection("monitoramento_viagens").doc(idDoc);
        batch.set(docRef, { 
            linha: item.linha.toString(), empresa: item.empresa, segmento: item.segmento, periodo: item.periodo, [tipoDia]: item.qtd 
        }, { merge: true });
    }
    await batch.commit();
    alert("Dados Importados!");
    document.getElementById('area-previa').style.display = 'none';
    carregarTabelas();
}

async function carregarTabelas() {
    const corpoManha = document.getElementById('corpo-manha');
    const corpoTarde = document.getElementById('corpo-tarde');
    const snap = await db.collection("monitoramento_viagens").orderBy("linha").get();
    corpoManha.innerHTML = ""; corpoTarde.innerHTML = "";
    let linhasUnicas = new Set();
    let segmentosUnicos = new Set();

    snap.forEach(doc => {
        const d = doc.data();
        linhasUnicas.add(d.linha);
        segmentosUnicos.add(d.segmento);
        const tr = document.createElement('tr');
        tr.dataset.linha = d.linha;
        tr.dataset.empresa = d.empresa;
        tr.dataset.segmento = d.segmento;
        tr.innerHTML = `<td class="td-linhas">${obterPrefixo(d.linha)} <span>${d.empresa} | ${d.segmento}</span></td><td>${d.uteis || '-'}</td><td>${d.sabados || '-'}</td><td>${d.domingos || '-'}</td><td>${d.feriados || '-'}</td>`;
        if (d.periodo === "manha") corpoManha.appendChild(tr);
        else corpoTarde.appendChild(tr);
    });
    popularFiltrosSuspensos(Array.from(linhasUnicas).sort(), Array.from(segmentosUnicos).sort());
}

function popularFiltrosSuspensos(linhas, segmentos) {
    document.getElementById('search-linha').innerHTML = '<option value="">Todas as Linhas</option>' + linhas.map(l => `<option value="${l}">${l}</option>`).join('');
    document.getElementById('search-segmento').innerHTML = '<option value="">Todos os Segmentos</option>' + segmentos.map(s => `<option value="${s}">${s}</option>`).join('');
}

function filtrarTabelas() {
    const lPesq = document.getElementById('search-linha').value;
    const sPesq = document.getElementById('search-segmento').value;
    const ePesq = document.getElementById('search-empresa-view').value;
    document.querySelectorAll('tbody tr').forEach(tr => {
        const bateL = lPesq === "" || tr.dataset.linha === lPesq;
        const bateS = sPesq === "" || tr.dataset.segmento === sPesq;
        const bateE = ePesq === "" || tr.dataset.empresa === ePesq;
        tr.style.display = (bateL && bateS && bateE) ? "" : "none";
    });
}

async function limparMonitoramento() {
    if(confirm("Excluir todos os dados de viagens?")) {
        const snap = await db.collection("monitoramento_viagens").get();
        const batch = db.batch();
        snap.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        carregarTabelas();
    }
}

function logout() {
    sessionStorage.removeItem('usuarioAtivo');
    window.location.href = 'login.html';
}