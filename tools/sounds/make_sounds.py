"""
Designs the site's sound effects and writes them to public/sounds as 44.1 kHz, 16-bit stereo WAV files.

Every sound is built from three layers:
  1. Transient (0-30 ms): a filtered noise burst or a fast pitch-drop click, for the attack.
  2. Body (30-300 ms): FM tones with non-integer ratios (1:2.5 woody, 1:1.414 glassy, 1:1.618 dark), detuned
     unison voices, filtered noise, or, for creatures, a small formant (vowel) voice synthesiser.
  3. Tail: a room from pedalboard's reverb, sized to where the sound lives (a meadow, a cave, the void).
Then each is mastered: gentle compression, a little saturation, a roll-off above 12-15 kHz, and a -1 dBFS peak.

It also writes src/world/sound-manifest.json: the files for each sound and a gain that evens out how loud they
feel, so a toggle click and a splash sit at sensible levels next to each other.

Each WAV also gets an Opus copy (.ogg, about a tenth of the size) made with ffmpeg; browsers that can play Opus
load those, and the rest load the WAVs.

Run from the repository root:   python tools/sounds/make_sounds.py
Needs:                          python -m pip install numpy scipy pedalboard, and ffmpeg on the PATH
The random seeds are fixed, so the same script always writes the same files.
"""

import json
import pathlib
import shutil
import subprocess

import numpy as np
from pedalboard import Compressor, Distortion, HighpassFilter, LadderFilter, LowpassFilter, Pedalboard, Reverb
from pedalboard.io import AudioFile
from scipy import signal

SR = 44100
ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "public" / "sounds"
MANIFEST = ROOT / "src" / "world" / "sound-manifest.json"


# ---------------------------------------------------------------- building blocks


def n_of(sec):
    return int(round(sec * SR))


def times(sec):
    return np.arange(n_of(sec)) / SR


def norm(x):
    return x / (np.max(np.abs(x)) + 1e-12)


def put(buf, x, at):
    """Mixes x into buf starting `at` seconds in."""
    i = n_of(at)
    if i >= len(buf):
        return
    m = min(len(x), len(buf) - i)
    buf[i : i + m] += x[:m]


def exp_env(sec, decay, attack=0.001):
    """A fast linear attack and an exponential decay that lands exactly on zero, so a layer never ends in a click."""
    t = times(sec)
    env = np.clip(t / max(attack, 1e-5), 0, 1) * np.exp(-np.maximum(t - attack, 0) / decay)
    fade = max(1, min(n_of(0.006), len(env) // 8))
    env[-fade:] *= np.linspace(1, 0, fade)
    return env


def lin(points, sec):
    t = times(sec)
    ts, vs = zip(*points)
    return np.interp(t, ts, vs)


def glide(points, sec):
    """Pitch curves move in ratios, so interpolate in the log domain."""
    t = times(sec)
    ts, vs = zip(*points)
    return np.exp(np.interp(t, ts, np.log(vs)))


def filt(x, kind, freq, order=2):
    return signal.sosfilt(signal.butter(order, freq, btype=kind, fs=SR, output="sos"), x)


def white(rng, sec):
    return rng.standard_normal(n_of(sec))


def pink(rng, sec):
    n = n_of(sec)
    spec = np.fft.rfft(rng.standard_normal(n))
    f = np.fft.rfftfreq(n, 1 / SR)
    f[0] = f[1]
    return norm(np.fft.irfft(spec / np.sqrt(f), n))


def brown(rng, sec):
    return norm(filt(np.cumsum(rng.standard_normal(n_of(sec))), "highpass", 20, 1))


def phase_of(freq):
    return 2 * np.pi * np.cumsum(freq) / SR


def fm(carrier, ratio, index):
    """Two-operator FM: a sine carrier whose phase is pushed around by a modulator at carrier x ratio."""
    carrier = np.asarray(carrier, dtype=float)
    return np.sin(phase_of(carrier) + index * np.sin(phase_of(carrier * ratio)))


def unison(make, cents=(-7, 0, 7)):
    """Several slightly detuned copies of a voice, for width and life."""
    return sum(make(2 ** (c / 1200)) for c in cents) / len(cents)


def click_drop(sec, f_from, f_to, decay):
    """A rapid exponential pitch-drop click: the knock at the front of an impact."""
    t = times(sec)
    f = f_to + (f_from - f_to) * np.exp(-t / (decay / 2))
    return np.sin(phase_of(f)) * np.exp(-t / decay)


def burst(rng, sec, decay, hp=None, lp=None, band=None, colour=white):
    """A short burst of filtered noise."""
    x = colour(rng, sec)
    if hp:
        x = filt(x, "highpass", hp)
    if lp:
        x = filt(x, "lowpass", lp)
    if band:
        x = filt(x, "bandpass", band)
    return norm(x) * exp_env(sec, decay, 0.0005)


def bubble(f_from, f_to, sec, decay):
    """A water bubble: a sine whose pitch rises as it closes."""
    return np.sin(phase_of(glide([(0, f_from), (sec, f_to)], sec))) * exp_env(sec, decay, 0.002)


def ladder(x, cutoff, resonance=0.2, mode=LadderFilter.Mode.LPF12):
    board = Pedalboard([LadderFilter(mode=mode, cutoff_hz=cutoff, resonance=resonance)])
    return board(np.asarray(x, dtype=np.float32)[None, :], SR)[0].astype(float)


# ---------------------------------------------------------------- a small voice synthesiser


def glottal(f0, rng, tilt=1.3, jitter=0.006, max_hz=9000):
    """A band-limited voice source: harmonics of f0 falling off as 1/k^tilt, with a little pitch jitter."""
    n = len(f0)
    wobble = norm(filt(rng.standard_normal(n), "lowpass", 18))
    f = f0 * (1 + jitter * wobble)
    ph = phase_of(f)
    out = np.zeros(n)
    for k in range(1, int(max_hz / np.min(f)) + 1):
        fade = np.clip((max_hz - k * f) / 600, 0, 1)  # harmonics fade out before they'd alias
        out += fade * np.sin(k * ph) / k**tilt
    return norm(out)


def resonator(x, freq, bw):
    """One formant: a two-pole resonator (Klatt style) whose centre and bandwidth can move every sample."""
    n = len(x)
    freq = np.broadcast_to(np.asarray(freq, dtype=float), (n,))
    bw = np.broadcast_to(np.asarray(bw, dtype=float), (n,))
    c = -np.exp(-2 * np.pi * bw / SR)
    b = 2 * np.exp(-np.pi * bw / SR) * np.cos(2 * np.pi * freq / SR)
    a = 1 - b - c
    xs, as_, bs, cs = x.tolist(), a.tolist(), b.tolist(), c.tolist()
    y = [0.0] * n
    y1 = y2 = 0.0
    for i in range(n):
        yi = as_[i] * xs[i] + bs[i] * y1 + cs[i] * y2
        y[i] = yi
        y2, y1 = y1, yi
    return np.array(y)


def voice(rng, sec, f0, formants, breath=0.1, tilt=1.3, scale=1.0, rough=None, sub=0.0):
    """A voiced sound: a glottal source (plus breath noise) through a cascade of moving formants."""
    src = glottal(f0, rng, tilt)
    if sub:
        src = src + sub * np.sin(phase_of(f0 / 2))
    if rough is not None:
        src = src * rough
    x = src + norm(filt(white(rng, sec), "highpass", 1400)) * breath
    for f, bw in formants:
        x = resonator(x, np.asarray(f, dtype=float) * scale, bw)
    return norm(x)


# ---------------------------------------------------------------- mastering


def master(x, room=0.2, wet=0.12, damping=0.5, width=0.9, drive=2.5, lp=14000, tail=0.6, level=0.4, compress=True):
    """Compression, saturation, a roll-off, and a room; then trimmed and peaked at -1 dBFS, in stereo."""
    x = np.concatenate([norm(x) * level, np.zeros(n_of(tail))])
    stereo = np.stack([x, x]).astype(np.float32)
    chain = [HighpassFilter(cutoff_frequency_hz=30)]
    if compress:
        chain.append(Compressor(threshold_db=-18, ratio=2.5, attack_ms=12, release_ms=150))
    chain += [
        Distortion(drive_db=drive),
        LowpassFilter(cutoff_frequency_hz=lp),
        Reverb(room_size=room, damping=damping, wet_level=wet, dry_level=1 - wet * 0.5, width=width),
    ]
    board = Pedalboard(chain)
    y = board(stereo, SR).astype(float)
    peak = np.max(np.abs(y))
    # Trim the tail once it's 50 dB below the peak (inaudible at the levels the site plays at), then fade.
    loud = np.nonzero(np.max(np.abs(y), axis=0) > peak * 10 ** (-50 / 20))[0]
    end = min(y.shape[1], int(loud[-1]) + n_of(0.01))
    y = y[:, :end]
    fade = min(n_of(0.02), end)
    y[:, end - fade :] *= np.linspace(1, 0, fade)
    y[:, : n_of(0.001)] *= np.linspace(0, 1, n_of(0.001))  # no click at the very start
    return y / np.max(np.abs(y)) * 10 ** (-1 / 20)


# ---------------------------------------------------------------- the sounds


def s_place(rng, v):
    """A block set down: a tactile tick, a woody knock, a small room."""
    base = (176, 198, 160)[v]
    out = np.zeros(n_of(0.3))
    put(out, burst(rng, 0.03, 0.004, hp=2200) * 0.55, 0)
    put(out, click_drop(0.03, 2600, 700, 0.006) * 0.3, 0)
    t = times(0.25)
    f = base * (1 + 0.08 * np.exp(-t / 0.02))
    index = 0.4 + 2.6 * np.exp(-t / 0.025)
    put(out, unison(lambda d: fm(f * d, 2.5, index), (-6, 0, 6)) * exp_env(0.25, 0.06, 0.0015) * 0.9, 0.002)
    put(out, norm(filt(brown(rng, 0.12), "bandpass", [140, 900])) * exp_env(0.12, 0.035, 0.001) * 0.5, 0.001)
    return master(out, room=0.18, wet=0.12, damping=0.6, drive=3, tail=0.3)


def s_break(rng, v):
    """A block breaking: a crack, a low thump, and a spray of crumbling grains."""
    out = np.zeros(n_of(0.4))
    put(out, burst(rng, 0.04, 0.005, hp=1500) * 0.8, 0)
    put(out, click_drop(0.08, 180 + v * 15, 70, 0.03) * 0.55, 0)
    for _ in range(int(rng.integers(18, 27))):
        at = min(float(rng.exponential(0.05)), 0.25)
        dur = float(rng.uniform(0.006, 0.025))
        fc = float(rng.uniform(700, 4500))
        grain = burst(rng, dur, dur / 3, band=[fc / 1.4, min(fc * 1.4, 18000)])
        put(out, grain * rng.uniform(0.25, 0.7) * np.exp(-at / 0.12), 0.004 + at)
    put(out, norm(filt(pink(rng, 0.2), "bandpass", [400, 2600])) * exp_env(0.2, 0.05, 0.001) * 0.45, 0.002)
    return master(out, room=0.25, wet=0.15, damping=0.55, drive=3, tail=0.35)


def s_deny(rng, v=0):
    """Not allowed: two soft, muted knocks, the second lower."""
    out = np.zeros(n_of(0.34))
    for at, f0 in ((0, 233), (0.11, 196)):
        put(out, burst(rng, 0.01, 0.002, lp=1500) * 0.3, at)
        t = times(0.16)
        index = 0.3 + 1.6 * np.exp(-t / 0.03)
        put(out, unison(lambda d: fm(np.full(len(t), f0 * d), 2.5, index), (-8, 0, 8)) * exp_env(0.16, 0.045, 0.002), at + 0.002)
    out = ladder(out, 1800, 0.15)
    return master(out, room=0.15, wet=0.1, drive=2, tail=0.25)


def s_ui(rng, v=0):
    """A toggle: a crisp tick and a short glassy ping."""
    out = np.zeros(n_of(0.16))
    put(out, burst(rng, 0.008, 0.0012, hp=4000) * 0.5, 0)
    t = times(0.09)
    index = 2.2 * np.exp(-t / 0.012)
    put(out, unison(lambda d: fm(np.full(len(t), 1850 * d), 1.414, index), (-4, 4)) * exp_env(0.09, 0.018, 0.0008) * 0.7, 0.0005)
    return master(out, room=0.1, wet=0.08, drive=1, tail=0.2)


# ---------------------------------------------------------------- creatures
# Creatures make sounds on their own, often, and several at once, so theirs are soft: slow attacks, no bright
# highs, small dark rooms, short tails, and several takes each so nothing repeats exactly.


def soft(x, room=0.2, wet=0.08, damping=0.7, lp=6000, tail=0.35, drive=0.8, width=0.8):
    """
    Mastering for creature sounds: darker, drier and gentler than the block sounds. A steep 4th-order cut at
    `lp` comes first (the mastering roll-off alone is gentle), so nothing bright or hissy gets through. No
    compressor: these are quiet already, and its gain changes left faint blips on the voices.
    """
    x = filt(x, "lowpass", lp, order=4)
    return master(x, room=room, wet=wet, damping=damping, width=width, drive=drive, lp=lp, tail=tail, compress=False)


def s_baa(rng, v):
    """A sheep: a short, breathy bleat. Takes: 'baa', a longer 'baa-a', and a little 'meh'."""
    sec, f_start, f_peak, f_end, open_ = ((0.48, 290, 330, 270, 700), (0.6, 270, 305, 245, 680), (0.32, 320, 345, 300, 560))[v]
    t = times(sec)
    flutter = np.sin(2 * np.pi * (24 + 3 * v) * t)
    f0 = glide([(0, f_start), (0.08, f_peak), (sec, f_end)], sec) * (1 + 0.015 * flutter)
    formants = [
        (lin([(0, 320), (0.06, open_), (sec, open_ * 0.82)], sec), 120),
        (lin([(0, 950), (0.06, 1250), (sec, 1550)], sec), 160),
        (2450, 240),
    ]
    x = voice(rng, sec, f0, formants, breath=0.1, tilt=1.4)
    x *= lin([(0, 0), (0.04, 0.9), (0.12, 1), (sec * 0.7, 0.75), (sec, 0)], sec) * (0.8 + 0.1 * (1 + flutter))
    out = np.zeros(n_of(sec + 0.02))
    put(out, burst(rng, 0.02, 0.006, lp=900) * 0.12, 0)
    put(out, x, 0.01)
    return soft(out, lp=5000)


def grunt(rng, sec, f_start, f_end, rasp=0.25, f2_end=1600):
    """One low, nasal grunt with a little rasp. With f2_end high it glides from 'o' toward 'i', like 'oink'."""
    t = times(sec)
    f0 = glide([(0, f_start), (sec * 0.4, f_start * 1.06), (sec, f_end)], sec)
    rough = 1 + rasp * np.sin(2 * np.pi * 38 * t + rng.uniform(0, 6.28))
    formants = [
        (lin([(0, 380), (sec * 0.6, 420), (sec, 320)], sec), 160),
        (lin([(0, 850), (sec * 0.6, 1000), (sec, f2_end)], sec), 220),
        (2300, 300),
    ]
    x = voice(rng, sec, f0, formants, breath=0.04, tilt=1.25, rough=rough, sub=0.25)
    snort = norm(filt(white(rng, sec), "bandpass", [250, 1200])) * 0.2
    return norm(x + snort) * lin([(0, 0), (0.025, 1), (sec * 0.7, 0.8), (sec, 0)], sec)


def s_oink(rng, v):
    """A pig. Takes: one soft 'oink', a lazy 'oink oink', and a snuffle."""
    out = np.zeros(n_of(0.45))
    if v == 0:
        put(out, burst(rng, 0.025, 0.008, lp=1500) * 0.15, 0)
        put(out, grunt(rng, 0.16, 112, 94), 0.01)
    elif v == 1:
        put(out, burst(rng, 0.025, 0.008, lp=1500) * 0.12, 0)
        put(out, grunt(rng, 0.13, 118, 98), 0.01)
        put(out, grunt(rng, 0.12, 110, 92) * 0.75, 0.22)
    else:
        for at in (0, 0.07, 0.13):
            put(out, burst(rng, 0.05, 0.015, band=[300, 1400]) * 0.35, at)  # sniffs
        put(out, grunt(rng, 0.1, 100, 90, f2_end=1100) * 0.6, 0.2)
    return soft(out, lp=4000)


def s_grunt(rng, v):
    """A hogling chatting with a friend: soft low grunts. Takes: 'hm', 'heh-heh', and a rising 'hrm?'."""
    out = np.zeros(n_of(0.4))
    put(out, burst(rng, 0.02, 0.006, lp=1000) * 0.1, 0)
    if v == 0:
        put(out, grunt(rng, 0.14, 105, 92, rasp=0.15, f2_end=1050), 0.005)
    elif v == 1:
        put(out, grunt(rng, 0.08, 125, 110, rasp=0.15, f2_end=1100), 0.005)
        put(out, grunt(rng, 0.08, 120, 104, rasp=0.15, f2_end=1100) * 0.8, 0.13)
    else:
        put(out, grunt(rng, 0.18, 95, 128, rasp=0.15, f2_end=1200), 0.005)
    return soft(out, room=0.3, wet=0.08, lp=3500)


def s_squeal(rng, v):
    """A hogling picked up or poked: a short squeal, lower and softer than a real pig's. Two takes."""
    sec = (0.34, 0.28)[v]
    peak = (980, 860)[v]
    t = times(sec)
    f0 = glide([(0, 520), (0.07, peak), (sec, peak * 0.75)], sec) * (1 + 0.02 * np.sin(2 * np.pi * 14 * t))
    formants = [(lin([(0, 850), (sec, 950)], sec), 240), (lin([(0, 1900), (sec, 2200)], sec), 300), (3000, 380)]
    x = voice(rng, sec, f0, formants, breath=0.12, tilt=1.3, rough=1 + 0.12 * np.sin(2 * np.pi * 55 * t))
    x *= lin([(0, 0), (0.03, 1), (sec * 0.6, 0.8), (sec, 0)], sec)
    out = np.zeros(n_of(sec + 0.02))
    put(out, burst(rng, 0.02, 0.006, lp=1500) * 0.12, 0)
    put(out, x, 0.008)
    return soft(out, room=0.3, wet=0.08, lp=5000, drive=1.2)


def s_squeak(rng, v):
    """A bat: tiny, soft chirps, well below the old piercing range. Takes: one, two and three chirps."""
    out = np.zeros(n_of(0.25))
    put(out, burst(rng, 0.03, 0.01, lp=500) * 0.08, 0)  # a soft wing flap underneath
    for i in range(v + 1):
        d = float(rng.uniform(0.018, 0.026))
        tt = times(d)
        top = 3500 - i * 180 - v * 100
        f = glide([(0, top), (d, top * 0.72)], d)
        chirp = unison(lambda k: fm(f * k, 1.414, 0.15 * np.exp(-tt / 0.008)), (-8, 8)) * exp_env(d, d / 2.2, 0.004)
        put(out, chirp * (1 - i * 0.2), 0.004 + i * 0.06)
    return soft(out, room=0.2, wet=0.05, damping=0.7, lp=5000, tail=0.25)


def s_blub(rng, v):
    """A slime: a soft, round bloop. Takes at three pitches, one with a second little bubble."""
    lo = (170, 200, 150)[v]
    out = np.zeros(n_of(0.3))
    put(out, burst(rng, 0.02, 0.006, lp=800) * 0.12, 0)
    put(out, bubble(lo, lo * 2.1, 0.16, 0.05), 0.004)
    if v == 1:
        put(out, bubble(lo * 1.5, lo * 2.8, 0.09, 0.03) * 0.35, 0.07)
    tb = times(0.16)
    body = fm(glide([(0, lo * 0.8), (0.16, lo * 1.1)], 0.16), 2.5, 0.5 * np.exp(-tb / 0.04)) * exp_env(0.16, 0.04, 0.004)
    put(out, body * 0.25, 0.004)
    return soft(out, room=0.25, wet=0.08, lp=2500, tail=0.25)


def s_chime(rng, v):
    """
    A fairy: one soft glass-harp note with a flutter of wings, low and short so it never rings over the page.
    Four takes on a pentatonic scale; two add a quiet grace note a fourth above.
    """
    f = (587.3, 659.3, 784.0, 880.0)[v]
    out = np.zeros(n_of(0.8))
    tw = times(0.12)
    wings = norm(filt(white(rng, 0.12), "bandpass", [900, 2500])) * (0.7 + 0.3 * np.sin(2 * np.pi * 32 * tw))
    put(out, wings * lin([(0, 0), (0.04, 1), (0.12, 0)], 0.12) * 0.05, 0)
    t = times(0.7)

    def note(freq, gain, at):
        # Long enough to die away completely (about -47 dB) before it ends, so it never stops with a tick.
        index = 0.15 + 0.5 * np.exp(-t / 0.05)
        tone = unison(lambda d: fm(np.full(len(t), freq * d), 1.414, index), (-3, 0, 3)) * exp_env(0.7, 0.13, 0.012)
        put(out, tone * gain, at)

    note(f, 1.0, 0.01)
    if v in (1, 3):
        note(f * 1.335, 0.45, 0.085)
    return soft(out, room=0.3, wet=0.12, damping=0.6, lp=6000, tail=0.4)


def s_murmur(rng, v):
    """A shade speaking: a low, breathy hum through closed lips. Takes: 'hmm', a rising 'hm?', and 'mm-mm'."""
    out = np.zeros(n_of(0.5))
    put(out, burst(rng, 0.03, 0.01, lp=700) * 0.1, 0)

    def hum(sec, f_from, f_to, gain, at):
        f0 = glide([(0, f_from), (sec, f_to)], sec)
        x = voice(rng, sec, f0, [(260, 90), (1050, 300), (2300, 400)], breath=0.25, tilt=1.6)  # a nasal 'm'
        put(out, x * lin([(0, 0), (0.05, 1), (sec * 0.7, 0.8), (sec, 0)], sec) * gain, at)

    if v == 0:
        hum(0.34, 105, 92, 1, 0.01)
    elif v == 1:
        hum(0.3, 95, 125, 1, 0.01)
    else:
        hum(0.14, 108, 100, 1, 0.01)
        hum(0.16, 100, 88, 0.85, 0.2)
    return soft(out, room=0.45, wet=0.12, damping=0.75, lp=2500, tail=0.35)


def s_warp(rng, v):
    """
    A shade blinking away: a soft, dark 'fwoop' of air over a low hum, over in a moment.
    Takes: rising (leaving), falling (arriving), and a short puff.
    """
    sec = (0.34, 0.34, 0.22)[v]
    air_from, air_to = ((260, 900), (900, 260), (300, 600))[v]
    hum_from, hum_to = ((90, 135), (135, 85), (100, 115))[v]
    out = np.zeros(n_of(sec + 0.02))
    put(out, burst(rng, 0.025, 0.008, lp=600) * 0.1, 0)
    swell = lin([(0, 0), (sec * 0.55, 1), (sec, 0)], sec) ** 1.5
    air = resonator(white(rng, sec), glide([(0, air_from), (sec, air_to)], sec), 260)
    put(out, norm(air) * swell * 0.6, 0)
    pitch = glide([(0, hum_from), (sec, hum_to)], sec)
    hum = unison(lambda k: fm(pitch * k, 1.618, 0.7), (-10, 10)) * swell
    put(out, ladder(hum, 900, 0.1) * 0.5, 0)
    return soft(out, room=0.45, wet=0.12, damping=0.75, lp=3500, tail=0.4)


def s_hey(rng, v):
    """The mini owner: a friendly 'hey!', a quick 'hi!', or a curious 'hm?'. Soft and close."""
    out = np.zeros(n_of(0.4))
    if v == 2:
        sec = 0.24
        f0 = glide([(0, 210), (sec, 285)], sec)
        x = voice(rng, sec, f0, [(280, 90), (1150, 250), (2500, 350)], breath=0.15, tilt=1.5, scale=1.1)
        put(out, burst(rng, 0.02, 0.006, lp=900) * 0.08, 0)
        put(out, x * lin([(0, 0), (0.03, 1), (sec * 0.7, 0.85), (sec, 0)], sec), 0.01)
        return soft(out, room=0.2, wet=0.06, lp=4000)
    sec = (0.24, 0.2)[v]
    breath_in = norm(filt(white(rng, 0.05), "bandpass", [1000, 3200])) * lin([(0, 0), (0.035, 1), (0.05, 0.3)], 0.05)
    put(out, breath_in * 0.15, 0)
    f0 = glide([(0, 245), (0.07, 310), (sec, 270)], sec)
    if v == 0:  # 'hey': e gliding to i
        formants = [(lin([(0, 520), (0.1, 520), (sec, 340)], sec), 100), (lin([(0, 1850), (0.1, 1950), (sec, 2300)], sec), 140), (2750, 220)]
    else:  # 'hi': a gliding to i
        formants = [(lin([(0, 760), (0.08, 740), (sec, 360)], sec), 110), (lin([(0, 1250), (0.08, 1350), (sec, 2200)], sec), 150), (2650, 220)]
    x = voice(rng, sec, f0, formants, breath=0.1, tilt=1.35, scale=1.1)
    put(out, x * lin([(0, 0), (0.025, 1), (sec * 0.6, 0.85), (sec, 0)], sec), 0.04)
    return soft(out, room=0.2, wet=0.06, lp=5500)


def s_yawn(rng, v):
    """The mini owner, sleepy: a soft, breathy yawn that sinks. Two takes."""
    sec = (0.85, 0.7)[v]
    out = np.zeros(n_of(sec + 0.1))
    inhale = norm(filt(white(rng, 0.1), "bandpass", [500, 2200])) * lin([(0, 0), (0.08, 1), (0.1, 0.3)], 0.1)
    put(out, inhale * 0.12, 0)
    f0 = glide([(0, 230), (sec * 0.3, (300, 280)[v]), (sec * 0.6, 220), (sec, 160)], sec)
    formants = [
        (lin([(0, 600), (sec * 0.3, 780), (sec * 0.7, 600), (sec, 420)], sec), 120),
        (lin([(0, 1250), (sec * 0.3, 1200), (sec * 0.7, 950), (sec, 800)], sec), 160),
        (2400, 260),
    ]
    x = voice(rng, sec, f0, formants, breath=0.3, tilt=1.6, scale=1.08)
    put(out, x * lin([(0, 0), (0.1, 0.6), (sec * 0.35, 1), (sec * 0.8, 0.5), (sec, 0)], sec), 0.07)
    return soft(out, room=0.2, wet=0.06, lp=4500, tail=0.3)


def s_sizzle(rng, v):
    """Lava, when a creature lands in it: a short, soft hiss with a few crackles over a low whump. Two takes."""
    sec = (0.6, 0.5)[v]
    out = np.zeros(n_of(sec))
    put(out, burst(rng, 0.03, 0.012, band=[1500, 5000]) * 0.3, 0)
    flutter = 0.6 + 0.4 * norm(filt(white(rng, sec), "lowpass", 25))
    hiss = norm(filt(white(rng, sec), "bandpass", [1500, 4500])) * flutter
    put(out, hiss * lin([(0, 0), (0.03, 1), (sec * 0.4, 0.5), (sec, 0)], sec) * 0.4, 0)
    at = 0.0
    while True:
        at += float(rng.exponential(1 / 25))
        if at > sec - 0.05:
            break
        fc = float(rng.uniform(1500, 4000))
        put(out, burst(rng, 0.004, 0.0012, band=[fc / 1.5, fc * 1.5]) * rng.uniform(0.1, 0.3) * np.exp(-at / 0.25), at)
    put(out, norm(filt(brown(rng, 0.3), "lowpass", 250)) * exp_env(0.3, 0.1, 0.02) * 0.35, 0)
    return soft(out, room=0.3, wet=0.08, lp=4500, tail=0.3)


def s_splash(rng, v):
    """Water, when a creature lands in it: a soft plunk, a short wash and a few droplets. Two takes."""
    out = np.zeros(n_of(0.6))
    put(out, burst(rng, 0.025, 0.008, lp=2500) * 0.35, 0)
    put(out, click_drop(0.1, 150 + 20 * v, 80, 0.04) * 0.5, 0)
    d = 0.28
    wash = resonator(white(rng, d), glide([(0, 1800), (d, 600)], d), 700)
    put(out, norm(wash) * exp_env(d, 0.09, 0.01) * 0.45, 0.005)
    for _ in range(8):
        at = 0.03 + min(float(rng.exponential(0.1)), 0.4)
        f0 = float(rng.uniform(600, 1600))
        dd = float(rng.uniform(0.02, 0.045))
        put(out, bubble(f0, f0 * 1.5, dd, dd / 2.5) * rng.uniform(0.08, 0.2) * np.exp(-at / 0.25), at)
    return soft(out, room=0.3, wet=0.1, lp=6000, tail=0.35)


def s_thud(rng, v):
    """A landing: a dull click, a low FM body that drops in pitch, a thump, and a puff of dust."""
    base = (78, 70)[v]
    out = np.zeros(n_of(0.4))
    put(out, burst(rng, 0.015, 0.003, lp=3000) * 0.5, 0)
    t = times(0.3)
    f = base * (1 + 0.5 * np.exp(-t / 0.012))
    put(out, fm(f, 2.5, 2 * np.exp(-t / 0.03)) * exp_env(0.3, 0.07, 0.001), 0.001)
    put(out, norm(filt(brown(rng, 0.2), "lowpass", 250)) * exp_env(0.2, 0.05, 0.001) * 0.6, 0.001)
    put(out, burst(rng, 0.06, 0.015, band=[1000, 3000]) * 0.15, 0.004)
    return master(out, room=0.2, wet=0.1, damping=0.6, drive=3, tail=0.3)


# Each sound: how to make it, how many takes (played in turn so repeats don't sound identical), and how loud it
# should feel (short-term level in dB). Block and interface sounds are the visitor's own actions, so they're
# clear; creature sounds sit 9-13 dB under them, and the site plays the ones creatures make on their own
# quieter still.
SOUNDS = {
    "place": (s_place, 3, -21),
    "break": (s_break, 3, -20),
    "deny": (s_deny, 1, -24),
    "ui": (s_ui, 1, -26),
    "baa": (s_baa, 3, -30),
    "oink": (s_oink, 3, -30),
    "grunt": (s_grunt, 3, -32),
    "squeal": (s_squeal, 2, -31),
    "squeak": (s_squeak, 3, -33),
    "blub": (s_blub, 3, -31),
    "chime": (s_chime, 4, -34),
    "murmur": (s_murmur, 3, -32),
    "warp": (s_warp, 3, -33),
    "hey": (s_hey, 3, -29),
    "yawn": (s_yawn, 2, -31),
    "sizzle": (s_sizzle, 2, -31),
    "splash": (s_splash, 2, -28),
    "thud": (s_thud, 2, -27),
}


def short_term_db(y):
    """The loudest 50 ms of a sound (mid channel, above 100 Hz), in dBFS: close enough to how loud it feels."""
    mid = filt(y.mean(axis=0), "highpass", 100)
    win = n_of(0.05)
    power = np.convolve(mid**2, np.ones(win) / win, mode="valid")
    return 10 * np.log10(np.max(power) + 1e-12)


def opus(wav):
    """A small Opus copy of a WAV for the site. Opus always trims its own encoder delay, so timing stays exact."""
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise SystemExit("ffmpeg is needed for the Opus copies: install it and put it on the PATH")
    subprocess.run(
        [ffmpeg, "-y", "-loglevel", "error", "-i", str(wav), "-c:a", "libopus", "-b:a", "96k", "-vbr", "on", "-application", "audio", str(wav.with_suffix(".ogg"))],
        check=True,
    )


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    # Everything in public/sounds comes from this script, so start clean: no files left from old takes.
    for old in [*OUT.glob("*.wav"), *OUT.glob("*.ogg")]:
        old.unlink()
    manifest = {}
    for kind, (make, variants, target) in SOUNDS.items():
        files = []
        levels = []
        for v in range(variants):
            rng = np.random.default_rng(sum(map(ord, kind)) * 31 + v)  # fixed per sound, so renders repeat exactly
            y = make(rng, v)
            assert np.all(np.isfinite(y)), kind
            name = f"{kind}-{v + 1}.wav" if variants > 1 else f"{kind}.wav"  # the manifest lists names without extension
            with AudioFile(str(OUT / name), "w", samplerate=SR, num_channels=2, bit_depth=16) as f:
                f.write(y.astype(np.float32))
            opus(OUT / name)
            files.append(name.removesuffix(".wav"))
            levels.append(short_term_db(y))
            print(f"{name:14} {y.shape[1] / SR:5.2f} s   peak {20 * np.log10(np.max(np.abs(y))):5.1f} dBFS   short-term {levels[-1]:6.1f} dB")
        gain = min(1.0, 10 ** ((target - float(np.mean(levels))) / 20))
        manifest[kind] = {"files": files, "gain": round(gain, 3)}
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {sum(len(m['files']) for m in manifest.values())} files to {OUT} and the manifest to {MANIFEST}")


if __name__ == "__main__":
    main()
