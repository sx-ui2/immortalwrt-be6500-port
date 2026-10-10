#!/usr/bin/env python3
import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
PACKAGE = ROOT / "package/kernel/linux-apfs-rw/Makefile"
CONFIG = ROOT / "native-6.6/full-wifi.seed.config"
PROFILE = ROOT / "target/linux/qualcommax/image/ipq53xx.mk"


class ApfsSupportTest(unittest.TestCase):
    def test_pinned_apfs_kernel_module_is_built(self):
        source = PACKAGE.read_text()
        self.assertIn("PKG_VERSION:=0.3.21", source)
        self.assertIn("PKG_HASH:=7c2af6a0", source)
        self.assertIn("KernelPackage/fs-apfs", source)
        self.assertIn("FILES:=$(PKG_BUILD_DIR)/apfs.ko", source)
        self.assertIn("AutoProbe,apfs", source)

    def test_image_selects_apfs_without_removing_ntfs(self):
        config = CONFIG.read_text()
        profile = PROFILE.read_text()
        self.assertIn("CONFIG_PACKAGE_kmod-fs-apfs=y", config)
        self.assertIn("kmod-fs-ntfs3 ntfs3-mount kmod-fs-apfs", profile)
        self.assertIn("CONFIG_PACKAGE_kmod-fs-ntfs3=y", config)
        self.assertIn("CONFIG_PACKAGE_ntfs3-mount=y", config)
        self.assertIn("CONFIG_PACKAGE_kmod-fs-exfat=y", config)

    def test_package_does_not_enable_experimental_writes(self):
        source = PACKAGE.read_text()
        self.assertNotIn("CONFIG_APFS_RW_ALWAYS", source)
        self.assertNotIn("APFS_CONFIG=-D", source)
        self.assertIn("mounted read-only", source)

    def test_readme_documents_safe_support_boundary(self):
        readme = (ROOT / "README.md").read_text()
        self.assertIn("Linux APFS 0.3.21", readme)
        self.assertIn("mounted read-only", readme)
        self.assertIn("NTFS3 and exFAT remain read-write", readme)


if __name__ == "__main__":
    unittest.main()
