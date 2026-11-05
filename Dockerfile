FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY --chown=node:node server ./server
COPY --chown=node:node scripts/start-deploy.mjs scripts/import-geodata.mjs scripts/import-neighborhood-catalog.mjs ./scripts/
COPY --chown=node:node database ./database

USER node
EXPOSE 3001
CMD ["node", "scripts/start-deploy.mjs"]
