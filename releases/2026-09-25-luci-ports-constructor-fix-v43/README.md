# BE6500 v43 — boot-safe LuCI physical-port fix

This release fixes the LuCI error:

```text
"be6500.ports" factory yields invalid constructor
```

## What changed

- Exports `be6500.ports` as a LuCI `baseclass` instance.
- Advances the LuCI asset cache marker from `be6500v24` to `be6500v25`, so a
  browser cannot keep loading the broken module after an upgrade.
- Records `luci-app-rejected-clients` release 40 in the image package metadata.

## Boot-safety boundary

The kernel, FIT and boot path come directly from the boot-confirmed v41 image.
This release does **not** include the withdrawn v42 USB PHY changes or any later
experimental USB work. Only the LuCI module, its patch helper, cache marker and
package metadata were changed in the root filesystem.

## Files

- `immortalwrt-qualcommax-ipq53xx-jdcloud_be6500-squashfs-sysupgrade.bin`:
  install from a running ImmortalWrt/OpenWrt system.
- `be6500-v43-ubootkit-factory.bin`: factory-layout image for the uBootKit
  firmware-update page. Do not upload the sysupgrade image to uBootKit.
- `be6500-ports-constructor-hotfix_1.0-1_all.ipk`: UI-only hotfix for an already
  running v41 installation; it does not restart networking or Wi-Fi.

## Verification

- The final SquashFS contains `require baseclass` and
  `return baseclass.extend(...)` in
  `/www/luci-static/resources/be6500/ports.js`.
- The final patch helper and LuCI header both use cache marker `be6500v25`.
- The final package metadata reports `luci-app-rejected-clients` release 40.
- `/dev/console` and the original filesystem layout are retained.
- The physical-port UI regression suite passes all 14 tests.
- All distributed artifacts pass `SHA256SUMS`.

This image has been statically verified but has not yet been flashed to the
router. Keep the boot-confirmed v41 image available for recovery until v43 has
completed its first hardware boot test.
