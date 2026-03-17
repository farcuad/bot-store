import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// --- Rutas ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STATS_PATH = path.resolve(__dirname, '../../stats.json');
// --- Estado en memoria ---
let stats = {
    total_mensajes: 0,
    por_intencion: {},
    usuarios_unicos: 0,
    ultima_actualizacion: new Date().toISOString(),
};
// --- Funciones ---
export async function loadStats() {
    try {
        const raw = await fs.readFile(STATS_PATH, 'utf-8');
        stats = JSON.parse(raw);
        console.log('📊 Estadísticas cargadas desde disco.');
    }
    catch {
        console.log('📊 No se encontró stats.json. Iniciando con contadores en cero.');
    }
}
export async function saveStats() {
    stats.ultima_actualizacion = new Date().toISOString();
    await fs.writeFile(STATS_PATH, JSON.stringify(stats, null, 2), 'utf-8');
}
export function incrementarIntencion(intencion) {
    stats.total_mensajes++;
    stats.por_intencion[intencion] = (stats.por_intencion[intencion] ?? 0) + 1;
}
export function incrementarUsuariosUnicos() {
    stats.usuarios_unicos++;
}
export function getStats() {
    return stats;
}
export function imprimirResumenStats() {
    const s = getStats();
    console.log('\n══════════════════════════════════');
    console.log('📊 ESTADÍSTICAS DEL BOT');
    console.log('══════════════════════════════════');
    console.log(`📨 Total mensajes procesados : ${s.total_mensajes}`);
    console.log(`👥 Usuarios únicos           : ${s.usuarios_unicos}`);
    console.log('📌 Por intención:');
    for (const [k, v] of Object.entries(s.por_intencion)) {
        console.log(`   • ${k.padEnd(15)} → ${v} veces`);
    }
    console.log('══════════════════════════════════\n');
}
//# sourceMappingURL=statsManager.js.map