# ==============================================================================
# Barva Backend - Multi-stage Minimal Production Container (~15 MB)
# ==============================================================================
FROM golang:1.27-alpine AS builder

WORKDIR /app

RUN apk add --no-cache git ca-certificates

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o /app/bin/server ./cmd/server

# Production Runner
FROM alpine:3.20

WORKDIR /app

RUN apk add --no-cache ca-certificates tzdata ffmpeg

COPY --from=builder /app/bin/server /app/server

EXPOSE 8080

ENTRYPOINT ["/app/server"]
