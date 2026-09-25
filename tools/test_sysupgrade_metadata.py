import json
import pathlib
import struct
import tempfile
import unittest

import check_sysupgrade_metadata


class SysupgradeMetadataTests(unittest.TestCase):
    def test_missing_metadata_is_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            image = pathlib.Path(td) / "sysupgrade.bin"
            image.write_bytes(b"tar-data" + b"\0" * 1024)
            with self.assertRaisesRegex(ValueError, "metadata is missing"):
                check_sysupgrade_metadata.read_metadata(image)

    def test_metadata_after_tar_padding_is_found(self):
        metadata = {
            "metadata_version": "1.1",
            "supported_devices": ["jdcloud,be6500"],
        }
        payload = b"\0" * 8 + json.dumps(metadata).encode()
        trailer = struct.pack(
            ">4sIB3xI",
            b"FWx0",
            0,
            1,
            len(payload) + 16,
        )
        with tempfile.TemporaryDirectory() as td:
            image = pathlib.Path(td) / "sysupgrade.bin"
            image.write_bytes(b"tar-data" + b"\0" * 1024 + payload + trailer)
            self.assertEqual(metadata, check_sysupgrade_metadata.read_metadata(image))


if __name__ == "__main__":
    unittest.main()
