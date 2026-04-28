import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useGlassAlert } from 'glass-alert-animation';
import {
  FileText, Plus, Edit2, Trash2, Send, Clock, Users, Image, X,
  CheckSquare, Square, Calendar, RefreshCw, ChevronRight, Zap, Repeat, Upload
} from 'lucide-react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getAppStorage } from '../firebase';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Template {
  id: string;
  name: string;
  text: string;
  imageUrl?: string | null;
  createdAt?: any;
}

interface WaGroup {
  id: string;
  name: string;
  participantCount: number;
}

interface ContactSession {
  id: string;
  phone: string;
  contactName?: string;
}

interface BroadcastRecord {
  id: string;
  templateSnapshot: { text: string; imageUrl?: string };
  recipients: { contactIds: string[]; groupIds: string[] };
  schedule: Schedule;
  status: 'pending' | 'sending' | 'done' | 'error' | 'scheduled';
  createdAt?: any;
  lastRun?: any;
  nextRun?: any;
  errorMessage?: string;
}

type ScheduleType = 'now' | 'once' | 'weekly' | 'monthly';

interface Schedule {
  type: ScheduleType;
  datetime?: string;
  daysOfWeek?: number[];
  daysOfMonth?: number[];
  time?: string;
}

const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const API_URL = import.meta.env.VITE_API_URL || '';

// ── Helper ────────────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  const map: Record<string, string> = {
    pending:   'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    sending:   'bg-blue-500/10 text-blue-400 border-blue-500/20',
    scheduled: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    done:      'bg-[#25d366]/10 text-[#25d366] border-[#25d366]/20',
    error:     'bg-red-500/10 text-red-400 border-red-500/20',
  };
  const labels: Record<string, string> = {
    pending: 'Pendiente', sending: 'Enviando', scheduled: 'Programado', done: 'Enviado', error: 'Error'
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${map[status] || 'bg-gray-500/10 text-gray-400 border-gray-500/20'}`}>
      {labels[status] || status}
    </span>
  );
}

function scheduleLabel(s: Schedule): string {
  if (s.type === 'now') return 'Enviar ahora';
  if (s.type === 'once') return `Una vez: ${s.datetime ? new Date(s.datetime).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' }) : '—'}`;
  if (s.type === 'weekly') {
    const days = (s.daysOfWeek ?? []).map(d => DAY_LABELS[d]).join(', ');
    return `Semanal: ${days} a las ${s.time}`;
  }
  if (s.type === 'monthly') {
    const days = (s.daysOfMonth ?? []).join(', ');
    return `Mensual: días ${days} a las ${s.time}`;
  }
  return '—';
}

function parseDate(val: any): Date | null {
  if (!val) return null;
  if (typeof val === 'object' && '_seconds' in val) return new Date(val._seconds * 1000);
  if (typeof val === 'object' && 'seconds' in val) return new Date(val.seconds * 1000);
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

// ── Main Component ─────────────────────────────────────────────────────────────

interface Props {
  botNumber: string;
  getHeaders: () => Promise<Record<string, string>>;
  canUseTemplates?: boolean; // undefined = optimistic (show button); false = locked
}

type SendStep = 'recipients' | 'schedule';

export default function TemplatesTab({ botNumber, getHeaders, canUseTemplates = true }: Props) {
  const { fire } = useGlassAlert();

  // ── Templates state
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [tName, setTName] = useState('');
  const [tText, setTText] = useState('');
  const [tImageUrl, setTImageUrl] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [broadcasts, setBroadcasts] = useState<BroadcastRecord[]>([]);
  const [loadingBroadcasts, setLoadingBroadcasts] = useState(true);

  // ── Bot config state
  const [botTimezone, setBotTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [currentTimeStr, setCurrentTimeStr] = useState('');
  const [minDateTime, setMinDateTime] = useState('');

  // ── Send modal state
  const [sendModal, setSendModal] = useState<Template | null>(null);
  const [sendStep, setSendStep] = useState<SendStep>('recipients');
  const [recipientTab, setRecipientTab] = useState<'contacts' | 'groups'>('contacts');
  const [contacts, setContacts] = useState<ContactSession[]>([]);
  const [groups, setGroups] = useState<WaGroup[]>([]);
  const [loadingRecipients, setLoadingRecipients] = useState(false);
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [schedule, setSchedule] = useState<Schedule>({ type: 'now' });
  const [sending, setSending] = useState(false);
  const [groupsError, setGroupsError] = useState('');

  // ── Load data
  const loadTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    try {
      const headers = await getHeaders();
      const res = await axios.get(`${API_URL}/api/saas/bots/${botNumber}/templates`, { headers });
      if (res.data.ok) setTemplates(res.data.data);
    } finally {
      setLoadingTemplates(false);
    }
  }, [botNumber, getHeaders]);

  const loadBroadcasts = useCallback(async () => {
    setLoadingBroadcasts(true);
    try {
      const headers = await getHeaders();
      const res = await axios.get(`${API_URL}/api/saas/bots/${botNumber}/broadcasts`, { headers });
      if (res.data.ok) setBroadcasts(res.data.data);
    } finally {
      setLoadingBroadcasts(false);
    }
  }, [botNumber, getHeaders]);

  useEffect(() => {
    loadTemplates();
    loadBroadcasts();
    // Load timezone
    getHeaders().then(headers => {
      axios.get(`${API_URL}/api/saas/bots/${botNumber}`, { headers }).then(res => {
        if (res.data.ok && res.data.data.timezone) {
          setBotTimezone(res.data.data.timezone);
        }
      }).catch(console.error);
    });
  }, [loadTemplates, loadBroadcasts, botNumber, getHeaders]);

  // Update current time display for scheduling
  useEffect(() => {
    if (sendStep !== 'schedule') return;
    const updateTime = () => {
      const d = new Date();
      // Format display string
      const formatter = new Intl.DateTimeFormat('es-ES', { timeZone: botTimezone, dateStyle: 'long', timeStyle: 'short' });
      setCurrentTimeStr(formatter.format(d) + ` (${botTimezone})`);
      
      // Format min for inputs (YYYY-MM-DDTHH:mm)
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: botTimezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
      const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
      const hour = p.hour === '24' ? '00' : p.hour;
      setMinDateTime(`${p.year}-${p.month}-${p.day}T${hour}:${p.minute}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, [botTimezone, sendStep]);

  // ── Template CRUD
  const openCreate = () => {
    setEditingTemplate(null);
    setTName(''); setTText(''); setTImageUrl('');
    setShowEditor(true);
  };

  const openEdit = (t: Template) => {
    setEditingTemplate(t);
    setTName(t.name); setTText(t.text); setTImageUrl(t.imageUrl || '');
    setShowEditor(true);
  };

  const saveTemplate = async () => {
    if (!tName.trim() || !tText.trim()) return;
    setSavingTemplate(true);
    try {
      const headers = await getHeaders();
      const payload = { name: tName.trim(), text: tText.trim(), imageUrl: tImageUrl.trim() || null };
      if (editingTemplate) {
        await axios.put(`${API_URL}/api/saas/bots/${botNumber}/templates/${editingTemplate.id}`, payload, { headers });
      } else {
        await axios.post(`${API_URL}/api/saas/bots/${botNumber}/templates`, payload, { headers });
      }
      setShowEditor(false);
      loadTemplates();
    } catch (e: any) {
      fire({ title: 'Error', text: e.response?.data?.error || e.message, icon: 'error' });
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const storage = getAppStorage();
    if (!storage) {
      fire({ title: 'Error', text: 'Firebase Storage no inicializado.', icon: 'error' });
      return;
    }
    setUploadingImage(true);
    try {
      const ext = file.name.split('.').pop();
      const filename = `${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
      const fileRef = ref(storage, `whaibot/templates/${botNumber}/${filename}`);
      await uploadBytes(fileRef, file);
      const url = await getDownloadURL(fileRef);
      setTImageUrl(url);
    } catch (error: any) {
      fire({ title: 'Error', text: 'No se pudo subir la imagen: ' + error.message, icon: 'error' });
    } finally {
      setUploadingImage(false);
      e.target.value = '';
    }
  };

  const deleteTemplate = async (t: Template) => {
    const r = await fire({ title: `¿Eliminar "${t.name}"?`, text: 'Esta acción es irreversible.', icon: 'warning', showCancelButton: true, confirmButtonText: 'Eliminar', cancelButtonText: 'Cancelar' });
    if (!r.isConfirmed) return;
    try {
      const headers = await getHeaders();
      await axios.delete(`${API_URL}/api/saas/bots/${botNumber}/templates/${t.id}`, { headers });
      loadTemplates();
    } catch (e: any) {
      fire({ title: 'Error', text: e.message, icon: 'error' });
    }
  };

  // ── Open send modal
  const openSend = async (t: Template) => {
    setSendModal(t);
    setSendStep('recipients');
    setRecipientTab('contacts');
    setSelectedContacts(new Set());
    setSelectedGroups(new Set());
    setSchedule({ type: 'now' });
    setGroupsError('');
    setLoadingRecipients(true);
    try {
      const headers = await getHeaders();
      // Load contacts (sessions)
      const cRes = await axios.get(`${API_URL}/api/saas/bots/${botNumber}/sessions`, { headers });
      if (cRes.data.ok) {
        setContacts(cRes.data.data.map((s: any) => ({ id: s.id, phone: s.phone, contactName: s.contactName })));
      }
      // Load groups (may fail if bot is not ready)
      try {
        const gRes = await axios.get(`${API_URL}/api/saas/bots/${botNumber}/groups`, { headers });
        if (gRes.data.ok) setGroups(gRes.data.data);
      } catch (e: any) {
        setGroupsError(e.response?.data?.error || 'El bot debe estar activo para ver los grupos.');
        setGroups([]);
      }
    } catch (e: any) {
      fire({ title: 'Error', text: e.message, icon: 'error' });
      setSendModal(null);
    } finally {
      setLoadingRecipients(false);
    }
  };

  const closeSend = () => { setSendModal(null); setSending(false); };

  // ── Toggle selection helpers
  const toggleContact = (id: string) => setSelectedContacts(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleGroup = (id: string) => setSelectedGroups(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = <T,>(items: T[], getId: (i: T) => string, selected: Set<string>, setSelected: (s: Set<string>) => void) => {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map(getId)));
  };

  const totalSelected = selectedContacts.size + selectedGroups.size;

  // ── Send broadcast
  const sendBroadcast = async () => {
    if (!sendModal || totalSelected === 0) return;
    setSending(true);
    try {
      const headers = await getHeaders();
      const payload = {
        templateId: sendModal.id,
        templateSnapshot: { text: sendModal.text, imageUrl: sendModal.imageUrl || null },
        recipients: {
          contactIds: Array.from(selectedContacts),
          groupIds: Array.from(selectedGroups),
        },
        schedule,
      };
      const res = await axios.post(`${API_URL}/api/saas/bots/${botNumber}/broadcasts`, payload, { headers });
      if (res.data.ok) {
        closeSend();
        loadBroadcasts();
        fire({
          title: schedule.type === 'now' ? '✅ Enviando…' : '📅 Programado',
          text: schedule.type === 'now'
            ? `El mensaje se está enviando a ${totalSelected} destinatario(s).`
            : `Próximo envío: ${res.data.data?.nextRun ? new Date(res.data.data.nextRun).toLocaleString('es') : '—'}`,
          icon: 'success'
        });
      } else {
        fire({ title: 'Error', text: res.data.error, icon: 'error' });
      }
    } catch (e: any) {
      fire({ title: 'Error', text: e.response?.data?.error || e.message, icon: 'error' });
    } finally {
      setSending(false);
    }
  };

  // ── Delete broadcast
  const deleteBroadcast = async (b: BroadcastRecord) => {
    const r = await fire({ title: '¿Eliminar este envío?', icon: 'warning', showCancelButton: true, confirmButtonText: 'Eliminar', cancelButtonText: 'Cancelar' });
    if (!r.isConfirmed) return;
    try {
      const headers = await getHeaders();
      await axios.delete(`${API_URL}/api/saas/bots/${botNumber}/broadcasts/${b.id}`, { headers });
      loadBroadcasts();
    } catch (e: any) {
      fire({ title: 'Error', text: e.message, icon: 'error' });
    }
  };

  // ── Schedule helpers
  const toggleDayOfWeek = (d: number) => setSchedule(s => {
    const days = new Set(s.daysOfWeek ?? []);
    days.has(d) ? days.delete(d) : days.add(d);
    return { ...s, daysOfWeek: Array.from(days) };
  });
  const toggleDayOfMonth = (d: number) => setSchedule(s => {
    const days = new Set(s.daysOfMonth ?? []);
    days.has(d) ? days.delete(d) : days.add(d);
    return { ...s, daysOfMonth: Array.from(days) };
  });

  const canProceedToSchedule = totalSelected > 0;
  const canSend = (() => {
    if (!canProceedToSchedule) return false;
    if (schedule.type === 'now') return true;
    if (schedule.type === 'once') return !!schedule.datetime;
    if (schedule.type === 'weekly') return (schedule.daysOfWeek?.length ?? 0) > 0 && !!schedule.time;
    if (schedule.type === 'monthly') return (schedule.daysOfMonth?.length ?? 0) > 0 && !!schedule.time;
    return false;
  })();

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">

      {/* ── Templates Section ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <FileText className="h-5 w-5 text-[#25d366]" />
              Plantillas de Mensaje
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">Crea mensajes reutilizables para envíos masivos</p>
          </div>
          {canUseTemplates ? (
            <button
              onClick={openCreate}
              className="flex items-center gap-2 bg-[#25d366]/10 hover:bg-[#25d366]/20 text-[#25d366] border border-[#25d366]/20 px-3 py-2 rounded-xl text-sm font-medium transition-all"
            >
              <Plus className="h-4 w-4" /> Nueva plantilla
            </button>
          ) : (
            <div className="flex items-center gap-2 bg-gray-500/10 border border-gray-500/20 text-gray-500 px-3 py-2 rounded-xl text-sm font-medium cursor-not-allowed" title="Actualiza tu plan para crear plantillas">
              <Plus className="h-4 w-4" />
              <span>Nueva plantilla</span>
              <span className="text-[10px] bg-gray-500/20 px-1.5 py-0.5 rounded-full ml-1">Plan Pro+</span>
            </div>
          )}
        </div>

        {loadingTemplates ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#25d366]" />
          </div>
        ) : templates.length === 0 ? (
          <div className="bg-[#12121a] border border-white/5 border-dashed rounded-2xl p-10 text-center text-gray-500">
            <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No hay plantillas aún</p>
            {canUseTemplates ? (
              <>
                <p className="text-xs mt-1">Crea tu primera plantilla para empezar a enviar mensajes masivos</p>
                <button onClick={openCreate} className="mt-4 text-sm text-[#25d366] hover:underline">
                  Crear plantilla →
                </button>
              </>
            ) : (
              <p className="text-xs mt-1 text-amber-400/70">
                Tu plan actual (Basic) no incluye plantillas. <a href="/saas/subscription" className="underline hover:text-amber-400 font-bold">Actualiza al plan Pro o Premium →</a>
              </p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {templates.map(t => (
              <div key={t.id} className="bg-[#12121a] border border-white/5 rounded-2xl p-5 hover:border-white/10 transition-all flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-[#25d366]/10 flex items-center justify-center shrink-0">
                      {t.imageUrl ? <Image className="h-4 w-4 text-[#25d366]" /> : <FileText className="h-4 w-4 text-[#25d366]" />}
                    </div>
                    <span className="font-semibold text-white truncate">{t.name}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => openEdit(t)} className="p-1.5 text-gray-500 hover:text-indigo-400 hover:bg-indigo-400/10 rounded-lg transition-colors">
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => deleteTemplate(t)} className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Preview */}
                <div className="flex gap-3">
                  {t.imageUrl && (
                    <img src={t.imageUrl} alt="" className="w-16 h-16 rounded-xl object-cover shrink-0 bg-black/20" onError={e => (e.currentTarget.style.display = 'none')} />
                  )}
                  <p className="text-sm text-gray-400 whitespace-pre-wrap leading-relaxed line-clamp-3 flex-1">{t.text}</p>
                </div>

                <button
                  onClick={() => openSend(t)}
                  className="mt-auto flex items-center justify-center gap-2 w-full bg-[#25d366]/10 hover:bg-[#25d366]/20 text-[#25d366] border border-[#25d366]/20 py-2 rounded-xl text-sm font-medium transition-all"
                >
                  <Send className="h-4 w-4" /> Enviar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Broadcasts Section ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Clock className="h-5 w-5 text-indigo-400" />
              Envíos Programados
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">Historial y envíos recurrentes activos</p>
          </div>
          <button onClick={loadBroadcasts} className="p-2 text-gray-500 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
            <RefreshCw className={`h-4 w-4 ${loadingBroadcasts ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {loadingBroadcasts ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-400" />
          </div>
        ) : broadcasts.length === 0 ? (
          <div className="bg-[#12121a] border border-white/5 rounded-2xl p-8 text-center text-gray-500 text-sm">
            <Clock className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p>Aún no hay envíos. Usa el botón <strong className="text-gray-400">Enviar</strong> en una plantilla.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {broadcasts.map(b => (
              <div key={b.id} className="bg-[#12121a] border border-white/5 rounded-xl p-4 flex items-start justify-between gap-4 hover:border-white/10 transition-all">
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    {statusBadge(b.status)}
                    <span className="text-xs text-gray-500">{scheduleLabel(b.schedule)}</span>
                  </div>
                  <p className="text-sm text-gray-300 truncate">"{b.templateSnapshot?.text?.slice(0, 80)}{(b.templateSnapshot?.text?.length ?? 0) > 80 ? '…' : ''}"</p>
                  <div className="flex items-center gap-3 text-xs text-gray-600">
                    <span><Users className="h-3 w-3 inline mr-1" />{(b.recipients?.contactIds?.length ?? 0) + (b.recipients?.groupIds?.length ?? 0)} dest.</span>
                    {b.nextRun && parseDate(b.nextRun) && <span><Clock className="h-3 w-3 inline mr-1" />Próximo: {parseDate(b.nextRun)!.toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })}</span>}
                    {b.lastRun && parseDate(b.lastRun) && <span>Último: {parseDate(b.lastRun)!.toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })}</span>}
                  </div>
                  {b.errorMessage && <p className="text-xs text-red-400">{b.errorMessage}</p>}
                </div>
                <button onClick={() => deleteBroadcast(b)} className="p-2 text-gray-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors shrink-0">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Template Editor Modal ── */}
      {showEditor && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#12121a] border border-white/10 rounded-2xl p-6 w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-white">{editingTemplate ? 'Editar plantilla' : 'Nueva plantilla'}</h3>
              <button onClick={() => setShowEditor(false)} className="p-1.5 text-gray-500 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Nombre de la plantilla</label>
                <input
                  type="text"
                  value={tName}
                  onChange={e => setTName(e.target.value)}
                  placeholder="Ej: Promoción de verano"
                  className="w-full bg-black/30 border border-white/5 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#25d366] focus:ring-1 focus:ring-[#25d366] transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Mensaje</label>
                <textarea
                  value={tText}
                  onChange={e => setTText(e.target.value)}
                  placeholder="Escribe el mensaje que se enviará por WhatsApp…"
                  rows={5}
                  className="w-full bg-black/30 border border-white/5 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#25d366] focus:ring-1 focus:ring-[#25d366] transition-all resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">URL de imagen <span className="text-gray-600 normal-case font-normal">(opcional)</span></label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={tImageUrl}
                    onChange={e => setTImageUrl(e.target.value)}
                    placeholder="https://ejemplo.com/imagen.jpg o sube un archivo"
                    className="w-full bg-black/30 border border-white/5 rounded-xl px-4 py-3 text-white text-sm font-mono focus:outline-none focus:border-[#25d366] focus:ring-1 focus:ring-[#25d366] transition-all"
                  />
                  <label className="cursor-pointer shrink-0 bg-[#25d366]/10 text-[#25d366] px-4 py-3 rounded-xl flex items-center justify-center font-bold text-sm hover:bg-[#25d366]/20 transition-colors">
                    <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} disabled={uploadingImage} />
                    {uploadingImage ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  </label>
                </div>
                {tImageUrl && (
                  <div className="mt-2 rounded-xl overflow-hidden border border-white/5 max-h-40 flex items-center justify-center bg-black/20">
                    <img src={tImageUrl} alt="Preview" className="max-h-40 object-contain" onError={e => (e.currentTarget.src = '')} />
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3 mt-6 justify-end">
              <button onClick={() => setShowEditor(false)} className="px-5 py-2.5 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors font-medium text-sm">
                Cancelar
              </button>
              <button
                onClick={saveTemplate}
                disabled={!tName.trim() || !tText.trim() || savingTemplate}
                className="flex items-center gap-2 bg-[#25d366] hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold px-5 py-2.5 rounded-xl transition-all text-sm"
              >
                {savingTemplate ? <div className="h-4 w-4 border-2 border-black/30 border-t-black rounded-full animate-spin" /> : null}
                {editingTemplate ? 'Guardar cambios' : 'Crear plantilla'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Send Modal ── */}
      {sendModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#12121a] border border-white/10 rounded-2xl w-full max-w-xl shadow-2xl flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-white/5 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#25d366]/10 flex items-center justify-center">
                  <Send className="h-4 w-4 text-[#25d366]" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm">{sendModal.name}</h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <button
                      onClick={() => setSendStep('recipients')}
                      className={`text-xs transition-colors ${sendStep === 'recipients' ? 'text-[#25d366] font-semibold' : 'text-gray-600 hover:text-gray-400'}`}
                    >
                      1. Destinatarios
                    </button>
                    <ChevronRight className="h-3 w-3 text-gray-700" />
                    <button
                      onClick={() => canProceedToSchedule && setSendStep('schedule')}
                      className={`text-xs transition-colors ${sendStep === 'schedule' ? 'text-[#25d366] font-semibold' : 'text-gray-600 hover:text-gray-400'} ${!canProceedToSchedule ? 'opacity-40 cursor-not-allowed' : ''}`}
                    >
                      2. Programar
                    </button>
                  </div>
                </div>
              </div>
              <button onClick={closeSend} className="p-1.5 text-gray-500 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 min-h-0">

              {/* Step 1: Recipients */}
              {sendStep === 'recipients' && (
                <div className="space-y-4">
                  {/* Message preview */}
                  <div className="bg-[#1a1a28] border border-white/5 rounded-xl p-4 flex gap-3">
                    {sendModal.imageUrl && (
                      <img src={sendModal.imageUrl} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" onError={e => (e.currentTarget.style.display = 'none')} />
                    )}
                    <p className="text-sm text-gray-300 leading-relaxed line-clamp-3">{sendModal.text}</p>
                  </div>

                  {/* Recipient tabs */}
                  <div className="flex gap-1 bg-black/30 rounded-xl p-1">
                    {(['contacts', 'groups'] as const).map(tab => (
                      <button
                        key={tab}
                        onClick={() => setRecipientTab(tab)}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${recipientTab === tab ? 'bg-[#25d366]/10 text-[#25d366]' : 'text-gray-500 hover:text-white'}`}
                      >
                        {tab === 'contacts' ? <Users className="h-4 w-4" /> : <span className="text-base">👥</span>}
                        {tab === 'contacts' ? `Contactos (${contacts.length})` : `Grupos (${groups.length})`}
                      </button>
                    ))}
                  </div>

                  {loadingRecipients ? (
                    <div className="flex justify-center py-8">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#25d366]" />
                    </div>
                  ) : recipientTab === 'contacts' ? (
                    <div className="space-y-2">
                      {contacts.length === 0 ? (
                        <p className="text-center text-gray-600 text-sm py-6">No hay contactos con historial en este bot</p>
                      ) : (
                        <>
                          <button
                            onClick={() => toggleAll(contacts, c => c.id, selectedContacts, setSelectedContacts)}
                            className="flex items-center gap-2 text-xs text-gray-500 hover:text-white transition-colors"
                          >
                            {selectedContacts.size === contacts.length ? <CheckSquare className="h-4 w-4 text-[#25d366]" /> : <Square className="h-4 w-4" />}
                            {selectedContacts.size === contacts.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
                          </button>
                          <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1 scrollbar-thin">
                            {contacts.map(c => (
                              <button
                                key={c.id}
                                onClick={() => toggleContact(c.id)}
                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${selectedContacts.has(c.id) ? 'bg-[#25d366]/10 border border-[#25d366]/20' : 'bg-black/20 border border-white/0 hover:border-white/5'}`}
                              >
                                {selectedContacts.has(c.id) ? <CheckSquare className="h-4 w-4 text-[#25d366] shrink-0" /> : <Square className="h-4 w-4 text-gray-600 shrink-0" />}
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm text-white font-medium truncate">{c.contactName || 'Sin alias'}</div>
                                  <div className="text-xs text-gray-500 font-mono">+{c.phone}</div>
                                </div>
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {groupsError ? (
                        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 text-xs text-yellow-400">{groupsError}</div>
                      ) : groups.length === 0 ? (
                        <p className="text-center text-gray-600 text-sm py-6">No se encontraron grupos</p>
                      ) : (
                        <>
                          <button
                            onClick={() => toggleAll(groups, g => g.id, selectedGroups, setSelectedGroups)}
                            className="flex items-center gap-2 text-xs text-gray-500 hover:text-white transition-colors"
                          >
                            {selectedGroups.size === groups.length ? <CheckSquare className="h-4 w-4 text-[#25d366]" /> : <Square className="h-4 w-4" />}
                            {selectedGroups.size === groups.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
                          </button>
                          <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                            {groups.map(g => (
                              <button
                                key={g.id}
                                onClick={() => toggleGroup(g.id)}
                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${selectedGroups.has(g.id) ? 'bg-[#25d366]/10 border border-[#25d366]/20' : 'bg-black/20 border border-white/0 hover:border-white/5'}`}
                              >
                                {selectedGroups.has(g.id) ? <CheckSquare className="h-4 w-4 text-[#25d366] shrink-0" /> : <Square className="h-4 w-4 text-gray-600 shrink-0" />}
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm text-white font-medium truncate">{g.name}</div>
                                  <div className="text-xs text-gray-500">{g.participantCount} participantes</div>
                                </div>
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {totalSelected > 0 && (
                    <div className="bg-[#25d366]/5 border border-[#25d366]/15 rounded-xl px-4 py-2 text-xs text-[#25d366]">
                      {totalSelected} destinatario{totalSelected !== 1 ? 's' : ''} seleccionado{totalSelected !== 1 ? 's' : ''}
                    </div>
                  )}
                </div>
              )}

              {/* Step 2: Schedule */}
              {sendStep === 'schedule' && (
                <div className="space-y-5">
                  {/* Type selector */}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {([
                      { type: 'now', icon: Zap, label: 'Ahora' },
                      { type: 'once', icon: Calendar, label: 'Una vez' },
                      { type: 'weekly', icon: Repeat, label: 'Semanal' },
                      { type: 'monthly', icon: Clock, label: 'Mensual' },
                    ] as const).map(({ type, icon: Icon, label }) => (
                      <button
                        key={type}
                        onClick={() => setSchedule({ type })}
                        className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border text-xs font-medium transition-all ${
                          schedule.type === type
                            ? 'bg-[#25d366]/10 border-[#25d366]/30 text-[#25d366]'
                            : 'bg-black/20 border-white/5 text-gray-500 hover:text-white hover:border-white/10'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* Once */}
                  {schedule.type === 'once' && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">Fecha y hora</label>
                        <span className="text-xs text-[#25d366] bg-[#25d366]/10 px-2 py-0.5 rounded-md border border-[#25d366]/20">
                          Hora actual: {currentTimeStr}
                        </span>
                      </div>
                      <input
                        type="datetime-local"
                        min={minDateTime}
                        value={schedule.datetime || ''}
                        onChange={e => setSchedule(s => ({ ...s, datetime: e.target.value }))}
                        className="w-full bg-black/30 border border-white/5 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#25d366] focus:ring-1 focus:ring-[#25d366] transition-all"
                      />
                    </div>
                  )}

                  {/* Weekly */}
                  {schedule.type === 'weekly' && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Días de la semana</label>
                        <div className="flex gap-2 flex-wrap">
                          {DAY_LABELS.map((label, idx) => (
                            <button
                              key={idx}
                              onClick={() => toggleDayOfWeek(idx)}
                              className={`w-10 h-10 rounded-xl text-xs font-bold transition-all ${
                                (schedule.daysOfWeek ?? []).includes(idx)
                                  ? 'bg-[#25d366] text-black'
                                  : 'bg-black/30 border border-white/5 text-gray-500 hover:text-white'
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">Hora</label>
                          <span className="text-[10px] text-gray-500">Hora actual: {currentTimeStr.split(' ').pop()}</span>
                        </div>
                        <input
                          type="time"
                          value={schedule.time || ''}
                          onChange={e => setSchedule(s => ({ ...s, time: e.target.value }))}
                          className="w-full bg-black/30 border border-white/5 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#25d366] focus:ring-1 focus:ring-[#25d366] transition-all"
                        />
                      </div>
                    </div>
                  )}

                  {/* Monthly */}
                  {schedule.type === 'monthly' && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Días del mes</label>
                        <div className="grid grid-cols-7 gap-1.5">
                          {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                            <button
                              key={d}
                              onClick={() => toggleDayOfMonth(d)}
                              className={`h-8 rounded-lg text-xs font-semibold transition-all ${
                                (schedule.daysOfMonth ?? []).includes(d)
                                  ? 'bg-[#25d366] text-black'
                                  : 'bg-black/30 border border-white/5 text-gray-500 hover:text-white'
                              }`}
                            >
                              {d}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">Hora</label>
                          <span className="text-[10px] text-gray-500">Hora actual: {currentTimeStr.split(' ').pop()}</span>
                        </div>
                        <input
                          type="time"
                          value={schedule.time || ''}
                          onChange={e => setSchedule(s => ({ ...s, time: e.target.value }))}
                          className="w-full bg-black/30 border border-white/5 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#25d366] focus:ring-1 focus:ring-[#25d366] transition-all"
                        />
                      </div>
                    </div>
                  )}

                  {/* Summary */}
                  <div className="bg-[#1a1a28] border border-white/5 rounded-xl px-4 py-3 text-xs text-gray-400 space-y-1">
                    <div><span className="text-gray-600">Destinatarios:</span> {totalSelected} ({selectedContacts.size} contactos, {selectedGroups.size} grupos)</div>
                    <div><span className="text-gray-600">Mensaje:</span> {sendModal.imageUrl ? '📸 Con imagen — ' : ''}{sendModal.text.slice(0, 60)}{sendModal.text.length > 60 ? '…' : ''}</div>
                    <div><span className="text-gray-600">Envío:</span> {scheduleLabel(schedule)}</div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 pb-6 pt-4 border-t border-white/5 flex gap-3 justify-between shrink-0">
              {sendStep === 'recipients' ? (
                <>
                  <button onClick={closeSend} className="px-4 py-2.5 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors text-sm font-medium">Cancelar</button>
                  <button
                    onClick={() => setSendStep('schedule')}
                    disabled={!canProceedToSchedule}
                    className="flex items-center gap-2 bg-[#25d366]/10 hover:bg-[#25d366]/20 text-[#25d366] border border-[#25d366]/20 px-5 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Siguiente <ChevronRight className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => setSendStep('recipients')} className="px-4 py-2.5 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors text-sm font-medium">Atrás</button>
                  <button
                    onClick={sendBroadcast}
                    disabled={!canSend || sending}
                    className="flex items-center gap-2 bg-[#25d366] hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold px-5 py-2.5 rounded-xl transition-all text-sm"
                  >
                    {sending ? <div className="h-4 w-4 border-2 border-black/30 border-t-black rounded-full animate-spin" /> : <Send className="h-4 w-4" />}
                    {schedule.type === 'now' ? 'Enviar ahora' : 'Programar envío'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
