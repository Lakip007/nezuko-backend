import sys
import json
import os
import traceback
import wave
from vosk import Model, KaldiRecognizer

def main():
    try:
        print("🔍 Starting speech recognition...", file=sys.stderr)

        if len(sys.argv) < 2:
            print("Error: No audio file path provided", file=sys.stderr)
            sys.exit(1)

        audio_path = sys.argv[1]
        print(f"🎵 Audio file: {audio_path}", file=sys.stderr)

        if not os.path.exists(audio_path):
            print(f"Error: Audio file not found: {audio_path}", file=sys.stderr)
            sys.exit(1)

        # Check file size
        file_size = os.path.getsize(audio_path)
        print(f"📁 File size: {file_size} bytes", file=sys.stderr)

        if file_size == 0:
            print("Error: Audio file is empty", file=sys.stderr)
            sys.exit(1)

        # Check if model exists
        model_path = "model"
        if not os.path.exists(model_path):
            print(f"Error: Model directory not found: {model_path}", file=sys.stderr)
            sys.exit(1)

        print("📦 Loading Vosk model...", file=sys.stderr)
        model = Model(model_path)
        print("✅ Model loaded successfully", file=sys.stderr)

        print("🎧 Opening audio file...", file=sys.stderr)
        wf = wave.open(audio_path, "rb")

        # Validate audio format
        rate = wf.getframerate()
        if rate != 16000:
            print(f"Warning: Sample rate is {rate}, expected 16000", file=sys.stderr)

        if wf.getnchannels() != 1:
            print(f"Warning: Audio has {wf.getnchannels()} channels, expected 1", file=sys.stderr)

        duration = wf.getnframes() / rate
        print(f"⏱️ Duration: {duration:.2f} seconds", file=sys.stderr)

        if duration < 0.1:
            print("Error: Audio too short for transcription", file=sys.stderr)
            wf.close()
            sys.exit(1)

        rec = KaldiRecognizer(model, rate)

        results = []
        print("🔄 Processing audio...", file=sys.stderr)

        while True:
            data = wf.readframes(4000)
            if len(data) == 0:
                break
            if rec.AcceptWaveform(data):
                result = json.loads(rec.Result())
                if result.get("text", "").strip():
                    results.append(result["text"].strip())
                    print(f"📝 Partial: {result['text']}", file=sys.stderr)

        final = json.loads(rec.FinalResult())
        if final.get("text", "").strip():
            results.append(final["text"].strip())
            print(f"📝 Final: {final['text']}", file=sys.stderr)

        full_text = " ".join(results).strip()
        print(f"✅ Complete transcription: '{full_text}'", file=sys.stderr)

        print(full_text)  # Send result to stdout for Node.js

    except Exception as e:
        print(f"Error in speech recognition: {str(e)}", file=sys.stderr)
        print(f"Traceback: {traceback.format_exc()}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()