# BE6500 v49 — v41 boot-path recovery

v47 and v48 failed to boot and are withdrawn. v49 removes the experimental
USB PHY package from the persistent image and restores the exact boot-critical
kernel and device tree from the boot-confirmed v41 release while retaining the
later root-filesystem and LuCI fixes.

## Boot-path verification

- The complete FIT kernel member is byte-for-byte identical to v41:
  `c6bc95ff1ad2a40e57b80194471cc9907495844ce1c0ff30efa7447984fb1e78`.
- Its compressed Linux subimage is byte-for-byte identical to v41:
  `c1fc0e65a58ceb4080cd7abbfe44973b83630eda58dfc8908a7a77c587eaa2a1`.
- The DTB is byte-for-byte identical to v41:
  `ea0f9168ba9cb14d512a265ba214a6d1cfd464c767f3d872201ed5209334c61a`.
- `CONFIG_NOP_USB_XCEIV` and `CONFIG_EXTCON` are disabled, matching v41.
- `kmod-usb-phy-ipq5018` and `kmod-usb-phy-nop` are absent from the image.
- The v41 USB node topology is retained without the v47/v48 compatible,
  register, PHY-consumer or driver changes.

USB storage, filesystem, Samba, SFTP, printer and disk-management userland
packages remain installed, but USB hardware enumeration is not claimed in this
recovery image. The USB PHY experiment must stay isolated until the router has
first been confirmed to boot reliably again.

## Which file to use

- In the uBootKit recovery page, use
  `immortalwrt-qualcommax-ipq53xx-jdcloud_be6500-ubootkit-factory.bin`.
- In a running ImmortalWrt/OpenWrt system, use
  `immortalwrt-qualcommax-ipq53xx-jdcloud_be6500-squashfs-sysupgrade.bin`.
- Do not upload the sysupgrade archive to uBootKit.
- Do not use the withdrawn v47 or v48 images.

The uBootKit image contains the sysupgrade FIT unchanged, zero-pads the HLOS
slot, places the SquashFS root at `0x700000`, and ends with `DEADC0DE`. Its FIT
and root filesystem were byte-compared with the sysupgrade members after the
image was built.

## Validation

- Full firmware build completed for Linux 6.6.116.
- All 151 project regression tests pass.
- `git diff --check` passes.
- Profile variant: `6.6 v88 boot-confirmed kernel and DTB with USB PHY isolated`.
- No router was automatically flashed while producing this release.

Verify the selected image with `SHA256SUMS` before flashing. Hardware boot of
this newly assembled root filesystem still requires confirmation on the router;
the boot-critical FIT itself is exactly the known-good v41 FIT.
