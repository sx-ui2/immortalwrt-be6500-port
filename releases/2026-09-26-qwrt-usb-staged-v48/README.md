# WITHDRAWN — DO NOT FLASH: BE6500 v48

The physical router still failed to boot with this image. Although the M31 and
UniPHY modules were excluded from automatic loading, changing the persistent
kernel configuration and DTB to the legacy QWRT USB contract was enough to
break the boot path. Use the boot-confirmed v41 recovery image, or v49 and
later builds that restore the v41 kernel/DTB baseline.

The remaining text is retained only as a record of the failed experiment.

This release first fixes the repeated **failure to boot** seen with the v47
USB experiment. It does not automatically probe either BE6500 hardware PHY
during startup. The standard DWC3 wrapper/core may load and defer while its PHY
providers are absent, but neither PHY initialization sequence or PHY register
programming runs before the normal network and LuCI startup path.

## What the QWRT comparison found

The working QWRT image does not use the Linux 6.6 generic M31 PHY contract used
by v47. It uses Qualcomm's legacy `usb_phy` implementation:

- compatible: `qca,ipq5332-m31-usb-hsphy`;
- M31 window: `0x0007b000 + 0x12c`;
- QSCRATCH window: `0x08af8800 + 0x400`;
- reset: `usb2_phy_reset`;
- DWC3 consumes USB2 through `usb-phy`, while USB3 remains the generic
  `phy-qca-uniphy` provider;
- QWRT registers DWC3 before loading the M31 and UniPHY drivers.

QWRT's TCSR mux expression and the QSDK 14 expression look different, but both
resolve to the same physical register `0x1947540`. The mux offset was therefore
not the boot failure. The incompatible PHY binding and lifecycle were the real
difference.

v48 ports the QWRT M31 programming sequence to kernel 6.6 and reproduces that
consumer topology. The final DTB and SquashFS were inspected after the build,
not only the source tree.

## Safe staged USB test

Neither `qca-m31-usb-phy.ko` nor `phy-qca-uniphy.ko` has an automatic module
load entry. There is no USB probe init service and no delayed background retry.

After the router has fully booted and both LuCI and SSH work, check the safe
state:

```sh
be6500-usb-host status
```

Then perform the first hardware probe explicitly:

```sh
be6500-usb-host probe
```

The helper loads DWC3 first and then the two PHY drivers in the same relative
order as QWRT. If the physical probe still locks the board, power-cycle it. The
next boot remains on the safe path because the PHY drivers are not loaded
automatically and no failed-probe state is replayed.

USB mass storage, UAS, common storage adapters, printer support, block hotplug,
DiskMan, ext4, exFAT, FAT, NTFS3, Btrfs, Samba 4, SFTP, disk idle management,
partitioning and SMART packages remain included. Their hardware operation can
only be validated after the one-time manual PHY probe succeeds.

## Firmware files

- `immortalwrt-qualcommax-ipq53xx-jdcloud_be6500-squashfs-sysupgrade.bin` is
  for **System > Backup / Flash Firmware** in a running ImmortalWrt/OpenWrt
  installation. Do not use **Force upgrade** if validation fails.
- `immortalwrt-qualcommax-ipq53xx-jdcloud_be6500-ubootkit-factory.bin` is only
  for the uBootKit **Firmware Update** page. Do not upload the sysupgrade image
  there.
- Keep the boot-confirmed v41 uBootKit recovery image available during this
  first physical test.

## Verification

- All 153 project tests pass; the helper passes `sh -n` and the tree passes
  `git diff --check`.
- The full firmware build completed for kernel `6.6.116+`.
- The final SquashFS contains `qca-m31-usb-phy.ko`,
  `phy-qca-uniphy.ko`, and `/usr/sbin/be6500-usb-host`; neither hardware PHY is
  present in `/etc/modules.d`.
- The final FIT DTB contains the QWRT M31/QSCRATCH register windows, legacy
  `usb-phy` link, USB3 UniPHY link and the common mux register. DTB SHA-256:
  `86f49286f709fef9d654a8ce47a854cfb35fc7641793f30b8faf849c61e9e46b`.
- Sysupgrade metadata identifies `jdcloud,be6500`.
- The uBootKit image was byte-checked against the sysupgrade kernel and rootfs:
  its SquashFS starts at `0x700000` and it ends in `DEADC0DE`.

This release is build-, package-, FIT/DTB- and root-filesystem-verified. The
router's physical USB enumeration is intentionally not claimed as validated
until the manual probe is tested. No router was automatically flashed while
producing this release.
