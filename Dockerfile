FROM node:20-alpine

WORKDIR /app

# Prisma needs openssl on alpine; tzdata so TZ=Asia/Kuala_Lumpur actually
# takes effect (alpine ships no zoneinfo database — a bare TZ env silently
# no-ops without it, leaving the container on UTC)
RUN apk add --no-cache openssl tzdata
ENV TZ=Asia/Kuala_Lumpur

# Install deps first for better Docker layer caching
COPY package*.json ./
RUN npm ci

# Generate Prisma clients against the Linux target (host generates against Windows)
COPY prisma ./prisma/
COPY prisma.task-manager.config.ts ./
RUN npx prisma generate
RUN npx prisma generate --config prisma.task-manager.config.ts

# Source + build
ARG BUILD_DATE
RUN echo "Building version/date: ${BUILD_DATE}"
COPY . .
RUN NODE_OPTIONS="--max-old-space-size=4096" npm run build

# Drop to non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app
USER nodejs

EXPOSE 3000
CMD ["npm", "start"]
