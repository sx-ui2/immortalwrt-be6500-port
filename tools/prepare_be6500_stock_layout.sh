#!/bin/sh
# Prepare the unused tail of a stock JDCloud BE6500 eMMC for the persistent
# be6500_overlay partition used by this port.  The script is deliberately
# strict: any layout difference aborts before parted is called.

set -eu

MODE="${1:-check}"
BACKUP_DIR="${2:-/tmp/be6500-gpt-backup}"
CONFIRM="${3:-}"
DISK=/dev/mmcblk0
TOTAL_SECTORS=244252672
DATA_START=5058560
DATA_END=244252662
DATA_SIZE=239194103

fail() {
	echo "错误：$*" >&2
	exit 1
}

part_name() {
	sed -n 's/^PARTNAME=//p' "/sys/class/block/$1/uevent" 2>/dev/null | head -n 1
}

check_part() {
	local node="$1" start="$2" size="$3" name="$4"
	[ -b "/dev/$node" ] || fail "缺少 /dev/$node"
	[ "$(cat "/sys/class/block/$node/start" 2>/dev/null)" = "$start" ] || fail "$node 起始扇区不匹配"
	[ "$(cat "/sys/class/block/$node/size" 2>/dev/null)" = "$size" ] || fail "$node 大小不匹配"
	[ "$(part_name "$node")" = "$name" ] || fail "$node 分区标签不是 $name"
}

[ "$MODE" = check ] || [ "$MODE" = apply ] || fail "用法：$0 check|apply [备份目录] [确认词]"
[ -b "$DISK" ] || fail "找不到 $DISK"
[ "$(cat /sys/class/block/mmcblk0/size 2>/dev/null)" = "$TOTAL_SECTORS" ] || fail "eMMC 容量不是已验证的 116.47 GiB 布局"

# These offsets identify the saved JDCloud RE-CS-06/BE6500 stock GPT.  They
# also ensure the proposed tail partition cannot overlap firmware, factory,
# plugin, log or swap data.
check_part mmcblk0p21 72738 14336 '0:HLOS'
check_part mmcblk0p22 87074 14336 '0:HLOS_1'
check_part mmcblk0p23 101410 498722 rootfs
check_part mmcblk0p25 601122 512 factory
check_part mmcblk0p26 601634 2097152 plugin
check_part mmcblk0p27 2698786 262144 log
check_part mmcblk0p28 2960930 2097152 swap

if [ -e /sys/class/block/mmcblk0p24 ]; then
	check_part mmcblk0p24 "$DATA_START" "$DATA_SIZE" be6500_overlay
	echo "be6500_overlay 已存在且布局正确，无需修改。"
	exit 0
fi

mkdir -p "$BACKUP_DIR"
dd if="$DISK" of="$BACKUP_DIR/gpt-primary-34sectors.bin" bs=512 count=34 2>/dev/null
dd if="$DISK" of="$BACKUP_DIR/gpt-secondary-33sectors.bin" bs=512 skip=244252639 count=33 2>/dev/null
sha256sum "$BACKUP_DIR"/*.bin > "$BACKUP_DIR/SHA256SUMS"
sync

echo "GPT 校验通过；刷写前备份已保存到 $BACKUP_DIR："
cat "$BACKUP_DIR/SHA256SUMS"

if [ "$MODE" = check ]; then
	echo "当前仅检查和备份，没有修改分区表。请先把整个备份目录复制到电脑。"
	exit 0
fi

[ "$CONFIRM" = I_HAVE_COPIED_THE_GPT_BACKUP ] || fail "未提供确认词 I_HAVE_COPIED_THE_GPT_BACKUP"
command -v parted >/dev/null 2>&1 || fail "RAM 系统中没有 parted"

parted -s -a none "$DISK" unit s mkpart be6500_overlay ext4 "${DATA_START}s" "${DATA_END}s"
sync
partprobe "$DISK" 2>/dev/null || true
sleep 2
check_part mmcblk0p24 "$DATA_START" "$DATA_SIZE" be6500_overlay
echo "be6500_overlay 已建立；尚未格式化。现在可以从 RAM 系统执行本项目 sysupgrade。"
