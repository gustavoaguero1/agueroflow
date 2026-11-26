import { createHash, randomUUID } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import type { ChecklistItemDef, ChecklistItemType, ChecklistTemplate, ChecklistRun } from '../src/types/index.ts';
import { validateChecklistSubmission } from '../src/services/checklistValidation.ts';
import { requireModuleAccess } from './authMiddleware.ts';
import { getAdmin, type AdminHandles } from './firebaseAdmin.ts';

class ChecklistRouteError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const idOk = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= 180 && !value.includes('/');
const itemTypes: ChecklistItemType[] = ['sim_nao', 'multipla_escolha', 'texto', 'numerico', 'foto', 'assinatura'];
const actorName = (req: Request) => req.user?.email || req.user?.uid || 'Usuário';
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex');

function parseTemplatePayload(body: any): { title: string; description: string; category: string; items: ChecklistItemDef[] } {
  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  const description = typeof body?.description === 'string' ? body.description.trim() : '';
  const category = typeof body?.category === 'string' ? body.category.trim() : '';
  const rawItems = body?.items;

  if (title.length < 3 || title.length > 160) throw new ChecklistRouteError(400, 'O título do template deve ter de 3 a 160 caracteres.');
  if (description.length > 1500) throw new ChecklistRouteError(400, 'A descrição do template excede 1.500 caracteres.');
  if (category.length < 2 || category.length > 100) throw new ChecklistRouteError(400, 'Informe uma categoria válida para o template.');
  if (!Array.isArray(rawItems) || rawItems.length < 1 || rawItems.length > 100) {
    throw new ChecklistRouteError(400, 'O template deve possuir entre 1 e 100 itens.');
  }

  const seen = new Set<string>();
  const items = rawItems.map((raw: any, index: number): ChecklistItemDef => {
    const id = typeof raw?.id === 'string' ? raw.id.trim() : '';
    const itemTitle = typeof raw?.title === 'string' ? raw.title.trim() : '';
    const type = raw?.type;
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(id) || seen.has(id)) {
      throw new ChecklistRouteError(400, `Identificador inválido ou duplicado no item ${index + 1}.`);
    }
    seen.add(id);
    if (itemTitle.length < 2 || itemTitle.length > 180) {
      throw new ChecklistRouteError(400, `O item ${index + 1} precisa de um título entre 2 e 180 caracteres.`);
    }
    if (!itemTypes.includes(type)) throw new ChecklistRouteError(400, `Tipo de resposta inválido no item ${itemTitle}.`);
    if (typeof raw?.required !== 'boolean') throw new ChecklistRouteError(400, `Defina se o item ${itemTitle} é obrigatório.`);

    let options: string[] | undefined;
    if (type === 'multipla_escolha') {
      if (!Array.isArray(raw.options) || raw.options.length < 2 || raw.options.length > 30
        || raw.options.some((option: unknown) => typeof option !== 'string' || !option.trim() || option.length > 120)) {
        throw new ChecklistRouteError(400, `Informe ao menos duas opções válidas para ${itemTitle}.`);
      }
      const cleanOptions = (raw.options as string[]).map((option) => option.trim());
      options = Array.from(new Set<string>(cleanOptions));
      if (!options || options.length < 2) throw new ChecklistRouteError(400, `As opções de ${itemTitle} precisam ser diferentes.`);
    }

    return {
      id,
      title: itemTitle,
      ...(typeof raw.description === 'string' && raw.description.trim() ? { description: raw.description.trim().slice(0, 500) } : {}),
      type,
      ...(options ? { options } : {}),
      required: raw.required,
    };
  });

  return { title, description, category, items };
}

function routeError(res: Response, error: unknown, context: string) {
  if (error instanceof ChecklistRouteError) {
    return res.status(error.status).json({ ok: false, error: error.message });
  }
  console.error(`[${context}] failed:`, error);
  return res.status(500).json({ ok: false, error: 'Não foi possível concluir a operação de checklist.' });
}

export function createChecklistRouter(getH: () => AdminHandles | null = getAdmin): Router {
  const router = Router();

  router.post('/templates', requireModuleAccess('checklists', 2, getH), async (req: Request, res: Response) => {
    const orgId = req.orgId;
    const actor = req.user;
    if (!orgId || req.body?.orgId !== orgId) return res.status(400).json({ ok: false, error: 'Empresa inválida para criar o template.' });
    if (!actor?.uid) return res.status(401).json({ ok: false, error: 'Usuário não autenticado.' });
    const admin = getH();
    if (!admin) return res.status(503).json({ ok: false, error: 'Serviço de dados indisponível.' });

    try {
      const parsed = parseTemplatePayload(req.body);
      const now = new Date().toISOString();
      const templateId = `chk_${randomUUID().replace(/-/g, '')}`;
      const template: ChecklistTemplate & { version: number; createdBy: string; createdByName: string } = {
        id: templateId,
        orgId,
        ...parsed,
        version: 1,
        createdBy: actor.uid,
        createdByName: actorName(req),
        createdAt: now,
        updatedAt: now,
      };
      const templateRef = admin.db.collection('checklist_templates').doc(templateId);
      const eventId = `checklist_template_evt_${templateId}_v1`;
      const eventRef = admin.db.collection('checklist_template_events').doc(eventId);

      await admin.db.runTransaction(async (tx) => {
        tx.create(templateRef, template);
        tx.create(eventRef, {
          id: eventId,
          orgId,
          templateId,
          version: 1,
          eventType: 'created',
          actorUid: actor.uid,
          actorName: actorName(req),
          snapshot: template,
          recordedAt: now,
        });
      });
      return res.status(201).json({ ok: true, template });
    } catch (error) {
      return routeError(res, error, 'checklist template create');
    }
  });

  router.put('/templates/:templateId', requireModuleAccess('checklists', 2, getH), async (req: Request, res: Response) => {
    const orgId = req.orgId;
    const actor = req.user;
    const templateId = req.params.templateId;
    if (!orgId || req.body?.orgId !== orgId || !idOk(templateId)) {
      return res.status(400).json({ ok: false, error: 'Empresa ou template inválido.' });
    }
    if (!actor?.uid) return res.status(401).json({ ok: false, error: 'Usuário não autenticado.' });
    const admin = getH();
    if (!admin) return res.status(503).json({ ok: false, error: 'Serviço de dados indisponível.' });

    try {
      const parsed = parseTemplatePayload(req.body);
      const templateRef = admin.db.collection('checklist_templates').doc(templateId);
      const now = new Date().toISOString();
      const versionEventId = `checklist_template_evt_${templateId}_v`;
      const updated = await admin.db.runTransaction(async (tx) => {
        const snap = await tx.get(templateRef);
        if (!snap.exists || snap.data()?.orgId !== orgId) {
          throw new ChecklistRouteError(404, 'Template não encontrado.');
        }
        const current = snap.data() as ChecklistTemplate & { version?: number };
        const version = Number.isInteger(current.version) && (current.version as number) > 0
          ? (current.version as number) + 1 : 2;
        const next: ChecklistTemplate & { version: number; updatedBy: string; updatedByName: string } = {
          ...current,
          ...parsed,
          version,
          updatedBy: actor.uid,
          updatedByName: actorName(req),
          updatedAt: now,
        };
        const eventId = versionEventId + version;
        const eventRef = admin.db.collection('checklist_template_events').doc(eventId);
        tx.update(templateRef, next);
        tx.create(eventRef, {
          id: eventId,
          orgId,
          templateId,
          version,
          eventType: 'version_created',
          actorUid: actor.uid,
          actorName: actorName(req),
          snapshot: next,
          recordedAt: now,
        });
        return next;
      });
      return res.status(200).json({ ok: true, template: updated });
    } catch (error) {
      return routeError(res, error, 'checklist template version');
    }
  });

  router.post('/templates/:templateId/runs', requireModuleAccess('checklists', 2, getH), async (req: Request, res: Response) => {
    const orgId = req.orgId;
    const actor = req.user;
    const templateId = req.params.templateId;
    const body = req.body ?? {};
    const unitId = body.unitId || '';
    const orderId = body.orderId || '';
    const idempotencyKey = body.idempotencyKey;
    if (!orgId || body.orgId !== orgId || !idOk(templateId)
      || (unitId && !idOk(unitId)) || (orderId && !idOk(orderId))
      || typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(idempotencyKey)) {
      return res.status(400).json({ ok: false, error: 'Informe os dados válidos para concluir o checklist.' });
    }
    if (!actor?.uid) return res.status(401).json({ ok: false, error: 'Usuário não autenticado.' });
    const admin = getH();
    if (!admin) return res.status(503).json({ ok: false, error: 'Serviço de dados indisponível.' });

    const answersHash = digest(body.answers);
    const opId = createHash('sha256').update(`${orgId}:${templateId}:${idempotencyKey}`).digest('hex');
    const opRef = admin.db.collection('checklist_run_ops').doc(opId);
    const templateRef = admin.db.collection('checklist_templates').doc(templateId);
    const unitRef = unitId ? admin.db.collection('units').doc(unitId) : null;
    const orderRef = orderId ? admin.db.collection('work_orders').doc(orderId) : null;
    const runId = `run_${randomUUID().replace(/-/g, '')}`;
    const runRef = admin.db.collection('checklist_runs').doc(runId);
    const eventId = `checklist_run_evt_${opId}`;
    const eventRef = admin.db.collection('checklist_run_events').doc(eventId);

    try {
      const result = await admin.db.runTransaction(async (tx) => {
        const opSnap = await tx.get(opRef);
        if (opSnap.exists) {
          const previous = opSnap.data() as Record<string, any>;
          if (previous.orgId !== orgId || previous.templateId !== templateId
            || previous.actorUid !== actor.uid || previous.answersHash !== answersHash) {
            throw new ChecklistRouteError(409, 'Esta chave de operação já foi usada em outro checklist.');
          }
          const existingRunRef = admin.db.collection('checklist_runs').doc(previous.runId);
          const existingRunSnap = await tx.get(existingRunRef);
          if (!existingRunSnap.exists) throw new ChecklistRouteError(409, 'A execução idempotente não foi encontrada. Solicite suporte.');
          return { replayed: true, run: existingRunSnap.data() };
        }

        const refs: any[] = [tx.get(templateRef)];
        if (unitRef) refs.push(tx.get(unitRef));
        if (orderRef) refs.push(tx.get(orderRef));
        const snapshots = await Promise.all(refs);
        const templateSnap = snapshots[0];
        if (!templateSnap.exists || templateSnap.data()?.orgId !== orgId) {
          throw new ChecklistRouteError(404, 'Template não encontrado para esta empresa.');
        }
        const template = templateSnap.data() as ChecklistTemplate & { version?: number };
        const validation = validateChecklistSubmission(template, body.answers);
        if (!validation.canComplete) {
          throw new ChecklistRouteError(400, validation.errors.slice(0, 5).join(' '));
        }

        let cursor = 1;
        if (unitRef) {
          const unitSnap = snapshots[cursor++];
          if (!unitSnap.exists || unitSnap.data()?.orgId !== orgId) {
            throw new ChecklistRouteError(400, 'A unidade informada não pertence à empresa.');
          }
        }
        if (orderRef) {
          const orderSnap = snapshots[cursor];
          const order = orderSnap.data() as Record<string, any> | undefined;
          if (!orderSnap.exists || order?.orgId !== orgId || (unitId && order?.unitId !== unitId)) {
            throw new ChecklistRouteError(400, 'A OS informada não pertence à empresa/unidade.');
          }
        }

        const now = new Date().toISOString();
        const version = Number.isInteger(template.version) && (template.version as number) > 0
          ? template.version as number : 1;
        const snapshot: ChecklistTemplate = {
          id: template.id,
          orgId: template.orgId,
          title: template.title,
          description: template.description,
          category: template.category,
          items: template.items.map((item) => ({ ...item, ...(item.options ? { options: [...item.options] } : {}) })),
          version,
          createdAt: template.createdAt,
          updatedAt: template.updatedAt,
        };
        const run: ChecklistRun & { templateVersion: number; templateSnapshot: ChecklistTemplate } = {
          id: runId,
          orgId,
          ...(unitId ? { unitId } : {}),
          ...(orderId ? { orderId } : {}),
          templateId,
          templateTitle: template.title,
          templateVersion: version,
          templateSnapshot: snapshot,
          inspectorId: actor.uid,
          inspectorName: actorName(req),
          progressPercent: validation.progressPercent,
          nonConformityCount: validation.nonConformityCount,
          hasNonConformities: validation.nonConformityCount > 0,
          answers: validation.answers,
          status: 'concluido',
          completedAt: now,
          createdAt: now,
          updatedAt: now,
        };
        tx.create(runRef, run);
        tx.create(eventRef, {
          id: eventId,
          orgId,
          runId,
          templateId,
          templateVersion: version,
          eventType: 'completed',
          actorUid: actor.uid,
          actorName: actorName(req),
          progressPercent: run.progressPercent,
          nonConformityCount: run.nonConformityCount,
          recordedAt: now,
        });
        tx.create(opRef, {
          id: opId,
          orgId,
          templateId,
          actorUid: actor.uid,
          idempotencyKey,
          answersHash,
          runId,
          createdAt: now,
        });
        return { replayed: false, run };
      });
      return res.status(result.replayed ? 200 : 201).json({ ok: true, ...result });
    } catch (error) {
      if (error instanceof ChecklistRouteError) {
        return res.status(error.status).json({ ok: false, error: error.message });
      }
      const code = (error as { code?: number | string })?.code;
      if (code === 6 || code === 'already-exists' || code === 10 || code === 'aborted') {
        return res.status(409).json({ ok: false, error: 'O checklist foi concluído em paralelo. Atualize o histórico antes de tentar novamente.' });
      }
      console.error('[checklist completion] failed:', error);
      return res.status(500).json({ ok: false, error: 'Não foi possível concluir o checklist no servidor.' });
    }
  });

  return router;
}
