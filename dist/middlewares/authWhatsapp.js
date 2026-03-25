import dotenv from "dotenv";
dotenv.config();
// Middleware de validación
export const validateApiKey = (req, res, next) => {
    const clientKey = req.headers["x-client-key"]; // Buscamos la llave en los headers
    if (!clientKey || clientKey !== process.env.API_KEY) {
        console.warn(`🚫 Intento de acceso no autorizado desde: ${req.ip}`);
        return res.status(401).json({
            error: "No autorizado",
            message: "API Key inválida o ausente en el header x-api-key",
        });
    }
    next(); // Si todo está bien, pasamos a la función de enviar mensaje
};
//# sourceMappingURL=authWhatsapp.js.map