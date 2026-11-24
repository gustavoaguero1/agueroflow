export type FinanceBankDirection = 'debit' | 'credit';

export interface FinanceBankStatementRow {
  date: string;
  amount: number;
  direction: FinanceBankDirection;
  description: string;
  reference?: string;
  externalId?: string;
  rowNumber: number;
}

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function parseDate(value: string): string | null {
  const raw = value.trim();
  const compact = raw.match(/^(\d{4})(\d{2})(\d{2})/);
  if (compact) return compact[1] + '-' + compact[2] + '-' + compact[3];
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[1] + '-' + iso[2] + '-' + iso[3];
  const br = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/);
  if (br) return br[3] + '-' + br[2].padStart(2, '0') + '-' + br[1].padStart(2, '0');
  return null;
}

function parseMoney(value: string): number | null {
  let raw = value.trim().replace(/[R$\s]/gi, '');
  if (!raw) return null;
  const negative = /^\(.*\)$/.test(raw) || raw.startsWith('-');
  raw = raw.replace(/[()]/g, '').replace(/^[+-]/, '');
  if (raw.includes(',') && raw.includes('.')) {
    raw = raw.lastIndexOf(',') > raw.lastIndexOf('.')
      ? raw.replace(/\./g, '').replace(',', '.')
      : raw.replace(/,/g, '');
  } else if (raw.includes(',')) raw = raw.replace(',', '.');
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  const amount = Math.round(Math.abs(parsed) * 100) / 100;
  return amount * (negative ? -1 : 1);
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let value = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      result.push(value.trim()); value = '';
    } else value += char;
  }
  result.push(value.trim());
  return result;
}

function parseCsv(text: string): FinanceBankStatementRow[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) throw new Error('O CSV precisa conter cabeçalho e pelo menos um lançamento.');
  const first = lines[0];
  const delimiter = [';', ',', '\t'].sort((a, b) => splitCsvLine(first, b).length - splitCsvLine(first, a).length)[0];
  const headers = splitCsvLine(first, delimiter).map(normalize);
  const find = (...aliases: string[]) => headers.findIndex((header) => aliases.some((alias) => header === alias || header.includes(alias)));
  const dateIndex = find('data', 'date', 'posting date', 'data movimento', 'data lancamento');
  const amountIndex = find('valor', 'amount', 'value', 'valor movimento', 'valor lancamento');
  const debitIndex = find('debito', 'debit');
  const creditIndex = find('credito', 'credit');
  const descriptionIndex = find('descricao', 'historico', 'description', 'memo', 'lancamento', 'detalhe');
  const typeIndex = find('tipo', 'natureza', 'direction', 'tipo movimento');
  const referenceIndex = find('referencia', 'documento', 'numero documento', 'nsu', 'check number');
  const externalIdIndex = find('fitid', 'transaction id', 'id transacao', 'identificador');
  if (dateIndex < 0 || descriptionIndex < 0 || (amountIndex < 0 && debitIndex < 0 && creditIndex < 0)) {
    throw new Error('Não reconheci as colunas do CSV. São necessárias Data, Descrição/Histórico e Valor (ou Débito/Crédito).');
  }
  const rows: FinanceBankStatementRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i], delimiter);
    if (cells.every((cell) => !cell)) continue;
    const date = parseDate(cells[dateIndex] ?? '');
    const description = (cells[descriptionIndex] ?? '').trim();
    const debit = debitIndex >= 0 ? parseMoney(cells[debitIndex] ?? '') : null;
    const credit = creditIndex >= 0 ? parseMoney(cells[creditIndex] ?? '') : null;
    const rawAmount = amountIndex >= 0 ? parseMoney(cells[amountIndex] ?? '') : null;
    let direction: FinanceBankDirection;
    let amount: number;
    if ((debit ?? 0) > 0 || (credit ?? 0) > 0) {
      if ((debit ?? 0) > 0 && (credit ?? 0) > 0) throw new Error('Linha ' + (i + 1) + ': débito e crédito preenchidos simultaneamente.');
      direction = (debit ?? 0) > 0 ? 'debit' : 'credit';
      amount = Math.abs((debit ?? credit) as number);
    } else {
      if (rawAmount == null || rawAmount === 0) throw new Error('Linha ' + (i + 1) + ': valor ausente ou inválido.');
      const type = normalize(cells[typeIndex] ?? '');
      direction = rawAmount < 0 || /debito|debit|saida|outgoing/.test(type) ? 'debit' : 'credit';
      amount = Math.abs(rawAmount);
    }
    if (!date || !description || !(amount > 0)) throw new Error('Linha ' + (i + 1) + ': data, descrição ou valor inválido.');
    rows.push({
      date, amount: Math.round(amount * 100) / 100, direction, description,
      ...(referenceIndex >= 0 && cells[referenceIndex] ? { reference: cells[referenceIndex].trim() } : {}),
      ...(externalIdIndex >= 0 && cells[externalIdIndex] ? { externalId: cells[externalIdIndex].trim() } : {}),
      rowNumber: i + 1,
    });
    if (rows.length > 2000) throw new Error('O arquivo ultrapassa o limite de 2.000 lançamentos por importação.');
  }
  if (!rows.length) throw new Error('Nenhum lançamento válido foi encontrado no CSV.');
  return rows;
}

function ofxTag(block: string, tag: string): string {
  const match = block.match(new RegExp('<' + tag + '>([^<\\r\\n]*)', 'i'));
  return match?.[1]?.trim() ?? '';
}

function parseOfx(text: string): FinanceBankStatementRow[] {
  const blocks = [...text.matchAll(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi)].map((match) => match[1]);
  if (!blocks.length) throw new Error('Não encontrei lançamentos STMTTRN no arquivo OFX.');
  const rows: FinanceBankStatementRow[] = [];
  blocks.forEach((block, index) => {
    const rawDate = ofxTag(block, 'DTPOSTED');
    const date = parseDate(rawDate);
    const rawAmount = parseMoney(ofxTag(block, 'TRNAMT'));
    const description = ofxTag(block, 'NAME') || ofxTag(block, 'MEMO') || ofxTag(block, 'PAYEE');
    const type = normalize(ofxTag(block, 'TRNTYPE'));
    if (!date || rawAmount == null || rawAmount === 0 || !description) throw new Error('Lançamento OFX ' + (index + 1) + ': data, descrição ou valor inválido.');
    rows.push({
      date, amount: Math.abs(rawAmount), direction: rawAmount < 0 || /debit|check|payment|withdrawal/.test(type) ? 'debit' : 'credit',
      description, ...(ofxTag(block, 'FITID') ? { externalId: ofxTag(block, 'FITID') } : {}),
      ...(ofxTag(block, 'CHECKNUM') ? { reference: ofxTag(block, 'CHECKNUM') } : {}),
      rowNumber: index + 1,
    });
  });
  if (rows.length > 2000) throw new Error('O arquivo ultrapassa o limite de 2.000 lançamentos por importação.');
  return rows;
}

export function parseFinanceBankStatement(fileName: string, text: string): FinanceBankStatementRow[] {
  if (text.length > 10_000_000) throw new Error('O arquivo ultrapassa o limite de 10 MB.');
  const extension = fileName.toLowerCase().split('.').pop();
  if (extension === 'ofx' || /<OFX[\s>]/i.test(text)) return parseOfx(text);
  if (extension === 'csv' || text.includes(';') || text.includes(',')) return parseCsv(text);
  throw new Error('Formato não suportado. Selecione um arquivo OFX ou CSV.');
}
