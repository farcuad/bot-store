# matar los servicios

lsof -ti:3000,3001,5173 | xargs kill -9

# Buenas Prácticas TypeScript
- Usar siempre modelos de datos explícitos (en la carpeta `src/models`) al estructurar datos o hacer lecturas desde la base de datos (por ejemplo, Firestore). Esto ayuda a evitar errores de tipado como "Property does not exist on type...".
