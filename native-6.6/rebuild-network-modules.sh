#!/bin/bash
# Compile isolated source copies against the existing prepared 6.6 kernel.
# Never install, load, pack, upload to a router, or flash these modules.
set -euo pipefail
if [ "$#" -ne 1 ]; then
    printf 'Usage: bash rebuild-network-modules.sh /absolute/immortalwrt-tree\n' >&2
    exit 2
fi
module_root="$1"
case "$module_root" in /*) ;; *) exit 2;; esac
module_linux_root="$module_root/build_dir/target-aarch64_cortex-a53_musl/linux-qualcommax_ipq53xx"
module_kernel="$module_linux_root/linux-6.6.116"
module_staging="$module_root/staging_dir/target-aarch64_cortex-a53_musl"
module_toolchain="$module_root/staging_dir/toolchain-aarch64_cortex-a53_gcc-13.3.0_musl"
module_cross="$module_toolchain/bin/aarch64-openwrt-linux-musl-"
test -x "${module_cross}gcc"
test -s "$module_kernel/Module.symvers"
test "$(< "$module_kernel/include/config/kernel.release")" = '6.6.116+'
grep -qx 'CONFIG_ARM64=y' "$module_kernel/.config"
grep -qx 'CONFIG_NET_DSA_TAG_QCA=y' "$module_kernel/.config"
module_symbols="$module_staging/usr/share/qca-ssdk/qca-ssdk.symvers $module_staging/usr/share/qca-nss-ppe/qca-nss-ppe.symvers"
for module_sym in $module_symbols; do test -s "$module_sym"; done
module_out="$(mktemp -d /tmp/be6500-network-modules.XXXXXX)"
printf 'Isolated module output: %s\n' "$module_out"
export STAGING_DIR="$module_toolchain"
# Do not reuse existing .o/.ko/.cmd files: this must be a fresh source build.
module_excludes=(--exclude='.*' --exclude='*.o' --exclude='*.ko' --exclude='*.mod*'
    --exclude='Module.symvers' --exclude='modules.order' --exclude='ipkg-*'
    --exclude='build')
rsync -a "${module_excludes[@]}" "$module_linux_root/qca-nss-dp-2026.07.28~22555a9f/" "$module_out/nss-dp/"
rsync -a "${module_excludes[@]}" "$module_kernel/drivers/net/dsa/qca/" "$module_out/qca/"
rsync -a "${module_excludes[@]}" "$module_kernel/drivers/net/mdio/" "$module_out/mdio/"
cp "$module_out/nss-dp/hal/soc_ops/ipq53xx/nss_ipq53xx.h" "$module_out/nss-dp/exports/nss_dp_arch.h"
module_make=(make -j4 -C "$module_kernel" ARCH=arm64 "CROSS_COMPILE=$module_cross")
"${module_make[@]}" "M=$module_out/nss-dp" SoC=ipq53xx \
    "EXTRA_CFLAGS=-I$module_staging/usr/include/qca-ssdk -I$module_staging/usr/include/qca-nss-ppe" \
    "KBUILD_EXTRA_SYMBOLS=$module_symbols" modules 2>&1 | tee "$module_out/nss-dp-build.log"
"${module_make[@]}" "M=$module_out/qca" CONFIG_NET_DSA_QCE2204= \
    CONFIG_NET_DSA_QCA8K=m CONFIG_NET_DSA_AR9331= modules 2>&1 | tee "$module_out/qca-build.log"
"${module_make[@]}" "M=$module_out/mdio" CONFIG_MDIO_BITBANG= CONFIG_MDIO_GPIO= \
    CONFIG_MDIO_I2C= CONFIG_MDIO_IPQ4019=m modules 2>&1 | tee "$module_out/mdio-build.log"
for module_path in "$module_out/nss-dp/qca-nss-dp.ko" "$module_out/qca/qca8k.ko" "$module_out/mdio/mdio-ipq4019.ko"; do
    file "$module_path"
    modinfo -F vermagic "$module_path"
    modinfo -F depends "$module_path"
    sha256sum "$module_path"
done | tee "$module_out/module-summary.txt"
printf 'Build only. Nothing installed, loaded or packaged.\n'
