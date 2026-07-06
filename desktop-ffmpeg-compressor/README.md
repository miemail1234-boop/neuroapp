# Local FFmpeg Compressor

Piccola app desktop per comprimere video grandi usando FFmpeg installato localmente.

È pensata per casi in cui la web app browser non è adatta, per esempio file MOV/MP4 molto pesanti come video da 1–3 GB.

## Caratteristiche

- Interfaccia desktop Python/Tkinter.
- Nessuna dipendenza Python esterna.
- Usa `ffmpeg` e `ffprobe` locali.
- Preset qualità: molto leggero, bilanciato, qualità buona, qualità alta.
- Ridimensionamento a 540p, 720p, 1080p o originale.
- Rilevamento encoder hardware disponibili:
  - Apple VideoToolbox su macOS;
  - NVIDIA NVENC;
  - Intel Quick Sync;
  - AMD AMF;
  - fallback software `libx264`.
- Progresso reale tramite `ffmpeg -progress pipe:1`.
- Pulsante Annulla.
- Comando FFmpeg visibile e copiabile dal log.

## Requisiti

- Python 3.10 o superiore.
- FFmpeg installato e disponibile nel `PATH`.

### macOS

Con Homebrew:

```bash
brew install ffmpeg
```

Avvio app:

```bash
python3 ffmpeg_compressor.py
```

### Windows

Installa FFmpeg e aggiungi la cartella `bin` al `PATH`.

Poi avvia:

```powershell
python ffmpeg_compressor.py
```

### Linux

Debian/Ubuntu:

```bash
sudo apt update
sudo apt install ffmpeg python3-tk
python3 ffmpeg_compressor.py
```

## Suggerimento per il tuo caso

Per un video da circa 3 GB, parti da:

- qualità: `Molto leggero` oppure `Bilanciato`;
- risoluzione: `540p`;
- encoder: `Automatico`;
- audio: non copiare audio originale, quindi lascia conversione AAC.

Se il risultato è troppo degradato, passa a `720p` o `Qualità buona`.

## Comandi FFmpeg equivalenti

Software universale:

```bash
ffmpeg -i "input.MOV" -vf "scale=-2:540:force_original_aspect_ratio=decrease" -map 0:v:0 -map 0:a? -c:v libx264 -preset veryfast -crf 28 -c:a aac -b:a 128k -pix_fmt yuv420p -movflags +faststart "output.mp4"
```

macOS con hardware Apple:

```bash
ffmpeg -i "input.MOV" -vf "scale=-2:540:force_original_aspect_ratio=decrease" -map 0:v:0 -map 0:a? -c:v h264_videotoolbox -b:v 1800k -tag:v avc1 -c:a aac -b:a 128k -pix_fmt yuv420p -movflags +faststart "output.mp4"
```

Windows con NVIDIA:

```bash
ffmpeg -i "input.MOV" -vf "scale=-2:540:force_original_aspect_ratio=decrease" -map 0:v:0 -map 0:a? -c:v h264_nvenc -preset p4 -b:v 1800k -c:a aac -b:a 128k -pix_fmt yuv420p -movflags +faststart "output.mp4"
```

## Limiti

Questa app non include FFmpeg al suo interno. Usa l'installazione locale già presente nel sistema.

Per creare un `.app` macOS o un `.exe` Windows si può usare PyInstaller, ma quello è uno step di packaging separato.
