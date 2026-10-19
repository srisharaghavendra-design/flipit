FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
RUN mkdir -p /var/data/runs

ENV NODE_ENV=production \
    MOPS_DATA_DIR=/var/data \
    MOPS_RUNS_DIR=/var/data/runs \
    MOPS_INTERNAL_SMTP=1

EXPOSE 8787
CMD ["npm", "start"]
