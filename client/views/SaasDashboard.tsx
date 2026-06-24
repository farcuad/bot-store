import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGlassAlert } from 'glass-alert-animation';
import { useAuth } from '../context/AuthContext';
import LoadingScreen from '../components/LoadingScreen';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { SubscriptionRequestModal } from '../components/SubscriptionRequestModal';
import type { PricingPlan } from '../components/SubscriptionRequestModal';

interface Bot {
  botId: string;
  nombre: string;
  status: string;
  readySince?: number;
  lastError?: string;
  hasSession?: boolean;
}

const SaasDashboard: React.FC = () => {
  const { user, dbUser, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { fire } = useGlassAlert();
  const maxBots: number = isAdmin ? Infinity : (dbUser?.maxBots ?? 1);
  const [bots, setBots] = useState<Bot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newBotName, setNewBotName] = useState('');
  const [newBotTimezone, setNewBotTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Caracas');

  const [billingData, setBillingData] = useState<any>(null);
  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [showRequestModal, setShowRequestModal] = useState(false);

  const [qrModalBot, setQrModalBot] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrStatus, setQrStatus] = useState<string>('');

  // Audio settings modal
  const [audioModalBot, setAudioModalBot] = useState<string | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [audioApiKey, setAudioApiKey] = useState('');
  const [audioHasKey, setAudioHasKey] = useState(false);
  const [audioSaving, setAudioSaving] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioMessage, setAudioMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);

  const fetchPlans = useCallback(async () => {
    try {
      const snap = await getDocs(collection(db, 'plans'));
      const plansList = snap.docs.map(d => ({ id: d.id, ...d.data() } as PricingPlan));
      plansList.sort((a, b) => a.price - b.price);
      setPlans(plansList);
    } catch (e) {
      console.error('Error fetching plans:', e);
    }
  }, []);

  const fetchBots = async () => {
    try {
      const token = await user?.getIdToken();
      if (!token) return;

      const [res, billingRes] = await Promise.all([
        fetch('/api/saas/bots?onlyMine=true', {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch('/api/saas/billing/me', {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ]);
      const data = await res.json();
      const bData = await billingRes.json();

      if (data.ok) {
        setBots(data.data);
      } else {
        setError(data.error || 'Error fetching bots');
      }

      if (bData.ok) {
        setBillingData(bData);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBots();
    fetchPlans();
    const interval = setInterval(fetchBots, 10000);
    return () => clearInterval(interval);
  }, [user, fetchPlans]);

  // Handle QR polling
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (qrModalBot) {
      const fetchQr = async () => {
        try {
          const token = await user?.getIdToken();
          const res = await fetch(`/api/saas/bots/${qrModalBot}/qr`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const data = await res.json();
          if (data.ok && data.qr) {
            setQrCode(data.qr);
            setQrStatus('');
          } else if (data.status) {
            setQrCode(null);

            // En lugar de una alerta, simplemente mostramos el estado de forma amigable
            if (data.status === 'authenticated') {
              setQrStatus('Iniciando sesión... Sincronizando tus chats de WhatsApp, esto puede tomar un minuto...');
            } else {
              setQrStatus(`Estado: ${data.status}`);
            }

            if (data.status === 'ready') {
              setQrModalBot(null);
              fetchBots();
              fire({
                title: 'Bot iniciado',
                text: '¡Bot listo y operativo!',
                icon: 'success'
              });
            }
          }
        } catch (e) {
          console.error(e);
        }
      };
      fetchQr();
      interval = setInterval(fetchQr, 3000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [qrModalBot, user]);

  // Load audio settings when modal opens
  useEffect(() => {
    if (!audioModalBot) return;
    const loadAudioSettings = async () => {
      setAudioLoading(true);
      setAudioMessage(null);
      setAudioApiKey('');
      setShowApiKey(false);
      try {
        const token = await user?.getIdToken();
        const res = await fetch(`/api/saas/bots/${audioModalBot}/audio-settings`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.ok) {
          setAudioEnabled(data.data.audioAnalysisEnabled);
          setAudioHasKey(data.data.hasKey);
          setAudioApiKey(''); // Don't prefill the key field
        }
      } catch (e) {
        console.error(e);
      } finally {
        setAudioLoading(false);
      }
    };
    loadAudioSettings();
  }, [audioModalBot, user]);

  const handleSaveAudioSettings = async () => {
    if (!audioModalBot) return;
    setAudioSaving(true);
    setAudioMessage(null);
    try {
      const token = await user?.getIdToken();
      const body: Record<string, any> = { audioAnalysisEnabled: audioEnabled };
      // Only send the key if user typed a new one
      if (audioApiKey.trim()) {
        body.openaiApiKey = audioApiKey.trim();
      }
      const res = await fetch(`/api/saas/bots/${audioModalBot}/audio-settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.ok) {
        setAudioMessage({ type: 'success', text: '✅ Configuración guardada correctamente.' });
        if (audioApiKey.trim()) {
          setAudioHasKey(true);
          setAudioApiKey('');
        }
      } else {
        setAudioMessage({ type: 'error', text: data.error || 'Error al guardar.' });
      }
    } catch (e: any) {
      setAudioMessage({ type: 'error', text: e.message });
    } finally {
      setAudioSaving(false);
    }
  };

  const handleCreateBot = async () => {
    if (!newBotName) return;
    try {
      const token = await user?.getIdToken();
      const res = await fetch('/api/saas/bots', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ nombre: newBotName, timezone: newBotTimezone })
      });
      const data = await res.json();
      if (data.ok) {
        setIsCreateModalOpen(false);
        setNewBotName('');
        setNewBotTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Caracas');
        fetchBots();
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
    }
  };

  const botAction = async (botId: string, action: 'start' | 'stop' | 'restart') => {
    try {
      const token = await user?.getIdToken();
      const res = await fetch(`/api/saas/bots/${botId}/${action}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!data.ok) {
        fire({
          title: 'Error',
          text: data.error,
          icon: 'error'
        });
      }
      fetchBots();
    } catch (e: any) {
      fire({
        title: 'Error',
        text: e.message,
        icon: 'error'
      });
    }
  };

  const deleteBot = async (botId: string) => {
    const result = await fire({
      title: '¿Seguro que quieres eliminar este bot?',
      text: 'Esta acción es irreversible y borrará la carpeta del bot.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    });
    if (!result.isConfirmed) return;

    try {
      const token = await user?.getIdToken();
      const res = await fetch(`/api/saas/bots/${botId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!data.ok) {
        fire({
          title: 'Error',
          text: data.error,
          icon: 'error'
        });
      }
      fetchBots();
    } catch (e: any) {
      fire({
        title: 'Error',
        text: e.message,
        icon: 'error'
      });
    }
  };

  const clearSession = async (botId: string) => {
    const result = await fire({
      title: '¿Limpiar la sesión WhatsApp?',
      text: 'Se detendrá el bot y se borrará la sesión de Chrome. Tendrás que escanear el QR para volver a vincularlo.\n\nLa configuración y base de conocimiento se conservan.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, limpiar sesión',
      cancelButtonText: 'Cancelar'
    });
    if (!result.isConfirmed) return;

    try {
      const token = await user?.getIdToken();
      const res = await fetch(`/api/saas/bots/${botId}/clear-session`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.ok) {
        fire({
          title: 'Éxito',
          text: '✅ Sesión limpiada. Inicia el bot para ver el nuevo QR.',
          icon: 'success'
        });
        fetchBots();
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
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ready': return <span className="px-2 py-1 bg-[#25d366]/20 text-[#25d366] text-xs font-bold rounded-full border border-[#25d366]/30">Activo</span>;
      case 'qr': return <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs font-bold rounded-full border border-blue-500/30">Esperando QR</span>;
      case 'initializing': return <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 text-xs font-bold rounded-full border border-yellow-500/30">Iniciando…</span>;
      case 'error': return <span className="px-2 py-1 bg-red-500/20 text-red-400 text-xs font-bold rounded-full border border-red-500/30">Error</span>;
      case 'disconnected': return <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 text-xs font-bold rounded-full border border-yellow-500/30">Desconectado</span>;
      case 'idle': return <span className="px-2 py-1 bg-gray-500/20 text-gray-400 text-xs font-bold rounded-full border border-gray-500/30">Pausado</span>;
      default: return <span className="px-2 py-1 bg-gray-500/20 text-gray-400 text-xs font-bold rounded-full border border-gray-500/30">{status}</span>;
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-linear-to-r from-white to-gray-400">Mis Bots</h1>
          <p className="text-gray-400 text-sm mt-1">
            {bots.length} / {isAdmin ? '∞' : maxBots} bots
            {!isAdmin && bots.length >= maxBots && (
              <span className="ml-2 text-yellow-400 font-medium">— límite alcanzado</span>
            )}
          </p>
        </div>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          disabled={!isAdmin && bots.length >= maxBots}
          title={!isAdmin && bots.length >= maxBots ? `Límite de ${maxBots} bot(s) alcanzado` : 'Crear nuevo bot'}
          className="bg-linear-to-r from-[#25d366] to-[#128c7e] hover:brightness-110 text-black font-bold py-2.5 px-5 rounded-xl transition-all shadow-lg shadow-[#25d366]/20 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:brightness-100"
        >
          <span>＋</span> Nuevo Bot
        </button>
      </div>

      {!isAdmin && billingData?.subscription && (() => {
        const expiresAt = billingData.subscription.expiresAt;
        const ms = expiresAt > 9999999999 ? expiresAt : expiresAt * 1000;
        const daysLeft = Math.max(0, Math.ceil((ms - Date.now()) / (1000 * 60 * 60 * 24)));
        const isExpired = daysLeft <= 0;

        return (
          <div
            onClick={() => !isExpired && navigate('/saas/subscription')}
            className={`mb-6 p-4 rounded-2xl border transition-all flex flex-col sm:flex-row items-center justify-between gap-4 ${isExpired
              ? 'bg-red-500/10 border-red-500/20 text-red-400'
              : billingData.subscription.isTrial
                ? 'bg-blue-500/10 border-blue-500/20 text-blue-400 cursor-pointer hover:brightness-110'
                : 'bg-[#25d366]/5 border-[#25d366]/10 text-gray-300 cursor-pointer hover:brightness-110'
              }`}
          >
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isExpired ? 'bg-red-500/20' : billingData.subscription.isTrial ? 'bg-blue-500/20' : 'bg-[#25d366]/20'
                }`}>
                {isExpired ? '⚠️' : billingData.subscription.isTrial ? '🎁' : '💎'}
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider opacity-60">
                  {isExpired ? 'Suscripción Vencida' : billingData.subscription.isTrial ? 'Periodo de Prueba Activo' : 'Suscripción Activa'}
                </p>
                <h4 className="text-sm font-bold text-white">
                  Plan {billingData.plan?.name} — {isExpired ? '¡Vencido!' : `${daysLeft} días restantes`}
                </h4>
              </div>
            </div>

            {isExpired ? (
              <button
                onClick={(e) => { e.stopPropagation(); setShowRequestModal(true); }}
                className="w-full sm:w-auto text-xs font-bold px-5 py-2.5 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors shadow-lg shadow-red-500/20"
              >
                Pagar plan actual (Basic)
              </button>
            ) : (
              <button className="w-full sm:w-auto text-xs font-bold px-3 py-1.5 bg-white/5 rounded-lg border border-white/5 hover:bg-white/10 transition-colors">
                Gestionar
              </button>
            )}
          </div>
        );
      })()}

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl mb-6 flex items-center gap-3">
          <span>⚠️</span> {error}
        </div>
      )}

      {loading ? (
        <LoadingScreen message="Cargando tus bots..." />
      ) : bots.length === 0 ? (
        <div className="bg-[#12121a] border border-white/5 rounded-2xl p-12 text-center text-gray-400">
          <div className="text-6xl mb-4">🤖</div>
          <h3 className="text-xl font-medium text-white mb-2">Aún no tienes bots</h3>
          <p className="mb-6 max-w-sm mx-auto">Crea tu primer bot de WhatsApp para empezar a automatizar tus respuestas.</p>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            disabled={!isAdmin && bots.length >= maxBots}
            className="bg-white/10 hover:bg-white/20 text-white font-medium py-2.5 px-6 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Crear mi primer bot
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
          {bots.map(bot => {
            // Check subscription status
            const subStatus = billingData?.subscription?.status;
            const expiresAt = billingData?.subscription?.expiresAt;
            const now = Math.floor(Date.now() / 1000);

            // Check if it can run
            const canRun = subStatus === "active" && (expiresAt > now);

            return (
              <div key={bot.botId} className="bg-[#12121a] border border-white/10 rounded-2xl p-6 hover:border-white/20 transition-all shadow-xl flex flex-col">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-white mb-1">{bot.nombre}</h3>
                    <p className="font-mono text-xs text-gray-500 mb-4">{bot.botId}</p>

                    {!isAdmin && !canRun && (
                      <div className="mb-4 text-xs font-semibold px-3 py-2 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg flex justify-between items-center">
                        <span>No tienes plan activo</span>
                        <button onClick={() => setShowRequestModal(true)} className="underline font-bold">Pagar Plan</button>
                      </div>
                    )}
                  </div>
                  {getStatusBadge(bot.status)}
                </div>

                <div className="text-sm text-gray-400 mt-auto mb-6">
                  {bot.readySince
                    ? <span className="text-[#25d366]">🟢 Activo desde {new Date(bot.readySince).toLocaleTimeString()}</span>
                    : bot.lastError
                      ? <span className="text-red-400">⚠️ {bot.lastError}</span>
                      : '⏳ Preparando sistema...'
                  }
                </div>

                <div className="flex flex-col gap-2 mt-auto pt-4 border-t border-white/5">
                  {/* Row 1: Gestionar, Status Action, Restart */}
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => navigate(`/bot/${bot.botId}`)}
                      className="bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1"
                      title="Gestionar base de datos y configuración"
                    >
                      <span>⚙️</span> <span className="hidden min-[450px]:inline">Gestionar</span>
                    </button>

                    {/* Middle Action Button */}
                    {(bot.status === 'qr' || bot.status === 'initializing') && !bot.hasSession ? (
                      <button onClick={() => setQrModalBot(bot.botId)} className="bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1">
                        <span>📱</span> <span className="hidden min-[450px]:inline">Vincular</span>
                      </button>
                    ) : bot.status === 'ready' ? (
                      <button onClick={() => botAction(bot.botId, 'stop')} className="bg-white/5 text-white hover:bg-white/10 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1">
                        <span>⏹</span> <span className="hidden min-[450px]:inline">Parar</span>
                      </button>
                    ) : (bot.status === 'idle' || bot.status === 'disconnected' || bot.status === 'error') ? (
                      <button
                        onClick={() => {
                          if (!bot.hasSession) {
                            botAction(bot.botId, 'start').then(() => setQrModalBot(bot.botId));
                          } else {
                            botAction(bot.botId, 'start');
                          }
                        }}
                        className="bg-[#25d366]/10 text-[#25d366] hover:bg-[#25d366]/20 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1"
                      >
                        <span>{bot.hasSession ? '▶' : '📱'}</span> <span className="hidden min-[450px]:inline">{bot.hasSession ? 'Iniciar' : 'Vincular'}</span>
                      </button>
                    ) : (
                      <div className="bg-white/5 opacity-50 py-2 rounded-lg text-xs flex items-center justify-center text-gray-500">
                        ---
                      </div>
                    )}

                    <button
                      onClick={() => botAction(bot.botId, 'restart')}
                      title="Reiniciar bot"
                      className="bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg flex items-center justify-center transition-colors py-2"
                    >
                      ↺
                    </button>
                  </div>

                  {/* Row 2: Audio, Clean, Delete */}
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => setAudioModalBot(bot.botId)}
                      title="Configurar análisis de audio"
                      className="bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 rounded-lg flex items-center justify-center transition-colors py-2 text-base"
                    >
                      🎙️
                    </button>
                    <button
                      onClick={() => clearSession(bot.botId)}
                      title="Limpiar sesión (re-escanear QR)"
                      className="bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 rounded-lg flex items-center justify-center transition-colors py-2 text-base"
                    >
                      🧹
                    </button>
                    <button
                      onClick={() => deleteBot(bot.botId)}
                      title="Eliminar bot"
                      className="bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg flex items-center justify-center transition-colors py-2"
                    >
                      🗑
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {/* Create Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#12121a] border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-xl font-bold mb-6">➕ Crear nuevo bot</h2>
            <div className="mb-6">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Nombre del bot</label>
              <input
                type="text"
                className="w-full bg-[#1a1a26] border border-white/5 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#25d366] focus:ring-1 focus:ring-[#25d366] transition-all"
                placeholder="Ej: Bot de Ventas"
                value={newBotName}
                onChange={(e) => setNewBotName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="mb-6">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Zona Horaria / País</label>
              <select
                className="w-full bg-[#1a1a26] border border-white/5 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#25d366] focus:ring-1 focus:ring-[#25d366] transition-all"
                value={newBotTimezone}
                onChange={(e) => setNewBotTimezone(e.target.value)}
              >
                <option value="America/Argentina/Buenos_Aires">Argentina (Buenos Aires)</option>
                <option value="America/La_Paz">Bolivia (La Paz)</option>
                <option value="America/Sao_Paulo">Brasil (São Paulo)</option>
                <option value="America/Santiago">Chile (Santiago)</option>
                <option value="America/Bogota">Colombia (Bogotá)</option>
                <option value="America/Costa_Rica">Costa Rica</option>
                <option value="America/Havana">Cuba (La Habana)</option>
                <option value="America/Guayaquil">Ecuador (Guayaquil)</option>
                <option value="America/El_Salvador">El Salvador</option>
                <option value="Europe/Madrid">España (Madrid)</option>
                <option value="America/Guatemala">Guatemala</option>
                <option value="America/Tegucigalpa">Honduras</option>
                <option value="America/Mexico_City">México (CDMX)</option>
                <option value="America/Managua">Nicaragua (Managua)</option>
                <option value="America/Panama">Panamá</option>
                <option value="America/Asuncion">Paraguay (Asunción)</option>
                <option value="America/Lima">Perú (Lima)</option>
                <option value="America/Puerto_Rico">Puerto Rico</option>
                <option value="America/Santo_Domingo">República Dominicana</option>
                <option value="America/Montevideo">Uruguay (Montevideo)</option>
                <option value="America/Caracas">Venezuela (Caracas)</option>
                <option value="America/New_York">Estados Unidos (New York)</option>
                <option value="America/Los_Angeles">Estados Unidos (Los Angeles)</option>
              </select>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="px-5 py-2.5 rounded-xl text-gray-400 hover:text-white hover:bg-white/5 transition-colors font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateBot}
                className="bg-[#25d366] hover:brightness-110 text-black px-5 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-[#25d366]/20"
              >
                Crear bot
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR Modal */}
      {qrModalBot && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#12121a] border border-white/10 rounded-2xl p-6 w-full max-w-sm text-center shadow-2xl">
            <h2 className="text-xl font-bold mb-2">📱 Vincular WhatsApp</h2>
            <p className="text-gray-400 text-sm mb-6">Abre WhatsApp → Dispositivos vinculados → Vincular dispositivo</p>

            <div className="bg-white p-4 rounded-xl mb-6 min-h-[200px] min-w-[200px] flex items-center justify-center">
              {qrCode ? (
                <img src={qrCode} alt="QR Code" className="w-[200px] h-[200px]" />
              ) : (
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 border-2 border-gray-200 border-t-black rounded-full animate-spin mb-3"></div>
                  <span className="text-black text-sm font-medium">
                    {qrStatus === 'Estado: authenticated'
                      ? '¡QR Escaneado! Iniciando sesión...'
                      : (qrStatus || 'Generando QR...')}
                  </span>
                </div>
              )}
            </div>

            <div className="flex justify-center">
              <button
                onClick={() => { setQrModalBot(null); setQrCode(null); setQrStatus(''); }}
                className="w-full bg-white/10 hover:bg-white/20 text-white px-5 py-2.5 rounded-xl font-bold transition-all"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Audio Settings Modal */}
      {audioModalBot && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#12121a] border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center text-xl">🎙️</div>
              <div>
                <h2 className="text-xl font-bold text-white">Análisis de Audio</h2>
                <p className="text-gray-500 text-xs">Transcripción con OpenAI Whisper</p>
              </div>
            </div>

            {audioLoading ? (
              <div className="text-center py-8 text-gray-500">
                <div className="animate-spin text-2xl mb-2">⚙️</div>
                <p className="text-sm">Cargando configuración...</p>
              </div>
            ) : (
              <>
                {/* Toggle */}
                <div className="flex items-center justify-between bg-[#1a1a26] border border-white/5 rounded-xl px-4 py-3 mb-4">
                  <div>
                    <p className="text-sm font-medium text-white">Activar análisis de audio</p>
                    <p className="text-xs text-gray-500 mt-0.5">El bot transcribirá los audios recibidos</p>
                  </div>
                  <button
                    onClick={() => setAudioEnabled(!audioEnabled)}
                    className={`relative w-12 h-7 rounded-full transition-colors duration-200 ${audioEnabled ? 'bg-purple-500' : 'bg-gray-700'
                      }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform duration-200 ${audioEnabled ? 'translate-x-5' : 'translate-x-0'
                        }`}
                    />
                  </button>
                </div>

                {/* API Key input */}
                <div className="mb-4">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    OpenAI API Key
                  </label>
                  <div className="relative">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      className="w-full bg-[#1a1a26] border border-white/5 rounded-xl px-4 py-3 pr-20 text-white text-sm font-mono focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all"
                      placeholder={audioHasKey ? '••••••••  (ya configurada)' : 'sk-...'}
                      value={audioApiKey}
                      onChange={(e) => setAudioApiKey(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
                    >
                      {showApiKey ? '🙈 Ocultar' : '👁 Ver'}
                    </button>
                  </div>
                  {audioHasKey && !audioApiKey && (
                    <p className="text-xs text-green-400/70 mt-1.5 flex items-center gap-1">
                      <span>✓</span> Ya hay una API Key guardada. Deja en blanco para mantenerla.
                    </p>
                  )}
                  <p className="text-xs text-gray-600 mt-1.5">
                    Obtén tu key en{' '}
                    <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" className="text-purple-400 hover:text-purple-300 underline">
                      platform.openai.com/api-keys
                    </a>
                  </p>
                </div>

                {/* Status message */}
                {audioMessage && (
                  <div className={`rounded-xl px-4 py-3 mb-4 text-sm ${audioMessage.type === 'success'
                    ? 'bg-green-500/10 border border-green-500/20 text-green-400'
                    : 'bg-red-500/10 border border-red-500/20 text-red-400'
                    }`}>
                    {audioMessage.text}
                  </div>
                )}

                {/* Info box */}
                <div className="bg-purple-500/5 border border-purple-500/10 rounded-xl px-4 py-3 mb-6">
                  <p className="text-xs text-purple-300/70 leading-relaxed">
                    <strong className="text-purple-300">ℹ️ Información:</strong> El bot usará tu API Key de OpenAI para transcribir audios con el modelo Whisper.
                    Se cobra por uso directamente en tu cuenta de OpenAI. Si la función está desactivada,
                    el bot responderá que el análisis de audio no está activo.
                  </p>
                </div>
              </>
            )}

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setAudioModalBot(null); setAudioMessage(null); }}
                className="px-5 py-2.5 rounded-xl text-gray-400 hover:text-white hover:bg-white/5 transition-colors font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveAudioSettings}
                disabled={audioSaving || audioLoading}
                className="bg-purple-500 hover:bg-purple-400 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-purple-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {audioSaving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Subscription Request Modal */}
      {showRequestModal && (
        <SubscriptionRequestModal
          currentPlanId={billingData?.subscription?.planId || 'basic'}
          user={user}
          plans={plans}
          isTrial={billingData?.subscription?.isTrial}
          forcePlanId="basic"
          onClose={() => setShowRequestModal(false)}
          onSuccess={() => {
            fetchBots();
            fire({
              title: 'Solicitud enviada',
              text: 'Tu comprobante ha sido enviado. El administrador activará tu plan pronto.',
              icon: 'success'
            });
          }}
        />
      )}
    </div>
  );
};

export default SaasDashboard;
