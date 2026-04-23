import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// ── Types ──────────────────────────────────────────────────────────────────────

interface BotSub {
  botId: string;
  nombre?: string;
  status: 'active' | 'pending_approval' | 'expired' | 'rejected' | null;
  plan?: 'monthly' | 'annual';
  amount?: number;
  expiresAt?: number;
  requestedAt?: number;
  isActive?: boolean;
}

interface BillingData {
  trial: { active: boolean; daysLeft: number; endsAt: number };
  subscriptions: BotSub[];
}

interface UserBot {
  botId: string;
  nombre: string;
  status: string;
}


// ── Icons ─────────────────────────────────────────────────────────────────────

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4 shrink-0 text-[#25d366]">
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
  </svg>
);

const BotIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21M6.75 19.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25zm3.75-9.75h.008v.008H10.5V9.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm3.375 0h.008v.008H13.5V9.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
  </svg>
);

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(ts?: number | null) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

function daysLeft(ts?: number | null) {
  if (!ts) return 0;
  return Math.max(0, Math.ceil((ts - Date.now()) / (1000 * 60 * 60 * 24)));
}

function statusBadge(sub: BotSub | undefined, trialActive: boolean) {
  if (!sub) {
    return trialActive
      ? { label: 'En Prueba', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/20' }
      : { label: 'Sin suscripción', cls: 'bg-red-500/15 text-red-400 border-red-500/20' };
  }
  if (sub.status === 'active' && sub.isActive) {
    return { label: 'Activa', cls: 'bg-[#25d366]/15 text-[#25d366] border-[#25d366]/20' };
  }
  if (sub.status === 'pending_approval') {
    return { label: 'Pendiente', cls: 'bg-blue-500/15 text-blue-400 border-blue-500/20' };
  }
  if (sub.status === 'rejected') {
    return { label: 'Rechazada', cls: 'bg-red-500/15 text-red-400 border-red-500/20' };
  }
  return { label: 'Expirada', cls: 'bg-gray-500/15 text-gray-400 border-gray-500/20' };
}

// ── Request Modal ─────────────────────────────────────────────────────────────

function RequestModal({
  bot,
  onClose,
  onSuccess,
  token,
  plans,
}: {
  bot: UserBot;
  onClose: () => void;
  onSuccess: () => void;
  token: string;
  plans: any[];
}) {
  const [selectedPlan, setSelectedPlan] = useState<string>(plans[0]?.name?.toLowerCase() || 'basic');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setLoading(true);
    setError('');
    try {
      const r = await fetch(`/api/saas/billing/bots/${bot.botId}/request`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: selectedPlan }),
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-[#12121a] border border-white/10 rounded-2xl p-6 w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-white">Solicitar Suscripción</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors p-1 cursor-pointer">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="mb-4 px-4 py-3 bg-white/5 rounded-xl border border-white/8 flex items-center gap-3">
          <div className="w-8 h-8 bg-[#25d366]/15 rounded-lg flex items-center justify-center text-[#25d366]">
            <BotIcon />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">{bot.nombre}</p>
            <p className="text-xs text-gray-500 font-mono">{bot.botId}</p>
          </div>
        </div>

        <p className="text-sm text-gray-400 mb-5">
          Selecciona el plan que deseas. El administrador revisará tu solicitud y te notificará para coordinar el pago.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
          {plans.map((plan) => {
            const key = plan.name.toLowerCase();
            return (
              <button
                key={key}
                onClick={() => setSelectedPlan(key)}
                className={`relative p-4 rounded-xl border text-left transition-all duration-200 cursor-pointer ${selectedPlan === key
                    ? 'border-[#25d366]/50 bg-[#25d366]/8'
                    : 'border-white/8 bg-white/3 hover:border-white/15'
                  }`}
              >
                {plan.popular && (
                  <span className="absolute -top-2 right-3 text-[10px] font-bold bg-[#25d366] text-black px-2 py-0.5 rounded-full">
                    Popular
                  </span>
                )}
                <p className="font-bold text-white text-base mb-0.5">{plan.price}<span className="text-sm font-normal text-gray-400">/mes</span></p>
                <p className="text-xs text-gray-400">{plan.name}</p>
              </button>
            );
          })}
        </div>

        {error && <p className="text-sm text-red-400 mb-4 px-3 py-2 bg-red-500/10 rounded-lg border border-red-500/20">{error}</p>}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl border border-white/10 text-gray-400 hover:text-white hover:bg-white/5 transition-colors text-sm font-medium cursor-pointer"
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl bg-[#25d366] hover:bg-[#20c55d] text-black font-bold text-sm transition-colors cursor-pointer disabled:opacity-60"
          >
            {loading ? 'Enviando…' : 'Enviar Solicitud'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

const SubscriptionView: React.FC = () => {
  const { user } = useAuth(); //dbUser, isAdmin
  const navigate = useNavigate();
  const [billing, setBilling] = useState<BillingData | null>(null);
  const [bots, setBots] = useState<UserBot[]>([]);
  const [loading, setLoading] = useState(true);
  const [requestBot, setRequestBot] = useState<UserBot | null>(null);
  const [plans, setPlans] = useState<any[]>([]);

  const fetchData = useCallback(async () => {
    try {
      const token = await user?.getIdToken();
      if (!token) return;

      const [billingRes, botsRes, plansRes] = await Promise.all([
        fetch('/api/saas/billing/me', { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch('/api/saas/bots?onlyMine=true', { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch('/api/plans'),
      ]);

      const billingData = await billingRes.json();
      const botsData = await botsRes.json();
      const plansData = await plansRes.json();

      if (billingData.ok) setBilling(billingData);
      if (botsData.ok) setBots(botsData.data);
      if (plansData.ok && plansData.plans && plansData.plans.length > 0) setPlans(plansData.plans);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-[#25d366] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const trial = billing?.trial;
  const subscriptions = billing?.subscriptions ?? [];

  // Map botId → subscription info
  const subByBot: Record<string, BotSub> = {};
  subscriptions.forEach((s) => { subByBot[s.botId] = s; });

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">Suscripción</h1>
        <p className="text-gray-400 text-sm">Gestiona los planes de activación de tus bots.</p>
      </div>

      {/* Trial Banner */}
      {trial && (
        <div className={`rounded-2xl border p-5 flex items-start gap-4 ${trial.active
            ? 'bg-amber-500/8 border-amber-500/20'
            : 'bg-red-500/8 border-red-500/20'
          }`}>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${trial.active ? 'bg-amber-500/15 text-amber-400' : 'bg-red-500/15 text-red-400'
            }`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            {trial.active ? (
              <>
                <p className="font-bold text-amber-300 text-sm mb-1">
                  Período de prueba — {trial.daysLeft} día{trial.daysLeft !== 1 ? 's' : ''} restante{trial.daysLeft !== 1 ? 's' : ''}
                </p>
                <p className="text-amber-400/70 text-xs">
                  Tu período de prueba gratuita vence el {formatDate(trial.endsAt)}. Suscribe tus bots antes de que expire para seguir operando sin interrupciones.
                </p>
              </>
            ) : (
              <>
                <p className="font-bold text-red-300 text-sm mb-1">Período de prueba finalizado</p>
                <p className="text-red-400/70 text-xs">
                  Tu prueba gratuita venció el {formatDate(trial.endsAt)}. Activa una suscripción para volver a operar tus bots.
                </p>
              </>
            )}
          </div>
          {trial.active && (
            <div className="text-right shrink-0">
              <div className="text-3xl font-black text-amber-300 leading-none">{trial.daysLeft}</div>
              <div className="text-xs text-amber-500">días</div>
            </div>
          )}
        </div>
      )}

      {/* Bots + subscription status */}
      <div>
        <h2 className="text-base font-semibold text-white mb-4">Mis Bots</h2>
        {bots.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p className="mb-3 text-sm">No tienes bots creados.</p>
            <button
              onClick={() => navigate('/saas')}
              className="text-sm text-[#25d366] hover:underline cursor-pointer"
            >
              Ir al panel → crear tu primer bot
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {bots.map((bot) => {
              const sub = subByBot[bot.botId];
              const badge = statusBadge(sub, trial?.active ?? false);
              const canRequest = !sub || sub.status === 'rejected' || (sub.status !== 'pending_approval' && !sub.isActive);
              const isPending = sub?.status === 'pending_approval';
              const days = daysLeft(sub?.expiresAt);

              return (
                <div key={bot.botId} className="bg-[#12121a] border border-white/8 rounded-xl p-4 flex items-center gap-4">
                  <div className="w-10 h-10 bg-[#25d366]/10 rounded-xl flex items-center justify-center text-[#25d366] shrink-0">
                    <BotIcon />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <p className="font-semibold text-white text-sm">{bot.nombre}</p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 font-mono">{bot.botId}</p>
                    {sub?.isActive && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        Plan {sub.plan === 'monthly' ? 'Mensual' : 'Anual'} · vence {formatDate(sub.expiresAt)}
                        {days > 0 && <span className="text-[#25d366] ml-1">({days} días)</span>}
                      </p>
                    )}
                    {isPending && (
                      <p className="text-xs text-blue-400/80 mt-0.5">
                        Solicitud enviada el {formatDate(sub?.requestedAt)} · esperando aprobación del admin
                      </p>
                    )}
                  </div>

                  <div className="shrink-0">
                    {canRequest && !isPending && (
                      <button
                        onClick={() => setRequestBot(bot)}
                        className="text-xs font-semibold px-4 py-2 bg-[#25d366]/10 text-[#25d366] hover:bg-[#25d366]/20 rounded-lg border border-[#25d366]/20 transition-colors cursor-pointer"
                      >
                        Suscribir bot
                      </button>
                    )}
                    {isPending && (
                      <span className="text-xs text-blue-400 px-3 py-2 bg-blue-500/10 rounded-lg border border-blue-500/20">
                        Pendiente
                      </span>
                    )}
                    {sub?.isActive && (
                      <span className="text-xs text-[#25d366] px-3 py-2 bg-[#25d366]/10 rounded-lg border border-[#25d366]/20">
                        Activo
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Plans info */}
      <div>
        <h2 className="text-base font-semibold text-white mb-4">Planes disponibles</h2>
        <div className="grid md:grid-cols-3 gap-4">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative bg-[#12121a] border rounded-2xl p-6 ${plan.popular ? 'border-[#25d366]/30' : 'border-white/8'
                }`}
            >
              {plan.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-bold bg-[#25d366] text-black px-3 py-1 rounded-full">
                  Popular
                </span>
              )}
              <div className="mb-4">
                <p className="text-gray-400 text-sm mb-1">{plan.name}</p>
                <div className="flex items-end gap-1">
                  <span className="text-4xl font-black text-white">{plan.price}</span>
                  <span className="text-gray-400 text-sm mb-1.5">/mes</span>
                </div>
                <p className="text-gray-500 text-xs mt-2">{plan.description}</p>
              </div>
              <ul className="space-y-2">
                {plan.features.map((f: string) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-gray-300">
                    <CheckIcon />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-4 px-4 py-3 bg-white/3 border border-white/8 rounded-xl">
          <p className="text-xs text-gray-500 text-center">
            💡 El pago se coordina directamente con el administrador vía WhatsApp o transferencia. Una vez confirmado, el admin activa tu bot desde el panel.
          </p>
        </div>
      </div>

      {/* Request Modal */}
      {requestBot && (
        <TokenInjector bot={requestBot} user={user} plans={plans} onClose={() => setRequestBot(null)} onSuccess={fetchData} />
      )}
    </div>
  );
};

// Workaround: get the token async and pass it to the modal
function TokenInjector({ bot, user, plans, onClose, onSuccess }: {
  bot: UserBot;
  user: any;
  plans: any[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    user?.getIdToken().then(setToken);
  }, [user]);

  if (!token) return null;

  return <RequestModal bot={bot} token={token} plans={plans} onClose={onClose} onSuccess={onSuccess} />;
}

export default SubscriptionView;
