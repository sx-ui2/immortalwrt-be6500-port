from pathlib import Path
import shutil
import unittest

import check_native_core as core
import check_native_ethernet as net

FIXTURE = Path(__file__).resolve().parents[1] / "native-6.6/artifacts/ethernet.static-only.dtb"


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


@unittest.skipUnless(shutil.which("fdtget"), "requires device-tree-compiler fdtget")
class NativeEthernetTests(unittest.TestCase):
    def result(self, overrides=None, extra_children=None):
        return net.validate(OverrideTree(overrides, extra_children))

    def reject(self, overrides):
        result = self.result(overrides)
        self.assertFalse(result["ok"], result)

    def test_real_ethernet_candidate(self):
        result = self.result()
        self.assertTrue(result["ok"], result["errors"])
        for key in ("boot_validated", "flashable", "factory_mac_provisioned", "physical_jack_order_validated"):
            self.assertFalse(result[key])

    def test_network_candidate_does_not_pass_core_only_checker(self):
        self.assertFalse(core.validate(core.Fdt(FIXTURE))["ok"])

    def test_legacy_soc_alias(self):
        self.reject({("/aliases", "ethernet0"): "/soc/dp1"})

    def test_swapped_wan_mac_id(self):
        self.reject({(net.WAN, "qcom,id"): [1]})

    def test_wan_phy_reused_as_lan(self):
        phy4 = core.Fdt(FIXTURE).cells(net.MDIO + "/ethernet-phy@4", "phandle")
        self.reject({(net.DSA + "/ports/port@3", "phy-handle"): phy4})

    def test_invented_fourth_lan(self):
        self.assertFalse(self.result(extra_children={net.DSA + "/ports": ["port@4"]})["ok"])

    def test_wrong_dsa_cpu_mac(self):
        wan = core.Fdt(FIXTURE).cells(net.WAN, "phandle")
        self.reject({(net.DSA + "/ports/port@0", "ethernet"): wan})

    def test_wrong_packet_tag(self):
        self.reject({(net.DSA + "/ports/port@0", "dsa-tag-protocol"): "qca"})

    def test_old_phy_mode_disables_new_phylink_path(self):
        self.reject({(net.WAN, "phy-mode"): "sgmii"})

    def test_no_fake_reference_mac(self):
        self.reject({(net.WAN, "local-mac-address"): [0, 3, 127, 186, 219, 173]})

    def test_old_mdio_clock_id(self):
        clocks = core.Fdt(FIXTURE).cells(net.MDIO, "clocks")
        clocks[1] = 27
        self.reject({(net.MDIO, "clocks"): clocks})

    def test_wrong_reset_gpio(self):
        gpio = core.Fdt(FIXTURE).cells(net.MDIO, "phy-reset-gpio")
        gpio[1] = 36
        self.reject({(net.MDIO, "phy-reset-gpio"): gpio})

    def test_old_reset_flag_breaks_new_gpiod_polarity(self):
        gpio = core.Fdt(FIXTURE).cells(net.MDIO, "phy-reset-gpio")
        gpio[2] = 0
        self.reject({(net.MDIO, "phy-reset-gpio"): gpio})

    def test_switch_link_not_gigabit(self):
        self.reject({(net.PPE + "/qcom,port_phyinfo/port@0/fixed-link", "speed"): [1000]})

    def test_missing_extra_mht_rings(self):
        self.reject({(net.EDMA, "qcom,mht-txdesc-rings"): [0]})

    def test_wrong_edma_irq_order(self):
        cells = core.Fdt(FIXTURE).cells(net.EDMA, "interrupts")
        cells[1], cells[4] = cells[4], cells[1]
        self.reject({(net.EDMA, "interrupts"): cells})

    def test_radio_stays_off_in_wired_candidate(self):
        self.reject({(net.SOC + "/wifi1@c0000000", "status"): "okay"})


if __name__ == "__main__":
    unittest.main()
