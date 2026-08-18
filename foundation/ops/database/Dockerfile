FROM supabase/postgres:15.8.1.085

USER root

RUN set -eux; \
    nixbin="$(dirname "$(readlink -f /usr/bin/psql)")"; \
    apt-get update; \
    apt-get install -y --no-install-recommends pgbackrest; \
    rm -rf /var/lib/apt/lists/*; \
    for tool in psql pg_isready pg_dump pg_dumpall pg_restore; do \
      if [ -x "$nixbin/$tool" ]; then ln -sf "$nixbin/$tool" "/usr/bin/$tool"; fi; \
    done; \
    psql --version; \
    pg_isready --version

RUN mkdir -p /var/log/pgbackrest /var/spool/pgbackrest \
    && chown -R postgres:postgres /var/log/pgbackrest /var/spool/pgbackrest

USER postgres
