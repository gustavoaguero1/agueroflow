import crypto from 'node:crypto';
import express, { type Request, type Response, type Router } from 'express';
import { getAdmin, type AdminHandles } from './firebaseAdmin';
import { requireArea } from './authMiddleware';

const COLLECTION = 'hr_onboardings';
const ALLOWED_DOC_KEYS = new Set([
  'rgFront',
  'rgBack',
  'cpfDoc',
  'ctpsDoc',
  'pisDoc',
  'proofOfResidence',
  'asoDoc',
  'otherDoc',
]);
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);
const MAX_DOC_BYTES = 15 * 1024 * 1024;
const ALLOWED_STATUSES = new Set(['pending', 'submitted', 'approved', 'rejected', 'expired']);

export interface HrOnboardingRouterDeps {
  getAdminHandles?: () => AdminHandles | null;
  checkRateLimit?: (key: string, maxRequests: number, windowMs: number) => boolean;
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
      out[k] = stripUndefined(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function sanitizeFileName(raw: string): string {
  const cleaned = String(raw || 'documento')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  return cleaned || 'documento';
}

function parseDataUrl(input: string, fallbackMime: string): { mimeType: string; buffer: Buffer } {
  const trimmed = String(input || '').trim();
  const match = /^data:([^;]+);base64,(.+)$/i.exec(trimmed);
  const mimeType = (match?.[1] || fallbackMime || '').trim().toLowerCase();
  const base64Body = match ? match[2] : trimmed;
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error(`Tipo de arquivo não permitido (${mimeType || 'desconhecido'}). Envie PDF, JPG, PNG ou WEBP.`);
  }
  const buffer = Buffer.from(base64Body, 'base64');
  if (buffer.length === 0) {
    throw new Error('Arquivo anexo vazio ou inválido.');
  }
  if (buffer.length > MAX_DOC_BYTES) {
    throw new Error('Arquivo anexo excede o limite máximo de 15 MB.');
  }
  return { mimeType, buffer };
}

async function resolveOrganizationName(db: AdminHandles['db'], orgId: string): Promise<string> {
  if (!orgId) return 'RH da Empresa';
  try {
    const snap = await db.collection('organizations').doc(orgId).get();
    const data = snap.exists ? (snap.data() as Record<string, unknown> | undefined) : undefined;
    const name = typeof data?.name === 'string' && data.name.trim() ? data.name.trim() : '';
    return name || 'RH da Empresa';
  } catch {
    return 'RH da Empresa';
  }
}

export function createHrOnboardingRouter(deps: HrOnboardingRouterDeps = {}): Router {
  const router = express.Router();
  const resolveAdmin = deps.getAdminHandles ?? getAdmin;
  const allowRate = deps.checkRateLimit ?? (() => true);

  const requireAdminHandles = (res: Response): AdminHandles | null => {
    const handles = resolveAdmin();
    if (!handles) {
      res.status(503).json({
        success: false,
        error: 'Serviço de banco de dados indisponível no servidor.',
      });
      return null;
    }
    return handles;
  };

  // 1. Generate one-time registration link
  router.post('/generate-link', requireArea('rh', 2), async (req: Request, res: Response) => {
    try {
      const handles = requireAdminHandles(res);
      if (!handles) return;

      const organizationId = req.orgId;
      const createdBy = req.user!.email || req.user!.uid;
      if (!organizationId) {
        return res.status(400).json({ success: false, error: 'Organização não informada.' });
      }
      const {
        createdByName = 'Recursos Humanos',
        targetRole,
        targetDepartment,
        targetUnitId,
        targetContractId,
        proposedSalary,
        candidateName,
        candidateEmail,
        candidatePhone,
        expiresInDays = 7,
      } = req.body ?? {};

      if (!targetRole || !targetDepartment) {
        return res.status(400).json({
          success: false,
          error: 'Cargo e departamento são obrigatórios para emissão do link.',
        });
      }

      const validDays = Number.isFinite(Number(expiresInDays))
        ? Math.min(30, Math.max(1, Number(expiresInDays)))
        : 7;
      const randomPart = crypto.randomBytes(12).toString('hex');
      const token = `adm_${Date.now()}_${randomPart}`;
      const id = `onb_${Date.now()}_${randomPart.slice(0, 6)}`;

      const now = new Date();
      const expiresDate = new Date(now.getTime() + validDays * 24 * 60 * 60 * 1000);

      const onboardingRecord = stripUndefined({
        id,
        token,
        orgId: organizationId,
        organizationId,
        createdBy,
        createdByName,
        status: 'pending' as const,
        targetRole: String(targetRole).trim(),
        targetDepartment: String(targetDepartment).trim(),
        targetUnitId: targetUnitId ? String(targetUnitId).trim() : undefined,
        targetContractId: targetContractId ? String(targetContractId).trim() : undefined,
        proposedSalary:
          proposedSalary !== undefined && proposedSalary !== null && Number.isFinite(Number(proposedSalary)) && Number(proposedSalary) > 0
            ? Number(proposedSalary)
            : undefined,
        candidateName: candidateName ? String(candidateName).trim() : undefined,
        candidateEmail: candidateEmail ? String(candidateEmail).trim() : undefined,
        candidatePhone: candidatePhone ? String(candidatePhone).trim() : undefined,
        expiresAt: expiresDate.toISOString(),
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      });

      await handles.db.collection(COLLECTION).doc(id).set(onboardingRecord);

      const host = req.get('host') || 'localhost:3000';
      const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
      const linkUrl = `${protocol}://${host}/admissao?token=${token}`;

      res.json({
        success: true,
        message: 'Link de cadastro único gerado com sucesso!',
        onboarding: onboardingRecord,
        linkUrl,
      });
    } catch (err: any) {
      console.error('Erro ao gerar link de cadastro de colaborador:', err);
      res.status(500).json({ success: false, error: err?.message || 'Erro ao gerar link de cadastro' });
    }
  });

  // 2. Public verification of token status
  router.get('/check/:token', async (req: Request, res: Response) => {
    try {
      const handles = requireAdminHandles(res);
      if (!handles) return;

      const token = String(req.params.token || '').trim();
      if (!token) {
        return res.status(404).json({
          success: false,
          status: 'not_found',
          error: 'Link de admissão inválido ou inexistente. Por favor, entre em contato com o RH.',
        });
      }

      const snap = await handles.db.collection(COLLECTION).where('token', '==', token).limit(1).get();
      if (snap.empty) {
        return res.status(404).json({
          success: false,
          status: 'not_found',
          error: 'Link de admissão inválido ou inexistente. Por favor, entre em contato com o RH.',
        });
      }

      const docSnap = snap.docs[0];
      const onboarding = docSnap.data() as Record<string, any>;

      if (onboarding.expiresAt && new Date(onboarding.expiresAt).getTime() < Date.now()) {
        if (onboarding.status !== 'expired' && onboarding.status !== 'submitted' && onboarding.status !== 'approved') {
          await docSnap.ref.set({ status: 'expired', updatedAt: new Date().toISOString() }, { merge: true });
        }
        return res.json({
          success: false,
          status: 'expired',
          error: 'Este link de cadastro expirou. Solicite um novo link ao RH.',
          expiresAt: onboarding.expiresAt,
        });
      }

      if (onboarding.status === 'submitted' || onboarding.status === 'approved') {
        return res.json({
          success: false,
          status: onboarding.status,
          error: 'Este link de cadastro já foi utilizado e as informações foram recebidas com segurança.',
          submittedAt: onboarding.submittedAt,
        });
      }

      const orgId = String(onboarding.organizationId || onboarding.orgId || '');
      const companyName = await resolveOrganizationName(handles.db, orgId);

      res.json({
        success: true,
        status: 'valid',
        data: {
          id: onboarding.id,
          token: onboarding.token,
          targetRole: onboarding.targetRole,
          targetDepartment: onboarding.targetDepartment,
          candidateName: onboarding.candidateName,
          candidateEmail: onboarding.candidateEmail,
          candidatePhone: onboarding.candidatePhone,
          proposedSalary: onboarding.proposedSalary,
          expiresAt: onboarding.expiresAt,
          companyName,
        },
      });
    } catch (err: any) {
      console.error('Erro ao verificar token de admissão:', err);
      res.status(500).json({ success: false, error: err?.message || 'Erro ao verificar token' });
    }
  });

  // 3. Public submit of candidate data and document uploads (documents stored in Firebase Storage)
  router.post('/submit', async (req: Request, res: Response) => {
    try {
      const clientIp = req.user?.uid ?? req.ip ?? 'unknown';
      if (!allowRate(`onb_submit_${clientIp}`, 15, 60 * 1000)) {
        return res.status(429).json({ error: 'Muitas tentativas de envio. Aguarde alguns instantes.' });
      }

      const handles = requireAdminHandles(res);
      if (!handles) return;

      const { token, submittedData } = req.body ?? {};
      if (!token || !submittedData || typeof submittedData !== 'object') {
        return res.status(400).json({ success: false, error: 'Token ou dados de cadastro não informados.' });
      }

      if (!submittedData.fullName || !submittedData.cpf || !submittedData.rgNumber) {
        return res.status(400).json({ success: false, error: 'Nome completo, CPF e RG são obrigatórios.' });
      }

      if (!submittedData.acceptedLgpd) {
        return res.status(400).json({
          success: false,
          error: 'É necessário aceitar os termos de consentimento LGPD para envio do cadastro.',
        });
      }

      const snap = await handles.db.collection(COLLECTION).where('token', '==', String(token)).limit(1).get();
      if (snap.empty) {
        return res.status(404).json({ success: false, error: 'Link de cadastro não encontrado ou inválido.' });
      }

      const docSnap = snap.docs[0];
      const existing = docSnap.data() as Record<string, any>;
      const orgId = String(existing.organizationId || existing.orgId || '');
      const onboardingId = String(existing.id || docSnap.id);

      if (existing.expiresAt && new Date(existing.expiresAt).getTime() < Date.now()) {
        await docSnap.ref.set({ status: 'expired', updatedAt: new Date().toISOString() }, { merge: true });
        return res.status(400).json({
          success: false,
          error: 'Este link de cadastro expirou. Solicite um novo link ao RH da empresa.',
        });
      }

      if (existing.status === 'submitted' || existing.status === 'approved') {
        return res.status(400).json({
          success: false,
          error: 'Este link já foi utilizado para envio de cadastro anteriormente.',
        });
      }

      const nowIso = new Date().toISOString();
      const rawDocs =
        submittedData.documents && typeof submittedData.documents === 'object'
          ? (submittedData.documents as Record<string, any>)
          : {};
      const persistedDocs: Record<string, unknown> = {};

      for (const [docKey, attachment] of Object.entries(rawDocs)) {
        if (!ALLOWED_DOC_KEYS.has(docKey) || !attachment || typeof attachment !== 'object') continue;
        const fileName = sanitizeFileName(attachment.fileName || `${docKey}`);
        const uploadedAt = typeof attachment.uploadedAt === 'string' ? attachment.uploadedAt : nowIso;

        if (typeof attachment.dataBase64 === 'string' && attachment.dataBase64.trim()) {
          const { mimeType, buffer } = parseDataUrl(attachment.dataBase64, attachment.mimeType || '');
          const storagePath = `hr-onboardings/${orgId}/${onboardingId}/${docKey}_${Date.now()}_${fileName}`;
          await handles.bucket.file(storagePath).save(buffer, {
            contentType: mimeType,
            metadata: {
              cacheControl: 'private, max-age=0',
              metadata: { orgId, onboardingId, docKey },
            },
          });
          persistedDocs[docKey] = {
            fileName,
            mimeType,
            storagePath,
            sizeBytes: buffer.length,
            uploadedAt,
          };
        } else if (typeof attachment.storagePath === 'string' && attachment.storagePath.startsWith(`hr-onboardings/${orgId}/`)) {
          persistedDocs[docKey] = stripUndefined({
            fileName,
            mimeType: attachment.mimeType || 'application/octet-stream',
            storagePath: attachment.storagePath,
            sizeBytes: attachment.sizeBytes,
            uploadedAt,
          });
        }
      }

      const sanitizedSubmittedData = stripUndefined({
        ...submittedData,
        documents: persistedDocs,
        acceptedAt: nowIso,
        clientIp: clientIp || 'remote',
      });

      await docSnap.ref.set(
        {
          status: 'submitted',
          submittedAt: nowIso,
          updatedAt: nowIso,
          submittedData: sanitizedSubmittedData,
        },
        { merge: true },
      );

      res.json({
        success: true,
        message: 'Cadastro e documentos recebidos com sucesso no AgueroFlow!',
        protocol: onboardingId,
        submittedAt: nowIso,
      });
    } catch (err: any) {
      console.error('Erro ao submeter cadastro de colaborador:', err);
      res.status(400).json({ success: false, error: err?.message || 'Erro ao processar cadastro' });
    }
  });

  // 4. List all onboarding invitations for HR
  router.get('/list', requireArea('rh', 1), async (req: Request, res: Response) => {
    try {
      const handles = requireAdminHandles(res);
      if (!handles) return;

      const orgId = req.orgId;
      const snap = orgId
        ? await handles.db.collection(COLLECTION).where('organizationId', '==', orgId).get()
        : await handles.db.collection(COLLECTION).get();

      const list = snap.docs
        .map((d): Record<string, any> => ({ id: d.id, ...(d.data() as Record<string, any>) }))
        .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

      res.json({ success: true, count: list.length, data: list });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Erro ao listar admissões' });
    }
  });

  // 5. Secure RH-only document download from Firebase Storage
  router.get('/:id/document/:docKey', requireArea('rh', 1), async (req: Request, res: Response) => {
    try {
      const handles = requireAdminHandles(res);
      if (!handles) return;

      const { id, docKey } = req.params;
      if (!id || !ALLOWED_DOC_KEYS.has(docKey)) {
        return res.status(400).json({ success: false, error: 'Documento inválido.' });
      }

      const snap = await handles.db.collection(COLLECTION).doc(id).get();
      if (!snap.exists) {
        return res.status(404).json({ success: false, error: 'Admissão não encontrada.' });
      }

      const onboarding = snap.data() as Record<string, any>;
      const ownerOrg = String(onboarding.organizationId || onboarding.orgId || '');
      if (!req.user!.master && ownerOrg !== req.orgId) {
        return res.status(403).json({ error: 'forbidden' });
      }

      const docEntry = onboarding.submittedData?.documents?.[docKey];
      if (!docEntry) {
        return res.status(404).json({ success: false, error: 'Anexo não localizado nesta admissão.' });
      }

      if (typeof docEntry.dataBase64 === 'string' && docEntry.dataBase64) {
        return res.json({
          success: true,
          fileName: docEntry.fileName || docKey,
          mimeType: docEntry.mimeType || 'application/octet-stream',
          dataBase64: docEntry.dataBase64,
        });
      }

      const storagePath = String(docEntry.storagePath || '');
      if (!storagePath.startsWith(`hr-onboardings/${ownerOrg}/`)) {
        return res.status(403).json({ error: 'forbidden' });
      }

      const [buffer] = await handles.bucket.file(storagePath).download();
      const mimeType = docEntry.mimeType || 'application/octet-stream';
      const dataBase64 = `data:${mimeType};base64,${buffer.toString('base64')}`;

      res.json({
        success: true,
        fileName: docEntry.fileName || docKey,
        mimeType,
        dataBase64,
      });
    } catch (err: any) {
      console.error('Erro ao baixar documento de admissão:', err);
      res.status(500).json({ success: false, error: err?.message || 'Erro ao carregar documento de admissão' });
    }
  });

  // 6. Update status (Approve / Reject / Efetivar)
  router.post('/:id/status', requireArea('rh', 2), async (req: Request, res: Response) => {
    try {
      const handles = requireAdminHandles(res);
      if (!handles) return;

      const { id } = req.params;
      const { status, reviewNotes, reviewedBy, resultingEmployeeId } = req.body ?? {};

      if (!id || !status || !ALLOWED_STATUSES.has(String(status))) {
        return res.status(400).json({ success: false, error: 'ID e status válido são obrigatórios.' });
      }

      const ref = handles.db.collection(COLLECTION).doc(id);
      const snap = await ref.get();
      if (!snap.exists) {
        return res.status(404).json({ success: false, error: 'Registro de admissão não encontrado.' });
      }

      const existing = snap.data() as Record<string, any>;
      const ownerOrg = String(existing.organizationId || existing.orgId || '');
      if (!req.user!.master && ownerOrg !== req.orgId) {
        return res.status(403).json({ error: 'forbidden' });
      }

      const nowIso = new Date().toISOString();
      const patch = stripUndefined({
        status: String(status),
        updatedAt: nowIso,
        reviewNotes: reviewNotes !== undefined ? String(reviewNotes) : undefined,
        reviewedBy: reviewedBy !== undefined ? String(reviewedBy) : undefined,
        reviewedAt: reviewedBy !== undefined ? nowIso : undefined,
        resultingEmployeeId: resultingEmployeeId !== undefined ? String(resultingEmployeeId) : undefined,
      });

      await ref.set(patch, { merge: true });
      res.json({ success: true, message: `Status de admissão atualizado para '${status}' com sucesso.` });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Erro ao atualizar status de admissão' });
    }
  });

  // 7. Delete onboarding link record (and best-effort remove private Storage files)
  router.delete('/:id', requireArea('rh', 2), async (req: Request, res: Response) => {
    try {
      const handles = requireAdminHandles(res);
      if (!handles) return;

      const { id } = req.params;
      const ref = handles.db.collection(COLLECTION).doc(id);
      const snap = await ref.get();
      if (snap.exists) {
        const existing = snap.data() as Record<string, any>;
        const ownerOrg = String(existing.organizationId || existing.orgId || '');
        if (!req.user!.master && ownerOrg !== req.orgId) {
          return res.status(403).json({ error: 'forbidden' });
        }

        const docs = existing.submittedData?.documents;
        if (docs && typeof docs === 'object') {
          await Promise.allSettled(
            Object.values(docs as Record<string, any>)
              .map((entry) => entry?.storagePath)
              .filter((p): p is string => typeof p === 'string' && p.startsWith(`hr-onboardings/${ownerOrg}/`))
              .map((storagePath) => handles.bucket.file(storagePath).delete({ ignoreNotFound: true })),
          );
        }
        await ref.delete();
      }

      res.json({ success: true, message: 'Registro de admissão excluído com sucesso.' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Erro ao excluir registro de admissão' });
    }
  });

  return router;
}
