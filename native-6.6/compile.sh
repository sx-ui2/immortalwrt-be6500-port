#!/bin/bash
# Local-to-build-host only. No SSH, router access, image packaging or flashing.
set -euo pipefail
if [ "$#" -lt 2 ] || [ "$#" -gt 3 ]; then
    printf 'Usage: bash compile.sh /absolute/kernel-tree /absolute/aarch64-cpp [core|ethernet|wired-initramfs|radio]\n' >&2
    exit 2
fi
native_dir="$(cd -- "$(dirname -- "$0")" && pwd)"
native_kernel="$1"
native_cpp="$2"
native_variant="${3:-core}"
case "$native_variant" in
    core|ethernet)
        native_source_variant="$native_variant"
        native_checker="$native_variant"
        ;;
    wired-initramfs)
        native_source_variant="$native_variant"
        native_checker="wired_initramfs"
        ;;
    radio)
        native_source_variant="radio-audit"
        native_checker="radio"
        ;;
    *) exit 2;;
esac
case "$native_kernel" in /*) ;; *) exit 2;; esac
case "$native_cpp" in /*) ;; *) exit 2;; esac
test -x "$native_cpp"
command -v dtc >/dev/null
command -v fdtget >/dev/null
python3 - "$native_kernel" <<'PY'
import hashlib, pathlib, sys
root = pathlib.Path(sys.argv[1])
pins = {
    'arch/arm64/boot/dts/qcom/ipq5332.dtsi': 'c8f0caf601173228ef17bd0d79409b5245e0b80872a832a219a6bcee463da3b1',
    'include/dt-bindings/clock/qcom,ipq5332-gcc.h': '1c481f9d5ff6dd52f436bb8a8d9a6c35b6d3bc62b883ccc031cc3f6bfe5eeb12',
}
for name, expected in pins.items():
    if hashlib.sha256((root / name).read_bytes()).hexdigest() != expected:
        raise SystemExit('Source pin mismatch: ' + name)
PY
native_out="$(mktemp -d "/tmp/be6500-native-${native_variant}.XXXXXX")"
printf 'Static-only output: %s\n' "$native_out"
# The OpenWrt compiler wrapper expects STAGING_DIR, even for preprocessing.
export STAGING_DIR="$(dirname -- "$(dirname -- "$native_cpp")")"
"$native_cpp" -nostdinc -undef -D__DTS__ -x assembler-with-cpp \
    -I "$native_kernel/include" -I "$native_kernel/arch/arm64/boot/dts/qcom" \
    "$native_dir/ipq5332-jdcloud-be6500-${native_source_variant}.dts" \
    -o "$native_out/${native_variant}.preprocessed.dts"
dtc -@ -I dts -O dtb -o "$native_out/${native_variant}.static-only.dtb" \
    "$native_out/${native_variant}.preprocessed.dts" 2> "$native_out/dtc.log"
python3 "$native_dir/../tools/check_native_${native_checker}.py" \
    "$native_out/${native_variant}.static-only.dtb" \
    | tee "$native_out/${native_variant}-check.json"
printf 'Warnings retained in dtc.log. No FIT/sysupgrade image generated.\n'
