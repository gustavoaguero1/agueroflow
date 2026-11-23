/* Ponte entre a página de Operações (iframe) e o AgueroFlow.
 * A página foi escrita sobre um runtime que expõe `claude.use(nome)`; aqui esse nome
 * é atendido pelo objeto `__agueroOps` que o OperationsModule publica na janela pai
 * (mesma origem). Fora do AgueroFlow, `use` devolve null e a página mostra o aviso de login. */
(function () {
  function bridge() {
    try {
      return window.parent && window.parent !== window ? window.parent.__agueroOps || null : null;
    } catch (e) {
      return null;
    }
  }
  function wait(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }
  window.claude = {
    use: async function (name) {
      for (var i = 0; i < 50; i++) {
        var b = bridge();
        if (b) return b[name] || null;
        await wait(100);
      }
      return null;
    },
  };
})();

/* Arquivos de apoio (historico.json, lote2.json, fat_seed.json): vêm do backup importado do Inox,
 * guardado no Storage da empresa; sem backup, tenta o arquivo estático ao lado da página. */
async function opsArquivo(nome) {
  var files = await window.claude.use('files');
  if (files) {
    var j = await files.get(nome);
    if (j != null) return j;
  }
  var r = await fetch(nome);
  if (!r.ok) throw new Error('arquivo ausente: ' + nome);
  return r.json();
}

/* Avisa o AgueroFlow quando a tela muda por um link interno, para o menu lateral acompanhar. */
window.addEventListener('hashchange', function () {
  try {
    var nav = window.parent && window.parent !== window ? window.parent.__agueroOpsNav : null;
    if (typeof nav === 'function') nav((location.hash || '#inicio').slice(1));
  } catch (e) {}
});
