#!/usr/bin/env python3
"""Decode the sampler's /proc/net addresses and sort them by whose they are.

Reads lines like 0100A8C0:01BB from stdin; prints one line per remote address, prefixed
`cluster:`, `private:`, `loopback:` or `public:`. Only `public:` is a host outside.
"""
import ipaddress
import socket
import struct
import sys

CLUSTER = [ipaddress.ip_network("10.42.0.0/16"), ipaddress.ip_network("10.43.0.0/16"), ipaddress.ip_network("10.0.0.0/16")]
seen = set()
for line in sys.stdin:
    line = line.strip()
    if ":" not in line:
        continue
    addr, port = line.split(":", 1)
    if len(addr) != 8:
        continue
    ip = ipaddress.ip_address(socket.inet_ntoa(struct.pack("<L", int(addr, 16))))
    if str(ip) == "0.0.0.0":
        continue
    label = "public"
    if ip.is_loopback:
        label = "loopback"
    elif any(ip in net for net in CLUSTER):
        label = "cluster"
    elif ip.is_private:
        label = "private"
    seen.add(f"{label}: {ip}:{int(port, 16)}")
print("\n".join(sorted(seen)) if seen else "no remote address seen")
