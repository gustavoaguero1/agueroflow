import { Router, type Request, type Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { evaluateSafetyCrewCompliance, type SafetyComplianceSnapshot } from '../src/services/safetyCompliance.ts';
import { getSafetyNextStatus } from '../src/services/safetyManagement.ts';
import type { SafetyPermitEventType } from '../src/types/safety.ts';
import { requireArea } from './authMiddleware.ts';
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
        if (['submitted_for_approval', 'approved'].includes(eventType)
          && (!permit.validUntil || new Date(permit.validUntil).getTime() <= Date.now())) {
          throw new SafetyRouteError(409, 'A validade da permissão terminou ou é inválida.');
        }
        if (eventType === 'approved' && permit.createdByUid === actor.uid) {
          throw new SafetyRouteError(403, 'Quem criou a APR/PT não pode aprovar a própria permissão.');
        }
        if (permit.documentType === 'pt' && ['submitted_for_approval', 'approved'].includes(eventType)) {
          const aprId = permit.relatedAprId;
          if (!validId(aprId)) throw new SafetyRouteError(409, 'A PT não está vinculada a uma APR aprovada.');
          const aprRef = h.db.collection('safety_permits').doc(aprId);
          const aprStateRef = h.db.collection('safety_permit_states').doc(aprId);
          const [aprSnap, aprStateSnap] = await Promise.all([tx.get(aprRef), tx.get(aprStateRef)]);
          if (!aprSnap.exists || !aprStateSnap.exists) throw new SafetyRouteError(409, 'APR de referência não localizada.');
          const apr = aprSnap.data() || {};
          const aprState = aprStateSnap.data() || {};
          if (apr.orgId !== orgId || apr.unitId !== permit.unitId || apr.contractId !== permit.contractId
            || apr.documentType !== 'apr' || aprState.status !== 'approved'
            || !apr.validFrom || !apr.validUntil || apr.validFrom > permit.validFrom
            || apr.validUntil < permit.validUntil) {
            throw new SafetyRouteError(409, 'A PT precisa estar vinculada a uma APR aprovada da mesma empresa, unidade e contrato.');
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
          if (new Set(employeeIds).size !== employeeIds.length) {
            throw new SafetyRouteError(409, 'PT bloqueada: a equipe contém colaboradores duplicados.');
          }
          const linkedEmployees = employeeIds.map((employeeId) => employees.find((item) => item.id === employeeId));
          const expectedNames = linkedEmployees.filter(Boolean).map((item) => item!.name).sort((x, y) => x.localeCompare(y, 'pt-BR'));
          const recordedNames = Array.isArray(permit.teamMembers)
            ? permit.teamMembers.filter((name: unknown): name is string => typeof name === 'string').slice().sort((x: string, y: string) => x.localeCompare(y, 'pt-BR'))
            : [];
          if (expectedNames.length !== employeeIds.length || recordedNames.length !== expectedNames.length
            || expectedNames.some((name, index) => name !== recordedNames[index])) {
            throw new SafetyRouteError(409, 'PT bloqueada: os nomes registrados precisam corresponder aos colaboradores do diretório RH.');
          }
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
          const blockers = evaluateSafetyCrewCompliance(compliance, employeeIds, permit.permitType, String(permit.validFrom || '').slice(0, 10), String(permit.validUntil || '').slice(0, 10));
          if (blockers.length) {
            throw new SafetyRouteError(409, 'PT bloqueada por pendências de segurança: ' +
              blockers.map((item) => item.employeeName + ' — ' + item.message).join(' | '));
          }
        }

        const nextStatus = getSafetyNextStatus(state.status, eventType as SafetyPermitEventType);
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

  const validDate = (value: unknown): value is string => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  };
  const dateToday = () => {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const part = (type: string) => parts.find((item) => item.type === type)?.value || '';
    return part('year') + '-' + part('month') + '-' + part('day');
  };
  const movementTime = (movement: Record<string, any>) => {
    const value = movement.createdAt;
    if (value instanceof Date) return value.getTime();
    if (value && typeof value.toMillis === 'function') return value.toMillis();
    return typeof movement.movementDate === 'string' ? Date.parse(movement.movementDate) : 0;
  };
  const activeIssue = (rows: Array<Record<string, any>>) => rows
    .slice().sort((a, b) => movementTime(a) - movementTime(b)
      || String(a.movementDate || '').localeCompare(String(b.movementDate || '')))
    .at(-1);

  router.post('/ppe-movements', requireArea('operacoes', 2), async (req: Request, res: Response) => {
    const orgId = req.orgId;
    const actor = req.user;
    const { employeeId, ppeId, eventType, movementDate, referenceMovementId } = req.body || {};
    const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim() : '';
    if (!orgId || req.body?.orgId !== orgId || !actor?.uid || !validId(employeeId) || !validId(ppeId)
      || !['entregue', 'devolvido'].includes(eventType) || !validDate(movementDate)
      || movementDate > dateToday() || notes.length > 500) {
      return res.status(400).json({ ok: false, error: 'Dados da movimentação de EPI inválidos.' });
    }
    if (eventType === 'devolvido' && !validId(referenceMovementId)) {
      return res.status(400).json({ ok: false, error: 'A devolução precisa referenciar a entrega original.' });
    }
    const h = getH();
    if (!h) return res.status(503).json({ ok: false, error: 'Servidor sem acesso ao banco de dados.' });
    try {
      const result = await h.db.runTransaction(async (tx) => {
        const employeeRef = h.db.collection('rh_directory').doc(employeeId);
        const ppeRef = h.db.collection('safety_ppe_catalog').doc(ppeId);
        const [employeeSnap, ppeSnap, movementSnap] = await Promise.all([
          tx.get(employeeRef), tx.get(ppeRef),
          tx.get(h.db.collection('safety_ppe_movements').where('orgId', '==', orgId)),
        ]);
        if (!employeeSnap.exists || employeeSnap.data()?.orgId !== orgId) {
          throw new SafetyRouteError(404, 'Colaborador não localizado no diretório do RH desta empresa.');
        }
        if (!ppeSnap.exists || ppeSnap.data()?.orgId !== orgId) {
          throw new SafetyRouteError(404, 'EPI não localizado no catálogo desta empresa.');
        }
        const employee = employeeSnap.data() || {};
        const ppe = ppeSnap.data() || {};
        const employeePpeHistory = toRows<Record<string, any>>(movementSnap).filter((item) => item.employeeId === employeeId && item.ppeId === ppeId);
        const latest = activeIssue(employeePpeHistory);
        if (eventType === 'entregue') {
          if (employee.active !== true) throw new SafetyRouteError(409, 'Não é possível entregar EPI a colaborador inativo no RH.');
          if (ppe.active !== true) throw new SafetyRouteError(409, 'Este EPI está inativo no catálogo.');
          if (typeof ppe.caNumber !== 'string' || !ppe.caNumber.trim()
            || typeof ppe.caExpiresAt !== 'string' || ppe.caExpiresAt < dateToday()) {
            throw new SafetyRouteError(409, 'Entrega bloqueada: o EPI está sem CA válido ou com CA vencido.');
          }
          if (latest?.eventType === 'entregue') {
            throw new SafetyRouteError(409, 'Este EPI já consta como entregue a este colaborador. Registre a devolução ou substituição antes de uma nova entrega.');
          }
        } else {
          if (!latest || latest.eventType !== 'entregue' || latest.id !== referenceMovementId) {
            throw new SafetyRouteError(409, 'Devolução recusada: não existe uma entrega ativa correspondente a este EPI.');
          }
        }
        const movementRef = h.db.collection('safety_ppe_movements').doc();
        const actorName = (actor.email || actor.uid).slice(0, 160);
        tx.create(movementRef, {
          id: movementRef.id, orgId, employeeId, employeeName: String(employee.name || '').slice(0, 180),
          ppeId, ppeName: String(ppe.name || '').slice(0, 120), eventType, movementDate,
          ...(eventType === 'devolvido' ? { referenceMovementId } : {}),
          ...(notes ? { notes } : {}),
          createdByUid: actor.uid, createdByName: actorName, createdAt: FieldValue.serverTimestamp(),
        });
        return { movementId: movementRef.id, eventType };
      });
      return res.status(201).json({ ok: true, ...result });
    } catch (error) {
      if (error instanceof SafetyRouteError) return res.status(error.status).json({ ok: false, error: error.message });
      console.error('[safety PPE movement] failed:', error);
      return res.status(500).json({ ok: false, error: 'Não foi possível registrar a movimentação do EPI.' });
    }
  });

  router.post('/ppe-movements/replace', requireArea('operacoes', 2), async (req: Request, res: Response) => {
    const orgId = req.orgId;
    const actor = req.user;
    const { employeeId, oldMovementId, newPpeId, movementDate } = req.body || {};
    const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim() : '';
    if (!orgId || req.body?.orgId !== orgId || !actor?.uid || !validId(employeeId)
      || !validId(oldMovementId) || !validId(newPpeId) || !validDate(movementDate)
      || movementDate > dateToday() || notes.length > 500) {
      return res.status(400).json({ ok: false, error: 'Dados da substituição de EPI inválidos.' });
    }
    const h = getH();
    if (!h) return res.status(503).json({ ok: false, error: 'Servidor sem acesso ao banco de dados.' });
    try {
      const result = await h.db.runTransaction(async (tx) => {
        const oldMovementRef = h.db.collection('safety_ppe_movements').doc(oldMovementId);
        const newPpeRef = h.db.collection('safety_ppe_catalog').doc(newPpeId);
        const employeeRef = h.db.collection('rh_directory').doc(employeeId);
        const [oldMovementSnap, newPpeSnap, employeeSnap] = await Promise.all([
          tx.get(oldMovementRef), tx.get(newPpeRef), tx.get(employeeRef),
        ]);
        if (!oldMovementSnap.exists || !newPpeSnap.exists || !employeeSnap.exists) {
          throw new SafetyRouteError(404, 'Entrega, colaborador ou novo EPI não localizado.');
        }
        const oldMovement = oldMovementSnap.data() || {};
        const employee = employeeSnap.data() || {};
        const newPpe = newPpeSnap.data() || {};
        if (oldMovement.orgId !== orgId || oldMovement.employeeId !== employeeId || oldMovement.eventType !== 'entregue') {
          throw new SafetyRouteError(409, 'A entrega original não pertence ao colaborador ou não está válida.');
        }
        if (employee.orgId !== orgId || employee.active !== true) {
          throw new SafetyRouteError(409, 'O colaborador está inativo ou não pertence à empresa.');
        }
        if (newPpe.orgId !== orgId || newPpe.active !== true || newPpeId === oldMovement.ppeId) {
          throw new SafetyRouteError(409, 'Selecione um EPI ativo e diferente do item atual.');
        }
        if (typeof newPpe.caNumber !== 'string' || !newPpe.caNumber.trim()
          || typeof newPpe.caExpiresAt !== 'string' || newPpe.caExpiresAt < dateToday()) {
          throw new SafetyRouteError(409, 'Substituição bloqueada: o novo EPI está sem CA válido ou com CA vencido.');
        }
        const movementHistory = await tx.get(h.db.collection('safety_ppe_movements').where('orgId', '==', orgId));
        const employeeMovements = toRows<Record<string, any>>(movementHistory).filter((item) => item.employeeId === employeeId);
        const latestOld = activeIssue(employeeMovements.filter((item) => item.ppeId === oldMovement.ppeId));
        const latestNew = activeIssue(employeeMovements.filter((item) => item.ppeId === newPpeId));
        if (!latestOld || latestOld.id !== oldMovementId || latestOld.eventType !== 'entregue') {
          throw new SafetyRouteError(409, 'O EPI atual já foi devolvido ou substituído. Atualize a tela.');
        }
        if (latestNew?.eventType === 'entregue') {
          throw new SafetyRouteError(409, 'O novo EPI já consta como entregue a este colaborador.');
        }
        const actorName = (actor.email || actor.uid).slice(0, 160);
        const returnRef = h.db.collection('safety_ppe_movements').doc();
        const deliveryRef = h.db.collection('safety_ppe_movements').doc();
        tx.create(returnRef, {
          id: returnRef.id, orgId, employeeId, employeeName: String(employee.name || '').slice(0, 180),
          ppeId: String(oldMovement.ppeId), ppeName: String(oldMovement.ppeName || '').slice(0, 120),
          eventType: 'devolvido', movementDate, referenceMovementId: oldMovementId,
          notes: notes || 'Devolução registrada durante substituição de EPI.',
          createdByUid: actor.uid, createdByName: actorName, createdAt: FieldValue.serverTimestamp(),
        });
        tx.create(deliveryRef, {
          id: deliveryRef.id, orgId, employeeId, employeeName: String(employee.name || '').slice(0, 180),
          ppeId: newPpeId, ppeName: String(newPpe.name || '').slice(0, 120),
          eventType: 'entregue', movementDate,
          notes: 'Substituição do EPI ' + String(oldMovement.ppeName || oldMovement.ppeId) + '. ' + notes,
          createdByUid: actor.uid, createdByName: actorName, createdAt: FieldValue.serverTimestamp(),
        });
        return { returnMovementId: returnRef.id, deliveryMovementId: deliveryRef.id };
      });
      return res.status(201).json({ ok: true, ...result });
    } catch (error) {
      if (error instanceof SafetyRouteError) return res.status(error.status).json({ ok: false, error: error.message });
      console.error('[safety PPE replacement] failed:', error);
      return res.status(500).json({ ok: false, error: 'Não foi possível substituir o EPI.' });
    }
  });

  return router;
}
