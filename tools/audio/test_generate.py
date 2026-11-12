"""Gate for the generator's stereo check: run with the venv python, `python -m unittest` in tools/audio."""

import tempfile
import unittest
from pathlib import Path

import generate as g
import numpy as np

TOY = g.Piece(
    slug="toy",
    outputs=("unused.mp3",),
    title="toy",
    seconds=30,
    carriers=((200.0, 1.0), (150.0, 0.5)),
    beat=((0, 10.0), (5, 10.0), (25, 6.0), (30, 6.0)),
    bed=g.Bed("surf", -14.0),
    fade=3.0,
    seed=1,
)


class StereoCheck(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.dir = tempfile.TemporaryDirectory()
        cls.master = g.synthesize(TOY)
        cls.path = Path(cls.dir.name) / "toy.mp3"
        g.encode_mp3(cls.master, cls.path, "toy")
        cls.decoded = g.decode_mp3(cls.path)

    def test_encoded_file_is_plain_stereo_and_beats_as_designed(self) -> None:
        result = g.measure(self.decoded, TOY, self.path)
        self.assertEqual(result["mp3"]["channel_modes"], [0])
        self.assertAlmostEqual(result["stereo_check"]["min_beat_hz"], 6.0, delta=0.3)
        self.assertAlmostEqual(result["stereo_check"]["max_beat_hz"], 10.0, delta=0.3)

    def test_deterministic(self) -> None:
        self.assertTrue(np.array_equal(self.master, g.synthesize(TOY)))

    def test_refuses_collapsed_ears(self) -> None:
        mono = np.repeat(self.decoded[:, :1], 2, axis=1)
        with self.assertRaises(AssertionError):
            g.verify_stereo(mono, TOY)

    def test_refuses_swapped_ears(self) -> None:
        with self.assertRaises(AssertionError):
            g.verify_stereo(self.decoded[:, ::-1].copy(), TOY)


if __name__ == "__main__":
    unittest.main()
