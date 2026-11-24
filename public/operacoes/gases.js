/* Controle de gases (Central de Controle de Gases 2026 migrada para o AgueroFlow).
 * Dados em ops_orgs/{empresa}/gases_lancamentos | gases_pendencias | gases_boletos,
 * importados em "Importar dados" (lancamentos.json, pendencias.json, boletos.json).
 * A parte de cálculo (GASES) é pura e testada em tests/gasesView.test.ts; a tela usa
 * os utilitários da página (S, esc, brl, dbr, db, save, render, hojeISO, roText). */
(function (root) {
  'use strict';
  const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const n = (v) => (typeof v === 'number' && isFinite(v) ? v : Number(v) || 0);
  const r2 = (v) => Math.round(v * 100) / 100;
  const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const reais = (v) => 'R$ ' + n(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pctTxt = (v) => (v * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
  const SEM_FORN = 'NÃO INFORMADO';

  /** Entra nos totais? O ajuste feito no AgueroFlow vence o "considerar" da planilha. */
  function considera(l) {
    return norm(l.considerarAjuste || l.considerar) !== 'nao';
  }
  const porCilindro = (l) => n(l.cilindros) > 0 && n(l.preco_cil) > 0 && /cilindro/i.test(l.base_preco || '');
  const grupoGas = (g) => { const s = norm(g); return s === 'argonio' ? 'argonio' : s === 'argonio 5.0' ? 'argonio50' : 'outros'; };

  /** Como no painel original: contagens só dos lançamentos que entram no total. */
  function resumo(ls) {
    const out = { valor: 0, cilindros: 0, desconsiderado: 0, revisar: 0, n: 0, custoMedio: 0, obras: 0 };
    let cil = 0, tot = 0;
    const obras = new Set();
    for (const l of ls) {
      if (!considera(l)) { out.desconsiderado += n(l.valor); continue; }
      out.n++; out.valor += n(l.valor); out.cilindros += n(l.cilindros);
      if (l.obra) obras.add(l.obra);
      if (String(l.status).toUpperCase() === 'REVISAR') out.revisar++;
      if (porCilindro(l)) { cil += n(l.cilindros); tot += n(l.cilindros) * n(l.preco_cil); }
    }
    out.valor = r2(out.valor); out.desconsiderado = r2(out.desconsiderado);
    out.custoMedio = cil ? r2(tot / cil) : 0;
    out.obras = obras.size;
    return out;
  }

  function porMesGas(ls) {
    const m = MESES.map((nome, i) => ({ mes: i + 1, nome, argonio: 0, argonio50: 0, outros: 0, total: 0, cilindros: 0 }));
    for (const l of ls) {
      const i = n(l.mes) - 1;
      if (i < 0 || i > 11 || !considera(l)) continue;
      m[i][grupoGas(l.gas)] += n(l.valor); m[i].total += n(l.valor); m[i].cilindros += n(l.cilindros);
    }
    m.forEach((x) => { x.argonio = r2(x.argonio); x.argonio50 = r2(x.argonio50); x.outros = r2(x.outros); x.total = r2(x.total); });
    return m;
  }
  const porMes = porMesGas;

  function ultimoMes(ls) {
    const m = porMesGas(ls);
    let i = 11;
    while (i >= 0 && !m[i].total) i--;
    if (i < 0) return null;
    const ant = i > 0 ? m[i - 1].total : 0;
    return { mes: i + 1, nome: m[i].nome, valor: m[i].total, anterior: ant, variacao: ant ? m[i].total / ant - 1 : null };
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

  function calor(ls, obras) {
    const idx = new Map(obras.map((o, i) => [o, i]));
    const out = obras.map((obra) => ({ obra, meses: Array(12).fill(0) }));
    for (const l of ls) {
      const i = idx.get(l.obra), m = n(l.mes) - 1;
      if (i == null || m < 0 || m > 11 || !considera(l)) continue;
      out[i].meses[m] += n(l.valor);
    }
    out.forEach((o) => { o.meses = o.meses.map(r2); });
    return out;
  }

  /** Preço por cilindro, por gás e fornecedor (só cobrança por cilindro). Média ponderada pela quantidade. */
  function precos(ls) {
    const g = new Map();
    for (const l of ls) {
      if (!considera(l) || !porCilindro(l)) continue;
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

  /** Média ponderada por mês e fornecedor para um gás; salto = variação > 10% sobre a compra anterior do mesmo fornecedor. */
  function precoMensal(ls, gas) {
    const acc = new Map();
    for (const l of ls) {
      if (!considera(l) || !porCilindro(l) || norm(l.gas) !== norm(gas)) continue;
      const m = n(l.mes) - 1;
      if (m < 0 || m > 11) continue;
      const f = l.fornecedor || SEM_FORN;
      const x = acc.get(f) || { cil: Array(12).fill(0), tot: Array(12).fill(0) };
      x.cil[m] += n(l.cilindros); x.tot[m] += n(l.cilindros) * n(l.preco_cil);
      acc.set(f, x);
    }
    return [...acc.entries()].map(([fornecedor, x]) => {
      const pontos = x.cil.map((c, i) => (c ? r2(x.tot[i] / c) : null));
      let ant = null;
      const salto = pontos.map((p) => {
        if (p == null) return false;
        const s = ant != null && Math.abs(p / ant - 1) > 0.1;
        ant = p;
        return s;
      });
      return { fornecedor, pontos, salto };
    }).sort((a, b) => a.fornecedor.localeCompare(b.fornecedor, 'pt-BR'));
  }

  const GASES_PRECO = ['Argônio', 'Argônio 5.0'];
  /** Gás do gráfico de preço; estado salvo antes do seletor (ou inválido) cai no Argônio 5.0. */
  function gasPrecoAtual(v) {
    return v && GASES_PRECO.includes(v.gasPreco) ? v.gasPreco : 'Argônio 5.0';
  }

  /** Alertas automáticos: fornecedor ≥10% mais caro que o mais barato no último mês; variação ≥10% entre compras. */
  function alertas(ls) {
    const out = [];
    const ult = ultimoMes(ls);
    if (!ult) return out;
    for (const gas of ['Argônio', 'Argônio 5.0']) {
      const series = precoMensal(ls, gas).filter((s) => s.fornecedor !== SEM_FORN);
      const noMes = series.map((s) => ({ f: s.fornecedor, p: s.pontos[ult.mes - 1] })).filter((x) => x.p != null).sort((a, b) => a.p - b.p);
      if (noMes.length > 1) {
        const barato = noMes[0];
        for (const x of noMes.slice(1)) {
          const d = x.p / barato.p - 1;
          if (d >= 0.1) out.push({ tipo: 'preco', titulo: `Preço ${gas} · ${ult.nome}`, peso: d, texto: `${x.f} cobra ${reais(x.p)}/cil., ${pctTxt(d)} acima de ${barato.f} (${reais(barato.p)}/cil.).` });
        }
      }
      for (const s of series) {
        const idx = s.pontos.map((p, i) => (p == null ? -1 : i)).filter((i) => i >= 0);
        if (idx.length < 2) continue;
        const a = idx[idx.length - 2], b = idx[idx.length - 1];
        const d = s.pontos[b] / s.pontos[a] - 1;
        if (Math.abs(d) >= 0.1) {
          out.push({ tipo: 'variacao', titulo: `Variação ${gas} · ${s.fornecedor}`, peso: Math.abs(d), texto: `${reais(s.pontos[a])} (${MESES[a]}) → ${reais(s.pontos[b])} (${MESES[b]}): ${d > 0 ? '+' : '−'}${pctTxt(Math.abs(d))} por cilindro.` });
        }
      }
    }
    return out.sort((a, b) => (a.tipo === b.tipo ? b.peso - a.peso : a.tipo === 'preco' ? -1 : 1));
  }

  /** Motivo sem o detalhe (linha, data, bloco), para agrupar. */
  const motivoBase = (m) => m.replace(/\s*\([^)]*\)/g, '').replace(/\s+do bloco .*$/i, '').trim();
  function motivos(ls) {
    const c = new Map();
    for (const l of ls) {
      if (String(l.status).toUpperCase() !== 'REVISAR' || !l.motivo) continue;
      for (const part of String(l.motivo).split(';')) {
        const k = motivoBase(part);
        if (k) c.set(k, (c.get(k) || 0) + 1);
      }
    }
    return [...c.entries()].map(([k, v]) => ({ k, n: v })).sort((a, b) => b.n - a.n || a.k.localeCompare(b.k, 'pt-BR'));
  }

  function filtrar(ls, f) {
    const q = norm(f.q || '').trim();
    return ls.filter((l) =>
      (!f.mes || String(l.mes) === String(f.mes)) &&
      (!f.obra || l.obra === f.obra) &&
      (!f.fornecedor || l.fornecedor === f.fornecedor) &&
      (!f.gas || l.gas === f.gas) &&
      (!f.fonte || String(l.fonte).toUpperCase() === f.fonte) &&
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

  function boletosPorPrazo(bs, hoje) {
    const z = () => ({ n: 0, valor: 0 });
    const out = { vencidos: z(), ate7: z(), ate30: z(), depois: z() };
    for (const b of bs) {
      if (b.pago) continue;
      const s = boletoSituacao(b, hoje);
      const k = s.dias == null ? 'depois' : s.dias < 0 ? 'vencidos' : s.dias <= 7 ? 'ate7' : s.dias <= 30 ? 'ate30' : 'depois';
      out[k].n++; out[k].valor = r2(out[k].valor + n(b.valor));
    }
    return out;
  }

  const GASES = {
    MESES, considera, resumo, porMes, porMesGas, ultimoMes, agrupar, calor, precos, precoMensal, gasPrecoAtual, alertas, motivos,
    filtrar, anoBase, dataSuspeita, boletoSituacao, boletosPorPrazo, grupoGas,
  };
  if (typeof module !== 'undefined' && module.exports) { module.exports = GASES; return; }
  root.GASES = GASES;

  /* ------------------------------ Tela ------------------------------ */
  const svg = (p, cls) => `<svg viewBox="0 0 24 24" aria-hidden="true"${cls ? ` class="${cls}"` : ''}>${p}</svg>`;
  const ICONES = {
    wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
    cylinder: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/>',
    tag: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5"/>',
    calendar: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
    building: '<rect width="16" height="20" x="4" y="2" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/><path d="M12 10h.01"/><path d="M12 14h.01"/><path d="M16 10h.01"/><path d="M16 14h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/>',
    checks: '<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    trend: '<path d="M16 7h6v6"/><path d="m22 7-8.5 8.5-5-5L2 17"/>',
  };
  const V = () => (S.view.gas = S.view.gas || { tab: 'lanc', f: {}, lim: 100, notas: {}, gasPreco: 'Argônio 5.0' });
  const podeEditar = () => S.me.canWrite !== false;
  const opts = (vals, sel, todos) => `<option value="">${todos}</option>` + vals.map((v) => `<option ${v === sel ? 'selected' : ''} value="${esc(v)}">${esc(v)}</option>`).join('');
  const uniq = (ls, k) => [...new Set(ls.map((l) => l[k]).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'pt-BR'));
  const pillSt = (s) => `<span class="pill ${String(s).toUpperCase() === 'OK' ? 'p-CONTRATAR' : 'p-AVALIAR'}">${esc(s || '—')}</span>`;
  const mil = (v) => (v >= 1e6 ? (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' mi' : v >= 1e3 ? Math.round(v / 1e3).toLocaleString('pt-BR') + ' mil' : Math.round(v).toLocaleString('pt-BR'));
  const curto = (s, k) => (String(s).length > k ? String(s).slice(0, k - 1) + '…' : String(s));
  const tip = (t) => `data-tip="${esc(t)}"`;

  // Cores por entidade (nunca por posição): gases fixos; fornecedores pela ordem alfabética de todos os dados.
  const GAS_SERIES = [['argonio', 'Argônio', 's1'], ['argonio50', 'Argônio 5.0', 's2'], ['outros', 'Outros gases', 's3']];
  function corFornecedores(L) {
    const nomes = uniq(L, 'fornecedor').filter((f) => f !== SEM_FORN);
    const m = new Map(nomes.map((f, i) => [f, i < 5 ? 's' + (i + 1) : 'sx']));
    m.set(SEM_FORN, 'sn');
    return m;
  }

  /* --- Gráficos (SVG simples; uma escala por gráfico) --- */
  function graficoMensal(meses, mesSel) {
    const W = 1240, H = 270, pl = 60, pr = 8, pt = 22, pb = 26;
    const max = Math.max(1, ...meses.map((m) => m.total));
    const passo = Math.pow(10, Math.floor(Math.log10(max)));
    const topo = Math.ceil(max / passo) * passo;
    const y = (v) => pt + (H - pt - pb) * (1 - v / topo);
    const bw = (W - pl - pr) / 12;
    const grade = [0, 0.25, 0.5, 0.75, 1].map((k) => `<line class="gv-grid" x1="${pl}" x2="${W - pr}" y1="${y(topo * k)}" y2="${y(topo * k)}"/><text class="gv-ax" x="${pl - 8}" y="${y(topo * k) + 3}" text-anchor="end">${k ? 'R$ ' + mil(topo * k) : 'R$ 0'}</text>`).join('');
    const barras = meses.map((m, i) => {
      const x = pl + i * bw + bw * 0.18, w = bw * 0.64;
      let base = 0;
      const segs = GAS_SERIES.filter(([k]) => m[k] > 0).map(([k, , s], j, arr) => {
        const y0 = y(base), y1 = y(base + m[k]);
        base += m[k];
        const topoSeg = j === arr.length - 1;
        const h = Math.max(0, y0 - y1 - (topoSeg ? 0 : 2));
        return topoSeg
          ? `<path class="gv-${s}" d="M${x},${y0} V${y1 + 4} q0,-4 4,-4 H${x + w - 4} q4,0 4,4 V${y0} Z" transform="translate(0,${0})" style="${h < 5 ? '' : ''}"/>`
          : `<rect class="gv-${s}" x="${x}" y="${y0 - h}" width="${w}" height="${h}"/>`;
      }).join('');
      const t = `${m.nome}: ${reais(m.total)} · Argônio ${reais(m.argonio)} · Argônio 5.0 ${reais(m.argonio50)}${m.outros ? ' · Outros ' + reais(m.outros) : ''} · ${m.cilindros} cilindros`;
      const sel = mesSel && String(mesSel) === String(m.mes);
      return `<g class="gv-col${sel ? ' on' : ''}${mesSel && !sel ? ' off' : ''}" data-gasset="mes:${m.mes}" ${tip(t)} role="button" aria-label="${esc(t)}">
        <rect class="gv-hit" x="${pl + i * bw}" y="${pt}" width="${bw}" height="${H - pt - pb}"/>${segs}
        ${m.total ? `<text class="gv-val" x="${x + w / 2}" y="${y(m.total) - 6}" text-anchor="middle">${mil(m.total)}</text>` : ''}
        <text class="gv-ax" x="${x + w / 2}" y="${H - 6}" text-anchor="middle">${m.nome}</text></g>`;
    }).join('');
    return `<svg class="gv" viewBox="0 0 ${W} ${H}" role="img" aria-label="Gasto mensal por gás">${grade}${barras}</svg>`;
  }

  function graficoCilindros(meses) {
    const W = 1240, H = 110, pl = 60, pr = 8, pt = 22, pb = 12;
    const max = Math.max(1, ...meses.map((m) => m.cilindros));
    const bw = (W - pl - pr) / 12;
    const x = (i) => pl + i * bw + bw / 2, y = (v) => pt + (H - pt - pb) * (1 - v / max);
    const pts = meses.map((m, i) => (m.cilindros || m.total ? [x(i), y(m.cilindros), m] : null)).filter(Boolean);
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
    return `<svg class="gv" viewBox="0 0 ${W} ${H}" role="img" aria-label="Cilindros por mês">
      <line class="gv-grid" x1="${pl}" x2="${W - pr}" y1="${y(0)}" y2="${y(0)}"/>
      <text class="gv-ax" x="${pl - 8}" y="${y(0) + 3}" text-anchor="end">0</text>
      <path class="gv-line gv-sl" d="${d}"/>
      ${pts.map(([px, py, m]) => `<g ${tip(`${m.nome}: ${m.cilindros} cilindros`)}><circle class="gv-hitc" cx="${px}" cy="${py}" r="12"/><circle class="gv-dot gv-sl-dot" cx="${px}" cy="${py}" r="4"/><text class="gv-val" x="${px}" y="${py - 9}" text-anchor="middle">${m.cilindros}</text></g>`).join('')}
    </svg>`;
  }

  function barrasH(itens, total, set, cor, top) {
    const max = Math.max(1, ...itens.map((i) => i.valor));
    return `<div class="gh">${itens.slice(0, top || itens.length).map((it, i) => `
      <button class="gh-row" data-gasset="${set}:${esc(it.k)}" ${tip(`${it.k}: ${reais(it.valor)} · ${it.cilindros} cilindros · ${pctTxt(total ? it.valor / total : 0)} do total`)}>
        <span class="gh-k">${top ? `<span class="gh-i">${String(i + 1).padStart(2, '0')}</span>` : ''}${esc(curto(it.k, 34))}</span>
        <span class="gh-bar"><i class="${cor(it.k)}" style="width:${Math.max(0.6, (it.valor / max) * 100)}%"></i></span>
        <span class="gh-v">${mil(it.valor)} <span class="muted">· ${pctTxt(total ? it.valor / total : 0)}</span></span>
      </button>`).join('')}</div>`;
  }

  function mapaCalor(linhas, mesSel) {
    const max = Math.max(1, ...linhas.flatMap((l) => l.meses));
    return `<div class="gc" role="table" aria-label="Gasto por obra e mês">
      <div class="gc-row gc-head" role="row"><span></span>${MESES.map((m, i) => `<span class="gc-m${mesSel && String(mesSel) === String(i + 1) ? ' on' : ''}">${m}</span>`).join('')}</div>
      ${linhas.map((l) => `<div class="gc-row" role="row"><button class="gc-k" data-gasset="obra:${esc(l.obra)}" title="${esc(l.obra)}">${esc(curto(l.obra, 30))}</button>${l.meses.map((v, i) =>
        `<span class="gc-c" ${tip(`${l.obra} · ${MESES[i]}: ${v ? reais(v) : 'sem gasto'}`)} style="--a:${v ? (0.12 + 0.88 * Math.sqrt(v / max)).toFixed(3) : 0}"></span>`).join('')}</div>`).join('')}
      <div class="gc-leg"><span>menos</span><i></i><span>mais gasto no mês</span></div>
    </div>`;
  }

  function rosca(itens, total, cor) {
    const R = 70, r = 48, C = 90;
    let ang = -Math.PI / 2;
    const arco = (a0, a1) => {
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const p = (rad, a) => [C + rad * Math.cos(a), C + rad * Math.sin(a)].map((v) => v.toFixed(2)).join(',');
      return `M${p(R, a0)} A${R},${R} 0 ${large} 1 ${p(R, a1)} L${p(r, a1)} A${r},${r} 0 ${large} 0 ${p(r, a0)} Z`;
    };
    const fat = itens.map((it) => {
      const a = (it.valor / total) * Math.PI * 2;
      const gap = itens.length > 1 ? 0.012 : 0;
      const d = arco(ang + gap, ang + Math.max(a - gap, gap * 2));
      ang += a;
      return `<path class="gv-${cor(it.k)} gv-slice" d="${d}" data-gasset="fornecedor:${esc(it.k)}" ${tip(`${it.k}: ${reais(it.valor)} · ${pctTxt(it.valor / total)}`)}/>`;
    }).join('');
    return `<div class="gd"><svg viewBox="0 0 180 180" role="img" aria-label="Participação dos fornecedores no gasto">${fat}
      <text class="gd-v" x="90" y="88" text-anchor="middle">R$ ${mil(total)}</text><text class="gd-l" x="90" y="106" text-anchor="middle">gasto total</text></svg>
      <ul class="gd-leg">${itens.map((it) => `<li><button data-gasset="fornecedor:${esc(it.k)}"><i class="${cor(it.k)}"></i><span><b>${esc(it.k)}</b><span class="muted">${reais(it.valor)} · ${pctTxt(it.valor / total)}</span></span></button></li>`).join('')}</ul></div>`;
  }

  function graficoPreco(series, cor) {
    const W = 760, H = 240, pl = 58, pr = 12, pt = 16, pb = 24;
    const vals = series.flatMap((s) => s.pontos.filter((p) => p != null));
    if (!vals.length) return '<p class="muted small">Sem compras por cilindro deste gás no período.</p>';
    let lo = Math.min(...vals), hi = Math.max(...vals);
    const pad = (hi - lo) * 0.12 || hi * 0.1;
    lo = Math.max(0, Math.floor((lo - pad) / 50) * 50); hi = Math.ceil((hi + pad) / 50) * 50;
    const bw = (W - pl - pr) / 12;
    const x = (i) => pl + i * bw + bw / 2, y = (v) => pt + (H - pt - pb) * (1 - (v - lo) / (hi - lo));
    const grade = [0, 0.25, 0.5, 0.75, 1].map((k) => { const v = lo + (hi - lo) * k; return `<line class="gv-grid" x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}"/><text class="gv-ax" x="${pl - 8}" y="${y(v) + 3}" text-anchor="end">R$ ${Math.round(v)}</text>`; }).join('');
    const eixo = MESES.map((m, i) => `<text class="gv-ax" x="${x(i)}" y="${H - 6}" text-anchor="middle">${m}</text>`).join('');
    const linhas = series.map((s) => {
      const c = cor(s.fornecedor);
      let d = '', pen = false;
      s.pontos.forEach((p, i) => { if (p == null) return; d += (pen ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(p).toFixed(1) + ' '; pen = true; });
      const pts = s.pontos.map((p, i) => (p == null ? '' : `<g ${tip(`${s.fornecedor} · ${MESES[i]}: ${reais(p)}/cil.${s.salto[i] ? ' · variação acima de 10%' : ''}`)}><circle class="gv-hitc" cx="${x(i)}" cy="${y(p)}" r="11"/>${s.salto[i] ? `<circle class="gv-alarm" cx="${x(i)}" cy="${y(p)}" r="7.5"/>` : ''}<circle class="gv-dot gv-${c}-dot" cx="${x(i)}" cy="${y(p)}" r="4"/></g>`)).join('');
      return `<path class="gv-line gv-${c}-line" d="${d}"/>${pts}`;
    }).join('');
    return `<svg class="gv" viewBox="0 0 ${W} ${H}" role="img" aria-label="Preço médio por cilindro por mês">${grade}${eixo}${linhas}</svg>`;
  }

  function legenda(itens) {
    return `<div class="gl">${itens.map(([nome, cls]) => `<span><i class="${cls}"></i>${esc(nome)}</span>`).join('')}</div>`;
  }

  function tabela(rows, cols) {
    return `<div class="tw"><table><thead><tr>${cols.map((c) => `<th class="${c.r ? 'r' : ''}">${c.t}</th>`).join('')}</tr></thead><tbody>${
      rows.length ? rows.map((r) => `<tr>${cols.map((c) => `<td class="${c.r ? 'r num' : ''}">${c.f(r)}</td>`).join('')}</tr>`).join('')
        : `<tr><td colspan="${cols.length}" class="muted">Nada para mostrar com esses filtros.</td></tr>`}</tbody></table></div>`;
  }

  const sec = (id, titulo, desc) => `<div class="gs-head" id="gas-${id}"><h2>${titulo}</h2>${desc ? `<p>${desc}</p>` : ''}</div>`;
  const kpi = (label, valor, apoio, icone, tom) =>
    `<div class="card gas-kpi"><div><span class="k-l">${label}</span><b class="k-v ${tom || ''}">${valor}</b><span class="k-s">${apoio}</span></div>${svg(ICONES[icone], tom || '')}</div>`;

  function vGasesView() {
    const v = V();
    const L = S.gasl || [], P = S.gasp || [], B = S.gasb || [];
    if (!L.length && !P.length && !B.length) {
      const carregando = !S.loaded.gasl;
      return `<div class="gas-root"><div class="gas-head"><div><h1>Controle de gases</h1></div></div><div class="card" style="display:grid;gap:8px">${carregando
        ? '<span class="muted">Carregando…</span>'
        : '<b>Nenhum dado de gases ainda.</b><div class="muted">Use o botão "Importar" no topo do módulo Operações e escolha os arquivos da Central de Controle de Gases: lançamentos, pendências e boletos (pode escolher os três juntos).</div>'}</div></div>`;
    }
    const f = v.f;
    const Lf = filtrar(L, f);
    const R = resumo(Lf);
    const ano = anoBase(L);
    const hoje = hojeISO();
    const corF = corFornecedores(L);
    const cf = (k) => corF.get(k) || 'sx';
    const pAbertas = P.filter((p) => String(p.situacao).toUpperCase() === 'ABERTA');
    const bAbertos = B.filter((b) => !b.pago);
    const prazo = boletosPorPrazo(B, hoje);
    const porObra = agrupar(Lf, 'obra');
    const porForn = agrupar(Lf, 'fornecedor');
    const porGas = agrupar(Lf, 'gas');
    const ult = ultimoMes(Lf);
    const lider = porObra[0];
    const filtrosAtivos = Object.entries(f).filter(([k, x]) => x && k !== 'q');

    // Cabeçalho com a frase-resumo, como no painel original
    const head = `<div class="gas-head"><div>
        <h1>Controle de gases <span class="gas-ano">${ano || ''}</span></h1>
        <p class="gas-lead">Gasto acumulado de <b>${reais(R.valor)}</b> em <b>${R.obras}</b> obras/locais.${lider ? ` <b>${esc(lider.k)}</b> lidera com <b>${pctTxt(R.valor ? lider.valor / R.valor : 0)}</b> do total.` : ''}</p>
      </div>
      <nav class="gas-nav" aria-label="Seções">${[['visao', 'Visão geral'], ['obras', 'Obras'], ['forn', 'Fornecedores e preços'], ['qual', 'Qualidade e pendências'], ['reg', 'Registros']].map(([id, t]) => `<button data-gasir="${id}">${t}</button>`).join('')}</nav>
    </div>`;

    const fonte = ['', 'PLANILHA', 'NF'].map((k) => `<button class="${(f.fonte || '') === k ? 'on' : ''}" data-gasfonte="${k}">${k ? (k === 'NF' ? 'NF' : 'Planilha') : 'Todas'}</button>`).join('');
    const filtros = `<div class="card gas-filtros">
      <label class="f"><span>Mês</span><select data-gasf="mes">${`<option value="">Todos os meses</option>` + MESES.map((m, i) => `<option value="${i + 1}" ${String(f.mes) === String(i + 1) ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
      <label class="f"><span>Obra/local</span><select data-gasf="obra">${opts(uniq(L, 'obra'), f.obra, 'Todas as obras')}</select></label>
      <label class="f"><span>Fornecedor</span><select data-gasf="fornecedor">${opts(uniq(L, 'fornecedor'), f.fornecedor, 'Todos os fornecedores')}</select></label>
      <label class="f"><span>Gás</span><select data-gasf="gas">${opts(uniq(L, 'gas'), f.gas, 'Todos os gases')}</select></label>
      <div class="f"><span class="gas-flabel">Fonte</span><div class="tabs gas-seg">${fonte}</div></div>
      <button class="btn sm gas-limpar" data-gas="limpar" ${filtrosAtivos.length ? '' : 'disabled'}>Limpar filtros${filtrosAtivos.length ? ` (${filtrosAtivos.length})` : ''}</button>
    </div>`;

    const varTxt = ult && ult.variacao != null
      ? `<span class="k-delta ${ult.variacao < 0 ? 'down' : 'up'}">${ult.variacao < 0 ? '▼' : '▲'} ${pctTxt(Math.abs(ult.variacao))}</span> vs mês anterior`
      : 'sem mês anterior';
    const kpis = `<div class="gas-kpis">
      ${kpi('Gasto total', reais(R.valor), filtrosAtivos.length ? 'período filtrado' : 'no ano' + (R.desconsiderado ? ` · ${reais(R.desconsiderado)} fora` : ''), 'wallet', 'acc')}
      ${kpi('Cilindros', R.cilindros.toLocaleString('pt-BR'), 'considerados no total', 'cylinder')}
      ${kpi('Custo médio por cilindro', reais(R.custoMedio), 'média ponderada', 'tag')}
      ${kpi(ult ? `Último mês: ${ult.nome}` : 'Último mês', ult ? reais(ult.valor) : '—', varTxt, 'calendar')}
      ${kpi('Obras/locais ativos', R.obras, `${R.n} lançamentos`, 'building')}
      ${kpi('Pendências abertas', pAbertas.length, `${R.revisar} linhas em revisar`, 'checks', pAbertas.length ? 'warn' : '')}
    </div>`;

    const meses = porMesGas(filtrar(L, { ...f, mes: '' }));
    const visao = `${sec('visao', 'Visão geral')}
      ${kpis}
      <div class="card gas-chart">
        <div class="gas-ct"><div><h3>Gasto mensal por gás</h3>${legenda(GAS_SERIES.map(([, nome, s]) => [nome, s]))}</div><span class="gas-hint">Clique numa barra para filtrar o mês</span></div>
        ${graficoMensal(meses, f.mes)}
        <div class="gas-sub"><span class="gas-sub-t">Cilindros por mês</span>${graficoCilindros(meses)}</div>
      </div>
      <div class="gas-2">
        <div class="card"><div class="gas-ct"><h3>Mix de gases</h3><span class="gas-hint">Clique para filtrar</span></div>${barrasH(porGas, R.valor, 'gas', (k) => { const g = grupoGas(k); return g === 'argonio' ? 's1' : g === 'argonio50' ? 's2' : 's3'; })}</div>
        <div class="card"><div class="gas-ct"><h3>Boletos</h3><span class="gas-hint">Vencimentos não somam no gasto</span></div>
          <div class="gas-prazos">
            <div class="gp ${prazo.vencidos.n ? 'bad' : ''}"><span>Vencidos</span><b>${reais(prazo.vencidos.valor)}</b><em>${prazo.vencidos.n} boleto(s)</em></div>
            <div class="gp ${prazo.ate7.n ? 'warn' : ''}"><span>Até 7 dias</span><b>${reais(prazo.ate7.valor)}</b><em>${prazo.ate7.n} boleto(s)</em></div>
            <div class="gp"><span>Até 30 dias</span><b>${reais(prazo.ate30.valor)}</b><em>${prazo.ate30.n} boleto(s)</em></div>
          </div>
          ${bAbertos.length ? `<ul class="gas-bl">${[...bAbertos].sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento))).slice(0, 4).map((b) => { const s = boletoSituacao(b, hoje); return `<li><span><b>${esc(b.beneficiario || b.documento)}</b><span class="muted">${esc(b.documento)} · vence ${dbr(b.vencimento)}</span></span><span class="r"><b>${reais(b.valor)}</b><span class="pill ${s.k === 'vencido' ? 'p-NAO' : 'p-AVALIAR'}">${esc(s.txt)}</span></span></li>`; }).join('')}</ul>` : '<p class="muted small">Nenhum boleto em aberto.</p>'}
        </div>
      </div>`;

    const obrasTop = porObra.slice(0, 15).map((o) => o.k);
    const obras = `${sec('obras', 'Obras e locais')}
      <div class="card"><div class="gas-ct"><h3>Ranking por gasto</h3><span class="gas-hint">${porObra.length > 15 ? 'Top 15 · ' : ''}clique para filtrar a obra</span></div>${barrasH(porObra, R.valor, 'obra', () => 's1', 15)}</div>
      <div class="card"><div class="gas-ct"><h3>Mapa de calor: obra × mês</h3><span class="gas-hint">Intensidade = gasto no mês</span></div>${mapaCalor(calor(filtrar(L, { ...f, mes: '' }), obrasTop), f.mes)}</div>`;

    const gasPreco = gasPrecoAtual(v);
    const series = precoMensal(Lf, gasPreco);
    const forn = `${sec('forn', 'Fornecedores e preços')}
      <div class="gas-2 gas-2b">
        <div class="card"><div class="gas-ct"><h3>Participação no gasto</h3><span class="gas-hint">Clique para filtrar</span></div>${R.valor ? rosca(porForn, R.valor, cf) : '<p class="muted small">Sem gasto no período.</p>'}</div>
        <div class="card"><div class="gas-ct"><div><h3>Preço médio por cilindro</h3>${legenda(series.map((s) => [s.fornecedor, cf(s.fornecedor)]))}</div>
          <div class="tabs gas-seg">${GASES_PRECO.map((g) => `<button class="${gasPreco === g ? 'on' : ''}" data-gaspreco="${g}">${g}</button>`).join('')}</div></div>
          ${graficoPreco(series, cf)}
          <p class="gas-nota"><span class="gas-ring"></span> Anel vermelho: variação acima de 10% em relação à compra anterior do mesmo fornecedor.</p>
        </div>
      </div>
      <div class="card"><h3 style="margin-bottom:2px">Preço por cilindro no período</h3><p class="small muted" style="margin:0 0 12px">Média ponderada pela quantidade, com o menor e o maior preço pago. Cobranças por m³/kg ficam de fora.</p>${tabela(precos(Lf), [
        { t: 'Gás', f: (r) => esc(r.gas) },
        { t: 'Fornecedor', f: (r) => `<span class="gl-dot ${cf(r.fornecedor)}"></span>${esc(r.fornecedor)}` },
        { t: 'Cilindros', r: 1, f: (r) => r.cilindros },
        { t: 'Média', r: 1, f: (r) => reais(r.media) },
        { t: 'Menor', r: 1, f: (r) => reais(r.min) },
        { t: 'Maior', r: 1, f: (r) => reais(r.max) }])}</div>`;

    const al = alertas(Lf);
    const mot = motivos(Lf);
    const motMax = Math.max(1, ...mot.map((m) => m.n));
    const qual = `${sec('qual', 'Qualidade dos dados e pendências')}
      <div class="gas-2">
        <div class="card"><div class="gas-ct"><h3>Alertas automáticos</h3><span class="gas-hint">${al.length} alerta(s)</span></div>
          ${al.length ? `<ul class="gas-al">${al.slice(0, v.alLim || 6).map((a) => `<li class="${a.tipo}">${svg(ICONES[a.tipo === 'preco' ? 'alert' : 'trend'])}<div><span>${esc(a.titulo)}</span><p>${esc(a.texto)}</p></div></li>`).join('')}</ul>${al.length > (v.alLim || 6) ? '<button class="btn sm" data-gas="mais-alertas">Ver todos os alertas</button>' : ''}` : '<p class="muted small">Nenhum preço fora do padrão no último mês.</p>'}
        </div>
        <div class="card"><div class="gas-ct"><h3>Linhas a revisar por motivo</h3><span class="gas-hint">${R.revisar} linha(s) considerada(s)</span></div>
          ${mot.length ? `<div class="gm">${mot.map((m) => `<button class="gm-row" data-gasmotivo="${esc(m.k)}" ${tip(`${m.k}: ${m.n} linha(s) · clique para ver`)}><span>${esc(m.k)}</span><span class="gh-bar"><i class="warn" style="width:${Math.max(1.5, (m.n / motMax) * 100)}%"></i></span><b>${m.n}</b></button>`).join('')}</div>` : '<p class="muted small">Nenhuma linha a revisar.</p>'}
        </div>
      </div>`;

    const tab = (k, t, c) => `<button class="${v.tab === k ? 'on' : ''}" data-gastab="${k}">${t}${c != null ? ` <span class="gas-cnt">${c}</span>` : ''}</button>`;
    const tabs = `<div class="tabs">${tab('lanc', 'Lançamentos', Lf.length)}${tab('pend', 'Pendências', pAbertas.length)}${tab('bol', 'Boletos', bAbertos.length)}</div>`;

    let corpo = '';
    if (v.tab === 'lanc') {
      const rows = [...Lf].sort((a, b) => n(b.mes) - n(a.mes) || String(b.data || '').localeCompare(String(a.data || '')));
      corpo = `<div class="row"><input type="search" id="gas-q" placeholder="Buscar por referência, obra, fornecedor, gás ou motivo" value="${esc(f.q || '')}" style="max-width:420px">
          <label class="f gas-inline"><span>Situação</span><select data-gasf="status">${opts(['OK', 'REVISAR'], f.status, 'Todas')}</select></label></div>` +
        tabela(rows.slice(0, v.lim), [
          { t: 'Data', f: (l) => (l.data ? dbr(l.data) : '<span class="muted">sem data</span>') + (dataSuspeita(l, ano) ? ' <span class="pill p-AVALIAR" title="Ano diferente dos demais lançamentos: confira a data na planilha">ano?</span>' : '') },
          { t: 'Ref.', f: (l) => esc(l.ref) + `<div class="small muted">${esc(l.fonte || '')}</div>` },
          { t: 'Obra', f: (l) => esc(l.obra) },
          { t: 'Fornecedor', f: (l) => `<span class="gl-dot ${cf(l.fornecedor)}"></span>${esc(l.fornecedor)}` },
          { t: 'Gás', f: (l) => esc(l.gas) },
          { t: 'Cil.', r: 1, f: (l) => n(l.cilindros) || '—' },
          { t: 'Preço', r: 1, f: (l) => (n(l.preco_cil) ? reais(l.preco_cil) : `<span class="small muted">${esc(l.base_preco || '')}</span>`) },
          { t: 'Valor', r: 1, f: (l) => `<span style="${considera(l) ? '' : 'text-decoration:line-through;color:var(--muted)'}">${reais(l.valor)}</span>` },
          { t: 'Situação', f: (l) => pillSt(l.status) + (l.motivo ? `<div class="small muted" style="max-width:280px">${esc(l.motivo)}</div>` : '') },
          { t: 'Entra no total', f: (l) => podeEditar()
            ? `<select data-gascons="${esc(l.id)}" aria-label="Entra no total"><option value="SIM" ${considera(l) ? 'selected' : ''}>Sim</option><option value="NÃO" ${considera(l) ? '' : 'selected'}>Não</option></select>${l.considerarAjuste ? '<div class="small muted">ajustado</div>' : ''}`
            : considera(l) ? 'Sim' : 'Não' },
        ]) + (rows.length > v.lim ? `<div class="row"><span class="muted small">Mostrando ${v.lim} de ${rows.length}.</span><button class="btn sm" data-gas="mais">Mostrar mais</button></div>` : '');
    } else if (v.tab === 'pend') {
      const ord = [...P].sort((a, b) => (String(a.situacao) === 'ABERTA' ? 0 : 1) - (String(b.situacao) === 'ABERTA' ? 0 : 1) || n(a.id) - n(b.id));
      corpo = `<div class="gas-pends">${ord.length ? ord.map((p) => {
        const aberta = String(p.situacao).toUpperCase() === 'ABERTA';
        return `<div class="gas-pend ${aberta ? '' : 'feita'}">
          <div class="row" style="gap:8px"><b>${esc(p.pendencia)}</b><span class="pill ${aberta ? 'p-AVALIAR' : 'p-CONTRATAR'}">${aberta ? 'Aberta' : 'Resolvida'}</span><span class="sp"></span><span class="small muted">${esc(p.tipo || '')} · ${esc(p.referencia || '')} · ${esc(p.fornecedor || '')}</span></div>
          <div class="gas-acao">${esc(p.acao || '')}</div>
          ${aberta
            ? podeEditar() ? `<div class="row"><input type="text" data-gasnota="${esc(p.id)}" placeholder="O que foi decidido (opcional)" value="${esc(v.notas[p.id] || '')}" style="flex:1;min-width:220px"><button class="btn sm pri" data-gasresolver="${esc(p.id)}">Marcar como resolvida</button></div>` : ''
            : `<div class="small muted">${esc(p.resolucao || 'Sem observação')}${p.resolvidoPor ? ' · ' + esc(p.resolvidoPor) : ''}${p.resolvidoEm ? ' em ' + dbr(String(p.resolvidoEm).slice(0, 10)) : ''}${podeEditar() ? ` · <a href="#" data-gasreabrir="${esc(p.id)}">reabrir</a>` : ''}</div>`}
        </div>`;
      }).join('') : '<p class="muted">Nenhuma pendência importada.</p>'}</div>`;
    } else {
      const ord = [...B].sort((a, b) => (a.pago ? 1 : 0) - (b.pago ? 1 : 0) || String(a.vencimento).localeCompare(String(b.vencimento)));
      corpo = tabela(ord, [
        { t: 'Documento', f: (b) => esc(b.documento) },
        { t: 'Beneficiário', f: (b) => esc(b.beneficiario) },
        { t: 'NF', f: (b) => esc(b.nf || '—') },
        { t: 'Vencimento', f: (b) => dbr(b.vencimento) },
        { t: 'Valor', r: 1, f: (b) => reais(b.valor) },
        { t: 'Situação', f: (b) => { const s = boletoSituacao(b, hoje); return `<span class="pill ${s.k === 'pago' ? 'p-CONTRATAR' : s.k === 'vencido' ? 'p-NAO' : 'p-AVALIAR'}">${esc(s.txt)}</span>`; } },
        { t: '', f: (b) => (podeEditar() ? (b.pago ? `<button class="btn sm" data-gaspago="${esc(b.id)}" data-v="0">Desfazer baixa</button>` : `<button class="btn sm pri" data-gaspago="${esc(b.id)}" data-v="1">Dar baixa</button>`) : '') },
      ]);
    }
    const registros = `${sec('reg', 'Registros', 'Lançamentos, pendências e boletos importados, com as ações de cada um.')}<div class="card gas-sec">${tabs}${corpo}</div>`;

    ligarDica();
    return `<div class="gas-root">${head}${roText()}${filtros}${visao}${obras}${forn}${qual}${registros}</div>`;
  }

  /* Dica ao passar o mouse (uma só, reaproveitada) */
  function ligarDica() {
    if (root._gasTip) return;
    root._gasTip = true;
    const el = document.createElement('div');
    el.className = 'gas-tip';
    el.setAttribute('role', 'tooltip');
    document.body.appendChild(el);
    const mostrar = (e) => {
      const t = e.target.closest && e.target.closest('[data-tip]');
      if (!t || !t.closest('.gas-root')) { el.style.opacity = 0; return; }
      el.textContent = t.getAttribute('data-tip');
      const x = Math.min(e.clientX + 14, window.innerWidth - el.offsetWidth - 8);
      const y = e.clientY + 16 + el.offsetHeight > window.innerHeight ? e.clientY - el.offsetHeight - 12 : e.clientY + 16;
      el.style.transform = `translate(${x}px,${y}px)`;
      el.style.opacity = 1;
    };
    document.addEventListener('mousemove', mostrar, { passive: true });
    document.addEventListener('mouseleave', () => { el.style.opacity = 0; });
    document.addEventListener('scroll', () => { el.style.opacity = 0; }, { passive: true, capture: true });
  }

  /** Eventos da tela; devolve true quando tratou. Chamado pelos handlers de #main. */
  async function gasesEvent(e) {
    const t = e.target;
    const v = V();
    if (e.type === 'input') {
      if (t.id === 'gas-q') { v.f.q = t.value; v.lim = 100; clearTimeout(v._t); v._t = setTimeout(() => { render(); const q = document.getElementById('gas-q'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }, 300); return true; }
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
    const el = t.closest && t.closest('[data-gas],[data-gastab],[data-gasset],[data-gasir],[data-gasfonte],[data-gaspreco],[data-gasmotivo],[data-gasresolver],[data-gasreabrir],[data-gaspago]');
    if (!el) return false;
    e.preventDefault();
    const d = el.dataset;
    if (d.gasir) { const s = document.getElementById('gas-' + d.gasir); if (s) s.scrollIntoView({ behavior: 'smooth', block: 'start' }); return true; }
    if (d.gastab) { v.tab = d.gastab; render(); return true; }
    if (d.gasset) {
      const i = d.gasset.indexOf(':');
      const k = d.gasset.slice(0, i), val = d.gasset.slice(i + 1);
      v.f[k] = String(v.f[k]) === val ? '' : val; // clicar de novo tira o filtro
      v.lim = 100; render(); return true;
    }
    if (d.gasfonte != null) { v.f.fonte = d.gasfonte; render(); return true; }
    if (d.gaspreco) { v.gasPreco = d.gaspreco; render(); return true; }
    if (d.gasmotivo) {
      v.f.status = 'REVISAR'; v.f.q = d.gasmotivo; v.tab = 'lanc'; render();
      const s = document.getElementById('gas-reg'); if (s) s.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return true;
    }
    if (d.gas === 'limpar') { v.f = {}; render(); return true; }
    if (d.gas === 'mais') { v.lim += 200; render(); return true; }
    if (d.gas === 'mais-alertas') { v.alLim = 999; render(); return true; }
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
