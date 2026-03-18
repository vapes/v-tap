FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
RUN npm ci
COPY . .
RUN npm run build
RUN npx esbuild server/src/index.ts --bundle --platform=node --target=node20 --outfile=server/dist/index.js --format=esm --packages=external

FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/package.json ./server/
RUN cd server && npm install --omit=dev
EXPOSE 8080
CMD ["node", "server/dist/index.js"]
