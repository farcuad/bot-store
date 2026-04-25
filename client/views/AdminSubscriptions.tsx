import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useGlassAlert } from 'glass-alert-animation';

interface Subscription {
  id: string; // The uid
  uid: string;
  userEmail: string;
  userName: string;
  planId: string;
  status: 'active' | 'pending_approval' | 'expired' | 'rejected';
  requestedAt: number;
  approvedAt?: number;
  expiresAt?: number;
  referenceNumber?: string;
  receiptUrl?: string;
}

interface Transaction {
  id: string;
  txId: string;
  uid: string;
  userEmail: string;
  userName: string;
  planId: string;
  amount: number;
  status: string;
  approvedAt: number;
  expiresAt: number;
}

const AdminSubscriptions: React.FC = () => {
  const { user } = useAuth();
  const { fire } = useGlassAlert();
  const [tab, setTab] = useState<'pending' | 'active' | 'transactions'>('pending');
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const token = await user?.getIdToken();
      if (!token) return;

      const [subsRes, txRes] = await Promise.all([
        fetch('/api/saas/billing/admin/subscriptions', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/saas/billing/admin/transactions', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const subsData = await subsRes.json();
      const txData = await txRes.json();

      if (subsData.ok) setSubscriptions(subsData.subscriptions);
      if (txData.ok) setTransactions(txData.transactions);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleApprove = async (uid: string) => {
    const result = await fire({
      title: '¿Aprobar esta suscripción?',
      text: 'Verifica que el pago se haya realizado correctamente.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, aprobar',
      cancelButtonText: 'Cancelar'
    });
    if (!result.isConfirmed) return;

    setProcessingId(uid);
    try {
      const token = await user?.getIdToken();
      const res = await fetch(`/api/saas/billing/admin/users/${uid}/approve`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ notes: 'Aprobado desde panel admin' })
      });
      const data = await res.json();
      if (data.ok) {
        await fetchData();
        fire({
          title: 'Éxito',
          text: 'Suscripción aprobada correctamente.',
          icon: 'success',
          toast: true,
          position: 'top-end',
          timer: 3000
        });
      } else {
        fire({
          title: 'Error',
          text: data.error,
          icon: 'error'
        });
      }
    } catch (e: any) {
      fire({
        title: 'Error',
        text: e.message,
        icon: 'error'
      });
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (uid: string) => {
    const result = await fire({
      title: '¿Rechazar esta solicitud?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, rechazar',
      cancelButtonText: 'Cancelar'
    });
    if (!result.isConfirmed) return;

    setProcessingId(uid);
    try {
      const token = await user?.getIdToken();
      const res = await fetch(`/api/saas/billing/admin/users/${uid}/reject`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ notes: 'Rechazado desde panel admin' })
      });
      const data = await res.json();
      if (data.ok) {
        await fetchData();
        fire({
          title: 'Solicitud rechazada',
          icon: 'success',
          toast: true,
          position: 'top-end',
          timer: 3000
        });
      } else {
        fire({
          title: 'Error',
          text: data.error,
          icon: 'error'
        });
      }
    } catch (e: any) {
      fire({
        title: 'Error',
        text: e.message,
        icon: 'error'
      });
    } finally {
      setProcessingId(null);
    }
  };

  const pendingSubs = subscriptions.filter((s) => s.status === 'pending_approval');
  const activeSubs = subscriptions.filter((s) => s.status === 'active');

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#25d366]"></div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-2">Administración de Suscripciones</h1>
        <p className="text-gray-400 text-sm">Gestiona solicitudes de planes y transacciones</p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl mb-6">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-white/10 mb-6">
        <button
          onClick={() => setTab('pending')}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            tab === 'pending'
              ? 'border-[#25d366] text-[#25d366]'
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          Pendientes ({pendingSubs.length})
        </button>
        <button
          onClick={() => setTab('active')}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            tab === 'active'
              ? 'border-[#25d366] text-[#25d366]'
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          Resueltas/Activas ({activeSubs.length})
        </button>
        <button
          onClick={() => setTab('transactions')}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            tab === 'transactions'
              ? 'border-[#25d366] text-[#25d366]'
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          Transacciones
        </button>
      </div>

      {/* Tab Content: Pendientes */}
      {tab === 'pending' && (
        <div className="bg-[#12121a] border border-white/10 rounded-xl overflow-hidden">
          <table className="w-full text-left text-sm text-gray-300">
            <thead className="bg-white/5 text-gray-400">
              <tr>
                <th className="px-6 py-4 font-medium">Usuario</th>
                <th className="px-6 py-4 font-medium">UID</th>
                <th className="px-6 py-4 font-medium">Plan Solicitado</th>
                <th className="px-6 py-4 font-medium">Pago</th>
                <th className="px-6 py-4 font-medium">Fecha</th>
                <th className="px-6 py-4 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {pendingSubs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                    No hay solicitudes pendientes
                  </td>
                </tr>
              ) : (
                pendingSubs.map((sub) => (
                  <tr key={sub.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-medium text-white">{sub.userName || 'Usuario'}</div>
                      <div className="text-xs text-gray-500">{sub.userEmail}</div>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-gray-500">{sub.uid}</td>
                    <td className="px-6 py-4">
                      <span className="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2.5 py-1 rounded-full text-xs font-medium uppercase tracking-wider">
                        {sub.planId}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {sub.referenceNumber && <div className="text-xs text-white mb-1">Ref: {sub.referenceNumber}</div>}
                      {sub.receiptUrl && <a href={sub.receiptUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-400 hover:underline">Ver Comprobante</a>}
                    </td>
                    <td className="px-6 py-4 text-gray-400 text-xs">
                      {new Date(sub.requestedAt).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleReject(sub.uid)}
                          disabled={processingId === sub.uid}
                          className="px-3 py-1.5 text-xs font-medium bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-lg transition-colors border border-red-500/20 disabled:opacity-50"
                        >
                          Rechazar
                        </button>
                        <button
                          onClick={() => handleApprove(sub.uid)}
                          disabled={processingId === sub.uid}
                          className="px-3 py-1.5 text-xs font-medium bg-[#25d366] text-black hover:bg-[#20c55d] rounded-lg transition-colors disabled:opacity-50"
                        >
                          {processingId === sub.uid ? '...' : 'Aprobar Pago'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab Content: Activas */}
      {tab === 'active' && (
        <div className="bg-[#12121a] border border-white/10 rounded-xl overflow-hidden">
          <table className="w-full text-left text-sm text-gray-300">
            <thead className="bg-white/5 text-gray-400">
              <tr>
                <th className="px-6 py-4 font-medium">Usuario</th>
                <th className="px-6 py-4 font-medium">UID</th>
                <th className="px-6 py-4 font-medium">Plan</th>
                <th className="px-6 py-4 font-medium">Aprobada</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {activeSubs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                    No hay solicitudes resueltas
                  </td>
                </tr>
              ) : (
                activeSubs.map((sub) => {
                  return (
                    <tr key={sub.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-medium text-white">{sub.userName || 'Usuario'}</div>
                        <div className="text-xs text-gray-500">{sub.userEmail}</div>
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-gray-500">{sub.uid}</td>
                      <td className="px-6 py-4">
                        <span className="bg-[#25d366]/10 text-[#25d366] border border-[#25d366]/20 px-2.5 py-1 rounded-full text-xs font-medium uppercase">
                          {sub.planId}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-400 text-xs">
                        {sub.approvedAt ? new Date(sub.approvedAt).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab Content: Transacciones */}
      {tab === 'transactions' && (
        <div className="bg-[#12121a] border border-white/10 rounded-xl overflow-hidden">
          <table className="w-full text-left text-sm text-gray-300">
            <thead className="bg-white/5 text-gray-400">
              <tr>
                <th className="px-6 py-4 font-medium">Tx ID</th>
                <th className="px-6 py-4 font-medium">Usuario</th>
                <th className="px-6 py-4 font-medium">Monto</th>
                <th className="px-6 py-4 font-medium">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                    No hay transacciones registradas
                  </td>
                </tr>
              ) : (
                transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 font-mono text-xs text-gray-500">{tx.txId || tx.id}</td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-white">{tx.userName || 'Usuario'}</div>
                      <div className="text-xs text-gray-500">{tx.userEmail}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-medium text-[#25d366]">${tx.amount}</span>
                      <span className="text-xs text-gray-500 ml-1 uppercase">
                        ({tx.planId})
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-400 text-xs">
                      {new Date(tx.approvedAt).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AdminSubscriptions;
