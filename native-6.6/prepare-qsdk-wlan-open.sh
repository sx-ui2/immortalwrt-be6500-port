#!/bin/sh
set -eu

if [ "$#" -ne 2 ]; then
	echo "usage: $0 /absolute/immortalwrt /absolute/qsdk14-r9" >&2
	exit 2
fi

iwrt=$1
qsdk=$2
self_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
feed="$qsdk/feeds-wlan-open"
source_tree="$qsdk/wlan-open/backports-6.1-9a0dddfb3"
target="$iwrt/package/kernel/mac80211"
source_target="$iwrt/qca/src/mac80211/wlan-open/backports-6.1-9a0dddfb3"

[ -f "$iwrt/rules.mk" ]
[ -f "$feed/Makefile" ]
[ -f "$source_tree/drivers/net/wireless/ath/ath12k/wifi7/pci.c" ]

feed_rev=$(git -C "$feed" rev-parse HEAD)
source_rev=$(git -C "$qsdk/wlan-open" rev-parse HEAD)
[ "$feed_rev" = "1ee3a4ab7c59ceaff347c4668fc6c7604a04c323" ]
[ "$source_rev" = "cc4cc0e38e4cd169220dd8c54165dcf43f9fea71" ]

rm -rf "$target.qsdk-stage1"
cp -a "$feed" "$target.qsdk-stage1"
rm -rf "$target.qsdk-stage1/.git" \
	"$target.qsdk-stage1/qca-wifi-nss-plugins" \
	"$target.qsdk-stage1/wifi-scripts"
patch -d "$target.qsdk-stage1" -p1 < "$self_dir/qsdk-wlan-open-minimal.patch"

rm -rf "$source_target"
mkdir -p "$(dirname -- "$source_target")"
cp -a "$source_tree" "$source_target"
rm -rf "$source_target/.git"
patch -d "$source_target" -p1 < "$self_dir/qsdk-wlan-open-source-minimal.patch"

rm -rf "$target"
mv "$target.qsdk-stage1" "$target"

printf 'QSDK wlan-open stage1 prepared\nfeed=%s\nsource=%s\n' "$feed_rev" "$source_rev"
