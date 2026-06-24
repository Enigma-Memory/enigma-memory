FROM node:24-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package.json README.md LICENSE ./
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts
COPY specs ./specs

RUN npm install --global --omit=dev . \
  && npm cache clean --force

USER node
WORKDIR /home/node

EXPOSE 8787 8797

ENTRYPOINT ["enigma"]
CMD ["--help"]
