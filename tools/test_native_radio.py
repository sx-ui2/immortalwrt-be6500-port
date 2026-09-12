from pathlib import Path
import shutil
import unittest

import check_native_core as core
import check_native_radio as radio

FIXTURE = Path(__file__).resolve().parents[1] / "native-6.6/artifacts/radio.static-only.dtb"


class OverrideTree:
    def __init__(self, overrides=None, extra_children=None):
        self.base = core.Fdt(FIXTURE)
        self.overrides = overrides or {}
        self.extra_children = extra_children or {}

    def get(self, path, prop, kind="s"):
        return self.overrides[path, prop] if (path, prop) in self.overrides else self.base.get(path, prop, kind)

    def cells(self, path, prop):
        return self.overrides[path, prop] if (path, prop) in self.overrides else self.base.cells(path, prop)

    def has(self, path, prop):
        return (path, prop) in self.overrides or self.base.has(path, prop)

    def children(self, path):
        return self.base.children(path) + self.extra_children.get(path, [])


@unittest.skipUnless(shutil.which("fdtget") and FIXTURE.is_file(), "requires compiled radio fixture")
class NativeRadioTests(unittest.TestCase):
    def result(self, overrides=None, extra_children=None):
        return radio.validate(OverrideTree(overrides, extra_children))

    def reject(self, overrides=None, extra_children=None):
        result = self.result(overrides, extra_children)
        self.assertFalse(result["ok"], result)

    def test_real_disabled_candidate(self):
        result = self.result()
        self.assertTrue(result["ok"], result["errors"])
        for key in ("ath12k_board_data_verified", "dual_mac_mlo_verified",
                    "boot_validated", "flashable"):
            self.assertFalse(result[key])

    def test_never_enable_pcie_in_audit_candidate(self):
        self.reject({(radio.PCIE, "status"): "okay"})

    def test_never_enable_mhi_in_audit_candidate(self):
        self.reject({(radio.MHI, "status"): "okay"})

    def test_reference_board_id_rejected(self):
        self.reject({(radio.MHI, "qcom,board_id"): [0x1019]})

    def test_legacy_dt_board_id_is_not_dualmac_selector(self):
        self.reject({(radio.MHI, "qcom,board_id"): [0x02]})

    def test_wrong_caldata_offset_rejected(self):
        self.reject({(radio.MHI, "qcom,caldata_offset"): [0x157696]})

    def test_wrong_reset_gpio_rejected(self):
        value = self.base_cells(radio.PCIE, "perst-gpios")
        value[1] = 48
        self.reject({(radio.PCIE, "perst-gpios"): value})

    def test_fake_second_endpoint_rejected(self):
        self.reject(extra_children={radio.PCIE_RP: ["qcom,mhi@2"]})

    def base_cells(self, path, prop):
        return core.Fdt(FIXTURE).cells(path, prop)


if __name__ == "__main__":
    unittest.main()
