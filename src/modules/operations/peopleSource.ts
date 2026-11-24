/**
 * Pessoas de Operações vêm do diretório do RH (rh_directory, sem salários); salários vêm de
 * rh_employees só para quem tem acesso ao RH. Operações guarda só o complemento
 * operacional em ops_orgs/{orgId}/colaboradores/{id} (com `rhId`). Ver unifiedCollections.ts.
 */
import { collection, doc, getDoc, onSnapshot, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '../../firebase';
import type { RhEmployee } from '../../types/rhPayroll';
import { saveRhEmployee, syncRhEmployeeToFieldWorker } from '../../services/rhPayrollService';
import { joinColabs, joinSalarios, splitColabWrite } from './unifiedCollections';
import { createVirtualCollection } from './virtualCollections';
import { rhEmployeeFromInox } from './inoxBackup';

type Unsub = () => void;
type Overlay = Record<string, unknown> & { id: string; rhId?: string };

/** Erro que a página mostra como aviso (code 'owned_elsewhere' → toast com a mensagem). */
export function ownedElsewhere(msg: string): Error {
  return Object.assign(new Error(msg), { code: 'owned_elsewhere' });
}

export interface PeopleAccess {
  canSeeSalaries: boolean; // RH ≥ Ver: lê rh_employees (com salários)
  canEditRh: boolean; // RH = Editar: aprovar candidato cria o funcionário no RH
}

export function createPeopleSource(orgId: string, track: (u: Unsub) => Unsub, access: PeopleAccess) {
  const { canSeeSalaries, canEditRh } = access;
  const overlayPath = `ops_orgs/${orgId}/colaboradores`;
  // Quem é quem vem do diretório (sem salários); salários só para quem tem acesso ao RH.
  const dirQuery = query(collection(db, 'rh_directory'), where('orgId', '==', orgId));
  const rhQuery = query(collection(db, 'rh_employees'), where('orgId', '==', orgId));
  const hiredNow = new Set<string>(); // rhIds criados por "aprovar candidato" nesta sessão

  const subOf = (q: typeof dirQuery) => (next: (r: RhEmployee[]) => void, err?: (e: unknown) => void) =>
    onSnapshot(q, (s) => next(s.docs.map((d) => ({ ...(d.data() as RhEmployee), id: d.id }))), err);
  const subDir = subOf(dirQuery);
  const subRh = canSeeSalaries ? subOf(rhQuery) : (next: (r: RhEmployee[]) => void) => { next([]); return () => {}; };
  const subOverlay = (next: (r: Overlay[]) => void, err?: (e: unknown) => void) =>
    onSnapshot(collection(db, overlayPath), (s) => next(s.docs.map((d) => ({ ...d.data(), id: d.id }))), err);

  const colabs = createVirtualCollection({ subscribeA: subDir, subscribeB: subOverlay, join: joinColabs });
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
    // Só obra/código: as regras deixam Operações mudar esses campos no RH, nada mais.
    const patch = { unitId, codigoObra: code, updatedAt: new Date().toISOString() };
    await updateDoc(doc(db, 'rh_employees', rhId), patch);
    await setDoc(doc(db, 'rh_directory', rhId), { orgId, ...patch }, { merge: true });
    if (!canSeeSalaries) return; // equipe de campo leva o valor hora; quem não vê salário não regrava
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
    if (!canEditRh) throw ownedElsewhere('Aprovar a contratação cria o funcionário no RH: peça a alguém com acesso de edição ao RH.');
    const emp: RhEmployee = {
      ...rhEmployeeFromInox(orgId, id, { ...data, admissao: data.admissao || new Date().toISOString().slice(0, 10) }, null),
      notes: 'Criado pela Contratação de Operações',
    };
    const rhId = emp.id;
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
