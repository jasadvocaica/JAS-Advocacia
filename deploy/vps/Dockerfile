FROM node:22-alpine
WORKDIR /app
COPY --chown=node:node deploy/vps/worker.mjs ./worker.mjs
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","worker.mjs"]
