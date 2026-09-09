FROM supabase/storage-api:v1.48.26 AS upstream

FROM node:24.14.1-alpine

WORKDIR /app

COPY --from=upstream /app /app

EXPOSE 5000
CMD ["node", "dist/start/server.js"]
