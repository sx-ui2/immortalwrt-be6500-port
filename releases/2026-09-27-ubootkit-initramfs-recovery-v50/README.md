# BE6500 v50 — uBootKit RAM recovery

This release replaces the non-booting uBootKit factory-image path.  Do not use
uBootKit's **Firmware Update** page for this build: that path writes the primary
`0:HLOS` slot and stock bootconfig, while this port is installed to `0:HLOS_1`
and also requires its board-specific overlay/bootstrap setup.

## Correct installation path

1. Open uBootKit's **Initramfs** page.
2. Upload
   `immortalwrt-qualcommax-ipq53xx-jdcloud_be6500-initramfs-uImage.itb`.
   This image boots entirely from RAM and does not write eMMC by itself.
3. After ImmortalWrt starts, open `http://192.168.1.1/`.
4. Go to **System → Backup / Flash Firmware**, upload
   `immortalwrt-qualcommax-ipq53xx-jdcloud_be6500-squashfs-sysupgrade.bin`,
   and clear **Keep settings and retain the current configuration**.
5. Start the normal upgrade.  Do not select force upgrade; this image contains
   valid OpenWrt metadata and identifies `jdcloud,be6500` as the supported
   device.
6. Allow several minutes for the first persistent boot.  Do not interrupt
   power while the sysupgrade page is writing the image.

Never upload the sysupgrade archive to uBootKit, and never upload the
initramfs image to LuCI's firmware-upgrade page.

## What the in-system upgrade fixes

The RAM system's board-specific upgrade script:

- validates the BE6500 board, FIT and SquashFS payloads;
- validates the expected eMMC partition offsets and image sizes;
- writes and verifies the kernel in `0:HLOS_1` and the root filesystem in
  `rootfs`;
- recreates `be6500_overlay` and the bootstrap `rootfs_data` filesystem;
- derives the bootstrap boundary from the actual SquashFS size;
- installs the matching `v74_persistent_boot` and `bootcmd` environment only
  after both payloads have been verified.

The original primary HLOS slot is not overwritten by this path.

## Validation

- Full Linux 6.6.116 build completed successfully.
- The persistent FIT kernel member is byte-for-byte identical to the
  boot-confirmed v41 image:
  `c6bc95ff1ad2a40e57b80194471cc9907495844ce1c0ff30efa7447984fb1e78`.
- Both the RAM image and persistent image use the byte-identical v41 DTB:
  `ea0f9168ba9cb14d512a265ba214a6d1cfd464c767f3d872201ed5209334c61a`.
- The initramfs contains `sysupgrade`, `fw_setenv`, `mkfs.ext4`, `losetup`,
  `block` and the corrected board-specific upgrade script.
- The sysupgrade image has a readable metadata trailer for
  `jdcloud,be6500`.
- No router was automatically accessed or flashed while producing this
  release.

Verify both files with `SHA256SUMS` before use.  The build and artifact checks
pass; the final persistent boot still requires confirmation on the physical
router.
