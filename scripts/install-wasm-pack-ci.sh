#!/usr/bin/env bash
set -euo pipefail

# The release identity and SHA-256 digests mirror the existing pinned flake.nix.
version=0.14.0
case "$(uname -s)-$(uname -m)" in
  Linux-x86_64)
    target=x86_64-unknown-linux-musl
    digest=278a8d668085821f4d1a637bd864f1713f872b0ae3a118c77562a308c0abfe8d
    ;;
  Linux-aarch64)
    target=aarch64-unknown-linux-musl
    digest=5941c7b05060440ff37ee50fe9009a408e63fa5ba607a3b0736f5a887ec5f2ca
    ;;
  *)
    echo "Unsupported wasm-pack CI host: $(uname -s)-$(uname -m)" >&2
    exit 1
    ;;
esac

working_dir="$(mktemp -d)"
trap 'rm -rf "$working_dir"' EXIT
archive="$working_dir/wasm-pack.tar.gz"
url="https://github.com/wasm-bindgen/wasm-pack/releases/download/v${version}/wasm-pack-v${version}-${target}.tar.gz"
curl --fail --location --silent --show-error --retry 3 "$url" --output "$archive"
printf '%s  %s\n' "$digest" "$archive" | sha256sum --check --status || {
  echo "wasm-pack release checksum did not match the pinned flake.nix digest" >&2
  exit 1
}
tar -xzf "$archive" -C "$working_dir"
install_dir="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/wasm-pack-ci/bin"
mkdir -p "$install_dir"
install -m 0755 "$working_dir/wasm-pack-v${version}-${target}/wasm-pack" "$install_dir/wasm-pack"
"$install_dir/wasm-pack" --version
if [[ -n "${GITHUB_PATH:-}" ]]; then
  printf '%s\n' "$install_dir" >> "$GITHUB_PATH"
else
  printf 'Add %s to PATH to use wasm-pack in subsequent commands.\n' "$install_dir"
fi
