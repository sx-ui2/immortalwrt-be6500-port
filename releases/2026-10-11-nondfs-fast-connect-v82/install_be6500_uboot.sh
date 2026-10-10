#!/bin/sh
# Install the verified uboot-qsdk12.5-build image into both JDCloud BE6500
# APPSBL slots.  Read-only check/backup is the default; writing requires an
# explicit mode and confirmation word.

set -eu

MODE="${1:-check}"
IMAGE="${2:-./uboot-ipq53xx-jdcloud_re-cs-06-260816_142236_3011049.bin}"
BACKUP_DIR="${3:-/tmp/be6500-uboot-backup}"
CONFIRM="${4:-}"
EXPECTED_SHA=cead2ac1bfc6731f727a51226f49011b297eaee269e34277bfcdd0d9f84190cd
EXPECTED_SIZE=655360

fail() {
	echo "错误：$*" >&2
	exit 1
}

part_name() {
	sed -n 's/^PARTNAME=//p' "/sys/class/block/$1/uevent" 2>/dev/null | head -n 1
}

check_slot() {
	local node="$1" start="$2" name="$3"
	[ -b "/dev/$node" ] || fail "缺少 /dev/$node"
	[ "$(cat "/sys/class/block/$node/start" 2>/dev/null)" = "$start" ] || fail "$node 起始扇区不匹配"
	[ "$(cat "/sys/class/block/$node/size" 2>/dev/null)" = 1536 ] || fail "$node 大小不是 786432 字节"
	[ "$(part_name "$node")" = "$name" ] || fail "$node 分区标签不是 $name"
}

[ "$MODE" = check ] || [ "$MODE" = apply ] || fail "用法：$0 check|apply UBOOT文件 [备份目录] [确认词]"
[ -f "$IMAGE" ] || fail "找不到 U-Boot 文件：$IMAGE"
[ "$(wc -c < "$IMAGE" | tr -d ' ')" = "$EXPECTED_SIZE" ] || fail "U-Boot 文件大小不匹配"
[ "$(sha256sum "$IMAGE" | awk '{print $1}')" = "$EXPECTED_SHA" ] || fail "U-Boot SHA256 不匹配"
[ "$(dd if="$IMAGE" bs=4 count=1 2>/dev/null | od -An -tx1 | tr -d ' \n')" = 7f454c46 ] || fail "U-Boot 文件不是 ELF 镜像"

# Model strings in the stock multi-DTB image are generic, so use the exact
# immutable boot-partition map as the hardware identity check.
[ "$(cat /sys/class/block/mmcblk0/size 2>/dev/null)" = 244252672 ] || fail "eMMC 容量不匹配"
check_slot mmcblk0p14 16930 '0:APPSBL'
check_slot mmcblk0p15 18466 '0:APPSBL_1'

mkdir -p "$BACKUP_DIR"
dd if=/dev/mmcblk0p14 of="$BACKUP_DIR/APPSBL-stock.bin" bs=512 count=1536 2>/dev/null
dd if=/dev/mmcblk0p15 of="$BACKUP_DIR/APPSBL_1-stock.bin" bs=512 count=1536 2>/dev/null
sha256sum "$BACKUP_DIR"/*.bin > "$BACKUP_DIR/SHA256SUMS"
sync

echo "U-Boot 文件和 BE6500 分区校验通过；原引导器备份位于 $BACKUP_DIR。"
cat "$BACKUP_DIR/SHA256SUMS"

if [ "$MODE" = check ]; then
	echo "当前仅检查和备份，没有写入。请先把整个备份目录复制到电脑。"
	exit 0
fi

[ "$CONFIRM" = I_HAVE_COPIED_THE_UBOOT_BACKUP ] || fail "未提供确认词 I_HAVE_COPIED_THE_UBOOT_BACKUP"

dd if="$IMAGE" of=/dev/mmcblk0p14 bs=65536 conv=fsync 2>/dev/null
dd if="$IMAGE" of=/dev/mmcblk0p15 bs=65536 conv=fsync 2>/dev/null
sync

for node in mmcblk0p14 mmcblk0p15; do
	actual="$(dd if="/dev/$node" bs=1 count="$EXPECTED_SIZE" 2>/dev/null | sha256sum | awk '{print $1}')"
	[ "$actual" = "$EXPECTED_SHA" ] || fail "$node 写后校验失败；不要断电或重启"
done

echo "两个 APPSBL 槽写入并回读校验成功。现在可以重启并按住机身按钮进入 uBootKit。"
