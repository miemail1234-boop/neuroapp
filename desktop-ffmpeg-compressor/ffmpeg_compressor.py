#!/usr/bin/env python3
"""
Local FFmpeg Compressor

Small cross-platform desktop GUI for compressing large MOV/MP4 videos with a
local FFmpeg installation. It is intentionally dependency-free: Python standard
library + Tkinter only.
"""

from __future__ import annotations

import json
import os
import platform
import queue
import re
import shutil
import subprocess
import sys
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from tkinter import filedialog, messagebox
import tkinter as tk
from tkinter import ttk


APP_TITLE = "Local FFmpeg Compressor"
VIDEO_EXTENSIONS = {".mov", ".mp4", ".m4v", ".webm", ".mkv", ".avi"}


@dataclass(frozen=True)
class QualityProfile:
    label: str
    bitrate_kbps: int
    crf: int
    audio_kbps: int


QUALITY_PROFILES: dict[str, QualityProfile] = {
    "very_small": QualityProfile("Molto leggero", 900, 31, 96),
    "balanced": QualityProfile("Bilanciato", 1800, 28, 128),
    "good": QualityProfile("Qualità buona", 3000, 25, 160),
    "high": QualityProfile("Qualità alta", 5500, 22, 192),
}


ENCODER_LABELS = {
    "auto": "Automatico: hardware se disponibile",
    "libx264": "Software x264: compatibile, più lento",
    "h264_videotoolbox": "Apple VideoToolbox: veloce su Mac",
    "h264_nvenc": "NVIDIA NVENC: veloce su GPU NVIDIA",
    "h264_qsv": "Intel Quick Sync: veloce su Intel",
    "h264_amf": "AMD AMF: veloce su GPU AMD",
}


class FFmpegError(RuntimeError):
    pass


class CompressorApp:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title(APP_TITLE)
        self.root.geometry("920x720")
        self.root.minsize(820, 620)

        self.ffmpeg_path = shutil.which("ffmpeg") or ""
        self.ffprobe_path = shutil.which("ffprobe") or ""
        self.available_encoders: set[str] = set()
        self.current_process: subprocess.Popen[str] | None = None
        self.worker: threading.Thread | None = None
        self.events: queue.Queue[tuple[str, object]] = queue.Queue()
        self.cancel_requested = False

        self.input_path = tk.StringVar()
        self.output_dir = tk.StringVar(value=str(Path.home() / "Desktop"))
        self.output_name = tk.StringVar()
        self.quality_key = tk.StringVar(value="balanced")
        self.resolution = tk.StringVar(value="540")
        self.encoder = tk.StringVar(value="auto")
        self.keep_audio = tk.BooleanVar(value=False)
        self.open_folder_after = tk.BooleanVar(value=True)
        self.status = tk.StringVar(value="Pronto")
        self.command_preview = tk.StringVar(value="")

        self._build_ui()
        self._initial_check()
        self._poll_events()

    # ---------- UI ----------

    def _build_ui(self) -> None:
        style = ttk.Style()
        try:
            style.theme_use("clam")
        except tk.TclError:
            pass

        outer = ttk.Frame(self.root, padding=18)
        outer.pack(fill=tk.BOTH, expand=True)

        title = ttk.Label(outer, text=APP_TITLE, font=("TkDefaultFont", 20, "bold"))
        title.pack(anchor="w")

        subtitle = ttk.Label(
            outer,
            text="Comprimi file MOV/MP4 grandi usando FFmpeg locale e, quando disponibile, accelerazione hardware.",
            foreground="#4b5563",
        )
        subtitle.pack(anchor="w", pady=(4, 16))

        self.ffmpeg_status = ttk.Label(outer, text="Controllo FFmpeg...", foreground="#4b5563")
        self.ffmpeg_status.pack(anchor="w", pady=(0, 12))

        file_card = ttk.LabelFrame(outer, text="1. File", padding=12)
        file_card.pack(fill=tk.X, pady=(0, 12))

        file_row = ttk.Frame(file_card)
        file_row.pack(fill=tk.X)
        ttk.Entry(file_row, textvariable=self.input_path).pack(side=tk.LEFT, fill=tk.X, expand=True)
        ttk.Button(file_row, text="Scegli video", command=self.choose_input).pack(side=tk.LEFT, padx=(8, 0))

        out_row = ttk.Frame(file_card)
        out_row.pack(fill=tk.X, pady=(8, 0))
        ttk.Entry(out_row, textvariable=self.output_dir).pack(side=tk.LEFT, fill=tk.X, expand=True)
        ttk.Button(out_row, text="Cartella output", command=self.choose_output_dir).pack(side=tk.LEFT, padx=(8, 0))

        name_row = ttk.Frame(file_card)
        name_row.pack(fill=tk.X, pady=(8, 0))
        ttk.Label(name_row, text="Nome output:").pack(side=tk.LEFT)
        ttk.Entry(name_row, textvariable=self.output_name).pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(8, 0))

        settings = ttk.LabelFrame(outer, text="2. Compressione", padding=12)
        settings.pack(fill=tk.X, pady=(0, 12))

        grid = ttk.Frame(settings)
        grid.pack(fill=tk.X)
        grid.columnconfigure(1, weight=1)
        grid.columnconfigure(3, weight=1)

        ttk.Label(grid, text="Preset qualità").grid(row=0, column=0, sticky="w", padx=(0, 8), pady=4)
        quality_box = ttk.Combobox(
            grid,
            textvariable=self.quality_key,
            state="readonly",
            values=list(QUALITY_PROFILES.keys()),
        )
        quality_box.grid(row=0, column=1, sticky="ew", pady=4)
        quality_box.bind("<<ComboboxSelected>>", lambda _: self.update_command_preview())

        ttk.Label(grid, text="Risoluzione max").grid(row=0, column=2, sticky="w", padx=(16, 8), pady=4)
        resolution_box = ttk.Combobox(
            grid,
            textvariable=self.resolution,
            state="readonly",
            values=["540", "720", "1080", "original"],
        )
        resolution_box.grid(row=0, column=3, sticky="ew", pady=4)
        resolution_box.bind("<<ComboboxSelected>>", lambda _: self.update_command_preview())

        ttk.Label(grid, text="Encoder").grid(row=1, column=0, sticky="w", padx=(0, 8), pady=4)
        self.encoder_box = ttk.Combobox(
            grid,
            textvariable=self.encoder,
            state="readonly",
            values=["auto", "libx264"],
        )
        self.encoder_box.grid(row=1, column=1, columnspan=3, sticky="ew", pady=4)
        self.encoder_box.bind("<<ComboboxSelected>>", lambda _: self.update_command_preview())

        options_row = ttk.Frame(settings)
        options_row.pack(fill=tk.X, pady=(8, 0))
        ttk.Checkbutton(options_row, text="Copia audio originale se possibile", variable=self.keep_audio, command=self.update_command_preview).pack(side=tk.LEFT)
        ttk.Checkbutton(options_row, text="Apri cartella output a fine compressione", variable=self.open_folder_after).pack(side=tk.LEFT, padx=(24, 0))

        help_text = ttk.Label(
            settings,
            text=(
                "Preset: Molto leggero=~900 kbps, Bilanciato=~1800 kbps, Qualità buona=~3000 kbps, "
                "Qualità alta=~5500 kbps. Con encoder software viene usato CRF; con encoder hardware viene usato bitrate."
            ),
            foreground="#4b5563",
            wraplength=860,
        )
        help_text.pack(anchor="w", pady=(8, 0))

        command_card = ttk.LabelFrame(outer, text="3. Comando FFmpeg", padding=12)
        command_card.pack(fill=tk.X, pady=(0, 12))
        ttk.Label(command_card, textvariable=self.command_preview, foreground="#374151", wraplength=860).pack(anchor="w")

        progress_card = ttk.LabelFrame(outer, text="4. Avanzamento", padding=12)
        progress_card.pack(fill=tk.BOTH, expand=True)

        status_row = ttk.Frame(progress_card)
        status_row.pack(fill=tk.X)
        ttk.Label(status_row, textvariable=self.status, font=("TkDefaultFont", 11, "bold")).pack(side=tk.LEFT)
        self.progress_label = ttk.Label(status_row, text="0%")
        self.progress_label.pack(side=tk.RIGHT)

        self.progress = ttk.Progressbar(progress_card, mode="determinate", maximum=100)
        self.progress.pack(fill=tk.X, pady=(8, 10))

        self.log_text = tk.Text(progress_card, height=12, wrap="word", bg="#111827", fg="#e5e7eb", insertbackground="#e5e7eb")
        self.log_text.pack(fill=tk.BOTH, expand=True)

        actions = ttk.Frame(outer)
        actions.pack(fill=tk.X, pady=(12, 0))
        self.start_button = ttk.Button(actions, text="Comprimi", command=self.start_compression)
        self.start_button.pack(side=tk.LEFT)
        self.cancel_button = ttk.Button(actions, text="Annulla", command=self.cancel_compression, state=tk.DISABLED)
        self.cancel_button.pack(side=tk.LEFT, padx=(8, 0))
        ttk.Button(actions, text="Verifica FFmpeg", command=self._initial_check).pack(side=tk.RIGHT)

        for var in (self.input_path, self.output_dir, self.output_name):
            var.trace_add("write", lambda *_: self.update_command_preview())

    # ---------- Checks and command building ----------

    def _initial_check(self) -> None:
        self.ffmpeg_path = shutil.which("ffmpeg") or ""
        self.ffprobe_path = shutil.which("ffprobe") or ""

        if not self.ffmpeg_path:
            self.ffmpeg_status.config(
                text="FFmpeg non trovato. Installa FFmpeg e assicurati che sia nel PATH.",
                foreground="#be123c",
            )
            self.start_button.config(state=tk.DISABLED)
            return

        self.available_encoders = self.detect_encoders()
        encoder_values = ["auto", "libx264"]
        for candidate in ("h264_videotoolbox", "h264_nvenc", "h264_qsv", "h264_amf"):
            if candidate in self.available_encoders:
                encoder_values.append(candidate)
        self.encoder_box.config(values=encoder_values)

        version = self.get_ffmpeg_version()
        self.ffmpeg_status.config(
            text=f"FFmpeg trovato: {self.ffmpeg_path} · {version}",
            foreground="#047857",
        )
        self.start_button.config(state=tk.NORMAL)
        self.update_command_preview()

    def get_ffmpeg_version(self) -> str:
        try:
            result = subprocess.run(
                [self.ffmpeg_path, "-version"],
                capture_output=True,
                text=True,
                check=False,
                timeout=5,
            )
            first = result.stdout.splitlines()[0]
            return first.replace("ffmpeg version", "").strip()
        except Exception:
            return "versione non disponibile"

    def detect_encoders(self) -> set[str]:
        try:
            result = subprocess.run(
                [self.ffmpeg_path, "-hide_banner", "-encoders"],
                capture_output=True,
                text=True,
                check=False,
                timeout=10,
            )
            text = result.stdout + result.stderr
            return {name for name in ENCODER_LABELS if re.search(rf"\b{name}\b", text)}
        except Exception:
            return set()

    def choose_input(self) -> None:
        path = filedialog.askopenfilename(
            title="Scegli video",
            filetypes=[
                ("Video", "*.mov *.mp4 *.m4v *.webm *.mkv *.avi"),
                ("Tutti i file", "*.*"),
            ],
        )
        if not path:
            return
        self.input_path.set(path)
        in_path = Path(path)
        self.output_dir.set(str(in_path.parent))
        self.output_name.set(f"{in_path.stem}-compressed.mp4")
        self.log(f"File selezionato: {in_path.name} ({self.format_file_size(in_path)})")

    def choose_output_dir(self) -> None:
        path = filedialog.askdirectory(title="Scegli cartella output")
        if path:
            self.output_dir.set(path)

    def selected_profile(self) -> QualityProfile:
        return QUALITY_PROFILES.get(self.quality_key.get(), QUALITY_PROFILES["balanced"])

    def resolve_encoder(self) -> str:
        requested = self.encoder.get()
        if requested != "auto":
            return requested

        system = platform.system().lower()
        if system == "darwin" and "h264_videotoolbox" in self.available_encoders:
            return "h264_videotoolbox"
        for candidate in ("h264_nvenc", "h264_qsv", "h264_amf", "h264_videotoolbox"):
            if candidate in self.available_encoders:
                return candidate
        return "libx264"

    def build_command(self) -> list[str]:
        input_file = Path(self.input_path.get()).expanduser()
        output_dir = Path(self.output_dir.get()).expanduser()
        output_name = self.output_name.get().strip() or f"{input_file.stem}-compressed.mp4"
        output_file = output_dir / output_name
        profile = self.selected_profile()
        encoder = self.resolve_encoder()

        cmd = [self.ffmpeg_path, "-hide_banner", "-y", "-i", str(input_file)]

        filters = []
        if self.resolution.get() != "original":
            filters.append(f"scale=-2:{self.resolution.get()}:force_original_aspect_ratio=decrease")
        if filters:
            cmd += ["-vf", ",".join(filters)]

        cmd += ["-map", "0:v:0", "-map", "0:a?"]

        if encoder == "libx264":
            cmd += ["-c:v", "libx264", "-preset", "veryfast", "-crf", str(profile.crf)]
        elif encoder == "h264_videotoolbox":
            cmd += ["-c:v", "h264_videotoolbox", "-b:v", f"{profile.bitrate_kbps}k", "-tag:v", "avc1"]
        elif encoder == "h264_nvenc":
            cmd += ["-c:v", "h264_nvenc", "-preset", "p4", "-b:v", f"{profile.bitrate_kbps}k"]
        elif encoder == "h264_qsv":
            cmd += ["-c:v", "h264_qsv", "-b:v", f"{profile.bitrate_kbps}k"]
        elif encoder == "h264_amf":
            cmd += ["-c:v", "h264_amf", "-quality", "speed", "-b:v", f"{profile.bitrate_kbps}k"]
        else:
            cmd += ["-c:v", "libx264", "-preset", "veryfast", "-crf", str(profile.crf)]

        if self.keep_audio.get():
            cmd += ["-c:a", "copy"]
        else:
            cmd += ["-c:a", "aac", "-b:a", f"{profile.audio_kbps}k"]

        cmd += ["-pix_fmt", "yuv420p", "-movflags", "+faststart"]
        cmd += ["-progress", "pipe:1", "-nostats", str(output_file)]
        return cmd

    def update_command_preview(self) -> None:
        try:
            cmd = self.build_command()
            display_cmd = " ".join(self.quote_arg(part) for part in cmd)
            self.command_preview.set(display_cmd)
        except Exception:
            self.command_preview.set("Seleziona un file per generare il comando.")

    @staticmethod
    def quote_arg(value: str) -> str:
        if not value:
            return "''"
        if re.search(r"\s", value):
            return f'"{value}"'
        return value

    @staticmethod
    def format_file_size(path: Path) -> str:
        try:
            size = path.stat().st_size
        except OSError:
            return "dimensione non disponibile"
        units = ["B", "KB", "MB", "GB"]
        value = float(size)
        unit = 0
        while value >= 1024 and unit < len(units) - 1:
            value /= 1024
            unit += 1
        return f"{value:.1f} {units[unit]}"

    # ---------- Compression ----------

    def validate_before_start(self) -> tuple[Path, Path]:
        if not self.ffmpeg_path:
            raise FFmpegError("FFmpeg non trovato nel PATH.")

        input_file = Path(self.input_path.get()).expanduser()
        if not input_file.exists():
            raise FFmpegError("Seleziona un file video esistente.")
        if input_file.suffix.lower() not in VIDEO_EXTENSIONS:
            raise FFmpegError("Formato non riconosciuto. Usa MOV, MP4, M4V, WEBM, MKV o AVI.")

        output_dir = Path(self.output_dir.get()).expanduser()
        output_dir.mkdir(parents=True, exist_ok=True)
        output_name = self.output_name.get().strip() or f"{input_file.stem}-compressed.mp4"
        if not output_name.lower().endswith(".mp4"):
            output_name += ".mp4"
            self.output_name.set(output_name)
        output_file = output_dir / output_name

        if output_file.resolve() == input_file.resolve():
            raise FFmpegError("Il file output non può sovrascrivere l'originale.")

        return input_file, output_file

    def start_compression(self) -> None:
        if self.worker and self.worker.is_alive():
            return

        try:
            input_file, output_file = self.validate_before_start()
        except FFmpegError as exc:
            messagebox.showerror(APP_TITLE, str(exc))
            return

        self.cancel_requested = False
        self.progress.config(value=0)
        self.progress_label.config(text="0%")
        self.log_text.delete("1.0", tk.END)
        self.status.set("Compressione in corso...")
        self.start_button.config(state=tk.DISABLED)
        self.cancel_button.config(state=tk.NORMAL)

        cmd = self.build_command()
        self.log(f"Input: {input_file}")
        self.log(f"Output: {output_file}")
        self.log(f"Encoder: {ENCODER_LABELS.get(self.resolve_encoder(), self.resolve_encoder())}")
        self.log("Comando:")
        self.log(" ".join(self.quote_arg(part) for part in cmd))
        self.log("")

        self.worker = threading.Thread(target=self._run_ffmpeg_worker, args=(cmd, output_file), daemon=True)
        self.worker.start()

    def _run_ffmpeg_worker(self, cmd: list[str], output_file: Path) -> None:
        duration = self.get_duration_seconds(Path(self.input_path.get()))
        if duration:
            self.events.put(("log", f"Durata rilevata: {duration:.1f} s"))

        try:
            self.current_process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                universal_newlines=True,
            )
        except OSError as exc:
            self.events.put(("error", f"Impossibile avviare FFmpeg: {exc}"))
            return

        assert self.current_process.stdout is not None
        for line in self.current_process.stdout:
            line = line.strip()
            if not line:
                continue
            self.handle_ffmpeg_progress_line(line, duration)

        return_code = self.current_process.wait()
        self.current_process = None

        if self.cancel_requested:
            self.events.put(("cancelled", None))
        elif return_code == 0:
            self.events.put(("done", output_file))
        else:
            self.events.put(("error", f"FFmpeg terminato con codice {return_code}."))

    def get_duration_seconds(self, input_file: Path) -> float | None:
        if not self.ffprobe_path:
            return None
        try:
            result = subprocess.run(
                [
                    self.ffprobe_path,
                    "-v",
                    "error",
                    "-show_entries",
                    "format=duration",
                    "-of",
                    "json",
                    str(input_file),
                ],
                capture_output=True,
                text=True,
                check=False,
                timeout=20,
            )
            data = json.loads(result.stdout or "{}")
            value = data.get("format", {}).get("duration")
            return float(value) if value else None
        except Exception:
            return None

    def handle_ffmpeg_progress_line(self, line: str, duration: float | None) -> None:
        if line.startswith("out_time_ms=") and duration:
            try:
                out_time_ms = int(line.split("=", 1)[1])
                progress = max(0.0, min(100.0, (out_time_ms / 1_000_000) / duration * 100))
                self.events.put(("progress", progress))
            except ValueError:
                pass
        elif line.startswith("progress=end"):
            self.events.put(("progress", 100.0))
        elif not line.startswith(("frame=", "fps=", "stream_", "total_size=", "out_time=", "dup_frames=", "drop_frames=", "speed=", "bitrate=")):
            self.events.put(("log", line))

    def cancel_compression(self) -> None:
        self.cancel_requested = True
        proc = self.current_process
        if proc and proc.poll() is None:
            self.status.set("Annullamento...")
            proc.terminate()
            self.root.after(2500, self._kill_if_needed, proc)

    def _kill_if_needed(self, proc: subprocess.Popen[str]) -> None:
        if proc.poll() is None:
            proc.kill()

    def _poll_events(self) -> None:
        try:
            while True:
                event, payload = self.events.get_nowait()
                if event == "log":
                    self.log(str(payload))
                elif event == "progress":
                    value = float(payload)
                    self.progress.config(value=value)
                    self.progress_label.config(text=f"{value:.0f}%")
                elif event == "done":
                    output_file = Path(str(payload))
                    self.progress.config(value=100)
                    self.progress_label.config(text="100%")
                    self.status.set("Completato")
                    self.log(f"Completato: {output_file}")
                    self.log(f"Dimensione output: {self.format_file_size(output_file)}")
                    self.start_button.config(state=tk.NORMAL)
                    self.cancel_button.config(state=tk.DISABLED)
                    if self.open_folder_after.get():
                        self.open_in_file_manager(output_file)
                elif event == "cancelled":
                    self.status.set("Annullato")
                    self.log("Compressione annullata.")
                    self.start_button.config(state=tk.NORMAL)
                    self.cancel_button.config(state=tk.DISABLED)
                elif event == "error":
                    self.status.set("Errore")
                    self.log(str(payload))
                    self.start_button.config(state=tk.NORMAL)
                    self.cancel_button.config(state=tk.DISABLED)
        except queue.Empty:
            pass
        self.root.after(150, self._poll_events)

    def log(self, message: str) -> None:
        timestamp = time.strftime("%H:%M:%S")
        self.log_text.insert(tk.END, f"[{timestamp}] {message}\n")
        self.log_text.see(tk.END)

    @staticmethod
    def open_in_file_manager(path: Path) -> None:
        try:
            if platform.system() == "Darwin":
                subprocess.run(["open", "-R", str(path)], check=False)
            elif platform.system() == "Windows":
                subprocess.run(["explorer", "/select,", str(path)], check=False)
            else:
                subprocess.run(["xdg-open", str(path.parent)], check=False)
        except Exception:
            pass


def main() -> None:
    root = tk.Tk()
    app = CompressorApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
