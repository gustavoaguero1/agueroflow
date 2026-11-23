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
