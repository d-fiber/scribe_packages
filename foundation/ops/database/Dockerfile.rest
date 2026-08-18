FROM postgrest/postgrest:v14.8 AS upstream

FROM debian:12-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq5 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=upstream --chmod=755 /usr/bin/postgrest /usr/bin/postgrest

USER 1000
EXPOSE 3000
CMD ["postgrest"]
