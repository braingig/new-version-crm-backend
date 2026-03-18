# FROM node:20-bookworm AS builder

# WORKDIR /app

# COPY package*.json ./
# COPY prisma ./prisma/
# RUN npm ci

# COPY . .
# RUN npx prisma generate
# RUN npm run build

# FROM node:20-bookworm

# WORKDIR /app

# COPY package*.json ./
# COPY prisma ./prisma/
# RUN npm ci --only=production

# COPY --from=builder /app/dist ./dist
# COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# EXPOSE 4000
# CMD ["node", "dist/src/main.js"]

FROM node:20-bookworm AS builder

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

# install dependencies
RUN npm install

COPY . .

# generate prisma client
RUN npx prisma generate

# build NestJS app
RUN npm run build


FROM node:20-bookworm

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

# install only production deps
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

EXPOSE 4000

CMD ["node", "dist/src/main.js"]