#!/usr/bin/env python3
"""Regression checks for the BE6500 service and USB modem package set."""

from pathlib import Path
import os
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
PROFILE = ROOT / "target/linux/qualcommax/image/ipq53xx.mk"
PINS = ROOT / "source-pins.env"
QMODEM_FEED = ROOT / "source-manifests/qmodem-feed.conf"
BUILD_FEEDS = ROOT / "build-overrides/feeds.conf.default"
QMODEM_CONFIG = ROOT / "build-overrides/qmodem.config"
QMODEM_DEFAULTS = (
    ROOT
    / "package/be6500-local/be6500-current-config/files/95-be6500-qmodem-ondemand"
)
CURRENT_CONFIG_MAKEFILE = (
    ROOT / "package/be6500-local/be6500-current-config/Makefile"
)
QMODEM_RUNTIME = (
    ROOT
    / "package/be6500-local/be6500-current-config/files/be6500-qmodem-runtime"
)
QMODEM_HOTPLUG = (
    ROOT
    / "package/be6500-local/be6500-current-config/files/19-be6500-qmodem-runtime"
)


class PriorityPackageTests(unittest.TestCase):
    def setUp(self):
        self.profile = PROFILE.read_text(encoding="utf-8")

    def test_requested_usb_modem_drivers_are_built_in(self):
        packages = {
            "kmod-usb-net-cdc-ether",
            "kmod-usb-net-rndis",
            "kmod-usb-net-cdc-ncm",
            "kmod-usb-net-cdc-mbim",
            "kmod-usb-net-huawei-cdc-ncm",
            "kmod-usb-net-ipheth",
            "kmod-usb-net-qmi-wwan",
            "kmod-rmnet",
            "kmod-usb-acm",
            "kmod-usb-wdm",
            "kmod-usb-serial",
            "kmod-usb-serial-wwan",
            "kmod-usb-serial-option",
            "kmod-usb-serial-qualcomm",
            "usb-modeswitch",
        }
        for package in packages:
            with self.subTest(package=package):
                self.assertIn(package, self.profile)

    def test_qmodem_next_supplies_modem_and_sms_pages(self):
        self.assertIn("luci-app-qmodem-next", self.profile)
        self.assertNotIn("modemmanager modemmanager-rpcd", self.profile)
        self.assertNotIn("luci-app-modemband", self.profile)

    def test_qmi_and_mbim_protocol_pages_are_available(self):
        for package in (
            "luci-proto-qmi",
            "luci-i18n-proto-qmi-zh-cn",
            "luci-proto-mbim",
            "luci-i18n-proto-mbim-zh-cn",
        ):
            self.assertIn(package, self.profile)

    def test_service_suite_is_included(self):
        for package in (
            "zerotier",
            "luci-app-zerotier",
            "ttyd",
            "luci-app-ttyd",
            "htop",
            "bind-dig",
            "bash",
            "etherwake",
            "luci-app-wol",
        ):
            self.assertIn(package, self.profile)

    def test_qmodem_feed_is_immutable(self):
        pin = "c49654efc870f53712ee8e25bf181722eb1466d9"
        self.assertIn(f"QMODEM_COMMIT={pin}", PINS.read_text(encoding="utf-8"))
        feed = QMODEM_FEED.read_text(encoding="utf-8")
        self.assertIn(f"QModem.git^{pin}", feed)
        self.assertNotIn("QModem.git;main", feed)
        build_feeds = BUILD_FEEDS.read_text(encoding="utf-8")
        self.assertIn(f"QModem.git^{pin}", build_feeds)

    def test_qmodem_uses_the_native_66_qmi_driver(self):
        config = QMODEM_CONFIG.read_text(encoding="utf-8")
        self.assertIn("CONFIG_PACKAGE_qmodem_INCLUDE_generic-qmi-wwan=y", config)
        self.assertIn(
            "# CONFIG_PACKAGE_qmodem_INCLUDE_vendor-qmi-wwan is not set", config
        )
        self.assertIn(
            "# CONFIG_PACKAGE_qmodem_INCLUDE_nss-qmi-wwan is not set", config
        )

    def test_qmodem_defaults_do_not_probe_the_wifi_pcie_endpoint(self):
        defaults = QMODEM_DEFAULTS.read_text(encoding="utf-8")
        makefile = CURRENT_CONFIG_MAKEFILE.read_text(encoding="utf-8")
        self.assertIn("qmodem.main.enable_dial='0'", defaults)
        self.assertIn("qmodem.main.block_auto_probe='1'", defaults)
        self.assertIn("qmodem.main.enable_usb_scan='0'", defaults)
        self.assertIn("qmodem.main.enable_pcie_scan='0'", defaults)
        self.assertIn("qmodem.main.try_preset_pcie='0'", defaults)
        self.assertIn("PKG_RELEASE:=13", makefile)
        self.assertIn(
            "./files/95-be6500-qmodem-ondemand "
            "$(1)/etc/uci-defaults/95-be6500-qmodem-ondemand",
            makefile,
        )

    def test_qmodem_runtime_is_idle_until_cellular_usb_is_present(self):
        defaults = QMODEM_DEFAULTS.read_text(encoding="utf-8")
        runtime = QMODEM_RUNTIME.read_text(encoding="utf-8")
        hotplug = QMODEM_HOTPLUG.read_text(encoding="utf-8")
        makefile = CURRENT_CONFIG_MAKEFILE.read_text(encoding="utf-8")

        for service in (
            "qmodem_init",
            "qmodem-settings",
            "qmodem-smsd",
            "ubus-at-daemon",
            "qmodem_led",
        ):
            with self.subTest(service=service):
                self.assertIn(service, defaults)
                self.assertIn(service, runtime)

        self.assertIn("block_auto_probe='1'", defaults)
        self.assertIn("be6500_runtime='on_demand'", defaults)
        self.assertIn("cdc-wdm", runtime)
        self.assertIn("ttyUSB", runtime)
        self.assertIn("qmi_wwan", runtime)
        self.assertNotIn(
            "option|qcserial|qmi_wwan|cdc_mbim|huawei_cdc_ncm|rndis_host",
            runtime,
        )
        self.assertNotIn(
            "option|qcserial|qmi_wwan|cdc_mbim|huawei_cdc_ncm|ipheth",
            runtime,
        )
        self.assertIn('case "$ACTION" in', hotplug)
        self.assertIn('add|bind)', hotplug)
        self.assertIn('remove|unbind)', hotplug)
        self.assertIn(
            "./files/be6500-qmodem-runtime.init "
            "$(1)/etc/init.d/be6500-qmodem-runtime",
            makefile,
        )

    def test_qmodem_runtime_ignores_storage_and_phone_tethering(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write_fake_runtime_environment(root)
            storage = self._add_fake_usb_device(root, "1-1", "usb-storage")
            rndis = self._add_fake_usb_device(root, "1-2", "rndis_host")

            self._run_runtime(root, "add", str(storage))
            self._run_runtime(root, "add", str(rndis))

            self.assertFalse((root / "service.log").exists())
            self.assertFalse((root / "scan.log").exists())

    def test_qmodem_runtime_starts_for_control_channel_and_stops_when_removed(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write_fake_runtime_environment(root)
            modem = self._add_fake_usb_device(root, "2-1", "qmi_wwan")
            wdm = root / "sys/bus/usb/devices/2-1:1.0/usbmisc/cdc-wdm0"
            wdm.parent.mkdir(parents=True)
            wdm.touch()

            self._run_runtime(root, "add", str(modem))

            services = (root / "service.log").read_text(encoding="utf-8")
            self.assertIn("qmodem_init start", services)
            self.assertIn("qmodem-settings start", services)
            self.assertIn("qmodem-smsd start", services)
            self.assertIn("ubus-at-daemon start", services)
            self.assertIn("add 2-1 usb 0", (root / "scan.log").read_text())

            wdm.unlink()
            (modem.parent / "2-1:1.0/driver").unlink()
            self._run_runtime(root, "remove")
            services = (root / "service.log").read_text(encoding="utf-8")
            self.assertIn("qmodem_init stop", services)
            self.assertIn("qmodem-settings stop", services)
            self.assertIn("qmodem-smsd stop", services)

    def _write_fake_runtime_environment(self, root):
        sysfs = root / "sys/bus/usb/devices"
        initd = root / "init.d"
        bin_dir = root / "bin"
        drivers = root / "sys/drivers"
        for directory in (sysfs, initd, bin_dir, drivers):
            directory.mkdir(parents=True, exist_ok=True)

        service_script = "#!/bin/sh\necho \"$(basename \"$0\") $1\" >> \"$BE6500_TEST_ROOT/service.log\"\n"
        for service in (
            "qmodem_init",
            "ubus-at-daemon",
            "qmodem-settings",
            "qmodem-smsd",
            "qmodem_led",
            "qmodem_network",
            "qmodem_reboot",
            "qmodem_usage_stats",
            "sms_forwarder",
        ):
            path = initd / service
            path.write_text(service_script, encoding="utf-8")
            path.chmod(0o755)

        helpers = {
            "uci": "#!/bin/sh\n[ \"$3\" = qmodem.main.be6500_runtime ] && echo on_demand\n",
            "logger": "#!/bin/sh\nexit 0\n",
            "scan": "#!/bin/sh\necho \"$*\" >> \"$BE6500_TEST_ROOT/scan.log\"\n",
        }
        for name, content in helpers.items():
            path = bin_dir / name
            path.write_text(content, encoding="utf-8")
            path.chmod(0o755)

    def _add_fake_usb_device(self, root, slot, driver):
        device = root / f"sys/bus/usb/devices/{slot}"
        interface = root / f"sys/bus/usb/devices/{slot}:1.0"
        driver_dir = root / f"sys/drivers/{driver}"
        device.mkdir(parents=True)
        interface.mkdir(parents=True)
        driver_dir.mkdir(parents=True, exist_ok=True)
        (device / "idVendor").write_text("0000\n", encoding="utf-8")
        (interface / "driver").symlink_to(driver_dir)
        return device

    def _run_runtime(self, root, *args):
        env = os.environ.copy()
        env.update(
            {
                "BE6500_TEST_ROOT": str(root),
                "BE6500_SYSFS_ROOT": str(root / "sys"),
                "BE6500_INITD_ROOT": str(root / "init.d"),
                "BE6500_QMODEM_SCAN": str(root / "bin/scan"),
                "BE6500_UCI": str(root / "bin/uci"),
                "BE6500_LOGGER": str(root / "bin/logger"),
                "BE6500_RUNTIME_DIR": str(root / "run"),
            }
        )
        subprocess.run(
            ["sh", str(QMODEM_RUNTIME), *args],
            check=True,
            env=env,
            timeout=5,
        )


if __name__ == "__main__":
    unittest.main()
