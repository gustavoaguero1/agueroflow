/* Ponto → Diário: sugestão de linha do Diário a partir das horas do ponto (ops_orgs/{org}/ponto_dia/{dia}).
   O servidor grava ponto_dia; aqui só traduzimos para o formato da linha do Diário. */
(function () {
  function sugestao(pontoDia, colab, obras) {
    if (!pontoDia || !pontoDia.linhas || !colab || !colab.rhId) return null;
    var s = pontoDia.linhas[colab.rhId];
    if (!s) return null;
    var obra = '';
    if (s.obra) {
      var o = (obras || []).find(function (x) { return x.unitId === s.obra; });
      obra = o ? o.id : '';
    }
    var horarios = (s.marcacoes || []).join(' ');
    if (s.incompleto) {
      return { obra: obra, sit: '', hn: '', h50: '', h100: '', obs: 'ponto incompleto: ' + horarios, doPonto: true, incompleto: true };
    }
    return { obra: obra, sit: 'Trabalhou', hn: s.hn, h50: s.h50, h100: s.h100, obs: 'ponto: ' + horarios, doPonto: true, incompleto: false };
  }
  /** Linha já lançada no Diário com horas diferentes das do ponto (dia completo). */
  function diverge(pontoDia, colab, linha) {
    if (!pontoDia || !pontoDia.linhas || !colab || !colab.rhId || !linha) return false;
    var s = pontoDia.linhas[colab.rhId];
    if (!s || s.incompleto) return false;
    var n = function (v) { var x = Number(v); return isFinite(x) ? Math.round(x * 100) / 100 : 0; };
    return n(linha.hn) !== n(s.hn) || n(linha.h50) !== n(s.h50) || n(linha.h100) !== n(s.h100);
  }
  window.PontoDiario = { sugestao: sugestao, diverge: diverge };
})();
