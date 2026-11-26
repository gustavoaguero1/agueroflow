import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DatabaseBackup } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { createOpsBridge } from './operations/opsBridge';
import { InoxImportModal } from './operations/InoxImportModal';

declare global {
  interface Window {
    __agueroOps?: unknown;
    __agueroOpsNav?: (route: string) => void;
    __agueroOpsGo?: (section: string) => void;
  }
}

export const OPS_ROUTES = ['inicio', 'direcionar', 'diario', 'viagem', 'reembolso', 'contratacao', 'tarefas', 'gases', 'base', 'config'] as const;
export type OpsRoute = (typeof OPS_ROUTES)[number];
const normalizeRoute = (r: string): OpsRoute => {
  const x = r === 'coord' ? 'direcionar' : r;
  return (OPS_ROUTES as readonly string[]).includes(x) ? (x as OpsRoute) : 'inicio';
};

/**
 * Operações: Início, Contratação, Auxiliares, Diário de obras, Hora viagem, Reembolso,
 * Gerenciamento de operações, Controle de gases, Base de dados e Configurações.
 * A tela roda em public/operacoes/index.html (iframe da mesma origem) e fala com o Firebase
 * do AgueroFlow pela ponte em ./operations/opsBridge.
 */
export const OperationsModule: React.FC<{
  route?: string;
  onRouteChange?: (r: OpsRoute) => void;
  /** Abre outra tela do AgueroFlow (ex.: 'rh-funcionarios'), pedida pela página. */
  onNavigate?: (section: string) => void;
}> = ({ route = 'inicio', onRouteChange, onNavigate }) => {
  const { user, organization, member, role, isMaster, moduleLevel } = useAuth();
  const rhLevel = moduleLevel('rh-funcionarios');
  const { theme } = useTheme();
  const frame = useRef<HTMLIFrameElement>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  // Importações e ações internas herdam a permissão do submódulo correspondente.
  const canImport = moduleLevel('rh-importacao') >= 2;
  const canImportGases = moduleLevel('ops-gases') >= 2;
  const canManageOperations = moduleLevel('ops-config') >= 4;
  const orgId = organization?.id || '';

  const bridge = useMemo(() => {
    if (!user || !orgId) return null;
    return createOpsBridge({
      orgId,
      user,
      userName: member?.userName || user.displayName || '',
      role,
      isManager: isMaster || canManageOperations,
      canWrite: moduleLevel(({ inicio: 'ops-inicio', direcionar: 'ops-direcionar', diario: 'ops-diario', viagem: 'ops-viagem', reembolso: 'ops-reembolso', contratacao: 'ops-contratacao', tarefas: 'ops-tarefas', gases: 'ops-gases', base: 'ops-base', config: 'ops-config' } as Record<string, string>)[normalizeRoute(route)] || 'ops-inicio') >= 2,
      canSeeSalaries: rhLevel >= 1,
      canEditRh: rhLevel === 2,
    });
  }, [user, orgId, member?.userName, role, isMaster, canManageOperations, moduleLevel, route, rhLevel]);

  // Publica a ponte antes do iframe carregar; troca de empresa recarrega a página.
  if (bridge) window.__agueroOps = bridge.api;
  useEffect(() => () => {
    bridge?.dispose();
    if (window.__agueroOps === bridge?.api) delete window.__agueroOps;
  }, [bridge]);

  // Menu lateral -> tela da página; link interno da página -> menu lateral.
  const current = normalizeRoute(route);
  const initialRoute = useRef(current);
  useEffect(() => {
    try {
      const w = frame.current?.contentWindow;
      if (w && (w.location.hash || '#inicio').slice(1) !== current) w.location.hash = current;
    } catch {
      /* mesma origem */
    }
  }, [current]);
  useEffect(() => {
    window.__agueroOpsNav = (r) => {
      const n = normalizeRoute(r);
      if (n !== current) onRouteChange?.(n);
    };
    return () => {
      delete window.__agueroOpsNav;
    };
  }, [current, onRouteChange]);
  useEffect(() => {
    window.__agueroOpsGo = (s) => onNavigate?.(s);
    return () => {
      delete window.__agueroOpsGo;
    };
  }, [onNavigate]);

  const applyTheme = () => {
    try {
      frame.current?.contentDocument?.documentElement.setAttribute('data-theme', theme);
    } catch {
      /* mesma origem; se falhar, a página segue o tema do sistema */
    }
  };
  useEffect(applyTheme, [theme]);

  if (!user || !orgId) {
    return <div className="p-6 text-sm text-slate-500">Selecione uma empresa para abrir Operações.</div>;
  }

  return (
    <div className="space-y-2">
      {(canImport || canImportGases) && (
        <div className="flex justify-end">
          <button
            onClick={() => setImportOpen(true)}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:border-blue-500"
          >
            <DatabaseBackup className="w-4 h-4" /> {canImport ? 'Importar dados (Inox e gases)' : 'Importar gases'}
          </button>
        </div>
      )}
    <iframe
      key={`${orgId}:${reloadKey}`}
      ref={frame}
      src={`/operacoes/index.html#${initialRoute.current}`}
      title="Operações"
      onLoad={applyTheme}
      className="w-full border-0 rounded-lg bg-transparent"
      style={{ height: 'calc(100vh - 140px)' }}
    />
      {importOpen && (
        <InoxImportModal orgId={orgId} allowInox={canImport} onClose={() => setImportOpen(false)} onDone={() => setReloadKey((k) => k + 1)} />
      )}
    </div>
  );
};
