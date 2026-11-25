import { Router, type Request, type Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { evaluateSafetyCrewCompliance, type SafetyComplianceSnapshot } from '../src/services/safetyCompliance.ts';
import { getSafetyNextStatus } from '../src/services/safetyManagement.ts';
import { areaLevelOf, requireArea } from './authMiddleware.ts';
import { getAdmin, type AdminHandles } from './firebaseAdmin.ts';

class SafetyRouteError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const validId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 180 && !value.includes('/');

const managerEvents = new Set(['approved', 'rejected', 'closed', 'cancelled']);
const supportedEvents = new Set(['submitted_for_approval', ...managerEvents, 'note_added']);

function canManagePermits(req: Request, orgId: string): boolean {
  const actor = req.user;
  if (!actor) return false;
  return actor.master || ['Admin', 'Gerente', 'Supervisor'].includes(actor.orgs?.[orgId] || '');
}

function toRows<T>(snap: { docs: Array<{ id: string; data: () => Record<string, unknown> }> }): T[] {
  return snap.docs.map((item) => ({ ...item.data(), id: item.id }) as unknown as T);
}

export function createSafetyRouter(getH: () => AdminHandles | null = getAdmin): Router {
  const router = Router();

  router.post('/permits/:permitId/transition', requireArea('operacoes', 2), async (req: Request, res: Response) => {
    const orgId = req.orgId;
    const permitId = req.params.permitId;
    const eventType = req.body?.eventType;
    const actor = req.user;
    if (!orgId || req.body?.orgId !== orgId || !validId(permitId) || !actor?.uid) {
      return res.status(400).json({ ok: false, error: 'Empresa, permissão ou usuário inválido.' });
    }
    if (typeof eventType !== 'string' || !supportedEvents.has(eventType)) {
      return res.status(400).json({ ok: false, error: 'Movimentação de APR/PT inválida.' });
    }
    if (managerEvents.has(eventType) && !canManagePermits(req, orgId)) {
      return res.status(403).json({ ok: false, error: 'Somente Supervisor, Gerente ou Admin podem concluir esta movimentação.' });
    }
    const comment = typeof req.body?.comment === 'string' ? req.body.comment.trim() : '';
    if (['rejected', 'closed', 'cancelled'].includes(eventType) && comment.length < 5) {
      return res.status(400).json({ ok: false, error: 'Informe uma justificativa com pelo menos 5 caracteres.' });
    }
    const h = getH();
    if (!h) return res.status(503).json({ ok: false, error: 'Servidor sem acesso ao banco de dados.' });

    const permitRef = h.db.collection('safety_permits').doc(permitId);
    const stateRef = h.db.collection('safety_permit_states').doc(permitId);

    try {
      const result = await h.db.runTransaction(async (tx) => {
        const [permitSnap, stateSnap] = await Promise.all([tx.get(permitRef), tx.get(stateRef)]);
        if (!permitSnap.exists || !stateSnap.exists) throw new SafetyRouteError(404, 'APR/PT ou estado não localizado.');
        const permit = { ...(permitSnap.data() || {}), id: permitSnap.id } as Record<string, any>;
        const state = { ...(stateSnap.data() || {}), id: stateSnap.id } as Record<string, any>;
        if (permit.orgId !== orgId || state.orgId !== orgId || state.permitId !== permitId) {
          throw new SafetyRouteError(403, 'APR/PT não pertence à empresa selecionada.');
        }
        if (managerEvents.has(eventType) && !canManagePermits(req, orgId)) {
          throw new SafetyRouteError(403, 'Perfil não autorizado para esta movimentação.');
        }
        if (eventType === 'approved') {
          if (permit.createdByUid === actor.uid) throw new SafetyRouteError(403, 'Quem criou a APR/PT não pode aprovar a própria permissão.');
          if (!permit.validUntil || new Date(permit.validUntil).getTime() <= Date.now()) {
            throw new SafetyRouteError(409, 'A validade da permissão terminou ou é inválida.');
          }
          if (permit.documentType === 'pt') {
            const aprId = permit.relatedAprId;
            if (!validId(aprId)) throw new SafetyRouteError(409, 'A PT não está vinculada a uma APR aprovada.');
            const aprRef = h.db.collection('safety_permits').doc(aprId);
            const aprStateRef = h.db.collection('safety_permit_states').doc(aprId);
            const [aprSnap, aprStateSnap] = await Promise.all([tx.get(aprRef), tx.get(aprStateRef)]);
            if (!aprSnap.exists || !aprStateSnap.exists) throw new SafetyRouteError(409, 'APR de referência não localizada.');
            const apr = aprSnap.data() || {};
            const aprState = aprStateSnap.data() || {};
            if (apr.orgId !== orgId || apr.unitId !== permit.unitId || apr.contractId !== permit.contractId
              || apr.documentType !== 'apr' || aprState.status !== 'approved') {
              throw new SafetyRouteError(409, 'A PT precisa estar vinculada a uma APR aprovada da mesma empresa, unidade e contrato.');
            }
          }
        }
        if (permit.documentType === 'pt' && ['submitted_for_approval', 'approved'].includes(eventType)) {
          const employeeIds = Array.isArray(permit.teamMemberIds) ? permit.teamMemberIds.filter((id: unknown): id is string => validId(id)) : [];
          if (employeeIds.length === 0 || employeeIds.length !== permit.teamMemberIds?.length) {
            throw new SafetyRouteError(409, 'PT bloqueada: a equipe não está vinculada aos funcionários do RH.');
          }

          const [employeeSnap, ppeSnap, movementSnap, trainingCatalogSnap, trainingRecordSnap, workersSnap] = await Promise.all([
            tx.get(h.db.collection('rh_directory').where('orgId', '==', orgId)),
            tx.get(h.db.collection('safety_ppe_catalog').where('orgId', '==', orgId)),
            tx.get(h.db.collection('safety_ppe_movements').where('orgId', '==', orgId)),
            tx.get(h.db.collection('safety_training_catalog').where('orgId', '==', orgId)),
            tx.get(h.db.collection('safety_training_records').where('orgId', '==', orgId)),
            tx.get(h.db.collection('field_workers').where('orgId', '==', orgId)),
          ]);
          const employees = toRows<SafetyComplianceSnapshot['employees'][number]>(employeeSnap);
          const workers = toRows<Record<string, any>>(workersSnap);
          const legacyTrainingRecords: SafetyComplianceSnapshot['legacyTrainingRecords'] = [];
          for (const employee of employees) {
            const workerId = 'fw_' + employee.id.replace(/^emp_/, '');
            const worker = workers.find((item) => item.rhEmployeeId === employee.id || item.id === workerId);
            for (const cert of Array.isArray(worker?.nrCertifications) ? worker.nrCertifications : []) {
              legacyTrainingRecords.push({
                employeeId: employee.id, code: String(cert.nrCode || ''), title: String(cert.title || cert.nrCode || 'Treinamento'),
                issueDate: cert.issueDate, expirationDate: cert.expirationDate,
                documentUrl: cert.documentUrl, documentName: cert.documentName,
              });
            }
          }
          const compliance: SafetyComplianceSnapshot = {
            loading: false, employees,
            ppeCatalog: toRows(ppeSnap),
            ppeMovements: toRows(movementSnap),
            trainingCatalog: toRows(trainingCatalogSnap),
            trainingRecords: toRows(trainingRecordSnap),
            legacyTrainingRecords,
          };
          const blockers = evaluateSafetyCrewCompliance(compliance, employeeIds, permit.permitType);
          if (blockers.length) {
            throw new SafetyRouteError(409, 'PT bloqueada por pendências de segurança: ' +
              blockers.map((item) => item.employeeName + ' — ' + item.message).join(' | '));
          }
        }

        const nextStatus = getSafetyNextStatus(state.status, eventType);
        if (!nextStatus) throw new SafetyRouteError(409, 'Movimentação não permitida para o status atual.');
        if (state.latestEventId !== req.body?.previousEventId) {
          throw new SafetyRouteError(409, 'A permissão foi movimentada por outra pessoa. Atualize a tela.');
        }
        const eventRef = h.db.collection('safety_permit_events').doc();
        const actorName = (actor.email || actor.uid).slice(0, 160);
        tx.create(eventRef, {
          orgId, unitId: permit.unitId, contractId: permit.contractId, permitId,
          eventType, actorUid: actor.uid, actorName,
          previousEventId: state.latestEventId,
          recordedAt: FieldValue.serverTimestamp(),
          ...(comment ? { comment } : {}),
        });
        tx.update(stateRef, {
          status: nextStatus, latestEventId: eventRef.id,
          updatedByUid: actor.uid, updatedByName: actorName,
          updatedAt: FieldValue.serverTimestamp(),
        });
        return { eventId: eventRef.id, status: nextStatus };
      });
      return res.status(200).json({ ok: true, ...result });
    } catch (error) {
      if (error instanceof SafetyRouteError) return res.status(error.status).json({ ok: false, error: error.message });
      console.error('[safety transition] failed:', error);
      return res.status(500).json({ ok: false, error: 'Não foi possível atualizar a permissão de segurança.' });
    }
  });

  return router;
}
