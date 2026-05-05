import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import LoadingScreen from '../components/LoadingScreen';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { SubscriptionRequestModal } from '../components/SubscriptionRequestModal';
import type { PricingPlan } from '../components/SubscriptionRequestModal'

// ── Types ──────────────────────────────────────────────────────────────────────

interface UserSubscription {
  planId: string;
  status: 'active' | 'past_due' | 'canceled';
  expiresAt: number;
  isTrial?: boolean;
}

interface PendingRequest {
  status: string;
  planId: string;
  requestedAt: number;
}

interface BillingData {
  subscription: UserSubscription;
  plan: PricingPlan;
  pendingRequest: PendingRequest | null;
}

// ── Icons ─────────────────────────────────────────────────────────────────────

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4 shrink-0 text-[#25d366]">
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
  </svg>
);

const CrossIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4 shrink-0 text-red-500">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const UserIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
  </svg>
);

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(ts?: number | null) {
  if (!ts) return '—';
  // Check if ts is in seconds or milliseconds
  const ms = ts > 9999999999 ? ts : ts * 1000;
  return new Date(ms).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

function daysLeft(ts?: number | null) {
  if (!ts) return 0;
  const ms = ts > 9999999999 ? ts : ts * 1000;
  return Math.max(0, Math.ceil((ms - Date.now()) / (1000 * 60 * 60 * 24)));
}

// ── Main Component ────────────────────────────────────────────────────────────

const SubscriptionView: React.FC = () => {
  const { user } = useAuth();
  const [billing, setBilling] = useState<BillingData | null>(null);
  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRequestModal, setShowRequestModal] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const token = await user?.getIdToken();
      if (!token) return;

      const billingRes = await fetch('/api/saas/billing/me', { headers: { 'Authorization': `Bearer ${token}` } });
      const billingData = await billingRes.json();
      if (billingData.ok) {
        setBilling({
          subscription: billingData.subscription,
          plan: billingData.plan,
          pendingRequest: billingData.pendingRequest,
        });
      }

      // Traer planes desde Firestore
      const snap = await getDocs(collection(db, 'plans'));
      const plansList = snap.docs.map(d => ({ id: d.id, ...d.data() } as PricingPlan));

      // Ordenar por precio
      plansList.sort((a, b) => a.price - b.price);
      setPlans(plansList);

    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return <LoadingScreen message="Cargando información de facturación..." />;
  }

  const sub = billing?.subscription;
  const currentPlan = billing?.plan;
  const pendingReq = billing?.pendingRequest;

  const isPending = pendingReq && pendingReq.status === 'pending_approval';
  const remainingDays = daysLeft(sub?.expiresAt);

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">Mi Suscripción</h1>
        <p className="text-gray-400 text-sm">Gestiona tu plan y los límites de tu cuenta.</p>
      </div>

      {/* Subscription Status */}
      <div className="bg-[#12121a] border border-white/8 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-5 w-full md:w-auto">
          <div className="w-14 h-14 bg-[#25d366]/10 rounded-2xl flex items-center justify-center text-[#25d366] shrink-0">
            <UserIcon />
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">Plan Actual</p>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-white">{currentPlan?.name || 'Cargando...'}</h2>
              <div className="flex gap-2">
                <span className={`text-xs font-bold px-3 py-1 rounded-full border ${sub?.status === 'active' ? 'bg-[#25d366]/15 text-[#25d366] border-[#25d366]/20' : 'bg-red-500/15 text-red-400 border-red-500/20'
                  }`}>
                  {sub?.status === 'active' ? 'Activo' : 'Inactivo'}
                </span>
                {sub?.isTrial && (
                  <span className="text-xs font-bold px-3 py-1 rounded-full border bg-blue-500/15 text-blue-400 border-blue-500/20">
                    Trial / Prueba
                  </span>
                )}
              </div>
            </div>
            {sub?.status === 'active' && (
              <p className="text-sm text-gray-400 mt-1">
                {sub.isTrial ? 'Tu prueba gratuita finaliza el ' : 'Vence el '}
                {formatDate(sub.expiresAt)}
                <span className={remainingDays <= 3 ? "text-red-400 font-bold" : "text-[#25d366]"}>
                  {" "}({remainingDays} {remainingDays === 1 ? 'día restante' : 'días restantes'})
                </span>
              </p>
            )}
          </div>
        </div>

        <div className="shrink-0 w-full md:w-auto">
          {isPending ? (
            <div className="px-4 py-3 bg-blue-500/10 rounded-xl border border-blue-500/20">
              <p className="text-sm text-blue-400 font-semibold mb-1">Solicitud enviada</p>
              <p className="text-xs text-blue-400/80">Esperando aprobación para mejorar al plan {plans.find(p => p.id === pendingReq?.planId)?.name}</p>
            </div>
          ) : (
            <button
              onClick={() => setShowRequestModal(true)}
              className="w-full md:w-auto px-6 py-3 bg-[#25d366]/10 text-[#25d366] hover:bg-[#25d366]/20 rounded-xl border border-[#25d366]/20 font-semibold transition-colors cursor-pointer"
            >
              Mejorar Plan
            </button>
          )}
        </div>
      </div>

      {/* Plans info */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-5">Planes disponibles</h2>
        <div className="grid md:grid-cols-3 gap-5">
          {plans.map((plan) => {
            const isCurrent = currentPlan?.id === plan.id;

            return (
              <div
                key={plan.id}
                className={`relative bg-[#12121a] border rounded-2xl p-6 ${isCurrent ? 'border-[#25d366]/50 bg-[#25d366]/5' : 'border-white/8'
                  }`}
              >
                {isCurrent && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-wider font-bold bg-[#25d366] text-black px-3 py-1 rounded-full">
                    Tu Plan Actual
                  </span>
                )}
                <div className="mb-6">
                  <p className="text-gray-400 text-sm mb-1">{plan.name}</p>
                  <div className="flex items-end gap-1">
                    <span className="text-4xl font-black text-white">${plan.price}</span>
                    <span className="text-gray-400 text-sm mb-1.5">/mes</span>
                  </div>
                </div>
                <ul className="space-y-3">
                  <li className="flex items-center gap-3 text-sm text-gray-300">
                    <CheckIcon />
                    Hasta {plan.features.maxBots} Bot{plan.features.maxBots > 1 ? 's' : ''}
                  </li>
                  <li className="flex items-center gap-3 text-sm text-gray-300">
                    {plan.features.audioTranscription ? <CheckIcon /> : <CrossIcon />}
                    Transcripción de Audios
                  </li>
                  <li className="flex items-center gap-3 text-sm text-gray-300">
                    {plan.features.whatsappTemplates ? <CheckIcon /> : <CrossIcon />}
                    Campañas (Broadcasts)
                  </li>
                  <li className="flex items-center gap-3 text-sm text-gray-300">
                    {plan.features.apiAccess ? <CheckIcon /> : <CrossIcon />}
                    Acceso a API externa
                  </li>
                </ul>
              </div>
            )
          })}
        </div>

        <div className="mt-6 px-5 py-4 bg-white/3 border border-white/8 rounded-xl">
          <p className="text-sm text-gray-400 text-center">
            💡 El pago de suscripción se coordina directamente con el administrador. Una vez procesado, el administrador activará tu nuevo plan desde el panel.
          </p>
        </div>
      </div>

      {/* Request Modal */}
      {showRequestModal && (
        <SubscriptionRequestModal
          currentPlanId={currentPlan?.id || 'basic'}
          user={user}
          plans={plans}
          isTrial={sub?.isTrial}
          onClose={() => setShowRequestModal(false)}
          onSuccess={fetchData}
        />
      )}
    </div>
  );
};

export default SubscriptionView;
