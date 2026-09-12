import hashlib
from pathlib import Path
import unittest
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]


class ManifestTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.raw = (ROOT / "source-manifests/NHSS.QSDK.14.0.r9-00040-O.xml").read_bytes()
        cls.projects = {p.attrib["name"]: p.attrib for p in ET.fromstring(cls.raw).findall("project")}
        cls.pins = dict(line.split("=", 1) for line in (ROOT / "source-pins.env").read_text().splitlines()
                        if line.strip() and not line.startswith("#"))

    def test_official_manifest_fingerprint(self):
        self.assertEqual("3ae358403f849e30ec6f391fb8fd474c45c601b2d4de9adfb4ea79ab45471076",
                         hashlib.sha256(self.raw).hexdigest())

    def test_existing_sources_match_same_official_release(self):
        for pin, project in {
            "QSDK_KERNEL_COMMIT": "oss/kernel/linux-ipq-6.6",
            "QSDK_KERNEL_FILES_COMMIT": "oss/kernel/linux-ipq-files",
            "QSDK_NSS_DP_COMMIT": "oss/lklm/nss-dp",
            "QSDK_QCA_SSDK_COMMIT": "oss/lklm/qca-ssdk",
            "QSDK_QCA_WIFI_COMMIT": "wifi/qca-wifi-oss",
            "QSDK_WLAN_OPEN_COMMIT": "oss/src/mac80211/wlan-open",
            "QSDK_WLAN_OPEN_FEED_COMMIT": "oss/system/feeds/wlan-open",
            "QSDK_WLAN_OPEN_EXTNS_COMMIT": "oss/src/qca-extns/wlan-open-extns",
        }.items():
            with self.subTest(pin=pin):
                self.assertEqual(self.pins[pin], self.projects[project]["revision"])

    def test_wireless_source_is_component_not_full_root(self):
        self.assertEqual("qsdk/qca/src/qca-wifi/component_dev",
                         self.projects["wifi/qca-wifi-oss"]["path"])

    def test_open_wireless_source_and_feed_paths(self):
        self.assertEqual("qsdk/qca/src/mac80211/wlan-open",
                         self.projects["oss/src/mac80211/wlan-open"]["path"])
        self.assertEqual("qsdk/qca/feeds/wlan-open/mac80211",
                         self.projects["oss/system/feeds/wlan-open"]["path"])
        self.assertEqual("qsdk/qca/src/wlan-open-extns",
                         self.projects["oss/src/qca-extns/wlan-open-extns"]["path"])


if __name__ == "__main__":
    unittest.main()
