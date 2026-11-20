import React, { useState } from 'react';
import {
  Check,
  Copy,
  Edit3,
  MessageSquarePlus,
  Plus,
  Send,
  Trash2,
  Zap,
} from 'lucide-react';
import { WhatsAppMessageCategory, WhatsAppQuickReply } from '../../types/whatsappComposio';
import {
  deleteWhatsAppQuickReply,
  saveWhatsAppQuickReply,
} from '../../services/composioWhatsAppClient';

interface WhatsAppQuickRepliesTabProps {
  quickReplies: WhatsAppQuickReply[];
  onRefresh: () => Promise<void>;
  onUseInChat: (reply: WhatsAppQuickReply) => void;
  onToast: (type: 'success' | 'error', text: string) => void;
}

const CATEGORY_OPTIONS: Array<{ value: WhatsAppMessageCategory; label: string }> = [
  { value: 'comercial_proposta', label: 'Proposta Comercial' },
  { value: 'cobranca_followup', label: 'Follow-up Orçamento' },
  { value: 'atendimento', label: 'Atendimento Direto' },
  { value: 'orientacao_equipe', label: 'Orientação / Equipe' },
  { value: 'reembolso_ocr', label: 'Reembolso OCR' },
];

export const WhatsAppQuickRepliesTab: React.FC<WhatsAppQuickRepliesTabProps> = ({
  quickReplies,
  onRefresh,
  onUseInChat,
  onToast,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [shortcut, setShortcut] = useState('');
  const [category, setCategory] = useState<WhatsAppMessageCategory>('comercial_proposta');
  const [text, setText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const resetForm = () => {
    setEditingId(null);
    setTitle('');
    setShortcut('');
    setCategory('comercial_proposta');
    setText('');
  };

  const handleEdit = (item: WhatsAppQuickReply) => {
    setEditingId(item.id);
    setTitle(item.title);
    setShortcut(item.shortcut);
    setCategory(item.category);
    setText(item.text);
  };

  const insertVariable = (token: string) => {
    setText((prev) => (prev ? `${prev}${prev.endsWith(' ') ? '' : ' '}${token}` : token));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !text.trim()) {
      onToast('error', 'Informe o título e o conteúdo da resposta rápida.');
      return;
    }
    setIsSaving(true);
    try {
      const res = await saveWhatsAppQuickReply({
        id: editingId || undefined,
        title: title.trim(),
        shortcut: shortcut.trim() || undefined,
        category,
        text: text.trim(),
      });
      if (res.success) {
        onToast('success', res.message || 'Resposta rápida salva.');
        resetForm();
        await onRefresh();
      } else {
        onToast('error', res.error || 'Falha ao salvar resposta rápida.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (item: WhatsAppQuickReply) => {
    const res = await deleteWhatsAppQuickReply(item.id);
    if (res.success) {
      if (editingId === item.id) resetForm();
      await onRefresh();
      onToast('success', `Resposta "${item.title}" excluída.`);
    } else {
      onToast('error', res.error || 'Falha ao excluir resposta rápida.');
    }
  };

  const handleCopy = (item: WhatsAppQuickReply) => {
    navigator.clipboard.writeText(item.text);
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left: Editor Form */}
      <form
        onSubmit={handleSave}
        className="lg:col-span-5 bg-[#0B132B] border border-slate-700/80 rounded-xl p-6 space-y-4"
      >
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <MessageSquarePlus className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-semibold text-white">
              {editingId ? 'Editar Resposta Rápida' : 'Nova Resposta Rápida'}
            </h3>
          </div>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="text-xs text-slate-400 hover:text-white"
            >
              Criar Nova
            </button>
          )}
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-medium text-slate-400 block mb-1">
              Título do Modelo *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Envio de Orçamento Inox 316L"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium text-slate-400 block mb-1">
                Atalho (Ex: /proposta)
              </label>
              <input
                type="text"
                value={shortcut}
                onChange={(e) => setShortcut(e.target.value)}
                placeholder="/orcamento"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-cyan-300 font-mono focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="text-[11px] font-medium text-slate-400 block mb-1">
                Categoria
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as WhatsAppMessageCategory)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
              >
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
              <label className="text-[11px] font-medium text-slate-400">
                Texto da Mensagem *
              </label>
              <div className="flex items-center gap-1.5">
                {['{nome}', '{proposta}', '{empresa}'].map((token) => (
                  <button
                    key={token}
                    type="button"
                    onClick={() => insertVariable(token)}
                    className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded text-[11px] font-mono text-cyan-300 transition"
                  >
                    +{token}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              rows={5}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Olá {nome}, segue nossa proposta {proposta} elaborada pela {empresa}..."
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs text-white focus:outline-none focus:border-cyan-500 leading-relaxed"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Ao usar no chat, as variáveis {'{nome}'}, {'{proposta}'} e {'{empresa}'} são preenchidas automaticamente com os dados do atendimento aberto.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs font-semibold rounded-lg"
            >
              Cancelar
            </button>
          )}
          <button
            type="submit"
            disabled={isSaving}
            className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded-lg flex items-center gap-2 whitespace-nowrap transition disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            <span>{isSaving ? 'Salvando...' : editingId ? 'Salvar Alterações' : 'Criar Resposta Rápida'}</span>
          </button>
        </div>
      </form>

      {/* Right: Saved Quick Replies List */}
      <div className="lg:col-span-7 bg-[#0B132B] border border-slate-700/80 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white">
              Biblioteca de Respostas Rápidas ({quickReplies.length})
            </h3>
            <p className="text-xs text-slate-400">
              Clique em "Usar no Chat" para inserir no compositor ou digite o atalho diretamente na caixa de mensagem.
            </p>
          </div>
        </div>

        {quickReplies.length === 0 ? (
          <div className="p-12 text-center space-y-2 text-xs text-slate-400">
            <Zap className="w-8 h-8 text-slate-600 mx-auto" />
            <p className="font-medium text-slate-300">Nenhuma resposta rápida cadastrada</p>
            <p className="text-slate-500">Crie seu primeiro modelo ao lado para acelerar o atendimento comercial.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {quickReplies.map((item) => {
              const catLabel = CATEGORY_OPTIONS.find((c) => c.value === item.category)?.label || item.category;
              return (
                <div key={item.id} className="p-4 hover:bg-slate-900/40 transition space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                      <span className="font-mono text-xs font-semibold text-cyan-300 bg-cyan-950/50 border border-cyan-500/30 px-2 py-0.5 rounded">
                        {item.shortcut}
                      </span>
                      <h4 className="text-xs font-semibold text-white truncate">{item.title}</h4>
                      <span className="text-[11px] text-slate-400">· {catLabel}</span>
                      <span className="text-[11px] text-slate-500 tabular-nums">
                        · {item.usageCount || 0} uso(s)
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => onUseInChat(item)}
                        className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded-md flex items-center gap-1.5 whitespace-nowrap transition"
                      >
                        <Send className="w-3 h-3" />
                        <span>Usar no Chat</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopy(item)}
                        className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs rounded-md flex items-center gap-1 whitespace-nowrap"
                      >
                        {copiedId === item.id ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span className="text-emerald-300">Copiado</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copiar</span>
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleEdit(item)}
                        className="p-1.5 text-slate-400 hover:text-white rounded-md transition"
                        title="Editar modelo"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(item)}
                        className="p-1.5 text-slate-500 hover:text-rose-400 rounded-md transition"
                        title="Excluir modelo"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-slate-300 whitespace-pre-wrap bg-slate-900/60 border border-slate-800 rounded-lg p-3 leading-relaxed">
                    {item.text}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
