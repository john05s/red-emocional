# server/Dockerfile

# 1) Usa una imagen ligera de Node
FROM node:18-alpine

# 2) Directorio de trabajo
WORKDIR /app

# 3) Copia package*.json e instala dependencias en modo producción
COPY package*.json ./
RUN npm ci --only=production

# 4) Copia el resto del código del servidor
COPY . .

# 5) Expone el puerto que usa Express/Socket.IO
EXPOSE 5000

# 6) Inicia la app
CMD ["node", "server.js"]
