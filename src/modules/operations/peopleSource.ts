/**
 * Pessoas e salários de Operações vêm do RH (rh_employees). Operações guarda só o complemento
 * operacional em ops_orgs/{orgId}/colaboradores/{id} (com `rhId`). Ver unifiedCollections.ts.
 */
import { collection, doc, getDoc, onSnapshot, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '../../firebase';
import type { RhEmployee } from '../../types/rhPayroll';
import { saveRhEmployee, syncRhEmployeeToFieldWorker } from '../../services/rhPayrollService';
import { joinColabs, joinSalarios, splitColabWrite } from './unifiedCollections';
import { createVirtualCollection } from './virtualCollections';

type Unsub = () => void;
type Overlay = Record<string, unknown> & { id: string; rhId?: string };

/** Erro que a página mostra como aviso (code 'owned_elsewhere' → toast com a mensagem). */
export function ownedElsewhere(msg: string): Error {
  return Object.assign(new Error(msg), { code: 'owned_elsewhere' });
}

export function createPeopleSource(orgId: string, track: (u: Unsub) => Unsub) {
  const overlayPath = `ops_orgs/${orgId}/colaboradores`;
  const rhQuery = query(collection(db, 'rh_employees'), where('orgId', '==', orgId));
  const hiredNow = new Set<string>(); // rhIds criados por "aprovar candidato" nesta sessão

  const subRh = (next: (r: RhEmployee[]) => void, err?: (e: unknown) => void) =>
    onSnapshot(rhQuery, (s) => next(s.docs.map((d) => ({ ...(d.data() as RhEmployee), id: d.id }))), err);
  const subOverlay = (next: (r: Overlay[]) => void, err?: (e: unknown) => void) =>
    onSnapshot(collection(db, overlayPath), (s) => next(s.docs.map((d) => ({ ...d.data(), id: d.id }))), err);

  const colabs = createVirtualCollection({ subscribeA: subRh, subscribeB: subOverlay, join: joinColabs });
  const salarios = createVirtualCollection({ subscribeA: subRh, subscribeB: subOverlay, join: joinSalarios });

  const rhIdOf = async (id: string): Promise<string | null> => {
    if (id.startsWith('rh_')) return id.slice(3);
    const s = await getDoc(doc(db, overlayPath, id));
    return (s.exists() && (s.data().rhId as string)) || null;
  };

  /** Alocar em obra atualiza também o RH (obra/código) e a equipe de campo. */
  const syncAllocation = async (rhId: string, obraId: string) => {
    let unitId: string | null = null;
    if (obraId.startsWith('un_')) unitId = obraId.slice(3);
    else if (obraId) {
      const o = await getDoc(doc(db, `ops_orgs/${orgId}/obras`, obraId));
      unitId = (o.exists() && (o.data().unitId as string)) || null;
    }
    const code = unitId ? ((await getDoc(doc(db, 'units', unitId))).data()?.code as string) || '' : '';
    await updateDoc(doc(db, 'rh_employees', rhId), { unitId, codigoObra: code, updatedAt: new Date().toISOString() });
    const emp = await getDoc(doc(db, 'rh_employees', rhId));
    if (emp.exists()) await syncRhEmployeeToFieldWorker({ ...(emp.data() as RhEmployee), id: rhId });
  };

  const writeOverlay = async (id: string, data: Record<string, unknown>) => {
    const { overlay } = splitColabWrite(data);
    const rhId = await rhIdOf(id);
    await setDoc(doc(db, overlayPath, id), { ...overlay, ...(rhId ? { rhId } : {}) }, { merge: true });
    if (rhId && 'obraAtual' in overlay) await syncAllocation(rhId, String(overlay.obraAtual || ''));
  };

  /** Aprovar candidato cria o funcionário no RH (decisão do usuário, 23/11/2026). */
  const hire = async (id: string, data: Record<string, unknown>) => {
    const now = new Date().toISOString();
    const rhId = `rh_ops_${id}`.replace(/[^\w-]/g, '_');
    const emp: RhEmployee = {
      id: rhId, orgId, registrationNumber: '', name: String(data.nome || ''), role: String(data.funcao || ''),
      admissionDate: String(data.admissao || now.slice(0, 10)), active: true, department: 'Operações', companyName: '',
      hourlyRateCarteira: 0, hourlyRatePorFora: 0, monthlyHours: 220, baseSalaryCarteira: 0, baseSalaryPorFora: 0,
      notes: 'Criado pela Contratação de Operações', createdAt: now, updatedAt: now,
    };
    await saveRhEmployee(emp);
    hiredNow.add(rhId);
    await setDoc(doc(db, overlayPath, id), { ...splitColabWrite(data).overlay, rhId });
    if (data.obraAtual) await syncAllocation(rhId, String(data.obraAtual));
  };

  const colabDoc = (id: string) => ({
    id,
    update: (data: Record<string, unknown>) => writeOverlay(id, data),
    set: async (data: Record<string, unknown>) => {
      const known = id.startsWith('rh_') || (await getDoc(doc(db, overlayPath, id))).exists();
      if (known) return writeOverlay(id, data);
      if (data.contratacao) return hire(id, data);
      throw ownedElsewhere('Cadastre a pessoa no RH → Funcionários; ela aparece aqui na hora.');
    },
    delete: async () => {
      throw ownedElsewhere('Para desligar, use RH → Funcionários.');
    },
  });

  const salarioDoc = (id: string) => ({
    id,
    set: async (data: Record<string, unknown>) => {
      const rhId = await rhIdOf(id);
      if (!rhId || !hiredNow.has(rhId)) throw ownedElsewhere('Salários são editados no RH → Funcionários.');
      const clt = Number(data.clt) || 0;
      const pj = Number(data.pj) || 0;
      const carteira = clt || pj;
      await updateDoc(doc(db, 'rh_employees', rhId), {
        baseSalaryCarteira: carteira,
        hourlyRateCarteira: Math.round((carteira / 220) * 100) / 100,
        updatedAt: new Date().toISOString(),
      });
    },
    update: async () => { throw ownedElsewhere('Salários são editados no RH → Funcionários.'); },
    delete: async () => { throw ownedElsewhere('Salários são editados no RH → Funcionários.'); },
  });

  const coll = (v: ReturnType<typeof createVirtualCollection>, docFn: (id: string) => object) => ({
    doc: (id?: string) => docFn(id || doc(collection(db, overlayPath)).id),
    onSnapshot: (next: Parameters<typeof v.onSnapshot>[0], err?: (e: unknown) => void) => track(v.onSnapshot(next, err)),
  });

  return {
    colaboradores: coll(colabs, colabDoc),
    salarios: coll(salarios, salarioDoc),
    colabDoc,
    salarioDoc,
  };
}
