import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import dotenv from 'dotenv';
import { procesarMensajeIA } from './controllers/GeminisController.js';
// import { getTasaBCV } from './services/tasaBcv.js';
dotenv.config();

const client = new Client({
    authStrategy: new LocalAuth()
});

// --- Base de datos e Inits ---
const inventario: { [key: string]: { nombre: string, precio: number } } = {
    harina: { nombre: "Harina Pan", precio: 1.10 },
    arroz: { nombre: "Arroz Primor", precio: 1.25 },
    pasta: { nombre: "Pasta Capri", precio: 1.40 }
};

const sesiones: { [key: string]: any } = {};

// const ignorarTildes = (texto: string) => {
//     return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
// }



// --- Eventos de Cliente ---
client.on('qr', (qr) => qrcode.generate(qr, { small: true }));
client.on('ready', () => console.log('✅ Bot de la Bodega listo'));

client.on('message', async (msg) => {
    // Validacion para ignorar mensajes de estados
    if (msg.from === "status@broadcast") return;
    // Validacion para ignorar mensajes de grupos
    if (msg.from.includes("@g.us")) return;
    // Validacion para ignorar mensajes propios (evitar loops)
    if (msg.fromMe) return;
    const from = msg.from;
    const textRaw = msg.body;
    const contact = await msg.getContact();

    if (!sesiones[from]) sesiones[from] = { paso: 'inicio', historialIA: [] };
    const s = sesiones[from];
    
    const pareceConsultaTienda = (texto: string) => {

    const textoLower = texto.toLowerCase();

    const palabras = [
        "precio",
    "cuanto",
    "cuánto",
    "vale",
    "costo",
    "tienen",
    "tienes",
    "hay",
    "venden",
    "producto",
    "productos",
    "catalogo",
    "catálogo",
    "comprar",
    "venta",
    ];

    return palabras.some(p => textoLower.includes(p));
};
    const isContact = contact.isMyContact;
    let response = false;

    if (!isContact && pareceConsultaTienda(textRaw)) {
        response = true;
        console.log(`🤖 BOT responderá (usuario desconocido): ${contact.pushname || from}`);
    }

    if (isContact) {
        response = true;
        console.log(`🤖 BOT responderá (contacto hablando de tienda): ${contact.pushname || from}`);
    }

    if (!response) {
        console.log(`⛔ BOT ignoró mensaje de: ${contact.pushname || from}`);
        return;
    }
    try {

        const respuestaIA = await procesarMensajeIA(
            textRaw,
            inventario,
            s.historialIA
        );

        s.historialIA.push({
            role: "user",
            parts: [{ text: textRaw }]
        });

        s.historialIA.push({
            role: "model",
            parts: [{ text: respuestaIA }]
        });

        await msg.reply(respuestaIA);

        if (s.historialIA.length > 20) {
            s.historialIA.shift();
        }
    } catch (error) {
        console.error(error);
    }
});

client.initialize();