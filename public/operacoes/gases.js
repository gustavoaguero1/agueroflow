/* Controle de gases (Central de Controle de Gases 2026 migrada para o AgueroFlow).
 * Dados em ops_orgs/{empresa}/gases_lancamentos | gases_pendencias | gases_boletos,
 * importados em "Importar dados" (lancamentos.json, pendencias.json, boletos.json).
 * A parte de cálculo (GASES) é pura e testada em tests/gasesView.test.ts; a tela usa
 * os utilitários da página (S, esc, brl, dbr, db, save, render, hojeISO). */
(function (root) {
  'use strict';
  const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const n = (v) => (typeof v === 'number' && isFinite(v) ? v : Number(v) || 0);
  const r2 = (v) => Math.round(v * 100) / 100;
  const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  /** Entra nos totais? O ajuste feito no AgueroFlow vence o "considerar" da planilha. */
  function considera(l) {
    const v = l.considerarAjuste || l.considerar;
    return norm(v) !== 'nao';
  }

  function resumo(ls) {
    const out = { valor: 0, cilindros: 0, desconsiderado: 0, revisar: 0, n: ls.length };
    for (const l of ls) {
      if (considera(l)) { out.valor += n(l.valor); out.cilindros += n(l.cilindros); } else out.desconsiderado += n(l.valor);
      if (String(l.status).toUpperCase() === 'REVISAR') out.revisar++;
    }
    out.valor = r2(out.valor); out.desconsiderado = r2(out.desconsiderado);
    return out;
  }

  function porMes(ls) {
    const m = MESES.map((nome, i) => ({ mes: i + 1, nome, valor: 0, cilindros: 0 }));
    for (const l of ls) {
      const i = n(l.mes) - 1;
      if (i < 0 || i > 11 || !considera(l)) continue;
      m[i].valor += n(l.valor); m[i].cilindros += n(l.cilindros);
    }
    m.forEach((x) => { x.valor = r2(x.valor); });
    return m;
  }

  function agrupar(ls, campo) {
    const g = new Map();
    for (const l of ls) {
      if (!considera(l)) continue;
      const k = l[campo] || '—';
      const x = g.get(k) || { k, valor: 0, cilindros: 0, n: 0 };
      x.valor += n(l.valor); x.cilindros += n(l.cilindros); x.n++;
      g.set(k, x);
    }
    return [...g.values()].map((x) => ({ ...x, valor: r2(x.valor) })).sort((a, b) => b.valor - a.valor);
  }

  /** Preço por cilindro, por gás e fornecedor (só cobrança por cilindro). Média ponderada pela quantidade. */
  function precos(ls) {
    const g = new Map();
    for (const l of ls) {
      if (!considera(l) || n(l.cilindros) <= 0 || n(l.preco_cil) <= 0 || !/cilindro/i.test(l.base_preco || '')) continue;
      const key = (l.gas || '—') + '|' + (l.fornecedor || '—');
      const x = g.get(key) || { gas: l.gas || '—', fornecedor: l.fornecedor || '—', cil: 0, total: 0, min: Infinity, max: 0 };
      x.cil += n(l.cilindros); x.total += n(l.cilindros) * n(l.preco_cil);
      x.min = Math.min(x.min, n(l.preco_cil)); x.max = Math.max(x.max, n(l.preco_cil));
      g.set(key, x);
    }
    return [...g.values()]
      .map((x) => ({ gas: x.gas, fornecedor: x.fornecedor, cilindros: x.cil, media: r2(x.total / x.cil), min: x.min, max: x.max }))
      .sort((a, b) => a.gas.localeCompare(b.gas, 'pt-BR') || a.media - b.media);
  }

  function filtrar(ls, f) {
    const q = norm(f.q || '').trim();
    return ls.filter((l) =>
      (!f.mes || String(l.mes) === String(f.mes)) &&
      (!f.obra || l.obra === f.obra) &&
      (!f.fornecedor || l.fornecedor === f.fornecedor) &&
      (!f.gas || l.gas === f.gas) &&
      (!f.status || String(l.status).toUpperCase() === f.status) &&
      (!q || norm([l.ref, l.obra, l.fornecedor, l.gas, l.motivo].join(' ')).includes(q)));
  }

  /** Ano da maioria dos lançamentos; data de outro ano costuma ser erro de digitação na planilha. */
  function anoBase(ls) {
    const c = new Map();
    for (const l of ls) { const a = /^(\d{4})-/.exec(l.data || ''); if (a) c.set(a[1], (c.get(a[1]) || 0) + 1); }
    let best = null, max = 0;
    for (const [a, k] of c) if (k > max) { best = a; max = k; }
    return best ? Number(best) : null;
  }
  function dataSuspeita(l, ano) {
    const a = /^(\d{4})-/.exec(l.data || '');
    return !!(a && ano && Number(a[1]) !== ano);
  }

  function boletoSituacao(b, hoje) {
    if (b.pago) return { k: 'pago', dias: null, txt: 'Pago' + (b.pagoEm ? ' em ' + String(b.pagoEm).slice(0, 10).split('-').reverse().join('/') : '') };
    const dias = Math.round((Date.parse(b.vencimento + 'T12:00:00') - Date.parse(hoje + 'T12:00:00')) / 864e5);
    if (!isFinite(dias)) return { k: 'aberto', dias: null, txt: 'Sem vencimento' };
    if (dias < 0) return { k: 'vencido', dias, txt: 'Vencido há ' + -dias + (dias === -1 ? ' dia' : ' dias') };
    if (dias === 0) return { k: 'aberto', dias, txt: 'Vence hoje' };
    return { k: 'aberto', dias, txt: 'Vence em ' + dias + (dias === 1 ? ' dia' : ' dias') };
  }

  const GASES = { MESES, considera, resumo, porMes, agrupar, precos, filtrar, anoBase, dataSuspeita, boletoSituacao };
  if (typeof module !== 'undefined' && module.exports) { module.exports = GASES; return; }
  root.GASES = GASES;

  /* ------------------------------ Tela ------------------------------ */
  const V = () => (S.view.gas = S.view.gas || { tab: 'lanc', f: {}, lim: 100, notas: {} });
  const podeEditar = () => S.me.canWrite !== false;
  const opts = (vals, sel, todos) => `<option value="">${todos}</option>` + vals.map((v) => `<option ${v === sel ? 'selected' : ''} value="${esc(v)}">${esc(v)}</option>`).join('');
  const uniq = (ls, k) => [...new Set(ls.map((l) => l[k]).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'pt-BR'));
  const pillSt = (s) => `<span class="pill ${String(s).toUpperCase() === 'OK' ? 'p-CONTRATAR' : 'p-AVALIAR'}">${esc(s || '—')}</span>`;

  function barras(meses) {
    const max = Math.max(1, ...meses.map((m) => m.valor));
    return `<div class="gas-bars" role="img" aria-label="Gasto considerado por mês">${meses.map((m) =>
      `<div class="gas-bar" title="${esc(m.nome)}: ${brl(m.valor, 2)} · ${m.cilindros} cilindros"><div class="gas-bar-v num">${m.valor ? brl(m.valor) : ''}</div><i style="height:${Math.round((m.valor / max) * 100)}%"></i><span>${m.nome}</span></div>`).join('')}</div>`;
  }

  function tabela(rows, cols) {
    return `<div class="tw"><table><thead><tr>${cols.map((c) => `<th class="${c.r ? 'r' : ''}">${c.t}</th>`).join('')}</tr></thead><tbody>${
      rows.length ? rows.map((r) => `<tr>${cols.map((c) => `<td class="${c.r ? 'r num' : ''}">${c.f(r)}</td>`).join('')}</tr>`).join('')
        : `<tr><td colspan="${cols.length}" class="muted">Nada para mostrar com esses filtros.</td></tr>`}</tbody></table></div>`;
  }

  function vGasesView() {
    const v = V();
    const L = S.gasl || [], P = S.gasp || [], B = S.gasb || [];
    if (!L.length && !P.length && !B.length) {
      const carregando = !S.loaded.gasl;
      return `<div class="row"><h1>Controle de gases</h1></div><div class="card" style="display:grid;gap:8px">${carregando
        ? '<span class="muted">Carregando…</span>'
        : '<b>Nenhum dado de gases ainda.</b><div class="muted">Use o botão "Importar" no topo do módulo Operações e escolha os arquivos da Central de Controle de Gases: lançamentos, pendências e boletos (pode escolher os três juntos).</div>'}</div>`;
    }
    const f = v.f;
    const Lf = filtrar(L, f);
    const R = resumo(Lf);
    const ano = anoBase(L);
    const pAbertas = P.filter((p) => String(p.situacao).toUpperCase() === 'ABERTA');
    const hoje = hojeISO();
    const bAbertos = B.filter((b) => !b.pago);
    const bVencidos = bAbertos.filter((b) => boletoSituacao(b, hoje).k === 'vencido');
    const somaB = r2(bAbertos.reduce((s, b) => s + n(b.valor), 0));

    const filtros = `<div class="card gas-filtros">
      <label class="f"><span>Mês</span><select data-gasf="mes">${`<option value="">Ano todo</option>` + MESES.map((m, i) => `<option value="${i + 1}" ${String(f.mes) === String(i + 1) ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
      <label class="f"><span>Obra</span><select data-gasf="obra">${opts(uniq(L, 'obra'), f.obra, 'Todas')}</select></label>
      <label class="f"><span>Fornecedor</span><select data-gasf="fornecedor">${opts(uniq(L, 'fornecedor'), f.fornecedor, 'Todos')}</select></label>
      <label class="f"><span>Gás</span><select data-gasf="gas">${opts(uniq(L, 'gas'), f.gas, 'Todos')}</select></label>
      <label class="f"><span>Situação</span><select data-gasf="status">${opts(['OK', 'REVISAR'], f.status, 'Todas')}</select></label>
      ${Object.values(f).some(Boolean) ? '<button class="btn sm" data-gas="limpar">Limpar filtros</button>' : ''}
    </div>`;

    const kpis = `<div class="gas-kpis">
      <div class="card stat"><span class="small muted">Gasto considerado</span><b class="num">${brl(R.valor, 2)}</b><span class="small muted">${R.n} lançamentos${R.desconsiderado ? ' · ' + brl(R.desconsiderado, 2) + ' fora (duplicados)' : ''}</span></div>
      <div class="card stat"><span class="small muted">Cilindros</span><b class="num">${R.cilindros.toLocaleString('pt-BR')}</b><span class="small muted">considerados</span></div>
      <div class="card stat"><span class="small muted">A revisar</span><b class="num" style="color:${R.revisar ? 'var(--warn)' : 'inherit'}">${R.revisar}</b><span class="small muted">lançamentos com aviso</span></div>
      <div class="card stat"><span class="small muted">Pendências abertas</span><b class="num" style="color:${pAbertas.length ? 'var(--warn)' : 'inherit'}">${pAbertas.length}</b><span class="small muted">de ${P.length}</span></div>
      <div class="card stat"><span class="small muted">Boletos em aberto</span><b class="num" style="color:${bVencidos.length ? 'var(--bad)' : 'inherit'}">${brl(somaB, 2)}</b><span class="small muted">${bAbertos.length} boleto(s)${bVencidos.length ? ' · ' + bVencidos.length + ' vencido(s)' : ''}</span></div>
    </div>`;

    const porObra = agrupar(Lf, 'obra');
    const porForn = agrupar(Lf, 'fornecedor');
    const pct = (x) => (R.valor ? Math.round((x / R.valor) * 1000) / 10 + '%' : '—');
    const graficos = `<div class="gas-2">
      <div class="card" style="grid-column:1/-1"><h3>Gasto por mês</h3>${barras(porMes(filtrar(L, { ...f, mes: '' })))}</div>
      <div class="card"><h3>Por obra</h3>${tabela(porObra, [
        { t: 'Obra', f: (r) => `<a href="#" data-gasobra="${esc(r.k)}">${esc(r.k)}</a>` },
        { t: 'Cilindros', r: 1, f: (r) => r.cilindros },
        { t: 'Valor', r: 1, f: (r) => brl(r.valor, 2) },
        { t: '%', r: 1, f: (r) => pct(r.valor) }])}</div>
      <div class="card"><h3>Por fornecedor</h3>${tabela(porForn, [
        { t: 'Fornecedor', f: (r) => esc(r.k) },
        { t: 'Cilindros', r: 1, f: (r) => r.cilindros },
        { t: 'Valor', r: 1, f: (r) => brl(r.valor, 2) },
        { t: '%', r: 1, f: (r) => pct(r.valor) }])}</div>
      <div class="card" style="grid-column:1/-1"><h3>Preço por cilindro</h3><p class="small muted" style="margin:4px 0 8px">Média ponderada pela quantidade, com o menor e o maior preço pago. Cobranças por m³/kg ficam de fora.</p>${tabela(precos(Lf), [
        { t: 'Gás', f: (r) => esc(r.gas) },
        { t: 'Fornecedor', f: (r) => esc(r.fornecedor) },
        { t: 'Cilindros', r: 1, f: (r) => r.cilindros },
        { t: 'Média', r: 1, f: (r) => brl(r.media, 2) },
        { t: 'Menor', r: 1, f: (r) => brl(r.min, 2) },
        { t: 'Maior', r: 1, f: (r) => brl(r.max, 2) }])}</div>
    </div>`;

    const tab = (k, t, c) => `<button class="${v.tab === k ? 'on' : ''}" data-gastab="${k}">${t}${c != null ? ' <span class="pill p-PENDENTE">' + c + '</span>' : ''}</button>`;
    const tabs = `<div class="tabs">${tab('lanc', 'Lançamentos', Lf.length)}${tab('pend', 'Pendências', pAbertas.length)}${tab('bol', 'Boletos', bAbertos.length)}</div>`;

    let corpo = '';
    if (v.tab === 'lanc') {
      // Mais recentes primeiro pelo mês da planilha (a data às vezes vem com o ano digitado errado).
      const rows = [...Lf].sort((a, b) => n(b.mes) - n(a.mes) || String(b.data || '').localeCompare(String(a.data || '')));
      corpo = `<div class="row" style="margin:10px 0"><input type="search" id="gas-q" placeholder="Buscar por referência, obra, fornecedor, gás ou motivo" value="${esc(f.q || '')}" style="max-width:420px"></div>` +
        tabela(rows.slice(0, v.lim), [
          { t: 'Data', f: (l) => (l.data ? dbr(l.data) : '<span class="muted">sem data</span>') + (dataSuspeita(l, ano) ? ' <span class="pill p-AVALIAR" title="Ano diferente dos demais lançamentos: confira a data na planilha">ano?</span>' : '') },
          { t: 'Ref.', f: (l) => esc(l.ref) + `<div class="small muted">${esc(l.fonte || '')}</div>` },
          { t: 'Obra', f: (l) => esc(l.obra) },
          { t: 'Fornecedor', f: (l) => esc(l.fornecedor) },
          { t: 'Gás', f: (l) => esc(l.gas) },
          { t: 'Cil.', r: 1, f: (l) => n(l.cilindros) || '—' },
          { t: 'Preço', r: 1, f: (l) => (n(l.preco_cil) ? brl(n(l.preco_cil), 2) : `<span class="small muted">${esc(l.base_preco || '')}</span>`) },
          { t: 'Valor', r: 1, f: (l) => `<span style="${considera(l) ? '' : 'text-decoration:line-through;color:var(--muted)'}">${brl(n(l.valor), 2)}</span>` },
          { t: 'Situação', f: (l) => pillSt(l.status) + (l.motivo ? `<div class="small muted" style="max-width:280px">${esc(l.motivo)}</div>` : '') },
          { t: 'Entra no total', f: (l) => podeEditar()
            ? `<select data-gascons="${esc(l.id)}" aria-label="Entra no total"><option value="SIM" ${considera(l) ? 'selected' : ''}>Sim</option><option value="NÃO" ${considera(l) ? '' : 'selected'}>Não</option></select>${l.considerarAjuste ? '<div class="small muted">ajustado</div>' : ''}`
            : considera(l) ? 'Sim' : 'Não' },
        ]) + (rows.length > v.lim ? `<div class="row" style="margin-top:8px"><span class="muted small">Mostrando ${v.lim} de ${rows.length}.</span><button class="btn sm" data-gas="mais">Mostrar mais</button></div>` : '');
    } else if (v.tab === 'pend') {
      const ord = [...P].sort((a, b) => (String(a.situacao) === 'ABERTA' ? 0 : 1) - (String(b.situacao) === 'ABERTA' ? 0 : 1) || n(a.id) - n(b.id));
      corpo = `<div class="gas-pends">${ord.length ? ord.map((p) => {
        const aberta = String(p.situacao).toUpperCase() === 'ABERTA';
        return `<div class="card gas-pend ${aberta ? '' : 'feita'}">
          <div class="row"><b>${esc(p.pendencia)}</b><span class="pill ${aberta ? 'p-AVALIAR' : 'p-CONTRATAR'}">${aberta ? 'Aberta' : 'Resolvida'}</span><span class="sp"></span><span class="small muted">${esc(p.tipo || '')} · ${esc(p.referencia || '')} · ${esc(p.fornecedor || '')}</span></div>
          <div>${esc(p.acao || '')}</div>
          ${aberta
            ? podeEditar() ? `<div class="row"><input type="text" data-gasnota="${esc(p.id)}" placeholder="O que foi decidido (opcional)" value="${esc(v.notas[p.id] || '')}" style="flex:1;min-width:220px"><button class="btn sm pri" data-gasresolver="${esc(p.id)}">Marcar como resolvida</button></div>` : ''
            : `<div class="small muted">${esc(p.resolucao || 'Sem observação')}${p.resolvidoPor ? ' · ' + esc(p.resolvidoPor) : ''}${p.resolvidoEm ? ' em ' + dbr(String(p.resolvidoEm).slice(0, 10)) : ''}${podeEditar() ? ` · <a href="#" data-gasreabrir="${esc(p.id)}">reabrir</a>` : ''}</div>`}
        </div>`;
      }).join('') : '<div class="card muted">Nenhuma pendência importada.</div>'}</div>`;
    } else {
      const ord = [...B].sort((a, b) => (a.pago ? 1 : 0) - (b.pago ? 1 : 0) || String(a.vencimento).localeCompare(String(b.vencimento)));
      corpo = tabela(ord, [
        { t: 'Documento', f: (b) => esc(b.documento) },
        { t: 'Beneficiário', f: (b) => esc(b.beneficiario) },
        { t: 'NF', f: (b) => esc(b.nf || '—') },
        { t: 'Vencimento', f: (b) => dbr(b.vencimento) },
        { t: 'Valor', r: 1, f: (b) => brl(n(b.valor), 2) },
        { t: 'Situação', f: (b) => { const s = boletoSituacao(b, hoje); return `<span class="pill ${s.k === 'pago' ? 'p-CONTRATAR' : s.k === 'vencido' ? 'p-NAO' : 'p-AVALIAR'}">${esc(s.txt)}</span>`; } },
        { t: '', f: (b) => (podeEditar() ? (b.pago ? `<button class="btn sm" data-gaspago="${esc(b.id)}" data-v="0">Desfazer baixa</button>` : `<button class="btn sm pri" data-gaspago="${esc(b.id)}" data-v="1">Dar baixa</button>`) : '') },
      ]);
    }

    return `<div class="row"><h1>Controle de gases</h1><span class="sp"></span><span class="small muted">${ano ? 'Ano ' + ano + ' · ' : ''}${L.length} lançamentos importados</span></div>${roText()}${filtros}${kpis}${graficos}<div class="card">${tabs}${corpo}</div>`;
  }

  /** Eventos da tela; devolve true quando tratou. Chamado pelos handlers de #main. */
  async function gasesEvent(e) {
    const t = e.target;
    const v = V();
    if (e.type === 'input') {
      if (t.id === 'gas-q') { v.f.q = t.value; v.lim = 100; clearTimeout(v._t); v._t = setTimeout(render, 300); return true; }
      if (t.dataset && t.dataset.gasnota) { v.notas[t.dataset.gasnota] = t.value; return true; }
      return false;
    }
    if (e.type === 'change') {
      if (t.dataset && t.dataset.gasf) { v.f[t.dataset.gasf] = t.value; v.lim = 100; render(); return true; }
      if (t.dataset && t.dataset.gascons) {
        const id = t.dataset.gascons;
        await save(() => db.doc('gases_lancamentos/' + id).update({ considerarAjuste: t.value, ajustadoPor: S.me.name || '', ajustadoEm: new Date().toISOString() }),
          t.value === 'SIM' ? 'Lançamento volta a entrar no total.' : 'Lançamento fica fora do total.');
        return true;
      }
      return false;
    }
    const el = t.closest && t.closest('[data-gas],[data-gastab],[data-gasobra],[data-gasresolver],[data-gasreabrir],[data-gaspago]');
    if (!el) return false;
    e.preventDefault();
    const d = el.dataset;
    if (d.gastab) { v.tab = d.gastab; render(); return true; }
    if (d.gasobra) { v.f.obra = d.gasobra; v.tab = 'lanc'; render(); return true; }
    if (d.gas === 'limpar') { v.f = {}; render(); return true; }
    if (d.gas === 'mais') { v.lim += 200; render(); return true; }
    if (d.gasresolver) {
      const id = d.gasresolver;
      await save(() => db.doc('gases_pendencias/' + id).update({ situacao: 'RESOLVIDA', resolucao: (v.notas[id] || '').trim(), resolvidoPor: S.me.name || '', resolvidoEm: new Date().toISOString() }), 'Pendência resolvida.');
      delete v.notas[id];
      return true;
    }
    if (d.gasreabrir) {
      await save(() => db.doc('gases_pendencias/' + d.gasreabrir).update({ situacao: 'ABERTA' }), 'Pendência reaberta.');
      return true;
    }
    if (d.gaspago) {
      const pago = d.v === '1';
      await save(() => db.doc('gases_boletos/' + d.gaspago).update(pago ? { pago: true, pagoEm: new Date().toISOString(), pagoPor: S.me.name || '' } : { pago: false, pagoEm: null, pagoPor: '' }),
        pago ? 'Baixa registrada.' : 'Baixa desfeita.');
      return true;
    }
    return false;
  }

  root.vGasesView = vGasesView;
  root.gasesEvent = gasesEvent;
})(typeof window !== 'undefined' ? window : globalThis);
