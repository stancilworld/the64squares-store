# Wooden chess piece sounds by physical modelling (v2).
#
# The first version used a handful of pure, slowly decaying tones, which reads as pitched
# ("piano-like"). Real wood is a dense set of strongly damped, inharmonic resonances, so the
# ear hears a dry "tock" with no note. Here every sound is:
#   contact force (a felt-padded piece landing: a smooth ~0.35 ms pulse, plus a tiny rebound)
#   * impulse response of the piece (many random modes 400 Hz-7 kHz, very short decay)
#   + impulse response of the board/table (many random modes 70-1200 Hz, a little longer)
#   then a very short room (a few early reflections), no tail.
# Run: python3 scripts/wood-sounds.py  (writes into public/sounds)
import os, subprocess, wave
import numpy as np

SR = 48000
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "sounds")


def modal_ir(r, n, lo, hi, count, t60_at_1k, slope, amp_tilt):
    """Sum of `count` damped modes, log-uniform between lo and hi Hz."""
    t = np.arange(n) / SR
    out = np.zeros(n)
    freqs = np.exp(r.uniform(np.log(lo), np.log(hi), count))
    for f in freqs:
        t60 = t60_at_1k * (1000 / f) ** slope * r.uniform(0.7, 1.3)
        a = (1000 / f) ** amp_tilt * r.uniform(0.2, 1.0)
        out += a * np.sin(2 * np.pi * f * t + r.uniform(0, 2 * np.pi)) * np.exp(-6.9 * t / t60)
    return out / (np.max(np.abs(out)) + 1e-9)


def pulse(width):
    """Hertzian contact force: half-sine of `width` seconds (longer = softer felt)."""
    m = max(3, int(SR * width))
    return np.sin(np.pi * np.arange(m) / m)


def knock(seed, strength=1.0, felt=1.0, board=1.0, piece=1.0, length=0.35):
    r = np.random.default_rng(seed)
    n = int(SR * length)
    piece_ir = modal_ir(r, n, 500, 7000, 90, 0.02, 0.6, 0.1)
    board_ir = modal_ir(r, n, 90, 1500, 60, 0.045, 0.5, 0.5)
    ir = piece * piece_ir + 0.45 * board * board_ir
    # Contact: main landing, then a small rebound 4-9 ms later (the piece settling).
    force = np.zeros(n)
    p = pulse(0.00035 * felt * r.uniform(0.9, 1.1))
    force[: len(p)] += p
    reb = int(SR * r.uniform(0.004, 0.009))
    p2 = pulse(0.0003 * felt) * r.uniform(0.12, 0.25)
    force[reb : reb + len(p2)] += p2
    x = np.convolve(force, ir)[:n]
    # A whisper of contact noise for the wood grain / felt texture.
    t = np.arange(n) / SR
    x += 0.04 * r.normal(0, 1, n) * np.exp(-t / 0.003) * np.max(np.abs(x))
    return strength * x / (np.max(np.abs(x)) + 1e-9)


def room(x, r):
    """A small wooden room: three early reflections, no reverb tail."""
    y = x.copy()
    for ms, g in [(7, 0.18), (13, 0.12), (21, 0.07)]:
        d = int(SR * ms / 1000 * r.uniform(0.9, 1.1))
        y[d:] += g * x[:-d]
    return y


def place(events, length):
    n = int(SR * length)
    out = np.zeros(n)
    for at, sig in events:
        i = int(SR * at)
        m = min(len(sig), n - i)
        out[i : i + m] += sig[:m]
    return out


def save(name, x, gain=0.9, seed=0):
    x = room(x, np.random.default_rng(seed + 1000))
    # Gentle low cut (below ~60 Hz) so small speakers don't distort.
    x = x - np.convolve(x, np.ones(400) / 400, "same")
    x = x / (np.max(np.abs(x)) + 1e-9) * gain
    tail = int(SR * 0.03)
    x[-tail:] *= np.linspace(1, 0, tail)
    path = os.path.join(OUT, name)
    pcm = (x * 32767).astype(np.int16)
    with wave.open(path + ".wav", "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", path + ".wav", "-codec:a", "libmp3lame", "-b:a", "128k", path + ".mp3"], check=True)
    os.remove(path + ".wav")


# Moves: three different set-downs, picked at random by the site.
for i, name in enumerate(["move", "move2", "move3"]):
    save(name, place([(0, knock((100, 105, 102)[i], felt=1.0 + 0.1 * i))], 0.26), gain=0.8, seed=i)
# Capture: the moving piece clicks against the captured one (hard wood on wood, no felt),
# then lands.
save("capture", place([(0, knock(201, 0.55, felt=0.45, board=0.25, piece=1.2)), (0.055, knock(202, 1.0, felt=0.95))], 0.33), gain=0.9, seed=20)
# Castling: king, then rook.
save("castle", place([(0, knock(301, 0.95)), (0.13, knock(302, 0.85, felt=1.1))], 0.42), gain=0.85, seed=30)
# Check: a firmer, slightly harder set-down.
save("check", place([(0, knock(401, 1.0, felt=0.75, board=1.3))], 0.3), gain=0.95, seed=40)
print("done")
