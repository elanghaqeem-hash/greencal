# GreenCal CRMS Enterprise — citra runtime on-premise.
# WP02. Master Execution Prompt v2.0 Bagian 02.1 dan Bagian 09.2.
#
# Sifat yang dijaga citra ini:
#   - Tidak ada dependensi internet saat runtime. Seluruh unduhan terjadi pada
#     tahap build, di jaringan build bank, lalu tahap runtime berjalan tanpa
#     akses keluar (ditegakkan docker-compose dan uji egress).
#   - Berjalan sebagai pengguna non-root tanpa shell login.
#   - Berkas aplikasi read-only; satu-satunya direktori yang dapat ditulis
#     adalah /tmp yang dipasang tmpfs oleh compose.
#   - Tidak ada paket build, kompilator, atau alat jaringan di citra akhir.

# --- Tahap 1: dependensi -----------------------------------------------------
FROM node:24.13.0-trixie-slim AS deps
WORKDIR /build
# Hanya manifes yang disalin lebih dulu agar lapisan dependensi dapat dicache.
COPY package.json package-lock.json ./
# npm ci menuntut lockfile dan menolak resolusi yang tidak tercatat, sehingga
# isi node_modules dapat diaudit dan direproduksi byte demi byte.
RUN npm ci --omit=dev --ignore-scripts \
 && npm cache clean --force

# --- Tahap 2: verifikasi -----------------------------------------------------
# Uji dijalankan di dalam citra, bukan hanya di CI, sehingga paket rilis
# offline membawa bukti bahwa uji lulus pada lingkungan yang sama.
FROM node:24.13.0-trixie-slim AS verify
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
# Rangkaian uji yang tidak membutuhkan basis data maupun jaringan. Uji
# integrasi PostgreSQL dan pemindaian keamanan dijalankan CI, bukan di dalam
# build citra: keduanya menuntut layanan di luar citra.
RUN node scripts/build-dist.mjs \
 && node --test \
      tests/onprem-precision.test.mjs \
      tests/onprem-iam.test.mjs \
      tests/onprem-audit-cycle.test.mjs \
      tests/onprem-deployment.test.mjs \
      tests/onprem-release-bundle.test.mjs \
      tests/inventory-openapi.test.mjs \
      tests/design-system.test.mjs \
      tests/secret-scan-config.test.mjs \
 && node scripts/inventory/extract-actions.mjs --check \
 && node scripts/design/contrast.mjs \
 # Registry parameter tiba bersama WP04. Selama berkas validatornya belum ada
 # di cabang ini, langkah dilewati dengan catatan: menggagalkan build karena
 # berkas yang memang belum ada akan menyembunyikan kegagalan sesungguhnya.
 && if [ -f scripts/registry/validate-crms26.mjs ]; then \
      node scripts/registry/validate-crms26.mjs; \
    else \
      echo "scripts/registry/validate-crms26.mjs belum ada di cabang ini; dilewati."; \
    fi

# --- Tahap 3: runtime --------------------------------------------------------
FROM node:24.13.0-trixie-slim AS runtime

# Tidak ada paket BARU yang dipasang di tahap ini: tidak ada curl, wget, git,
# atau kompilator di citra produksi. Yang dilakukan hanyalah memasang pembaruan
# keamanan untuk paket yang MEMANG sudah ada, lalu membuang npm, corepack, dan
# seluruh cache apt. npm tidak dibutuhkan saat runtime, dan justru npm bundled
# itulah sumber temuan High pada glob, minimatch, tar, dan brace-expansion;
# membuangnya menghilangkan temuan sekaligus mengecilkan permukaan serang.
RUN set -eux; \
    apt-get update; \
    apt-get upgrade -y --no-install-recommends; \
    rm -rf /usr/local/lib/node_modules/npm \
           /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack; \
    apt-get clean; \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* /root/.npm; \
    ! command -v npm; \
    ! command -v npx

ENV NODE_ENV=production \
    NODE_OPTIONS=--disable-proto=throw \
    GREENCAL_DEPLOYMENT=onprem \
    GREENCAL_EGRESS=deny \
    TZ=Asia/Jakarta

# UID dan GID tetap agar izin volume dapat disiapkan operator lebih dulu.
RUN groupadd --gid 10001 greencal \
 && useradd --uid 10001 --gid 10001 --home-dir /app --no-create-home --shell /usr/sbin/nologin greencal

WORKDIR /app
COPY --from=deps  --chown=root:root /build/node_modules ./node_modules
COPY --from=verify --chown=root:root /build/dist ./dist
COPY --chown=root:root package.json ./
COPY --chown=root:root src ./src
COPY --chown=root:root api ./api
COPY --chown=root:root scripts ./scripts
COPY --chown=root:root migrations ./migrations
COPY --chown=root:root docs/enterprise/registry ./docs/enterprise/registry

# Berkas aplikasi dimiliki root dan hanya dapat dibaca pengguna runtime.
RUN chmod -R a-w /app

USER 10001:10001
EXPOSE 8080

# Healthcheck lokal, tidak menyentuh jaringan luar.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "scripts/onprem/healthcheck.mjs"]

ENTRYPOINT ["node", "--disable-proto=throw", "scripts/onprem/server.mjs"]
