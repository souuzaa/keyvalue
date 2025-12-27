FROM oven/bun:1.1.13

WORKDIR /app

COPY package.json ./
COPY server.ts ./
COPY public ./public

EXPOSE 3000

CMD ["bun", "server.ts"]
