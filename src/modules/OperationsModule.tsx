import React, { useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { createOpsBridge } from './operations/opsBridge';

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
    <iframe
      key={orgId}
      ref={frame}
      src="/operacoes/index.html"
      title="Operações"
      onLoad={applyTheme}
      className="w-full border-0 rounded-lg bg-transparent"
      style={{ height: 'calc(100vh - 96px)' }}
    />
  );
};
