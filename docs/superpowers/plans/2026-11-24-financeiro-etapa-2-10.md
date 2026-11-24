# Financeiro — Etapa 2.10: Contas a Receber

## Objetivo
Adicionar um controle interno de valores de clientes a receber e permitir a conferência dos créditos importados na Etapa 2.9, preservando o desenho multiempresa e o razão imutável do financeiro.

## Escopo funcional
1. Cadastrar manualmente uma conta a receber com cliente, documento de referência, valor original, vencimento e vínculos opcionais a contrato/proposta.
2. Registrar recebimentos parciais ou totais com data, valor efetivamente creditado, forma, referência bancária/comprovante, observações e responsável.
3. Exibir o valor original, dinheiro já recebido e saldo restante; um título só passa a Recebido quando o saldo chega a zero.
4. Sugerir recebimentos para créditos de extrato somente quando o valor em dinheiro for idêntico e as datas estiverem a até sete dias.
5. Exigir confirmação humana antes de gravar a conciliação. Uma associação não pode ser feita duas vezes.

## Modelo de dados
- `finance_receivables`: título original e acumuladores do saldo. O valor original não é alterado após a criação pelo cliente.
- `finance_receivable_receipts`: razão append-only. Cada recebimento tem uma chave de idempotência, snapshot do título, saldo antes/depois, data, forma e responsável.
- `finance_bank_reconciliations`: vínculo append-only com `matchType: 'receivable'`, `transactionId`, `receiptId` e snapshots de ambos os lados.

O dinheiro recebido é sempre o valor efetivamente creditado. Não há desconto/abatimento automático na Conta a Receber nesta etapa.

## Segurança e integridade
- Todas as consultas do cliente filtram por `orgId`; o backend confere a empresa novamente.
- Criar recebíveis exige Admin/Gerente/Supervisor com Financeiro nível 2.
- Registrar recebimentos exige Financeiro nível 1 para Supervisor e nível 2 para Admin/Gerente, seguindo a política de baixas do Contas a Pagar.
- O evento e os acumuladores são escritos na mesma transação do Firestore. Chaves repetidas com o mesmo conteúdo retornam replay; chave reutilizada com conteúdo diferente é conflito.
- O cliente não pode editar saldo/status, editar/excluir eventos ou criar conciliações diretamente.
- Conciliação exige crédito, empresa idêntica e valor exato em centavos. O mesmo lançamento não pode ser conciliado novamente; o mesmo recebimento não pode ser vinculado a outro crédito.

## Fora de escopo
Não emitir NF-e, boleto ou cobrança; não executar transferências; não chamar banco; não fazer baixa fiscal ou integração de escrita com Protheus; não gerar títulos automaticamente a partir de propostas/contratos; não substituir o processo contábil.

## Critérios de aceite
- Cadastro de recebível respeita empresa e permissão.
- Um título de R$ 1.000,00 com R$ 200,00 já recebido aceita R$ 300,00 e passa a ter saldo de R$ 500,00.
- Uma nova operação que recebe os R$ 500,00 restantes fecha o título sem alterar o valor original.
- Reenvio da mesma operação não duplica o evento nem aumenta novamente o acumulado.
- Valor superior ao saldo é recusado.
- Evento de recebimento é imutável para clientes.
- Um crédito só pode ser conciliado manualmente com evento de recebimento de mesmo valor; a conciliação não altera título nem evento.
- Testes unitários, de rota e do emulador Firestore devem cobrir validação, idempotência, saldo, isolamento e imutabilidade.

## Dependência de integração
Esta etapa foi desenvolvida em branch baseada em `feature/etapa-2-9-conciliacao-bancaria` e deve ser integrada após a PR #33, que introduz a importação dos extratos e o vínculo dos débitos com pagamentos.
