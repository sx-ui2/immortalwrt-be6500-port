import hashlib
import json
import tempfile
from pathlib import Path
import unittest

import extract_qcn92xx_caldata as extractor


class ExtractQcn92xxCaldataTests(unittest.TestCase):
    def test_extracts_exact_slice_and_hash(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            calibration = b"\x01\x02device-calibration\xfe\xff"
            art = root / "art.bin"
            art.write_bytes(b"prefix" + calibration + b"suffix")
            data = extractor.extract_art_slice(art, len(b"prefix"), len(calibration))
            self.assertEqual(calibration, data)
            self.assertEqual(hashlib.sha256(calibration).hexdigest(),
                             extractor.validate_calibration(data))

    def test_short_art_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            art = Path(tmp) / "art.bin"
            art.write_bytes(b"short")
            with self.assertRaisesRegex(ValueError, "too short"):
                extractor.extract_art_slice(art, 4, 10)

    def test_blank_calibration_is_rejected(self):
        for blank in (bytes(32), b"\xff" * 32):
            with self.subTest(blank=blank[0]):
                with self.assertRaisesRegex(ValueError, "entirely"):
                    extractor.validate_calibration(blank)

    def test_wrong_hash_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "SHA256 mismatch"):
            extractor.validate_calibration(b"real", "0" * 64)

    def test_output_requires_explicit_overwrite(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "cal.bin"
            output.write_bytes(b"old")
            with self.assertRaisesRegex(ValueError, "already exists"):
                extractor.write_output(output, b"new")
            extractor.write_output(output, b"new", force=True)
            self.assertEqual(b"new", output.read_bytes())

    def test_cli_defaults_to_read_only_audit(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            calibration = b"valid-calibration"
            art = root / "art.bin"
            art.write_bytes(b"abcd" + calibration)
            evidence = root / "evidence.json"
            evidence.write_text(json.dumps({
                "legacy_calibration_art_offset": 4,
                "legacy_calibration_size": len(calibration),
                "legacy_calibration_sha256": hashlib.sha256(calibration).hexdigest(),
                "ath12k_calibration_request": extractor.DEFAULT_TARGET,
            }))
            self.assertEqual(0, extractor.main([
                "--art", str(art), "--evidence", str(evidence),
            ]))
            self.assertEqual([art, evidence], sorted(root.iterdir()))


if __name__ == "__main__":
    unittest.main()
