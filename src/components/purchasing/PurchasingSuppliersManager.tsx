import React, { useState } from 'react';
import {
  Building2,
  Plus,
  Search,
  Star,
  ShieldCheck,
  Phone,
  Mail,
  MapPin,
  CheckCircle,
  AlertCircle,
  X,
  Tag
} from 'lucide-react';
import { PurchasingSupplier } from '../../types/purchasing';
import { savePurchasingSupplier } from '../../services/purchasingService';

interface PurchasingSuppliersManagerProps {
  suppliers: PurchasingSupplier[];
  currentOrgId: string;
  onRefresh: () => void;
}

export const PurchasingSuppliersManager: React.FC<PurchasingSuppliersManagerProps> = ({
  suppliers,
  currentOrgId,
  onRefresh,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('todas');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // New Supplier Form
  const [name, setName] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('SP');
  const [categoryInput, setCategoryInput] = useState('Aço Inoxidável & Chapas');
  const [rating, setRating] = useState(5);
  const [isCertifiedIso, setIsCertifiedIso] = useState(true);
  const [status, setStatus] = useState<PurchasingSupplier['status']>('homologado');

  // Available categories for filtering
  const allCategories = Array.from(
    new Set(suppliers.flatMap((s) => s.categories || []))
  );

  const filteredSuppliers = suppliers.filter((s) => {
    const matchesSearch =
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.cnpj.includes(searchTerm) ||
      s.contactPerson.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCat =
      categoryFilter === 'todas' ||
      (s.categories && s.categories.includes(categoryFilter));

    return matchesSearch && matchesCat;
  });

  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !cnpj.trim()) {
      alert('Preencha a Razão Social e o CNPJ.');
      return;
    }

    setSubmitting(true);
    try {
      const newSup: PurchasingSupplier = {
        id: `sup_${Date.now()}`,
        organizationId: currentOrgId,
        name: name.trim(),
        cnpj: cnpj.trim(),
        contactPerson: contactPerson.trim(),
        email: email.trim(),
        phone: phone.trim(),
        city: city.trim() || 'São Paulo',
        state: state.trim() || 'SP',
        categories: categoryInput
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean),
        rating,
        isCertifiedIso,
        status,
        createdAt: new Date().toISOString(),
      };

      await savePurchasingSupplier(newSup);
      setIsAddModalOpen(false);
      setName('');
      setCnpj('');
      setContactPerson('');
      setEmail('');
      setPhone('');
      onRefresh();
    } catch (err) {
      console.error(err);
      alert('Erro ao cadastrar fornecedor.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Action Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900/60 p-5 rounded-2xl border border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Building2 className="text-cyan-400" size={22} />
            Cadastro & Homologação de Fornecedores
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Base qualificada de fornecedores industriais com pontuação de entrega, certificações ISO e categorias.
          </p>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-sm font-semibold shadow transition"
        >
          <Plus size={16} /> Homologar Novo Fornecedor
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-slate-900/40 p-3 rounded-xl border border-slate-800">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar fornecedor, CNPJ ou contato..."
            className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
          >
            <option value="todas">Todas as Categorias</option>
            {allCategories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Suppliers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredSuppliers.map((supplier) => (
          <div
            key={supplier.id}
            className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition space-y-4 flex flex-col justify-between"
          >
            <div>
              {/* Header: Name, Status & ISO */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-bold text-white text-base leading-tight">
                    {supplier.name}
                  </h3>
                  <span className="font-mono text-xs text-slate-400 mt-0.5 block">
                    {supplier.cnpj}
                  </span>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                      supplier.status === 'homologado'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : supplier.status === 'em_avaliacao'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                    }`}
                  >
                    {supplier.status === 'homologado'
                      ? 'Homologado'
                      : supplier.status === 'em_avaliacao'
                      ? 'Em Avaliação'
                      : 'Bloqueado'}
                  </span>
                  {supplier.isCertifiedIso && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 flex items-center gap-1">
                      <ShieldCheck size={11} /> ISO 9001
                    </span>
                  )}
                </div>
              </div>

              {/* Rating stars */}
              <div className="flex items-center gap-1 mt-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    size={14}
                    className={
                      star <= supplier.rating
                        ? 'text-amber-400 fill-amber-400'
                        : 'text-slate-700'
                    }
                  />
                ))}
                <span className="text-xs text-slate-400 ml-1 font-mono font-medium">
                  {supplier.rating}.0
                </span>
              </div>

              {/* Contact info */}
              <div className="space-y-1.5 text-xs text-slate-300 mt-3 pt-3 border-t border-slate-800/80">
                <div className="flex items-center gap-2 text-slate-400">
                  <span className="font-medium text-slate-300">Contato:</span> {supplier.contactPerson}
                </div>
                <div className="flex items-center gap-2 text-slate-400">
                  <Mail size={13} className="text-slate-500 shrink-0" />
                  <span className="truncate">{supplier.email}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-400">
                  <Phone size={13} className="text-slate-500 shrink-0" />
                  <span>{supplier.phone}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-400">
                  <MapPin size={13} className="text-slate-500 shrink-0" />
                  <span>{supplier.city} / {supplier.state}</span>
                </div>
              </div>
            </div>

            {/* Categories tags */}
            <div className="pt-3 border-t border-slate-800/80 flex flex-wrap gap-1.5">
              {supplier.categories.map((cat, i) => (
                <span
                  key={i}
                  className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-slate-800 text-cyan-300 border border-slate-700/60"
                >
                  {cat}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Modal: Homologar Fornecedor */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Building2 className="text-cyan-400" size={18} />
                Cadastrar Fornecedor Homologado
              </h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveSupplier} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Razão Social *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Aperam Inox Tubos e Laminados S/A"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    CNPJ *
                  </label>
                  <input
                    type="text"
                    value={cnpj}
                    onChange={(e) => setCnpj(e.target.value)}
                    placeholder="00.000.000/0001-00"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Pessoa de Contato
                  </label>
                  <input
                    type="text"
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    placeholder="Ex: Engenharia de Vendas"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">E-mail</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="vendas@fornecedor.com.br"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Telefone / WhatsApp</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(11) 3200-0000"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Cidade / UF</label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Piracicaba / SP"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
                  >
                    <option value="homologado">Homologado</option>
                    <option value="em_avaliacao">Em Avaliação</option>
                    <option value="bloqueado">Bloqueado</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Categorias de Fornecimento (separadas por vírgula)
                </label>
                <input
                  type="text"
                  value={categoryInput}
                  onChange={(e) => setCategoryInput(e.target.value)}
                  placeholder="Ex: Aço Inoxidável, Tubos Industriais, Flanges"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="isoCert"
                  checked={isCertifiedIso}
                  onChange={(e) => setIsCertifiedIso(e.target.checked)}
                  className="rounded accent-cyan-500"
                />
                <label htmlFor="isoCert" className="text-xs text-slate-300">
                  Possui Certificação de Qualidade ISO 9001
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-sm font-bold shadow"
                >
                  {submitting ? 'Salvando...' : 'Salvar Fornecedor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
