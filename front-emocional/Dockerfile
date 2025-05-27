# front-end/Dockerfile

# ETAPA 1: build
FROM node:18-alpine AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ETAPA 2: servidor estático con nginx
FROM nginx:stable-alpine

# Copia el build de React al directorio de nginx
COPY --from=build /app/build /usr/share/nginx/html

# Expone puerto 80
EXPOSE 80

# Arranca nginx
CMD ["nginx", "-g", "daemon off;"]
