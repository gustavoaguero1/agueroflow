import React, { useState, useRef, useEffect } from 'react';
import { User } from 'firebase/auth';
import {
  WorkOrder,
  OrderChecklistItem,
  OrderExecutionEvidence,
  Item,
} from '../../types';
import {
  doc,
  updateDoc,
  addDoc,
  collection,
  runTransaction,
} from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../firebase';
import { apiFetch } from '../../apiAuthFetch';
import { compressImage } from '../../lib/compressImage';
import {
  ShieldAlert,
  ShieldCheck,
  MapPin,
  Camera,
  PenTool,
  CheckCircle2,
  Clock,
  Printer,
  AlertTriangle,
  Upload,
  Trash2,
  Navigation,
  Sparkles,
  Lock,
  Unlock,
  Check,
  RefreshCw,
} from 'lucide-react';

interface OrderExecutionHubTabProps {
  order: WorkOrder;
  organizationId: string;
  currentUser: User;
  onOrderUpdated: (updated: Partial<WorkOrder>) => void;
  onOpenReportModal: () => void;
  canApprove?: boolean;
}

const DEFAULT_MANDATORY_TASKS: OrderChecklistItem[] = [
  { id: 'chk_1', task: '1. Qual ordem será atendida (Validação de escopo no local)', isMandatory: true, status: 'pendente' },
  { id: 'chk_2', task: '2. Imagem inicial (antes) — foto obrigatória da área/equipamento', isMandatory: true, status: 'pendente' },
  { id: 'chk_3', task: '3. Imagem após reparo (depois) — foto obrigatória pós-conclusão', isMandatory: true, status: 'pendente' },
  { id: 'chk_4', task: '4. A ordem foi atendida completamente e sem pendências?', isMandatory: true, status: 'pendente' },
  { id: 'chk_5', task: '5. Assinatura digital do técnico executor', isMandatory: true, status: 'pendente' },
  { id: 'chk_6', task: '6. Assinatura digital do responsável da planta/cliente', isMandatory: true, status: 'pendente' },
];

export const OrderExecutionHubTab: React.FC<OrderExecutionHubTabProps> = ({
  order,
  organizationId,
  currentUser,
  onOrderUpdated,
  onOpenReportModal,
  canApprove = true,
}) => {
  // Checklist State
  const [checklist, setChecklist] = useState<OrderChecklistItem[]>(
    order.executionChecklist && order.executionChecklist.length > 0
      ? order.executionChecklist
      : DEFAULT_MANDATORY_TASKS
  );

  // GPS State
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Evidences State
  const [beforePhotos, setBeforePhotos] = useState<string[]>(
    order.evidencePhotos?.before || []
  );
  const [afterPhotos, setAfterPhotos] = useState<string[]>(
    order.evidencePhotos?.after || []
  );

  // Signatures
  const [techName, setTechName] = useState(order.technicianSignedBy || order.assignedTo || '');
  const [clientName, setClientName] = useState(order.clientSignedBy || order.requesterName || '');

  // Canvas refs
  const techCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const clientCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawingTech, setIsDrawingTech] = useState(false);
  const [isDrawingClient, setIsDrawingClient] = useState(false);

  // Blocking reservation calculation
  const hasBlockedPart =
    (order.plannedParts || []).some(
      (p) => p.status === 'solicitado' || p.status === 'aguardando_compra'
    ) || order.status === 'em_aprovacao' || order.isBlockedByReservation;

  const completedTasksCount = checklist.filter((c) => c.status === 'concluido').length;
  const totalTasksCount = checklist.length;

  // Handle GPS Capture
  const handleCaptureGps = () => {
    setGpsLoading(true);
    setGpsError(null);

    if (!navigator.geolocation) {
      setGpsError('Geolocalização não é suportada pelo seu navegador.');
      setGpsLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const coords = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          capturedAt: new Date().toISOString(),
          capturedBy: currentUser.displayName || currentUser.email || 'Usuário',
        };

        try {
          const now = new Date().toISOString();
          const orderRef = doc(db, 'work_orders', order.id);
          const eventRef = doc(collection(db, 'order_events'));
          await runTransaction(db, async (tx) => {
            const current = await tx.get(orderRef);
            if (!current.exists() || current.data().orgId !== organizationId) {
              throw new Error('A OS não pertence à empresa selecionada ou não está mais disponível.');
            }
            tx.update(orderRef, {
              executionGps: coords,
              updatedAt: now,
            });
            tx.set(eventRef, {
              orgId: organizationId,
              orderId: order.id,
              userId: currentUser.uid,
              userName: currentUser.displayName || currentUser.email || 'Técnico',
              eventType: 'gps',
              description: `Validação de GPS de campo capturada: Lat ${coords.latitude.toFixed(4)}, Long ${coords.longitude.toFixed(4)} (Precisão: ±${coords.accuracy.toFixed(0)}m)`,
              timestamp: now,
            });
          });

          onOrderUpdated({ executionGps: coords });
        } catch (err) {
          console.error('Erro ao salvar GPS:', err);
        } finally {
          setGpsLoading(false);
        }
      },
      (err) => {
        console.error('GPS error:', err);
        // Never invent coordinates: record no location and tell the user.
        setGpsError('Localização não autorizada');
        // A falha de geolocalização não apaga a última posição real registrada na OS.
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  // Toggle checklist item
  const handleToggleChecklist = async (id: string) => {
    const updated = checklist.map((item) => {
      if (item.id === id) {
        const nextStatus = item.status === 'concluido' ? 'pendente' : 'concluido';
        return {
          ...item,
          status: nextStatus as any,
          completedAt: nextStatus === 'concluido' ? new Date().toISOString() : undefined,
          completedBy: nextStatus === 'concluido' ? (currentUser.displayName || currentUser.email || 'Usuário') : undefined,
        };
      }
      return item;
    });

    setChecklist(updated);

    try {
      await updateDoc(doc(db, 'work_orders', order.id), {
        executionChecklist: updated,
        updatedAt: new Date().toISOString(),
      });
      onOrderUpdated({ executionChecklist: updated });
    } catch (err) {
      console.error('Erro ao atualizar checklist:', err);
    }
  };

  // Real photo upload: compress, send to Storage, keep URL in evidencePhotos + metadata.
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<'before' | 'after' | null>(null);
  const handlePhotoFile = async (type: 'before' | 'after', file: File | undefined) => {
    if (!file) return;
    setUploading(type);
    setPhotoError(null);
    try {
      const kind = type === 'before' ? ('antes' as const) : ('depois' as const);
      const takenAt = new Date().toISOString();
      const blob = await compressImage(file);
      const path = `work-orders/${organizationId}/${order.id}/${kind}_${Date.now()}.jpg`;
      const r = storageRef(storage, path);
      await uploadBytes(r, blob, { contentType: 'image/jpeg' });
      const url = await getDownloadURL(r);
      const nextBefore = type === 'before' ? [...beforePhotos, url] : beforePhotos;
      const nextAfter = type === 'after' ? [...afterPhotos, url] : afterPhotos;
      const meta = [
        ...(order.evidencePhotoMeta || []),
        { kind, path, url, takenAt, lat: order.executionGps?.latitude ?? null, lng: order.executionGps?.longitude ?? null },
      ];
      await updateDoc(doc(db, 'work_orders', order.id), {
        evidencePhotos: { before: nextBefore, after: nextAfter },
        evidencePhotoMeta: meta,
        updatedAt: new Date().toISOString(),
      });
      setBeforePhotos(nextBefore);
      setAfterPhotos(nextAfter);
      onOrderUpdated({ evidencePhotos: { before: nextBefore, after: nextAfter }, evidencePhotoMeta: meta });
      handleToggleChecklist(type === 'before' ? 'chk_2' : 'chk_3');
    } catch (err) {
      console.error('Erro ao enviar foto:', err);
      setPhotoError('Não foi possível enviar a foto. Verifique a conexão e tente novamente.');
    } finally {
      setUploading(null);
    }
  };

  // Canvas drawing handlers
  const startDrawing = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>,
    target: 'tech' | 'client'
  ) => {
    const canvas = target === 'tech' ? techCanvasRef.current : clientCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (target === 'tech') setIsDrawingTech(true);
    else setIsDrawingClient(true);

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#38bdf8'; // light blue
  };

  const draw = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>,
    target: 'tech' | 'client'
  ) => {
    const isDrawing = target === 'tech' ? isDrawingTech : isDrawingClient;
    if (!isDrawing) return;
    const canvas = target === 'tech' ? techCanvasRef.current : clientCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.stroke();
  };

  const stopDrawing = (target: 'tech' | 'client') => {
    if (target === 'tech') setIsDrawingTech(false);
    else setIsDrawingClient(false);
  };

  const clearCanvas = (target: 'tech' | 'client') => {
    const canvas = target === 'tech' ? techCanvasRef.current : clientCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const saveSignature = async (target: 'tech' | 'client') => {
    const canvas = target === 'tech' ? techCanvasRef.current : clientCanvasRef.current;
    if (!canvas) return;
    const signerName = (target === 'tech' ? techName : clientName).trim();
    if (!signerName) {
      alert('Informe o nome de quem está assinando antes de salvar.');
      return;
    }

    try {
      const signatureBlob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, 'image/png');
      });
      if (!signatureBlob || signatureBlob.size === 0 || signatureBlob.size > 10 * 1024 * 1024) {
        throw new Error('Não foi possível gerar uma assinatura válida ou o arquivo excede 10 MB.');
      }

      const now = new Date().toISOString();
      const path = `work-orders/${organizationId}/${order.id}/signature_${target}_${currentUser.uid}_${Date.now()}.png`;
      const fileRef = storageRef(storage, path);
      await uploadBytes(fileRef, signatureBlob, {
        contentType: 'image/png',
        customMetadata: {
          orgId: organizationId,
          orderId: order.id,
          signerUid: currentUser.uid,
          signerType: target,
        },
      });
      const url = await getDownloadURL(fileRef);

      const orderRef = doc(db, 'work_orders', order.id);
      const eventRef = doc(collection(db, 'order_events'));
      const taskId = target === 'tech' ? 'chk_5' : 'chk_6';
      const updatedChecklist = checklist.map((item) => item.id === taskId
        ? {
          ...item,
          status: 'concluido' as const,
          completedAt: now,
          completedBy: currentUser.displayName || currentUser.email || 'Usuário',
        }
        : item);
      const signatureFields = target === 'tech'
        ? {
          technicianSignatureUrl: url,
          technicianSignaturePath: path,
          technicianSignedBy: signerName,
          technicianSignedAt: now,
        }
        : {
          clientSignatureUrl: url,
          clientSignaturePath: path,
          clientSignedBy: signerName,
          clientSignedAt: now,
        };

      await runTransaction(db, async (tx) => {
        const current = await tx.get(orderRef);
        if (!current.exists() || current.data().orgId !== organizationId) {
          throw new Error('A OS não pertence à empresa selecionada ou não está mais disponível.');
        }
        tx.update(orderRef, {
          ...signatureFields,
          executionChecklist: updatedChecklist,
          updatedAt: now,
        });
        tx.set(eventRef, {
          orgId: organizationId,
          orderId: order.id,
          userId: currentUser.uid,
          userName: currentUser.displayName || currentUser.email || signerName,
          eventType: 'assinatura',
          description: `Assinatura ${target === 'tech' ? 'do técnico executor' : 'do responsável do cliente'} registrada em arquivo privado do Storage.`,
          timestamp: now,
          meta: { signerName, signerType: target, storagePath: path },
        });
      });

      setChecklist(updatedChecklist);
      onOrderUpdated({
        ...signatureFields,
        executionChecklist: updatedChecklist,
      });
    } catch (err) {
      console.error('Erro ao salvar assinatura:', err);
      alert(err instanceof Error ? err.message : 'Não foi possível salvar a assinatura.');
    }
  };

  // Manager Action: Approve reservation & unblock execution
  const handleApproveReservationAndUnblock = async () => {
    if (!canApprove) {
      alert('Seu perfil não possui alçada para aprovar a reserva desta OS.');
      return;
    }
    try {
      setGpsError(null);
      const idempotencyKey = `reservation_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      const response = await apiFetch(`/api/work-orders/${encodeURIComponent(order.id)}/reservation-approval`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId: organizationId,
          expectedStatus: order.status,
          idempotencyKey,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok !== true || !payload.orderUpdates) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'O servidor recusou a aprovação da reserva.');
      }

      onOrderUpdated(payload.orderUpdates);
      if (payload.replayed !== true) {
        // The backend commits status, event, message and idempotency in a single transaction.
        // No local confirmation is shown until the server confirms the operation.
      }
    } catch (err) {
      console.error('Erro ao aprovar reserva:', err);
      alert(err instanceof Error ? err.message : 'Não foi possível aprovar a reserva da OS.');
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Alerta de Bloqueio de Reserva & Liberação pelo Gestor */}
      {hasBlockedPart ? (
        <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
          <div className="flex items-start space-x-3">
            <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400 shrink-0">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-amber-300 text-sm flex items-center space-x-2">
                <span>Execução Bloqueada por Reserva Pendente</span>
                <span className="px-2 py-0.2 rounded-full text-[10px] bg-amber-500 text-black font-extrabold uppercase">
                  Regra Operacional
                </span>
              </h4>
              <p className="text-xs text-amber-200/80 mt-0.5">
                Há reserva de peças aguardando aprovação do Gestor. O início da execução física requer liberação prévia.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <button
              onClick={handleApproveReservationAndUnblock}
              className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs shadow-md transition-all cursor-pointer"
              title="Aprovar reserva de peças e liberar início da execução imediatamente"
            >
              <Unlock className="w-4 h-4" />
              <span>Aprovar Reserva & Desbloquear</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-800/60 flex items-center justify-between text-xs text-emerald-300">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              <strong>Execução Liberada:</strong> Nenhuma reserva bloqueante pendente. Todos os materiais estão disponíveis para uso da equipe técnica.
            </span>
          </div>
          <button
            onClick={onOpenReportModal}
            className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-semibold cursor-pointer transition-colors"
          >
            <Printer className="w-3.5 h-3.5 text-blue-400" />
            <span>Visualizar Relatório de OS</span>
          </button>
        </div>
      )}

      {/* 2. Painel de GPS & Validação de Presença Física */}
      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Navigation className="w-4 h-4 text-blue-400" />
            <h4 className="font-bold text-white text-xs uppercase tracking-wide">
              2. Validação Obrigatória de GPS de Campo
            </h4>
          </div>

          <button
            onClick={handleCaptureGps}
            disabled={gpsLoading}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${gpsLoading ? 'animate-spin' : ''}`} />
            <span>{gpsLoading ? 'Obtendo Coordenadas...' : 'Capturar GPS do Navegador'}</span>
          </button>
        </div>

        {gpsError && <p className="text-xs text-red-400 font-semibold">{gpsError}</p>}
        {order.executionGps ? (
          <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <div className="flex items-center space-x-2 text-slate-300">
              <MapPin className="w-4 h-4 text-emerald-400 shrink-0" />
              <div>
                <span className="font-mono text-emerald-400 font-bold">
                  Lat: {order.executionGps.latitude.toFixed(6)}, Long: {order.executionGps.longitude.toFixed(6)}
                </span>
                <span className="text-slate-500 block text-[11px]">
                  Precisão: ±{order.executionGps.accuracy?.toFixed(0) || 5} metros • Registrado por {order.executionGps.capturedBy || 'Técnico'}
                </span>
              </div>
            </div>

            <a
              href={`https://www.google.com/maps?q=${order.executionGps.latitude},${order.executionGps.longitude}`}
              target="_blank"
              rel="noreferrer"
              className="text-blue-400 hover:underline text-[11px] font-semibold"
            >
              Abrir no Google Maps →
            </a>
          </div>
        ) : (
          <div className="p-3 rounded-lg bg-slate-950 border border-dashed border-slate-800 text-slate-500 text-xs flex items-center justify-between">
            <span>Coordenadas de presença ainda não capturadas. O técnico deve permitir o GPS para iniciar a execução física.</span>
            <span className="text-amber-400 font-semibold text-[11px]">Pendente</span>
          </div>
        )}
      </div>

      {/* 3. Checklist Obrigatório de Campo (6 Tarefas da OS) */}
      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <h4 className="font-bold text-white text-xs uppercase tracking-wide">
              3. Checklist Obrigatório de Execução
            </h4>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-xs text-slate-400">
              Progresso: <strong className="text-white">{completedTasksCount} de {totalTasksCount}</strong> concluídas
            </span>
            <div className="w-24 bg-slate-800 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-emerald-500 h-1.5 rounded-full transition-all"
                style={{ width: `${(completedTasksCount / totalTasksCount) * 100}%` }}
              />
            </div>
          </div>
        </div>

        <div className="space-y-2 pt-1">
          {checklist.map((item) => {
            const isDone = item.status === 'concluido';
            return (
              <div
                key={item.id}
                onClick={() => handleToggleChecklist(item.id)}
                className={`p-2.5 rounded-lg border transition-all cursor-pointer flex items-center justify-between text-xs ${
                  isDone
                    ? 'bg-emerald-950/20 border-emerald-800/40 text-slate-200'
                    : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 text-slate-300'
                }`}
              >
                <div className="flex items-center space-x-2.5">
                  <div
                    className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                      isDone
                        ? 'bg-emerald-500 border-emerald-500 text-black'
                        : 'border-slate-600 bg-slate-900'
                    }`}
                  >
                    {isDone && <Check className="w-3 h-3 stroke-[3]" />}
                  </div>
                  <span className={isDone ? 'line-through text-slate-400' : 'font-medium'}>
                    {item.task}
                  </span>
                </div>

                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                    isDone
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                      : 'bg-slate-800 text-slate-400 border border-slate-700'
                  }`}
                >
                  {isDone ? 'Concluído' : 'Pendente'}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Evidências Fotográficas (Antes e Depois) */}
      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Camera className="w-4 h-4 text-purple-400" />
            <h4 className="font-bold text-white text-xs uppercase tracking-wide">
              4. Evidências Fotográficas de Campo (Obrigatórias)
            </h4>
          </div>
          <span className="text-[11px] text-slate-400">
            Fotos Antes ({beforePhotos.length}) • Fotos Depois ({afterPhotos.length})
          </span>
        </div>

        {photoError && <p className="text-xs text-red-400">{photoError}</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Antes */}
          <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-slate-200">Foto Inicial (Antes do Reparo)</span>
              <label className="inline-flex items-center space-x-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-blue-400 text-[10px] font-semibold cursor-pointer">
                <Upload className="w-3 h-3" />
                <span>{uploading === 'before' ? 'Enviando...' : 'Anexar Foto Antes'}</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  disabled={uploading !== null}
                  onChange={(e) => { handlePhotoFile('before', e.target.files?.[0]); e.target.value = ''; }}
                />
              </label>
            </div>

            {beforePhotos.length > 0 ? (
              <div className="grid grid-cols-2 gap-2 pt-1">
                {beforePhotos.map((url, i) => (
                  <div key={i} className="relative group rounded-lg overflow-hidden border border-slate-800">
                    <img src={url} alt={`Antes ${i}`} className="w-full h-28 object-cover" />
                    <span className="absolute bottom-1 left-1 px-1.5 py-0.2 rounded bg-black/70 text-[9px] text-white font-mono">
                      Antes #{i + 1}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-28 rounded border border-dashed border-slate-800 flex flex-col items-center justify-center text-slate-500 text-[11px]">
                <Camera className="w-5 h-5 mb-1 text-slate-600" />
                <span>Nenhuma foto inicial registrada</span>
              </div>
            )}
          </div>

          {/* Depois */}
          <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-slate-200">Foto Concluída (Depois do Reparo)</span>
              <label className="inline-flex items-center space-x-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-emerald-400 text-[10px] font-semibold cursor-pointer">
                <Upload className="w-3 h-3" />
                <span>{uploading === 'after' ? 'Enviando...' : 'Anexar Foto Depois'}</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  disabled={uploading !== null}
                  onChange={(e) => { handlePhotoFile('after', e.target.files?.[0]); e.target.value = ''; }}
                />
              </label>
            </div>

            {afterPhotos.length > 0 ? (
              <div className="grid grid-cols-2 gap-2 pt-1">
                {afterPhotos.map((url, i) => (
                  <div key={i} className="relative group rounded-lg overflow-hidden border border-slate-800">
                    <img src={url} alt={`Depois ${i}`} className="w-full h-28 object-cover" />
                    <span className="absolute bottom-1 left-1 px-1.5 py-0.2 rounded bg-black/70 text-[9px] text-white font-mono">
                      Depois #{i + 1}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-28 rounded border border-dashed border-slate-800 flex flex-col items-center justify-center text-slate-500 text-[11px]">
                <Camera className="w-5 h-5 mb-1 text-slate-600" />
                <span>Nenhuma foto final registrada</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 5. Coleta de Assinaturas Digitais (Canvas) */}
      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <PenTool className="w-4 h-4 text-blue-400" />
            <h4 className="font-bold text-white text-xs uppercase tracking-wide">
              5. Coleta de Assinaturas Digitais em Campo
            </h4>
          </div>
          <span className="text-[11px] text-slate-400">Assine diretamente na tela com o dedo ou mouse</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Assinatura Técnico */}
          <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-slate-200">1. Assinatura do Técnico Executor</span>
              {order.technicianSignatureUrl && (
                <span className="text-[10px] text-emerald-400 font-bold">✓ Assinado</span>
              )}
            </div>

            <input
              type="text"
              value={techName}
              onChange={(e) => setTechName(e.target.value)}
              placeholder="Nome do técnico responsável"
              className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs text-white"
            />

            <div className="rounded border border-slate-800 bg-slate-900/60 p-1 relative">
              <canvas
                ref={techCanvasRef}
                width={340}
                height={120}
                onMouseDown={(e) => startDrawing(e, 'tech')}
                onMouseMove={(e) => draw(e, 'tech')}
                onMouseUp={() => stopDrawing('tech')}
                onMouseLeave={() => stopDrawing('tech')}
                onTouchStart={(e) => startDrawing(e, 'tech')}
                onTouchMove={(e) => draw(e, 'tech')}
                onTouchEnd={() => stopDrawing('tech')}
                className="w-full h-28 bg-[#0b0f17] rounded cursor-crosshair touch-none"
              />
              <span className="absolute bottom-2 right-2 text-[9px] text-slate-600 pointer-events-none">
                Área de assinatura
              </span>
            </div>

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => clearCanvas('tech')}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-[11px] cursor-pointer"
              >
                Limpar
              </button>
              <button
                type="button"
                onClick={() => saveSignature('tech')}
                className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-semibold text-[11px] cursor-pointer"
              >
                Confirmar Assinatura Técnico
              </button>
            </div>
          </div>

          {/* Assinatura Responsável */}
          <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-slate-200">2. Assinatura do Responsável da Planta</span>
              {order.clientSignatureUrl && (
                <span className="text-[10px] text-emerald-400 font-bold">✓ Assinado</span>
              )}
            </div>

            <input
              type="text"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Nome do responsável/gestor"
              className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs text-white"
            />

            <div className="rounded border border-slate-800 bg-slate-900/60 p-1 relative">
              <canvas
                ref={clientCanvasRef}
                width={340}
                height={120}
                onMouseDown={(e) => startDrawing(e, 'client')}
                onMouseMove={(e) => draw(e, 'client')}
                onMouseUp={() => stopDrawing('client')}
                onMouseLeave={() => stopDrawing('client')}
                onTouchStart={(e) => startDrawing(e, 'client')}
                onTouchMove={(e) => draw(e, 'client')}
                onTouchEnd={() => stopDrawing('client')}
                className="w-full h-28 bg-[#0b0f17] rounded cursor-crosshair touch-none"
              />
              <span className="absolute bottom-2 right-2 text-[9px] text-slate-600 pointer-events-none">
                Área de assinatura
              </span>
            </div>

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => clearCanvas('client')}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-[11px] cursor-pointer"
              >
                Limpar
              </button>
              <button
                type="button"
                onClick={() => saveSignature('client')}
                className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-[11px] cursor-pointer"
              >
                Confirmar Assinatura Responsável
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Botão de Emissão de Relatório */}
      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={onOpenReportModal}
          className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg transition-colors cursor-pointer"
        >
          <Printer className="w-4 h-4" />
          <span>Emitir Relatório Técnico Completo de OS (PDF / Impressão)</span>
        </button>
      </div>
    </div>
  );
};
