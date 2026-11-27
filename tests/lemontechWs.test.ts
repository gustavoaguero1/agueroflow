import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSoapEnvelope,
  parsePesquisarSolicitacao,
  readLemontechConfig,
  createWsSelfBookingClient,
  LEMONTECH_ENDPOINTS,
} from '../server/lemontech/wsSelfBooking';

const creds = { userName: 'conector', userPassword: 's3<cr&t', keyClient: 'KEY1' };

test('envelope leva o header de autenticação no namespace da Lemontech e escapa XML', () => {
  const xml = buildSoapEnvelope('pesquisarSolicitacao', { idSolicitacao: '123' }, creds);
  assert.match(xml, /xmlns:ser="http:\/\/lemontech\.com\.br\/selfbooking\/wsselfbooking\/services"/);
  assert.match(xml, /<ser:userName>conector<\/ser:userName>/);
  assert.match(xml, /<ser:userPassword>s3&lt;cr&amp;t<\/ser:userPassword>/);
  assert.match(xml, /<ser:keyClient>KEY1<\/ser:keyClient>/);
  assert.match(xml, /<ser:pesquisarSolicitacao>\s*<idSolicitacao>123<\/idSolicitacao>\s*<\/ser:pesquisarSolicitacao>/);
});

test('envelope serializa objetos aninhados e ignora campos vazios', () => {
  const xml = buildSoapEnvelope('aprovarSolicitacao', {
    idSolicitacaoRef: { id: '9' }, aprovador: { matricula: 'M1' }, controleCliente: undefined,
  }, creds);
  assert.match(xml, /<idSolicitacaoRef><id>9<\/id><\/idSolicitacaoRef>/);
  assert.match(xml, /<aprovador><matricula>M1<\/matricula><\/aprovador>/);
  assert.doesNotMatch(xml, /controleCliente/);
});

const RESPOSTA = `<?xml version="1.0"?>
<S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/">
 <S:Body><ns2:pesquisarSolicitacaoResponse xmlns:ns2="http://lemontech.com.br/selfbooking/wsselfbooking/services">
  <solicitacao>
   <idSolicitacao>555</idSolicitacao><status>CONCLUIDA</status>
   <centroDeCusto><codigo>1040/24</codigo><nome>Yakult Lorena</nome></centroDeCusto>
   <passageiros><passageiro><nome>Ana</nome><matricula>M1</matricula></passageiro></passageiros>
   <aereos><aereo><valorTotal>812.40</valorTotal></aereo></aereos>
  </solicitacao>
  <solicitacao><idSolicitacao>556</idSolicitacao><status>CANCELADA</status></solicitacao>
 </ns2:pesquisarSolicitacaoResponse></S:Body></S:Envelope>`;

test('parse da resposta devolve lista de solicitações sem prefixos de namespace', () => {
  const lista = parsePesquisarSolicitacao(RESPOSTA);
  assert.equal(lista.length, 2);
  assert.equal(lista[0].idSolicitacao, '555');
  assert.equal(lista[0].status, 'CONCLUIDA');
  assert.equal(lista[0].centroDeCusto.codigo, '1040/24');
  assert.equal(lista[1].status, 'CANCELADA');
});

test('parse de uma solicitação única também vira lista; resposta vazia vira []', () => {
  const uma = RESPOSTA.replace(/<solicitacao><idSolicitacao>556[\s\S]*?<\/solicitacao>/, '');
  assert.equal(parsePesquisarSolicitacao(uma).length, 1);
  const vazia = '<S:Envelope xmlns:S="x"><S:Body><ns2:pesquisarSolicitacaoResponse xmlns:ns2="y"/></S:Body></S:Envelope>';
  assert.deepEqual(parsePesquisarSolicitacao(vazia), []);
});

test('SOAP Fault vira erro com a mensagem da Lemontech', () => {
  const fault = '<S:Envelope xmlns:S="x"><S:Body><S:Fault><faultcode>S:Server</faultcode><faultstring>Usuário inválido</faultstring></S:Fault></S:Body></S:Envelope>';
  assert.throws(() => parsePesquisarSolicitacao(fault), /Usuário inválido/);
});

test('config: sem os três secrets fica desligado; ambiente padrão é produção', () => {
  assert.equal(readLemontechConfig({}), null);
  assert.equal(readLemontechConfig({ LEMONTECH_WS_USER: 'a', LEMONTECH_WS_PASSWORD: 'b' }), null);
  const cfg = readLemontechConfig({ LEMONTECH_WS_USER: 'a', LEMONTECH_WS_PASSWORD: 'b', LEMONTECH_WS_KEYCLIENT: 'c' });
  assert.equal(cfg?.endpoint, LEMONTECH_ENDPOINTS.producao);
  const tr = readLemontechConfig({ LEMONTECH_WS_USER: 'a', LEMONTECH_WS_PASSWORD: 'b', LEMONTECH_WS_KEYCLIENT: 'c', LEMONTECH_WS_ENV: 'treinamento' });
  assert.equal(tr?.endpoint, LEMONTECH_ENDPOINTS.treinamento);
});

test('cliente faz POST text/xml no endpoint e devolve solicitações', async () => {
  const chamadas: any[] = [];
  const fakeFetch = async (url: string, init: any) => {
    chamadas.push({ url, init });
    return { ok: true, status: 200, text: async () => RESPOSTA } as any;
  };
  const client = createWsSelfBookingClient({ endpoint: 'https://x/ws', creds }, fakeFetch as any);
  const lista = await client.pesquisarSolicitacao({ dataInicial: '2026-11-01', dataFinal: '2026-11-26' });
  assert.equal(lista.length, 2);
  assert.equal(chamadas[0].url, 'https://x/ws');
  assert.equal(chamadas[0].init.method, 'POST');
  assert.match(chamadas[0].init.headers['Content-Type'], /text\/xml/);
  assert.match(chamadas[0].init.body, /<dataInicial>2026-11-01<\/dataInicial>/);
});

test('cliente limita quantidadeRegistros a 50 (limite da API)', async () => {
  let body = '';
  const fakeFetch = async (_u: string, init: any) => { body = init.body; return { ok: true, status: 200, text: async () => RESPOSTA } as any; };
  const client = createWsSelfBookingClient({ endpoint: 'https://x/ws', creds }, fakeFetch as any);
  await client.pesquisarSolicitacao({ dataInicial: '2026-11-01', dataFinal: '2026-11-26', quantidadeRegistros: 500 });
  assert.match(body, /<quantidadeRegistros>50<\/quantidadeRegistros>/);
});
