from pathlib import Path
import shutil
import unittest

import check_native_core as core

FIXTURE = Path(__file__).resolve().parents[1] / "native-6.6/artifacts/core.static-only.dtb"


class OverrideTree:
    """Read the compiled DTB, replacing only the property under test."""
    def __init__(self, overrides=None, extra_children=None):
        self.base = core.Fdt(FIXTURE)
        self.overrides = overrides or {}
        self.extra_children = extra_children or {}

    def get(self, path, prop, kind="s"):
        if (path, prop) in self.overrides:
            return self.overrides[path, prop]
        return self.base.get(path, prop, kind)

    def cells(self, path, prop):
        if (path, prop) in self.overrides:
            return self.overrides[path, prop]
        return self.base.cells(path, prop)

    def children(self, path):
        return self.base.children(path) + self.extra_children.get(path, [])

    def has(self, path, prop):
        if (path, prop) in self.overrides:
            return True
        return self.base.has(path, prop)


@unittest.skipUnless(shutil.which("fdtget"), "requires device-tree-compiler fdtget")
class NativeCoreTests(unittest.TestCase):
    def result(self, overrides=None, extra_children=None):
        return core.validate(OverrideTree(overrides, extra_children))

    def test_real_compiled_core_facts(self):
        result = self.result()
        self.assertTrue(result["ok"], result["errors"])
        self.assertFalse(result["boot_validated"])
        self.assertFalse(result["flashable"])
        self.assertEqual(11, result["fixed_reservations"])

    def test_512mb_regression(self):
        self.assertFalse(self.result({("/memory@40000000", "reg"):
                                     [0, 0x40000000, 0, 0x20000000]})["ok"])

    def test_old_uart_clock_ids(self):
        gcc = core.Fdt(FIXTURE).cells(core.GCC, "phandle")[0]
        self.assertFalse(self.result({(core.UART, "clocks"): [gcc, 18, gcc, 7]})["ok"])

    def test_old_emmc_clock_ids(self):
        clocks = core.Fdt(FIXTURE).cells(core.MMC, "clocks")
        clocks[1], clocks[3] = 123, 124
        self.assertFalse(self.result({(core.MMC, "clocks"): clocks})["ok"])

    def test_old_gcc_compatible(self):
        self.assertFalse(self.result({(core.GCC, "compatible"): "qcom,gcc-ipq5332"})["ok"])

    def test_reference_board_led_pin(self):
        gpio = core.Fdt(FIXTURE).cells("/leds/led-blue", "gpios")
        gpio[1] = 36
        self.assertFalse(self.result({("/leds/led-blue", "gpios"): gpio})["ok"])

    def test_accidental_radio_enable(self):
        self.assertFalse(self.result({(core.SOC + "/wifi@c0000000", "status"): "okay"})["ok"])

    def test_accidental_ethernet_enable(self):
        self.assertFalse(self.result({(core.SOC + "/mdio@90000", "status"): "okay"})["ok"])

    def test_old_root_bootargs_rejected(self):
        self.assertFalse(self.result({("/chosen", "bootargs"): "root=PARTUUID=old"})["ok"])

    def test_overlapping_reservation(self):
        result = self.result({("/reserved-memory/m3-dump@4cc00000", "reg"):
                              [0, 0x4CB00000, 0, 0x200000]})
        self.assertTrue(any("Overlapping" in x for x in result["errors"]))

    def test_reservation_outside_ram(self):
        result = self.result({("/reserved-memory/qcn9224-pcie1@51e00000", "reg"):
                              [0, 0x7FF00000, 0, 0x3200000]})
        self.assertTrue(any("outside" in x for x in result["errors"]))

    def test_wireless_memory_not_bound(self):
        self.assertFalse(self.result({(core.SOC + "/remoteproc@d100000", "memory-region"):
                                     [123]})["ok"])


if __name__ == "__main__":
    unittest.main()
