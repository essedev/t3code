#!/usr/bin/env bash
# Creates the stable self-signed code signing identity for fork desktop builds. Squirrel.Mac only
# installs an update signed by the same identity as the running app, so ad-hoc builds cannot update.
# The certificate lives in a dedicated keychain under ~/.t3-fork/codesign, never the login keychain.
# Marking it trusted for code signing needs admin rights once; the script prints that command.
# Idempotent.
set -euo pipefail

DIR="$HOME/.t3-fork/codesign"
KC="$DIR/t3-fork-codesign.keychain-db"
CERT="$DIR/t3-fork-selfsigned.cer"
PWFILE="$DIR/keychain.pw"
IDENTITY="T3 Code Fork Self-Signed"
SYSKC="/Library/Keychains/System.keychain"

mkdir -p "$DIR" && chmod 700 "$DIR"

if [ ! -f "$KC" ] || ! security find-certificate -c "$IDENTITY" "$KC" >/dev/null 2>&1; then
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  cat >"$tmp/cfg" <<EOF
[req]
distinguished_name = dn
x509_extensions = v3
prompt = no
[dn]
CN = $IDENTITY
[v3]
basicConstraints = critical, CA:false
keyUsage = critical, digitalSignature
extendedKeyUsage = critical, codeSigning
EOF
  openssl req -x509 -newkey rsa:2048 -keyout "$tmp/key.pem" -out "$tmp/cert.pem" \
    -days 3650 -nodes -config "$tmp/cfg" 2>/dev/null
  cp "$tmp/cert.pem" "$CERT"
  p12pass="$(openssl rand -hex 12)"
  # -legacy: macOS `security import` cannot read OpenSSL 3's default PKCS#12 encryption.
  openssl pkcs12 -export -legacy -inkey "$tmp/key.pem" -in "$tmp/cert.pem" -out "$tmp/cert.p12" \
    -name "$IDENTITY" -passout pass:"$p12pass" 2>/dev/null ||
    openssl pkcs12 -export -inkey "$tmp/key.pem" -in "$tmp/cert.pem" -out "$tmp/cert.p12" \
      -name "$IDENTITY" -passout pass:"$p12pass" 2>/dev/null
  kcpass="$(openssl rand -hex 16)"
  rm -f "$KC"
  security create-keychain -p "$kcpass" "$KC"
  security set-keychain-settings "$KC"
  security unlock-keychain -p "$kcpass" "$KC"
  security import "$tmp/cert.p12" -k "$KC" -P "$p12pass" -T /usr/bin/codesign
  security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$kcpass" "$KC" >/dev/null
  (
    umask 077
    printf '%s' "$kcpass" >"$PWFILE"
  )
  echo "Created keychain and certificate in $DIR"
else
  security unlock-keychain -p "$(cat "$PWFILE")" "$KC"
  echo "Keychain and certificate already present in $DIR"
fi

# codesign resolves identities through the user search list; `-s` replaces it, so keep the others.
if ! security list-keychains -d user | grep -qF -- "$KC"; then
  existing=()
  while IFS= read -r line; do
    line="${line#"${line%%[![:space:]]*}"}"
    line="${line%\"}"
    line="${line#\"}"
    [ -n "$line" ] && existing+=("$line")
  done < <(security list-keychains -d user)
  security list-keychains -d user -s "${existing[@]}" "$KC"
  echo "Added the keychain to the search list"
fi

if security find-identity -v -p codesigning "$KC" | grep -q "$IDENTITY"; then
  echo "OK: '$IDENTITY' is valid for code signing."
  exit 0
fi

if sudo -n security add-trusted-cert -d -r trustRoot -p codeSign -k "$SYSKC" "$CERT" 2>/dev/null; then
  echo "Trust added."
else
  cat <<MSG

The certificate needs code signing trust, which takes your admin password once. Run:

  sudo security add-trusted-cert -d -r trustRoot -p codeSign -k "$SYSKC" "$CERT"

Then run this script again. To undo later: sudo security remove-trusted-cert -d "$CERT"
MSG
  exit 2
fi

if security find-identity -v -p codesigning "$KC" | grep -q "$IDENTITY"; then
  echo "OK: '$IDENTITY' is valid for code signing."
else
  echo "Trust was added but the identity is not valid yet; check it manually." >&2
  exit 3
fi
