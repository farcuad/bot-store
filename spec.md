# matar los servicios

lsof -ti:3000,3001,5173 | xargs kill -9
