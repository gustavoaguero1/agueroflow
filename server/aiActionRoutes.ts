import crypto from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { getAdmin, type AdminHandles } from './firebaseAdmin.ts';
import {
  AI_ACTION_POLICIES,
  validateAiActionConfirmation,
  type AiActionProposal,
  type AiActionType,
} from '../src/services/aiActionGuard.ts';
import { resolveAreas } from '../src/permissions/areas.ts';
import type { UserRole } from '../src/types/index.ts';

const validId = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0 && v.length <= 180 && !v.includes('/');

export function createAiActionRouter(getH: () => AdminHandles | null = getAdmin): Router {
  const router = Router();

  // Step 1: Propose an AI-assisted action (creates draft only — NEVER writes to domain collections)
  router.post('/propose', async (req: Request, res: Response) => {
    const orgId = req.orgId;
    const actor = req.user;
    const b = req.body ?? {};
    if (!orgId || !actor) return res.status(401).json({ ok: false, error: 'Não autenticado.' });

    const actionType = String(b.actionType || '').trim() as AiActionType;
    const summary = String(b.summary || '').trim();
    const idempotencyKey = String(b.idempotencyKey || `${actionType}_${Date.now()}`).trim();
    const policy = AI_ACTION_POLICIES[actionType];
    if (!policy || summary.length < 5 || !b.payload || typeof b.payload !== 'object') {
      return res.status(400).json({ ok: false, error: 'Tipo de ação da IA, resumo ou payload inválidos.' });
    }
    const admin = getH();
    if (!admin) return res.status(503).json({ ok: false, error: 'Serviço indisponível.' });

    const now = new Date();
    const proposal: AiActionProposal = {
      id: `aia_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      orgId,
      actionType,
      summary,
      payload: b.payload as Record<string, unknown>,
      idempotencyKey,
      status: 'aguardando_confirmacao',
      proposedByUid: actor.uid,
      proposedByName: actor.email || actor.uid,
      proposedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
    };
    await admin.db.collection('ai_action_proposals').doc(proposal.id).set(proposal);
    return res.status(201).json({ ok: true, proposal, requiresHumanConfirmation: true });
  });

  // Step 2: Explicit human confirmation revalidating org + area + role + idempotency
  router.post('/:proposalId/confirm', async (req: Request, res: Response) => {
    const orgId = req.orgId;
    const actor = req.user;
    const proposalId = req.params.proposalId;
    if (!orgId || !actor || !validId(proposalId)) {
      return res.status(400).json({ ok: false, error: 'Proposta de ação inválida.' });
    }
    const admin = getH();
    if (!admin) return res.status(503).json({ ok: false, error: 'Serviço indisponível.' });

    try {
      const ref = admin.db.collection('ai_action_proposals').doc(proposalId);
      const outcome = await admin.db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const proposal = snap.exists ? ({ ...(snap.data() as AiActionProposal), id: snap.id }) : null;
        const actorRole = (actor.orgs?.[orgId] || 'Visualizador') as UserRole;
        const policy = proposal ? AI_ACTION_POLICIES[proposal.actionType] : undefined;
        const resolved = resolveAreas(actorRole);
        const areaLvl = policy ? resolved[policy.requiredArea] : 0;

        const check = validateAiActionConfirmation({
          proposal,
          actorUid: actor.uid,
          actorOrgId: orgId,
          actorRole,
          actorAreaLevel: areaLvl,
          isMaster: actor.master === true,
          explicitConfirmation: req.body?.confirmed === true,
        });
        if (!check.allowed || !proposal) {
          return { status: 403, error: check.reason || 'Confirmação negada.' };
        }

        const now = new Date().toISOString();
        const auditId = `aiaud_${proposal.id}`;
        tx.update(ref, {
          status: 'confirmada',
          confirmedByUid: actor.uid,
          confirmedByName: actor.email || actor.uid,
          confirmedAt: now,
          resultRefId: auditId,
        });
        tx.create(admin.db.collection('ai_action_audit').doc(auditId), {
          id: auditId,
          orgId,
          proposalId: proposal.id,
          actionType: proposal.actionType,
          summary: proposal.summary,
          idempotencyKey: proposal.idempotencyKey,
          confirmedByUid: actor.uid,
          confirmedByName: actor.email || actor.uid,
          confirmedByRole: actorRole,
          timestamp: now,
        });
        return { status: 200, auditId, confirmedAt: now };
      });
      if ('error' in outcome) return res.status(outcome.status).json({ ok: false, error: outcome.error });
      return res.status(200).json({ ok: true, ...outcome });
    } catch (err) {
      console.error('[ai action confirm] failed:', err);
      return res.status(500).json({ ok: false, error: 'Erro ao confirmar ação assistida por IA.' });
    }
  });

  return router;
}
