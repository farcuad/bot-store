import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useGlassAlert } from 'glass-alert-animation';

interface BankAccount {
  id: string;
  country: string;
  bankName: string;
  accountHolder: string;
  accountNumber: string;
  accountType: string;
  isActive: boolean;
}

const AdminBankAccounts: React.FC = () => {
  const { user } = useAuth();
  const { fire } = useGlassAlert();
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    country: '',
    bankName: '',
    accountHolder: '',
    accountNumber: '',
    accountType: '',
    isActive: true
  });

  const fetchBanks = async () => {
    try {
      const token = await user?.getIdToken();
      if (!token) return;
      const res = await fetch('/api/saas/billing/banks', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.ok) {
        setBanks(data.banks);
      } else {
        setError(data.error);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBanks();
  }, [user]);

  const handleOpenModal = (bank?: BankAccount) => {
    if (bank) {
      setEditingId(bank.id);
      setFormData({
        country: bank.country,
        bankName: bank.bankName,
        accountHolder: bank.accountHolder,
        accountNumber: bank.accountNumber,
        accountType: bank.accountType,
        isActive: bank.isActive
      });
    } else {
      setEditingId(null);
      setFormData({
        country: '',
        bankName: '',
        accountHolder: '',
        accountNumber: '',
        accountType: '',
        isActive: true
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const token = await user?.getIdToken();
      const method = editingId ? 'PUT' : 'POST';
      const url = editingId ? `/api/saas/billing/admin/banks/${editingId}` : '/api/saas/billing/admin/banks';
      
      const res = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (data.ok) {
        setIsModalOpen(false);
        fetchBanks();
        fire({
          title: 'Éxito',
          text: 'Cuenta guardada correctamente',
          icon: 'success',
          toast: true,
          position: 'top-end',
          timer: 3000
        });
      } else {
        fire({ title: 'Error', text: data.error, icon: 'error' });
      }
    } catch (e: any) {
      fire({ title: 'Error', text: e.message, icon: 'error' });
    }
  };

  const handleDelete = async (id: string) => {
    const result = await fire({
      title: '¿Eliminar cuenta bancaria?',
      text: 'No podrás revertir esta acción',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    });
    if (!result.isConfirmed) return;

    try {
      const token = await user?.getIdToken();
      const res = await fetch(`/api/saas/billing/admin/banks/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.ok) {
        fetchBanks();
      } else {
        fire({ title: 'Error', text: data.error, icon: 'error' });
      }
    } catch (e: any) {
      fire({ title: 'Error', text: e.message, icon: 'error' });
    }
  };

  const toggleStatus = async (bank: BankAccount) => {
    try {
      const token = await user?.getIdToken();
      const res = await fetch(`/api/saas/billing/admin/banks/${bank.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ isActive: !bank.isActive })
      });
      if ((await res.json()).ok) fetchBanks();
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) {
    return <div className="text-center p-12 text-gray-500">Cargando cuentas...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white mb-2">Cuentas Bancarias</h1>
          <p className="text-gray-400 text-sm">Gestiona las cuentas donde los usuarios realizarán transferencias.</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="bg-[#25d366] text-black font-bold py-2 px-4 rounded-xl hover:bg-[#20c55d] transition-colors"
        >
          + Nueva Cuenta
        </button>
      </div>

      {error && <div className="text-red-400 bg-red-500/10 p-4 rounded-xl mb-6">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {banks.map(bank => (
          <div key={bank.id} className="bg-[#12121a] border border-white/10 rounded-2xl p-6 relative">
            <div className="absolute top-6 right-6">
              <button
                onClick={() => toggleStatus(bank)}
                className={`w-10 h-6 rounded-full transition-colors relative ${bank.isActive ? 'bg-[#25d366]' : 'bg-gray-600'}`}
              >
                <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${bank.isActive ? 'left-5' : 'left-1'}`}></div>
              </button>
            </div>
            
            <h3 className="font-bold text-lg text-white mb-1">{bank.bankName}</h3>
            <p className="text-gray-400 text-xs mb-4 uppercase tracking-wider">{bank.country}</p>
            
            <div className="space-y-2 mb-6 text-sm">
              <div className="flex flex-col">
                <span className="text-gray-500 text-xs">Titular</span>
                <span className="text-gray-300">{bank.accountHolder}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-gray-500 text-xs">Número de Cuenta</span>
                <span className="text-gray-300 font-mono">{bank.accountNumber}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-gray-500 text-xs">Tipo</span>
                <span className="text-gray-300">{bank.accountType}</span>
              </div>
            </div>

            <div className="flex gap-2 pt-4 border-t border-white/5">
              <button onClick={() => handleOpenModal(bank)} className="flex-1 bg-white/5 hover:bg-white/10 text-white py-2 rounded-lg text-sm font-medium transition-colors">
                Editar
              </button>
              <button onClick={() => handleDelete(bank.id)} className="flex-1 bg-red-500/10 hover:bg-red-500/20 text-red-500 py-2 rounded-lg text-sm font-medium transition-colors">
                Eliminar
              </button>
            </div>
          </div>
        ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#12121a] border border-white/10 p-6 rounded-2xl max-w-md w-full shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-6">{editingId ? 'Editar Cuenta' : 'Nueva Cuenta'}</h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">País</label>
                <input required value={formData.country} onChange={e => setFormData({...formData, country: e.target.value})} className="w-full bg-[#1a1a26] border border-white/10 rounded-xl px-4 py-2.5 text-white outline-none focus:border-[#25d366]" placeholder="Ej: Colombia" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Banco</label>
                <input required value={formData.bankName} onChange={e => setFormData({...formData, bankName: e.target.value})} className="w-full bg-[#1a1a26] border border-white/10 rounded-xl px-4 py-2.5 text-white outline-none focus:border-[#25d366]" placeholder="Ej: Bancolombia" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Titular de la Cuenta</label>
                <input required value={formData.accountHolder} onChange={e => setFormData({...formData, accountHolder: e.target.value})} className="w-full bg-[#1a1a26] border border-white/10 rounded-xl px-4 py-2.5 text-white outline-none focus:border-[#25d366]" placeholder="Nombre completo" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Número de Cuenta</label>
                <input required value={formData.accountNumber} onChange={e => setFormData({...formData, accountNumber: e.target.value})} className="w-full bg-[#1a1a26] border border-white/10 rounded-xl px-4 py-2.5 text-white outline-none focus:border-[#25d366] font-mono" placeholder="000-000000-00" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Tipo de Cuenta</label>
                <input required value={formData.accountType} onChange={e => setFormData({...formData, accountType: e.target.value})} className="w-full bg-[#1a1a26] border border-white/10 rounded-xl px-4 py-2.5 text-white outline-none focus:border-[#25d366]" placeholder="Ahorros, Corriente..." />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 text-gray-400 hover:text-white transition-colors">Cancelar</button>
                <button type="submit" className="px-5 py-2.5 bg-[#25d366] text-black font-bold rounded-xl hover:bg-[#20c55d] transition-colors">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminBankAccounts;
