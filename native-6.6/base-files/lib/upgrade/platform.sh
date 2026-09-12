PART_NAME=firmware
REQUIRE_IMAGE_METADATA=1

# fw_setenv is needed after the eMMC payload has been verified.  Keeping the
# temporary HLOS_1 boot command until then gives this board a usable fallback
# if either write is incomplete.
RAMFS_COPY_BIN='fw_printenv fw_setenv head sha256sum losetup mkfs.ext4 mount umount block'
RAMFS_COPY_DATA='/etc/fw_env.config /var/lock/fw_printenv.lock'

be6500_sysupgrade_dir() {
	local image="$1"
	local board_dir

	board_dir="$(tar tf "$image" | sed -n 's#^\(sysupgrade-[^/]*/\)$#\1#p' | head -n 1)"
	printf '%s' "${board_dir%/}"
}

be6500_mmc_capacity() {
	local device="$1"
	local sectors

	sectors="$(cat "/sys/class/block/${device##*/}/size" 2>/dev/null)" || return 1
	[ -n "$sectors" ] || return 1
	printf '%s\n' "$((sectors * 512))"
}

be6500_payload_size() {
	local image="$1"
	local member="$2"

	tar xf "$image" "$member" -O 2>/dev/null | wc -c
}

be6500_payload_magic() {
	local image="$1"
	local member="$2"

	tar xf "$image" "$member" -O 2>/dev/null | head -c 4 | hexdump -v -e '4/1 "%02x"'
}

be6500_verify_payload() {
	local image="$1"
	local member="$2"
	local device="$3"
	local bytes="$4"
	local image_hash device_hash

	image_hash="$(tar xf "$image" "$member" -O | sha256sum | awk '{print $1}')" || return 1
	device_hash="$(head -c "$bytes" "$device" | sha256sum | awk '{print $1}')" || return 1

	[ -n "$image_hash" ] && [ "$image_hash" = "$device_hash" ]
}

be6500_large_overlay() {
	find_mmc_part be6500_overlay
}

be6500_write_extroot_fstab() {
	local overlay_mnt="$1"
	local data_uuid="$2"

	mkdir -p "$overlay_mnt/upper/etc/config" "$overlay_mnt/work"
	cat > "$overlay_mnt/upper/etc/config/fstab" <<-EOF
	config global
		option anon_swap '0'
		option anon_mount '1'
		option auto_swap '1'
		option auto_mount '1'
		option delay_root '5'
		option check_fs '0'

	config mount
		option target '/overlay'
		option uuid '$data_uuid'
		option enabled '1'

	config swap
		option device '/dev/mmcblk0p28'
		option enabled '1'
	EOF
}

be6500_create_bootstrap_overlay() {
	local root_dev="$1"
	local root_blocks="$2"
	local data_uuid="$3"
	local root_capacity overlay_blocks loop_dev overlay_mnt=/tmp/be6500-bootstrap

	root_blocks=$(((root_blocks + 127) & ~127))
	root_capacity="$(cat "/sys/class/block/${root_dev##*/}/size")" || return 1
	overlay_blocks=$((root_capacity - root_blocks))
	[ "$overlay_blocks" -gt 16384 ] || return 1

	loop_dev="$(losetup -f)" || return 1
	losetup -o $((root_blocks * 512)) --sizelimit $((overlay_blocks * 512)) \
		"$loop_dev" "$root_dev" || return 1
	mkfs.ext4 -F -b 4096 -m 0 -L rootfs_data "$loop_dev" || {
		losetup -d "$loop_dev"
		return 1
	}
	mkdir -p "$overlay_mnt"
	mount -t ext4 "$loop_dev" "$overlay_mnt" || {
		losetup -d "$loop_dev"
		return 1
	}
	be6500_write_extroot_fstab "$overlay_mnt" "$data_uuid"
	sync
	umount "$overlay_mnt"
	losetup -d "$loop_dev"
}

platform_check_image() {
	[ "$(board_name)" = "jdcloud,be6500" ] || {
		echo "Unsupported board: $(board_name)"
		return 1
	}

	local image="$1"
	local board_dir kernel_dev root_dev data_dev kernel_size root_size kernel_capacity root_capacity
	board_dir="$(be6500_sysupgrade_dir "$image")"
	[ "$board_dir" = "sysupgrade-jdcloud_be6500" ] || {
		echo "Invalid sysupgrade archive"
		return 1
	}

	[ "$(be6500_payload_magic "$image" "$board_dir/kernel")" = "d00dfeed" ] || {
		echo "BE6500 kernel payload is not a FIT image"
		return 1
	}
	[ "$(be6500_payload_magic "$image" "$board_dir/root")" = "68737173" ] || {
		echo "BE6500 root payload is not a squashfs image"
		return 1
	}

	kernel_dev="$(find_mmc_part '0:HLOS_1')"
	root_dev="$(find_mmc_part rootfs)"
	data_dev="$(be6500_large_overlay)"
	[ -b "$kernel_dev" ] && [ -b "$root_dev" ] && [ -b "$data_dev" ] || {
		echo "Required eMMC partitions 0:HLOS_1/rootfs/be6500_overlay were not found"
		return 1
	}
	[ "$(cat /sys/class/block/${kernel_dev##*/}/start 2>/dev/null)" = "87074" ] &&
	[ "$(cat /sys/class/block/${root_dev##*/}/start 2>/dev/null)" = "101410" ] || {
		echo "Unexpected BE6500 eMMC partition offsets"
		return 1
	}

	kernel_size="$(be6500_payload_size "$image" "$board_dir/kernel")"
	root_size="$(be6500_payload_size "$image" "$board_dir/root")"
	kernel_capacity="$(be6500_mmc_capacity "$kernel_dev")"
	root_capacity="$(be6500_mmc_capacity "$root_dev")"
	[ "$kernel_size" -gt 0 ] && [ "$root_size" -gt 0 ] &&
	[ "$kernel_size" -le "$kernel_capacity" ] && [ "$root_size" -le "$root_capacity" ] || {
		echo "Firmware payload does not fit the BE6500 eMMC layout"
		return 1
	}
	return 0
}

platform_do_upgrade() {
	local image="$1"
	local board_dir kernel_dev root_dev data_dev data_uuid kernel_size root_size

	case "$(board_name)" in
	jdcloud,be6500)
		board_dir="$(be6500_sysupgrade_dir "$image")"
		kernel_dev="$(find_mmc_part '0:HLOS_1')"
		root_dev="$(find_mmc_part rootfs)"
		data_dev="$(be6500_large_overlay)"
		kernel_size="$(be6500_payload_size "$image" "$board_dir/kernel")"
		root_size="$(be6500_payload_size "$image" "$board_dir/root")"

		# Stage the first persistent build in the secondary HLOS slot.  The
		# original primary HLOS and the v73 RAM image remain untouched.
		CI_KERNPART="0:HLOS_1"
		CI_ROOTPART="rootfs"
		emmc_do_upgrade "$image"
		sync

		be6500_verify_payload "$image" "$board_dir/root" "$root_dev" "$root_size" || {
			echo "BE6500 rootfs verification failed"
			return 1
		}
		be6500_verify_payload "$image" "$board_dir/kernel" "$kernel_dev" "$kernel_size" || {
			echo "BE6500 kernel verification failed"
			return 1
		}
		data_uuid="$(block info "$data_dev" | sed -n 's/.*UUID="\([^"]*\)".*/\1/p')"
		[ -n "$data_uuid" ] && mkfs.ext4 -F -U "$data_uuid" -L be6500_overlay -m 0 "$data_dev" || {
			echo "Unable to refresh the BE6500 large overlay"
			return 1
		}
		mkdir -p /tmp/be6500-overlay
		mount -t ext4 "$data_dev" /tmp/be6500-overlay || return 1
		be6500_write_extroot_fstab /tmp/be6500-overlay "$data_uuid"
		sync
		umount /tmp/be6500-overlay
		# Derive the occupied rootfs sectors from the image itself.  Depending on
		# the sysupgrade caller, EMMC_ROOTFS_BLOCKS may not be exported into the
		# stage2 ramfs; using it left the bootstrap overlay unformatted.
		be6500_create_bootstrap_overlay "$root_dev" "$(((root_size + 511) / 512))" "$data_uuid" || {
			echo "Unable to create the BE6500 extroot bootstrap overlay"
			return 1
		}
		sync

		kernel_blocks=$(((kernel_size + 511) / 512))
		fw_setenv v74_persistent_boot \
			"setenv bootargs \${bootargs} root=/dev/mmcblk0p23 rootfstype=squashfs rootwait; mmc dev 0; mmc read 0x50000000 0x15422 $kernel_blocks; bootm 0x50000000" || {
			echo "Unable to install the staged v74 boot command"
			return 1
		}
		fw_setenv bootcmd 'run v74_persistent_boot' || {
			echo "Unable to activate the staged v74 boot command"
			return 1
		}
		;;
	*)
		default_do_upgrade "$image"
		;;
	esac
}

platform_copy_config() {
	case "$(board_name)" in
	jdcloud,be6500)
		local data_dev overlay_mnt=/tmp/be6500-overlay
		data_dev="$(be6500_large_overlay)"
		mkdir -p "$overlay_mnt"
		mount -t ext4 "$data_dev" "$overlay_mnt" || return 1
		mkdir -p "$overlay_mnt/upper" "$overlay_mnt/work"
		tar -C "$overlay_mnt/upper" -xzf "$UPGRADE_BACKUP"
		sync
		umount "$overlay_mnt"
		;;
	esac
}
