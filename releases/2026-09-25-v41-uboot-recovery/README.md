# BE6500 v41 U-Boot recovery

Use `be6500-v41-uboot-recovery.img` only from the BE6500 U-Boot recovery
interface. Do not upload the normal OpenWrt `sysupgrade.bin` to U-Boot: it is a
tar archive, not the Qualcomm scripted recovery FIT expected by this bootloader.

This recovery image contains the exact HLOS FIT and SquashFS root filesystem
from the boot-confirmed v41 release. Its script writes only `0:HLOS` and
`rootfs`; it does not overwrite ART, WIFIFW, factory data, GPT, U-Boot or other
calibration partitions.

The image validates the known IPQ5332 SoC/machine IDs before writing. Keep
power connected throughout the operation. After the upload reports success,
wait for the write to complete and let the router reboot before disconnecting
Ethernet or power.

Do not use withdrawn v42. Its generic Linux 6.6 USB PHY path stalls during
DWC3/xHCI initialization on this board.

SHA-256 for the U-Boot recovery image:
`a0367bd08743dcadcf4fe307020d8caf9e14f3798efe3d9b91c61fc8472ea00c`.
