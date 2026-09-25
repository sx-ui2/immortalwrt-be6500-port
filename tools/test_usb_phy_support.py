import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
PACKAGE = ROOT / "package/kernel/qca-usb-phy-ipq5018/Makefile"
PROFILE = ROOT / "target/linux/qualcommax/image/ipq53xx.mk"
PRODUCTION_DTS = ROOT / (
    "target/linux/qualcommax/files/arch/arm64/boot/dts/qcom/"
    "ipq5332-jdcloud-be6500-full-radio-initramfs.dts"
)
CONFIGS = (
    ROOT / "target/linux/qualcommax/ipq53xx/config-default",
    ROOT / "target/linux/qualcommax/ipq53xx/config-default.qsdk14",
    ROOT / "native-6.6/kernel-overrides/target-ipq53xx/config-default",
)


class UsbPhySupportTests(unittest.TestCase):
    def test_usb_phys_are_modules_not_builtins(self):
        for path in CONFIGS:
            source = path.read_text()
            self.assertIn("CONFIG_PHY_QCOM_M31_USB=m", source, path)
            self.assertIn("CONFIG_PHY_IPQ_UNIPHY_USB=m", source, path)
            self.assertNotIn("CONFIG_PHY_QCOM_M31_USB=y", source, path)
            self.assertNotIn("CONFIG_PHY_IPQ_UNIPHY_USB=y", source, path)

    def test_profile_installs_usb_phy_package(self):
        source = PROFILE.read_text()
        self.assertIn("kmod-usb-phy-ipq5018", source)
        self.assertIn("kmod-usb-dwc3-qcom", source)
        self.assertIn("kmod-usb-storage-uas", source)

    def test_profile_includes_complete_usb_host_userland(self):
        source = PROFILE.read_text()
        for package in (
            "automount",
            "block-mount",
            "blockd",
            "usbutils",
            "kmod-usb-storage-extras",
            "kmod-usb-printer",
            "kmod-fs-btrfs",
            "kmod-fs-ext4",
            "kmod-fs-exfat",
            "kmod-fs-vfat",
            "kmod-fs-ntfs3",
            "luci-app-diskman",
            "luci-app-samba4",
            "luci-app-hd-idle",
            "luci-app-usb-printer",
        ):
            self.assertIn(package, source, package)

    def test_package_contains_both_factory_phy_drivers(self):
        source = PACKAGE.read_text()
        self.assertIn("phy-qcom-m31.ko", source)
        self.assertIn("phy-qca-uniphy.ko", source)
        self.assertIn("AutoLoad,85,phy-qcom-m31 phy-qca-uniphy", source)

    def test_production_dwc3_uses_exact_linux_66_phy_names(self):
        source = PRODUCTION_DTS.read_text()
        self.assertIn("&dwc_0 {", source)
        self.assertIn('phy-names = "usb2-phy", "usb3-phy";', source)
        self.assertNotIn('phy-names = "ubs2-phy", "usb3-phy";', source)


if __name__ == "__main__":
    unittest.main()
