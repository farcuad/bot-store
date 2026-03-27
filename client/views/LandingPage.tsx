import { useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheck,
  faChevronDown,
  // faBrain,
  // faUsers,
  // faClock,
  // faChartLine,
  // faPlug,
  // faShieldHalved,
} from "@fortawesome/free-solid-svg-icons";

// ── Types ──────────────────────────────────────────────────────────────────

interface FaqItem {
  question: string;
  answer: string;
}


// ── Data ───────────────────────────────────────────────────────────────────

// const features = [
//   {
//     icon: faBrain,
//     color: "bg-green-100 text-green-600",
//     title: "Inteligencia Artificial",
//     description:
//       "Integración nativa con GPT-5 para entender el contexto y responder de forma natural.",
//   },
//   {
//     icon: faUsers,
//     color: "bg-blue-100 text-blue-600",
//     title: "Multiagente",
//     description:
//       "Varios miembros de tu equipo pueden atender la misma línea de WhatsApp sin conflictos.",
//   },
//   {
//     icon: faClock,
//     color: "bg-purple-100 text-purple-600",
//     title: "Disponibilidad 24/7",
//     description:
//       "No pierdas ni una sola oportunidad de venta. Tu bot nunca duerme, ni toma vacaciones.",
//   },
//   {
//     icon: faChartLine,
//     color: "bg-yellow-100 text-yellow-600",
//     title: "Analíticas Avanzadas",
//     description:
//       "Mide el rendimiento de tus conversaciones y la tasa de conversión en tiempo real.",
//   },
//   {
//     icon: faPlug,
//     color: "bg-red-100 text-red-600",
//     title: "Integraciones",
//     description:
//       "Conecta tu CRM, Shopify o Google Sheets para automatizar el flujo de datos.",
//   },
//   {
//     icon: faShieldHalved,
//     color: "bg-emerald-100 text-emerald-600",
//     title: "Seguridad",
//     description:
//       "Encriptación de punto a punto y cumplimiento con las normas de privacidad.",
//   },
// ];

const faqItems: FaqItem[] = [
  {
    question: "¿Es difícil de configurar?",
    answer:
      "Para nada. Solo necesitas escanear un código QR desde tu WhatsApp y estarás listo para configurar tus primeras respuestas automáticas en menos de 5 minutos.",
  },
  {
    question: "¿WhatsApp puede banear mi número?",
    answer:
      "Utilizamos la API oficial y técnicas de envío humanizado para cumplir con las políticas de Meta, minimizando al máximo cualquier riesgo.",
  }
];

// ── Sub-components ─────────────────────────────────────────────────────────

function Navbar() {
  return (
    <header className="fixed w-full z-50 bg-white/80 backdrop-blur-md border-b border-slate-200">
      <nav className="container mx-auto px-6 py-4 flex justify-between items-center">
        <div className="flex items-center space-x-2">
          <img src="/whaibot.png" alt="Whaibot Logo" className="object-contain" style={{ width: "150px" }} />

        </div>

        <div className="hidden md:flex space-x-8 font-medium text-slate-600">
          {["Inicio", "FAQ"].map((item) => (
            <a
              key={item}
              href={`#${item.toLowerCase()}`}
              className="hover:text-green-500 transition-colors"
            >
              {item}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <a
            href="/login"
            className="border border-slate-300 text-slate-700 hover:border-green-400 hover:text-green-600 px-5 py-2.5 rounded-full font-semibold transition-colors"
          >
            Iniciar sesión
          </a>
          <a
            href="https://wa.me/584127575904"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-green-500 hover:bg-green-600 text-white px-6 py-2.5 rounded-full font-semibold transition-colors shadow-lg shadow-green-200"
          >
            Probar Gratis
          </a>
        </div>
      </nav>
    </header>
  );
}

function Hero() {
  return (
    <section id="inicio" className="pt-32 pb-20 px-6">
      <div className="container mx-auto flex flex-col lg:flex-row items-center gap-16">
        {/* Text */}
        <div className="lg:w-1/2 text-center lg:text-left">
          <h1 className="text-5xl lg:text-7xl font-bold leading-tight mb-6">
            Lleva tu atención al cliente al{" "}
            <span className="bg-linear-to-r from-green-500 to-teal-600 bg-clip-text text-transparent">
              siguiente nivel
            </span>
          </h1>
          <p className="text-lg text-slate-600 mb-8 max-w-xl mx-auto lg:mx-0">
            Whaibot automatiza tus ventas y soporte técnico en WhatsApp 24/7.
            Integra IA avanzada para responder como un humano y cerrar tratos
            mientras duermes.
          </p>
          <div className="flex flex-col sm:flex-row justify-center lg:justify-start gap-4">
            <a
              href="https://wa.me/584127575904"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-slate-900 text-white px-8 py-4 rounded-xl font-bold text-lg hover:bg-slate-800 transition-colors shadow-xl"
            >
              Empezar ahora
            </a>
            {/* <button className="bg-white text-slate-700 border border-slate-200 px-8 py-4 rounded-xl font-bold text-lg hover:bg-slate-50 transition-colors">
              Ver Demo
            </button> */}
          </div>
          <div className="mt-8 flex items-center justify-center lg:justify-start gap-4 text-sm text-slate-500 font-medium flex-wrap">
            <span>
              <FontAwesomeIcon icon={faCheck} className="inline text-green-500 w-4 h-4 mr-1" />
              Sin tarjeta de crédito
            </span>
            <span>
              <FontAwesomeIcon icon={faCheck} className="inline text-green-500 w-4 h-4 mr-1" />
              Configuración en 5 min
            </span>
          </div>
        </div>

        {/* Chat mockup */}
        <div className="lg:w-1/2 relative">
          <div className="absolute -z-10 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-green-200 rounded-full blur-3xl opacity-50" />
          <div className="bg-white rounded-3xl shadow-2xl p-4 max-w-md mx-auto border border-slate-100 rotate-2">
            <div className="bg-slate-100 rounded-t-2xl p-4 flex items-center space-x-3 border-b border-slate-200">
              <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center overflow-hidden border border-slate-200 shadow-sm">
                <img src="/whaibot.png" alt="Whaibot Asistente" className="w-8 h-8 object-contain" />
              </div>
              <div>
                <p className="text-sm font-bold">Whaibot Asistente</p>
                <p className="text-xs text-green-500">En línea</p>
              </div>
            </div>
            <div className="p-6 space-y-4 bg-slate-50">
              {[
                { text: "Hola! Estoy interesado en sus servicios. ¿Me dan información?", isBot: false },
                { text: "¡Hola! Claro que sí. Con Whaibot puedes automatizar tus ventas. ¿Te gustaría ver nuestros planes?", isBot: true },
                { text: "Sí, por favor.", isBot: false },
                { text: "Genial. Tenemos planes desde $29/mes. ¿Deseas que un asesor te llame?", isBot: true },
              ].map((msg, i) => (
                <div
                  key={i}
                  className={`p-3 rounded-lg shadow-sm max-w-[80%] text-sm ${msg.isBot
                    ? "bg-green-500 text-white ml-auto"
                    : "bg-white text-slate-800"
                    }`}
                >
                  {msg.text}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// function Features() {
//   return (
//     <section id="funciones" className="py-24 bg-white">
//       <div className="container mx-auto px-6 text-center">
//         <h2 className="text-4xl font-bold mb-4">¿Por qué elegir Whaibot?</h2>
//         <p className="text-slate-500 mb-16 max-w-2xl mx-auto">
//           Potencia tu comunicación con herramientas diseñadas para escalar tu
//           negocio de manera eficiente.
//         </p>
//         <div className="grid md:grid-cols-3 gap-12">
//           {features.map((f) => (
//             <div
//               key={f.title}
//               className="p-8 rounded-2xl border border-slate-100 bg-slate-50 hover:-translate-y-1 transition-transform duration-300"
//             >
//               <div
//                 className={`w-14 h-14 ${f.color} rounded-xl flex items-center justify-center text-2xl mb-6 mx-auto`}
//               >
//                 <FontAwesomeIcon icon={f.icon} className="w-6 h-6" />
//               </div>
//               <h3 className="text-xl font-bold mb-4">{f.title}</h3>
//               <p className="text-slate-600">{f.description}</p>
//             </div>
//           ))}
//         </div>
//       </div>
//     </section>
//   );
// }


function FaqAccordion() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (i: number) => setOpenIndex(openIndex === i ? null : i);

  return (
    <section id="faq" className="py-24 bg-white">
      <div className="container mx-auto px-6 max-w-3xl">
        <h2 className="text-4xl font-bold mb-12 text-center">
          Preguntas Frecuentes
        </h2>
        <div className="space-y-4">
          {faqItems.map((item, i) => (
            <div
              key={i}
              className="border border-slate-200 rounded-2xl overflow-hidden"
            >
              <button
                className="w-full px-6 py-4 text-left font-bold flex justify-between items-center bg-slate-50 hover:bg-slate-100 transition-colors"
                onClick={() => toggle(i)}
              >
                <span>{item.question}</span>
                <FontAwesomeIcon
                  icon={faChevronDown}
                  className={`w-4 h-4 transition-transform duration-300 ${openIndex === i ? "rotate-180" : ""
                    }`}
                />
              </button>
              <div
                className={`overflow-hidden transition-all duration-300 bg-white ${openIndex === i ? "max-h-40" : "max-h-0"
                  }`}
              >
                <p className="px-6 py-4 text-slate-600">{item.answer}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="py-12 bg-[#111118] border-t border-[#111118]">
      <div className="container mx-auto px-6 text-center">
        <div className="flex items-center justify-center space-x-2 mb-6">
          <img src="/whaibot.png" alt="Whaibot Logo" className="object-contain" style={{ width: "150px" }} />

        </div>
        <p className="text-white text-sm">
          © 2026 Whaibot AI Solutions. Todos los derechos reservados.
          Hecho con ♥ por
          <a href="https://globaltechnologies.web.app/"> GlobalTechnologies</a>
        </p>
        <div className="mt-4 flex justify-center space-x-6 text-white">
          {["Términos", "Privacidad", "Cookies"].map((link) => (
            <a
              key={link}
              href="#"
              className="hover:text-slate-600 transition-colors"
            >
              {link}
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
}

// ── Root Component ─────────────────────────────────────────────────────────

export default function WhaibotLanding() {
  useEffect(() => {
    document.title = "WhaiBot | Automatiza tu WhatsApp con IA avanzada";
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute("content", "Lleva tu atención al cliente al siguiente nivel con Whaibot. Automatización inteligente para WhatsApp 24/7.");
    }
  }, []);

  return (
    <div className="bg-slate-50 text-slate-900 overflow-x-hidden scroll-smooth">
      <Navbar />
      <main>
        <Hero />
        <FaqAccordion />
      </main>
      <Footer />
    </div>
  );
}