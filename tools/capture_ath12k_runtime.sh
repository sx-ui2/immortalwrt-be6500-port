#!/bin/sh
# Read-only BE6500 ath12k evidence capture.  Redirect stdout on the caller.
set -u

section() {
	printf '\n### %s\n' "$1"
}

section metadata
date -u '+utc=%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || true
uname -a 2>/dev/null || true
[ -r /tmp/sysinfo/board_name ] && sed 's/^/board_name=/' /tmp/sysinfo/board_name

section ath12k_module_parameters
for parameter in debug_mask debug_level mlo_capable; do
	path="/sys/module/ath12k/parameters/$parameter"
	if [ -r "$path" ]; then
		printf '%s=' "$parameter"
		cat "$path"
	else
		printf '%s=unavailable\n' "$parameter"
	fi
done

section pci
if command -v lspci >/dev/null 2>&1; then
	lspci -nn -k 2>/dev/null || lspci -nn 2>/dev/null || true
else
	find /sys/bus/pci/devices -maxdepth 2 -type f \
		\( -name vendor -o -name device -o -name revision \) \
		-print -exec cat {} \; 2>/dev/null || true
fi

section packaged_firmware
firmware_root=/lib/firmware/ath12k/QCN92XX/hw1.0
if [ -d "$firmware_root" ]; then
	find "$firmware_root" -maxdepth 1 -type f -o -type l 2>/dev/null | sort
	if command -v sha256sum >/dev/null 2>&1; then
		for firmware in "$firmware_root"/*; do
			[ -f "$firmware" ] && sha256sum "$firmware"
		done
	fi
else
	printf 'missing=%s\n' "$firmware_root"
fi

section ieee80211_phys
find /sys/class/ieee80211 -maxdepth 2 -print 2>/dev/null || true
command -v iw >/dev/null 2>&1 && iw phy 2>/dev/null || true

section ath12k_kernel_log
dmesg 2>/dev/null | grep -Ei \
	'ath12k|qcn92|17cb:1109|phy capability|WMI_INIT|board data|BDF|caldata|calibration' || true

