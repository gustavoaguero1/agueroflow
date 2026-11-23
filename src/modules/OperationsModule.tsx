import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DatabaseBackup } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { createOpsBridge } from './operations/opsBridge';
import { InoxImportModal } from './operations/InoxImportModal';

declare global {
  interface Window {
    __agueroOps?: unknown;
  }
}

/**
 * Operações: Início, Contratação, Auxiliares, Diário de obras, Hora viagem, Reembolso,
 * Gerenciamento de operações, Controle de gases, Base de dados e Configurações.
 * A tela roda em public/operacoes/index.html (iframe da mesma origem) e fala com o Firebase
 * do AgueroFlow pela ponte em ./operations/opsBridge.
 */
export const OperationsModule: React.FC = () => {
  const { user, organization, member, role, isMaster, isManagerOrAbove } = useAuth();
  const { theme } = useTheme();
  const frame = useRef<HTMLIFrameElement>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const canImport = isMaster || isManagerOrAbove;
  const orgId = organization?.id || '';

  const bridge = useMemo(() => {
    if (!user || !orgId) return null;
    return createOpsBridge({
      orgId,
      user,
      userName: member?.userName || user.displayName || '',
      role,
      isManager: isMaster || isManagerOrAbove,
    });
  }, [user, orgId, member?.userName, role, isMaster, isManagerOrAbove]);

  // Publica a ponte antes do iframe carregar; troca de empresa recarrega a página.
  if (bridge) window.__agueroOps = bridge.api;
  useEffect(() => () => {
    bridge?.dispose();
    if (window.__agueroOps === bridge?.api) delete window.__agueroOps;
  }, [bridge]);

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
      {canImport && (
        <div className="flex justify-end">
          <button
            onClick={() => setImportOpen(true)}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:border-blue-500"
          >
            <DatabaseBackup className="w-4 h-4" /> Importar dados do Inox
          </button>
        </div>
      )}
    <iframe
      key={`${orgId}:${reloadKey}`}
      ref={frame}
      src="/operacoes/index.html"
      title="Operações"
      onLoad={applyTheme}
      className="w-full border-0 rounded-lg bg-transparent"
      style={{ height: 'calc(100vh - 140px)' }}
    />
      {importOpen && (
        <InoxImportModal orgId={orgId} onClose={() => setImportOpen(false)} onDone={() => setReloadKey((k) => k + 1)} />
      )}
    </div>
  );
};
