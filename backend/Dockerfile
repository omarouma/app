FROM node:20.20.2-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY db.js mysql-db.js jwt.js turn.js redis-bus.js oss-store.js firebase-push.js server.js ./
COPY cloud ./cloud
COPY deploy ./deploy
RUN useradd --system --uid 10001 --create-home gaga \
    && mkdir -p /var/lib/gagachat \
    && chown -R gaga:gaga /app /var/lib/gagachat
USER gaga
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
