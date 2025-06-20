import sys
import json
import os
import traceback
import wave
from vosk import Model, KaldiRecognizer

def main():
    try:
        print("🔍 Starting speech recognition...", file=sys.stderr)

        if len(sys.argv) < 3:
            print("Error: Provide <audio_path> <language_code>", file=sys.stderr)
            sys.exit(1)

        audio_path = sys.argv[1]
        lang_code = sys.argv[2]

        print(f"🎵 Audio file: {audio_path}", file=sys.stderr)
        print(f"🌐 Language code: {lang_code}", file=sys.stderr)

        if not os.path.exists(audio_path):
            print(f"Error: Audio file not found: {audio_path}", file=sys.stderr)
            sys.exit(1)

        # Language to model folder mapping
        models = {
            "en": "vosk-model-small-en-us-0.15",
            "hi": "vosk-model-small-hi-0.22",
            "ja": "vosk-model-small-ja-0.22",
            "es": "vosk-model-small-es-0.42",
            "fr": "vosk-model-small-fr-0.22",
        }

        model_folder = models.get(lang_code, models["en"])  # fallback to English
        model_path = os.path.join("models", model_folder)

        if not os.path.exists(model_path):
            print(f"❌ Model folder not found: {model_path}", file=sys.stderr)
            sys.exit(1)

        print("📦 Loading Vosk model...", file=sys.stderr)
        model = Model(model_path)
        print("✅ Model loaded", file=sys.stderr)

        wf = wave.open(audio_path, "rb")
        rate = wf.getframerate()

        if rate != 16000:
            print(f"⚠️ Sample rate = {rate}, expected 16000", file=sys.stderr)

        if wf.getnchannels() != 1:
            print(f"⚠️ Audio has {wf.getnchannels()} channels, expected mono", file=sys.stderr)

        rec = KaldiRecognizer(model, rate)

        results = []
        while True:
            data = wf.readframes(4000)
            if len(data) == 0:
                break
            if rec.AcceptWaveform(data):
                result = json.loads(rec.Result())
                if result.get("text", "").strip():
                    results.append(result["text"].strip())

        final = json.loads(rec.FinalResult())
        if final.get("text", "").strip():
            results.append(final["text"].strip())

        full_text = " ".join(results).strip()
        print(f"✅ Transcription: {full_text}", file=sys.stderr)
        print(full_text)

    except Exception as e:
        print(f"❌ Error in STT: {str(e)}", file=sys.stderr)
        print(traceback.format_exc(), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
