# ==============================================================================
# Barva Backend - Multi-stage production container
# ==============================================================================
FROM golang:1.27-alpine AS builder

WORKDIR /app

RUN apk add --no-cache git ca-certificates

COPY go.mod go.sum ./
RUN go mod download

COPY . .

# TARGETARCH diisi BuildKit saat membangun lintas arsitektur; fallback ke amd64
# untuk builder klasik. Tanpa ini image hanya jalan di mesin x86.
ARG TARGETARCH
RUN CGO_ENABLED=0 GOOS=linux GOARCH=${TARGETARCH:-amd64} \
    go build -ldflags="-s -w" -o /app/bin/server ./cmd/server

# Production Runner
FROM alpine:3.20

# ca-certificates untuk HTTPS keluar, tzdata agar waktu log benar.
# ffmpeg tidak dipakai kode Go, jadi tidak dipasang.
RUN apk add --no-cache ca-certificates tzdata

# Jalankan sebagai user non-root. Direktori data dibuat di image supaya volume
# bernama yang masih kosong mewarisi kepemilikan yang benar.
RUN addgroup -S -g 10001 barva \
    && adduser -S -u 10001 -G barva barva \
    && mkdir -p /data/storage /data/tmp /app/data \
    && chown -R barva:barva /data /app

COPY --from=builder /app/bin/server /app/server

USER barva

WORKDIR /app

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:8080/health || exit 1

ENTRYPOINT ["/app/server"]
