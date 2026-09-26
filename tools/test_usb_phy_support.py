import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
DTS = ROOT / "target/linux/qualcommax/files/arch/arm64/boot/dts/qcom/ipq5332-jdcloud-be6500-full-radio-initramfs.dts"
CORE_DTS = ROOT / "target/linux/qualcommax/files/arch/arm64/boot/dts/qcom/ipq5332-jdcloud-be6500-core.dts"
PROFILE = ROOT / "target/linux/qualcommax/image/ipq53xx.mk"
PKG = ROOT / "package/kernel/qca-usb-phy-ipq5018"
LUCI_PKG = ROOT / "package/be6500-local/luci-app-rejected-clients"
KERNEL_CONFIGS = [
    ROOT / "target/linux/qualcommax/ipq53xx/config-default",
    ROOT / "target/linux/qualcommax/ipq53xx/config-default.qsdk14",
    ROOT / "native-6.6/kernel-overrides/target-ipq53xx/config-default",
]


class UsbPhySupportTests(unittest.TestCase):
    def test_production_tree_keeps_boot_confirmed_usb_topology(self):
        core = CORE_DTS.read_text()
        overlay = DTS.read_text()
        self.assertIn('#include "ipq5332.dtsi"', core)
        self.assertIn('&hs_m31phy_0 {\n\tstatus = "okay";\n};', overlay)
        self.assertIn('&ssuniphy_0 {\n\tstatus = "okay";\n};', overlay)
        self.assertIn('&usb3 {\n\tstatus = "okay";\n};', overlay)
        self.assertNotIn('compatible = "qca,ipq5332-m31-usb-hsphy";', overlay)
        self.assertNotIn('usb-phy = <&hs_m31phy_0>;', overlay)
        self.assertNotIn('qcom,multiplexed-phy;', overlay)

    def test_phy_modules_are_external_and_not_in_boot_critical_image(self):
        package = (PKG / "Makefile").read_text()
        self.assertIn("+kmod-usb-phy-nop +kmod-usb3 +kmod-usb-dwc3-qcom", package)
        self.assertIn("CONFIG_USB_PHY=y", package)
        self.assertIn("CONFIG_PHY_QCOM_M31_USB=n", package)
        self.assertIn("CONFIG_PHY_IPQ_UNIPHY_USB=n", package)
        self.assertIn("$(PKG_BUILD_DIR)/qca-m31-usb-phy.ko", package)
        self.assertIn("$(PKG_BUILD_DIR)/phy-qca-uniphy.ko", package)
        self.assertIn("./src/qca-m31-usb-phy.c", package)
        self.assertIn("$(LINUX_DIR)/drivers/phy/qualcomm/phy-qca-uniphy.c", package)
        self.assertNotIn("AUTOLOAD", package)
        self.assertTrue((PKG / "src/qca-m31-usb-phy.c").exists())
        for path in KERNEL_CONFIGS:
            source = path.read_text()
            self.assertIn("# CONFIG_PHY_QCOM_M31_USB is not set", source, path)
            self.assertIn("# CONFIG_PHY_IPQ_UNIPHY_USB is not set", source, path)

    def test_usb_probe_is_explicit_and_matches_qwrt_module_order(self):
        helper = (PKG / "files/be6500-usb-host").read_text()
        self.assertFalse((PKG / "files/be6500-usb-host.init").exists())
        self.assertFalse((PKG / "files/be6500_usb_guard").exists())
        self.assertIn("modprobe dwc3-qcom", helper)
        self.assertIn("modprobe dwc3", helper)
        self.assertIn("modprobe qca-m31-usb-phy", helper)
        self.assertIn("modprobe phy-qca-uniphy", helper)
        self.assertLess(helper.index("modprobe dwc3-qcom"), helper.index("modprobe qca-m31-usb-phy"))
        self.assertIn("probe)", helper)
        self.assertNotIn("boot)", helper)

    def test_ipq5332_m31_tuning_keeps_qwrt_write_delay_order(self):
        source = (PKG / "src/qca-m31-usb-phy.c").read_text()
        tune_current = source.index("HSTX_CURRENT_17_1MA_385MV")
        settle_delay = source.index("udelay(4)", tune_current)
        clear_por = source.index("writel(0, qphy->base + USB_PHY_UTMI_CTRL5)", settle_delay)
        self.assertLess(tune_current, settle_delay)
        self.assertLess(settle_delay, clear_por)

    def test_image_excludes_unbootable_phy_experiment_but_keeps_usb_stack(self):
        profile = PROFILE.read_text()
        self.assertNotIn("kmod-usb-phy-ipq5018", profile)
        self.assertIn("kmod-usb3", profile)
        self.assertIn("kmod-usb-dwc3-qcom", profile)

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
