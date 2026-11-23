# NDs salvas automaticamente na pasta do financeiro

Cada ND gerada pelo @aguero é salva em
`\\192.168.88.12\Financeiro - NDs a pagar\<ano>\<mês>.<ano>\<dia>.<mês>\`
(ex.: vencimento 30/11/2026 → `2026\11.2026\30.11`). Pastas que faltarem são criadas.
O AgueroFlow roda na nuvem e não enxerga a rede da empresa, então um script no seu PC (que fica ligado)
busca as NDs novas a cada 2 minutos. Só NDs geradas **depois** da ativação são salvas; uma ND revisada é salva de novo com "REVISADA" no nome.

## 1. Criar a chave (uma vez)
1. Invente uma senha longa (ex.: 40 letras e números aleatórios).
2. No **AI Studio → Secrets**, crie `ND_EXPORT_TOKEN` com essa senha e reinicie o servidor.

## 2. Preparar o seu PC (uma vez)
1. Copie `tools/agueroflow-nd-pasta.ps1` para `C:\AgueroFlow\agueroflow-nd-pasta.ps1`.
2. Abra o arquivo no Bloco de Notas e troque `https://SEU-APP.run.app` pelo endereço do app (o mesmo que você usa no navegador, sem `/` no fim).
3. Abra o **PowerShell** e rode (troque `SUA_CHAVE` pela senha do passo 1):
   ```powershell
   [Environment]::SetEnvironmentVariable("AGUEROFLOW_ND_TOKEN", "SUA_CHAVE", "User")
   ```
4. Teste uma vez, no mesmo PowerShell **fechado e aberto de novo**:
   ```powershell
   powershell -ExecutionPolicy Bypass -File C:\AgueroFlow\agueroflow-nd-pasta.ps1
   ```
   O resultado fica em `%LOCALAPPDATA%\agueroflow-nd-pasta.log` (abra com `notepad $env:LOCALAPPDATA\agueroflow-nd-pasta.log`).

## 3. Rodar sozinho a cada 2 minutos
No PowerShell:
```powershell
$a = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File C:\AgueroFlow\agueroflow-nd-pasta.ps1"
$t = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 2)
Register-ScheduledTask -TaskName "AgueroFlow - NDs na pasta" -Action $a -Trigger $t -Description "Salva as NDs do AgueroFlow na pasta do financeiro"
```
Para parar: `Unregister-ScheduledTask -TaskName "AgueroFlow - NDs na pasta"`.

## Se algo der errado
- **Nada aparece na pasta:** veja o log. "token de exportação inválido" = a chave do PC é diferente do Secret.
- **PC desligado:** as NDs ficam na fila e são salvas quando ele voltar.
- **ND com data de vencimento ilegível:** não é exportada (aparece no log do servidor); corrija a ND.
