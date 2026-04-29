import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import LoadingScreen from '../components/LoadingScreen';
import { collection, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, getAppStorage } from '../firebase';

// ── Types ──────────────────────────────────────────────────────────────────────

interface PlanFeatures {
  audioTranscription: boolean;
  apiAccess: boolean;
  whatsappTemplates: boolean;
  maxBots: number;
}

interface PricingPlan {
  id: string;
  name: string;
  price: number;
  features: PlanFeatures;
}

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

// ── Request Modal ─────────────────────────────────────────────────────────────

function RequestModal({
  currentPlanId,
  onClose,
  onSuccess,
  token,
  plans,
}: {
  currentPlanId: string;
  onClose: () => void;
  onSuccess: () => void;
  token: string;
  plans: PricingPlan[];
}) {
  const [step, setStep] = useState(1);
  const [selectedPlan, setSelectedPlan] = useState<string>(currentPlanId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [banks, setBanks] = useState<any[]>([]);
  const [referenceNumber, setReferenceNumber] = useState('');
  const [receiptUrl, setReceiptUrl] = useState('');
  const [uploadingFile, setUploadingFile] = useState(false);

  useEffect(() => {
    fetch('/api/saas/billing/banks', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (d.ok) setBanks(d.banks) });
  }, [token]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingFile(true);
    setError('');
    try {
      const storage = getAppStorage();
      if (!storage) throw new Error('Storage no inicializado');

      const fileExt = file.name.split('.').pop();
      const fileName = `whaibot/receipts/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const storageRef = ref(storage, fileName);

      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      setReceiptUrl(url);
    } catch (e: any) {
      setError('Error al subir el comprobante: ' + e.message);
    } finally {
      setUploadingFile(false);
    }
  };

  const submit = async () => {
    if (!referenceNumber || !receiptUrl) {
      setError('Por favor, ingresa el número de referencia y sube el comprobante.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const r = await fetch(`/api/saas/billing/request`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: selectedPlan, referenceNumber, receiptUrl }),
      });
      const d = await r.json();
      if (d.ok) {
        onSuccess();
        onClose();
      } else {
        setError(d.error || 'Error al enviar la solicitud');
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const getPlanLevel = (pid: string) => pid === 'basic' ? 1 : pid === 'pro' ? 2 : pid === 'premium' ? 3 : 0;
  const currentLevel = getPlanLevel(currentPlanId);
  const availablePlans = plans.filter(p => p.id !== 'basic' && getPlanLevel(p.id) >= currentLevel);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-[#12121a] border border-white/10 rounded-2xl p-6 w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-white">Mejorar mi Plan - {step === 1 ? 'Paso 1' : 'Paso 2'}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors p-1 cursor-pointer">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {step === 1 ? (
          <>
            <p className="text-sm text-gray-400 mb-5">Selecciona el plan al que deseas mejorar o renovar.</p>
            <div className="grid grid-cols-2 gap-3 mb-5">
              {availablePlans.map((plan) => (
                <button
                  key={plan.id}
                  onClick={() => setSelectedPlan(plan.id)}
                  className={`relative p-4 rounded-xl border text-left transition-all duration-200 cursor-pointer ${selectedPlan === plan.id ? 'border-[#25d366]/50 bg-[#25d366]/8' : 'border-white/8 bg-white/3 hover:border-white/15'
                    }`}
                >
                  <p className="font-bold text-white text-base mb-0.5">${plan.price}<span className="text-sm font-normal text-gray-400">/mes</span></p>
                  <p className="text-xs text-gray-400">{plan.name}</p>
                </button>
              ))}
            </div>
            {error && <p className="text-sm text-red-400 mb-4">{error}</p>}
            <div className="flex justify-end gap-3">
              <button onClick={onClose} className="px-5 py-2.5 rounded-xl border border-white/10 text-gray-400 hover:text-white transition-colors text-sm font-medium">Cancelar</button>
              <button onClick={() => setStep(2)} disabled={selectedPlan === currentPlanId && currentLevel > 1 ? false : (selectedPlan === currentPlanId || selectedPlan === 'basic')} className="px-5 py-2.5 rounded-xl bg-[#25d366] text-black font-bold text-sm transition-colors disabled:opacity-50">Siguiente</button>
            </div>
          </>
        ) : (
          <>
            <div className="mb-5 p-4 bg-white/5 border border-white/10 rounded-xl space-y-3 max-h-48 overflow-y-auto">
              <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-2">Cuentas Disponibles para Transferencia</p>
              {banks.length === 0 && <p className="text-sm text-gray-500">No hay cuentas bancarias configuradas.</p>}
              {banks.map(b => (
                <div key={b.id} className="text-sm text-gray-300 bg-black/20 p-3 rounded-lg border border-white/5">
                  <div className="font-bold text-white">{b.bankName} - {b.country}</div>
                  <div>Titular: {b.accountHolder}</div>
                  <div className="font-mono text-[#25d366]">{b.accountNumber} <span className="text-xs text-gray-500">({b.accountType})</span></div>
                </div>
              ))}
            </div>

            <div className="space-y-4 mb-5">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Número de Referencia de la Transferencia</label>
                <input value={referenceNumber} onChange={e => setReferenceNumber(e.target.value)} className="w-full bg-[#1a1a26] border border-white/10 rounded-xl px-4 py-2 text-white outline-none focus:border-[#25d366]" placeholder="Ej: 000123456" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Comprobante (Imagen o PDF)</label>
                <div className="relative">
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={handleFileUpload}
                    disabled={uploadingFile}
                    className="w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-[#25d366]/10 file:text-[#25d366] hover:file:bg-[#25d366]/20 cursor-pointer disabled:opacity-50"
                  />
                  {uploadingFile && (
                    <div className="absolute right-3 top-2 flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-[#25d366] border-t-transparent rounded-full animate-spin" />
                      <span className="text-[10px] text-[#25d366] font-bold">Subiendo...</span>
                    </div>
                  )}
                  {receiptUrl && !uploadingFile && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-[#25d366] font-medium bg-[#25d366]/5 p-2 rounded-lg border border-[#25d366]/10">
                      <CheckIcon /> Comprobante cargado correctamente
                    </div>
                  )}
                </div>
              </div>
            </div>

            {error && <p className="text-sm text-red-400 mb-4 px-3 py-2 bg-red-500/10 rounded-lg border border-red-500/20">{error}</p>}

            <div className="flex gap-3">
              <button onClick={() => setStep(1)} disabled={loading} className="flex-1 py-2.5 rounded-xl border border-white/10 text-gray-400 hover:text-white transition-colors text-sm font-medium">Atrás</button>
              <button onClick={submit} disabled={loading || !referenceNumber || !receiptUrl || uploadingFile} className="flex-1 py-2.5 rounded-xl bg-[#25d366] text-black font-bold text-sm transition-colors disabled:opacity-60">
                {loading ? 'Enviando…' : 'Enviar Comprobante'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
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
        <TokenInjector
          currentPlanId={currentPlan?.id || 'basic'}
          user={user}
          plans={plans}
          onClose={() => setShowRequestModal(false)}
          onSuccess={fetchData}
        />
      )}
    </div>
  );
};

// Workaround: get the token async and pass it to the modal
function TokenInjector({ currentPlanId, user, plans, onClose, onSuccess }: {
  currentPlanId: string;
  user: any;
  plans: PricingPlan[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    user?.getIdToken().then(setToken);
  }, [user]);

  if (!token) return null;

  return <RequestModal currentPlanId={currentPlanId} token={token} plans={plans} onClose={onClose} onSuccess={onSuccess} />;
}

export default SubscriptionView;
