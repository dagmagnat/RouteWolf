FROM alpine:3.22
RUN apk add --no-cache python3 nftables dnsmasq iproute2 curl ca-certificates
WORKDIR /work
CMD ["python3", "-m", "unittest", "discover", "-s", "tests", "-p", "test_*.py", "-v"]
