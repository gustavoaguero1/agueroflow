# NDs salvas na pasta de rede do financeiro — design curto (aprovado em 23/11/2026)

**Por quê:** hoje alguém salva à mão cada PDF de ND na pasta do financeiro. O app já gera o PDF e envia por WhatsApp e e-mail. Falta esta etapa para fechar o fluxo.

**Destino:** `\\192.168.88.12\Financeiro - NDs a pagar\<aaaa>\<mm>.<aaaa>\<dd>.<mm>\`. Exemplo: vencimento 30/11/2026 vai para `2026\11.2026\30.11`. A pasta de **vencimento (pagamento)** é criada se não existir, assim como a do ano e a do mês.

**Restrição:** o servidor roda no Google Cloud e não alcança a rede interna. Abrir o servidor de arquivos para a internet está fora de questão.

**Abordagens:**
- **A (escolhida):** script PowerShell no PC do Gustavo, que fica ligado. Ele roda pelo Agendador de Tarefas a cada 2 minutos e busca as NDs pendentes no servidor, só com conexão de saída.
- **B:** Power Automate Desktop. Foi descartado por ser mais trabalhoso e frágil.
- **C:** migrar a pasta para o SharePoint. Foi descartado porque muda o lugar onde o financeiro trabalha.

**Como funciona:**
- O servidor expõe `/api/nd-export/pendentes`, `/api/nd-export/:id/pdf` e `/api/nd-export/:id/salvo`. São protegidos pela chave `ND_EXPORT_TOKEN` (Secret), enviada no cabeçalho `x-nd-export-token`. Essa chave não dá acesso a mais nada.
- **Uma ND está pendente** quando foi criada ou revisada depois do início da exportação e a revisão salva (`folderExportedRev`) é menor que a revisão atual.
  - O início é gravado em `data_nd_export_since.json` na primeira consulta. As NDs antigas não são despejadas na pasta.
- **Nome do arquivo:** é o `fileName` da ND. Quando a ND é revisada, o nome ganha ` - REVISADA (REV. n)` antes do `.pdf`.
- **O script:** cria as pastas que faltarem, grava o PDF e só então confirma o salvamento ao servidor. Se falhar, a ND continua pendente e vai na próxima rodada.

**Decisões minhas:** intervalo de 2 minutos; NDs com data de vencimento ilegível ficam fora da lista e aparecem no log; o script fica em `tools/agueroflow-nd-pasta.ps1`, com passo a passo em `docs/nd-pasta-rede.md`.

## Plano
1. `server/ndFolderExport.ts`, com testes: `ndFolderFor`, `exportFileName`, `isPendingExport` e um router com verificação da chave.
2. Ligar no `server.ts`: rota pública validada pela chave, `persistWaNdRecords` ao confirmar e `.env.example` atualizado.
3. Script PowerShell e guia de instalação.
4. Rodar `npm test`, `lint` e `build`, depois PR.
