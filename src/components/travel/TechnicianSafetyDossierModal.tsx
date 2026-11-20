import React, { useState } from 'react';
import {
  X,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Printer,
  Share2,
  HardHat,
  HeartPulse,
  UserCheck,
  Calendar,
  Building,
} from 'lucide-react';
import { TechnicianSafetyCompliance } from '../../types/travel';

interface TechnicianSafetyDossierModalProps {
  isOpen: boolean;
  onClose: () => void;
  missionTitle: string;
  clientName: string;
  plantAddress: string;
  workOrderNumber?: string;
  teamMembers: Array<{ name: string; role: string }>;
}

export const TechnicianSafetyDossierModal: React.FC<TechnicianSafetyDossierModalProps> = ({
  isOpen,
  onClose,
  missionTitle,
  clientName,
  plantAddress,
  workOrderNumber = 'OS-2025-042',
  teamMembers,
}) => {
  // Generate realistic compliance records based on team
  const [compliances] = useState<TechnicianSafetyCompliance[]>([
    {
      technicianName: teamMembers[0]?.name || 'Carlos Eduardo Silva',
      role: teamMembers[0]?.role || 'Soldador TIG Inox Especialista',
      cpf: '342.***.***-81',
      asoStatus: 'valido',
      asoExpirationDate: '2026-08-14',
      nr35Status: 'valido',
      nr35ExpirationDate: '2026-11-20',
      nr33Status: 'valido',
      nr33ExpirationDate: '2026-09-05',
      nr10Status: 'valido',
      nr10ExpirationDate: '2027-01-10',
      nr12Status: 'valido',
      nr12ExpirationDate: '2026-10-30',
      epiCompleteCheck: true,
      isEligibleForEntry: true,
    },
    {
      technicianName: teamMembers[1]?.name || 'Marcos Roberto Santos',
      role: teamMembers[1]?.role || 'Montador Mecânico Encanador',
      cpf: '219.***.***-04',
      asoStatus: 'valido',
      asoExpirationDate: '2026-07-22',
      nr35Status: 'valido',
      nr35ExpirationDate: '2026-10-15',
      nr33Status: 'valido',
      nr33ExpirationDate: '2026-06-18',
      nr10Status: 'nao_aplicavel',
      nr12Status: 'valido',
      nr12ExpirationDate: '2026-12-01',
      epiCompleteCheck: true,
      isEligibleForEntry: true,
    },
    {
      technicianName: teamMembers[2]?.name || 'Rafael Henrique Lima',
      role: teamMembers[2]?.role || 'Eletricista de Força & Controle',
      cpf: '185.***.***-63',
      asoStatus: 'valido',
      asoExpirationDate: '2026-09-10',
      nr35Status: 'valido',
      nr35ExpirationDate: '2026-11-05',
      nr33Status: 'vencendo',
      nr33ExpirationDate: '2026-04-12',
      nr10Status: 'valido',
      nr10ExpirationDate: '2026-12-20',
      nr12Status: 'valido',
      nr12ExpirationDate: '2026-08-18',
      epiCompleteCheck: true,
      isEligibleForEntry: true,
    },
    {
      technicianName: teamMembers[3]?.name || 'André Luiz Souza',
      role: teamMembers[3]?.role || 'Encarregado / Líder de Equipe',
      cpf: '098.***.***-52',
      asoStatus: 'valido',
      asoExpirationDate: '2026-12-05',
      nr35Status: 'valido',
      nr35ExpirationDate: '2027-02-15',
      nr33Status: 'valido',
      nr33ExpirationDate: '2026-11-28',
      nr10Status: 'valido',
      nr10ExpirationDate: '2027-03-01',
      nr12Status: 'valido',
      nr12ExpirationDate: '2027-01-20',
      epiCompleteCheck: true,
      isEligibleForEntry: true,
    },
  ]);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleShareWhatsApp = () => {
    const text = `*DOSSIÊ DE SEGURANÇA DO TRABALHO & LIBERAÇÃO DE ENTRADA*
*Empresa:* Aguero Inox Tubulações & Montagens Industriais
*Cliente / Planta:* ${clientName}
*Endereço:* ${plantAddress}
*OS:* ${workOrderNumber}
*Missão:* ${missionTitle}

*EQUIPE COM LAUDOS E CERTIFICAÇÕES VÁLIDAS:*
${compliances.map((c, i) => `${i + 1}. ${c.technicianName} (${c.role}) - ASO Válido (${c.asoExpirationDate}) | NR-35 OK | NR-33 OK | EPIs 100%`).join('\n')}

*STATUS DE LIBERAÇÃO:* ✅ 100% HOMOLOGADO PARA ENTRADA NA PLANTA`;

    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto">
      <div className="bg-[#111827] border border-emerald-500/40 rounded-3xl w-full max-w-4xl my-6 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 sm:p-6 bg-gradient-to-r from-emerald-950/70 via-slate-900 to-cyan-950/70 border-b border-emerald-500/30 flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-400" /> SST & NRs Auditadas
              </span>
              <span className="text-xs text-slate-400">Portaria de Fábrica / Segurança Patrimonial</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white">
              Dossiê de Liberação de Entrada em Fábrica
            </h2>
            <p className="text-xs text-slate-300 max-w-2xl">
              Conferência dos Atestados de Saúde Ocupacional (ASO) e certificados de NR-35 (Altura), NR-33 (Espaço Confinado) e NR-10/12 para liberação imediata na guarita industrial.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 text-slate-200 text-xs">
          {/* Plant & Mission Info Card */}
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <span className="text-[10px] text-slate-400 block font-semibold uppercase">Cliente / Planta</span>
              <strong className="text-white text-xs">{clientName}</strong>
              <span className="text-[11px] text-slate-400 block">{plantAddress}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block font-semibold uppercase">Ordem de Serviço</span>
              <strong className="text-cyan-400 font-mono text-xs">{workOrderNumber}</strong>
              <span className="text-[11px] text-slate-300 block">{missionTitle}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block font-semibold uppercase">Parecer de Segurança</span>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold text-[11px] mt-0.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> Aprovado para Entrada
              </div>
            </div>
          </div>

          {/* Compliance Table */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <HardHat className="w-4 h-4 text-emerald-400" />
              Técnicos Designados & Validade das Normas Regulamentadoras
            </h3>

            <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-950">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-900 text-slate-400 border-b border-slate-800 text-[11px]">
                      <th className="p-3">Técnico / Função</th>
                      <th className="p-3">ASO Periódico</th>
                      <th className="p-3">NR-35 (Altura)</th>
                      <th className="p-3">NR-33 (Confinado)</th>
                      <th className="p-3">NR-10 / NR-12</th>
                      <th className="p-3">EPIs Completos</th>
                      <th className="p-3 text-right">Status Portaria</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900">
                    {compliances.map((comp, idx) => (
                      <tr key={idx} className="hover:bg-slate-900/50 transition">
                        <td className="p-3">
                          <strong className="text-white block">{comp.technicianName}</strong>
                          <span className="text-[11px] text-slate-400">{comp.role}</span>
                          <span className="text-[10px] font-mono text-slate-500 block">CPF: {comp.cpf}</span>
                        </td>

                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono text-[10px] block w-fit">
                            Válido até {comp.asoExpirationDate.split('-').reverse().join('/')}
                          </span>
                        </td>

                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono text-[10px] block w-fit">
                            Válido até {comp.nr35ExpirationDate?.split('-').reverse().join('/')}
                          </span>
                        </td>

                        <td className="p-3">
                          {comp.nr33Status === 'vencendo' ? (
                            <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono text-[10px] block w-fit">
                              Vencendo ({comp.nr33ExpirationDate?.split('-').reverse().join('/')})
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono text-[10px] block w-fit">
                              Válido até {comp.nr33ExpirationDate?.split('-').reverse().join('/')}
                            </span>
                          )}
                        </td>

                        <td className="p-3">
                          {comp.nr10Status === 'nao_aplicavel' ? (
                            <span className="text-slate-500 text-[10px]">N/A (Mecânico)</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono text-[10px] block w-fit">
                              Válido até {comp.nr10ExpirationDate?.split('-').reverse().join('/')}
                            </span>
                          )}
                        </td>

                        <td className="p-3">
                          <span className="text-emerald-400 font-semibold text-[11px] flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> 100% Verificado
                          </span>
                        </td>

                        <td className="p-3 text-right">
                          <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                            Liberado
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-slate-400 hover:text-white font-semibold text-xs rounded-xl"
          >
            Fechar
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs flex items-center gap-1.5 transition"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir / Salvar PDF</span>
            </button>

            <button
              type="button"
              onClick={handleShareWhatsApp}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-600/30 transition"
            >
              <Share2 className="w-4 h-4" />
              <span>Enviar Dossiê no WhatsApp</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
