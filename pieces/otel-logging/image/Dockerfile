# OpenTelemetry Collector (contrib) + journalctl.
# The upstream otel/opentelemetry-collector-contrib image is distroless and has
# NO journalctl, which the journald receiver shells out to — so node/system logs
# (k3s, containerd, kubelet, sshd, kernel) can't be collected with the stock image.
# This adds systemd's journalctl on a slim Debian base and copies the collector
# binary in. Built + pushed to Harbor; the otel-agent DaemonSet runs it.
#
# Build/push (from repo root). REGISTRY_HOST is the estate's registry (identity
# REGISTRY_HOST); the base images come from its `mirror` project:
#   docker build --build-arg REGISTRY_HOST=<registry> \
#     -t <registry>/<apps project>/otel-collector-journald:0.111.0 seb/pieces/otel-logging/image
#   docker push  <registry>/<apps project>/otel-collector-journald:0.111.0
ARG REGISTRY_HOST
FROM ${REGISTRY_HOST}/mirror/docker.io/otel/opentelemetry-collector-contrib:0.111.0@sha256:2b0e2d76d3eb2013a34350ffb18d4863082a47bfa6ca98ca127413a59c35ef01 AS otel

FROM ${REGISTRY_HOST}/mirror/docker.io/library/debian:bookworm-slim@sha256:a3bba7dc7dbcc1f37c2856c51fc9a7fac96608f50cb87b1b4e4d8b8c85ae988e
# systemd package provides /usr/bin/journalctl (+ libsystemd). no-install-recommends
# keeps it lean; we only need the journal reader, not the init system.
RUN apt-get update \
 && apt-get install -y --no-install-recommends systemd ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY --from=otel /otelcol-contrib /otelcol-contrib
ENTRYPOINT ["/otelcol-contrib"]
# ci: build trigger — otel-image.yml builds + pushes :0.111.0 to Harbor.
