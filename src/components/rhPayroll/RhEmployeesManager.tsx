import React, { useState } from 'react';
import {
  Users,
  Search,
  Plus,
  Edit2,
  Trash2,
  Filter,
  DollarSign,
  Briefcase,
  Building,
  CheckCircle,
  XCircle,
  AlertCircle,
  HelpCircle,
  X,
  FileSpreadsheet,
  Link2,
} from 'lucide-react';
import { RhEmployee } from '../../types/rhPayroll';
import { Unit, Contract } from '../../types';
import { roundCurrency } from '../../services/rhPayrollService';

interface RhEmployeesManagerProps {
  employees: RhEmployee[];
  units: Unit[];
  contracts: Contract[];
  orgName?: string;
  focusEmployeeId?: string | null;
  onFocusHandled?: () => void;
  onSaveEmployee: (employee: RhEmployee) => Promise<void>;
  onDeleteEmployee: (id: string) => Promise<void>;
  canEdit: boolean;
  canViewFinancials: boolean;
  onNavigateToImport: () => void;
  onNavigateToOnboarding?: () => void;
}

export const RhEmployeesManager: React.FC<RhEmployeesManagerProps> = ({
  employees,
  units,
  contracts,
  orgName = '',
  focusEmployeeId,
  onFocusHandled,
  onSaveEmployee,
  onDeleteEmployee,
  canEdit,
  canViewFinancials,
  onNavigateToImport,
  onNavigateToOnboarding,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('active');
  const [selectedDepartment, setSelectedDepartment] = useState('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<RhEmployee | null>(null);

  // Form State
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [name, setName] = useState('');
  const [admissionDate, setAdmissionDate] = useState('');
  const [dismissalDate, setDismissalDate] = useState('');
  const [department, setDepartment] = useState('');
  const [role, setRole] = useState('');
  const [companyName, setCompanyName] = useState(orgName);
  const [unitId, setUnitId] = useState('');
  const [contractId, setContractId] = useState('');
  const [hourlyRateCarteira, setHourlyRateCarteira] = useState<string>('');
  const [hourlyRatePorFora, setHourlyRatePorFora] = useState<string>('0');
  const [monthlyHours, setMonthlyHours] = useState<string>('220');
  const [dependentsCount, setDependentsCount] = useState<string>('0');
  const [porForaEligible, setPorForaEligible] = useState(true);
  const [active, setActive] = useState(true);
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Departamentos existentes
  const departments = Array.from(new Set(employees.map((e) => e.department).filter(Boolean)));

  const handleOpenAdd = () => {
    setEditingEmployee(null);
    setRegistrationNumber('');
    setName('');
    setAdmissionDate('');
    setDismissalDate('');
    setDepartment('');
    setRole('');
    setCompanyName(orgName);
    setUnitId('');
    setContractId('');
    setHourlyRateCarteira('');
    setHourlyRatePorFora('0');
    setMonthlyHours('220');
    setDependentsCount('0');
    setPorForaEligible(false);
    setActive(true);
    setNotes('');
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (emp: RhEmployee) => {
    setEditingEmployee(emp);
    setRegistrationNumber(emp.codigoObra || emp.registrationNumber || '');
    setName(emp.name || '');
    setAdmissionDate(emp.admissionDate || '');
    setDismissalDate(emp.dismissalDate || '');
    setDepartment(emp.department || '');
    setRole(emp.role || '');
    setCompanyName(emp.companyName || orgName);
    setUnitId(emp.unitId || '');
    setContractId(emp.contractId || '');
    setHourlyRateCarteira(emp.hourlyRateCarteira ? String(emp.hourlyRateCarteira) : '');
    setHourlyRatePorFora(String(emp.hourlyRatePorFora || 0));
    setMonthlyHours(String(emp.monthlyHours || 220));
    setDependentsCount(String(emp.dependentsCount || 0));
    setPorForaEligible(emp.porForaEligible ?? false);
    setActive(emp.active);
    setNotes(emp.notes || '');
    setFormError(null);
    setIsModalOpen(true);
  };

  React.useEffect(() => {
    if (!focusEmployeeId) return;
    const target = employees.find((e) => e.id === focusEmployeeId);
    if (target) {
      handleOpenEdit(target);
      onFocusHandled?.();
    }
  }, [focusEmployeeId, employees]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanReg = registrationNumber.trim();
    const cleanName = name.trim();

    if (!cleanReg) {
      setFormError('O código da obra / matrícula é obrigatório.');
      return;
    }
    if (!cleanName) {
      setFormError('O nome do colaborador é obrigatório.');
      return;
    }
    if (!admissionDate) {
      setFormError('A data de admissão é obrigatória para o cálculo de 13º.');
      return;
    }

    const hrCarteira = parseFloat(hourlyRateCarteira.replace(',', '.')) || 0;
    const hrPorFora = parseFloat(hourlyRatePorFora.replace(',', '.')) || 0;
    const mHours = parseFloat(monthlyHours.replace(',', '.')) || 220;
    const deps = parseInt(dependentsCount, 10) || 0;

    if (hrCarteira < 0 || hrPorFora < 0) {
      setFormError('Os valores por hora não podem ser negativos.');
      return;
    }

    setIsSubmitting(true);
    try {
      const now = new Date().toISOString();
      const baseSalaryCarteira = roundCurrency(hrCarteira * mHours);
      const baseSalaryPorFora = roundCurrency(hrPorFora * mHours);

      const nameSlug = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 20);
      const targetId =
        editingEmployee?.id ||
        `emp_${nameSlug}_${Date.now().toString(36)}`;

      const employeeData: RhEmployee = {
        id: targetId,
        orgId: editingEmployee?.orgId || '',
        codigoObra: cleanReg,
        registrationNumber: cleanReg,
        name: cleanName,
        admissionDate,
        dismissalDate: dismissalDate || null,
        active,
        department: department.trim(),
        role: role.trim(),
        companyName: companyName.trim() || orgName,
        unitId: unitId || undefined,
        contractId: contractId || undefined,
        hourlyRateCarteira: hrCarteira,
        hourlyRatePorFora: hrPorFora,
        monthlyHours: mHours,
        baseSalaryCarteira,
        baseSalaryPorFora,
        dependentsCount: deps,
        porForaEligible,
        notes: notes.trim() || undefined,
        createdAt: editingEmployee?.createdAt || now,
        updatedAt: now,
      };

      await onSaveEmployee(employeeData);
      setIsModalOpen(false);
    } catch (err: any) {
      setFormError(err.message || 'Erro ao salvar colaborador.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (emp: RhEmployee) => {
    if (
      confirm(
        `Confirma a exclusão do cadastro do colaborador ${emp.name} (Matrícula: ${emp.registrationNumber})?`
      )
    ) {
      try {
        await onDeleteEmployee(emp.id);
      } catch (err: any) {
        alert('Erro ao excluir colaborador: ' + err.message);
      }
    }
  };

  // Filtragem
  const filteredEmployees = employees.filter((emp) => {
    if (statusFilter === 'active' && !emp.active) return false;
    if (statusFilter === 'inactive' && emp.active) return false;
    if (selectedDepartment !== 'all' && emp.department !== selectedDepartment) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = emp.name.toLowerCase().includes(q);
      const matchReg = emp.registrationNumber.toLowerCase().includes(q);
      const matchRole = emp.role.toLowerCase().includes(q);
      const matchDept = emp.department.toLowerCase().includes(q);
      return matchName || matchReg || matchRole || matchDept;
    }
    return true;
  });

  const parsedHrCarteira = parseFloat(hourlyRateCarteira.replace(',', '.')) || 0;
  const parsedHrPorFora = parseFloat(hourlyRatePorFora.replace(',', '.')) || 0;
  const parsedMonthlyHours = parseFloat(monthlyHours.replace(',', '.')) || 220;
  const previewMonthlyBaseCarteira = roundCurrency(parsedHrCarteira * parsedMonthlyHours);
  const previewMonthlyBasePorFora = roundCurrency(parsedHrPorFora * parsedMonthlyHours);

  return (
    <div className="space-y-4">
      {/* Top Filter and Action Bar */}
      <div className="bg-[#121826] border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shadow-sm">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por nome, matrícula, cargo ou departamento..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900/80 border border-slate-700/80 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Department Filter */}
          <select
            value={selectedDepartment}
            onChange={(e) => setSelectedDepartment(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-slate-300 focus:outline-none focus:border-blue-500"
          >
            <option value="all">Todos os setores</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <div className="flex rounded-lg border border-slate-700 overflow-hidden shrink-0">
            <button
              onClick={() => setStatusFilter('active')}
              className={`px-3 py-2 text-xs font-semibold transition ${
                statusFilter === 'active'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-900 text-slate-400 hover:text-white'
              }`}
            >
              Ativos
            </button>
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-2 text-xs font-semibold transition ${
                statusFilter === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-900 text-slate-400 hover:text-white'
              }`}
            >
              Todos
            </button>
            <button
              onClick={() => setStatusFilter('inactive')}
              className={`px-3 py-2 text-xs font-semibold transition ${
                statusFilter === 'inactive'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-900 text-slate-400 hover:text-white'
              }`}
            >
              Inativos
            </button>
          </div>
        </div>

        {canEdit && (
          <div className="flex items-center gap-2 shrink-0">
            {onNavigateToOnboarding && (
              <button
                onClick={onNavigateToOnboarding}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold rounded-lg shadow-sm transition cursor-pointer"
                title="Gerar e gerenciar links de cadastro único para novos colaboradores"
              >
                <Link2 className="w-3.5 h-3.5" />
                Link de Admissão
              </button>
            )}
            <button
              onClick={onNavigateToImport}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              Importar em Lote
            </button>
            <button
              onClick={handleOpenAdd}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg shadow-md transition"
            >
              <Plus className="w-4 h-4" />
              Novo Funcionário
            </button>
          </div>
        )}
      </div>

      {/* Employees Table */}
      <div className="bg-[#121826] border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-900/90 border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-3">Cód. Obra</th>
                <th className="py-3 px-3">Funcionário</th>
                <th className="py-3 px-3">Cargo / Setor</th>
                <th className="py-3 px-3">Admissão</th>
                <th className="py-3 px-3 text-right">Valor Hora CLT</th>
                <th className="py-3 px-3 text-right">Base CLT (220h)</th>
                <th className="py-3 px-3 text-right">Valor Hora Por Fora</th>
                <th className="py-3 px-3 text-right">Base Por Fora</th>
                <th className="py-3 px-3 text-center">Status</th>
                {canEdit && <th className="py-3 px-3 text-center">Ações</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-slate-500">
                    Nenhum colaborador encontrado com os filtros atuais.
                  </td>
                </tr>
              ) : (
                filteredEmployees.map((emp) => (
                  <tr
                    key={emp.id}
                    className="hover:bg-slate-800/40 transition group font-sans text-slate-200"
                  >
                    <td className="py-2.5 px-3 font-mono font-bold text-cyan-400">
                      {emp.codigoObra || emp.registrationNumber}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-white flex items-center gap-1.5">
                        <span>{emp.name}</span>
                        <span
                          className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-950 text-indigo-300 font-semibold border border-indigo-800"
                          title="Sincronizado com o Módulo 13 (Colaboradores de Campo)"
                        >
                          Módulo 13
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-500">{emp.companyName}</div>
                    </td>
                    <td className="py-2.5 px-3">
                      <div>{emp.role}</div>
                      <div className="text-[10px] text-slate-500">{emp.department}</div>
                    </td>
                    <td className="py-2.5 px-3 font-mono">
                      {emp.admissionDate.split('-').reverse().join('/')}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono">
                      {canViewFinancials
                        ? `R$ ${emp.hourlyRateCarteira.toFixed(2)}`
                        : '••••'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold text-indigo-300">
                      {canViewFinancials
                        ? `R$ ${(emp.baseSalaryCarteira || emp.hourlyRateCarteira * 220).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                        : '••••'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-purple-400">
                      {canViewFinancials
                        ? emp.hourlyRatePorFora > 0
                          ? `R$ ${emp.hourlyRatePorFora.toFixed(2)}`
                          : '-'
                        : '••••'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-purple-300 font-semibold">
                      {canViewFinancials
                        ? emp.baseSalaryPorFora > 0
                          ? `R$ ${emp.baseSalaryPorFora.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                          : '-'
                        : '••••'}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {emp.active ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-950/60 border border-emerald-800/50 px-2 py-0.5 rounded-full">
                          <CheckCircle className="w-3 h-3" />
                          Ativo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-400 bg-rose-950/60 border border-rose-800/50 px-2 py-0.5 rounded-full">
                          <XCircle className="w-3 h-3" />
                          Inativo
                        </span>
                      )}
                    </td>
                    {canEdit && (
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleOpenEdit(emp)}
                            className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-slate-800 rounded transition"
                            title="Editar cadastro"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(emp)}
                            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition"
                            title="Excluir cadastro"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Employee Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121826] border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-[#121826] z-10">
              <div className="flex items-center space-x-2">
                <Briefcase className="w-5 h-5 text-blue-400" />
                <h3 className="text-sm font-bold text-white">
                  {editingEmployee ? 'Editar Colaborador' : 'Novo Colaborador'}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div className="p-2.5 bg-indigo-950/40 border border-indigo-900/60 rounded-lg text-xs text-indigo-200 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                <span className="flex items-center gap-1.5 font-medium">
                  <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                  Cadastro Central: Salvar aqui sincroniza automaticamente com o Módulo 13 (Obras / Campo)
                </span>
                <span className="text-[10px] text-slate-400 font-mono">NRs e Diário de Obra</span>
              </div>

              {formError && (
                <div className="p-3 bg-rose-950/60 border border-rose-800/80 rounded-lg text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">
                    Código da Obra / Matrícula *
                  </label>
                  <input
                    type="text"
                    required
                    value={registrationNumber}
                    onChange={(e) => setRegistrationNumber(e.target.value)}
                    placeholder="Ex: OBRA-001"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">
                    Nome Completo do Funcionário *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Nome completo do colaborador"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">
                    Data de Admissão *
                  </label>
                  <input
                    type="date"
                    required
                    value={admissionDate}
                    onChange={(e) => setAdmissionDate(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">
                    Data de Demissão (se houver)
                  </label>
                  <input
                    type="date"
                    value={dismissalDate}
                    onChange={(e) => setDismissalDate(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">Empresa</label>
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Razão social / unidade empregadora"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">
                    Cargo / Função
                  </label>
                  <input
                    type="text"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    placeholder="Ex: Soldador TIG, Caldeireiro"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">
                    Departamento / Setor
                  </label>
                  <input
                    type="text"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    placeholder="Ex: Montagem, Usinagem, Solda"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Bloco Financeiro e Carga Horária */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <DollarSign className="w-4 h-4 text-emerald-400" />
                    Bases Salariais & Carga Horária
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Multiplicador padrão: 220 horas mensais
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                      Valor Hora Carteira (R$)
                    </label>
                    <input
                      type="text"
                      value={hourlyRateCarteira}
                      onChange={(e) => setHourlyRateCarteira(e.target.value)}
                      placeholder="Ex: 22.50"
                      className="w-full bg-[#121826] border border-slate-700 rounded-lg px-3 py-2 text-xs text-emerald-400 font-mono font-bold focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                      Valor Hora Por Fora (R$)
                    </label>
                    <input
                      type="text"
                      value={hourlyRatePorFora}
                      onChange={(e) => setHourlyRatePorFora(e.target.value)}
                      placeholder="Ex: 5.00"
                      className="w-full bg-[#121826] border border-slate-700 rounded-lg px-3 py-2 text-xs text-purple-400 font-mono font-bold focus:outline-none focus:border-purple-500"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                      Carga Horária Mensal
                    </label>
                    <input
                      type="text"
                      value={monthlyHours}
                      onChange={(e) => setMonthlyHours(e.target.value)}
                      placeholder="220"
                      className="w-full bg-[#121826] border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Live Preview Calculation */}
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800 text-xs">
                  <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Base Mensal Carteira (CLT):</span>
                    <span className="text-sm font-bold font-mono text-emerald-400">
                      R$ {previewMonthlyBaseCarteira.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                    <span className="text-[9px] text-slate-500 block mt-0.5">
                      ({parsedHrCarteira.toFixed(2)} × {parsedMonthlyHours}h)
                    </span>
                  </div>

                  <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Base Mensal Complementar:</span>
                    <span className="text-sm font-bold font-mono text-purple-400">
                      R$ {previewMonthlyBasePorFora.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                    <span className="text-[9px] text-slate-500 block mt-0.5">
                      ({parsedHrPorFora.toFixed(2)} × {parsedMonthlyHours}h)
                    </span>
                  </div>
                </div>
              </div>

              {/* Vínculo de Unidade / Contrato */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">
                    Unidade Operacional
                  </label>
                  <select
                    value={unitId}
                    onChange={(e) => setUnitId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                  >
                    <option value="">Nenhuma / Matriz</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">
                    Contrato de Alocação
                  </label>
                  <select
                    value={contractId}
                    onChange={(e) => setContractId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                  >
                    <option value="">Nenhum / Administrativo</option>
                    {contracts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Status & Confirmação Por Fora */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={porForaEligible}
                    onChange={(e) => setPorForaEligible(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-900 text-purple-600 focus:ring-0"
                  />
                  <span className="text-xs text-slate-300">
                    Elegível à verba complementar (requer confirmação explícita no cálculo)
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={(e) => setActive(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-0"
                  />
                  <span className="text-xs text-slate-300">Colaborador ativo</span>
                </label>
              </div>

              <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg shadow-md transition disabled:opacity-50"
                >
                  {isSubmitting ? 'Salvando...' : editingEmployee ? 'Salvar Alterações' : 'Cadastrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
