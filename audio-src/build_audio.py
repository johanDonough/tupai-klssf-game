"""Build web-ready game audio from the CC0 source packs in audio-src/.

Run:  python audio-src/build_audio.py
Needs ffmpeg (set FFMPEG below or put it on PATH). Writes public/audio/*.mp3
and public/audio/manifest.json. See audio-src/SOURCES.md for where every
source file came from and its licence.
"""
import json
import os
import shutil
import subprocess

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "public", "audio")
FFMPEG = os.environ.get("FFMPEG") or shutil.which("ffmpeg") or r"D:\LocalAI\Apps\ffmpeg\ffmpeg-9.0.2-essentials_build\bin\ffmpeg.exe"
SR = 44100

K = os.path.join(HERE, "kenney")
IFACE = os.path.join(K, "interface-sounds", "Audio")
IMPACT = os.path.join(K, "impact-sounds", "Audio")
CASINO = os.path.join(K, "casino-audio", "Audio")
RPG = os.path.join(K, "rpg-audio", "Audio")
DIGI = os.path.join(K, "digital-audio", "Audio")
UIPACK = os.path.join(K, "ui-pack", "Sounds")
PIZZI = os.path.join(K, "music-jingles", "Audio", "Pizzicato jingles")
STEEL = os.path.join(K, "music-jingles", "Audio", "Steel jingles")
MUSIC = os.path.join(HERE, "music")

# Each output: list of layers (path, gain_db), plus processing options.
#   max_s   hard cap on length (fade-out applied before the cap)
#   target  loudest 50 ms window RMS, dBFS (peak is always capped at -1 dBFS)
FX = {
    "throw-1": dict(layers=[(f"{CASINO}/card-slide-1.ogg", 0)], max_s=0.30, target=-18),
    "throw-2": dict(layers=[(f"{CASINO}/card-slide-5.ogg", 0)], max_s=0.30, target=-18),
    "throw-3": dict(layers=[(f"{CASINO}/card-slide-6.ogg", 0)], max_s=0.30, target=-18),
    # woody "bonk" (audible on phone speakers) + soft low body
    "hit-1": dict(layers=[(f"{IMPACT}/impactWood_light_000.ogg", 0), (f"{IMPACT}/impactSoft_medium_000.ogg", -6)], max_s=0.30, target=-15),
    "hit-2": dict(layers=[(f"{IMPACT}/impactWood_light_002.ogg", 0), (f"{IMPACT}/impactSoft_medium_002.ogg", -6)], max_s=0.30, target=-15),
    "hit-3": dict(layers=[(f"{IMPACT}/impactWood_light_004.ogg", 0), (f"{IMPACT}/impactSoft_medium_004.ogg", -6)], max_s=0.30, target=-15),
    "crit": dict(layers=[(f"{IMPACT}/impactPunch_medium_001.ogg", -2), (f"{IMPACT}/impactWood_light_001.ogg", 0), (f"{IFACE}/glass_002.ogg", -8)], max_s=0.45, target=-12),
    "foe-attack": dict(layers=[(f"{RPG}/dropLeather.ogg", 0), (f"{IMPACT}/impactSoft_heavy_000.ogg", -4)], max_s=0.45, target=-14),
    "beaten": dict(layers=[(f"{IFACE}/drop_004.ogg", 0)], max_s=0.35, target=-13),
    "nut-drop-1": dict(layers=[(f"{CASINO}/chips-collide-2.ogg", 0)], max_s=0.15, target=-18),
    "nut-drop-2": dict(layers=[(f"{CASINO}/chips-collide-3.ogg", 0)], max_s=0.15, target=-18),
    "pour-gate": dict(layers=[(f"{IFACE}/pluck_001.ogg", 0)], max_s=0.12, target=-16),
    "bounce": dict(layers=[(f"{DIGI}/phaserUp5.ogg", 0)], max_s=0.30, target=-16),
    "lock-break": dict(layers=[(f"{RPG}/metalLatch.ogg", 0), (f"{IMPACT}/impactPlank_medium_002.ogg", -3)], max_s=0.40, target=-13),
    "portal": dict(layers=[(f"{IFACE}/maximize_004.ogg", 0)], max_s=0.45, target=-16),
    "bank-1": dict(layers=[(f"{CASINO}/chips-stack-2.ogg", 0)], max_s=0.15, target=-18),
    "bank-2": dict(layers=[(f"{CASINO}/chips-stack-5.ogg", 0)], max_s=0.15, target=-18),
    "card-buy": dict(layers=[(f"{IFACE}/confirmation_001.ogg", 0)], max_s=0.6, target=-14),
    "button": dict(layers=[(f"{UIPACK}/tap-a.ogg", 0)], max_s=0.15, target=-16),
    "correct": dict(layers=[(f"{IFACE}/confirmation_002.ogg", 0)], max_s=0.8, target=-14),
    "wrong": dict(layers=[(f"{IFACE}/question_004.ogg", 0)], max_s=0.6, target=-14),
    "tick": dict(layers=[(f"{IFACE}/tick_004.ogg", 0)], max_s=0.10, target=-16),
    "wave-start": dict(layers=[(f"{PIZZI}/jingles_PIZZI15.ogg", 0)], max_s=1.2, target=-13),
    "win": dict(layers=[(f"{PIZZI}/jingles_PIZZI02.ogg", 0)], max_s=2.0, target=-13),
    "lose": dict(layers=[(f"{PIZZI}/jingles_PIZZI01.ogg", 0)], max_s=2.0, target=-14),
    "revive": dict(layers=[(f"{STEEL}/jingles_STEEL10.ogg", 0)], max_s=1.5, target=-13),
}

BGM_SRC = os.path.join(MUSIC, "childrens-march-theme", "Children's March Theme.wav")

VOLUME = {
    "bgm": 0.35,
    "throw": 0.5,
    "hit": 0.7,
    "crit": 0.8,
    "foe-attack": 0.6,
    "beaten": 0.65,
    "nut-drop": 0.35,
    "pour-gate": 0.3,
    "bounce": 0.45,
    "lock-break": 0.7,
    "portal": 0.45,
    "bank": 0.3,
    "card-buy": 0.75,
    "button": 0.5,
    "correct": 0.8,
    "wrong": 0.6,
    "tick": 0.5,
    "wave-start": 0.65,
    "win": 0.85,
    "lose": 0.7,
    "revive": 0.75,
}


def load(path, channels=1):
    raw = subprocess.run([FFMPEG, "-v", "error", "-i", path, "-ac", str(channels), "-ar", str(SR), "-f", "f32le", "-"],
                         capture_output=True, check=True).stdout
    x = np.frombuffer(raw, dtype=np.float32).copy()
    return x.reshape(-1, channels) if channels > 1 else x


def db(v):
    return 10 ** (v / 20)


def trim_lead(x, rel_db=-40):
    thr = np.max(np.abs(x)) * db(rel_db)
    idx = np.where(np.abs(x) > thr)[0]
    start = max(0, idx[0] - int(0.002 * SR))  # keep 2 ms of attack
    return x[start:]


def trim_tail(x, rel_db=-55):
    thr = np.max(np.abs(x)) * db(rel_db)
    idx = np.where(np.abs(x) > thr)[0]
    return x[: idx[-1] + 1]


def loudest_rms_db(x, win_s=0.05):
    w = max(1, int(win_s * SR))
    if len(x) <= w:
        return 20 * np.log10(np.sqrt(np.mean(x ** 2)) + 1e-12)
    c = np.cumsum(np.concatenate([[0], x.astype(np.float64) ** 2]))
    rms = np.sqrt((c[w:] - c[:-w]) / w)
    return 20 * np.log10(rms.max() + 1e-12)


def build_fx(name, spec):
    layers = []
    for path, gdb in spec["layers"]:
        x = trim_lead(load(path))
        x = x / (np.max(np.abs(x)) + 1e-12) * db(gdb)  # layers balanced by peak, then offset
        layers.append(x)
    n = max(len(l) for l in layers)
    mix = np.zeros(n, dtype=np.float32)
    for l in layers:
        mix[: len(l)] += l
    mix = trim_tail(mix)
    cap = int(spec["max_s"] * SR)
    if len(mix) > cap:
        mix = mix[:cap]
        fade = min(int(0.04 * SR), cap // 3)
        mix[-fade:] *= np.linspace(1, 0, fade, dtype=np.float32)
    else:
        fade = min(int(0.01 * SR), len(mix) // 4)
        mix[-fade:] *= np.linspace(1, 0, fade, dtype=np.float32)
    gain = db(spec["target"] - loudest_rms_db(mix))
    gain = min(gain, db(-1) / (np.max(np.abs(mix)) + 1e-12))
    mix = mix * gain
    encode(mix, os.path.join(OUT, f"{name}.mp3"), channels=1, kbps=96)
    return len(mix) / SR


def build_bgm():
    x = load(BGM_SRC, channels=2)
    mono = x.mean(axis=1)
    rms = 20 * np.log10(np.sqrt(np.mean(mono ** 2)) + 1e-12)
    gain = db(-17 - rms)
    gain = min(gain, db(-1) / (np.max(np.abs(x)) + 1e-12))
    encode(x * gain, os.path.join(OUT, "bgm.mp3"), channels=2, kbps=128)
    return len(x) / SR


def encode(x, path, channels, kbps):
    data = np.clip(x, -1, 1).astype(np.float32).tobytes()
    subprocess.run([FFMPEG, "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", str(channels), "-i", "-",
                    "-c:a", "libmp3lame", "-b:a", f"{kbps}k", "-map_metadata", "-1", path],
                   input=data, check=True)


def main():
    os.makedirs(OUT, exist_ok=True)
    sounds = {"bgm": ["bgm.mp3"]}
    print(f"bgm            {build_bgm():6.2f}s")
    for name, spec in FX.items():
        dur = build_fx(name, spec)
        key = name.rsplit("-", 1)[0] if name.rsplit("-", 1)[-1].isdigit() else name
        sounds.setdefault(key, []).append(f"{name}.mp3")
        print(f"{name:14s} {dur:6.2f}s")
    manifest = {"sounds": sounds, "volume": VOLUME}
    with open(os.path.join(OUT, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")
    total = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
    print(f"total public/audio: {total / 1024:.0f} KB")


if __name__ == "__main__":
    main()
