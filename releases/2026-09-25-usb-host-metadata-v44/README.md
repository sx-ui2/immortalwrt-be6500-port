# WITHDRAWN — DO NOT FLASH: BE6500 v44

The v44 image failed to boot on the physical BE6500 and is withdrawn. Its
downloadable firmware, package and build metadata are removed from the current
branch. Use the boot-confirmed v41 uBootKit recovery image instead:

`../2026-09-25-v41-uboot-recovery/be6500-v41-ubootkit-factory.bin`

Static image validation cannot prove that a new USB PHY binding boots on this
hardware. The v44 legacy M31/UniPHY topology is therefore isolated from the
persistent image until it can be tested from a RAM-only image with serial boot
logs. Do not force-upgrade v44 and do not upload its sysupgrade image to
uBootKit.

## Historical description

This release replaces the invalid manually repacked v43 sysupgrade image.  The
v44 sysupgrade image is produced by a complete ImmortalWrt image build and
contains native `fwtool` metadata and the build signature.  LuCI therefore
recognizes `jdcloud,be6500` without selecting **Force upgrade**.

## Choose the correct image

- `immortalwrt-qualcommax-ipq53xx-jdcloud_be6500-squashfs-sysupgrade.bin`
  is for **System > Backup / Flash Firmware** in a running ImmortalWrt/OpenWrt
  installation.  Do not force an image that fails validation.
- `immortalwrt-qualcommax-ipq53xx-jdcloud_be6500-ubootkit-factory.bin` is for
  the **uBootKit firmware-update page**.  It contains the JDCloud factory
  layout: FIT kernel in the 7 MiB HLOS slot, SquashFS at offset `0x700000`, and
  the big-endian `DEADC0DE` trailer.  Do not upload the sysupgrade image to
  uBootKit.
- `luci-app-rejected-clients_41_all.ipk` is an optional UI-only package for an
  already running installation.  It removes the broken dynamic physical-port
  module and adds the USB overview, but it cannot add the new kernel USB PHY
  support by itself.

## Fixed in v44

- Removes the redundant `be6500.ports` module and all runtime injection into
  LuCI's generic device page, fixing `factory yields invalid constructor`.
  Physical port roles stay in **Router Settings > Port Settings**, while the
  normal switch/VLAN page remains the source of switch topology.
- Keeps the cleanup hot-update local to LuCI files; it does not reload network
  or Wi-Fi services.
- Reproduces the OEM IPQ5332 USB topology: the legacy QCA M31 `usb-phy` path
  handles USB 2.0 and QCA UniPHY handles USB 3.0, both loaded as modules after
  the boot-critical path.
- Includes DWC3/xHCI, USB mass storage, UAS, common storage adapters, USB
  printer, block hotplug/automount, ext4/exFAT/FAT/NTFS3/Btrfs, DiskMan,
  Samba 4, SFTP, SMART, partitioning and disk-idle support.
- Adds **Router Settings > USB Devices**, showing real sysfs USB devices and
  mounted storage, with links to disk, file-sharing and printer management.

## Verification

- `fwtool` metadata version: `1.1`
- supported device: `jdcloud,be6500`
- target: `qualcommax/ipq53xx`
- extracted image signature: 516 bytes
- compiled DTB contains `qca,ipq5332-m31-usb-hsphy`, `usb-phy`, USB3 PHY and
  DWC3 host mode.
- final root filesystem contains `qca-m31-usb-phy.ko`,
  `phy-qca-uniphy.ko`, the storage/printer modules and their LuCI services.
- factory layout was independently reconstructed from the sysupgrade archive
  and verified byte-for-byte at its kernel, rootfs and trailer boundaries.
- all 150 project tests pass, and `git diff --check` passes.

The images are statically built and audited, but the new USB PHY topology has
not yet completed a physical-router boot and device-enumeration test.  Keep the
boot-confirmed v41 recovery image available for the first v44 hardware test.
No router was automatically flashed while producing this release.
