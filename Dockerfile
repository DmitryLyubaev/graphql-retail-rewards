FROM node:24.14.0-bookworm-slim@sha256:d8e448a56fc63242f70026718378bd4b00f8c82e78d20eefb199224a4d8e33d8
WORKDIR /app
COPY package.json ./
COPY node_modules ./node_modules
COPY dist ./dist
USER node
CMD ["node", "dist/src/main.js"]
