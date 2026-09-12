from pathlib import Path
import shutil
import unittest

import check_native_core as core
import check_native_wired_initramfs as wired


FIXTURE = Path(__file__).resolve().parents[1] / "native-6.6/artifacts/wired-initramfs.static-only.dtb"
OPENWRT_FIXTURE = Path(__file__).resolve().parents[1] / "native-6.6/artifacts/wired-initramfs-openwrt-build.dtb"


class OverrideTree:
    def __init__(self, overrides=None):
        self.base = core.Fdt(FIXTURE)
        self.overrides = overrides or {}

    def get(self, path, prop, kind="s"):
        return self.overrides[path, prop] if (path, prop) in self.overrides else self.base.get(path, prop, kind)

    def cells(self, path, prop):
        return self.overrides[path, prop] if (path, prop) in self.overrides else self.base.cells(path, prop)

    def has(self, path, prop):
        return (path, prop) in self.overrides or self.base.has(path, prop)

    def children(self, path):
        return self.base.children(path)


@unittest.skipUnless(shutil.which("fdtget") and FIXTURE.is_file(), "requires compiled wired initramfs DTB")
class NativeWiredInitramfsTests(unittest.TestCase):
    def result(self, overrides=None):
        return wired.validate(OverrideTree(overrides))

    def reject(self, overrides):
        result = self.result(overrides)
        self.assertFalse(result["ok"], result)

    def test_real_candidate_is_static_only(self):
        result = self.result()
        self.assertTrue(result["ok"], result["errors"])
        for key in ("boot_validated", "flashable", "sysupgrade_generated"):
            self.assertFalse(result[key])

    def test_openwrt_release_dtb_without_symbols(self):
        if not OPENWRT_FIXTURE.is_file():
            self.skipTest("formal OpenWrt build DTB is not present")
        tree = core.Fdt(OPENWRT_FIXTURE)
        self.assertNotIn("__symbols__", tree.children("/"))
        result = wired.validate(tree)
        self.assertTrue(result["ok"], result["errors"])

    def test_reject_embedded_flash_root_policy(self):
        self.reject({("/chosen", "bootargs"): "root=/dev/mmcblk0p20 rootwait"})

    def test_reject_missing_reference_clock_argument(self):
        self.reject({("/chosen", "bootargs-append"): ""})

    def test_reject_radio_enabled(self):
        self.reject({(core.SOC + "/wifi1@c0000000", "status"): "okay"})

    def test_reject_pcie_enabled(self):
        self.reject({(core.SOC + "/pcie@18000000", "status"): "okay"})

    def test_reject_unvalidated_usb_or_license_manager(self):
        self.reject({(core.SOC + "/usb3@8a00000", "status"): "okay"})
        self.reject({("/license_manager", "status"): "okay"})


if __name__ == "__main__":
    unittest.main()
