import { Router } from 'express';
import { getAdmin, type AdminHandles } from '../firebaseAdmin.ts';
import { requireRole } from '../authMiddleware.ts';
import { parseNfeXml, type ParsedNfe } from './parseNfe.ts';

const docId = (orgId: string, chave: string) => `${orgId}_${chave}`;
const warn = (msg: string) => { if (!process.env.NODE_TEST_CONTEXT) console.warn(msg); };

async function saveXml(h: AdminHandles, orgId: string, chave: string, xml: string): Promise<string | undefined> {
  const path = `nfe-xml/${orgId}/${chave}.xml`;
  try { await h.bucket.file(path).save(xml, { contentType: 'application/xml' }); return path; }
  catch (e) { warn(`NF-e ${chave}: XML não salvo no bucket (${e instanceof Error ? e.message : String(e)})`); return undefined; }
}

export async function upsertNfe(h: AdminHandles, orgId: string, parsed: ParsedNfe, source: 'upload' | 'sefaz', xml?: string): Promise<{ id: string; created: boolean }> {
  const id = docId(orgId, parsed.chave);
  const ref = h.db.doc(`nfe_documents/${id}`);
  const xmlPath = xml ? await saveXml(h, orgId, parsed.chave, xml) : undefined;
  const created = await h.db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      tx.set(ref, { orgId, ...parsed, status: 'aguardando_classificacao', source, recebidaEm: new Date().toISOString(), ...(xmlPath && { xmlPath }) });
      return true;
    }
    // Only a 'resumo' is upgraded; any other status is never touched.
    if (snap.data()!.status === 'resumo') tx.update(ref, { ...parsed, status: 'aguardando_classificacao', source, ...(xmlPath && { xmlPath }) });
    else if (xmlPath && !snap.data()!.xmlPath) tx.update(ref, { xmlPath });
    return false;
  });
  return { id, created };
}

export async function upsertNfeSummary(
  h: AdminHandles, orgId: string,
  resumo: { chave: string; emitente: { cnpj: string; nome: string }; valorTotal: number; emitidaEm: string; situacao: string },
): Promise<{ id: string; created: boolean }> {
  const id = docId(orgId, resumo.chave);
  try {
    await h.db.doc(`nfe_documents/${id}`).create({ orgId, ...resumo, status: 'resumo', source: 'sefaz', recebidaEm: new Date().toISOString() });
    return { id, created: true };
  } catch (e: any) {
    if (e?.code === 6 /* ALREADY_EXISTS */) return { id, created: false };
    throw e;
  }
}

const digits = (s: unknown) => String(s ?? '').replace(/\D/g, '');

export function createNfeRouter(getH: () => AdminHandles | null = getAdmin): Router {
  const r = Router();
  r.post('/import', requireRole('Admin', 'Gerente'), async (req, res) => {
    const h = getH();
    if (!h) return res.status(503).json({ error: 'Servidor sem acesso ao banco.' });
    const orgId = req.orgId;
    const files = req.body?.files;
    if (!orgId || !Array.isArray(files)) return res.status(400).json({ error: 'Informe a empresa e files: [{ name, content }].' });
    const orgCnpj = digits((await h.db.doc(`organizations/${orgId}`).get()).data()?.cnpj);
    const results: { name: string; ok: boolean; chave?: string; created?: boolean; error?: string }[] = [];
    for (const f of files) {
      const name = String(f?.name ?? '');
      try {
        if (!orgCnpj) throw new Error('Cadastre o CNPJ da empresa em Estrutura antes de importar notas.');
        const parsed = parseNfeXml(String(f?.content ?? ''));
        if (digits(parsed.destinatario.cnpj) !== orgCnpj) {
          throw new Error(`Nota não emitida para o CNPJ da empresa (destinatário ${parsed.destinatario.cnpj || 'sem CNPJ'}, empresa ${orgCnpj})`);
        }
        const { created } = await upsertNfe(h, orgId, parsed, 'upload', String(f.content));
        results.push({ name, ok: true, chave: parsed.chave, created });
      } catch (e) {
        results.push({ name, ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }
    res.json({ results });
  });
  return r;
}

export const nfeRouter: Router = createNfeRouter();
