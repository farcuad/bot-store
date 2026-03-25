import { senBotMessage } from "../index.js";
// Endpoint para intermediario de whatsapp
export const seendMessageController = async (req, res) => {
    try {
        const { to, message } = req.body;
        const clientKey = req.headers["x-client-key"];
        if (clientKey !== process.env.API_KEY) {
            return res.status(401).json({ error: "API Key incorrecta" });
        }
        if (!to || !message) {
            return res.status(400).json({ error: "Faltan datos" });
        }
        await senBotMessage(to, message);
        res.status(200).json({ succes: true, message: `Mensaje enviado a ${to}` });
    }
    catch (error) {
        console.error("Error al enviar mensaje:", error);
        res.status(500).json({ error: "Error al enviar mensaje" });
    }
};
//# sourceMappingURL=WhatsappController.js.map