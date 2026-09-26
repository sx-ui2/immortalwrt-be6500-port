# BE6500 v47 — Linux 6.6 native IPQ5332 USB PHY

This release replaces the incompatible QWRT 5.4 USB PHY path with the native
QSDK 14 / Linux 6.6 implementation identified during diagnosis.

## USB fix

- The production device tree uses `qcom,ipq5332-usb-hsphy`, matching the
  `qcom-m31usb-phy` driver. The old
  `qca,ipq5332-m31-usb-hsphy` binding is not used by this image.
- The M31 node now supplies the required `cfg_ahb` clock name and an always-on
  5 V `vdd-supply` matching the Linux 6.6 binding.
- The shared PCIe/USB UniPHY is explicitly switched to USB with
  `qcom,multiplexed-phy`.
- The inherited `ubs2-phy` typo is corrected to `usb2-phy`.
- `phy-qcom-m31.ko` and `phy-qca-uniphy.ko` are built directly from the pinned
  QSDK 14 Linux 6.6 source.

The PHY modules are deliberately not placed in `/etc/modules.d`. A guarded
service waits 45 seconds after normal boot, records a persistent `probing`
state, and only then loads the PHY/DWC3 modules. If that first probe interrupts
the router, the next boot sees the unfinished state and does not repeat it.
Status can be read with:

```sh
be6500-usb-host status
```

`kmod-usb-phy-ipq5018_6.6.116-r4_aarch64_cortex-a53.ipk` is included for
inspection, but installing only the IPK on an older image does not apply the
required device-tree corrections. Use the complete firmware for hardware
testing.

## Removed LAN device-page experiment

The LAN1–LAN3 virtual cards and `physicalports_v45.js` are removed. They are
QCA8386 switch ports rather than independent Linux network devices, so the
native LuCI device list is left unchanged. Existing port-role controls under
Router Settings remain available.

## Firmware files

- `immortalwrt-qualcommax-ipq53xx-jdcloud_be6500-squashfs-sysupgrade.bin` is
  only for **System > Backup / Flash Firmware** in a running OpenWrt system.
  Do not force the upgrade if image validation fails.
- `immortalwrt-qualcommax-ipq53xx-jdcloud_be6500-ubootkit-factory.bin` is only
  for the uBootKit **Firmware Update** page. It contains a byte-identical FIT
  kernel, SquashFS at offset `0x700000`, and the `DEADC0DE` end marker. Do not
  upload the sysupgrade tar to uBootKit.
- Keep the boot-confirmed v41 uBootKit recovery image available while testing
  USB. This v47 USB hardware path has passed build/static validation but has
  not yet been confirmed on the physical router.

## Verification

- All 152 project tests pass and all modified shell scripts pass `sh -n`.
- Both native PHY modules compile for kernel `6.6.116+` and are present in the
  final SquashFS with no PHY autoload entry.
- The final FIT embeds the corrected DTB. Selected DTB SHA-256:
  `7ef5969ce6aeadfb8c83ee49870087775812ab54ec66524326d0b4a1caaf6e88`.
- Kernel Image SHA-256 remains byte-identical to boot-confirmed v41:
  `c178f8503543ceb9fd8a2ab02209a8976091fa7661acad31362d28c5da430173`.
- Sysupgrade metadata identifies `jdcloud,be6500`.
- The uBootKit image was independently checked against the sysupgrade kernel
  and rootfs, including its SquashFS offset and trailer.

No router was automatically flashed while producing this release.
