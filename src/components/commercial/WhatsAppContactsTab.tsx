import React, { useMemo, useState } from 'react';
import {
  Bot,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import { CommercialClient } from '../../types/commercial';
import { WhatsAppContactType, WhatsAppManagedContact } from '../../types/whatsappComposio';
import {
  deleteWhatsAppContact,
  saveWhatsAppContact,
  toggleWhatsAppContactOcr,
} from '../../services/composioWhatsAppClient';

interface WhatsAppContactsTabProps {
  contacts: WhatsAppManagedContact[];
  clients: CommercialClient[];
  isBridgeConnected: boolean;
  onRefresh: () => Promise<void>;
  onOpenChat: (contact: WhatsAppManagedContact) => void;
  onCreateAiRuleForContact: (contact: WhatsAppManagedContact) => void;
  onToast: (type: 'success' | 'error', text: string) => void;
}

export const WhatsAppContactsTab: React.FC<WhatsAppContactsTabProps> = ({
  contacts,
  clients,
  isBridgeConnected,
  onRefresh,
  onOpenChat,
  onCreateAiRuleForContact,
  onToast,
}) => {
  const [filterMode, setFilterMode] = useState<'todos' | 'ocr_ativo' | 'grupos' | 'privados'>('todos');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  const [newName, setNewName] = useState('');
  const [newPhoneOrJid, setNewPhoneOrJid] = useState('');
  const [newContactType, setNewContactType] = useState<WhatsAppContactType>('cliente');
  const [newOcrEnabled, setNewOcrEnabled] = useState(false);
  const [newOcrAutoReply, setNewOcrAutoReply] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isImportingClients, setIsImportingClients] = useState(false);

  const ocrActiveCount = useMemo(
    () => contacts.filter((c) => c.ocrEnabled).length,
    [contacts]
  );

  const filteredContacts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return contacts.filter((c) => {
      if (filterMode === 'ocr_ativo' && !c.ocrEnabled) return false;
      if (filterMode === 'grupos' && !c.isGroup) return false;
      if (filterMode === 'privados' && c.isGroup) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.jidOrPhone.toLowerCase().includes(q) ||
        (c.normalizedPhone || '').toLowerCase().includes(q)
      );
    });
  }, [contacts, filterMode, searchQuery]);

  const handleSyncFromBridge = async () => {
    setIsSyncing(true);
    try {
      await onRefresh();
      onToast('success', 'Contatos e grupos sincronizados com segurança (OCR desativado por padrão).');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleImportClientsFromOrca = async () => {
    const withPhone = clients.filter((c) => c.contactPhone && c.contactPhone.trim().length >= 8);
    if (withPhone.length === 0) {
      onToast('error', 'Nenhum cliente com telefone cadastrado no OrçaÁgil foi encontrado.');
      return;
    }
    setIsImportingClients(true);
    let imported = 0;
    try {
      for (const cli of withPhone) {
        const res = await saveWhatsAppContact({
          jidOrPhone: cli.contactPhone!,
          name: cli.name,
          isGroup: false,
          contactType: 'cliente',
          source: 'orca_agil',
        });
        if (res.success) imported += 1;
      }
      await onRefresh();
      onToast('success', `${imported} cliente(s) importado(s) do OrçaÁgil com OCR desligado por padrão.`);
    } finally {
      setIsImportingClients(false);
    }
  };

  const handleAddManualContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPhoneOrJid.trim()) {
      onToast('error', 'Informe o número de telefone ou JID do grupo (@g.us).');
      return;
    }
    setBusyId('new');
    try {
      const res = await saveWhatsAppContact({
        jidOrPhone: newPhoneOrJid.trim(),
        name: newName.trim() || newPhoneOrJid.trim(),
        isGroup: newPhoneOrJid.trim().endsWith('@g.us'),
        contactType: newContactType,
        ocrEnabled: newOcrEnabled,
        ocrAutoReply: newOcrAutoReply,
        source: 'manual',
      });
      if (res.success) {
        setNewName('');
        setNewPhoneOrJid('');
        setNewOcrEnabled(false);
        setShowAddForm(false);
        await onRefresh();
        onToast('success', res.message || 'Contato adicionado com sucesso.');
      } else {
        onToast('error', res.error || 'Falha ao salvar contato.');
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleOcr = async (contact: WhatsAppManagedContact) => {
    setBusyId(contact.id);
    try {
      const nextEnabled = !contact.ocrEnabled;
      const res = await toggleWhatsAppContactOcr({
        id: contact.id,
        jidOrPhone: contact.jidOrPhone,
        name: contact.name,
        isGroup: contact.isGroup,
        ocrEnabled: nextEnabled,
        ocrAutoReply: nextEnabled ? false : contact.ocrAutoReply === true,
      });
      if (res.success) {
        await onRefresh();
        onToast('success', res.message || (nextEnabled ? 'OCR ativado!' : 'OCR desativado!'));
      } else {
        onToast('error', res.error || 'Erro ao alterar permissão OCR.');
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleAutoReply = async (contact: WhatsAppManagedContact) => {
    setBusyId(`reply_${contact.id}`);
    try {
      const nextAutoReply = !(contact.ocrAutoReply === true);
      const res = await toggleWhatsAppContactOcr({
        id: contact.id,
        jidOrPhone: contact.jidOrPhone,
        ocrEnabled: contact.ocrEnabled,
        ocrAutoReply: nextAutoReply,
      });
      if (res.success) {
        await onRefresh();
        onToast(
          'success',
          res.contact?.ocrAutoReply
            ? `Resposta de confirmação no chat ativada para "${contact.name}".`
            : `Modo silencioso ativado para "${contact.name}" (lê OCR sem enviar mensagem no grupo).`
        );
      } else {
        onToast('error', res.error || 'Erro ao alterar confirmação no chat.');
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (contact: WhatsAppManagedContact) => {
    setBusyId(`del_${contact.id}`);
    try {
      const res = await deleteWhatsAppContact(contact.id);
      if (res.success) {
        await onRefresh();
        onToast('success', `Contato "${contact.name}" removido.`);
      } else {
        onToast('error', res.error || 'Falha ao remover contato.');
      }
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Strict OCR Opt-In Protection Notice */}
      <div className="bg-white dark:bg-[#0B132B] border border-black/[0.08] dark:border-slate-700/80 rounded-2xl p-4 sm:p-5 space-y-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-[#E8F8EE] dark:bg-emerald-950/50 border border-[#166534]/20 dark:border-emerald-700/50 flex items-center justify-center text-[#166534] dark:text-emerald-400 shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div className="space-y-1 min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-[#1D1D1F] dark:text-white leading-snug">
              Proteção Ativa contra Mensagens Indevidas de OCR
            </h3>
            <p className="text-xs text-[#6E6E73] dark:text-slate-300 leading-relaxed max-w-4xl">
              Por segurança, nenhum grupo ou contato recebe leituras nem mensagens automáticas do{' '}
              <strong className="text-[#1D1D1F] dark:text-white">AgueroFlow OCR</strong> por padrão. Ao ativar o OCR em um canal ({ocrActiveCount} ativo(s)), ele lê silenciosamente só para o painel — enviar mensagem de confirmação no grupo é <strong className="text-[#1D1D1F] dark:text-white">opcional</strong> na coluna "Confirmação no Chat".
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-black/[0.06] dark:border-slate-800">
          <button
            type="button"
            onClick={handleImportClientsFromOrca}
            disabled={isImportingClients}
            className="px-3.5 py-2 bg-white dark:bg-slate-900 hover:bg-[#F2F2F7] dark:hover:bg-slate-800 border border-black/[0.1] dark:border-slate-700 text-[#1D1D1F] dark:text-slate-200 text-xs font-semibold rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0 transition disabled:opacity-50 cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5 shrink-0" />
            <span>{isImportingClients ? 'Importando...' : 'Importar Clientes OrçaÁgil'}</span>
          </button>

          <button
            type="button"
            onClick={handleSyncFromBridge}
            disabled={isSyncing}
            className="px-3.5 py-2 bg-white dark:bg-slate-900 hover:bg-[#F2F2F7] dark:hover:bg-slate-800 border border-black/[0.1] dark:border-slate-700 text-[#1D1D1F] dark:text-slate-200 text-xs font-semibold rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0 transition disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>Sincronizar WhatsApp</span>
          </button>

          <button
            type="button"
            onClick={() => setShowAddForm((prev) => !prev)}
            className="px-3.5 py-2 bg-[#0071E3] hover:bg-[#0077ED] text-white apple-solid-btn text-xs font-semibold rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0 transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 shrink-0" />
            <span>Novo Contato</span>
          </button>
        </div>
      </div>

      {/* Add Manual Contact Drawer */}
      {showAddForm && (
        <form
          onSubmit={handleAddManualContact}
          className="bg-[#0B132B] border border-cyan-500/40 rounded-xl p-5 space-y-4"
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h4 className="text-sm font-semibold text-white">Cadastrar Contato ou Grupo Manualmente</h4>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="text-xs text-slate-400 hover:text-white"
            >
              Cancelar
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-[11px] font-medium text-slate-400 block mb-1">Nome / Identificação</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ex: Obra Campinas / João Silva"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-slate-400 block mb-1">
                Telefone (+55...) ou JID Grupo (@g.us) *
              </label>
              <input
                type="text"
                value={newPhoneOrJid}
                onChange={(e) => setNewPhoneOrJid(e.target.value)}
                placeholder="+55 19 99999-9999"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono tabular-nums focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-slate-400 block mb-1">Perfil</label>
              <select
                value={newContactType}
                onChange={(e) => setNewContactType(e.target.value as WhatsAppContactType)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="cliente">Cliente / Lead</option>
                <option value="funcionario">Funcionário / Equipe</option>
                <option value="fornecedor">Fornecedor</option>
                <option value="outro">Outro</option>
              </select>
            </div>
            <div className="flex flex-col justify-end gap-2">
              <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newOcrEnabled}
                  onChange={(e) => setNewOcrEnabled(e.target.checked)}
                  className="rounded border-slate-700 text-cyan-500 focus:ring-0"
                />
                <span>Ativar OCR de cupons neste canal</span>
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newOcrAutoReply}
                  onChange={(e) => setNewOcrAutoReply(e.target.checked)}
                  disabled={!newOcrEnabled}
                  className="rounded border-slate-700 text-cyan-500 focus:ring-0 disabled:opacity-40"
                />
                <span>Enviar confirmação da leitura OCR no grupo/chat (opcional)</span>
              </label>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={busyId === 'new'}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded-lg whitespace-nowrap transition disabled:opacity-50"
            >
              {busyId === 'new' ? 'Salvando...' : 'Salvar Contato'}
            </button>
          </div>
        </form>
      )}

      {/* Filter & Search Bar + Contacts Table */}
      <div className="bg-[#0B132B] border border-slate-700/80 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-900 rounded-lg self-start">
            {(
              [
                { id: 'todos', label: `Todos (${contacts.length})` },
                { id: 'ocr_ativo', label: `OCR Ativo (${ocrActiveCount})` },
                { id: 'grupos', label: `Grupos (${contacts.filter((c) => c.isGroup).length})` },
                { id: 'privados', label: `Privados (${contacts.filter((c) => !c.isGroup).length})` },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilterMode(f.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md whitespace-nowrap transition ${
                  filterMode === f.id ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="relative w-full md:w-72">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar nome, número ou JID..."
              className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
            />
          </div>
        </div>

        {filteredContacts.length === 0 ? (
          <div className="p-12 text-center space-y-2 text-xs text-slate-400">
            <Users className="w-8 h-8 text-slate-600 mx-auto" />
            <p className="font-medium text-slate-300">Nenhum contato ou grupo encontrado nesta visão</p>
            <p className="text-slate-500">
              {isBridgeConnected
                ? 'Clique em "Sincronizar WhatsApp" ou importe clientes do OrçaÁgil para gerenciar permissões de OCR.'
                : 'Conecte seu WhatsApp por QR Code ou adicione um contato manualmente acima.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-400 bg-slate-900/60">
                  <th className="py-3 px-4 font-semibold">Contato / Grupo</th>
                  <th className="py-3 px-4 font-semibold">Canal / JID</th>
                  <th className="py-3 px-4 font-semibold">Leitura OCR</th>
                  <th className="py-3 px-4 font-semibold">Confirmação no Chat</th>
                  <th className="py-3 px-4 font-semibold text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {filteredContacts.map((contact) => {
                  const isBusy = busyId === contact.id || busyId === `reply_${contact.id}` || busyId === `del_${contact.id}`;
                  return (
                    <tr key={contact.id} className="hover:bg-slate-900/50 transition">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                              contact.isGroup
                                ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-400'
                                : 'bg-slate-900 border-slate-700 text-cyan-400'
                            }`}
                          >
                            {contact.isGroup ? <Users className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
                          </div>
                          <div className="min-w-0">
                            <p
                              className="font-semibold text-white truncate max-w-[320px]"
                              title={contact.name}
                            >
                              {contact.name}
                            </p>
                            <p className="text-[11px] text-slate-400">
                              {contact.isGroup
                                ? `Grupo${contact.participantsCount ? ` · ${contact.participantsCount} membros` : ''}`
                                : contact.contactType === 'funcionario'
                                ? 'Equipe / Funcionário'
                                : contact.contactType === 'fornecedor'
                                ? 'Fornecedor'
                                : 'Cliente'}
                              {contact.lastMessageAt &&
                                ` · Última atividade ${new Date(contact.lastMessageAt).toLocaleDateString('pt-BR')}`}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-mono text-[11px] text-slate-300 tabular-nums whitespace-nowrap">
                        {contact.jidOrPhone}
                      </td>

                      <td className="py-3.5 px-4">
                        <button
                          type="button"
                          onClick={() => handleToggleOcr(contact)}
                          disabled={isBusy}
                          className={`px-3 py-1.5 rounded-md font-semibold text-xs border transition whitespace-nowrap inline-flex items-center gap-1.5 ${
                            contact.ocrEnabled
                              ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300 hover:bg-emerald-950/80'
                              : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'
                          }`}
                        >
                          {contact.ocrEnabled ? (
                            <>
                              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                              <span>OCR Ativo</span>
                            </>
                          ) : (
                            <>
                              <ShieldAlert className="w-3.5 h-3.5 text-slate-500" />
                              <span>Ativar OCR</span>
                            </>
                          )}
                        </button>
                      </td>

                      <td className="py-3.5 px-4">
                        {contact.ocrEnabled ? (
                          <button
                            type="button"
                            onClick={() => handleToggleAutoReply(contact)}
                            disabled={isBusy}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition whitespace-nowrap cursor-pointer ${
                              contact.ocrAutoReply === true
                                ? 'bg-cyan-950/40 border-cyan-500/40 text-cyan-300'
                                : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            {contact.ocrAutoReply === true ? 'Envia msg no grupo (ON)' : 'Silencioso (Só Painel)'}
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-500">Bloqueado (OCR desligado)</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onOpenChat(contact)}
                            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md font-medium whitespace-nowrap transition inline-flex items-center gap-1"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>Chat</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onCreateAiRuleForContact(contact)}
                            className="px-2.5 py-1.5 bg-slate-800 hover:bg-cyan-900/60 border border-slate-700 hover:border-cyan-500/40 text-cyan-300 rounded-md font-medium whitespace-nowrap transition inline-flex items-center gap-1"
                            title="Criar regra de resposta automática com IA para este contato"
                          >
                            <Bot className="w-3.5 h-3.5" />
                            <span>Regra IA</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(contact)}
                            disabled={isBusy}
                            className="p-1.5 text-slate-500 hover:text-rose-400 rounded-md transition"
                            title="Remover contato"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
