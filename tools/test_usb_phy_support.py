import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
DTS = ROOT / "target/linux/qualcommax/files/arch/arm64/boot/dts/qcom/ipq5332-jdcloud-be6500-full-radio-initramfs.dts"
PROFILE = ROOT / "target/linux/qualcommax/image/ipq53xx.mk"
PKG = ROOT / "package/kernel/qca-usb-phy-ipq5018"
LUCI_PKG = ROOT / "package/be6500-local/luci-app-rejected-clients"


class UsbPhySupportTests(unittest.TestCase):
    def test_usb2_uses_factory_legacy_binding(self):
        source = DTS.read_text()
        self.assertIn('compatible = "qca,ipq5332-m31-usb-hsphy";', source)
        self.assertIn('reg-names = "m31usb_phy_base", "qscratch_base";', source)
        self.assertIn('reset-names = "usb2_phy_reset";', source)
        self.assertIn('phy_type = "utmi";', source)
        self.assertIn('usb-phy = <&hs_m31phy_0>;', source)

    def test_usb3_is_the_only_generic_phy_on_dwc3(self):
        source = DTS.read_text()
        self.assertIn('phys = <&ssuniphy_0>;', source)
        self.assertIn('phy-names = "usb3-phy";', source)
        self.assertNotIn('phy-names = "usb2-phy", "usb3-phy";', source)

    def test_legacy_driver_keeps_oem_ipq5332_tuning(self):
        source = (PKG / "src/qca-m31-usb-phy.c").read_text()
        self.assertIn('"qca,ipq5332-m31-usb-hsphy"', source)
        self.assertIn('"qcom,ipq5332-m31-usb-hsphy"', source)
        self.assertIn("ipq5332_m31usb_phy_enable_clock", source)
        self.assertIn("USB2PHY_USB_PHY_M31_XCFGI_11", source)
        self.assertIn("HSTX_SLEW_RATE_400PS", source)
        self.assertIn("ODT_VALUE_38_02_OHM", source)
        self.assertIn("HSTX_CURRENT_17_1MA_385MV", source)
        self.assertIn("usb_add_phy_dev", source)

    def test_qsdk14_compliance_tuning_delay_precedes_current_write(self):
        source = (PKG / "src/qca-m31-usb-phy.c").read_text()
        pre_emphasis = source.index("writel(HSTX_PRE_EMPHASIS_LEVEL_0_55MA")
        delay = source.index("udelay(4);", pre_emphasis)
        current = source.index("writel(HSTX_CURRENT_17_1MA_385MV", pre_emphasis)
        self.assertLess(pre_emphasis, delay)
        self.assertLess(delay, current)

    def test_generic_m31_driver_is_explicitly_forbidden(self):
        package = (PKG / "Makefile").read_text()
        self.assertIn("CONFIG_PHY_QCOM_M31_USB=n", package)
        self.assertIn("CONFIG_PHY_IPQ_UNIPHY_USB=m", package)
        self.assertIn("qca-m31-usb-phy.ko", package)
        self.assertNotIn("phy-qcom-m31.ko", package)

    def test_image_contains_factory_usb_phy_package(self):
        self.assertIn("kmod-usb-phy-ipq5018", PROFILE.read_text())

    def test_oem_usb_page_exposes_detection_and_full_management_links(self):
        controller = (LUCI_PKG / "root/usr/lib/lua/luci/controller/be6500_oem_beta.lua").read_text()
        pages = (LUCI_PKG / "root/www/be6500-oem/Native_JS/pages.js").read_text()
        menu = (LUCI_PKG / "root/usr/share/luci/menu.d/luci-app-rejected-clients.json").read_text()
        self.assertIn('method == "get_usb_info"', controller)
        self.assertIn('/sys/bus/usb/devices', controller)
        self.assertIn('function usbPage()', pages)
        self.assertIn('/cgi-bin/luci/admin/system/diskman/disks', pages)
        self.assertIn('/cgi-bin/luci/admin/nas/samba4', pages)
        self.assertIn('/cgi-bin/luci/admin/nas/usb_printer', pages)
        self.assertIn('"admin/router_settings/usb"', menu)


if __name__ == "__main__":
    unittest.main()
