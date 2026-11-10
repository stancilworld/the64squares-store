# Wooden chess piece sounds by modal synthesis: a felt-bottomed wooden piece set down on a
# wooden board = a short broadband contact noise, a few damped resonances of the piece (high,
# inharmonic) and of the board (low, "thock"). Each event is slightly randomised.
import numpy as np, wave, subprocess, sys
SR = 44100
rng = np.random.default_rng(7)

def knock(strength=1.0, bright=1.0, board=1.0, seed=0):
    r = np.random.default_rng(seed)
    n = int(SR * 0.32); t = np.arange(n) / SR
    out = np.zeros(n)
    # Board body: low, slightly longer.
    for f, d, a in [(170, 0.055, 0.55), (310, 0.04, 0.35), (560, 0.03, 0.25)]:
        f *= r.uniform(0.96, 1.04)
        out += board * a * np.sin(2 * np.pi * f * t + r.uniform(0, 6)) * np.exp(-t / d)
    # Piece: hard wood, inharmonic modes, very short.
    for f, d, a in [(1150, 0.018, 0.45), (1870, 0.012, 0.35), (2650, 0.009, 0.28), (3700, 0.006, 0.18)]:
        f *= r.uniform(0.93, 1.07) * bright
        out += a * np.sin(2 * np.pi * f * t + r.uniform(0, 6)) * np.exp(-t / d)
    # Contact: a 3 ms click of filtered noise.
    noise = r.normal(0, 1, n) * np.exp(-t / 0.0025)
    k = np.ones(3) / 3
    out += 0.5 * bright * np.convolve(noise, k, "same")
    # Soft attack (felt): ~0.6 ms rise.
    att = np.minimum(1, t / 0.0006)
    return strength * out * att

def place(events, length=0.5):
    n = int(SR * length); out = np.zeros(n)
    for at, sig in events:
        i = int(SR * at); m = min(len(sig), n - i); out[i:i + m] += sig[:m]
    return out

def save(name, x, gain=0.9):
    # Gentle high cut and normalise.
    x = np.convolve(x, [0.25, 0.5, 0.25], "same")
    x = x / (np.max(np.abs(x)) + 1e-9) * gain
    # Fade out the tail.
    tail = int(SR * 0.04); x[-tail:] *= np.linspace(1, 0, tail)
    pcm = (x * 32767).astype(np.int16)
    with wave.open(f"{name}.wav", "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", f"{name}.wav", "-codec:a", "libmp3lame", "-b:a", "96k", f"{name}.mp3"], check=True)

for i in range(3):
    save(f"move{i+1}", place([(0.0, knock(1.0, 1.0, 1.0, seed=10 + i))], 0.3), gain=0.85)
# Capture: the piece knocks the taken one, then lands (two quick contacts, brighter).
save("capture", place([(0.0, knock(0.7, 1.15, 0.6, seed=21)), (0.045, knock(1.0, 1.08, 1.0, seed=22))], 0.36), gain=0.95)
# Castling: king, then rook.
save("castle", place([(0.0, knock(0.95, 1.0, 1.0, seed=31)), (0.14, knock(0.85, 0.95, 1.0, seed=32))], 0.46), gain=0.9)
# Check: a firmer set-down.
save("check", place([(0.0, knock(1.0, 1.2, 1.25, seed=41))], 0.34), gain=1.0)
print("done")
