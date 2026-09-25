# BE6500 v41 uBootKit recovery

Use `be6500-v41-ubootkit-factory.bin` only on the BE6500 uBootKit **Firmware
Update** page. Do not upload the normal OpenWrt `sysupgrade.bin` there: it is a
tar archive. Do not use the earlier scripted recovery FIT either; uBootKit
rejects that file type as `invalid_factory_firmware`.

This factory image contains the exact HLOS FIT and SquashFS root filesystem
from the boot-confirmed v41 release. It uses the layout validated by uBootKit:

- HLOS FIT at offset `0`, padded to the 7 MiB HLOS slot;
- SquashFS at offset `0x700000`;
- big-endian `DE AD C0 DE` trailer at a 64 KiB boundary.

Only the firmware kernel and rootfs payloads are present. The image does not
contain ART, WIFIFW, factory data, GPT, U-Boot or calibration partitions.

Keep power connected throughout the operation. After the upload passes
validation and reports success, wait for the write to complete and let the
router reboot before disconnecting Ethernet or power.

Do not use withdrawn v42. Its generic Linux 6.6 USB PHY path stalls during
DWC3/xHCI initialization on this board.

The image is reproducibly built from the v41 sysupgrade archive with
`tools/build_be6500_ubootkit_factory.py`.

SHA-256:
`2304986b285f3fc8be793c91d81770e7ebaf04139ec584c38ebc88ed918a6e38`.
