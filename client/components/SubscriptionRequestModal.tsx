import React, { useState, useEffect } from 'react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getAppStorage } from '../firebase';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface PlanFeatures {
  audioTranscription: boolean;
  apiAccess: boolean;
  whatsappTemplates: boolean;
  maxBots: number;
}

export interface PricingPlan {
  id: string;
  name: string;
  price: number;
  features: PlanFeatures;
}

// ── Icons ─────────────────────────────────────────────────────────────────────

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4 shrink-0 text-[#25d366]">
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
  </svg>
);

// ── Request Modal ─────────────────────────────────────────────────────────────

export function RequestModal({
  currentPlanId,
  onClose,
  onSuccess,
  token,
  plans,
  isTrial,
  forcePlanId,
}: {
  currentPlanId: string;
  onClose: () => void;
  onSuccess: () => void;
  token: string;
  plans: PricingPlan[];
  isTrial?: boolean;
  forcePlanId?: string;
}) {
  const [step, setStep] = useState(forcePlanId ? 2 : 1);
  const [selectedPlan, setSelectedPlan] = useState<string>(forcePlanId || currentPlanId);
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
  
  // If forcePlanId is set, only that plan is available
  const availablePlans = forcePlanId 
    ? plans.filter(p => p.id === forcePlanId)
    : plans.filter(p => getPlanLevel(p.id) >= currentLevel);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-[#12121a] border border-white/10 rounded-2xl p-6 w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-white">
            {forcePlanId ? `Renovar Plan ${availablePlans[0]?.name || ''}` : `Mejorar mi Plan - ${step === 1 ? 'Paso 1' : 'Paso 2'}`}
          </h3>
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
              <button onClick={() => setStep(2)} disabled={selectedPlan === currentPlanId && !isTrial && selectedPlan === 'basic'} className="px-5 py-2.5 rounded-xl bg-[#25d366] text-black font-bold text-sm transition-colors disabled:opacity-50">Siguiente</button>
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
              {!forcePlanId && (
                <button onClick={() => setStep(1)} disabled={loading} className="flex-1 py-2.5 rounded-xl border border-white/10 text-gray-400 hover:text-white transition-colors text-sm font-medium">Atrás</button>
              )}
              <button onClick={submit} disabled={loading || !referenceNumber || !receiptUrl || uploadingFile} className="flex-1 py-2.5 rounded-xl bg-[#25d366] text-black font-bold text-sm transition-colors disabled:opacity-60">
                {loading ? 'Enviando…' : 'Enviar Comprobante'}
              </button>
              {forcePlanId && (
                <button onClick={onClose} disabled={loading} className="flex-1 py-2.5 rounded-xl border border-white/10 text-gray-400 hover:text-white transition-colors text-sm font-medium">Cancelar</button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function SubscriptionRequestModal({ currentPlanId, user, plans, isTrial, onClose, onSuccess, forcePlanId }: {
  currentPlanId: string;
  user: any;
  plans: PricingPlan[];
  isTrial?: boolean;
  onClose: () => void;
  onSuccess: () => void;
  forcePlanId?: string;
}) {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    user?.getIdToken().then(setToken);
  }, [user]);

  if (!token) return null;

  return (
    <RequestModal 
      currentPlanId={currentPlanId} 
      token={token} 
      plans={plans} 
      isTrial={isTrial} 
      onClose={onClose} 
      onSuccess={onSuccess} 
      forcePlanId={forcePlanId}
    />
  );
}
