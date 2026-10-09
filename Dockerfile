# Production image for the Bringin' It Home API.
# Used by Google Cloud Run, Render, and Railway.
FROM node:24-bookworm-slim

WORKDIR /srv

# Install only the API's runtime dependencies (the root package.json also
# pulls in Hardhat and the Solidity toolchain, which the API doesn't need).
RUN npm init -y >/dev/null \
  && npm install --omit=dev --no-audit --no-fund \
    express@5.2.1 \
    express-rate-limit@8.7.1 \
    better-sqlite3@13.0.3 \
    sharp@0.35.5 \
  && npm cache clean --force

COPY core/aicp-protocol ./core/aicp-protocol
COPY app/bringin-it-home/*.js ./app/bringin-it-home/

ENV NODE_ENV=production \
    PORT=8080 \
    BRINGIN_HOME_DATA_DIR=/data

RUN mkdir -p /data && chown node:node /data
USER node

EXPOSE 8080
CMD ["node", "app/bringin-it-home/server.js"]
