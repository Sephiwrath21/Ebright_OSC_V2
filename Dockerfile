FROM node:20-alpine

WORKDIR /app

# Prisma needs openssl on alpine
RUN apk add --no-cache openssl

# Install deps first for better Docker layer caching
COPY package*.json ./
RUN npm ci

# Generate Prisma client against the Linux target (host generates against Windows)
COPY prisma ./prisma/
RUN npx prisma generate

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
