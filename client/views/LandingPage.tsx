import { useState, useEffect } from "react";

// ── Types ──────────────────────────────────────────────────────────────────

interface FaqItem {
  question: string;
  answer: string;
}

// ── Data ───────────────────────────────────────────────────────────────────

const features = [
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
      </svg>
    ),
    color: "from-violet-500/20 to-purple-500/10 border-violet-500/20 text-violet-400",
    title: "IA Avanzada",
    description: "Integración nativa con modelos de lenguaje de última generación para conversaciones naturales y contextuales.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    color: "from-[#25d366]/20 to-teal-500/10 border-[#25d366]/20 text-[#25d366]",
    title: "Disponibilidad 24/7",
    description: "Tu bot nunca duerme. Responde a tus clientes a cualquier hora, cualquier día, sin intervención humana.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
      </svg>
    ),
    color: "from-blue-500/20 to-cyan-500/10 border-blue-500/20 text-blue-400",
    title: "Multi-bot",
    description: "Gestiona múltiples números de WhatsApp desde un solo panel. Ideal para agencias y equipos de ventas.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
    color: "from-amber-500/20 to-orange-500/10 border-amber-500/20 text-amber-400",
    title: "Analíticas en Tiempo Real",
    description: "Dashboards con métricas de conversaciones, tasa de respuesta y usuarios únicos para decisiones más inteligentes.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
      </svg>
    ),
    color: "from-rose-500/20 to-pink-500/10 border-rose-500/20 text-rose-400",
    title: "Seguridad Total",
    description: "Encriptación de extremo a extremo y cumplimiento con las políticas de Meta para proteger tu cuenta.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 9.75L16.5 12l-2.25 2.25m-4.5 0L7.5 12l2.25-2.25M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" />
      </svg>
    ),
    color: "from-teal-500/20 to-emerald-500/10 border-teal-500/20 text-teal-400",
    title: "API Pública",
    description: "Envía mensajes desde cualquier sistema externo con nuestra API REST. Integraciones sin límites.",
  },
];

const stats = [
  { value: "24/7", label: "Disponibilidad" },
  { value: "< 5min", label: "Configuración" },
  { value: "∞", label: "Mensajes/mes" },
  { value: "100%", label: "Cloud hosted" },
];

const faqItems: FaqItem[] = [
  {
    question: "¿Es difícil de configurar?",
    answer:
      "Para nada. Solo escaneas un código QR desde tu WhatsApp y en menos de 5 minutos tienes tu primer bot respondiendo automáticamente.",
  },
  {
    question: "¿WhatsApp puede banear mi número?",
    answer:
      "Utilizamos técnicas de envío humanizado para cumplir con las políticas de Meta, minimizando al máximo cualquier riesgo.",
  },
  {
    question: "¿Puedo gestionar múltiples números?",
    answer:
      "Sí. Whaibot soporta múltiples instancias de WhatsApp desde un único panel. Cada bot tiene su propia configuración, base de conocimiento y estadísticas.",
  },
  {
    question: "¿Cómo funciona la IA?",
    answer:
      "Conectamos tu bot con modelos de lenguaje avanzados (DeepSeek, OpenAI) que comprenden el contexto completo de la conversación y responden de forma natural.",
  },
];

const defaultPricingPlans = [
  {
    name: "Basic",
    price: "$15",
    description: "Ideal para pequeños negocios que están empezando.",
    features: [
      "Respuestas 24/7 con IA",
      "Base de conocimiento ilimitada",
      "Configuración en 5 minutos",
      "1 Bot activo",
    ],
    color: "from-blue-500/20 to-indigo-500/10 border-blue-500/20 text-blue-400",
    buttonColor: "bg-white/5 hover:bg-white/10 text-white border-white/10",
  },
  {
    name: "Pro",
    price: "$29",
    popular: true,
    description: "Para empresas que necesitan automatización avanzada.",
    features: [
      "Todo lo del plan Basic",
      "API de comunicación (REST)",
      "Responde audios",
      "Integraciones con sistemas",
    ],
    color: "from-[#25d366]/20 to-teal-500/10 border-[#25d366]/40 text-[#25d366]",
    buttonColor: "bg-[#25d366] hover:bg-[#20c55d] text-black",
  },
  {
    name: "Premium",
    price: "$39",
    description: "La solución completa para agencias y grandes equipos.",
    features: [
      "Todo lo del plan Pro",
      "Múltiples bots (Multi-número)",
      "Gestión de equipos",
      "Soporte prioritario 1-a-1",
    ],
    color: "from-violet-500/20 to-purple-500/10 border-violet-500/20 text-violet-400",
    buttonColor: "bg-white/5 hover:bg-white/10 text-white border-white/10",
  },
];

// ── Icons ───────────────────────────────────────────────────────────────────

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4 shrink-0">
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
  </svg>
);

const ChevronDownIcon = ({ open }: { open: boolean }) => (
  <svg
    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    className={`w-5 h-5 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
  </svg>
);

const WhatsAppIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

// ── Sub-components ─────────────────────────────────────────────────────────

function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled
        ? "bg-[#0a0a12]/90 backdrop-blur-xl border-b border-white/5 shadow-xl shadow-black/20"
        : "bg-transparent"
        }`}
    >
      <nav className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
        <div className="flex items-center">
          <img src="/whaibot.png" alt="Whaibot Logo" className="h-9 object-contain" />
        </div>

        <div className="hidden md:flex items-center space-x-8">
          {["Inicio", "Funciones", "Casos", "FAQ"].map((item) => (
            <a
              key={item}
              href={`#${item.toLowerCase()}`}
              className="text-sm font-medium text-slate-400 hover:text-white transition-colors duration-200 cursor-pointer"
            >
              {item}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <a
            href="/login"
            className="text-sm font-semibold text-white px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition-all duration-200 cursor-pointer border border-white/10"
          >
            Iniciar sesión / Registrarse
          </a>
          <a
            href="https://wa.me/584127575904"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-[#25d366] hover:bg-[#20c55d] text-black text-sm font-bold px-5 py-2.5 rounded-xl transition-all duration-200 shadow-lg shadow-[#25d366]/25 cursor-pointer"
          >
            <WhatsAppIcon />
            Probar Gratis
          </a>
        </div>
      </nav>
    </header>
  );
}

function Hero() {
  return (
    <section id="inicio" className="relative min-h-screen flex items-center pt-20 pb-16 px-6 overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#25d366]/8 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-violet-600/8 rounded-full blur-[120px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-600/4 rounded-full blur-[160px]" />
      </div>
      {/* Grid overlay */}
      <div
        className="absolute inset-0 -z-10 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      <div className="max-w-7xl mx-auto w-full">
        <div className="flex flex-col lg:flex-row items-center gap-16">
          {/* Text side */}
          <div className="lg:w-1/2 text-center lg:text-left">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 bg-[#25d366]/10 border border-[#25d366]/20 text-[#25d366] text-xs font-semibold px-4 py-1.5 rounded-full mb-8">
              <span className="w-1.5 h-1.5 bg-[#25d366] rounded-full animate-pulse" />
              Automatización con IA para WhatsApp
            </div>

            <h1 className="text-5xl lg:text-6xl xl:text-7xl font-bold leading-[1.07] tracking-tight mb-6 text-white">
              Vende más mientras{" "}
              <span className="relative">
                <span className="relative z-10 bg-linear-to-r from-[#25d366] to-teal-400 bg-clip-text text-transparent">
                  duermes
                </span>
                <span className="absolute -bottom-1 left-0 w-full h-px bg-linear-to-r from-[#25d366] to-teal-400 opacity-50" />
              </span>
            </h1>

            <p className="text-lg text-slate-400 mb-10 max-w-xl mx-auto lg:mx-0 leading-relaxed">
              Whaibot automatiza tus ventas y soporte en WhatsApp con inteligencia artificial. Responde como un humano, cierra tratos y nunca pierdas un lead — las 24 horas del día.
            </p>

            <div className="flex flex-col sm:flex-row justify-center lg:justify-start gap-4 mb-10">
              <a
                href="https://wa.me/584127575904"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2.5 bg-[#25d366] hover:bg-[#20c55d] text-black font-bold text-base px-8 py-4 rounded-xl transition-all duration-200 shadow-xl shadow-[#25d366]/30 cursor-pointer"
              >
                <WhatsAppIcon />
                Empezar gratis ahora
              </a>
              <a
                href="#funciones"
                className="inline-flex items-center justify-center gap-2 border border-white/10 text-slate-300 hover:text-white hover:bg-white/5 hover:border-white/20 font-semibold text-base px-8 py-4 rounded-xl transition-all duration-200 cursor-pointer"
              >
                Ver funciones
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
                </svg>
              </a>
            </div>

            <div className="flex items-center justify-center lg:justify-start gap-6 text-sm text-slate-500 flex-wrap">
              {["Sin tarjeta de crédito", "Configuración en 5 min", "Cancela cuando quieras"].map((item) => (
                <span key={item} className="flex items-center gap-1.5">
                  <CheckIcon />
                  <span className="text-slate-400">{item}</span>
                </span>
              ))}
            </div>
          </div>

          {/* Chat mockup side */}
          <div className="lg:w-1/2 relative flex justify-center">
            {/* Decorative glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-[#25d366]/15 rounded-full blur-3xl" />

            <div className="relative w-full max-w-sm">
              {/* Phone frame */}
              <div className="bg-[#1a1a28] border border-white/10 rounded-3xl p-1 shadow-2xl shadow-black/50 rotate-1 hover:rotate-0 transition-transform duration-500">
                {/* WhatsApp header */}
                <div className="bg-[#128c7e] rounded-t-2xl px-4 py-3 flex items-center gap-3">
                  <div className="w-9 h-9 bg-white rounded-full flex items-center justify-center overflow-hidden border-2 border-white/20 shrink-0">
                    <img src="/whaibot.png" alt="Bot" className="w-7 h-7 object-contain" />
                  </div>
                  <div>
                    <p className="text-white text-sm font-bold leading-none">Whaibot Asistente</p>
                    <p className="text-green-200 text-[11px] mt-0.5">en línea</p>
                  </div>
                </div>

                {/* Chat messages */}
                <div
                  className="p-4 space-y-3 rounded-b-2xl"
                  style={{ background: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.02'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\") #0d1117" }}
                >
                  {[
                    { text: "Hola! ¿Tienen disponible el modelo X?", isBot: false, time: "10:32" },
                    { text: "¡Hola! Sí, tenemos el modelo X en stock. 😊 ¿Lo quieres en negro o blanco?", isBot: true, time: "10:32" },
                    { text: "Negro, y ¿cuánto tarda el envío?", isBot: false, time: "10:33" },
                    { text: "¡Perfecto! El envío es gratis y llega en 2-3 días hábiles. ¿Te genero el pedido?", isBot: true, time: "10:33" },
                  ].map((msg, i) => (
                    <div
                      key={i}
                      className={`flex ${msg.isBot ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${msg.isBot
                          ? "bg-[#25d366] text-black font-medium rounded-br-sm"
                          : "bg-[#2a2a3d] text-slate-200 rounded-bl-sm"
                          }`}
                      >
                        <p>{msg.text}</p>
                        <p className={`text-[10px] mt-1 text-right ${msg.isBot ? "text-black/50" : "text-slate-500"}`}>
                          {msg.time}
                        </p>
                      </div>
                    </div>
                  ))}

                  {/* Typing indicator */}
                  <div className="flex justify-end">
                    <div className="bg-[#25d366]/20 border border-[#25d366]/20 px-4 py-2.5 rounded-2xl rounded-br-sm flex items-center gap-1">
                      {[0, 150, 300].map((delay) => (
                        <span
                          key={delay}
                          className="w-1.5 h-1.5 bg-[#25d366] rounded-full animate-bounce"
                          style={{ animationDelay: `${delay}ms`, animationDuration: "1s" }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Floating badge */}
              <div className="absolute -top-4 -right-4 bg-[#25d366] text-black text-xs font-bold px-3 py-1.5 rounded-full shadow-lg shadow-[#25d366]/40 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-black rounded-full animate-pulse" />
                IA respondiendo
              </div>
            </div>
          </div>
        </div>

        {/* Stats bar */}
        <div className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-px bg-white/5 rounded-2xl overflow-hidden border border-white/5">
          {stats.map((stat) => (
            <div key={stat.label} className="bg-[#0d0d1a] px-6 py-6 text-center flex flex-col items-center gap-1">
              <span className="text-3xl font-bold text-white tracking-tight">{stat.value}</span>
              <span className="text-sm text-slate-500 font-medium">{stat.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Features() {
  return (
    <section id="funciones" className="py-24 px-6 relative">
      <div className="absolute inset-0 -z-10">
        <div className="absolute left-0 top-1/2 w-64 h-64 bg-violet-600/5 rounded-full blur-[100px]" />
      </div>

      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 text-slate-400 text-xs font-semibold px-4 py-1.5 rounded-full mb-6">
            Funcionalidades
          </div>
          <h2 className="text-4xl lg:text-5xl font-bold text-white mb-4 tracking-tight">
            Todo lo que necesitas para{" "}
            <br className="hidden lg:block" />
            <span className="text-slate-400">automatizar tu WhatsApp con IA</span>
          </h2>
          <p className="text-slate-500 max-w-2xl mx-auto text-lg leading-relaxed">
            Desde IA conversacional hasta analíticas avanzadas. Whaibot tiene todo lo que necesitas para transformar tu WhatsApp en un canal de ventas automatizado.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((f) => (
            <div
              key={f.title}
              className={`group relative p-6 rounded-2xl bg-linear-to-br ${f.color} border backdrop-blur-sm hover:scale-[1.02] transition-all duration-300 cursor-default`}
            >
              <div className={`w-12 h-12 rounded-xl bg-linear-to-br ${f.color} border flex items-center justify-center mb-5`}>
                {f.icon}
              </div>
              <h3 className="text-lg font-bold text-white mb-2">{f.title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">{f.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      number: "01",
      title: "Crea tu bot",
      description: "Regístrate y crea tu instancia de bot en menos de un minuto. Sin necesidad de código ni configuraciones complejas.",
    },
    {
      number: "02",
      title: "Escanea el QR",
      description: "Vincula tu número de WhatsApp escaneando el código QR desde la app. Tu bot estará listo al instante.",
    },
    {
      number: "03",
      title: "Configura la IA",
      description: "Añade tu base de conocimiento, personaliza las respuestas y define el comportamiento de tu asistente.",
    },
    {
      number: "04",
      title: "Empieza a vender",
      description: "Tu bot empieza a responder automáticamente. Monitorea las conversaciones desde el panel en tiempo real.",
    },
  ];

  return (
    <section className="py-24 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 text-slate-400 text-xs font-semibold px-4 py-1.5 rounded-full mb-6">
            Proceso
          </div>
          <h2 className="text-4xl lg:text-5xl font-bold text-white mb-4 tracking-tight">
            En marcha en <span className="text-[#25d366]">4 pasos</span>
          </h2>
          <p className="text-slate-500 text-lg max-w-xl mx-auto">
            Configurar Whaibot no requiere conocimientos técnicos. En minutos tu bot está listo.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((step, i) => (
            <div key={step.number} className="relative group">
              {/* Connector */}
              {i < steps.length - 1 && (
                <div className="hidden lg:block absolute top-8 left-full w-full h-px bg-linear-to-r from-white/10 to-transparent z-10" />
              )}
              <div className="bg-[#0d0d1a] border border-white/8 rounded-2xl p-6 hover:border-[#25d366]/30 transition-all duration-300 h-full">
                <div className="text-4xl font-black text-[#25d366]/20 mb-4 font-mono">{step.number}</div>
                <h3 className="text-white font-bold text-lg mb-2">{step.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function UseCases() {
  const industries = [
    { icon: "🍔", name: "Restaurantes" },
    { icon: "🏨", name: "Hoteles" },
    { icon: "🛍️", name: "Tiendas" },
    { icon: "🛠️", name: "Servicios" },
    { icon: "🏠", name: "Inmobiliarias" },
    { icon: "✈️", name: "Viajes" },
    { icon: "💅", name: "Belleza" },
    { icon: "📚", name: "Educación" },
    { icon: "🚗", name: "Automotriz" },
    { icon: "🏋️", name: "Fitness" },
    { icon: "🏥", name: "Salud" },
    { icon: "🏢", name: "Empresas" },
  ];

  return (
    <section id="casos" className="py-24 px-6 relative bg-[#05050A]">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 text-slate-400 text-xs font-semibold px-4 py-1.5 rounded-full mb-6">
            Casos de Uso
          </div>
          <h2 className="text-5xl lg:text-7xl font-black text-white tracking-tighter mb-6 leading-none">
            UN CHATBOT PARA <br className="hidden md:block" />
            <span className="text-transparent bg-clip-text bg-linear-to-r from-[#3B82F6] to-[#60A5FA]">
              CADA INDUSTRIA
            </span>
          </h2>
          <p className="text-slate-400 text-xl md:text-2xl max-w-3xl mx-auto leading-relaxed font-light">
            whaibot se adapta a las necesidades específicas de tu negocio, sin importar el sector.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-20">
          {industries.map((ind) => (
            <div
              key={ind.name}
              className="group bg-[#0D0D1A] border border-white/5 p-6 rounded-3xl hover:bg-[#3B82F6]/5 hover:border-[#3B82F6]/30 transition-all duration-300 flex flex-col items-center justify-center gap-4 cursor-pointer"
            >
              <div className="text-4xl group-hover:scale-110 transition-transform duration-300">{ind.icon}</div>
              <span className="text-white font-semibold tracking-tight">{ind.name}</span>
            </div>
          ))}
        </div>

        <div className="bg-linear-to-br from-[#0D0D1A] to-[#0A0A12] border border-[#3B82F6]/20 p-10 md:p-14 rounded-[40px] flex flex-col md:flex-row items-center gap-10 overflow-hidden relative">
          <div className="absolute top-0 right-0 w-96 h-96 bg-[#3B82F6]/10 blur-[100px] rounded-full pointer-events-none" />

          <div className="w-16 h-16 bg-[#3B82F6]/20 rounded-2xl flex items-center justify-center shrink-0 border border-[#3B82F6]/30">
            <svg viewBox="0 0 24 24" fill="none" stroke="#60A5FA" strokeWidth="2" className="w-8 h-8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
          </div>

          <div>
            <h3 className="text-2xl md:text-3xl font-bold text-white mb-3">Entrenamiento Específico</h3>
            <p className="text-slate-400 text-lg leading-relaxed">
              Cada bot conoce la terminología y mejores prácticas de tu industria. No es solo un bot genérico, es un experto virtual en tu área de negocio capaz de entender y resolver las dudas de tus clientes.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  const [plans, setPlans] = useState<any[]>(defaultPricingPlans);

  useEffect(() => {
    fetch("/api/plans")
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && data.plans && data.plans.length > 0) {
          setPlans(data.plans);
        }
      })
      .catch((err) => console.error("Error fetching plans:", err));
  }, []);

  return (
    <section id="precios" className="py-24 px-6 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[#25d366]/5 rounded-full blur-[120px] -z-10" />

      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 text-slate-400 text-xs font-semibold px-4 py-1.5 rounded-full mb-6">
            Planes
          </div>
          <h2 className="text-4xl lg:text-5xl font-bold text-white mb-4 tracking-tight">
            Elige el plan perfecto para <span className="text-[#25d366]">tu negocio</span> con IA
          </h2>
          <p className="text-slate-500 text-lg max-w-2xl mx-auto">
            Sin costos ocultos. Escalabilidad total para acompañar el crecimiento de tu empresa.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {plans.map((plan: any) => (
            <div
              key={plan.name}
              className={`relative flex flex-col p-8 rounded-3xl bg-[#0d0d1a] border transition-all duration-500 hover:translate-y-[-8px] ${plan.popular ? "border-[#25d366]/50 shadow-2xl shadow-[#25d366]/10 scale-105 z-10" : "border-white/5"
                }`}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-[#25d366] text-black text-[10px] font-black uppercase tracking-widest px-4 py-1 rounded-full shadow-lg shadow-[#25d366]/20">
                  Más Popular
                </div>
              )}

              <div className="mb-8">
                <h3 className="text-xl font-bold text-white mb-2">{plan.name}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{plan.description}</p>
              </div>

              <div className="mb-8 flex items-baseline gap-1">
                <span className="text-4xl font-bold text-white">{plan.price}</span>
                {plan.price !== "Consultar" && <span className="text-slate-500 text-sm">/mes</span>}
              </div>

              <div className="space-y-4 mb-10 flex-grow">
                {plan.features.map((feature: string, i: number) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className={`mt-1 shrink-0 ${plan.popular ? "text-[#25d366]" : "text-slate-400"}`}>
                      <CheckIcon />
                    </div>
                    <span className="text-slate-400 text-sm leading-tight">{feature}</span>
                  </div>
                ))}
              </div>

              <a
                href="https://wa.me/584127575904"
                target="_blank"
                rel="noopener noreferrer"
                className={`w-full py-4 px-6 rounded-xl font-bold text-center transition-all duration-200 border ${plan.buttonColor}`}
              >
                {plan.name === "Premium" ? "Contactar Ventas" : "Empezar ahora"}
              </a>
            </div>
          ))}
        </div>

        <p className="text-center text-slate-600 text-sm mt-12">
          ¿Necesitas un plan personalizado? <a href="https://wa.me/584127575904" className="text-[#25d366] hover:underline">Habla con nosotros</a>
        </p>
      </div>
    </section>
  );
}

function FaqAccordion() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const toggle = (i: number) => setOpenIndex(openIndex === i ? null : i);

  return (
    <section id="faq" className="py-24 px-6">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 text-slate-400 text-xs font-semibold px-4 py-1.5 rounded-full mb-6">
            FAQ
          </div>
          <h2 className="text-4xl lg:text-5xl font-bold text-white tracking-tight mb-4">
            Preguntas frecuentes
          </h2>
          <p className="text-slate-500 text-lg">
            Lo que más nos preguntan antes de empezar.
          </p>
        </div>

        <div className="space-y-3">
          {faqItems.map((item, i) => (
            <div
              key={i}
              className={`border rounded-2xl overflow-hidden transition-all duration-300 ${openIndex === i
                ? "border-[#25d366]/30 bg-[#25d366]/5"
                : "border-white/8 bg-[#0d0d1a] hover:border-white/15"
                }`}
            >
              <button
                className="w-full px-6 py-5 text-left font-semibold text-white flex justify-between items-center cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#25d366] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                onClick={() => toggle(i)}
                aria-expanded={openIndex === i}
              >
                <span className="text-base pr-4">{item.question}</span>
                <ChevronDownIcon open={openIndex === i} />
              </button>
              <div
                className={`overflow-hidden transition-all duration-300 ${openIndex === i ? "max-h-48" : "max-h-0"
                  }`}
              >
                <p className="px-6 pb-5 text-slate-400 leading-relaxed text-sm">{item.answer}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section className="py-24 px-6">
      <div className="max-w-4xl mx-auto">
        <div className="relative bg-linear-to-br from-[#0f1f14] to-[#0d0d1a] border border-[#25d366]/20 rounded-3xl p-12 text-center overflow-hidden">
          {/* Background glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-48 bg-[#25d366]/10 rounded-full blur-[80px]" />

          <div className="relative z-10">
            <div className="w-16 h-16 bg-[#25d366]/15 border border-[#25d366]/30 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <WhatsAppIcon />
            </div>
            <h2 className="text-4xl lg:text-5xl font-bold text-white mb-4 tracking-tight">
              ¿Listo para automatizar?
            </h2>
            <p className="text-slate-400 text-lg mb-8 max-w-2xl mx-auto leading-relaxed">
              Únete a los negocios que ya usan Whaibot para responder más rápido, vender más y trabajar menos. Sin tarjeta de crédito.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a
                href="https://wa.me/584127575904"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2.5 bg-[#25d366] hover:bg-[#20c55d] text-black font-bold text-base px-8 py-4 rounded-xl transition-all duration-200 shadow-xl shadow-[#25d366]/30 cursor-pointer"
              >
                <WhatsAppIcon />
                Empezar gratis
              </a>
              <a
                href="/login"
                className="inline-flex items-center gap-2 text-slate-400 hover:text-white font-semibold text-base px-8 py-4 rounded-xl border border-white/10 hover:border-white/20 hover:bg-white/5 transition-all duration-200 cursor-pointer"
              >
                Ya tengo cuenta →
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/5 py-12 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center">
            <img src="/whaibot.png" alt="Whaibot Logo" className="h-8 object-contain" />
          </div>

          <div className="flex items-center gap-6 text-sm text-slate-600">
            {["Términos", "Privacidad", "Cookies"].map((link) => (
              <a
                key={link}
                href="#"
                className="hover:text-slate-400 transition-colors duration-200 cursor-pointer"
              >
                {link}
              </a>
            ))}
          </div>

          <p className="text-sm text-slate-600 text-center md:text-right">
            © 2026 Whaibot AI Solutions.{" "}
            <a
              href="https://globaltechnologies.web.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-500 hover:text-slate-300 transition-colors duration-200"
            >
              GlobalTechnologies
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}

// ── Root Component ─────────────────────────────────────────────────────────

export default function WhaibotLanding() {
  useEffect(() => {
    document.title = "Whaibot | Automatiza tu WhatsApp con IA avanzada";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) {
      meta.setAttribute(
        "content",
        "Whaibot automatiza tus ventas y soporte en WhatsApp 24/7 con IA avanzada. Configura en 5 minutos, sin tarjeta de crédito."
      );
    }
  }, []);

  return (
    <div
      className="text-slate-900 overflow-x-hidden scroll-smooth"
      style={{ backgroundColor: "#080810", color: "#f8fafc" }}
    >
      <Navbar />
      <main>
        <Hero />
        <Features />
        <UseCases />
        <HowItWorks />
        <Pricing />
        <FaqAccordion />
        <CTA />
      </main>
      <Footer />
    </div>
  );
}