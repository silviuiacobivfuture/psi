#!/usr/bin/env python3
"""Procedural demo soundscapes for EQ-SYNC and Hemi-Sync România: binaural tones over a surf bed.

Everything is synthesised here (no samples, no recordings, no third-party material), so there is
no licensing question: the script AND the encoded MP3s are the deliverable. Deterministic: every
piece has a fixed seed, and the same script on the same library versions writes the same audio.

Per piece:  1. synthesis in float64 at 48 kHz: 2-3 pure carriers per ear, one carrier pair per
               layer, left = carrier - beat/2 and right = carrier + beat/2, so the BEAT is the
               difference between the ears. The beat is a smooth curve; the frequency is
               integrated into the phase (cumulative sum), so glides are phase-continuous.
            2. a soft bed: brown rumble + pink foam, independent in each ear, with a slow swell
               (surf ~0.1 Hz, or a breathing-paced swell for the breathing piece).
            3. cosine fades in and out, then gain to the target integrated loudness (BS.1770,
               pyloudnorm) with a true-peak ceiling check (4x oversampling).
            4. MP3 through ffmpeg's libmp3lame in plain STEREO mode (no joint stereo / M/S).
            5. verification on the DECODED file: MP3 frame headers are all "stereo", loudness and
               true peak are re-measured, and the carrier of each ear is tracked (FFT peaks and
               an analytic-signal frequency track) against the designed schedule, so a file in
               which the ears had collapsed to one frequency would fail the build.

Usage (from the repository root):
    python3 -m venv /tmp/audio-venv && /tmp/audio-venv/bin/pip install -r tools/audio/requirements.txt
    /tmp/audio-venv/bin/python tools/audio/generate.py                       # all pieces
    /tmp/audio-venv/bin/python tools/audio/generate.py --only seara --report DIR

ffmpeg comes from the `imageio-ffmpeg` wheel (a static build with libmp3lame), so no system
encoder is needed.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from scipy import signal

SR = 48_000
REPO = Path(__file__).resolve().parents[2]
BITRATE_KBPS = 96
TARGET_LUFS = -21.5
LUFS_WINDOW = (-23.0, -20.0)
TRUE_PEAK_CEILING_DBTP = -1.0
# Layer beat = main beat x k. With k <= 1.08 every layer stays in the main beat's band at the
# designed holds (alpha 10 -> 10.8, theta 6 -> 6.5, delta 3 -> 3.24, beta 14 -> 15.1).
LAYER_BEAT_SCALE = (1.0, 1.04, 1.08)
MPEG_ENCODER_DELAY_SLACK = 2_400  # samples of tolerance when comparing decoded length


@dataclass(frozen=True)
class Bed:
    kind: str  # "surf" | "breath"
    level_db: float  # bed RMS relative to the tone RMS (negative: below the tones)


@dataclass(frozen=True)
class Piece:
    slug: str
    outputs: tuple[str, ...]  # repo-relative paths
    title: str
    seconds: int
    carriers: tuple[tuple[float, float], ...]  # (Hz, relative gain) per layer; first = main
    beat: tuple[tuple[float, float], ...]  # (t seconds, main beat Hz), eased between points
    bed: Bed
    fade: float
    seed: int
    band_note: str = ""
    extra: dict[str, float] = field(default_factory=dict)


PIECES: tuple[Piece, ...] = (
    Piece(
        slug="seara",
        outputs=("apps/eqsync-web/public/assets/sample.mp3",),
        title="EQ-SYNC demo: seara (alpha 10 to theta 6 Hz)",
        seconds=120,
        carriers=((200.0, 1.0), (150.0, 0.5), (250.0, 0.4)),
        beat=((0, 10.0), (14, 10.0), (100, 6.0), (120, 6.0)),
        bed=Bed("surf", -14.0),
        fade=12.0,
        seed=20260101,
    ),
    Piece(
        slug="coborare",
        outputs=("apps/hemisync-web/public/assets/demo-coborare.mp3",),
        title="Hemi-Sync Romania demo: Coborare in relaxare (beta 14 to alpha 10 to theta 6 Hz)",
        seconds=240,
        carriers=((200.0, 1.0), (160.0, 0.5), (240.0, 0.4)),
        beat=((0, 14.0), (26, 14.0), (96, 10.0), (124, 10.0), (206, 6.0), (240, 6.0)),
        bed=Bed("surf", -14.0),
        fade=12.0,
        seed=20260102,
    ),
    Piece(
        slug="respiratie",
        outputs=("apps/hemisync-web/public/assets/demo-respiratie.mp3",),
        title="Hemi-Sync Romania demo: Respiratie si liniste (alpha 10 Hz, 6 breaths/min)",
        seconds=180,
        carriers=((225.0, 1.0), (180.0, 0.5), (150.0, 0.4)),
        beat=((0, 10.0), (180, 10.0)),
        bed=Bed("breath", -11.0),
        fade=10.0,
        seed=20260103,
    ),
    Piece(
        slug="somn",
        outputs=("apps/hemisync-web/public/assets/demo-somn.mp3",),
        title="Hemi-Sync Romania demo: Spre somn (theta 6 to delta 3 Hz)",
        seconds=300,
        carriers=((187.5, 1.0), (150.0, 0.5), (225.0, 0.4)),
        beat=((0, 6.0), (40, 6.0), (250, 3.0), (300, 3.0)),
        bed=Bed("surf", -15.0),
        fade=15.0,
        seed=20260104,
    ),
)

# ---------------------------------------------------------------------------- synthesis


def beat_curve(points: tuple[tuple[float, float], ...], n: int) -> np.ndarray:
    """Main beat in Hz at every sample: cosine-eased between breakpoints (flat where equal)."""
    ts: list[float] = []
    vs: list[float] = []
    for (t0, v0), (t1, v1) in zip(points, points[1:]):
        s = np.linspace(0.0, 1.0, 400, endpoint=False)
        ts.extend(t0 + (t1 - t0) * s)
        vs.extend(v0 + (v1 - v0) * (0.5 - 0.5 * np.cos(np.pi * s)))
    ts.append(points[-1][0])
    vs.append(points[-1][1])
    return np.interp(np.arange(n) / SR, ts, vs)


def tones(piece: Piece, beat: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """(n, 2) float64: left/right pure carriers whose difference is the (layer-scaled) beat."""
    n = beat.size
    t = np.arange(n) / SR
    out = np.zeros((n, 2))
    for i, (carrier, gain) in enumerate(piece.carriers):
        layer_beat = beat * LAYER_BEAT_SCALE[i]
        drift = 1.0 + 0.10 * np.sin(2 * np.pi * t / (41.0 + 17.0 * i) + rng.uniform(0, 2 * np.pi))
        for ch, sign in ((0, -1.0), (1, 1.0)):
            freq = carrier + sign * layer_beat / 2.0  # Hz at each sample
            phase = 2 * np.pi * np.cumsum(freq) / SR  # integrated: phase-continuous glides
            out[:, ch] += gain * drift * np.sin(phase + rng.uniform(0, 2 * np.pi))
    return out


def shaped_noise(
    n: int, rng: np.random.Generator, slope: float, lp_hz: float, lp_order: int, hp_hz: float
) -> np.ndarray:
    """Unit-RMS noise: power ~ 1/f**slope (1 pink, 2 brown), low-passed and high-passed."""
    spectrum = np.fft.rfft(rng.standard_normal(n))
    f = np.fft.rfftfreq(n, 1.0 / SR)
    f[0] = f[1]
    gain = f ** (-slope / 2.0)
    gain /= np.sqrt(1.0 + (f / lp_hz) ** (2 * lp_order))
    gain /= np.sqrt(1.0 + (hp_hz / f) ** 4)
    gain[0] = 0.0
    x = np.fft.irfft(spectrum * gain, n)
    return x / np.sqrt(np.mean(x * x))


def swell_surf(t: np.ndarray, ear_shift: float, phi: float) -> np.ndarray:
    """Wave swell 0..1 at ~0.085-0.135 Hz (a wave every 7-12 s), slightly different per ear."""
    freq = 0.11 + 0.025 * np.sin(2 * np.pi * t / 37.0 + phi)
    phase = 2 * np.pi * np.cumsum(freq) / SR
    s = 0.5 + 0.5 * np.sin(phase + ear_shift)
    return 0.22 + 0.78 * s**1.6


def swell_breath(t: np.ndarray, ear_shift: float) -> np.ndarray:
    """Breath swell 0..1: 6 breaths/min = 10 s cycle, in 4 s (swell rises), out 6 s (falls)."""
    u = (t * 0.1 + ear_shift / (2 * np.pi) * 0.04) % 1.0
    rise = 0.5 - 0.5 * np.cos(np.pi * np.clip(u / 0.4, 0, 1))
    fall = 0.5 + 0.5 * np.cos(np.pi * np.clip((u - 0.4) / 0.6, 0, 1))
    return 0.16 + 0.84 * np.where(u < 0.4, rise, fall)


def bed(piece: Piece, n: int, tone_rms: float, rng: np.random.Generator) -> np.ndarray:
    """(n, 2) soft bed: brown rumble + pink foam, independent per ear, slow swell."""
    t = np.arange(n) / SR
    phi = rng.uniform(0, 2 * np.pi)
    out = np.zeros((n, 2))
    for ch, shift in ((0, 0.0), (1, 0.7)):
        env = swell_surf(t, shift, phi) if piece.bed.kind == "surf" else swell_breath(t, shift)
        rumble = shaped_noise(n, rng, 2.0, 380.0, 2, 28.0)
        foam = shaped_noise(n, rng, 1.0, 1900.0, 2, 90.0)
        out[:, ch] = rumble * env + 0.42 * foam * env**2.4
    out *= tone_rms * 10 ** (piece.bed.level_db / 20.0) / np.sqrt(np.mean(out * out))
    return out


def fades(x: np.ndarray, seconds: float) -> np.ndarray:
    k = int(seconds * SR)
    ramp = 0.5 - 0.5 * np.cos(np.pi * np.arange(k) / k)
    x[:k] *= ramp[:, None]
    x[-k:] *= ramp[::-1][:, None]
    return x


def true_peak_dbtp(x: np.ndarray) -> float:
    over = signal.resample_poly(x, 4, 1, axis=0)
    return float(20 * np.log10(np.max(np.abs(over))))


def lufs(x: np.ndarray) -> float:
    import pyloudnorm

    return float(pyloudnorm.Meter(SR).integrated_loudness(x))


def synthesize(piece: Piece) -> np.ndarray:
    """The finished (n, 2) float32 master at the target loudness."""
    rng = np.random.default_rng(piece.seed)
    n = piece.seconds * SR
    beat = beat_curve(piece.beat, n)
    tone = tones(piece, beat, rng)
    tone_rms = float(np.sqrt(np.mean(tone * tone)))
    mix = fades(tone + bed(piece, n, tone_rms, rng), piece.fade)
    mix *= 10 ** ((TARGET_LUFS - lufs(mix)) / 20.0)
    return mix.astype(np.float32)


# ---------------------------------------------------------------------------- encode/decode


def ffmpeg_exe() -> str:
    import imageio_ffmpeg

    return imageio_ffmpeg.get_ffmpeg_exe()


def encode_mp3(x: np.ndarray, path: Path, title: str) -> None:
    """Plain STEREO CBR (-joint_stereo 0: no mid/side coding), 48 kHz, no ID3 beyond the tags."""
    path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        ffmpeg_exe(), "-hide_banner", "-loglevel", "error", "-y",
        "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "-",
        "-map_metadata", "-1",
        "-metadata", f"title={title}",
        "-metadata", "comment=Procedurally generated binaural demo soundscape (tools/audio/generate.py). Not a Hemi-Sync recording. Headphones required.",
        "-c:a", "libmp3lame", "-b:a", f"{BITRATE_KBPS}k", "-joint_stereo", "0",
        "-compression_level", "0", "-ar", str(SR), "-ac", "2", str(path),
    ]  # fmt: skip
    subprocess.run(cmd, input=np.ascontiguousarray(x).tobytes(), check=True)


def decode_mp3(path: Path) -> np.ndarray:
    cmd = [
        ffmpeg_exe(), "-hide_banner", "-loglevel", "error", "-i", str(path),
        "-f", "f32le", "-ac", "2", "-ar", str(SR), "-",
    ]  # fmt: skip
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).astype(np.float64)


def mp3_frame_modes(path: Path) -> dict[str, object]:
    """Walk every MPEG frame; report channel modes (0 stereo, 1 joint, 2 dual, 3 mono), rate, kbps."""
    data = path.read_bytes()
    pos = 0
    if data[:3] == b"ID3":
        pos = 10 + ((data[6] << 21) | (data[7] << 14) | (data[8] << 7) | data[9])
    v1_l3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
    rates = [44100, 48000, 32000]
    modes: set[int] = set()
    seen: set[tuple[int, int]] = set()
    frames = 0
    while pos + 4 <= len(data):
        h = int.from_bytes(data[pos : pos + 4], "big")
        if (h >> 21) != 0x7FF or ((h >> 19) & 3) != 3 or ((h >> 17) & 3) != 1:
            pos += 1  # not an MPEG-1 Layer III header (e.g. a trailing tag): resync
            continue
        kbps = v1_l3[(h >> 12) & 15]
        rate = rates[(h >> 10) & 3]
        if kbps == 0:
            pos += 1
            continue
        modes.add((h >> 6) & 3)
        seen.add((kbps, rate))
        frames += 1
        pos += 144 * kbps * 1000 // rate + ((h >> 9) & 1)
    return {"frames": frames, "channel_modes": sorted(modes), "kbps_rate": sorted(seen)}


# ---------------------------------------------------------------------------- verification


def fft_peak(seg: np.ndarray, lo: float, hi: float) -> float:
    """Frequency (Hz) of the strongest spectral line in [lo, hi], parabolic-interpolated."""
    nfft = 1 << 21
    spec = np.abs(np.fft.rfft(seg * np.hanning(seg.size), nfft))
    f = np.fft.rfftfreq(nfft, 1.0 / SR)
    idx = np.flatnonzero((f >= lo) & (f <= hi))
    k = idx[int(np.argmax(spec[idx]))]
    a, b, c = np.log(spec[k - 1 : k + 2] + 1e-18)
    shift = 0.5 * (a - c) / (a - 2 * b + c)
    return float(f[k] + shift * (f[1] - f[0]))


def carrier_track(x: np.ndarray, carrier: float, width: float = 14.0) -> np.ndarray:
    """Instantaneous frequency (Hz, 1 kHz rate) of the component near `carrier`."""
    sos = signal.butter(4, [carrier - width, carrier + width], btype="band", fs=SR, output="sos")
    narrow = signal.sosfiltfilt(sos, x)[:: SR // 1000]
    phase = np.unwrap(np.angle(signal.hilbert(narrow)))
    inst = np.gradient(phase) * 1000 / (2 * np.pi)
    return signal.medfilt(inst, 1001)  # 1 s median


def verify_stereo(decoded: np.ndarray, piece: Piece, tol_hz: float = 0.15) -> dict[str, float]:
    """Raise AssertionError unless each ear carries its own carrier and the beat is the difference."""
    n = decoded.shape[0]
    beat = beat_curve(piece.beat, n)
    carrier = piece.carriers[0][0]
    fade = int(piece.fade * SR) + 3 * SR
    tracks = [carrier_track(decoded[:, ch], carrier) for ch in (0, 1)]
    k = SR // 1000
    sel = slice(fade // k, (n - fade) // k)
    exp_l = carrier - beat[:: k][sel] / 2
    exp_r = carrier + beat[:: k][sel] / 2
    err_l = float(np.max(np.abs(tracks[0][sel] - exp_l)))
    err_r = float(np.max(np.abs(tracks[1][sel] - exp_r)))
    beat_meas = tracks[1][sel] - tracks[0][sel]
    err_b = float(np.max(np.abs(beat_meas - 2 * (exp_r - carrier))))
    # FFT peaks of each ear in a 6 s window at three points; a glide moves inside the window,
    # so allow the schedule's travel across it.
    fft_errs = []
    for frac in (0.25, 0.5, 0.75):
        c0 = int(frac * n)
        a, b = c0 - 3 * SR, c0 + 3 * SR
        travel = float(np.ptp(beat[a:b])) / 2
        mean_beat = float(np.mean(beat[a:b]))
        for ch, sign in ((0, -1), (1, 1)):
            peak = fft_peak(decoded[a:b, ch], carrier - 12, carrier + 12)
            fft_errs.append(max(0.0, abs(peak - (carrier + sign * mean_beat / 2)) - travel))
    result = {
        "left_track_max_err_hz": err_l,
        "right_track_max_err_hz": err_r,
        "beat_max_err_hz": err_b,
        "fft_max_err_hz": float(max(fft_errs)),
        "min_beat_hz": float(beat_meas.min()),
        "max_beat_hz": float(beat_meas.max()),
    }
    for key in ("left_track_max_err_hz", "right_track_max_err_hz", "fft_max_err_hz"):
        assert result[key] <= tol_hz, f"{piece.slug}: {key}={result[key]:.3f} > {tol_hz}"
    assert err_b <= 2 * tol_hz, f"{piece.slug}: beat error {err_b:.3f} Hz"
    return result


def measure(decoded: np.ndarray, piece: Piece, path: Path) -> dict[str, object]:
    frames = mp3_frame_modes(path)
    assert frames["channel_modes"] == [0], f"{piece.slug}: not plain stereo: {frames}"
    assert abs(decoded.shape[0] - piece.seconds * SR) <= MPEG_ENCODER_DELAY_SLACK
    decoded = decoded[: piece.seconds * SR]
    loud, peak = lufs(decoded), true_peak_dbtp(decoded)
    assert LUFS_WINDOW[0] <= loud <= LUFS_WINDOW[1], f"{piece.slug}: {loud:.2f} LUFS"
    assert peak <= TRUE_PEAK_CEILING_DBTP, f"{piece.slug}: {peak:.2f} dBTP"
    stereo = verify_stereo(decoded, piece)
    corr = float(np.corrcoef(decoded[:, 0], decoded[:, 1])[0, 1])
    return {
        "slug": piece.slug,
        "files": list(piece.outputs),
        "seconds": piece.seconds,
        "bytes": path.stat().st_size,
        "mp3": frames,
        "integrated_lufs": round(loud, 2),
        "true_peak_dbtp": round(peak, 2),
        "lr_correlation": round(corr, 3),
        "carriers_hz": [c for c, _ in piece.carriers],
        "stereo_check": {k: round(v, 3) for k, v in stereo.items()},
    }


# ---------------------------------------------------------------------------- spectrograms


def spectrograms(decoded: np.ndarray, piece: Piece, out_dir: Path) -> Path:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    n = piece.seconds * SR
    decoded = decoded[:n]
    beat = beat_curve(piece.beat, n)
    carrier = piece.carriers[0][0]
    fig, ax = plt.subplots(4, 1, figsize=(11, 12), constrained_layout=True)
    for row, (ch, name) in enumerate(((0, "left"), (1, "right"))):
        # 8 s Hann windows, 1.6 s hop, zero-padded for a smooth ridge (resolution ~0.15 Hz).
        f, t, s = signal.spectrogram(
            decoded[:, ch], SR, window="hann", nperseg=8 * SR, noverlap=int(6.4 * SR), nfft=1 << 20
        )
        sel = (f >= carrier - 15) & (f <= carrier + 15)
        ax[row].pcolormesh(t, f[sel], 10 * np.log10(s[sel] + 1e-14), shading="auto", cmap="magma")
        ax[row].set_title(f"{name} ear: {piece.title}  (carrier {carrier:g} Hz +/- beat/2)")
        ax[row].set_ylabel("Hz")
    tracks = [carrier_track(decoded[:, ch], carrier) for ch in (0, 1)]
    tt = np.arange(tracks[0].size) / 1000
    ax[2].plot(tt, tracks[0], label="left (measured)")
    ax[2].plot(tt, tracks[1], label="right (measured)")
    ax[2].plot(tt, carrier - beat[:: SR // 1000][: tt.size] / 2, "k--", lw=0.8, label="designed")
    ax[2].plot(tt, carrier + beat[:: SR // 1000][: tt.size] / 2, "k--", lw=0.8)
    ax[2].set_ylim(carrier - 8, carrier + 8)
    ax[2].set_ylabel("main carrier, Hz")
    ax[2].legend(loc="upper right", fontsize=8)
    ax[3].plot(tt, tracks[1] - tracks[0], label="measured R - L")
    ax[3].plot(tt, beat[:: SR // 1000][: tt.size], "k--", lw=0.8, label="designed beat")
    ax[3].set_ylim(0, 17)
    ax[3].set_xlabel("seconds")
    ax[3].set_ylabel("beat, Hz")
    ax[3].legend(loc="upper right", fontsize=8)
    for a in ax:
        a.set_xlim(0, piece.seconds)
    path = out_dir / f"{piece.slug}-spectrogram.png"
    out_dir.mkdir(parents=True, exist_ok=True)
    fig.savefig(path, dpi=110)
    plt.close(fig)
    return path


# ---------------------------------------------------------------------------- main


def build(piece: Piece, report: Path | None, write_measurements: bool) -> dict[str, object]:
    master = synthesize(piece)
    first = REPO / piece.outputs[0]
    encode_mp3(master, first, piece.title)
    for extra in piece.outputs[1:]:
        (REPO / extra).write_bytes(first.read_bytes())
    decoded = decode_mp3(first)
    result = measure(decoded, piece, first)
    if report is not None:
        result["spectrogram"] = str(spectrograms(decoded, piece, report))
    print(json.dumps(result, indent=1))
    return result


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    ap.add_argument("--only", choices=[p.slug for p in PIECES], action="append")
    ap.add_argument("--report", type=Path, help="directory for the spectrogram PNGs")
    args = ap.parse_args()
    # A piece whose app is retired (apps/<app>/DEPRECATED.md) is not generated: the folder is left alone.
    live = [p for p in PIECES if not (REPO / Path(p.outputs[0]).parts[0] / Path(p.outputs[0]).parts[1] / "DEPRECATED.md").exists()]
    chosen = [p for p in live if not args.only or p.slug in args.only]
    results = [build(p, args.report, True) for p in chosen]
    total = sum(int(r["bytes"]) for r in results)  # type: ignore[call-overload]
    print(f"total {total} bytes ({total / 1e6:.2f} MB)")
    if not args.only:
        (Path(__file__).parent / "measurements.json").write_text(
            json.dumps({"bitrate_kbps": BITRATE_KBPS, "pieces": results}, indent=1) + "\n"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
