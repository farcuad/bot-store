import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const client = new Client({
    authStrategy: new LocalAuth()
});

// --- BASE DE DATOS MOMENTÁNEA ---
const inventario: { [key: string]: { nombre: string, precio: number } } = {
    harina: { nombre: "Harina Pan", precio: 1.10 },
    arroz: { nombre: "Arroz Primor", precio: 1.25 },
    pasta: { nombre: "Pasta Capri", precio: 1.40 }
};

// Memoria de la sesión: { "from": { paso: string, producto: string, total: number } }
const sesiones: { [key: string]: any } = {};

// Función para obtener tasa del BCV
async function getTasaBCV() {
    try {
        const response = await axios.get('https://u2.rsgve.com/gym-api/api/bcv-rate');
        return (response.data.rate).toFixed(2);
    } catch (error) {
        console.error("Error tasa BCV:", error);
        return 45.00; // Tasa de respaldo por si falla tu API
    }
}

client.on('message', async (msg) => {
    const from = msg.from;
    const text = msg.body.toLowerCase();
    const contact = await msg.getContact();

    const palabrasActivacion = ['hola', 'catalogo', 'ubicacion', 'precio', 'producto', 'tienda'];
    const esMensajeDeNegocio = palabrasActivacion.some(p => text.includes(p));

    // Si no tenemos una sesión activa con este contacto Y el mensaje no tiene palabras clave,
    // y además es un contacto guardado (amigo), lo ignoramos para que puedas hablar tú.
    if (!sesiones[from] || sesiones[from].paso === 'inicio') {
        if (contact.isMyContact && !esMensajeDeNegocio) {
            console.log(`🏠 Charla casual con amigo (${contact.pushname}) - Bot ignorando.`);
            return; 
        }
    }
    if (!sesiones[from]) sesiones[from] = { paso: 'inicio' };
    const s = sesiones[from];

    // --- 1. SALUDO ---
    if (text.includes('hola') || text.includes('buen')) {
        await msg.reply(`👋 ¡Hola! Bienvenido a la tienda.\n\nEscribe *Catálogo* para ver productos o *Ubicación* para saber dónde estamos.`);
        s.paso = 'menu';
        return;
    }

    // --- 2. SELECCIÓN DE CATÁLOGO ---
    if (text.includes('catalogo')) {
        let res = "📦 *Catálogo Disponible:*\n\n";
        Object.entries(inventario).forEach(([key, item]) => {
            res += `- *${item.nombre}*: $${item.precio.toFixed(2)}\n`;
        });
        res += "\nEscribe el nombre del producto que deseas comprar.";
        s.paso = 'seleccion_producto';
        await msg.reply(res);
        return;
    }

    // --- 3. SELECCIÓN DE PRODUCTO Y MÉTODOS DE PAGO ---
    const productoDetectado = Object.keys(inventario).find(p => text.includes(p));
    
    if (productoDetectado && s.paso === 'seleccion_producto') {
        const item = inventario[productoDetectado]; // Extraemos el objeto

        // Aquí TypeScript ya sabe que 'item' existe porque lo acabamos de buscar
        if (item) {
            s.producto = item.nombre;
            s.precioUnitario = item.precio;
            s.paso = 'preguntar_cantidad';

            await msg.reply(`Seleccionaste: *${s.producto}* (Precio unitario: $${s.precioUnitario.toFixed(2)})\n\n¿Cuántas unidades deseas comprar? (Envía solo el número, ej: 3)`);
        }
        return;
    }

    if (s.paso === 'preguntar_cantidad' && /^\d+$/.test(text)) {
        s.cantidad = parseInt(text);
        s.totalUSD = (s.precioUnitario * s.cantidad); // Aquí ya tenemos cantidad para multiplicar

        await msg.reply(
            `✅ Pedido: *${s.cantidad}x ${s.producto}*\n` +
            `💰 Total a pagar: *$${s.totalUSD.toFixed(2)}*\n\n` +
            `¿Cómo deseas pagar?\n` +
            `1. *Efectivo* (Divisas)\n` +
            `2. *Pago Móvil* (Bolívares)`
        );
        s.paso = 'metodo_pago';
        return;
    }
    // --- 4. PROCESAMIENTO DE PAGO ---
    
    // --- NUEVO: GESTIÓN DE UBICACIÓN (Global) ---
    if (text.includes('ubicacion')) {
        await msg.reply("📍 *Nuestra Ubicación:* Calle 123, Local Comercial 'El Avance'.\nGoogle Maps: [Link de ejemplo]");
        return;
    }

    // --- 4. PROCESAMIENTO DE PAGO (Ajustado) ---
    
    // A. EFECTIVO / DIVISAS
    if ((text === '1' || text.includes('efectivo') || text.includes('divisa')) && s.paso === 'metodo_pago') {
        const resumen = `✅ *NUEVO PEDIDO (Efectivo)*\n👤 Cliente: ${contact.pushname || contact.number}\n📦: ${s.cantidad}x ${s.producto}\n💰 Total: $${s.totalUSD.toFixed(2)}`;
        
        await msg.reply(`💵 *Confirmado.*\nTotal: *$${s.totalUSD.toFixed(2)}*\n\nTe esperamos en la tienda. Confirmaremos tu pedido al recibirte.`);
        
        // Notificación al dueño (A ti mismo)
        await client.sendMessage(msg.from, `🔔 *Alerta de Venta:* \n\n${resumen}`); 
        // Nota: Como usas tu propio número, 'msg.from' te lo mandará al chat con el cliente, 
        // pero puedes cambiarlo por tu propio ID de WhatsApp si quieres que llegue a otro lado.
        
        delete sesiones[from];
        return;
    }

    // B. PAGO MÓVIL
    if ((text === '2' || text.includes('pago movil') || text.includes('bolivar')) && s.paso === 'metodo_pago') {
        const tasa = await getTasaBCV();
        const totalBS = (s.totalUSD * tasa).toFixed(2);
        s.totalBS = totalBS; // Guardamos para el resumen

        await msg.reply(`📲 *Pago Móvil*\n\nTasa BCV: *${tasa}*\nTotal: *${totalBS} Bs.*\n\n*Datos:* \n- Banco: Venezuela (0102)\n- Cédula: V-13714806\n- Teléfono: 0414-5193744\n\n*Por favor envía el comprobante por aquí para procesar tu despacho.*`);
        s.paso = 'esperando_comprobante';
        return;
    }

    // --- C. RECIBIR COMPROBANTE ---
    if (s.paso === 'esperando_comprobante' && (msg.hasMedia || text.includes('listo') || text.includes('enviado'))) {
        const resumenPM = `✅ *NUEVO PEDIDO (Pago Móvil)*\n👤 Cliente: ${contact.pushname || contact.number}\n📦: ${s.cantidad}x ${s.producto}\n💰 Total: $${s.totalUSD.toFixed(2)} (${s.totalBS} Bs.)`;

        await msg.reply("👍 ¡Recibido! Estamos verificando el pago. En breve te confirmamos el despacho.");
        
        // Alerta al dueño
        await client.sendMessage(msg.from, `🔔 *Alerta de Pago Móvil:* \n\n${resumenPM}\n_Verifica el comprobante enviado arriba._`);
        
        delete sesiones[from];
        return;
    }
});

client.initialize();