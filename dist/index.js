import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import dotenv from 'dotenv';
import { loadSessions, saveSessions, TWENTY_FOUR_HOURS } from './services/sessionManager.js';
dotenv.config();
const client = new Client({
    authStrategy: new LocalAuth()
});
// --- Configuración Informativa ---
const TASA_BCV = 43.62;
const INFO_RESPUESTAS = {
    catalogo: `📦 *Listas de precios*:
1. *Yogurt 16 Oz* - 12$

2. *Tortas Frias 12 Oz* - (8 sabores)
$1.5 bcv
1$ en divisas
$1.25 A partir de 5 unidades

3. *Bizcochos Marmoleados* - $15

4. *Tortas de Piña* -
$1.25 bcv
1$ en divisas
1.25$ precio por docena

5. *Ponquesitos paquete de 8 unidades* -
$1.25 bcv
1$ en divisas
6. *Quesillo* - 
$1.35 cv
1$ en divisas
$16 la docena

7. *Palmeritas* - $14

8. *Ponqué 300 gramos* -
$1.25 bcv
1$ en divisas
$1.25 precio por docena

9. *Torta ponqué 1.5 kg *
$5 bcv`,
    ubicacion: `📍 *Ubicación*:
Av. Principal, Local #12. Frente a la plaza central, Ciudad Bolivia.`,
    redes: `📱 *Nuestras Redes*:
- Instagram: @DulcesPorciones
- Facebook: Dulces Porciones`,
    pago_movil: `📲 *Datos de Pago Móvil*:
- Banco: Venezuela (0102)
- Cédula: V-12345678
- Teléfono: 0412-1234567
- Tasa BCV: *${TASA_BCV}*`,
    agendacion: `🗓️ *Agendación de Pedidos*:
Realizamos pedidos con 24 horas de anticipación para tortas completas y docenas. ¡Escríbenos lo que necesitas!`
};
// --- Lógica de Detección ---
const keywords = {
    catalogo: ["catalogo", "catálogo", "precio", "tienen", "venden", "productos", "menu", "lista"],
    ubicacion: ["ubicacion", "donde estan", "dirección", "donde queda", "tienda física", "llegar"],
    redes: ["instagram", "redes", "sociales", "facebook", "tiktok"],
    pago_movil: ["pago movil", "transferencia", "pagar", "datos", "banco", "tasa", "bcv"],
    agendacion: ["agendar", "cita", "pedido", "encargo", "apartar", "cuanto tiempo"]
};
// Al inicio de tu archivo, fuera de los eventos
const bootTime = Date.now();
client.on('qr', (qr) => qrcode.generate(qr, { small: true }));
client.on('ready', () => console.log('✅ Bot Informativo "El Avance" listo'));
client.on('message', async (msg) => {
    console.log(msg);
    const messageTimestamp = msg.timestamp * 1000;
    if (messageTimestamp < bootTime) {
        return;
    }
    // Ignorar mensajes de broadcast y grupos
    if (msg.from === "status@broadcast" || msg.from.includes("@g.us"))
        return;
    // --- Gestión de Sesiones ---
    const sessions = await loadSessions();
    const nowInSeconds = Math.floor(Date.now() / 1000);
    // Intervención Humana: Si el mensaje es del dueño (fromMe), marcar como 'human'
    if (msg.fromMe) {
        const chat = await msg.getChat();
        const remoteId = chat.id._serialized;
        sessions[remoteId] = {
            last_interaction: nowInSeconds,
            status: 'human'
        };
        await saveSessions(sessions);
        console.log(`👤 Intervención humana registrada para: ${remoteId}`);
        return;
    }
    const from = msg.from;
    // Si el status es 'human', el bot ignora el mensaje
    if (sessions[from]?.status === 'human') {
        console.log(`⏸️ Bot en pausa para ${from} (modo humano). Ignorando mensaje.`);
        return;
    }
    // --- Regla de 24 Horas ---
    const session = sessions[from];
    const contact = await msg.getContact();
    let saludoEnviado = false;
    if (!session) {
        // Usuario nuevo: crear sesión y enviar saludo inicial
        sessions[from] = {
            last_interaction: nowInSeconds,
            status: 'bot'
        };
        await msg.reply(`¡Hola ${contact.pushname || "amigo"}! 👋 Bienvenido a *Dulces Porciones*.\n\nPuedes consultarme por :\n- 📦 *Listas de precios*\n- 📍 *Ubicación*\n- 📲 *Pago Móvil*\n- 📱 *Redes Sociales*\n- 🗓️ *Horarios de Atención*`);
        console.log(`🆕 Nuevo usuario registrado: ${contact.pushname || from}`);
        saludoEnviado = true;
    }
    else if (nowInSeconds - session.last_interaction > TWENTY_FOUR_HOURS) {
        // Han pasado más de 24h: enviar saludo de re-contacto
        sessions[from] = {
            last_interaction: nowInSeconds,
            status: 'bot'
        };
        await msg.reply(`¡Hola de nuevo ${contact.pushname || "amigo"}! 👋 Qué gusto verte otra vez por *Dulces Porciones*.\n\n¿En qué te puedo ayudar hoy?\n- 📦 *Listas de precios*\n- 📍 *Ubicación*\n- 📲 *Pago Móvil*\n- 📱 *Redes Sociales*\n- 🗓️ *Horarios de Atención*`);
        console.log(`🔄 Re-contacto con: ${contact.pushname || from}`);
        saludoEnviado = true;
    }
    else {
        // Actualizar last_interaction para usuarios activos
        sessions[from].last_interaction = nowInSeconds;
    }
    // --- Palabra Clave "Raquel" ---
    const textRaw = msg.body.trim().toLowerCase();
    if (textRaw.includes("raquel")) {
        await client.sendMessage(msg.to, `📢 Contestale al usuario ${msg.from}, que quiere: ${msg.body}`);
        console.log(`🔔 Notificación enviada al dueño sobre "Raquel" de ${from}`);
    }
    // --- Lógica de respuestas por keyword (solo si no se envió saludo ya) ---
    if (!saludoEnviado) {
        let categoriaEncontrada = "";
        for (const [categoria, listaPalabras] of Object.entries(keywords)) {
            if (listaPalabras.some(p => textRaw.includes(p))) {
                categoriaEncontrada = categoria;
                break;
            }
        }
        const esSaludo = textRaw.includes("hola") || textRaw.includes("buen");
        const debeResponder = !!(categoriaEncontrada || esSaludo);
        if (!debeResponder) {
            console.log(`Refusado: Mensaje de ${contact.pushname} no coincide con filtros.`);
            await saveSessions(sessions);
            return;
        }
        try {
            console.log(`🤖 Respondiendo a ${contact.pushname || from} sobre: ${categoriaEncontrada || 'Saludo'}`);
            if (categoriaEncontrada) {
                await msg.reply(INFO_RESPUESTAS[categoriaEncontrada]);
            }
            else {
                await msg.reply(`¡Hola ${contact.pushname || "amigo"}! 👋 Bienvenido a *Dulces Porciones*.\n\nPuedes consultarme por :\n- 📦 *Listas de precios*\n- 📍 *Ubicación*\n- 📲 *Pago Móvil*\n- 📱 *Redes Sociales*\n- 🗓️ *Horarios de Atención*`);
            }
        }
        catch (error) {
            console.error("Error al enviar mensaje:", error);
        }
    }
    // Guardar sesiones al final
    await saveSessions(sessions);
});
client.initialize();
//# sourceMappingURL=index.js.map