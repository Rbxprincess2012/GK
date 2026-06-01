# Бэкенд диспетчера — production-образ
FROM node:22-alpine

WORKDIR /app

# Зависимости (только prod) — отдельным слоем для кэша
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Исходники
COPY . .

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "src/server.js"]
