 #!/usr/bin/env bash
# Generate RS256 JWT key pair for Nexa / Secure Chat (dev).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/infrastructure/jwt"
mkdir -p "$OUT"
openssl genrsa -out "$OUT/private.pem" 2048 2>/dev/null
openssl rsa -in "$OUT/private.pem" -pubout -out "$OUT/public.pem" 2>/dev/null
chmod 600 "$OUT/private.pem"
echo "Wrote $OUT/private.pem and $OUT/public.pem"
echo "Set in .env:"
echo "  JWT_ALGORITHM=RS256"
echo "  JWT_ACCESS_PRIVATE_KEY_FILE=$OUT/private.pem"
echo "  JWT_ACCESS_PUBLIC_KEY_FILE=$OUT/public.pem"
