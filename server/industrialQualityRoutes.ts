import crypto from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { requireModuleAccess } from './authMiddleware.ts';
import { getAdmin, type AdminHandles } from './firebaseAdmin.ts';
import {
  compileProjectDataBook,
  validateNdtReportPrerequisites,
  validateWeldJointPrerequisites,
} from '../src/services/industrialQualityRules.ts';
import type {
  MaterialLot,
  NdtMethod,
  NdtReport,
  QualityItpMatrix,
  WeldJoint,
  WelderQualification,
  WeldingProcedure,
} from '../src/types/industrialQuality.ts';

class IndustrialQualityRouteError extends Error {
  constructor(public status: number, message: string, public details?: string[]) {
    super(message);
  }
}

const validId = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0 && v.length <= 180 && !v.includes('/');

const orgOf = (d: Record<string, any> | undefined): string =>
  String(d?.orgId ?? d?.organizationId ?? '');

const newId = (prefix: string) => `${prefix}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

export function createIndustrialQualityRouter(getH: () => AdminHandles | null = getAdmin): Router {
  const router = Router();

  // 1. Register Welding Procedure (EPS / WPS / PQR)
  router.post('/procedures', requireModuleAccess('obras', 2, getH), async (req: Request, res: Response) => {
    const orgId = req.orgId;
    const actor = req.user;
    const b = req.body ?? {};
    if (!orgId || !actor) return res.status(401).json({ ok: false, error: 'Não autenticado.' });
    const code = String(b.code || '').trim().toUpperCase();
    const title = String(b.title || '').trim();
    const process = String(b.process || '').trim().toUpperCase();
    const baseMetal = String(b.baseMetal || '').trim();
    const fillerMetal = String(b.fillerMetal || '').trim();
    const revision = String(b.revision || 'Rev 0').trim();
    if (code.length < 3 || title.length < 3 || !['TIG', 'MIG', 'MAG', 'ER', 'SAW', 'FCAW', 'ORBITAL'].includes(process) || !baseMetal || !fillerMetal) {
      return res.status(400).json({ ok: false, error: 'Informe código, título, processo, metal base e metal de adição válidos.' });
    }
    const admin = getH();
    if (!admin) return res.status(503).json({ ok: false, error: 'Serviço indisponível.' });
    const now = new Date().toISOString();
    const proc: WeldingProcedure = {
      id: newId('eps'),
      orgId,
      code,
      title,
      process: process as WeldingProcedure['process'],
      baseMetal,
      fillerMetal,
      ...(b.thicknessRangeMm ? { thicknessRangeMm: String(b.thicknessRangeMm).trim() } : {}),
      revision,
      status: 'ativa',
      ...(validId(b.engineeringDocumentId) ? { engineeringDocumentId: String(b.engineeringDocumentId).trim() } : {}),
      createdByUid: actor.uid,
      createdByName: actor.email || actor.uid,
      createdAt: now,
      updatedAt: now,
    };
    await admin.db.collection('welding_procedures').doc(proc.id).set(proc);
    return res.status(201).json({ ok: true, procedure: proc });
  });

  // 2. Register Welder Qualification & Stamp (linked to official rh_directory)
  router.post('/welder-qualifications', requireModuleAccess('obras', 2, getH), async (req: Request, res: Response) => {
    const orgId = req.orgId;
    const actor = req.user;
    const b = req.body ?? {};
    if (!orgId || !actor) return res.status(401).json({ ok: false, error: 'Não autenticado.' });
    const rhEmployeeId = String(b.rhEmployeeId || '').trim();
    const stampCode = String(b.stampCode || '').trim().toUpperCase();
    const process = String(b.process || '').trim().toUpperCase();
    const qualifiedAt = String(b.qualifiedAt || '').trim();
    const qualifiedUntil = String(b.qualifiedUntil || '').trim();
    if (!validId(rhEmployeeId) || stampCode.length < 2 || !['TIG', 'MIG', 'MAG', 'ER', 'SAW', 'FCAW', 'ORBITAL'].includes(process) || !/^\d{4}-\d{2}-\d{2}$/.test(qualifiedAt) || !/^\d{4}-\d{2}-\d{2}$/.test(qualifiedUntil) || qualifiedUntil <= qualifiedAt) {
      return res.status(400).json({ ok: false, error: 'Informe colaborador oficial do RH, sinete, processo e vigência válidos.' });
    }
    const admin = getH();
    if (!admin) return res.status(503).json({ ok: false, error: 'Serviço indisponível.' });
    try {
      const empSnap = await admin.db.collection('rh_directory').doc(rhEmployeeId).get();
      if (!empSnap.exists || orgOf(empSnap.data()) !== orgId) {
        return res.status(400).json({ ok: false, error: 'Colaborador não encontrado no diretório oficial de RH desta empresa.' });
      }
      const empName = String(empSnap.data()?.fullName || empSnap.data()?.name || rhEmployeeId);
      const epsIds = Array.isArray(b.epsIds) ? b.epsIds.map((x: unknown) => String(x || '').trim()).filter(Boolean) : [];
      const epsCodes = Array.isArray(b.epsCodes) ? b.epsCodes.map((x: unknown) => String(x || '').trim()).filter(Boolean) : [];
      const now = new Date().toISOString();
      const qual: WelderQualification = {
        id: newId('wqual'),
        orgId,
        rhEmployeeId,
        employeeName: empName,
        stampCode,
        process: process as WelderQualification['process'],
        epsIds,
        epsCodes,
        qualifiedAt,
        qualifiedUntil,
        ...(b.certificateStoragePath ? { certificateStoragePath: String(b.certificateStoragePath).trim() } : {}),
        status: qualifiedUntil < now.slice(0, 10) ? 'vencida' : 'ativa',
        createdByUid: actor.uid,
        createdByName: actor.email || actor.uid,
        createdAt: now,
        updatedAt: now,
      };
      await admin.db.collection('welder_qualifications').doc(qual.id).set(qual);
      return res.status(201).json({ ok: true, qualification: qual });
    } catch (err) {
      console.error('[welder qualification create] failed:', err);
      return res.status(500).json({ ok: false, error: 'Erro ao registrar qualificação de soldador.' });
    }
  });

  // 3. Register Material Lot / Metallurgical Heat Number & Certificate
  router.post('/material-lots', requireModuleAccess('obras', 2, getH), async (req: Request, res: Response) => {
    const orgId = req.orgId;
    const actor = req.user;
    const b = req.body ?? {};
    if (!orgId || !actor) return res.status(401).json({ ok: false, error: 'Não autenticado.' });
    const itemId = String(b.itemId || '').trim();
    const lotCode = String(b.lotCode || '').trim().toUpperCase();
    const heatNumber = String(b.heatNumber || '').trim().toUpperCase();
    const receivedQuantity = Number(b.receivedQuantity);
    if (!validId(itemId) || lotCode.length < 2 || heatNumber.length < 2 || !Number.isFinite(receivedQuantity) || receivedQuantity <= 0) {
      return res.status(400).json({ ok: false, error: 'Informe item do catálogo, lote, corrida metalúrgica e quantidade válida.' });
    }
    const admin = getH();
    if (!admin) return res.status(503).json({ ok: false, error: 'Serviço indisponível.' });
    try {
      const itemSnap = await admin.db.collection('items').doc(itemId).get();
      if (!itemSnap.exists || orgOf(itemSnap.data()) !== orgId) {
        return res.status(400).json({ ok: false, error: 'Item do catálogo mestre não encontrado nesta empresa.' });
      }
      if (validId(b.projectId)) {
        const pSnap = await admin.db.collection('projects').doc(String(b.projectId).trim()).get();
        if (!pSnap.exists || orgOf(pSnap.data()) !== orgId) {
          return res.status(400).json({ ok: false, error: 'Projeto/Obra informado não pertence a esta empresa.' });
        }
      }
      const item = itemSnap.data() as Record<string, any>;
      const now = new Date().toISOString();
      const lot: MaterialLot = {
        id: newId('mlot'),
        orgId,
        itemId,
        itemSku: String(item.sku || itemId),
        itemName: String(item.name || item.description || itemId),
        lotCode,
        heatNumber,
        ...(b.manufacturer ? { manufacturer: String(b.manufacturer).trim() } : {}),
        ...(b.certificateNumber ? { certificateNumber: String(b.certificateNumber).trim() } : {}),
        ...(b.certificateStoragePath ? { certificateStoragePath: String(b.certificateStoragePath).trim() } : {}),
        ...(validId(b.receiptId) ? { receiptId: String(b.receiptId).trim() } : {}),
        ...(validId(b.projectId) ? { projectId: String(b.projectId).trim() } : {}),
        ...(validId(b.unitId) ? { unitId: String(b.unitId).trim() } : {}),
        receivedQuantity,
        unitOfMeasure: String(item.unitOfMeasure || item.unit || 'UN'),
        ...(b.expiryDate ? { expiryDate: String(b.expiryDate).trim() } : {}),
        appliedOrderIds: [],
        appliedJointIds: [],
        createdByUid: actor.uid,
        createdByName: actor.email || actor.uid,
        createdAt: now,
        updatedAt: now,
      };
      await admin.db.collection('material_lots').doc(lot.id).set(lot);
      return res.status(201).json({ ok: true, lot });
    } catch (err) {
      console.error('[material lot create] failed:', err);
      return res.status(500).json({ ok: false, error: 'Erro ao registrar lote/corrida de material.' });
    }
  });

  // 4. Register Welded Joint Passport (enforces active EPS + valid welder stamp + org project)
  router.post('/weld-joints', requireModuleAccess('obras', 2, getH), async (req: Request, res: Response) => {
    const orgId = req.orgId;
    const actor = req.user;
    const b = req.body ?? {};
    if (!orgId || !actor) return res.status(401).json({ ok: false, error: 'Não autenticado.' });
    const projectId = String(b.projectId || '').trim();
    const epsId = String(b.epsId || '').trim();
    const welderQualificationId = String(b.welderQualificationId || '').trim();
    const lineOrSpool = String(b.lineOrSpool || '').trim();
    const jointCode = String(b.jointCode || '').trim().toUpperCase();
    const heatNumber = String(b.heatNumber || '').trim().toUpperCase();
    const weldDate = String(b.weldDate || '').trim();
    const materialLotId = validId(b.materialLotId) ? String(b.materialLotId).trim() : '';

    if (!validId(projectId) || !validId(epsId) || !validId(welderQualificationId) || lineOrSpool.length < 2 || jointCode.length < 2) {
      return res.status(400).json({ ok: false, error: 'Informe projeto, linha/spool, código da junta, EPS e soldador qualificado.' });
    }
    const admin = getH();
    if (!admin) return res.status(503).json({ ok: false, error: 'Serviço indisponível.' });

    try {
      const joint = await admin.db.runTransaction(async (tx) => {
        const [projSnap, epsSnap, qualSnap, lotSnap] = await Promise.all([
          tx.get(admin.db.collection('projects').doc(projectId)),
          tx.get(admin.db.collection('welding_procedures').doc(epsId)),
          tx.get(admin.db.collection('welder_qualifications').doc(welderQualificationId)),
          materialLotId ? tx.get(admin.db.collection('material_lots').doc(materialLotId)) : Promise.resolve(null),
        ]);

        if (!projSnap.exists || orgOf(projSnap.data()) !== orgId) {
          throw new IndustrialQualityRouteError(400, 'Projeto/Obra não encontrado nesta empresa.');
        }
        const eps = epsSnap.exists ? ({ ...(epsSnap.data() as WeldingProcedure), id: epsSnap.id }) : null;
        const qual = qualSnap.exists ? ({ ...(qualSnap.data() as WelderQualification), id: qualSnap.id }) : null;
        const lot = lotSnap?.exists ? ({ ...(lotSnap.data() as MaterialLot), id: lotSnap.id }) : null;

        const check = validateWeldJointPrerequisites({
          orgId,
          weldDate,
          heatNumber,
          eps,
          welderQualification: qual,
          materialLot: lot,
        });
        if (!check.valid) {
          throw new IndustrialQualityRouteError(422, check.errors[0], check.errors);
        }

        const proj = projSnap.data() as Record<string, any>;
        const now = new Date().toISOString();
        const ndtRequired = Array.isArray(b.ndtRequiredMethods)
          ? b.ndtRequiredMethods.filter((m: unknown) => ['LP', 'PM', 'US', 'RX'].includes(String(m)))
          : [];
        const visualResult = ['pendente', 'aprovada', 'reprovada'].includes(b.visualResult) ? b.visualResult : 'pendente';

        const created: WeldJoint = {
          id: newId('wjoint'),
          orgId,
          projectId,
          unitId: String(proj.unitId || ''),
          contractId: String(proj.contractId || ''),
          ...(validId(b.orderId) ? { orderId: String(b.orderId).trim() } : {}),
          lineOrSpool,
          jointCode,
          ...(validId(b.engineeringDocumentId) ? { engineeringDocumentId: String(b.engineeringDocumentId).trim() } : {}),
          ...(lot ? { materialLotId: lot.id } : {}),
          heatNumber,
          baseMaterialSpec: String(b.baseMaterialSpec || eps!.baseMetal).trim(),
          ...(b.diameterInch ? { diameterInch: String(b.diameterInch).trim() } : {}),
          ...(b.scheduleOrThickness ? { scheduleOrThickness: String(b.scheduleOrThickness).trim() } : {}),
          epsId: eps!.id,
          epsCode: eps!.code,
          welderQualificationId: qual!.id,
          welderEmployeeId: qual!.rhEmployeeId,
          welderName: qual!.employeeName,
          welderStamp: qual!.stampCode,
          weldDate,
          visualResult,
          ndtRequiredMethods: ndtRequired,
          ndtReportIds: [],
          status: visualResult === 'reprovada' ? 'reprovada' : ndtRequired.length > 0 ? 'em_end' : visualResult === 'aprovada' ? 'aprovada' : 'soldada',
          ...(b.notes ? { notes: String(b.notes).trim() } : {}),
          createdByUid: actor.uid,
          createdByName: actor.email || actor.uid,
          createdAt: now,
          updatedAt: now,
        };

        tx.create(admin.db.collection('weld_joints').doc(created.id), created);
        if (lot) {
          const nextJointIds = Array.from(new Set([...(lot.appliedJointIds || []), created.id]));
          const nextOrderIds = created.orderId
            ? Array.from(new Set([...(lot.appliedOrderIds || []), created.orderId]))
            : lot.appliedOrderIds || [];
          tx.update(admin.db.collection('material_lots').doc(lot.id), {
            appliedJointIds: nextJointIds,
            appliedOrderIds: nextOrderIds,
            updatedAt: now,
          });
        }
        return created;
      });
      return res.status(201).json({ ok: true, joint });
    } catch (err) {
      if (err instanceof IndustrialQualityRouteError) {
        return res.status(err.status).json({ ok: false, error: err.message, errors: err.details });
      }
      console.error('[weld joint create] failed:', err);
      return res.status(500).json({ ok: false, error: 'Erro ao registrar passaporte de junta soldada.' });
    }
  });

  // 5. Register NDT / Hydrostatic Report (enforces calibrated instrument in assets + updates linked joints)
  router.post('/ndt-reports', requireModuleAccess('obras', 2, getH), async (req: Request, res: Response) => {
    const orgId = req.orgId;
    const actor = req.user;
    const b = req.body ?? {};
    if (!orgId || !actor) return res.status(401).json({ ok: false, error: 'Não autenticado.' });
    const projectId = String(b.projectId || '').trim();
    const instrumentAssetId = String(b.instrumentAssetId || '').trim();
    const method = String(b.method || '').trim() as NdtMethod;
    const inspectedAt = String(b.inspectedAt || '').trim();
    const reportCode = String(b.reportCode || '').trim().toUpperCase();
    const acceptanceCriteria = String(b.acceptanceCriteria || '').trim();
    const result = b.result === 'aprovado' || b.result === 'reprovado' ? b.result : '';
    const jointIds: string[] = Array.isArray(b.jointIds)
      ? b.jointIds.map((x: unknown) => String(x || '').trim()).filter(validId)
      : [];

    if (!validId(projectId) || !validId(instrumentAssetId) || !['LP', 'PM', 'US', 'RX', 'hidrostatico', 'pneumatico'].includes(method) || !reportCode || !acceptanceCriteria || !result) {
      return res.status(400).json({ ok: false, error: 'Informe projeto, instrumento calibrado, método END, código do laudo, critério e resultado.' });
    }

    const admin = getH();
    if (!admin) return res.status(503).json({ ok: false, error: 'Serviço indisponível.' });

    try {
      const report = await admin.db.runTransaction(async (tx) => {
        const [projSnap, assetSnap, ...jointSnaps] = await Promise.all([
          tx.get(admin.db.collection('projects').doc(projectId)),
          tx.get(admin.db.collection('assets').doc(instrumentAssetId)),
          ...jointIds.map((jid) => tx.get(admin.db.collection('weld_joints').doc(jid))),
        ]);

        if (!projSnap.exists || orgOf(projSnap.data()) !== orgId) {
          throw new IndustrialQualityRouteError(400, 'Projeto/Obra não encontrado nesta empresa.');
        }
        const instrument = assetSnap.exists ? ({ ...(assetSnap.data() as any), id: assetSnap.id }) : null;
        const check = validateNdtReportPrerequisites({
          orgId,
          method,
          inspectedAt,
          instrumentAsset: instrument,
          testPressureBar: b.testPressureBar !== undefined ? Number(b.testPressureBar) : undefined,
          testFluid: b.testFluid,
          durationMinutes: b.durationMinutes !== undefined ? Number(b.durationMinutes) : undefined,
          jointIds,
          circuitOrLine: b.circuitOrLine,
        });
        if (!check.valid) {
          throw new IndustrialQualityRouteError(422, check.errors[0], check.errors);
        }

        const proj = projSnap.data() as Record<string, any>;
        const now = new Date().toISOString();
        const created: NdtReport = {
          id: newId('ndt'),
          orgId,
          projectId,
          unitId: String(proj.unitId || ''),
          contractId: String(proj.contractId || ''),
          reportCode,
          method,
          jointIds,
          ...(b.circuitOrLine ? { circuitOrLine: String(b.circuitOrLine).trim() } : {}),
          instrumentAssetId: instrument.id,
          instrumentTag: String(instrument.tag || instrument.name || instrument.id),
          ...(instrument.calibrationDueDate ? { instrumentCalibrationDueDate: String(instrument.calibrationDueDate) } : {}),
          ...(b.testPressureBar !== undefined ? { testPressureBar: Number(b.testPressureBar) } : {}),
          ...(b.testFluid ? { testFluid: String(b.testFluid).trim() } : {}),
          ...(b.durationMinutes !== undefined ? { durationMinutes: Number(b.durationMinutes) } : {}),
          acceptanceCriteria,
          result,
          inspectorName: String(b.inspectorName || actor.email || actor.uid).trim(),
          inspectedAt,
          ...(b.storagePath ? { storagePath: String(b.storagePath).trim() } : {}),
          ...(b.notes ? { notes: String(b.notes).trim() } : {}),
          createdByUid: actor.uid,
          createdByName: actor.email || actor.uid,
          createdAt: now,
        };

        tx.create(admin.db.collection('ndt_reports').doc(created.id), created);

        for (const jSnap of jointSnaps) {
          if (!jSnap.exists || orgOf(jSnap.data()) !== orgId) continue;
          const jData = jSnap.data() as WeldJoint;
          const nextReportIds = Array.from(new Set([...(jData.ndtReportIds || []), created.id]));
          const nextStatus = result === 'reprovado' ? 'reprovada' : jData.visualResult !== 'reprovada' ? 'aprovada' : jData.status;
          tx.update(admin.db.collection('weld_joints').doc(jSnap.id), {
            ndtReportIds: nextReportIds,
            status: nextStatus,
            updatedAt: now,
          });
        }

        return created;
      });

      return res.status(201).json({ ok: true, report });
    } catch (err) {
      if (err instanceof IndustrialQualityRouteError) {
        return res.status(err.status).json({ ok: false, error: err.message, errors: err.details });
      }
      console.error('[ndt report create] failed:', err);
      return res.status(500).json({ ok: false, error: 'Erro ao registrar laudo END.' });
    }
  });

  // 6. Register ITP / PIT Matrix
  router.post('/itp-matrices', requireModuleAccess('obras', 2, getH), async (req: Request, res: Response) => {
    const orgId = req.orgId;
    const actor = req.user;
    const b = req.body ?? {};
    if (!orgId || !actor) return res.status(401).json({ ok: false, error: 'Não autenticado.' });
    const projectId = String(b.projectId || '').trim();
    const code = String(b.code || '').trim().toUpperCase();
    const title = String(b.title || '').trim();
    const steps = Array.isArray(b.steps) ? b.steps : [];
    if (!validId(projectId) || code.length < 3 || title.length < 3 || steps.length === 0) {
      return res.status(400).json({ ok: false, error: 'Informe projeto, código, título e ao menos uma etapa ITP/PIT.' });
    }
    const admin = getH();
    if (!admin) return res.status(503).json({ ok: false, error: 'Serviço indisponível.' });
    const projSnap = await admin.db.collection('projects').doc(projectId).get();
    if (!projSnap.exists || orgOf(projSnap.data()) !== orgId) {
      return res.status(400).json({ ok: false, error: 'Projeto/Obra não encontrado nesta empresa.' });
    }
    const now = new Date().toISOString();
    const matrix: QualityItpMatrix = {
      id: newId('itp'),
      orgId,
      projectId,
      contractId: String(projSnap.data()?.contractId || ''),
      code,
      title,
      revision: String(b.revision || 'Rev 0').trim(),
      steps: steps.map((s: any, idx: number) => ({
        id: String(s.id || `step_${idx + 1}`),
        stepNumber: String(s.stepNumber || idx + 1),
        activity: String(s.activity || '').trim(),
        discipline: String(s.discipline || 'Montagem').trim(),
        acceptanceCriteria: String(s.acceptanceCriteria || '').trim(),
        pointType: ['H', 'W', 'R'].includes(s.pointType) ? s.pointType : 'W',
        status: ['pendente', 'liberado', 'reprovado'].includes(s.status) ? s.status : 'pendente',
        ...(s.evidenceRef ? { evidenceRef: String(s.evidenceRef).trim() } : {}),
      })),
      createdByUid: actor.uid,
      createdByName: actor.email || actor.uid,
      createdAt: now,
      updatedAt: now,
    };
    await admin.db.collection('quality_itp_matrices').doc(matrix.id).set(matrix);
    return res.status(201).json({ ok: true, matrix });
  });

  // 7. Live Consolidated Project Data Book Compilation
  router.get('/projects/:projectId/databook', requireModuleAccess('obras', 1, getH), async (req: Request, res: Response) => {
    const orgId = req.orgId;
    const projectId = req.params.projectId;
    if (!orgId || !validId(projectId)) {
      return res.status(400).json({ ok: false, error: 'Informe um Projeto/Obra válido.' });
    }
    const admin = getH();
    if (!admin) return res.status(503).json({ ok: false, error: 'Serviço indisponível.' });
    try {
      const projSnap = await admin.db.collection('projects').doc(projectId).get();
      if (!projSnap.exists || orgOf(projSnap.data()) !== orgId) {
        return res.status(404).json({ ok: false, error: 'Projeto/Obra não encontrado.' });
      }
      const contractId = String(projSnap.data()?.contractId || '');
      const [jointsSnap, ndtsSnap, lotsSnap, itpsSnap, engSnap, qualSnap] = await Promise.all([
        admin.db.collection('weld_joints').where('orgId', '==', orgId).where('projectId', '==', projectId).get(),
        admin.db.collection('ndt_reports').where('orgId', '==', orgId).where('projectId', '==', projectId).get(),
        admin.db.collection('material_lots').where('orgId', '==', orgId).where('projectId', '==', projectId).get(),
        admin.db.collection('quality_itp_matrices').where('orgId', '==', orgId).where('projectId', '==', projectId).get(),
        contractId ? admin.db.collection('engineering_documents').where('orgId', '==', orgId).where('contractId', '==', contractId).get() : Promise.resolve(null),
        contractId ? admin.db.collection('quality_records').where('orgId', '==', orgId).where('contractId', '==', contractId).get() : Promise.resolve(null),
      ]);

      const databook = compileProjectDataBook({
        orgId,
        projectId,
        weldJoints: jointsSnap.docs.map((d) => ({ ...(d.data() as WeldJoint), id: d.id })),
        ndtReports: ndtsSnap.docs.map((d) => ({ ...(d.data() as NdtReport), id: d.id })),
        materialLots: lotsSnap.docs.map((d) => ({ ...(d.data() as MaterialLot), id: d.id })),
        itpMatrices: itpsSnap.docs.map((d) => ({ ...(d.data() as QualityItpMatrix), id: d.id })),
        engineeringDocs: (engSnap?.docs || []).map((d) => ({ id: d.id, ...(d.data() as any) })),
        qualityRecords: (qualSnap?.docs || []).map((d) => ({ id: d.id, ...(d.data() as any) })),
      });
      return res.status(200).json({ ok: true, databook });
    } catch (err) {
      console.error('[databook compile] failed:', err);
      return res.status(500).json({ ok: false, error: 'Erro ao compilar dossiê técnico (Data Book).' });
    }
  });

  return router;
}
