/*
 * Exporta TODOS os dados do "Aguero Inox 2.0" (artefato do Claude) para um arquivo .json
 * que o AgueroFlow importa em Operações → "Importar dados do Inox".
 *
 * Como usar (de preferência com a conta do DONO do artefato, que enxerga também os salários):
 *  1. Abra o link do Inox no Chrome, já logado, e espere a tela carregar.
 *  2. Aperte F12 → aba "Console".
 *  3. No seletor de contexto no topo do Console (onde está escrito "top"), escolha o
 *     quadro do Inox (o endereço termina em claudeusercontent.com).
 *  4. Cole este script inteiro e aperte Enter. Ao terminar, baixa "inox-backup-AAAA-MM-DD.json".
 *     Se o download for bloqueado, o conteúdo vai para a área de transferência: cole num
 *     arquivo de texto e salve como .json.
 */
(async () => {
  if (typeof claude === 'undefined') { console.error('Escolha o contexto do Inox no seletor do Console (passo 3).'); return; }
  const db = await claude.use('db');
  if (!db) { console.error('Sem acesso à base: entre na conta do Claude e recarregue o Inox.'); return; }

  const COLECOES = ['passagens', 'candidatos', 'indicacoes', 'colaboradores', 'obras', 'direcionamentos', 'tarefas',
    'notificacoes', 'economias', 'reemb_notas', 'reemb_lotes', 'vales', 'diario', 'viagens', 'contatos',
    'fat_pedidos', 'fat_nfs', 'fat_cobrancas', 'membros', 'salarios'];
  const DOCS = ['config/params', 'config/diario', 'config/fatSeed'];
  const ARQUIVOS = ['historico.json', 'lote2.json', 'fat_seed.json'];

  const once = (ref) => new Promise((res) => {
    let u = null;
    const t = setTimeout(() => res({ erro: 'sem resposta em 30 s' }), 30000);
    try {
      u = ref.onSnapshot((s) => { clearTimeout(t); res(s); setTimeout(() => { try { typeof u === 'function' && u(); } catch (e) {} }, 0); },
        (e) => { clearTimeout(t); res({ erro: String((e && (e.code || e.message)) || e) }); });
    } catch (e) { clearTimeout(t); res({ erro: String(e && e.message || e) }); }
  });

  const out = { formato: 'aguero-inox-backup', versao: 1, geradoEm: new Date().toISOString(), colecoes: {}, docs: {}, arquivos: {}, anexos: {}, erros: [] };

  for (const c of COLECOES) {
    const s = await once(db.collection(c));
    if (s && s.docs) out.colecoes[c] = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    else out.erros.push(c + ': ' + (s && s.erro));
    console.log('📦', c, s && s.docs ? s.docs.length + ' registros' : 'ERRO ' + (s && s.erro));
  }
  for (const p of DOCS) {
    const s = await once(db.doc(p));
    out.docs[p] = s && s.exists ? s.data() : null;
  }
  for (const f of ARQUIVOS) {
    try { const r = await fetch(f); if (r.ok) { out.arquivos[f] = await r.json(); console.log('📄', f); } } catch (e) { out.erros.push(f + ': ' + e.message); }
  }

  // Anexos (fotos de CTPS, notas de reembolso, prints de NF): qualquer objeto com url + tipo/nome.
  const urls = new Set();
  const walk = (v) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (v && typeof v === 'object') {
      if (typeof v.url === 'string' && (v.tipo || v.nome) && !v.url.startsWith('blob:')) urls.add(v.url);
      Object.values(v).forEach(walk);
    }
  };
  walk(out.colecoes);
  const toDataUrl = (b) => new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.onerror = () => r(null); fr.readAsDataURL(b); });
  let i = 0;
  for (const u of urls) {
    i++;
    try {
      const b = await (await fetch(u)).blob();
      if (b.size <= 12 * 1024 * 1024) out.anexos[u] = await toDataUrl(b);
      else out.erros.push('anexo grande demais: ' + u);
    } catch (e) { out.erros.push('anexo: ' + u); }
    if (i % 10 === 0) console.log('🖼️ anexos', i + '/' + urls.size);
  }

  const txt = JSON.stringify(out);
  const nome = 'inox-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  console.log('✅ Pronto:', Object.keys(out.colecoes).length, 'coleções,', Object.keys(out.anexos).length, 'anexos,', (txt.length / 1048576).toFixed(1), 'MB.', out.erros.length ? 'Avisos: ' + out.erros.join(' | ') : '');
  try {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([txt], { type: 'application/json' }));
    a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  } catch (e) {}
  try { if (typeof copy === 'function') { copy(txt); console.log('📋 Também copiado para a área de transferência.'); } } catch (e) {}
})();
