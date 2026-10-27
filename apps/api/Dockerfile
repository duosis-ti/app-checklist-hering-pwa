FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
RUN npm ci --workspace=@checklist/api --include-workspace-root
COPY packages/shared packages/shared
COPY apps/api apps/api
ENV NODE_ENV=production
EXPOSE 3001
USER node
CMD ["npm", "run", "start", "--workspace=@checklist/api"]
