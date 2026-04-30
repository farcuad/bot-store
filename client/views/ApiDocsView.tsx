import { Book, Shield, Send, Terminal, Copy, Info, CheckCircle2, AlertTriangle, Layers, Zap } from 'lucide-react';
import { useGlassAlert } from 'glass-alert-animation';

export default function ApiDocsView() {
  const { fire } = useGlassAlert();

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    fire({
      title: 'Copiado',
      text: 'Contenido copiado al portapapeles',
      icon: 'success',
      toast: true,
      position: 'top-end',
      timer: 3000
    });
  };

  return (
    <div className="max-w-5xl mx-auto py-10 px-6">
      <div className="flex flex-col gap-2 mb-12">
        <h1 className="text-4xl font-black text-white flex items-center gap-3">
          <Book className="h-10 w-10 text-indigo-400" />
          Documentación de API
        </h1>
        <p className="text-gray-400 text-lg">
          Guía técnica para integrar WhaiBot con tus aplicaciones externas.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Navigation Sidebar */}
        <aside className="lg:col-span-1 space-y-2 sticky top-24 h-fit">
          <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-4">Contenido</p>
          <a href="#autenticacion" className="block text-sm text-gray-400 hover:text-white px-3 py-2 rounded-lg hover:bg-white/5 transition-all">Autenticación</a>
          <a href="#health-check" className="block text-sm text-gray-400 hover:text-white px-3 py-2 rounded-lg hover:bg-white/5 transition-all">Estado del Bot (Health)</a>
          <a href="#envio-mensajes" className="block text-sm text-gray-400 hover:text-white px-3 py-2 rounded-lg hover:bg-white/5 transition-all">Envío de Mensajes</a>
          <a href="#envio-estados" className="block text-sm text-gray-400 hover:text-white px-3 py-2 rounded-lg hover:bg-white/5 transition-all">Envío de Estados</a>
          <a href="#grupos" className="block text-sm text-gray-400 hover:text-white px-3 py-2 rounded-lg hover:bg-white/5 transition-all">Gestión de Grupos</a>
          <a href="#ejemplos" className="block text-sm text-gray-400 hover:text-white px-3 py-2 rounded-lg hover:bg-white/5 transition-all">Ejemplos de Código</a>
          <a href="#consideraciones" className="block text-sm text-gray-400 hover:text-white px-3 py-2 rounded-lg hover:bg-white/5 transition-all">Consideraciones</a>
        </aside>

        {/* Main Content */}
        <main className="lg:col-span-3 space-y-16 pb-20">
          
          {/* Section: Overview */}
          <section className="space-y-6">
            <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-2xl p-6 flex gap-4">
              <Info className="h-6 w-6 text-indigo-400 shrink-0" />
              <div className="text-sm text-gray-300 leading-relaxed">
                WhaiBot expone una API REST para interactuar con tus bots de forma programática. 
                Los endpoints de envío requieren una llave de cliente y el ID del bot específico.
              </div>
            </div>
            
            <div className="bg-[#12121a] border border-white/5 rounded-2xl p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-bold text-gray-500">Dominio Base</span>
                  <p className="text-white font-mono text-sm">https://whaibot.com</p>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-bold text-gray-500">Formato de Datos</span>
                  <p className="text-white font-mono text-sm">JSON (UTF-8)</p>
                </div>
              </div>
            </div>
          </section>

          {/* Section: Auth */}
          <section id="autenticacion" className="space-y-6">
            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
              <Shield className="h-6 w-6 text-emerald-400" />
              1. Autenticación
            </h2>
            <p className="text-gray-400 text-sm">
              Todos los endpoints de envío requieren los siguientes headers de seguridad:
            </p>
            
            <div className="bg-[#12121a] border border-white/5 rounded-2xl overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead className="bg-white/5">
                  <tr className="text-[10px] uppercase text-gray-500">
                    <th className="px-6 py-3 font-bold">Header</th>
                    <th className="px-6 py-3 font-bold">Descripción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-sm">
                  <tr>
                    <td className="px-6 py-4 font-mono text-indigo-400">x-client-key</td>
                    <td className="px-6 py-4 text-gray-300">Llave secreta de seguridad del bot.</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 font-mono text-indigo-400">x-client-botid</td>
                    <td className="px-6 py-4 text-gray-300">Identificador único del bot.</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-6 flex gap-4">
              <AlertTriangle className="h-6 w-6 text-amber-500 shrink-0" />
              <div className="text-sm text-gray-300 leading-relaxed">
                <span className="font-bold text-amber-500">Importante:</span> El <code className="bg-white/10 px-1 rounded">x-client-key</code> es una credencial secreta. Nunca la expongas en código del lado del cliente (Frontend). Úsala siempre desde servidores seguros.
              </div>
            </div>
          </section>
          
          {/* Section: Health Check */}
          <section id="health-check" className="space-y-6">
            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-indigo-400" />
              2. Estado del Bot (Health Check) 🆕
            </h2>
            
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="bg-blue-600 text-[10px] font-black px-2 py-1 rounded">GET</span>
                <code className="text-lg font-bold text-gray-200">/api/health</code>
              </div>
              <p className="text-gray-400 text-sm">
                Verifica si el bot está activo y listo para procesar mensajes sin realizar un envío real. Requiere los mismos headers de autenticación.
              </p>
            </div>

            <div className="bg-[#12121a] border border-white/5 rounded-2xl p-6 space-y-4">
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Respuesta Exitosa (200 OK)</h4>
              <pre className="bg-black/40 rounded-xl p-5 text-indigo-300 font-mono text-sm overflow-x-auto">
{`{
  "success": true,
  "botId": "bot_123456",
  "status": "ready",
  "message": "El bot está conectado y listo"
}`}
              </pre>
            </div>
          </section>

          {/* Section: Send Message */}
          <section id="envio-mensajes" className="space-y-6">
            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
              <Send className="h-6 w-6 text-blue-400" />
              3. Envío de Mensajes
            </h2>
            
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="bg-emerald-600 text-[10px] font-black px-2 py-1 rounded">POST</span>
                <code className="text-lg font-bold text-gray-200">/api/send-message</code>
              </div>
              <p className="text-gray-400 text-sm">
                Envía mensajes de texto o imágenes a números de WhatsApp individuales.
              </p>
            </div>

            <div className="bg-[#12121a] border border-white/5 rounded-2xl p-6 space-y-6">
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Cuerpo de la Petición (JSON)</h4>
                <div className="relative group">
                  <pre className="bg-black/40 rounded-xl p-5 text-indigo-300 font-mono text-sm overflow-x-auto">
{`{
  "to": "584241234567",
  "message": "¡Hola! Tu pedido #123 está listo.",
  "fromMe": "Sistema Ventas",
  "mediaUrl": "https://tusitio.com/imagen.jpg" // Opcional
}`}
                  </pre>
                  <button 
                    onClick={() => copyToClipboard('{\n  "to": "584241234567",\n  "message": "¡Hola! Tu pedido #123 está listo.",\n  "fromMe": "Sistema Ventas",\n  "mediaUrl": "https://tusitio.com/imagen.jpg"\n}')}
                    className="absolute top-4 right-4 p-2 bg-white/5 hover:bg-white/10 rounded-lg text-gray-400 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="bg-white/5 p-4 rounded-xl space-y-1">
                  <span className="font-bold text-indigo-400">to</span>
                  <p className="text-gray-400">Número destino sin '+' ni espacios. Ej: 584141234567.</p>
                </div>
                <div className="bg-white/5 p-4 rounded-xl space-y-1">
                  <span className="font-bold text-indigo-400">message</span>
                  <p className="text-gray-400">Contenido del mensaje. Actúa como caption si hay mediaUrl.</p>
                </div>
                <div className="bg-white/5 p-4 rounded-xl space-y-1">
                  <span className="font-bold text-indigo-400">fromMe</span>
                  <p className="text-gray-400">Nombre de quién envía (para auditoría interna).</p>
                </div>
                <div className="bg-white/5 p-4 rounded-xl space-y-1">
                  <span className="font-bold text-indigo-400">mediaUrl</span>
                  <p className="text-gray-400">(Opcional) URL directa a una imagen (.jpg, .png).</p>
                </div>
              </div>
            </div>
          </section>
          
          {/* Section: Send Status */}
          <section id="envio-estados" className="space-y-6">
            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
              <Zap className="h-6 w-6 text-amber-400" />
              4. Envío de Estados (Stories)
            </h2>
            
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="bg-emerald-600 text-[10px] font-black px-2 py-1 rounded">POST</span>
                <code className="text-lg font-bold text-gray-200">/api/send-status</code>
              </div>
              <p className="text-gray-400 text-sm">
                Actualiza el estado de WhatsApp (Historias) del bot con texto, imagen o ambos.
              </p>
            </div>

            <div className="bg-[#12121a] border border-white/5 rounded-2xl p-6 space-y-6">
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Cuerpo de la Petición (JSON)</h4>
                <div className="relative group">
                  <pre className="bg-black/40 rounded-xl p-5 text-amber-300 font-mono text-sm overflow-x-auto">
{`{
  "message": "¡Mira nuestra nueva oferta! 🚀",
  "mediaUrl": "https://tusitio.com/promo.jpg" // Opcional si hay mensaje
}`}
                  </pre>
                  <button 
                    onClick={() => copyToClipboard('{\n  "message": "¡Mira nuestra nueva oferta! 🚀",\n  "mediaUrl": "https://tusitio.com/promo.jpg"\n}')}
                    className="absolute top-4 right-4 p-2 bg-white/5 hover:bg-white/10 rounded-lg text-gray-400 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="bg-white/5 p-4 rounded-xl space-y-1">
                  <span className="font-bold text-amber-400">message</span>
                  <p className="text-gray-400">Texto del estado. Actúa como caption si hay mediaUrl.</p>
                </div>
                <div className="bg-white/5 p-4 rounded-xl space-y-1">
                  <span className="font-bold text-amber-400">mediaUrl</span>
                  <p className="text-gray-400">URL directa a una imagen (.jpg, .png) para el estado.</p>
                </div>
              </div>
            </div>
          </section>

          {/* Section: Groups */}
          <section id="grupos" className="space-y-6">
            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
              <Layers className="h-6 w-6 text-purple-400" />
              5. Gestión de Grupos
            </h2>
            
            <div className="space-y-8">
              {/* GET GROUPS */}
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className="bg-blue-600 text-[10px] font-black px-2 py-1 rounded">GET</span>
                  <code className="text-lg font-bold text-gray-200">/api/groupsBots</code>
                </div>
                <p className="text-gray-400 text-sm">
                  Lista todos los grupos en los que participa el bot. El bot debe estar en estado <span className="text-emerald-500 font-bold">ready</span>.
                </p>
              </div>

              {/* POST GROUP MESSAGE */}
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className="bg-emerald-600 text-[10px] font-black px-2 py-1 rounded">POST</span>
                  <code className="text-lg font-bold text-gray-200">/api/groupsBots</code>
                </div>
                <p className="text-gray-400 text-sm">
                  Envía mensajes a grupos usando su ID único (formato <code className="bg-white/10 px-1 rounded">@g.us</code>).
                </p>
              </div>
            </div>
          </section>

          {/* Section: Code Examples */}
          <section id="ejemplos" className="space-y-6">
            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
              <Terminal className="h-6 w-6 text-gray-400" />
              6. Ejemplos de Código
            </h2>

            <div className="bg-[#12121a] border border-white/5 rounded-3xl overflow-hidden">
              <div className="flex border-b border-white/5">
                <button className="px-6 py-4 text-xs font-bold text-[#25d366] border-b-2 border-[#25d366]">JavaScript (Fetch)</button>
                <button className="px-6 py-4 text-xs font-bold text-gray-500 hover:text-white transition-all">Python (Requests)</button>
                <button className="px-6 py-4 text-xs font-bold text-gray-500 hover:text-white transition-all">cURL</button>
              </div>
              <div className="p-6 relative group">
                <pre className="text-sm font-mono text-gray-300 overflow-x-auto leading-relaxed">
{`const response = await fetch("https://whaibot.com/api/send-message", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-client-key": "TU_CLIENT_KEY",
    "x-client-botid": "ID_DEL_BOT"
  },
  body: JSON.stringify({
    to: "584241234567",
    message: "Prueba desde mi sistema",
    fromMe: "App n8n"
  })
});

const data = await response.json();
console.log(data);`}
                </pre>
                <button 
                  onClick={() => copyToClipboard(`const response = await fetch("https://whaibot.com/api/send-message", {\n  method: "POST",\n  headers: {\n    "Content-Type": "application/json",\n    "x-client-key": "TU_CLIENT_KEY",\n    "x-client-botid": "ID_DEL_BOT"\n  },\n  body: JSON.stringify({\n    to: "584241234567",\n    message: "Prueba desde mi sistema",\n    fromMe: "App n8n"\n  })\n});\n\nconst data = await response.json();\nconsole.log(data);`)}
                  className="absolute top-6 right-6 p-2 bg-white/5 hover:bg-white/10 rounded-lg text-gray-400 opacity-0 group-hover:opacity-100 transition-all"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            </div>
          </section>

          {/* Section: Considerations */}
          <section id="consideraciones" className="space-y-6">
            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-emerald-400" />
              Consideraciones Finales
            </h2>
            <ul className="space-y-4 text-gray-400 text-sm list-disc pl-6">
              <li>El bot debe estar en estado <span className="text-emerald-500 font-bold">ready</span> para recibir peticiones.</li>
              <li>El formato de los números destino debe ser código de país + número, sin el signo '+'.</li>
              <li>Recomendamos dejar un intervalo de al menos 2 segundos entre envíos para evitar el bloqueo de WhatsApp por spam.</li>
              <li>Todos los envíos quedan registrados en la pestaña "Envíos API" del panel de administración del bot.</li>
            </ul>
          </section>

        </main>
      </div>
    </div>
  );
}
