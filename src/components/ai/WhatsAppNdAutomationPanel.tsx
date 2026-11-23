import React, { useEffect, useMemo, useState } from 'react';
import {
  FileText,
  Mail,
  Plus,
  RefreshCw,
  Send,
  CheckCircle2,
  AlertTriangle,
  Download,
  FileSpreadsheet,
  Edit3,
  Trash2,
  Play,
  Eye,
  X,
  Cloud,
  Power,
  Search,
  Info,
  Sparkles,
  MessageSquare,
  Users,
  User,
  Link2,
  Unlink,
} from 'lucide-react';
import {
  OutlookBridgeStatus,
  WhatsAppNdRecord,
  WhatsAppNdRule,
} from '../../types/whatsappComposio';
import {
  createWhatsAppNdRule,
  deleteWhatsAppNdRule,
  disconnectOutlookOAuth,
  fetchWhatsAppNdState,
  getOutlookOAuthUrl,
  parseAndGenerateNd,
  resendNdEmail,
  resendNdWhatsApp,
  scanPendingNdMessages,
  syncNdDataWithFirestore,
  testOutlookBridgeConnection,
  updateWhatsAppNdRule,
} from '../../services/composioWhatsAppClient';
import { downloadApi, apiFetch } from '../../apiAuthFetch';

interface Props {
  organizationId: string;
  onLogAudit?: (module: string, action: string, details: string) => Promise<void> | void;
}

interface TargetChannelOption {
  jid: string;
  name: string;
  subtitle: string;
  isGroup: boolean;
}

const SAMPLE_LUCAS_MESSAGE = `ND MDO - VENDA DE FOLGA
Lucas Soares da Silva
1.700
25/11 850
02/12 850
2004/26`;

const SAMPLE_PIX_MESSAGE = `VALE VIAGEM
Andrew Silva Feitosa
Valor: R$ 400,00
Data pagto: 19/11/2026
CPF: 046.968.536-08
Pix: andrew.feitosa@gmail.com
Telefone: (11) 98765-4321
Obra: 1707/25 UNIGRA MASTER MARTINI
Obs: Deslocamento técnico equipe montagem`;

const TEMPLATE_CHIPS = [
  '{projNumber}',
  '{year}',
  '{natureza}',
  '{recebedor}',
  '{valor}',
  '{centroCusto}',
  '{dataPagamento}',
];

function formatBrl(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value) || 0);
}

export const WhatsAppNdAutomationPanel: React.FC<Props> = ({ organizationId, onLogAudit }) => {
  const [rules, setRules] = useState<WhatsAppNdRule[]>([]);
  const [records, setRecords] = useState<WhatsAppNdRecord[]>([]);
  const [outlookStatus, setOutlookStatus] = useState<OutlookBridgeStatus | null>(null);
  const [availableGroups, setAvailableGroups] = useState<
    Array<{ jid: string; name: string; participantsCount: number; isGroup?: boolean }>
  >([]);
  const [availableContacts, setAvailableContacts] = useState<
    Array<{ jid: string; name: string; phone: string; isGroup?: boolean }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [firestoreSynced, setFirestoreSynced] = useState(false);

  const [banner, setBanner] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(
    null
  );

  // Outlook connection guide & quick test
  const [showOutlookGuide, setShowOutlookGuide] = useState(false);
  const [testEmailTo, setTestEmailTo] = useState('');
  const [testingEmail, setTestingEmail] = useState(false);
  const [connectingOAuth, setConnectingOAuth] = useState(false);
  const [scanningPending, setScanningPending] = useState(false);
  const [globalNextProjNumber, setGlobalNextProjNumber] = useState<number>(4925);

  // Rule Editor Modal / Form
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [savingRule, setSavingRule] = useState(false);
  const [targetFilterTab, setTargetFilterTab] = useState<'todos' | 'grupos' | 'contatos' | 'manual'>('todos');
  const [targetSearch, setTargetSearch] = useState('');
  const [formName, setFormName] = useState('');
  const [formGroupJid, setFormGroupJid] = useState('');
  const [formGroupName, setFormGroupName] = useState('');
  const [formNextProj, setFormNextProj] = useState('4925');
  const [formProjYear, setFormProjYear] = useState(String(new Date().getFullYear()));
  const [formEmitter, setFormEmitter] = useState('AgueroFlow | Assistente IA');
  const [formCompany, setFormCompany] = useState(
    'Aguero Inox Montagens e Manutenção Industrial LTDA - CNPJ 18.634.407/0001-36'
  );
  const [formDesignation, setFormDesignation] = useState('Não definido');
  const [formSendPdfWa, setFormSendPdfWa] = useState(true);
  const [formAutoEmail, setFormAutoEmail] = useState(true);
  const [formOutlookTo, setFormOutlookTo] = useState('');
  const [formOutlookCc, setFormOutlookCc] = useState('');
  const [formOutlookSubject, setFormOutlookSubject] = useState(
    'ND Nº PROJ {projNumber}/{year} - {natureza} - {recebedor}'
  );
  const [formOutlookBody, setFormOutlookBody] = useState(
    'Olá,\n\nSegue em anexo a Nota de Débito Nº PROJ {projNumber}/{year} gerada automaticamente pelo AgueroFlow.\n\n• Natureza: {natureza}\n• Recebedor: {recebedor}\n• Valor: {valor}\n• Data de Pagamento: {dataPagamento}\n• Centro de Custos: {centroCusto}\n\nAtenciosamente,\nAgueroFlow | Assistente IA'
  );

  // Live Simulator / Quick Generator (works even before any rule exists!)
  const [simRuleId, setSimRuleId] = useState('');
  const [simMessage, setSimMessage] = useState(SAMPLE_LUCAS_MESSAGE);
  const [simDispatchWa, setSimDispatchWa] = useState(false);
  const [simDispatchEmail, setSimDispatchEmail] = useState(false);
  const [simRunning, setSimRunning] = useState(false);

  // Records Search & PDF Preview Modal (uses Blob URL for maximum iframe reliability)
  const [searchTerm, setSearchTerm] = useState('');
  const [previewRecord, setPreviewRecord] = useState<WhatsAppNdRecord | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [loadingPreviewPdf, setLoadingPreviewPdf] = useState(false);
  const [busyRecordId, setBusyRecordId] = useState<string | null>(null);

  const loadState = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetchWhatsAppNdState();
      if (res.success) {
        setOutlookStatus(res.outlookStatus);
        setAvailableGroups(res.availableGroups || []);
        setAvailableContacts(res.availableContacts || []);
        if (typeof res.globalNextProjNumber === 'number' && res.globalNextProjNumber > 0) {
          setGlobalNextProjNumber(res.globalNextProjNumber);
        }
        const synced = await syncNdDataWithFirestore(
          res.rules || [],
          res.records || [],
          organizationId
        );
        setRules(synced.rules);
        setRecords(synced.records);
        setFirestoreSynced(synced.firestoreSynced);
        if (!simRuleId && synced.rules.length > 0) {
          setSimRuleId(synced.rules[0].id);
        }
        setTestEmailTo((prev) => {
          if (prev.trim()) return prev;
          const firstRuleEmail = synced.rules.find((r) => (r.outlookTo || []).length > 0)?.outlookTo?.[0];
          if (firstRuleEmail) return firstRuleEmail;
          const sender = res.outlookStatus?.senderEmail || '';
          if (sender && !sender.includes('resend.dev')) return sender;
          return prev;
        });
      } else if (!silent) {
        setBanner({ type: 'error', text: res.error || 'Falha ao carregar automação de NDs.' });
      }
    } catch (err: any) {
      if (!silent) {
        setBanner({ type: 'error', text: err?.message || 'Erro de conexão com o servidor.' });
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadState(false);
  }, [organizationId]);

  // Silent live refresh every 10s so incoming WhatsApp NDs appear automatically in the panel without manual F5
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible' && !showRuleForm) {
        loadState(true);
      }
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [organizationId, showRuleForm]);

  useEffect(() => {
    const handleOAuthMessage = (event: MessageEvent) => {
      const origin = event.origin || '';
      const trusted =
        origin === window.location.origin ||
        origin.endsWith('.run.app') ||
        origin.includes('localhost');
      if (!trusted) return;

      if (event.data?.type === 'OUTLOOK_OAUTH_SUCCESS') {
        setBanner({
          type: 'success',
          text: `Conta Outlook conectada via OAuth 2.0 (${event.data?.email || 'Microsoft 365'})! Envios de ND agora saem direto pela API Graph sem depender de SMTP AUTH.`,
        });
        loadState();
      } else if (event.data?.type === 'OUTLOOK_OAUTH_ERROR') {
        setBanner({
          type: 'error',
          text: event.data?.error || 'Falha ao autenticar conta Outlook via OAuth 2.0.',
        });
      }
    };
    window.addEventListener('message', handleOAuthMessage);
    return () => window.removeEventListener('message', handleOAuthMessage);
  }, []);

  // Load PDF as Blob URL when opening preview modal so browser/iframe renders & downloads cleanly
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;

    if (!previewRecord) {
      setPreviewBlobUrl(null);
      return;
    }

    setLoadingPreviewPdf(true);
    setPreviewBlobUrl(null);
    apiFetch(`/api/whatsapp/nd/records/${encodeURIComponent(previewRecord.id)}/pdf`)
      .then((r) => {
        if (!r.ok) throw new Error('Falha ao carregar arquivo PDF.');
        return r.blob();
      })
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setPreviewBlobUrl(objectUrl);
      })
      .catch((err) => {
        if (active) {
          setBanner({ type: 'error', text: err?.message || 'Erro ao carregar visualização do PDF.' });
        }
      })
      .finally(() => {
        if (active) setLoadingPreviewPdf(false);
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [previewRecord]);

  const allChannelOptions = useMemo<TargetChannelOption[]>(() => {
    const groups: TargetChannelOption[] = availableGroups.map((g) => ({
      jid: g.jid,
      name: g.name || g.jid,
      subtitle: g.participantsCount ? `Grupo • ${g.participantsCount} participantes` : 'Grupo WhatsApp',
      isGroup: true,
    }));
    const contacts: TargetChannelOption[] = availableContacts.map((c) => ({
      jid: c.jid,
      name: c.name || c.phone || c.jid,
      subtitle: c.phone ? `Contato • ${c.phone}` : 'Contato WhatsApp',
      isGroup: false,
    }));
    return [...groups, ...contacts];
  }, [availableGroups, availableContacts]);

  const filteredChannelOptions = useMemo(() => {
    const q = targetSearch.trim().toLowerCase();
    return allChannelOptions.filter((opt) => {
      if (targetFilterTab === 'grupos' && !opt.isGroup) return false;
      if (targetFilterTab === 'contatos' && opt.isGroup) return false;
      if (!q) return true;
      return (
        opt.name.toLowerCase().includes(q) ||
        opt.subtitle.toLowerCase().includes(q) ||
        opt.jid.toLowerCase().includes(q)
      );
    });
  }, [allChannelOptions, targetFilterTab, targetSearch]);

  const suggestedNextProjNumber = useMemo(() => {
    const maxFromRecords = records.reduce(
      (max, rec) => Math.max(max, (Number(rec.projNumber) || 0) + 1),
      0
    );
    const maxFromRules = rules.reduce(
      (max, rule) => Math.max(max, Number(rule.nextProjNumber) || 0),
      0
    );
    return Math.max(4925, globalNextProjNumber, maxFromRecords, maxFromRules);
  }, [globalNextProjNumber, records, rules]);

  const openNewRuleForm = () => {
    setEditingRuleId(null);
    setTargetSearch('');
    setTargetFilterTab(allChannelOptions.length > 0 ? 'todos' : 'manual');
    const firstOpt = availableGroups[0] || availableContacts[0];
    setFormName(firstOpt ? `Automação ND — ${firstOpt.name}` : 'Automação ND — NDs Aguero Inox');
    setFormGroupJid(firstOpt?.jid || '');
    setFormGroupName(firstOpt?.name || '');
    setFormNextProj(String(suggestedNextProjNumber));
    setFormProjYear(String(new Date().getFullYear()));
    setFormEmitter('AgueroFlow | Assistente IA');
    setFormCompany('Aguero Inox Montagens e Manutenção Industrial LTDA - CNPJ 18.634.407/0001-36');
    setFormDesignation('Não definido');
    setFormSendPdfWa(true);
    setFormAutoEmail(true);
    setFormOutlookTo('');
    setFormOutlookCc('');
    setFormOutlookSubject('ND Nº PROJ {projNumber}/{year} - {natureza} - {recebedor}');
    setFormOutlookBody(
      'Olá,\n\nSegue em anexo a Nota de Débito Nº PROJ {projNumber}/{year} gerada automaticamente pelo AgueroFlow.\n\n• Natureza: {natureza}\n• Recebedor: {recebedor}\n• Valor: {valor}\n• Data de Pagamento: {dataPagamento}\n• Centro de Custos: {centroCusto}\n\nAtenciosamente,\nAgueroFlow | Assistente IA'
    );
    setShowRuleForm(true);
  };

  const openEditRuleForm = (rule: WhatsAppNdRule) => {
    setEditingRuleId(rule.id);
    setTargetSearch('');
    setTargetFilterTab(allChannelOptions.length > 0 ? 'todos' : 'manual');
    setFormName(rule.name);
    setFormGroupJid(rule.groupJid);
    setFormGroupName(rule.groupName);
    setFormNextProj(String(rule.nextProjNumber || 4925));
    setFormProjYear(String(rule.projYear || new Date().getFullYear()));
    setFormEmitter(rule.emitterName || 'AgueroFlow | Assistente IA');
    setFormCompany(
      rule.companyName ||
        'Aguero Inox Montagens e Manutenção Industrial LTDA - CNPJ 18.634.407/0001-36'
    );
    setFormDesignation(rule.defaultDesignation || 'Não definido');
    setFormSendPdfWa(rule.sendPdfToWhatsAppGroup !== false);
    setFormAutoEmail(rule.autoEmailEnabled !== false);
    setFormOutlookTo((rule.outlookTo || []).join(', '));
    setFormOutlookCc((rule.outlookCc || []).join(', '));
    setFormOutlookSubject(
      rule.outlookSubjectTemplate || 'ND Nº PROJ {projNumber}/{year} - {natureza} - {recebedor}'
    );
    setFormOutlookBody(rule.outlookBodyTemplate || '');
    setShowRuleForm(true);
  };

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawTarget = formGroupJid.trim();
    if (!rawTarget) {
      setBanner({
        type: 'error',
        text: 'Escolha um grupo ou contato na lista (ou informe um número de WhatsApp / JID manualmente).',
      });
      return;
    }

    // Normalize manual phone input (e.g. 5511999999999 -> 5511999999999@s.whatsapp.net)
    let normalizedJid = rawTarget;
    if (!normalizedJid.includes('@')) {
      const digits = normalizedJid.replace(/[^\d]/g, '');
      if (digits.length >= 10) {
        normalizedJid = `${digits}@s.whatsapp.net`;
      }
    }

    setSavingRule(true);
    setBanner(null);
    try {
      const displayTargetName = formGroupName.trim() || rawTarget;
      const payload = {
        organizationId,
        name: formName.trim() || `Automação ND — ${displayTargetName}`,
        groupJid: normalizedJid,
        groupName: displayTargetName,
        nextProjNumber: Math.max(1, Number(formNextProj) || 4925),
        projYear: Number(formProjYear) || new Date().getFullYear(),
        emitterName: formEmitter.trim() || 'AgueroFlow | Assistente IA',
        companyName:
          formCompany.trim() ||
          'Aguero Inox Montagens e Manutenção Industrial LTDA - CNPJ 18.634.407/0001-36',
        defaultDesignation: formDesignation.trim() || 'Não definido',
        sendPdfToWhatsAppGroup: formSendPdfWa,
        autoEmailEnabled: formAutoEmail,
        outlookTo: formOutlookTo
          .split(/[,\n;]+/)
          .map((s) => s.trim())
          .filter((s) => s.includes('@')),
        outlookCc: formOutlookCc
          .split(/[,\n;]+/)
          .map((s) => s.trim())
          .filter((s) => s.includes('@')),
        outlookSubjectTemplate: formOutlookSubject.trim(),
        outlookBodyTemplate: formOutlookBody.trim(),
      };

      const res = editingRuleId
        ? await updateWhatsAppNdRule(editingRuleId, payload)
        : await createWhatsAppNdRule(payload);

      if (res.success) {
        if (res.rules) setRules(res.rules);
        if (res.rule && !simRuleId) setSimRuleId(res.rule.id);
        setShowRuleForm(false);
        setBanner({
          type: 'success',
          text: res.message || 'Regra de Automação de ND salva e sincronizada no Firestore.',
        });
        void Promise.resolve(
          onLogAudit?.(
            'Automação NDs & Outlook',
            editingRuleId ? 'Regra ND Atualizada' : 'Regra ND Criada',
            `${payload.name} (${payload.groupName}) | Outlook Para: ${payload.outlookTo.join(', ') || 'nenhum'}`
          )
        ).catch(() => undefined);
      } else {
        setBanner({ type: 'error', text: res.error || 'Falha ao salvar regra de ND.' });
      }
    } finally {
      setSavingRule(false);
    }
  };

  const handleToggleRule = async (rule: WhatsAppNdRule) => {
    const res = await updateWhatsAppNdRule(rule.id, { active: !rule.active });
    if (res.success && res.rules) {
      setRules(res.rules);
      setBanner({
        type: 'info',
        text: `Regra "${rule.name}" ${!rule.active ? 'ativada' : 'pausada'}.`,
      });
    }
  };

  const handleDeleteRule = async (rule: WhatsAppNdRule) => {
    const res = await deleteWhatsAppNdRule(rule.id);
    if (res.success && res.rules) {
      setRules(res.rules);
      if (simRuleId === rule.id) setSimRuleId(res.rules[0]?.id || '');
      setBanner({ type: 'info', text: `Regra "${rule.name}" removida.` });
    }
  };

  const handleSimulateNd = async () => {
    if (!simMessage.trim()) return;

    setSimRunning(true);
    setBanner(null);
    try {
      const targetRuleId = simRuleId || rules[0]?.id || undefined;
      const res = await parseAndGenerateNd({
        ruleId: targetRuleId,
        messageText: simMessage,
        dispatchWhatsApp: Boolean(targetRuleId) && simDispatchWa,
        dispatchEmail: Boolean(targetRuleId) && simDispatchEmail,
      });

      if (res.success && res.record) {
        if (res.rules) setRules(res.rules);
        if (res.records) setRecords(res.records);
        setGlobalNextProjNumber((prev) => Math.max(prev, (Number(res.record?.projNumber) || 0) + 1));
        setPreviewRecord(res.record);
        const waInfo =
          targetRuleId && simDispatchWa
            ? res.whatsappResult?.success
              ? ' | PDF enviado no WhatsApp'
              : ` | WhatsApp: ${res.whatsappResult?.error || 'não enviado'}`
            : '';
        const mailInfo =
          targetRuleId && simDispatchEmail
            ? res.emailResult?.success
              ? ' | E-mail Outlook enviado'
              : ` | Outlook: ${res.emailResult?.error || 'pendente config'}`
            : '';
        setBanner({
          type: 'success',
          text: `ND Nº PROJ ${res.record.projNumber}/${res.record.projYear} gerada (${res.record.natureza} — ${res.record.receiverName} — ${formatBrl(res.record.amount)})${waInfo}${mailInfo}`,
        });
        void Promise.resolve(
          onLogAudit?.(
            'Automação NDs & Outlook',
            'ND Gerada',
            `Nº PROJ ${res.record.projNumber}/${res.record.projYear} - ${res.record.receiverName} - ${formatBrl(res.record.amount)}`
          )
        ).catch(() => undefined);
      } else {
        setBanner({
          type: 'error',
          text: res.error || 'Não foi possível extrair os dados da Nota de Débito.',
        });
      }
    } catch (err: any) {
      setBanner({
        type: 'error',
        text: err?.message || 'Erro ao gerar PDF de teste da Nota de Débito.',
      });
    } finally {
      setSimRunning(false);
    }
  };

  const handleResendEmail = async (record: WhatsAppNdRecord) => {
    setBusyRecordId(record.id);
    setBanner(null);
    try {
      const res = await resendNdEmail(record.id);
      if (res.records) setRecords(res.records);
      setBanner({
        type: res.success ? 'success' : 'error',
        text: res.success
          ? res.message || 'E-mail enviado via Outlook!'
          : res.error || 'Falha ao enviar e-mail via Outlook.',
      });
    } finally {
      setBusyRecordId(null);
    }
  };

  const handleResendWhatsApp = async (record: WhatsAppNdRecord) => {
    setBusyRecordId(record.id);
    setBanner(null);
    try {
      const res = await resendNdWhatsApp(record.id);
      if (res.records) setRecords(res.records);
      setBanner({
        type: res.success ? 'success' : 'error',
        text: res.success
          ? res.message || 'PDF enviado no WhatsApp!'
          : res.error || 'Falha ao enviar PDF no WhatsApp.',
      });
    } finally {
      setBusyRecordId(null);
    }
  };

  const handleTestOutlook = async (e: React.FormEvent) => {
    e.preventDefault();
    const list = testEmailTo
      .split(/[,\n;]+/)
      .map((s) => s.trim())
      .filter((s) => s.includes('@'));
    if (list.length === 0) {
      setBanner({ type: 'error', text: 'Digite um e-mail válido para testar a ponte Outlook.' });
      return;
    }
    setTestingEmail(true);
    setBanner(null);
    try {
      const res = await testOutlookBridgeConnection({ to: list });
      if (res.outlookStatus) setOutlookStatus(res.outlookStatus);
      setBanner({
        type: res.success ? 'success' : 'error',
        text: res.success
          ? res.message || 'E-mail de teste enviado com sucesso!'
          : res.error || 'Ponte Outlook ainda não configurada.',
      });
    } finally {
      setTestingEmail(false);
    }
  };

  const filteredRecords = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return records;
    return records.filter(
      (r) =>
        String(r.projNumber).includes(q) ||
        (r.receiverName || '').toLowerCase().includes(q) ||
        (r.natureza || '').toLowerCase().includes(q) ||
        (r.costCenter || '').toLowerCase().includes(q) ||
        (r.sourceGroupName || '').toLowerCase().includes(q)
    );
  }, [records, searchTerm]);

  const totalAmount = useMemo(
    () => filteredRecords.reduce((acc, r) => acc + (Number(r.amount) || 0), 0),
    [filteredRecords]
  );

  const handleConnectOutlookOAuth = async () => {
    setConnectingOAuth(true);
    setBanner(null);
    try {
      const redirectUri = `${window.location.origin}/api/outlook/oauth/callback`;
      const res = await getOutlookOAuthUrl(redirectUri);
      if (!res.success || !res.url) {
        setShowOutlookGuide(true);
        setBanner({
          type: 'error',
          text:
            res.error ||
            'Configure OUTLOOK_CLIENT_ID nos Secrets do AI Studio para usar login OAuth 2.0 (ou use Brevo/Resend API no guia abaixo).',
        });
        return;
      }
      const popup = window.open(
        res.url,
        'outlook_oauth_popup',
        'width=560,height=720,scrollbars=yes,resizable=yes'
      );
      if (!popup) {
        setBanner({
          type: 'error',
          text: 'O navegador bloqueou o popup de login da Microsoft. Libere popups para este site e clique novamente em Conectar Outlook.',
        });
      }
    } finally {
      setConnectingOAuth(false);
    }
  };

  const handleDisconnectOutlookOAuth = async () => {
    setConnectingOAuth(true);
    try {
      const res = await disconnectOutlookOAuth();
      if (res.outlookStatus) setOutlookStatus(res.outlookStatus);
      setBanner({
        type: 'info',
        text: res.message || 'Sessão OAuth 2.0 do Outlook desconectada.',
      });
    } finally {
      setConnectingOAuth(false);
    }
  };

  const handleScanPendingNds = async () => {
    setScanningPending(true);
    setBanner(null);
    try {
      const res = await scanPendingNdMessages(12);
      if (res.success) {
        if (res.rules) setRules(res.rules);
        if (res.records) setRecords(res.records);
        if (typeof res.globalNextProjNumber === 'number' && res.globalNextProjNumber > 0) {
          setGlobalNextProjNumber(res.globalNextProjNumber);
        }
        setBanner({
          type: (res.generatedCount || 0) > 0 ? 'success' : 'info',
          text: res.message || 'Varredura de solicitações de ND pendentes concluída.',
        });
      } else {
        setBanner({
          type: 'error',
          text: res.error || 'Falha ao verificar solicitações de ND pendentes.',
        });
      }
    } finally {
      setScanningPending(false);
    }
  };

  const providerLabel =
    outlookStatus?.activeProvider === 'outlook_oauth'
      ? 'Microsoft 365 OAuth 2.0 (Graph Mail.Send — sem SMTP AUTH)'
      : outlookStatus?.activeProvider === 'outlook_graph'
      ? 'Microsoft Graph API (Azure App M365)'
      : outlookStatus?.activeProvider === 'brevo_api'
      ? 'Brevo HTTPS API (Envio direto sem bloqueio SMTP)'
      : outlookStatus?.activeProvider === 'resend_api'
      ? 'Resend HTTPS API (Envio direto sem bloqueio SMTP)'
      : outlookStatus?.activeProvider === 'outlook_webhook'
      ? 'Power Automate / Webhook HTTPS (Outlook)'
      : outlookStatus?.activeProvider === 'composio_outlook'
      ? 'Composio Outlook Bridge'
      : outlookStatus?.activeProvider === 'outlook_smtp'
      ? 'SMTP (smtp.office365.com / Gmail)'
      : 'Aguardando configuração (OAuth 2.0, Brevo API, Resend ou Power Automate)';

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5 bg-[#F5F5F7] dark:bg-[#0B0C10] text-[#1D1D1F] dark:text-slate-100">
      {/* Header Row */}
      <div className="bg-white dark:bg-[#121826] border border-black/[0.08] dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <h3 className="text-[15px] font-bold text-[#1D1D1F] dark:text-white flex items-center gap-2 leading-snug">
              <FileText className="w-4 h-4 text-[#0071E3] dark:text-indigo-400 shrink-0" />
              <span>Automação de Notas de Débito (ND) — WhatsApp + PDF + Outlook</span>
            </h3>
            <p className="text-xs text-[#6E6E73] dark:text-slate-400 leading-relaxed max-w-3xl">
              Monitora grupos ou contatos configurados, extrai dados em qualquer ordem (sempre valor cheio), gera o PDF oficial Aguero Inox, responde no chat e dispara no Outlook.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <span
              className={`text-[11px] font-medium px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                firestoreSynced
                  ? 'bg-[#E8F8EE] dark:bg-emerald-950/50 border-[#166534]/20 dark:border-emerald-800/70 text-[#166534] dark:text-emerald-300'
                  : 'bg-[#F5F5F7] dark:bg-slate-900 border-black/[0.08] dark:border-slate-700 text-[#6E6E73] dark:text-slate-400'
              }`}
            >
              <Cloud className="w-3.5 h-3.5 shrink-0" />
              <span>{firestoreSynced ? 'Firestore Sincronizado' : 'Local'}</span>
            </span>

            <button
              type="button"
              onClick={handleScanPendingNds}
              disabled={scanningPending || loading}
              className="px-3 py-1.5 rounded-lg bg-[#E8F8EE] hover:bg-[#D7F2E2] dark:bg-emerald-950/70 dark:hover:bg-emerald-900/70 border border-[#166534]/25 dark:border-emerald-700/60 text-xs font-semibold text-[#166534] dark:text-emerald-200 flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0 transition"
              title="Puxa mensagens recentes/offline dos grupos com regra ativa e gera qualquer ND pendente"
            >
              <Sparkles className={`w-3.5 h-3.5 shrink-0 ${scanningPending ? 'animate-spin' : ''}`} />
              <span>{scanningPending ? 'Verificando...' : 'Verificar Pendentes'}</span>
            </button>

            <button
              type="button"
              onClick={() => loadState(false)}
              disabled={loading}
              className="px-3 py-1.5 rounded-lg bg-white hover:bg-[#F2F2F7] dark:bg-slate-900 dark:hover:bg-slate-800 border border-black/[0.1] dark:border-slate-700 text-xs font-medium text-[#1D1D1F] dark:text-slate-200 flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${loading ? 'animate-spin' : ''}`} />
              <span>Atualizar</span>
            </button>

            <button
              type="button"
              onClick={openNewRuleForm}
              className="px-3.5 py-1.5 rounded-lg bg-[#0071E3] hover:bg-[#0077ED] text-xs font-semibold text-white apple-solid-btn flex items-center gap-1.5 cursor-pointer shadow-sm whitespace-nowrap shrink-0 transition"
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span>Nova Regra (Grupo ou Contato)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Feedback Banner */}
      {banner && (
        <div
          className={`p-3.5 rounded-2xl border text-xs flex items-start justify-between gap-3 shadow-sm ${
            banner.type === 'success'
              ? 'bg-[#E8F8EE] dark:bg-emerald-950/50 border-[#166534]/25 dark:border-emerald-700/60 text-[#145A26] dark:text-emerald-200'
              : banner.type === 'error'
              ? 'bg-[#FFECEF] dark:bg-red-950/50 border-[#C41C28]/25 dark:border-red-800/70 text-[#9E0010] dark:text-red-200'
              : 'bg-[#EBF5FF] dark:bg-indigo-950/50 border-[#0071E3]/25 dark:border-indigo-700/60 text-[#004C99] dark:text-indigo-200'
          }`}
        >
          <div className="flex items-start gap-2 min-w-0 leading-relaxed">
            {banner.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-[#166534] dark:text-emerald-400 mt-0.5" />
            ) : banner.type === 'error' ? (
              <AlertTriangle className="w-4 h-4 shrink-0 text-[#C41C28] dark:text-red-400 mt-0.5" />
            ) : (
              <Info className="w-4 h-4 shrink-0 text-[#0071E3] dark:text-indigo-400 mt-0.5" />
            )}
            <span className="break-words">{banner.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="text-[#6E6E73] hover:text-[#1D1D1F] dark:text-slate-400 dark:hover:text-white cursor-pointer shrink-0 p-0.5"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Outlook Bridge Status Card */}
      <div className="rounded-2xl bg-white dark:bg-[#121826] border border-black/[0.08] dark:border-slate-800 p-4 sm:p-5 space-y-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center border shrink-0 ${
                outlookStatus?.configured
                  ? 'bg-[#E8F8EE] dark:bg-emerald-500/15 border-[#166534]/20 dark:border-emerald-500/40 text-[#166534] dark:text-emerald-400'
                  : 'bg-[#FFF4E5] dark:bg-amber-500/15 border-[#9A4400]/20 dark:border-amber-500/40 text-[#9A4400] dark:text-amber-400'
              }`}
            >
              <Mail className="w-4 h-4" />
            </div>
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-xs font-bold text-[#1D1D1F] dark:text-white">
                  Ponte de Envio Outlook (Microsoft 365)
                </h4>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border whitespace-nowrap ${
                    outlookStatus?.configured
                      ? 'bg-[#E8F8EE] dark:bg-emerald-950/70 border-[#166534]/25 dark:border-emerald-700 text-[#166534] dark:text-emerald-300'
                      : 'bg-[#FFF4E5] dark:bg-amber-950/70 border-[#9A4400]/25 dark:border-amber-700 text-[#9A4400] dark:text-amber-300'
                  }`}
                >
                  {outlookStatus?.configured ? 'Conectado' : 'Pendente de Secrets'}
                </span>
              </div>
              <p className="text-xs text-[#6E6E73] dark:text-slate-400 leading-relaxed break-words">
                Provedor ativo:{' '}
                <strong className="text-[#1D1D1F] dark:text-slate-200">{providerLabel}</strong>
                {outlookStatus?.senderEmail ? ` · Remetente: ${outlookStatus.senderEmail}` : ''}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {outlookStatus?.oauthConnected ? (
              <button
                type="button"
                onClick={handleDisconnectOutlookOAuth}
                disabled={connectingOAuth}
                className="px-3 py-1.5 rounded-lg bg-[#FFECEF] hover:bg-[#FFD9DF] dark:bg-rose-950/60 dark:hover:bg-rose-900/60 border border-[#C41C28]/25 dark:border-rose-700/50 text-xs font-semibold text-[#C41C28] dark:text-rose-200 flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0 transition"
              >
                <Unlink className="w-3.5 h-3.5 shrink-0" />
                <span>Desconectar OAuth</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleConnectOutlookOAuth}
                disabled={connectingOAuth}
                className="px-3 py-1.5 rounded-lg bg-[#1E7E34] hover:bg-[#19692C] text-xs font-semibold text-white apple-solid-btn flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0 transition"
              >
                <Link2 className="w-3.5 h-3.5 shrink-0" />
                <span>{connectingOAuth ? 'Abrindo Microsoft...' : 'Conectar Outlook (OAuth 2.0)'}</span>
              </button>
            )}

            <form onSubmit={handleTestOutlook} className="flex flex-wrap items-center gap-1.5">
              <input
                type="email"
                value={testEmailTo}
                onChange={(e) => setTestEmailTo(e.target.value)}
                placeholder="email@agueroinox.com.br"
                className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-950 border border-black/[0.14] dark:border-slate-700 text-xs text-[#1D1D1F] dark:text-white placeholder:text-[#86868B] dark:placeholder:text-slate-500 w-56 focus:outline-none focus:border-[#0071E3]"
              />
              <button
                type="submit"
                disabled={testingEmail}
                className="px-3 py-1.5 rounded-lg bg-[#0071E3] hover:bg-[#0077ED] text-xs font-semibold text-white apple-solid-btn flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0 transition"
              >
                <Send className="w-3.5 h-3.5 shrink-0" />
                <span>{testingEmail ? 'Testando...' : 'Testar Envio'}</span>
              </button>
            </form>

            <button
              type="button"
              onClick={() => setShowOutlookGuide((v) => !v)}
              className="px-3 py-1.5 rounded-lg bg-[#F5F5F7] hover:bg-[#E8E8ED] dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 border border-black/[0.1] dark:border-indigo-700/50 text-xs font-medium text-[#1D1D1F] dark:text-indigo-300 cursor-pointer whitespace-nowrap shrink-0 transition"
            >
              {showOutlookGuide ? 'Ocultar Guia' : 'Configurar / Guia'}
            </button>
          </div>
        </div>

        {outlookStatus?.activeProvider === 'outlook_smtp' && (
          <div className="p-3 rounded-xl bg-[#FFF4E5] dark:bg-amber-950/40 border border-[#9A4400]/25 dark:border-amber-700/50 text-xs text-[#8A3D00] dark:text-amber-200 flex items-start gap-2.5 leading-relaxed">
            <AlertTriangle className="w-4 h-4 text-[#9A4400] dark:text-amber-400 shrink-0 mt-0.5" />
            <span>
              <strong>Atenção Microsoft 365 (Erro 535 5.7.139):</strong> O tenant corporativo bloqueia{' '}
              <code className="font-mono font-semibold">SmtpClientAuthentication</code> por padrão. Para enviar sem bloqueio, use{' '}
              <strong>Conectar Outlook (OAuth 2.0)</strong>, <strong>Brevo API</strong>, <strong>Resend API</strong> ou{' '}
              <strong>Power Automate Webhook</strong> (veja em &quot;Configurar / Guia&quot;).
            </span>
          </div>
        )}

        {outlookStatus?.activeProvider === 'resend_api' &&
          String(outlookStatus?.senderEmail || '').includes('resend.dev') && (
            <div className="p-3 rounded-xl bg-[#E8F8EE] dark:bg-emerald-950/35 border border-[#166534]/20 dark:border-emerald-700/40 text-xs text-[#145A26] dark:text-emerald-200 flex items-start gap-2.5 leading-relaxed">
              <CheckCircle2 className="w-4 h-4 text-[#166534] dark:text-emerald-400 shrink-0 mt-0.5" />
              <span>
                <strong>Resend HTTPS API ativa e conectada (sem bloqueio SMTP 535).</strong> Remetente atual:{' '}
                <code className="font-mono font-semibold">{outlookStatus.senderEmail}</code>. No modo sandbox do Resend, caso não apareça na Caixa de Entrada do Outlook, verifique <strong>Lixo Eletrônico / Outros</strong>; para entrega direta na Caixa de Entrada de qualquer colaborador (ex: financeiro@agueroinox.com.br), verifique o domínio <strong>agueroinox.com.br</strong> no painel Resend.
              </span>
            </div>
          )}

        {showOutlookGuide && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-black/[0.06] dark:border-slate-800 text-xs">
            <div className="p-3.5 rounded-xl bg-[#F5F5F7] dark:bg-slate-950/70 border border-black/[0.07] dark:border-emerald-800/40 space-y-2">
              <div className="font-bold text-[#166534] dark:text-emerald-300">
                Opção 1 (Direto do seu Outlook M365 sem SMTP AUTH): OAuth 2.0 + Graph
              </div>
              <p className="text-[#424245] dark:text-slate-300 leading-relaxed">
                Envia direto da sua conta Outlook via HTTPS Graph API (<code className="font-mono font-semibold">Mail.Send</code>), imune ao erro <code className="font-mono font-semibold">535 5.7.139</code> e salva em <strong>Itens Enviados</strong>.
              </p>
              <div className="text-[#424245] dark:text-slate-400 font-mono text-[11px] bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-black/[0.08] dark:border-slate-800 space-y-0.5 break-all">
                <div>OUTLOOK_CLIENT_ID = (Application ID no Azure Entra ID)</div>
                <div>OUTLOOK_CLIENT_SECRET = (Opcional se app Web)</div>
                <div>Redirect URI: {outlookStatus?.callbackUrl || `${window.location.origin}/api/outlook/oauth/callback`}</div>
              </div>
              <p className="text-[#6E6E73] dark:text-slate-400">
                Depois de adicionar <code className="font-mono text-[#0071E3] dark:text-indigo-300">OUTLOOK_CLIENT_ID</code> nos Secrets, clique em <strong>Conectar Outlook (OAuth 2.0)</strong> acima.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-[#F5F5F7] dark:bg-slate-950/70 border border-black/[0.07] dark:border-cyan-800/40 space-y-2">
              <div className="font-bold text-[#0071E3] dark:text-cyan-300">
                Opção 2 (Mais Rápida — 2 min, sem TI/Azure): Brevo ou Resend API (HTTPS)
              </div>
              <p className="text-[#424245] dark:text-slate-300 leading-relaxed">
                Usa API HTTPS na porta 443 — <strong>100% imune</strong> ao bloqueio de SMTP da Microsoft. O Resend e o Brevo enviam com anexo PDF oficial.
              </p>
              <div className="text-[#424245] dark:text-slate-400 font-mono text-[11px] bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-black/[0.08] dark:border-slate-800 space-y-0.5">
                <div>BREVO_API_KEY = xkeysib-...</div>
                <div>BREVO_SENDER_EMAIL = gustavo@agueroinox.com.br</div>
                <div className="text-[#86868B] dark:text-slate-500 pt-1">— ou com Resend —</div>
                <div>RESEND_API_KEY = re_...</div>
                <div>RESEND_FROM_EMAIL = nd@agueroinox.com.br</div>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#F5F5F7] dark:bg-slate-950/70 border border-black/[0.07] dark:border-indigo-800/40 space-y-2">
              <div className="font-bold text-[#4338CA] dark:text-indigo-300">
                Opção 3 (Direto do Outlook sem Azure Admin): Power Automate Webhook
              </div>
              <p className="text-[#424245] dark:text-slate-300 leading-relaxed">
                No Microsoft 365 Power Automate, crie um fluxo <strong>Quando uma solicitação HTTP for recebida</strong> → <strong>Enviar um email (V2)</strong> do Outlook com anexo base64 e cole a URL no Secret:
              </p>
              <div className="text-[#424245] dark:text-slate-400 font-mono text-[11px] bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-black/[0.08] dark:border-slate-800 space-y-0.5">
                <div>OUTLOOK_WEBHOOK_URL = https://prod-...logic.azure.com/...</div>
                <div>OUTLOOK_WEBHOOK_SECRET = (opcional)</div>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#F5F5F7] dark:bg-slate-950/70 border border-black/[0.07] dark:border-slate-800 space-y-2">
              <div className="font-bold text-[#1D1D1F] dark:text-slate-200">
                Opção 4 (SMTP Alternativo): Gmail com Senha de App ou liberar SMTP M365
              </div>
              <p className="text-[#424245] dark:text-slate-300 leading-relaxed">
                O servidor já detecta <code className="font-mono">@gmail.com</code> automaticamente via <code className="font-mono">smtp.gmail.com</code> (usando Senha de App do Google). Para usar M365 via SMTP, o admin precisa ativar <em>Authenticated SMTP</em> no Admin Center.
              </p>
              <div className="text-[#424245] dark:text-slate-400 font-mono text-[11px] bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-black/[0.08] dark:border-slate-800 space-y-0.5">
                <div>OUTLOOK_SMTP_USER = sua.conta@gmail.com</div>
                <div>OUTLOOK_SMTP_PASS = (Senha de App 16 caracteres)</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Create / Edit Rule Form */}
      {showRuleForm && (
        <form
          onSubmit={handleSaveRule}
          className="rounded-2xl bg-white dark:bg-[#121826] border border-[#0071E3]/30 dark:border-indigo-500/40 p-4 sm:p-5 space-y-4 shadow-md"
        >
          <div className="flex items-center justify-between border-b border-black/[0.06] dark:border-slate-800 pb-3">
            <h4 className="text-sm font-bold text-[#1D1D1F] dark:text-white flex items-center gap-2">
              <Edit3 className="w-4 h-4 text-[#0071E3] dark:text-indigo-400 shrink-0" />
              <span>
                {editingRuleId
                  ? 'Editar Regra de Automação de ND + Roteamento Outlook'
                  : 'Nova Regra de Automação de ND (Grupo ou Contato)'}
              </span>
            </h4>
            <button
              type="button"
              onClick={() => setShowRuleForm(false)}
              className="text-[#6E6E73] hover:text-[#1D1D1F] dark:text-slate-400 dark:hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Free Group OR Contact Picker */}
          <div className="p-3.5 rounded-xl bg-[#F5F5F7] dark:bg-slate-950/70 border border-black/[0.06] dark:border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-bold text-[#1D1D1F] dark:text-slate-200">
                Escolha o Grupo ou Contato do WhatsApp a Monitorar
              </label>
              <div className="inline-flex items-center gap-1 p-1 bg-white dark:bg-slate-900 border border-black/[0.08] dark:border-slate-800 rounded-lg text-[11px] overflow-x-auto max-w-full">
                {(
                  [
                    { id: 'todos', label: `Todos (${allChannelOptions.length})` },
                    { id: 'grupos', label: `Grupos (${availableGroups.length})` },
                    { id: 'contatos', label: `Contatos (${availableContacts.length})` },
                    { id: 'manual', label: 'Digitar Manualmente' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setTargetFilterTab(tab.id)}
                    className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer transition whitespace-nowrap shrink-0 ${
                      targetFilterTab === tab.id
                        ? 'bg-[#0071E3] text-white apple-solid-btn'
                        : 'text-[#6E6E73] dark:text-slate-400 hover:text-[#1D1D1F] dark:hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {targetFilterTab === 'manual' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-[#6E6E73] dark:text-slate-400 mb-1">
                    Número com DDI+DDD ou JID do Grupo
                  </label>
                  <input
                    type="text"
                    value={formGroupJid}
                    onChange={(e) => setFormGroupJid(e.target.value)}
                    placeholder="Ex: 5511999999999 ou 120363000000000000@g.us"
                    className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-black/[0.14] dark:border-slate-700 text-xs text-[#1D1D1F] dark:text-white focus:outline-none focus:border-[#0071E3]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#6E6E73] dark:text-slate-400 mb-1">
                    Nome de Exibição do Grupo/Contato
                  </label>
                  <input
                    type="text"
                    value={formGroupName}
                    onChange={(e) => {
                      setFormGroupName(e.target.value);
                      if (!editingRuleId) setFormName(`Automação ND — ${e.target.value}`);
                    }}
                    placeholder="Ex: NDs Aguero Inox"
                    className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-black/[0.14] dark:border-slate-700 text-xs text-[#1D1D1F] dark:text-white focus:outline-none focus:border-[#0071E3]"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-[#86868B] dark:text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={targetSearch}
                    onChange={(e) => setTargetSearch(e.target.value)}
                    placeholder="Buscar grupo ou contato pelo nome ou telefone..."
                    className="w-full pl-8 pr-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-black/[0.14] dark:border-slate-700 text-xs text-[#1D1D1F] dark:text-white placeholder:text-[#86868B] dark:placeholder:text-slate-500 focus:outline-none focus:border-[#0071E3]"
                  />
                </div>

                {filteredChannelOptions.length === 0 ? (
                  <div className="p-3 rounded-lg bg-white dark:bg-slate-900/70 border border-black/[0.08] dark:border-slate-800 text-xs text-[#6E6E73] dark:text-slate-400 flex items-center justify-between gap-2">
                    <span>Nenhum grupo ou contato encontrado com esse filtro.</span>
                    <button
                      type="button"
                      onClick={() => setTargetFilterTab('manual')}
                      className="text-[#0071E3] dark:text-indigo-400 hover:underline font-semibold cursor-pointer"
                    >
                      Digitar manualmente
                    </button>
                  </div>
                ) : (
                  <div className="max-h-44 overflow-y-auto custom-scrollbar grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 pr-1">
                    {filteredChannelOptions.map((opt) => {
                      const selected = formGroupJid === opt.jid;
                      return (
                        <button
                          key={opt.jid}
                          type="button"
                          onClick={() => {
                            setFormGroupJid(opt.jid);
                            setFormGroupName(opt.name);
                            if (!editingRuleId) setFormName(`Automação ND — ${opt.name}`);
                          }}
                          className={`text-left p-2.5 rounded-xl border text-xs transition cursor-pointer flex items-center gap-2 ${
                            selected
                              ? 'bg-[#EBF5FF] dark:bg-indigo-600/25 border-[#0071E3] dark:border-indigo-500 text-[#1D1D1F] dark:text-white'
                              : 'bg-white dark:bg-slate-900/80 border-black/[0.08] dark:border-slate-800 text-[#1D1D1F] dark:text-slate-300 hover:border-black/20 dark:hover:border-slate-600'
                          }`}
                        >
                          <div
                            className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 border ${
                              opt.isGroup
                                ? 'bg-[#E8F8EE] dark:bg-emerald-950 text-[#166534] dark:text-emerald-400 border-[#166534]/20 dark:border-emerald-800/60'
                                : 'bg-[#EBF5FF] dark:bg-blue-950 text-[#0071E3] dark:text-blue-400 border-[#0071E3]/20 dark:border-blue-800/60'
                            }`}
                          >
                            {opt.isGroup ? <Users className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold truncate">{opt.name}</div>
                            <div className="text-[10px] text-[#6E6E73] dark:text-slate-400 truncate">
                              {opt.subtitle}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {formGroupJid && (
                  <div className="text-[11px] text-[#166534] dark:text-emerald-300 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span className="break-all">
                      Selecionado: <strong>{formGroupName || formGroupJid}</strong>{' '}
                      <span className="text-[#6E6E73] dark:text-slate-500 font-mono">({formGroupJid})</span>
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-[#424245] dark:text-slate-300 mb-1">
                Nome da Regra
              </label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                required
                placeholder="Ex: Automação ND — NDs Aguero Inox"
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-950 border border-black/[0.14] dark:border-slate-700 text-xs text-[#1D1D1F] dark:text-white focus:outline-none focus:border-[#0071E3]"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-semibold text-[#424245] dark:text-slate-300 mb-1">
                  Próximo Nº PROJ
                </label>
                <input
                  type="number"
                  min={1}
                  value={formNextProj}
                  onChange={(e) => setFormNextProj(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-950 border border-black/[0.14] dark:border-slate-700 text-xs text-[#1D1D1F] dark:text-white tabular-nums focus:outline-none focus:border-[#0071E3]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#424245] dark:text-slate-300 mb-1">
                  Ano
                </label>
                <input
                  type="number"
                  value={formProjYear}
                  onChange={(e) => setFormProjYear(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-950 border border-black/[0.14] dark:border-slate-700 text-xs text-[#1D1D1F] dark:text-white tabular-nums focus:outline-none focus:border-[#0071E3]"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#424245] dark:text-slate-300 mb-1">
                Emissor
              </label>
              <input
                type="text"
                value={formEmitter}
                onChange={(e) => setFormEmitter(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-950 border border-black/[0.14] dark:border-slate-700 text-xs text-[#1D1D1F] dark:text-white focus:outline-none focus:border-[#0071E3]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-[#424245] dark:text-slate-300 mb-1">
                Designação Padrão
              </label>
              <input
                type="text"
                value={formDesignation}
                onChange={(e) => setFormDesignation(e.target.value)}
                placeholder="Não definido"
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-950 border border-black/[0.14] dark:border-slate-700 text-xs text-[#1D1D1F] dark:text-white focus:outline-none focus:border-[#0071E3]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#424245] dark:text-slate-300 mb-1">
                Empresa / CNPJ no PDF
              </label>
              <input
                type="text"
                value={formCompany}
                onChange={(e) => setFormCompany(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-950 border border-black/[0.14] dark:border-slate-700 text-xs text-[#1D1D1F] dark:text-white focus:outline-none focus:border-[#0071E3]"
              />
            </div>
          </div>

          {/* Toggles */}
          <div className="flex flex-wrap items-center gap-5 pt-1">
            <label className="flex items-center gap-2 text-xs text-[#1D1D1F] dark:text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={formSendPdfWa}
                onChange={(e) => setFormSendPdfWa(e.target.checked)}
                className="rounded border-black/20 dark:border-slate-600 text-[#0071E3]"
              />
              <span>Responder no chat WhatsApp com texto de confirmação + PDF anexado</span>
            </label>

            <label className="flex items-center gap-2 text-xs text-[#1D1D1F] dark:text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={formAutoEmail}
                onChange={(e) => setFormAutoEmail(e.target.checked)}
                className="rounded border-black/20 dark:border-slate-600 text-[#0071E3]"
              />
              <span>Enviar PDF automaticamente via Outlook logo após a produção da ND</span>
            </label>
          </div>

          {/* Outlook Email Routing Config */}
          <div className="p-3.5 rounded-xl bg-[#F5F5F7] dark:bg-slate-950/70 border border-black/[0.06] dark:border-slate-800 space-y-3">
            <div className="text-xs font-bold text-[#0071E3] dark:text-indigo-300 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 shrink-0" />
              <span>Configuração de Envio Outlook para esta Regra</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-[#424245] dark:text-slate-300 mb-1">
                  Para (Destinatários principais — separados por vírgula)
                </label>
                <input
                  type="text"
                  value={formOutlookTo}
                  onChange={(e) => setFormOutlookTo(e.target.value)}
                  placeholder="financeiro@agueroinox.com.br, diretoria@agueroinox.com.br"
                  className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-black/[0.14] dark:border-slate-700 text-xs text-[#1D1D1F] dark:text-white focus:outline-none focus:border-[#0071E3]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#424245] dark:text-slate-300 mb-1">
                  Cópia / CC (Opcional — separados por vírgula)
                </label>
                <input
                  type="text"
                  value={formOutlookCc}
                  onChange={(e) => setFormOutlookCc(e.target.value)}
                  placeholder="rh@agueroinox.com.br, controladoria@agueroinox.com.br"
                  className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-black/[0.14] dark:border-slate-700 text-xs text-[#1D1D1F] dark:text-white focus:outline-none focus:border-[#0071E3]"
                />
              </div>
            </div>

            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                <label className="text-[11px] font-semibold text-[#424245] dark:text-slate-300">
                  Assunto do E-mail
                </label>
                <div className="flex flex-wrap items-center gap-1">
                  {TEMPLATE_CHIPS.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setFormOutlookSubject((s) => `${s} ${chip}`.trim())}
                      className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white hover:bg-[#EBF5FF] dark:bg-slate-800 dark:hover:bg-slate-700 text-[#0071E3] dark:text-indigo-300 border border-black/[0.1] dark:border-slate-700 cursor-pointer transition"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>
              <input
                type="text"
                value={formOutlookSubject}
                onChange={(e) => setFormOutlookSubject(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-black/[0.14] dark:border-slate-700 text-xs text-[#1D1D1F] dark:text-white focus:outline-none focus:border-[#0071E3]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#424245] dark:text-slate-300 mb-1">
                Corpo do E-mail
              </label>
              <textarea
                rows={4}
                value={formOutlookBody}
                onChange={(e) => setFormOutlookBody(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-black/[0.14] dark:border-slate-700 text-xs text-[#1D1D1F] dark:text-white focus:outline-none focus:border-[#0071E3]"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowRuleForm(false)}
              className="px-3.5 py-2 rounded-lg bg-[#F2F2F7] hover:bg-[#E5E5EA] dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-medium text-[#1D1D1F] dark:text-slate-300 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={savingRule}
              className="px-4 py-2 rounded-lg bg-[#0071E3] hover:bg-[#0077ED] text-xs font-semibold text-white apple-solid-btn cursor-pointer disabled:opacity-50"
            >
              {savingRule ? 'Salvando...' : editingRuleId ? 'Salvar Alterações' : 'Criar Regra ND'}
            </button>
          </div>
        </form>
      )}

      {/* Rules + Simulator Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Active ND Rules */}
        <div className="rounded-2xl bg-white dark:bg-[#121826] border border-black/[0.08] dark:border-slate-800 p-4 sm:p-5 space-y-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-bold text-[#1D1D1F] dark:text-white flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-[#166534] dark:text-emerald-400 shrink-0" />
              <span>Grupos &amp; Contatos Monitorados para NDs ({rules.length})</span>
            </h4>
          </div>

          {rules.length === 0 ? (
            <div className="p-6 rounded-xl bg-[#F5F5F7] dark:bg-slate-950/60 border border-dashed border-black/[0.16] dark:border-slate-700 text-center space-y-2.5">
              <FileText className="w-7 h-7 text-[#86868B] dark:text-slate-500 mx-auto" />
              <p className="text-xs text-[#1D1D1F] dark:text-slate-300 font-semibold">
                Nenhum grupo ou contato de ND configurado ainda.
              </p>
              <p className="text-xs text-[#6E6E73] dark:text-slate-500 max-w-sm mx-auto leading-relaxed">
                Clique abaixo para escolher qualquer grupo ou contato do WhatsApp ({availableGroups.length} grupo(s) e {availableContacts.length} contato(s) disponíveis) e definir os e-mails do Outlook.
              </p>
              <button
                type="button"
                onClick={openNewRuleForm}
                className="mt-1 px-3.5 py-2 rounded-lg bg-[#0071E3] hover:bg-[#0077ED] text-xs font-semibold text-white apple-solid-btn cursor-pointer"
              >
                Configurar Primeiro Grupo ou Contato
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className={`p-3.5 rounded-xl border transition ${
                    rule.active
                      ? 'bg-[#F5F5F7] dark:bg-slate-950/70 border-black/[0.08] dark:border-slate-700/80'
                      : 'bg-[#F5F5F7]/60 dark:bg-slate-950/30 border-black/[0.06] dark:border-slate-800/60 opacity-65'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-[#1D1D1F] dark:text-white break-words">
                          {rule.name}
                        </span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-md font-semibold border whitespace-nowrap ${
                            rule.active
                              ? 'bg-[#E8F8EE] dark:bg-emerald-950 text-[#166534] dark:text-emerald-300 border-[#166534]/20 dark:border-emerald-800'
                              : 'bg-white dark:bg-slate-900 text-[#6E6E73] dark:text-slate-400 border-black/[0.1] dark:border-slate-700'
                          }`}
                        >
                          {rule.active ? 'Ativa' : 'Pausada'}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#6E6E73] dark:text-slate-400 mt-1 leading-relaxed">
                        Canal:{' '}
                        <strong className="text-[#1D1D1F] dark:text-slate-200">{rule.groupName}</strong> · Próximo Nº PROJ:{' '}
                        <strong className="text-[#C41C28] dark:text-red-400 tabular-nums">
                          {rule.nextProjNumber}/{rule.projYear || new Date().getFullYear()}
                        </strong>{' '}
                        · Geradas:{' '}
                        <strong className="text-[#1D1D1F] dark:text-slate-200 tabular-nums">
                          {rule.generatedCount || 0}
                        </strong>
                      </p>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleToggleRule(rule)}
                        title={rule.active ? 'Pausar automação' : 'Ativar automação'}
                        className="p-1.5 rounded-lg bg-white hover:bg-[#E8E8ED] dark:bg-slate-900 dark:hover:bg-slate-800 border border-black/[0.1] dark:border-slate-700 text-[#424245] dark:text-slate-300 cursor-pointer transition"
                      >
                        <Power className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditRuleForm(rule)}
                        title="Editar regra e e-mails Outlook"
                        className="p-1.5 rounded-lg bg-white hover:bg-[#EBF5FF] dark:bg-slate-900 dark:hover:bg-slate-800 border border-black/[0.1] dark:border-slate-700 text-[#0071E3] dark:text-indigo-300 cursor-pointer transition"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteRule(rule)}
                        title="Excluir regra"
                        className="p-1.5 rounded-lg bg-white hover:bg-[#FFECEF] dark:bg-slate-900 dark:hover:bg-red-950 border border-black/[0.1] dark:border-slate-700 text-[#C41C28] dark:text-red-400 cursor-pointer transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-2.5 pt-2.5 border-t border-black/[0.06] dark:border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] text-[#6E6E73] dark:text-slate-400">
                    <div>
                      <span>WhatsApp PDF:</span>{' '}
                      <strong className="text-[#1D1D1F] dark:text-slate-200 font-medium">
                        {rule.sendPdfToWhatsAppGroup ? 'Texto + PDF no chat' : 'Desativado'}
                      </strong>
                    </div>
                    <div>
                      <span>Outlook Auto:</span>{' '}
                      <strong className="text-[#1D1D1F] dark:text-slate-200 font-medium">
                        {rule.autoEmailEnabled
                          ? rule.outlookTo.length > 0
                            ? `${rule.outlookTo.length} destino(s)${rule.outlookCc.length > 0 ? ` + ${rule.outlookCc.length} CC` : ''}`
                            : 'Ativo (adicione destinatários)'
                          : 'Desativado'}
                      </strong>
                    </div>
                    {rule.outlookTo.length > 0 && (
                      <div className="sm:col-span-2 break-all">
                        <span>Para:</span>{' '}
                        <span className="text-[#0071E3] dark:text-indigo-300 font-medium">
                          {rule.outlookTo.join(', ')}
                        </span>
                        {rule.outlookCc.length > 0 && (
                          <>
                            {' · '}
                            <span>CC:</span>{' '}
                            <span className="text-[#424245] dark:text-slate-300">
                              {rule.outlookCc.join(', ')}
                            </span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Live Message Parser & PDF Generator Tester (ALWAYS enabled!) */}
        <div className="rounded-2xl bg-white dark:bg-[#121826] border border-black/[0.08] dark:border-slate-800 p-4 sm:p-5 space-y-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-bold text-[#1D1D1F] dark:text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#9A4400] dark:text-amber-400 shrink-0" />
              <span>Testador / Gerador Rápido de ND (IA + PDF)</span>
            </h4>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSimMessage(SAMPLE_LUCAS_MESSAGE)}
                className="text-[11px] font-medium px-2.5 py-1 rounded-lg bg-[#F5F5F7] hover:bg-[#E8E8ED] dark:bg-slate-900 dark:hover:bg-slate-800 border border-black/[0.08] dark:border-slate-700 text-[#424245] dark:text-slate-300 cursor-pointer whitespace-nowrap transition"
              >
                Exemplo Lucas Soares
              </button>
              <button
                type="button"
                onClick={() => setSimMessage(SAMPLE_PIX_MESSAGE)}
                className="text-[11px] font-medium px-2.5 py-1 rounded-lg bg-[#F5F5F7] hover:bg-[#E8E8ED] dark:bg-slate-900 dark:hover:bg-slate-800 border border-black/[0.08] dark:border-slate-700 text-[#424245] dark:text-slate-300 cursor-pointer whitespace-nowrap transition"
              >
                Exemplo com PIX/CPF
              </button>
            </div>
          </div>

          {rules.length > 0 ? (
            <div>
              <label className="block text-[11px] font-medium text-[#6E6E73] dark:text-slate-400 mb-1">
                Regra / Canal base
              </label>
              <select
                value={simRuleId || rules[0]?.id || ''}
                onChange={(e) => setSimRuleId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-950 border border-black/[0.14] dark:border-slate-700 text-xs text-[#1D1D1F] dark:text-white focus:outline-none focus:border-[#0071E3]"
              >
                {rules.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} (Próximo Nº PROJ {r.nextProjNumber}/{r.projYear || new Date().getFullYear()})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="text-xs text-[#8A3D00] dark:text-amber-300 bg-[#FFF4E5] dark:bg-amber-950/30 border border-[#9A4400]/20 dark:border-amber-800/40 rounded-xl px-3 py-2 leading-relaxed">
              Modo de teste livre ativo: você já pode gerar e baixar o PDF agora mesmo (padrão Aguero Inox Nº PROJ 4925+), mesmo antes de vincular um grupo ou contato.
            </div>
          )}

          <div>
            <label className="block text-[11px] font-medium text-[#6E6E73] dark:text-slate-400 mb-1">
              Cole uma mensagem de solicitação de ND (campos em qualquer ordem)
            </label>
            <textarea
              rows={5}
              value={simMessage}
              onChange={(e) => setSimMessage(e.target.value)}
              placeholder="Cole aqui a mensagem recebida no WhatsApp..."
              className="w-full px-3 py-2.5 rounded-xl bg-white dark:bg-slate-950 border border-black/[0.14] dark:border-slate-700 text-xs text-[#1D1D1F] dark:text-white font-mono focus:outline-none focus:border-[#0071E3]"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-4 text-xs text-[#424245] dark:text-slate-300">
              <label
                className={`flex items-center gap-1.5 ${
                  rules.length === 0 ? 'opacity-45 cursor-not-allowed' : 'cursor-pointer'
                }`}
              >
                <input
                  type="checkbox"
                  disabled={rules.length === 0}
                  checked={rules.length > 0 && simDispatchWa}
                  onChange={(e) => setSimDispatchWa(e.target.checked)}
                />
                <span>Enviar PDF no WhatsApp</span>
              </label>
              <label
                className={`flex items-center gap-1.5 ${
                  rules.length === 0 ? 'opacity-45 cursor-not-allowed' : 'cursor-pointer'
                }`}
              >
                <input
                  type="checkbox"
                  disabled={rules.length === 0}
                  checked={rules.length > 0 && simDispatchEmail}
                  onChange={(e) => setSimDispatchEmail(e.target.checked)}
                />
                <span>Disparar E-mail Outlook</span>
              </label>
            </div>

            <button
              type="button"
              onClick={handleSimulateNd}
              disabled={simRunning || !simMessage.trim()}
              className="px-4 py-2 rounded-lg bg-[#1E7E34] hover:bg-[#19692C] text-xs font-semibold text-white apple-solid-btn flex items-center gap-1.5 cursor-pointer disabled:opacity-40 whitespace-nowrap shrink-0 shadow-sm transition"
            >
              <Play className={`w-3.5 h-3.5 shrink-0 ${simRunning ? 'animate-pulse' : ''}`} />
              <span>{simRunning ? 'Extraindo & Gerando PDF...' : 'Extrair com IA & Gerar PDF'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Generated NDs History Table */}
      <div className="rounded-2xl bg-white dark:bg-[#121826] border border-black/[0.08] dark:border-slate-800 overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <div className="p-4 sm:p-5 border-b border-black/[0.06] dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h4 className="text-xs font-bold text-[#1D1D1F] dark:text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#0071E3] dark:text-indigo-400 shrink-0" />
              <span>Histórico de Notas de Débito Geradas ({filteredRecords.length})</span>
            </h4>
            <p className="text-xs text-[#6E6E73] dark:text-slate-400 mt-0.5">
              Total listado:{' '}
              <strong className="text-[#166534] dark:text-emerald-400 tabular-nums">
                {formatBrl(totalAmount)}
              </strong>{' '}
              · Protegido contra exclusão acidental no Firestore + Backup local.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#86868B] dark:text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar PROJ, recebedor, obra..."
                className="pl-8 pr-3 py-1.5 rounded-lg bg-white dark:bg-slate-950 border border-black/[0.14] dark:border-slate-700 text-xs text-[#1D1D1F] dark:text-white placeholder:text-[#86868B] dark:placeholder:text-slate-500 w-56 focus:outline-none focus:border-[#0071E3]"
              />
            </div>

            <button
              type="button"
              onClick={() =>
                downloadApi('/api/whatsapp/nd/records/export-xlsx', 'notas-de-debito.xlsx').catch(() =>
                  alert('Não foi possível exportar a planilha.')
                )
              }
              className="px-3 py-1.5 rounded-lg bg-[#E8F8EE] hover:bg-[#D7F2E2] dark:bg-emerald-950/70 dark:hover:bg-emerald-900/70 border border-[#166534]/25 dark:border-emerald-700/60 text-xs font-semibold text-[#166534] dark:text-emerald-300 flex items-center gap-1.5 whitespace-nowrap shrink-0 transition cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
              <span>Exportar Excel (.xlsx)</span>
            </button>
          </div>
        </div>

        {filteredRecords.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#6E6E73] dark:text-slate-500">
            Nenhuma Nota de Débito gerada ainda. Clique em <strong>Extrair com IA &amp; Gerar PDF</strong> no Testador acima ou envie uma solicitação no canal configurado.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#F5F5F7] dark:bg-slate-950/80 text-[10px] uppercase tracking-wider text-[#6E6E73] dark:text-slate-400 border-b border-black/[0.08] dark:border-slate-800">
                  <th className="py-2.5 px-3.5 font-semibold">Nº PROJ</th>
                  <th className="py-2.5 px-3.5 font-semibold">Natureza</th>
                  <th className="py-2.5 px-3.5 font-semibold">Recebedor</th>
                  <th className="py-2.5 px-3.5 font-semibold">Centro de Custos</th>
                  <th className="py-2.5 px-3.5 text-right font-semibold">Valor</th>
                  <th className="py-2.5 px-3.5 font-semibold">Pagto</th>
                  <th className="py-2.5 px-3.5 font-semibold">WhatsApp</th>
                  <th className="py-2.5 px-3.5 font-semibold">Outlook</th>
                  <th className="py-2.5 px-3.5 text-right font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.06] dark:divide-slate-800/70">
                {filteredRecords.map((rec) => {
                  const pdfUrl = `/api/whatsapp/nd/records/${encodeURIComponent(rec.id)}/pdf`;
                  const isBusy = busyRecordId === rec.id;
                  return (
                    <tr
                      key={rec.id}
                      className="hover:bg-[#F9F9FB] dark:hover:bg-slate-900/50 transition"
                    >
                      <td className="py-3 px-3.5 font-bold text-[#C41C28] dark:text-red-400 whitespace-nowrap tabular-nums">
                        <div className="flex items-center gap-1.5">
                          <span>
                            {rec.projNumber}/{rec.projYear}
                          </span>
                          {(rec.isRevised || (rec.revisionNumber || 0) > 0) && (
                            <span
                              title={
                                rec.revisedAt
                                  ? `Revisada em ${new Date(rec.revisedAt).toLocaleString('pt-BR')}${rec.revisedBy ? ` por ${rec.revisedBy}` : ''}`
                                  : 'Nota de Débito revisada'
                              }
                              className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-[#FFECEF] dark:bg-red-950/80 border border-[#C41C28]/30 dark:border-red-700 text-[#C41C28] dark:text-red-300"
                            >
                              {(rec.revisionNumber || 1) > 1 ? `REV. ${rec.revisionNumber}` : 'REVISADA'}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] font-normal text-[#86868B] dark:text-slate-500">
                          {rec.emissionDateTime}
                        </div>
                      </td>
                      <td className="py-3 px-3.5 text-[#1D1D1F] dark:text-slate-200 font-medium">
                        {rec.natureza}
                      </td>
                      <td className="py-3 px-3.5 text-[#1D1D1F] dark:text-white">
                        <div className="font-medium">{rec.receiverName}</div>
                        {(rec.pixKey !== 'OK' || rec.cpfCnpj !== 'OK') && (
                          <div className="text-[10px] text-[#0071E3] dark:text-indigo-300">
                            {rec.cpfCnpj !== 'OK' ? `CPF/CNPJ: ${rec.cpfCnpj}` : ''}
                            {rec.cpfCnpj !== 'OK' && rec.pixKey !== 'OK' ? ' · ' : ''}
                            {rec.pixKey !== 'OK' ? `Pix: ${rec.pixKey}` : ''}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3.5 text-[#424245] dark:text-slate-300">
                        {rec.costCenter}
                      </td>
                      <td className="py-3 px-3.5 text-right font-bold text-[#C41C28] dark:text-red-400 whitespace-nowrap tabular-nums">
                        {formatBrl(rec.amount)}
                      </td>
                      <td className="py-3 px-3.5 text-[#424245] dark:text-slate-300 whitespace-nowrap tabular-nums">
                        {rec.paymentDate}
                      </td>
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${
                            rec.whatsappSent
                              ? 'bg-[#E8F8EE] dark:bg-emerald-950/70 border-[#166534]/25 dark:border-emerald-700 text-[#166534] dark:text-emerald-300'
                              : 'bg-[#F5F5F7] dark:bg-slate-900 border-black/[0.08] dark:border-slate-700 text-[#6E6E73] dark:text-slate-400'
                          }`}
                        >
                          {rec.whatsappSent ? 'Enviado' : 'Local'}
                        </span>
                      </td>
                      <td className="py-3 px-3.5 whitespace-nowrap" title={rec.emailError || ''}>
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${
                            rec.emailStatus === 'enviado'
                              ? 'bg-[#E8F8EE] dark:bg-emerald-950/70 border-[#166534]/25 dark:border-emerald-700 text-[#166534] dark:text-emerald-300'
                              : rec.emailStatus === 'erro'
                              ? 'bg-[#FFECEF] dark:bg-red-950/70 border-[#C41C28]/25 dark:border-red-800 text-[#C41C28] dark:text-red-300'
                              : rec.emailStatus === 'pendente_config'
                              ? 'bg-[#FFF4E5] dark:bg-amber-950/70 border-[#9A4400]/25 dark:border-amber-700 text-[#9A4400] dark:text-amber-300'
                              : 'bg-[#F5F5F7] dark:bg-slate-900 border-black/[0.08] dark:border-slate-700 text-[#6E6E73] dark:text-slate-400'
                          }`}
                        >
                          {rec.emailStatus === 'enviado'
                            ? 'Enviado'
                            : rec.emailStatus === 'pendente_config'
                            ? 'Pendente Outlook'
                            : rec.emailStatus === 'erro'
                            ? 'Erro'
                            : 'Desativado'}
                        </span>
                      </td>
                      <td className="py-3 px-3.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setPreviewRecord(rec)}
                            title="Visualizar PDF"
                            className="p-1.5 rounded-lg bg-white hover:bg-[#EBF5FF] dark:bg-slate-900 dark:hover:bg-indigo-900/60 border border-black/[0.1] dark:border-slate-700 text-[#0071E3] dark:text-indigo-300 cursor-pointer transition"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              downloadApi(pdfUrl, rec.fileName).catch(() => alert('Não foi possível baixar o PDF.'))
                            }
                            title="Baixar PDF"
                            className="p-1.5 rounded-lg bg-white hover:bg-[#F2F2F7] dark:bg-slate-900 dark:hover:bg-slate-800 border border-black/[0.1] dark:border-slate-700 text-[#424245] dark:text-slate-300 transition cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={isBusy || !rec.sourceGroupJid}
                            onClick={() => handleResendWhatsApp(rec)}
                            title="Enviar/Reenviar PDF no WhatsApp"
                            className="p-1.5 rounded-lg bg-white hover:bg-[#E8F8EE] dark:bg-slate-900 dark:hover:bg-emerald-900/60 border border-black/[0.1] dark:border-slate-700 text-[#166534] dark:text-emerald-400 cursor-pointer disabled:opacity-40 transition"
                          >
                            <Send className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleResendEmail(rec)}
                            title="Enviar/Reenviar PDF via Outlook"
                            className="p-1.5 rounded-lg bg-white hover:bg-[#FFF4E5] dark:bg-slate-900 dark:hover:bg-amber-900/60 border border-black/[0.1] dark:border-slate-700 text-[#9A4400] dark:text-amber-300 cursor-pointer disabled:opacity-40 transition"
                          >
                            <Mail className="w-3.5 h-3.5" />
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

      {/* Inline PDF Preview Modal with Blob URL + Extracted Summary */}
      {previewRecord && (
        <div className="fixed inset-0 z-50 bg-black/45 dark:bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#121826] border border-black/[0.1] dark:border-slate-700 rounded-2xl w-full max-w-4xl h-[88vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="px-4 py-3 border-b border-black/[0.08] dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <h4 className="text-xs font-bold text-[#1D1D1F] dark:text-white flex flex-wrap items-center gap-1.5">
                  <span>
                    ND Nº PROJ {previewRecord.projNumber}/{previewRecord.projYear}
                  </span>
                  {(previewRecord.isRevised || (previewRecord.revisionNumber || 0) > 0) && (
                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-[#FFECEF] dark:bg-red-950/80 border border-[#C41C28]/30 dark:border-red-700 text-[#C41C28] dark:text-red-300">
                      {(previewRecord.revisionNumber || 1) > 1
                        ? `REVISADA (REV. ${previewRecord.revisionNumber})`
                        : 'REVISADA'}
                    </span>
                  )}
                  <span>
                    — {previewRecord.natureza} ({previewRecord.receiverName})
                  </span>
                </h4>
                <p className="text-[11px] text-[#6E6E73] dark:text-slate-400 truncate">
                  {previewRecord.fileName}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {previewBlobUrl && (
                  <a
                    href={previewBlobUrl}
                    download={previewRecord.fileName}
                    className="px-3 py-1.5 rounded-lg bg-[#0071E3] hover:bg-[#0077ED] text-xs font-semibold text-white apple-solid-btn flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5 shrink-0" />
                    <span>Baixar PDF</span>
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setPreviewRecord(null)}
                  className="p-1.5 rounded-lg bg-[#F2F2F7] hover:bg-[#E5E5EA] dark:bg-slate-800 dark:hover:bg-slate-700 text-[#424245] dark:text-slate-300 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Extracted Summary Strip */}
            <div className="px-4 py-2.5 bg-[#F5F5F7] dark:bg-slate-950/90 border-b border-black/[0.08] dark:border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
              <div>
                <span className="text-[#6E6E73] dark:text-slate-500">Valor:</span>{' '}
                <strong className="text-[#C41C28] dark:text-red-400 tabular-nums">
                  {formatBrl(previewRecord.amount)}
                </strong>
              </div>
              <div>
                <span className="text-[#6E6E73] dark:text-slate-500">Pagto:</span>{' '}
                <strong className="text-[#1D1D1F] dark:text-slate-200 tabular-nums">
                  {previewRecord.paymentDate}
                </strong>
              </div>
              <div>
                <span className="text-[#6E6E73] dark:text-slate-500">Centro de Custos:</span>{' '}
                <strong className="text-[#1D1D1F] dark:text-slate-200">
                  {previewRecord.costCenter}
                </strong>
              </div>
              <div>
                <span className="text-[#6E6E73] dark:text-slate-500">Pix / CPF:</span>{' '}
                <strong className="text-[#1D1D1F] dark:text-slate-200">
                  {previewRecord.pixKey} / {previewRecord.cpfCnpj}
                </strong>
              </div>
              {previewRecord.notes && (
                <div className="col-span-2 sm:col-span-4 text-[#424245] dark:text-slate-300">
                  <span className="text-[#6E6E73] dark:text-slate-500">Observação:</span>{' '}
                  {previewRecord.notes}
                </div>
              )}
            </div>

            <div className="flex-1 bg-[#E5E5EA] dark:bg-slate-900 relative flex items-center justify-center">
              {loadingPreviewPdf ? (
                <div className="text-xs text-[#424245] dark:text-slate-300 flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-[#0071E3] dark:text-indigo-400" />
                  <span>Renderizando PDF oficial da Nota de Débito...</span>
                </div>
              ) : previewBlobUrl ? (
                <iframe
                  title={previewRecord.fileName}
                  src={previewBlobUrl}
                  className="w-full h-full bg-white"
                />
              ) : (
                <div className="p-6 text-center space-y-2">
                  <p className="text-xs text-[#424245] dark:text-slate-300">
                    Clique em <strong>Baixar PDF</strong> acima para abrir o documento gerado.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
