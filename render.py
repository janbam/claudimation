#!/usr/bin/env python3
"""Offline renderer for COMMA: deterministic frames + offline audio → ffmpeg → a proper video file.

    python3 render.py                                  # 2560x1440 60 fps, 1.5x supersampled, h264 crf 16 + AAC 320k → comma.mp4
                                                       # (1440p: YouTube serves it with VP9/AV1 at higher bitrate, even to 1080p viewers)
    python3 render.py -W 3840 -H 2160 --fps 60 --ss 1 --speed 0.9 -o comma-4k.mp4
    python3 render.py --codec prores -o comma.mov      # ProRes 422 HQ, 10-bit, for editing
    python3 render.py --browser                        # don't launch headless Chrome; open the URL yourself

The page (index.html?render&...) renders the audio with an OfflineAudioContext, then draws every frame at
exactly t = i/fps and POSTs raw RGBA here. Nothing depends on the machine being fast: slow = just slower.
"""
import argparse, time, http.server, json, os, shutil, subprocess, sys, tempfile, threading, urllib.parse, webbrowser

ROOT = os.path.dirname(os.path.abspath(__file__))
ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument('-W', '--width', type=int, default=2560)
ap.add_argument('-H', '--height', type=int, default=1440)
ap.add_argument('--fps', type=float, default=60)
ap.add_argument('--speed', type=float, default=1.0, help='tempo factor (pitches never change)')
ap.add_argument('--ss', type=float, default=1.5, help='supersampling factor for the canvas (1.5 = draw at 1.5x, downscale)')
ap.add_argument('--pre', type=float, default=3.6, help='seconds of title before the first sound')
ap.add_argument('--codec', choices=['h264', 'h265', 'prores'], default='h264')
ap.add_argument('--crf', type=int, default=16, help='h264/h265 quality (lower = better; 16 = clean upload master, 12 = near-transparent)')
ap.add_argument('--port', type=int, default=8777)
ap.add_argument('--browser', action='store_true', help='open in your normal browser instead of headless Chrome')
ap.add_argument('--chrome', default=None, help='path to chrome/chromium (default: autodetect)')
ap.add_argument('-o', '--out', default=None)
A = ap.parse_args()
if not A.out: A.out = 'comma.mov' if A.codec == 'prores' else 'comma.mp4'
if not shutil.which('ffmpeg'): sys.exit('ffmpeg not found')

tmp = tempfile.mkdtemp(prefix='comma-render-')
state = {'ff': None, 'frames': 0, 'meta': None, 'chrome': None, 't0': time.time()}
done = threading.Event()


def video_args():
    if A.codec == 'prores':
        return ['-c:v', 'prores_ks', '-profile:v', '3', '-pix_fmt', 'yuv422p10le', '-vendor', 'apl0']
    if A.codec == 'h265':
        return ['-c:v', 'libx265', '-preset', 'slow', '-crf', str(A.crf), '-pix_fmt', 'yuv420p10le', '-tag:v', 'hvc1']
    # dark gradients band easily: slow preset, low crf, film tune, full-quality chroma planes where possible
    # aq-mode 3 spends bits on dark flat areas, where 8-bit gradients band first
    return ['-c:v', 'libx264', '-preset', 'slow', '-crf', str(A.crf), '-x264-params', 'aq-mode=3', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-g', str(int(A.fps * 2))]


class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def log_message(self, *a): pass
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store'); super().end_headers()

    def body(self):
        n = int(self.headers.get('Content-Length', 0)); buf = bytearray(n); mv = memoryview(buf); got = 0
        while got < n:
            r = self.rfile.readinto(mv[got:]);
            if not r: break
            got += r
        return bytes(buf)

    def reply(self, code=200, txt='ok'):
        b = txt.encode(); self.send_response(code); self.send_header('Content-Type', 'text/plain'); self.send_header('Content-Length', str(len(b))); self.end_headers(); self.wfile.write(b)

    def do_POST(self):
        p = self.path
        try:
            if p == '/render/audio':
                open(os.path.join(tmp, 'audio.wav'), 'wb').write(self.body()); print('  audio received'); return self.reply()
            if p == '/render/start':
                m = json.loads(self.body()); state['meta'] = m
                vid = os.path.join(tmp, 'video.mkv')
                cmd = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', f"{m['w']}x{m['h']}", '-r', str(m['fps']), '-i', '-',
                       *video_args(), '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', vid]
                state['ff'] = subprocess.Popen(cmd, stdin=subprocess.PIPE); state['ts'] = time.time()
                print(f"  encoding {m['frames']} frames at {m['w']}x{m['h']} {m['fps']} fps (speed {m['speed']})"); return self.reply()
            if p == '/render/frame':
                state['ff'].stdin.write(self.body()); state['frames'] += 1
                n = state['frames']; N = state['meta']['frames']
                if n % 60 == 0 or n == N: print(f'\r  frame {n}/{N}', end='', flush=True)
                return self.reply()
            if p == '/render/done':
                self.body(); print()
                ff = state['ff']; ff.stdin.close(); ff.wait()
                out = os.path.abspath(A.out)
                acodec = ['-c:a', 'pcm_s24le'] if A.codec == 'prores' else ['-c:a', 'aac', '-b:a', '320k']
                subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', os.path.join(tmp, 'video.mkv'), '-i', os.path.join(tmp, 'audio.wav'),
                                '-map', '0:v', '-map', '1:a', '-c:v', 'copy', *acodec, '-movflags', '+faststart', out], check=True)
                print(f'  → {out}  ({time.time() - state["t0"]:.0f} s total, {state["frames"] / max(1e-3, time.time() - state["ts"]):.1f} frames/s)'); self.reply(200, out); done.set(); return
        except Exception as e:
            print('error:', e); return self.reply(500, str(e))
        self.reply(404, 'no')


srv = http.server.ThreadingHTTPServer(('127.0.0.1', A.port), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()
q = urllib.parse.urlencode({'w': A.width, 'h': A.height, 'fps': A.fps, 'speed': A.speed, 'ss': A.ss, 'pre': A.pre})
url = f'http://127.0.0.1:{A.port}/index.html?render&{q}'
print(f'COMMA render → {A.out}\n  {url}')

if A.browser:
    webbrowser.open(url)
else:
    chrome = A.chrome or next((shutil.which(c) for c in ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'] if shutil.which(c)), None)
    if not chrome: print('  no chrome found: open the URL above yourself'); webbrowser.open(url)
    else:
        prof = os.path.join(tmp, 'profile')
        # the canvas must never be throttled: headless, GPU on, no background timer throttling
        state['chrome'] = subprocess.Popen([chrome, '--headless=new', f'--user-data-dir={prof}', '--no-first-run', '--autoplay-policy=no-user-gesture-required',
                                            '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--ignore-gpu-blocklist',
                                            f'--window-size={min(A.width, 1920)},{min(A.height, 1080)}', url], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    done.wait()
finally:
    if state['chrome']: state['chrome'].terminate()
    shutil.rmtree(tmp, ignore_errors=True)
    srv.shutdown()
