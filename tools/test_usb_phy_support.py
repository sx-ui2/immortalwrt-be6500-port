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
    def test_production_tree_uses_native_qsdk14_soc_dtsi(self):
        core = CORE_DTS.read_text()
        overlay = DTS.read_text()
        self.assertIn('#include "ipq5332.dtsi"', core)
        self.assertNotIn('compatible = "qca,ipq5332-m31-usb-hsphy";', overlay)
        self.assertNotIn('usb-phy = <&hs_m31phy_0>;', overlay)

    def test_linux66_m31_binding_is_completed(self):
        source = DTS.read_text()
        self.assertIn('compatible = "regulator-fixed";', source)
        self.assertIn('regulator-name = "be6500-usb-vdd-5v0";', source)
        self.assertIn('&hs_m31phy_0 {', source)
        self.assertIn('clock-names = "cfg_ahb";', source)
        self.assertIn('vdd-supply = <&jd_usb_vdd>;', source)
        self.assertIn('&ssuniphy_0 {\n\tstatus = "okay";\n};', source)

    def test_dwc3_selects_usb_combo_phy_and_correct_names(self):
        source = DTS.read_text()
        self.assertIn('&usb3 {', source)
        self.assertIn('qcom,multiplexed-phy;', source)
        self.assertIn('&dwc_0 {', source)
        self.assertIn('phy-names = "usb2-phy", "usb3-phy";', source)
        self.assertNotIn('phy-names = "ubs2-phy"', source)

    def test_phy_modules_are_external_and_not_in_boot_critical_image(self):
        package = (PKG / "Makefile").read_text()
        self.assertIn("+kmod-usb3 +kmod-usb-dwc3-qcom", package)
        self.assertIn("CONFIG_PHY_QCOM_M31_USB=n", package)
        self.assertIn("CONFIG_PHY_IPQ_UNIPHY_USB=n", package)
        self.assertIn("$(PKG_BUILD_DIR)/phy-qcom-m31.ko", package)
        self.assertIn("$(PKG_BUILD_DIR)/phy-qca-uniphy.ko", package)
        self.assertIn("$(LINUX_DIR)/drivers/phy/qualcomm/phy-qcom-m31.c", package)
        self.assertIn("$(LINUX_DIR)/drivers/phy/qualcomm/phy-qca-uniphy.c", package)
        self.assertNotIn("AUTOLOAD", package)
        self.assertFalse((PKG / "src/qca-m31-usb-phy.c").exists())
        for path in KERNEL_CONFIGS:
            source = path.read_text()
            self.assertIn("# CONFIG_PHY_QCOM_M31_USB is not set", source, path)
            self.assertIn("# CONFIG_PHY_IPQ_UNIPHY_USB is not set", source, path)

    def test_guarded_late_probe_recovers_after_interrupted_attempt(self):
        init = (PKG / "files/be6500-usb-host.init").read_text()
        helper = (PKG / "files/be6500-usb-host").read_text()
        self.assertIn("START=99", init)
        self.assertIn("BE6500_USB_BOOT_DELAY:-45", helper)
        self.assertIn("state_set probing", helper)
        self.assertIn('probing)', helper)
        self.assertIn('state_set blocked "previous PHY probe did not complete"', helper)
        self.assertIn("modprobe phy-qcom-m31", helper)
        self.assertIn("modprobe phy-qca-uniphy", helper)
        self.assertIn("modprobe dwc3-qcom", helper)
        self.assertIn("state_set ready", helper)

    def test_image_includes_guarded_phy_package_and_usb_stack(self):
        profile = PROFILE.read_text()
        self.assertIn("kmod-usb-phy-ipq5018", profile)
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
