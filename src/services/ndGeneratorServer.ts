import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import nodemailer from 'nodemailer';
import {
  OutlookBridgeProvider,
  OutlookBridgeStatus,
  WhatsAppNdRecord,
  WhatsAppNdRule,
} from '../types/whatsappComposio';

const ND_PDF_DIR = path.join(process.cwd(), 'data_nd_pdfs');

function ensureNdPdfDir() {
  if (!fs.existsSync(ND_PDF_DIR)) {
    fs.mkdirSync(ND_PDF_DIR, { recursive: true });
  }
}

export function sanitizeNdFileName(
  projNumber: number,
  natureza: string,
  receiverName: string,
  isRevised?: boolean,
  revisionNumber?: number
): string {
  const cleanPart = (val: string) =>
    String(val || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 60);

  const nat = cleanPart(natureza) || 'NOTA_DEBITO';
  const rec = cleanPart(receiverName) || 'RECEBEDOR';
  const revNum = Number(revisionNumber) || 0;
  const revPart =
    isRevised || revNum > 0
      ? revNum > 1
        ? `REVISADA_REV${revNum}_-_`
        : 'REVISADA_-_'
      : '';
  return `${projNumber}_PROJ_-_${revPart}${nat}_${rec}.pdf`;
}

export function formatEmissionDateTimeBr(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
  return `${get('day')} ${get('month').toLowerCase()} ${get('year')} / ${get('hour')}:${get('minute')}`;
}

export function formatCurrencyBrl(amount: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(amount) || 0);
}

export function renderNdTemplate(template: string, record: WhatsAppNdRecord): string {
  return String(template || '')
    .replace(/\{projNumber\}/gi, String(record.projNumber))
    .replace(/\{year\}/gi, String(record.projYear))
    .replace(/\{natureza\}/gi, record.natureza || '')
    .replace(/\{recebedor\}/gi, record.receiverName || '')
    .replace(/\{valor\}/gi, formatCurrencyBrl(record.amount))
    .replace(/\{centroCusto\}/gi, record.costCenter || '')
    .replace(/\{dataPagamento\}/gi, record.paymentDate || '')
    .replace(/\{dataEmissao\}/gi, record.emissionDateTime || '')
    .replace(/\{grupo\}/gi, record.sourceGroupName || '')
    .replace(/\{observacao\}/gi, record.notes || '');
}

/**
 * Generates an A4 Portrait PDF faithfully reproducing the official Aguero Inox
 * Nota de Débito layout (matching 4915_PROJ_-_VALE_VIAGEM_ANDREW_SILVA_FEITOSA.pdf).
 */
export function generateNdPdfBuffer(record: WhatsAppNdRecord): Buffer {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const leftMargin = 14;
  const rightEdge = 196;
  const contentWidth = rightEdge - leftMargin;

  // ---------------------------------------------------------------------------
  // TOP HEADER: Aguero Inox Brand Mark + NOTA DE DEBITO + Nº PROJ (Red Bold)
  // ---------------------------------------------------------------------------
  const customLogoPath = path.join(process.cwd(), 'public', 'assets', 'aguero-nd-logo.png');
  if (fs.existsSync(customLogoPath)) {
    try {
      const logoBase64 = fs.readFileSync(customLogoPath).toString('base64');
      doc.addImage(`data:image/png;base64,${logoBase64}`, 'PNG', leftMargin, 13, 50, 21);
    } catch {
      drawVectorAgueroBrand(doc, leftMargin, 18);
    }
  } else {
    drawVectorAgueroBrand(doc, leftMargin, 18);
  }

  const revNum = Number(record.revisionNumber) || 0;
  const isRevised = Boolean(record.isRevised || revNum > 0);
  const revLabel = revNum > 1 ? `REVISADA (REV. ${revNum})` : 'REVISADA';

  // "NOTA DE DEBITO" centered muted italic bold
  doc.setFont('helvetica', 'bolditalic');
  doc.setFontSize(13.5);
  doc.setTextColor(156, 163, 175); // #9CA3AF
  doc.text('NOTA DE DEBITO', 92, isRevised ? 30 : 33, { align: 'center' });

  if (isRevised) {
    // Bold crimson stamp box right-aligned above the ND number so Financeiro immediately spots the revision
    const badgeWidth = revNum > 1 ? 42 : 28;
    const badgeX = rightEdge - 2 - badgeWidth;
    doc.setFillColor(254, 242, 242); // soft red tint
    doc.setDrawColor(220, 38, 38); // #DC2626
    doc.setLineWidth(0.45);
    doc.roundedRect(badgeX, 24.5, badgeWidth, 7, 1.4, 1.4, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(185, 28, 28); // #B91C1C
    doc.text(revLabel, badgeX + badgeWidth / 2, 29.2, { align: 'center' });
  }

  // Red "Nº PROJ   4925   /   2026" (plus "— REVISADA" when revised) on right
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(isRevised ? 10.5 : 11);
  doc.setTextColor(220, 38, 38); // #DC2626
  const projHeaderText = isRevised
    ? `Nº PROJ   ${record.projNumber}   /   ${record.projYear}   —   ${revLabel}`
    : `Nº PROJ   ${record.projNumber}   /   ${record.projYear}`;
  doc.text(projHeaderText, rightEdge - 2, 41, {
    align: 'right',
  });

  // Top gray divider bar
  doc.setFillColor(212, 212, 216); // #D4D4D8
  doc.rect(leftMargin, 44, contentWidth, 5.2, 'F');

  // Emission date/time right-aligned bold
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(17, 24, 39);
  doc.text(record.emissionDateTime || formatEmissionDateTimeBr(), rightEdge, 54.5, {
    align: 'right',
  });

  // ---------------------------------------------------------------------------
  // EMITTER / COMPANY / DESIGNATION BLOCK
  // ---------------------------------------------------------------------------
  let y = 63;
  const labelX = leftMargin;
  const valueX = 46;

  const drawFieldRow = (
    label: string,
    value: string,
    opts?: { valueColor?: [number, number, number]; valueBold?: boolean; customValueX?: number; gap?: number }
  ) => {
    doc.setFont('helvetica', 'bolditalic');
    doc.setFontSize(10);
    doc.setTextColor(17, 24, 39);
    doc.text(label, labelX, y);

    const vx = opts?.customValueX ?? valueX;
    const maxW = rightEdge - vx;
    doc.setFont('helvetica', opts?.valueBold ? 'bold' : 'normal');
    doc.setFontSize(10);
    if (opts?.valueColor) {
      doc.setTextColor(opts.valueColor[0], opts.valueColor[1], opts.valueColor[2]);
    } else {
      doc.setTextColor(17, 24, 39);
    }

    const lines = doc.splitTextToSize(String(value || 'OK'), maxW);
    doc.text(lines, vx, y);
    y += Math.max(1, lines.length) * 5.2 + (opts?.gap ?? 3.8);
  };

  drawFieldRow('Emissor:', record.emitterName || 'AgueroFlow | Assistente IA', { gap: 4.5 });
  drawFieldRow(
    'Empresa:',
    record.companyName || 'Aguero Inox Montagens e Manutenção Industrial LTDA - CNPJ 18.634.407/0001-36',
    { gap: 4.5 }
  );
  drawFieldRow('Designação:', record.designation || 'Não definido', { gap: 5.5 });

  // ---------------------------------------------------------------------------
  // SECTION BAR: DADOS DO RECEBEDOR
  // ---------------------------------------------------------------------------
  doc.setFillColor(212, 212, 216);
  doc.rect(leftMargin, y - 2, contentWidth, 5.5, 'F');
  doc.setFont('helvetica', 'bolditalic');
  doc.setFontSize(10);
  doc.setTextColor(17, 24, 39);
  doc.text('DADOS DO RECEBEDOR', leftMargin + contentWidth / 2, y + 2.1, { align: 'center' });
  y += 9;

  drawFieldRow('Nome / Razão Social:', record.receiverName || 'Não informado', {
    customValueX: 55,
    gap: 2.2,
  });
  drawFieldRow('Cod.Funcionário:', record.employeeCode || 'OK', {
    customValueX: 52,
    gap: 3.8,
  });
  drawFieldRow('Chave Pix:', record.pixKey || 'OK', { gap: 3.8 });
  drawFieldRow('CPF / CNPJ:', record.cpfCnpj || 'OK', { gap: 2.6 });
  drawFieldRow('C.c:', record.bankAccount || 'OK', { gap: 1.8 });
  drawFieldRow('Banco:', record.bankName || 'OK', { gap: 4.5 });

  // ---------------------------------------------------------------------------
  // SECTION BAR: DESCRIÇÃO
  // ---------------------------------------------------------------------------
  doc.setFillColor(212, 212, 216);
  doc.rect(leftMargin, y - 2, contentWidth, 5.5, 'F');
  doc.setFont('helvetica', 'bolditalic');
  doc.setFontSize(10);
  doc.setTextColor(17, 24, 39);
  doc.text('DESCRIÇÃO', leftMargin + contentWidth / 2, y + 2.1, { align: 'center' });
  y += 10.5;

  drawFieldRow('Valor:', formatCurrencyBrl(record.amount), {
    valueColor: [220, 38, 38],
    valueBold: true,
    gap: 4.5,
  });
  drawFieldRow('Data de pagto:', record.paymentDate || '-', { gap: 4.5 });
  drawFieldRow('Natureza:', (record.natureza || 'NOTA DE DEBITO').toUpperCase(), { gap: 4.5 });
  drawFieldRow('Centro de custos:', record.costCenter || 'Não informado', {
    customValueX: 52,
    gap: 6,
  });

  // ---------------------------------------------------------------------------
  // OBSERVAÇÃO SECTION
  // ---------------------------------------------------------------------------
  doc.setFillColor(212, 212, 216);
  doc.rect(leftMargin, y, contentWidth, 2.2, 'F');
  y += 7;

  doc.setFont('helvetica', 'bolditalic');
  doc.setFontSize(10);
  doc.setTextColor(17, 24, 39);
  doc.text('Observação:', labelX, y);

  const notesParts: string[] = [];
  if (record.notes?.trim()) notesParts.push(record.notes.trim());
  if (record.phone?.trim()) notesParts.push(`Telefone informado: ${record.phone.trim()}`);
  const finalNotes = notesParts.join('\n');

  if (finalNotes) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(31, 41, 55);
    const wrapped = doc.splitTextToSize(finalNotes, contentWidth - 4);
    doc.text(wrapped, labelX, y + 6);
  }

  // ---------------------------------------------------------------------------
  // FOOTER
  // ---------------------------------------------------------------------------
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(120, 120, 128);
  const footer =
    'Www.agueroinox.com.br | Rua Oneda, 470 – Planalto – São Bernardo do Campo/SP – CEP: 09895-280';
  doc.text(footer, 105, 276, { align: 'center' });

  const arrayBuffer = doc.output('arraybuffer');
  return Buffer.from(arrayBuffer);
}

function drawVectorAgueroBrand(doc: jsPDF, x: number, y: number) {
  // Clean monochrome industrial brand mark matching Aguero Inox 10 Anos visual style
  doc.setDrawColor(100, 105, 115);
  doc.setLineWidth(0.4);
  doc.circle(x + 9, y + 8, 9, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(82, 86, 94);
  doc.text('10', x + 9, y + 10.5, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(68, 72, 80);
  doc.text('AGUERO', x + 16.5, y + 11);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(115, 120, 130);
  doc.text('I N O X', x + 28, y + 16);
}

export function saveNdPdfToDisk(record: WhatsAppNdRecord, pdfBuffer: Buffer): string {
  ensureNdPdfDir();
  const safeName = path.basename(
    record.fileName ||
      sanitizeNdFileName(
        record.projNumber,
        record.natureza,
        record.receiverName,
        record.isRevised,
        record.revisionNumber
      )
  );
  const fullPath = path.join(ND_PDF_DIR, safeName);
  fs.writeFileSync(fullPath, pdfBuffer);
  return fullPath;
}

export function getOrGenerateNdPdfBuffer(record: WhatsAppNdRecord): Buffer {
  ensureNdPdfDir();
  const safeName = path.basename(
    record.fileName ||
      sanitizeNdFileName(
        record.projNumber,
        record.natureza,
        record.receiverName,
        record.isRevised,
        record.revisionNumber
      )
  );
  const fullPath = path.join(ND_PDF_DIR, safeName);
  if (fs.existsSync(fullPath)) {
    try {
      const existing = fs.readFileSync(fullPath);
      if (existing.length > 500) return existing;
    } catch {
      // Regenerate below
    }
  }
  const generated = generateNdPdfBuffer(record);
  saveNdPdfToDisk(record, generated);
  return generated;
}

export function generateNdWorkbookBuffer(records: WhatsAppNdRecord[]): Buffer {
  const wb = XLSX.utils.book_new();
  const rows = records.map((r) => ({
    'Nº PROJ':
      r.isRevised || (Number(r.revisionNumber) || 0) > 0
        ? `${r.projNumber}/${r.projYear} (${(Number(r.revisionNumber) || 1) > 1 ? `REVISADA REV. ${r.revisionNumber}` : 'REVISADA'})`
        : `${r.projNumber}/${r.projYear}`,
    'Data Emissão': r.emissionDateTime,
    Emissor: r.emitterName,
    Empresa: r.companyName,
    Designação: r.designation,
    'Nome / Razão Social': r.receiverName,
    'Cod. Funcionário': r.employeeCode || 'OK',
    'Chave Pix': r.pixKey || 'OK',
    'CPF / CNPJ': r.cpfCnpj || 'OK',
    'C.c': r.bankAccount || 'OK',
    Banco: r.bankName || 'OK',
    'Valor (R$)': Number((Number(r.amount) || 0).toFixed(2)),
    'Data Pagto': r.paymentDate,
    Natureza: r.natureza,
    'Centro de Custos': r.costCenter,
    Telefone: r.phone || '',
    Observação: r.notes || '',
    'Grupo Origem': r.sourceGroupName,
    'Arquivo PDF': r.fileName,
    'WhatsApp Enviado': r.whatsappSent ? 'Sim' : 'Não',
    'Status Outlook': r.emailStatus,
    'E-mail Destinatários': (r.emailTo || []).join(', '),
    'E-mail Cópia (CC)': (r.emailCc || []).join(', '),
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 12 },
    { wch: 24 },
    { wch: 24 },
    { wch: 42 },
    { wch: 14 },
    { wch: 28 },
    { wch: 14 },
    { wch: 22 },
    { wch: 18 },
    { wch: 14 },
    { wch: 16 },
    { wch: 14 },
    { wch: 13 },
    { wch: 22 },
    { wch: 24 },
    { wch: 16 },
    { wch: 36 },
    { wch: 24 },
    { wch: 36 },
    { wch: 14 },
    { wch: 16 },
    { wch: 30 },
    { wch: 30 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Notas_de_Debito');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return Buffer.from(buf);
}

// -----------------------------------------------------------------------------
// OUTLOOK / EMAIL BRIDGE
// Priority:
//   1) Microsoft 365 OAuth 2.0 Delegated Graph (Mail.Send — bypasses SMTP AUTH block & MFA!)
//   2) Microsoft Graph App-Only (client_credentials)
//   3) Brevo HTTPS API (zero SMTP, 300/day free, any verified sender)
//   4) Resend HTTPS API (zero SMTP, 3000/mo free)
//   5) Power Automate / Outlook HTTP Webhook (zero Azure admin)
//   6) SMTP (Gmail App Password or Microsoft 365 when SMTP AUTH enabled)
//   7) Composio Outlook
// -----------------------------------------------------------------------------

interface StoredOutlookOAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAtMs: number;
  email: string;
  displayName?: string;
  tenantId: string;
  updatedAt: string;
}

const OUTLOOK_OAUTH_TOKENS_FILE = path.join(process.cwd(), 'data_outlook_oauth_tokens.json');
const pendingOutlookOAuthStates = new Map<
  string,
  { codeVerifier: string; redirectUri: string; createdAt: number }
>();

function loadStoredOutlookOAuthTokens(): StoredOutlookOAuthTokens | null {
  try {
    if (!fs.existsSync(OUTLOOK_OAUTH_TOKENS_FILE)) return null;
    const parsed = JSON.parse(fs.readFileSync(OUTLOOK_OAUTH_TOKENS_FILE, 'utf-8'));
    if (parsed && parsed.refreshToken) return parsed as StoredOutlookOAuthTokens;
  } catch {
    // ignore corrupt token file
  }
  return null;
}

function saveStoredOutlookOAuthTokens(tokens: StoredOutlookOAuthTokens) {
  try {
    const tmp = `${OUTLOOK_OAUTH_TOKENS_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(tokens, null, 2), 'utf-8');
    fs.renameSync(tmp, OUTLOOK_OAUTH_TOKENS_FILE);
  } catch (err) {
    console.warn('⚠️ [Outlook OAuth] Falha ao salvar tokens em disco:', err);
  }
}

export function disconnectOutlookOAuth() {
  try {
    if (fs.existsSync(OUTLOOK_OAUTH_TOKENS_FILE)) {
      fs.unlinkSync(OUTLOOK_OAUTH_TOKENS_FILE);
    }
  } catch {
    // ignore
  }
}

export function getOutlookOAuthCallbackUrl(): string {
  const base = String(process.env.APP_URL || '').trim().replace(/\/+$/, '');
  return base ? `${base}/api/outlook/oauth/callback` : '/api/outlook/oauth/callback';
}

export function buildOutlookOAuthAuthorizationUrl(redirectUriOverride?: string): {
  success: boolean;
  url?: string;
  callbackUrl: string;
  error?: string;
} {
  const clientId = String(process.env.OUTLOOK_CLIENT_ID || '').trim();
  const tenantId = String(process.env.OUTLOOK_TENANT_ID || 'common').trim() || 'common';
  const callbackUrl = redirectUriOverride || getOutlookOAuthCallbackUrl();

  if (!clientId) {
    return {
      success: false,
      callbackUrl,
      error:
        'Adicione o secret OUTLOOK_CLIENT_ID (ID do Aplicativo no Microsoft Entra / Azure) em Settings > Secrets para ativar o login OAuth 2.0 do Outlook.',
    };
  }

  // Cleanup expired states (>15 min)
  const now = Date.now();
  for (const [k, v] of pendingOutlookOAuthStates.entries()) {
    if (now - v.createdAt > 15 * 60_000) pendingOutlookOAuthStates.delete(k);
  }

  const state = crypto.randomBytes(24).toString('hex');
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  pendingOutlookOAuthStates.set(state, { codeVerifier, redirectUri: callbackUrl, createdAt: now });

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: callbackUrl,
    response_mode: 'query',
    scope: 'offline_access openid profile email User.Read Mail.Send',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });

  const url = `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/authorize?${params.toString()}`;
  return { success: true, url, callbackUrl };
}

export async function exchangeOutlookOAuthCode(params: {
  code: string;
  state: string;
  redirectUriFallback?: string;
}): Promise<{ success: boolean; email?: string; error?: string }> {
  const clientId = String(process.env.OUTLOOK_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.OUTLOOK_CLIENT_SECRET || '').trim();
  const tenantId = String(process.env.OUTLOOK_TENANT_ID || 'common').trim() || 'common';

  if (!clientId) {
    return { success: false, error: 'OUTLOOK_CLIENT_ID não configurado no servidor.' };
  }

  const stateEntry = pendingOutlookOAuthStates.get(params.state);
  pendingOutlookOAuthStates.delete(params.state);
  const redirectUri = stateEntry?.redirectUri || params.redirectUriFallback || getOutlookOAuthCallbackUrl();

  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: redirectUri,
    scope: 'offline_access openid profile email User.Read Mail.Send',
  });
  if (stateEntry?.codeVerifier) {
    body.set('code_verifier', stateEntry.codeVerifier);
  }
  if (clientSecret) {
    body.set('client_secret', clientSecret);
  }

  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    }
  );
  const tokenJson: any = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !tokenJson.access_token) {
    return {
      success: false,
      error: `Falha ao concluir OAuth Microsoft: ${tokenJson.error_description || tokenJson.error || tokenRes.status}`,
    };
  }

  let email = String(process.env.OUTLOOK_SENDER_EMAIL || '').trim();
  let displayName = '';
  try {
    const meRes = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    if (meRes.ok) {
      const me: any = await meRes.json();
      email = String(me.mail || me.userPrincipalName || email).trim();
      displayName = String(me.displayName || '').trim();
    }
  } catch {
    // keep fallback email
  }

  const expiresInSec = Number(tokenJson.expires_in) || 3500;
  saveStoredOutlookOAuthTokens({
    accessToken: String(tokenJson.access_token),
    refreshToken: String(tokenJson.refresh_token || ''),
    expiresAtMs: Date.now() + Math.max(60, expiresInSec - 120) * 1000,
    email: email || 'Conta Microsoft 365 Conectada',
    displayName,
    tenantId,
    updatedAt: new Date().toISOString(),
  });

  return { success: true, email: email || 'Conta Microsoft 365 Conectada' };
}

async function getValidOutlookOAuthAccessToken(): Promise<{
  accessToken: string;
  email: string;
} | null> {
  const stored = loadStoredOutlookOAuthTokens();
  if (!stored) return null;

  if (stored.accessToken && Date.now() < stored.expiresAtMs) {
    return { accessToken: stored.accessToken, email: stored.email };
  }

  if (!stored.refreshToken) return null;
  const clientId = String(process.env.OUTLOOK_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.OUTLOOK_CLIENT_SECRET || '').trim();
  const tenantId = stored.tenantId || String(process.env.OUTLOOK_TENANT_ID || 'common').trim() || 'common';
  if (!clientId) return null;

  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: 'refresh_token',
    refresh_token: stored.refreshToken,
    scope: 'offline_access openid profile email User.Read Mail.Send',
  });
  if (clientSecret) body.set('client_secret', clientSecret);

  const res = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    }
  );
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    console.warn('⚠️ [Outlook OAuth Refresh]:', json.error_description || json.error || res.status);
    return null;
  }

  const expiresInSec = Number(json.expires_in) || 3500;
  const updated: StoredOutlookOAuthTokens = {
    ...stored,
    accessToken: String(json.access_token),
    refreshToken: String(json.refresh_token || stored.refreshToken),
    expiresAtMs: Date.now() + Math.max(60, expiresInSec - 120) * 1000,
    updatedAt: new Date().toISOString(),
  };
  saveStoredOutlookOAuthTokens(updated);
  return { accessToken: updated.accessToken, email: updated.email };
}

export function getOutlookBridgeStatus(): OutlookBridgeStatus {
  const oauthTokens = loadStoredOutlookOAuthTokens();
  const oauthConfigured = Boolean(process.env.OUTLOOK_CLIENT_ID);
  const hasOAuthConnected = Boolean(oauthConfigured && oauthTokens?.refreshToken);

  const hasGraph = Boolean(
    process.env.OUTLOOK_TENANT_ID &&
      process.env.OUTLOOK_CLIENT_ID &&
      process.env.OUTLOOK_CLIENT_SECRET &&
      process.env.OUTLOOK_SENDER_EMAIL
  );
  const hasBrevo = Boolean(process.env.BREVO_API_KEY);
  const hasResend = Boolean(process.env.RESEND_API_KEY);
  const hasWebhook = Boolean(process.env.OUTLOOK_WEBHOOK_URL);
  const hasSmtp = Boolean(process.env.OUTLOOK_SMTP_USER && process.env.OUTLOOK_SMTP_PASS);
  const hasComposio = Boolean(
    process.env.COMPOSIO_API_KEY && process.env.COMPOSIO_OUTLOOK_ACCOUNT_ID
  );

  let activeProvider: OutlookBridgeProvider = 'none';
  let senderEmail: string | null = null;

  if (hasOAuthConnected) {
    activeProvider = 'outlook_oauth';
    senderEmail = oauthTokens?.email || process.env.OUTLOOK_SENDER_EMAIL || null;
  } else if (hasGraph) {
    activeProvider = 'outlook_graph';
    senderEmail = process.env.OUTLOOK_SENDER_EMAIL || null;
  } else if (hasBrevo) {
    activeProvider = 'brevo_api';
    senderEmail = process.env.BREVO_SENDER_EMAIL || process.env.OUTLOOK_SMTP_USER || 'AgueroFlow (Brevo)';
  } else if (hasResend) {
    activeProvider = 'resend_api';
    senderEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
  } else if (hasWebhook) {
    activeProvider = 'outlook_webhook';
    senderEmail = process.env.OUTLOOK_SENDER_EMAIL || 'Webhook Outlook / Power Automate';
  } else if (hasSmtp) {
    activeProvider = 'outlook_smtp';
    senderEmail = process.env.OUTLOOK_SMTP_USER || null;
  } else if (hasComposio) {
    activeProvider = 'composio_outlook';
    senderEmail = process.env.OUTLOOK_SENDER_EMAIL || 'Conta Outlook via Composio';
  }

  return {
    configured: activeProvider !== 'none',
    activeProvider,
    senderEmail,
    oauthConfigured,
    oauthConnected: hasOAuthConnected,
    oauthEmail: oauthTokens?.email || null,
    callbackUrl: getOutlookOAuthCallbackUrl(),
    availableProviders: {
      microsoftOAuth: hasOAuthConnected,
      microsoftGraph: hasGraph,
      brevoApi: hasBrevo,
      resendApi: hasResend,
      outlookWebhook: hasWebhook,
      smtpMicrosoft365: hasSmtp,
      composioOutlook: hasComposio,
    },
  };
}

async function sendViaOutlookOAuthGraph(params: {
  to: string[];
  cc: string[];
  subject: string;
  bodyText: string;
  attachment?: { fileName: string; buffer: Buffer };
}): Promise<{ success: boolean; error?: string }> {
  const token = await getValidOutlookOAuthAccessToken();
  if (!token) {
    return {
      success: false,
      error: 'Sessão Outlook OAuth 2.0 expirada. Clique em "Conectar minha conta Outlook" para reconectar.',
    };
  }

  const messagePayload: any = {
    subject: params.subject,
    body: { contentType: 'Text', content: params.bodyText },
    toRecipients: params.to.map((address) => ({ emailAddress: { address } })),
    ccRecipients: params.cc.map((address) => ({ emailAddress: { address } })),
  };

  if (params.attachment) {
    messagePayload.attachments = [
      {
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: params.attachment.fileName,
        contentType: 'application/pdf',
        contentBytes: params.attachment.buffer.toString('base64'),
      },
    ];
  }

  const sendRes = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message: messagePayload, saveToSentItems: true }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!sendRes.ok) {
    const errText = await sendRes.text().catch(() => '');
    return {
      success: false,
      error: `Erro Microsoft Graph OAuth (${sendRes.status}): ${errText.slice(0, 260)}`,
    };
  }

  return { success: true };
}

async function sendViaMicrosoftGraph(params: {
  to: string[];
  cc: string[];
  subject: string;
  bodyText: string;
  attachment?: { fileName: string; buffer: Buffer };
}): Promise<{ success: boolean; error?: string }> {
  const tenantId = process.env.OUTLOOK_TENANT_ID!;
  const clientId = process.env.OUTLOOK_CLIENT_ID!;
  const clientSecret = process.env.OUTLOOK_CLIENT_SECRET!;
  const sender = process.env.OUTLOOK_SENDER_EMAIL!;

  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }),
      signal: AbortSignal.timeout(12_000),
    }
  );
  const tokenJson: any = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !tokenJson.access_token) {
    return {
      success: false,
      error: `Falha ao autenticar no Microsoft Graph: ${tokenJson.error_description || tokenJson.error || tokenRes.status}`,
    };
  }

  const messagePayload: any = {
    subject: params.subject,
    body: {
      contentType: 'Text',
      content: params.bodyText,
    },
    toRecipients: params.to.map((address) => ({ emailAddress: { address } })),
    ccRecipients: params.cc.map((address) => ({ emailAddress: { address } })),
  };

  if (params.attachment) {
    messagePayload.attachments = [
      {
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: params.attachment.fileName,
        contentType: 'application/pdf',
        contentBytes: params.attachment.buffer.toString('base64'),
      },
    ];
  }

  const sendRes = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenJson.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: messagePayload, saveToSentItems: true }),
      signal: AbortSignal.timeout(15_000),
    }
  );

  if (!sendRes.ok) {
    const errText = await sendRes.text().catch(() => '');
    return {
      success: false,
      error: `Erro Microsoft Graph (${sendRes.status}): ${errText.slice(0, 260)}`,
    };
  }

  return { success: true };
}

async function sendViaBrevoApi(params: {
  to: string[];
  cc: string[];
  subject: string;
  bodyText: string;
  attachment?: { fileName: string; buffer: Buffer };
}): Promise<{ success: boolean; error?: string }> {
  const apiKey = String(process.env.BREVO_API_KEY || '').trim();
  const senderEmail = String(
    process.env.BREVO_SENDER_EMAIL || process.env.OUTLOOK_SMTP_USER || process.env.OUTLOOK_SENDER_EMAIL || ''
  ).trim();
  if (!senderEmail) {
    return {
      success: false,
      error: 'Configure BREVO_SENDER_EMAIL (seu e-mail remetente validado no Brevo) nos Secrets.',
    };
  }

  const payload: any = {
    sender: { name: 'AgueroFlow | Assistente IA', email: senderEmail },
    to: params.to.map((email) => ({ email })),
    subject: params.subject,
    textContent: params.bodyText,
  };
  if (params.cc.length > 0) {
    payload.cc = params.cc.map((email) => ({ email }));
  }
  if (params.attachment) {
    payload.attachment = [
      {
        name: params.attachment.fileName,
        content: params.attachment.buffer.toString('base64'),
      },
    ];
  }

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    return { success: false, error: `Erro Brevo API (${res.status}): ${errText.slice(0, 260)}` };
  }
  return { success: true };
}

function escapeHtmlEmail(input: string): string {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildCleanEmailHtml(subject: string, bodyText: string): string {
  const paragraphs = String(bodyText || '')
    .split(/\n{2,}/)
    .map((block) => `<p style="margin:0 0 12px 0;line-height:1.55;">${escapeHtmlEmail(block).replace(/\n/g, '<br/>')}</p>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:24px;background-color:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1d1d1f;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e5e5ea;border-radius:12px;overflow:hidden;">
    <div style="padding:18px 24px;background:#1d1d1f;color:#ffffff;">
      <div style="font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:#a1a1a6;">AgueroFlow · Automação de Notas de Débito</div>
      <div style="font-size:16px;font-weight:600;margin-top:4px;">${escapeHtmlEmail(subject)}</div>
    </div>
    <div style="padding:24px;font-size:14px;color:#1d1d1f;">
      ${paragraphs}
    </div>
    <div style="padding:14px 24px;background:#f5f5f7;border-top:1px solid #e5e5ea;font-size:11px;color:#6e6e73;">
      Aguero Inox Montagens e Manutenção Industrial LTDA · Envio automático via AgueroFlow
    </div>
  </div>
</body>
</html>`;
}

async function sendViaResendApi(params: {
  to: string[];
  cc: string[];
  subject: string;
  bodyText: string;
  attachment?: { fileName: string; buffer: Buffer };
}): Promise<{ success: boolean; emailId?: string; error?: string }> {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  const fromEmail = String(process.env.RESEND_FROM_EMAIL || 'AgueroFlow | Assistente IA <onboarding@resend.dev>').trim();
  const isResendSandbox = /resend\.dev/i.test(fromEmail);
  const replyToEmail = String(
    process.env.OUTLOOK_SENDER_EMAIL || process.env.OUTLOOK_SMTP_USER || ''
  ).trim();

  // Deduplicate To and remove any CC address already present in To
  const uniqueTo: string[] = [];
  const toLowerSet = new Set<string>();
  for (const addr of params.to) {
    const lower = addr.toLowerCase();
    if (!toLowerSet.has(lower)) {
      toLowerSet.add(lower);
      uniqueTo.push(addr);
    }
  }
  const uniqueCc: string[] = [];
  const ccLowerSet = new Set<string>();
  for (const addr of params.cc) {
    const lower = addr.toLowerCase();
    if (!toLowerSet.has(lower) && !ccLowerSet.has(lower)) {
      ccLowerSet.add(lower);
      uniqueCc.push(addr);
    }
  }

  const payload: any = {
    from: fromEmail.includes('<') ? fromEmail : `AgueroFlow | Assistente IA <${fromEmail}>`,
    to: uniqueTo,
    subject: params.subject,
    text: params.bodyText,
    html: buildCleanEmailHtml(params.subject, params.bodyText),
  };
  if (uniqueCc.length > 0) payload.cc = uniqueCc;
  // IMPORTANT: Never set reply_to to the recipient's own corporate domain when sending from onboarding@resend.dev,
  // because Microsoft 365 Exchange Online Protection flags cross-domain Reply-To spoofing and hides the mail in Junk/Quarantine!
  if (
    !isResendSandbox &&
    replyToEmail &&
    replyToEmail.includes('@') &&
    !toLowerSet.has(replyToEmail.toLowerCase()) &&
    !ccLowerSet.has(replyToEmail.toLowerCase())
  ) {
    payload.reply_to = replyToEmail;
  }
  if (params.attachment) {
    payload.attachments = [
      {
        filename: params.attachment.fileName,
        content: params.attachment.buffer.toString('base64'),
      },
    ];
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  });
  const resText = await res.text().catch(() => '');
  let resJson: any = {};
  try {
    resJson = resText ? JSON.parse(resText) : {};
  } catch {
    resJson = {};
  }
  if (!res.ok) {
    if (res.status === 403 && /only send testing emails/i.test(resText)) {
      return {
        success: false,
        error:
          'Resend em modo teste (onboarding@resend.dev): só permite enviar para o e-mail dono da conta Resend. Para enviar para outros destinatários/CC, verifique o domínio agueroinox.com.br em resend.com/domains e configure RESEND_FROM_EMAIL (ex: nd@agueroinox.com.br).',
      };
    }
    return { success: false, error: `Erro Resend API (${res.status}): ${resText.slice(0, 260)}` };
  }
  return { success: true, emailId: resJson?.id ? String(resJson.id) : undefined };
}

async function sendViaOutlookWebhook(params: {
  to: string[];
  cc: string[];
  subject: string;
  bodyText: string;
  attachment?: { fileName: string; buffer: Buffer };
}): Promise<{ success: boolean; error?: string }> {
  const url = String(process.env.OUTLOOK_WEBHOOK_URL || '').trim();
  const secret = String(process.env.OUTLOOK_WEBHOOK_SECRET || '').trim();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (secret) headers['x-agueroflow-secret'] = secret;

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      to: params.to,
      toCsv: params.to.join('; '),
      cc: params.cc,
      ccCsv: params.cc.join('; '),
      subject: params.subject,
      bodyText: params.bodyText,
      fileName: params.attachment?.fileName || null,
      pdfBase64: params.attachment ? params.attachment.buffer.toString('base64') : null,
      mimeType: params.attachment ? 'application/pdf' : null,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    return { success: false, error: `Erro Webhook Outlook (${res.status}): ${errText.slice(0, 260)}` };
  }
  return { success: true };
}

async function sendViaOutlookSmtp(params: {
  to: string[];
  cc: string[];
  subject: string;
  bodyText: string;
  attachment?: { fileName: string; buffer: Buffer };
}): Promise<{ success: boolean; error?: string }> {
  const user = String(process.env.OUTLOOK_SMTP_USER || '').trim();
  const pass = String(process.env.OUTLOOK_SMTP_PASS || '').trim();
  const inferredHost = /@gmail\.com$/i.test(user) ? 'smtp.gmail.com' : 'smtp.office365.com';
  const host = String(process.env.OUTLOOK_SMTP_HOST || inferredHost).trim();
  const port = Number(process.env.OUTLOOK_SMTP_PORT || 587);

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    connectionTimeout: 12_000,
    greetingTimeout: 12_000,
    socketTimeout: 15_000,
    tls: { rejectUnauthorized: false },
  });

  try {
    await transporter.sendMail({
      from: `AgueroFlow | Assistente IA <${user}>`,
      to: params.to.join(', '),
      cc: params.cc.length > 0 ? params.cc.join(', ') : undefined,
      subject: params.subject,
      text: params.bodyText,
      attachments: params.attachment
        ? [
            {
              filename: params.attachment.fileName,
              content: params.attachment.buffer,
              contentType: 'application/pdf',
            },
          ]
        : undefined,
    });
    return { success: true };
  } catch (err: any) {
    const rawMsg = String(err?.message || err || '');
    if (/SmtpClientAuthentication is disabled/i.test(rawMsg) || /535 5\.7\.139/i.test(rawMsg)) {
      return {
        success: false,
        error:
          'A Microsoft bloqueou SMTP básico neste domínio (535 5.7.139 SmtpClientAuthentication is disabled for the Tenant). Soluções imediatas sem depender de SMTP: (1) Conectar via OAuth 2.0 Microsoft Graph (adicione OUTLOOK_CLIENT_ID e clique em "Conectar Outlook"), OU (2) Usar Brevo/Resend HTTPS API (adicione BREVO_API_KEY + BREVO_SENDER_EMAIL ou RESEND_API_KEY — 100% gratuito e funciona na hora), OU (3) Usar um Gmail com Senha de App em OUTLOOK_SMTP_USER/PASS, OU (4) Pedir ao admin TI ativar SMTP AUTH no Microsoft 365.',
      };
    }
    return { success: false, error: rawMsg || 'Erro ao enviar e-mail via SMTP.' };
  }
}

type EmailDispatchOutcome = {
  success: boolean;
  provider: OutlookBridgeProvider;
  emailId?: string;
  pendingConfig?: boolean;
  error?: string;
};

const inFlightEmailDispatches = new Map<string, Promise<EmailDispatchOutcome>>();
const recentEmailDispatches = new Map<string, { ts: number; outcome: EmailDispatchOutcome }>();

export async function sendNdEmailViaOutlook(params: {
  to: string[];
  cc: string[];
  subject: string;
  bodyText: string;
  attachment?: { fileName: string; buffer: Buffer };
}): Promise<EmailDispatchOutcome> {
  // Deduplicate To case-insensitively and strip any CC address already present in To (prevents 2x copies across ALL providers)
  const cleanTo: string[] = [];
  const toLower = new Set<string>();
  for (const raw of params.to || []) {
    const e = String(raw || '').trim();
    if (!e || !e.includes('@')) continue;
    const low = e.toLowerCase();
    if (!toLower.has(low)) {
      toLower.add(low);
      cleanTo.push(e);
    }
  }
  const cleanCc: string[] = [];
  const ccLower = new Set<string>();
  for (const raw of params.cc || []) {
    const e = String(raw || '').trim();
    if (!e || !e.includes('@')) continue;
    const low = e.toLowerCase();
    if (!toLower.has(low) && !ccLower.has(low)) {
      ccLower.add(low);
      cleanCc.push(e);
    }
  }

  if (cleanTo.length === 0) {
    return {
      success: false,
      provider: 'none',
      pendingConfig: true,
      error: 'Nenhum destinatário (Para) configurado na regra de envio de ND.',
    };
  }

  const status = getOutlookBridgeStatus();
  if (!status.configured) {
    return {
      success: false,
      provider: 'none',
      pendingConfig: true,
      error:
        'Ponte de e-mail ainda não configurada nos Secrets do servidor (use Microsoft OAuth 2.0, Brevo/Resend API, Power Automate Webhook ou SMTP).',
    };
  }

  // 45-second idempotency guard + concurrent in-flight coalescing so the exact same ND email can NEVER go out 2x
  const attachmentHash = params.attachment?.buffer
    ? crypto.createHash('sha1').update(params.attachment.buffer).digest('hex').slice(0, 12)
    : 'noatt';
  const emailSig = `${cleanTo.map((e) => e.toLowerCase()).sort().join(',')}|${cleanCc.map((e) => e.toLowerCase()).sort().join(',')}|${params.subject.trim()}|${params.attachment?.fileName || ''}|${attachmentHash}`;
  const nowMs = Date.now();
  for (const [k, v] of recentEmailDispatches.entries()) {
    if (nowMs - v.ts > 45_000) recentEmailDispatches.delete(k);
  }
  const recentHit = recentEmailDispatches.get(emailSig);
  if (recentHit && recentHit.outcome.success) {
    console.log(`🛡️ [ND Email Dedup] Envio idêntico bloqueado dentro de 45s: "${params.subject}"`);
    return recentHit.outcome;
  }
  const existingInFlight = inFlightEmailDispatches.get(emailSig);
  if (existingInFlight) {
    console.log(`🛡️ [ND Email Dedup] Reaproveitando envio concorrente em andamento: "${params.subject}"`);
    return existingInFlight;
  }

  const dispatchPromise = (async (): Promise<EmailDispatchOutcome> => {
    try {
      let outcome: EmailDispatchOutcome;
      if (status.activeProvider === 'outlook_oauth') {
        const res = await sendViaOutlookOAuthGraph({
          to: cleanTo,
          cc: cleanCc,
          subject: params.subject,
          bodyText: params.bodyText,
          attachment: params.attachment,
        });
        outcome = { ...res, provider: 'outlook_oauth' };
      } else if (status.activeProvider === 'outlook_graph') {
        const res = await sendViaMicrosoftGraph({
          to: cleanTo,
          cc: cleanCc,
          subject: params.subject,
          bodyText: params.bodyText,
          attachment: params.attachment,
        });
        outcome = { ...res, provider: 'outlook_graph' };
      } else if (status.activeProvider === 'brevo_api') {
        const res = await sendViaBrevoApi({
          to: cleanTo,
          cc: cleanCc,
          subject: params.subject,
          bodyText: params.bodyText,
          attachment: params.attachment,
        });
        outcome = { ...res, provider: 'brevo_api' };
      } else if (status.activeProvider === 'resend_api') {
        const res = await sendViaResendApi({
          to: cleanTo,
          cc: cleanCc,
          subject: params.subject,
          bodyText: params.bodyText,
          attachment: params.attachment,
        });
        outcome = { ...res, provider: 'resend_api' };
      } else if (status.activeProvider === 'outlook_webhook') {
        const res = await sendViaOutlookWebhook({
          to: cleanTo,
          cc: cleanCc,
          subject: params.subject,
          bodyText: params.bodyText,
          attachment: params.attachment,
        });
        outcome = { ...res, provider: 'outlook_webhook' };
      } else if (status.activeProvider === 'outlook_smtp') {
        const res = await sendViaOutlookSmtp({
          to: cleanTo,
          cc: cleanCc,
          subject: params.subject,
          bodyText: params.bodyText,
          attachment: params.attachment,
        });
        outcome = { ...res, provider: 'outlook_smtp' };
      } else {
        outcome = {
          success: false,
          provider: 'composio_outlook',
          error:
            'Para anexar PDF diretamente, utilize Microsoft OAuth 2.0, Brevo/Resend API, Webhook Outlook ou SMTP habilitado.',
        };
      }
      if (outcome.success) {
        recentEmailDispatches.set(emailSig, { ts: Date.now(), outcome });
      }
      return outcome;
    } catch (err: any) {
      return {
        success: false,
        provider: status.activeProvider,
        error: err?.message || 'Erro ao enviar e-mail via Outlook.',
      };
    } finally {
      inFlightEmailDispatches.delete(emailSig);
    }
  })();

  inFlightEmailDispatches.set(emailSig, dispatchPromise);
  return dispatchPromise;
}

export function createDefaultNdRuleForGroup(params: {
  groupJid: string;
  groupName: string;
  organizationId?: string;
}): WhatsAppNdRule {
  const now = new Date().toISOString();
  return {
    id: `wand_rule_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    organizationId: params.organizationId || 'org_aguero_default',
    name: `Automação ND — ${params.groupName}`,
    active: true,
    groupJid: params.groupJid,
    groupName: params.groupName,
    nextProjNumber: 4925,
    projYear: new Date().getFullYear(),
    emitterName: 'AgueroFlow | Assistente IA',
    companyName: 'Aguero Inox Montagens e Manutenção Industrial LTDA - CNPJ 18.634.407/0001-36',
    defaultDesignation: 'Não definido',
    footerText:
      'Www.agueroinox.com.br | Rua Oneda, 470 – Planalto – São Bernardo do Campo/SP – CEP: 09895-280',
    sendPdfToWhatsAppGroup: true,
    autoEmailEnabled: true,
    outlookTo: [],
    outlookCc: [],
    outlookSubjectTemplate: 'ND Nº PROJ {projNumber}/{year} - {natureza} - {recebedor}',
    outlookBodyTemplate:
      'Olá,\n\nSegue em anexo a Nota de Débito Nº PROJ {projNumber}/{year} gerada automaticamente pelo AgueroFlow.\n\n• Natureza: {natureza}\n• Recebedor: {recebedor}\n• Valor: {valor}\n• Data de Pagamento: {dataPagamento}\n• Centro de Custos: {centroCusto}\n\nAtenciosamente,\nAgueroFlow | Assistente IA',
    generatedCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}
