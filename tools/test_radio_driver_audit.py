import tempfile
from pathlib import Path
import unittest

import radio_driver_audit as audit


def write(root, relative, text=""):
    path = root / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)


class RadioDriverAuditTests(unittest.TestCase):
    def test_observed_1109_binding_passes_identity_gate(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write(root, "pci.c", "#define QCN9274_DEVICE_ID 0x1109\n"
                                 "{ PCI_VDEVICE(QCOM, QCN9274_DEVICE_ID) }\n"
                                 "ATH12K_HW_QCN9274_HW20\n")
            write(root, "core.c", "static const int ATH12K_HW_QCN9274_HW20 = 1;\n")
            self.assertEqual([], audit.audit_ath12k(root))

    def test_legacy_chip_name_without_1109_binding_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write(root, "pci.c", "/* future QCN9224 notes */\n")
            write(root, "core.c", "static const char *name = \"QCN9224\";\n")
            self.assertTrue(audit.audit_ath12k(root))

    def test_unrelated_pci_binding_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write(root, "pci.c", "#define SOME_DEVICE_ID 0x1234\n"
                                 "{ PCI_DEVICE(PCI_VENDOR_ID_QCOM, SOME_DEVICE_ID) }\n")
            write(root, "core.c", "static const int some_hw_params = 1;\n")
            self.assertTrue(audit.audit_ath12k(root))

    def test_literal_observed_pci_binding_passes(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write(root, "pci.c", "{ PCI_DEVICE(PCI_VENDOR_ID_QCOM, 0x1109) }\n"
                                 "QCN9274_HW_PARAMS\n")
            write(root, "core.c", "static const int QCN9274_HW_PARAMS = 1;\n")
            self.assertEqual([], audit.audit_ath12k(root))

    def test_component_only_vendor_checkout_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write(root, "dp/wifi3.0/monitor/Kbuild", "HOST_CMN := $(DEPTH)/cmn_dev\n")
            self.assertTrue(any("component_dev only" in item
                                for item in audit.audit_vendor(root)))

    def test_complete_vendor_skeleton_passes_rejection_gate(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write(root, "component_dev/dp/wifi3.0/monitor/Kbuild", "QCN9224 MLO\n")
            for relative in (
                    "cmn_dev/qdf/.keep", "cmn_dev/hif/.keep", "cmn_dev/wmi/.keep",
                    "cmn_dev/target_if/.keep", "cmn_dev/fw_hdr/hw/qcn9224/.keep",
                    "os/linux/Makefile-linux.common"):
                write(root, relative)
            write(root, "Makefile", "# QCN9224 multi_link vendor integration\n")
            self.assertEqual([], audit.audit_vendor(root))

    def test_vendor_tree_without_top_level_build_entry_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write(root, "component_dev/dp/wifi3.0/monitor/Kbuild", "QCN9224 MLO\n")
            for relative in (
                    "cmn_dev/qdf/.keep", "cmn_dev/hif/.keep", "cmn_dev/wmi/.keep",
                    "cmn_dev/target_if/.keep", "cmn_dev/fw_hdr/hw/qcn9224/.keep",
                    "os/linux/Makefile-linux.common"):
                write(root, relative)
            self.assertTrue(any("top-level" in item for item in audit.audit_vendor(root)))


if __name__ == "__main__":
    unittest.main()
