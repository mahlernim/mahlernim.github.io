import html
import json
import os
import re
import tempfile
from pathlib import Path

import yt_dlp
import requests
from youtube_transcript_api import YouTubeTranscriptApi

from scripts.content_model import load_json, save_json, source_hash, utc_now


PLAYLIST_ID = "PL0TnWnPQhDj2-TOwiz_ZhY2Sdurimss2Q"
VIDEO_URL = f"https://www.youtube.com/playlist?list={PLAYLIST_ID}"
ROOT = Path(__file__).resolve().parents[1]
CACHE_FILE = ROOT / "data" / "videos_cache.json"
GEMINI_VIDEO_MODEL = "gemini-3.7-flash"


def _clean_caption(text):
    lines = []
    for line in text.splitlines():
        line = line.strip()
        if not line or line == "WEBVTT" or "-->" in line or line.startswith(("Kind:", "Language:")):
            continue
        line = re.sub(r"<[^>]+>", "", line)
        line = html.unescape(line)
        line = re.sub(r"\s+", " ", line).strip()
        if line and (not lines or line != lines[-1]):
            lines.append(line)
    return " ".join(lines)


def fetch_caption_text(video_id):
    # This endpoint is lighter and less prone to rate limiting than media extraction.
    try:
        transcript = YouTubeTranscriptApi().fetch(video_id, languages=["ko", "en"])
        caption = " ".join(snippet.text.strip() for snippet in transcript if snippet.text.strip())
        if caption:
            return caption, {
                "caption_status": "available",
                "caption_language": transcript.language_code,
                "caption_generated": transcript.is_generated,
                "caption_checked_at": utc_now(),
                "source_hash": source_hash(caption),
            }
    except Exception:
        pass

    # Retain yt-dlp as a bounded fallback for environments where it can access tracks.
    with tempfile.TemporaryDirectory() as temp_dir:
        output = str(Path(temp_dir) / "caption")
        options = {
            "quiet": True,
            "skip_download": True,
            "writeautomaticsub": True,
            "writesubtitles": True,
            "subtitleslangs": ["ko", "en"],
            "subtitlesformat": "vtt",
            "outtmpl": output,
        }
        try:
            with yt_dlp.YoutubeDL(options) as ydl:
                ydl.download([f"https://www.youtube.com/watch?v={video_id}"])
            files = sorted(Path(temp_dir).glob("caption*.vtt"), key=lambda p: (".ko." not in p.name, p.name))
            if not files:
                return "", {"caption_status": "unavailable", "caption_checked_at": utc_now()}
            caption = _clean_caption(files[0].read_text(encoding="utf-8"))
            language = "ko" if ".ko." in files[0].name else "en"
            return caption, {
                "caption_status": "available",
                "caption_language": language,
                "caption_checked_at": utc_now(),
                "source_hash": source_hash(caption),
            }
        except Exception:
            return "", {"caption_status": "error", "caption_checked_at": utc_now()}


def fetch_gemini_video_evidence(video_id):
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return "", {
            "video_evidence_status": "unavailable",
            "video_evidence_provider": "gemini_youtube",
            "video_evidence_checked_at": utc_now(),
        }

    try:
        from google import genai

        client = genai.Client(api_key=api_key)
        interaction = client.interactions.create(
            model=GEMINI_VIDEO_MODEL,
            input=[
                {
                    "type": "text",
                    "text": (
                        "Extract detailed evidence notes from this public academic video. "
                        "Cover the main topic, methods or concepts discussed, concrete findings "
                        "or examples, stated limitations, and intended audience. Preserve uncertainty. "
                        "Do not add medical advice, promotional language, portfolio connections, or "
                        "facts not present in the audio, captions, slides, or visible content. "
                        "Return plain text evidence notes for a separate summarization model."
                    ),
                },
                {
                    "type": "video",
                    "uri": f"https://www.youtube.com/watch?v={video_id}",
                },
            ],
        )
        evidence = (interaction.output_text or "").strip()
        if evidence:
            return evidence, {
                "video_evidence_status": "available",
                "video_evidence_provider": "gemini_youtube",
                "video_evidence_model": GEMINI_VIDEO_MODEL,
                "video_evidence_checked_at": utc_now(),
                "source_hash": source_hash(evidence),
            }
    except Exception as exc:
        return "", {
            "video_evidence_status": "error",
            "video_evidence_provider": "gemini_youtube",
            "video_evidence_model": GEMINI_VIDEO_MODEL,
            "video_evidence_checked_at": utc_now(),
            "video_evidence_error_type": type(exc).__name__,
        }

    return "", {
        "video_evidence_status": "unavailable",
        "video_evidence_provider": "gemini_youtube",
        "video_evidence_model": GEMINI_VIDEO_MODEL,
        "video_evidence_checked_at": utc_now(),
    }


def fetch_videos():
    cache = load_json(CACHE_FILE, {})
    options = {"quiet": True, "extract_flat": True, "dump_single_json": True}
    try:
        with yt_dlp.YoutubeDL(options) as ydl:
            result = ydl.extract_info(VIDEO_URL, download=False)
        seen = set()
        for position, entry in enumerate(result.get("entries", []), start=1):
            video_id = entry.get("id")
            if not video_id or video_id in seen:
                continue
            seen.add(video_id)
            existing = cache.get(video_id, {})
            title = entry.get("title") or existing.get("title") or video_id
            if not existing.get("canonical_title_checked_at"):
                try:
                    response = requests.get(
                        "https://www.youtube.com/oembed",
                        params={"url": f"https://www.youtube.com/watch?v={video_id}", "format": "json"},
                        timeout=15,
                    )
                    response.raise_for_status()
                    response.encoding = "utf-8"
                    title = response.json().get("title") or title
                    existing["canonical_title_checked_at"] = utc_now()
                except Exception:
                    pass
            existing.update({
                "video_id": video_id,
                "title": title,
                "url": f"https://www.youtube.com/watch?v={video_id}",
                "thumbnail": f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg",
                "playlist_position": position,
                "metadata_checked_at": utc_now(),
            })
            cache[video_id] = existing
        save_json(CACHE_FILE, cache)
    except Exception as exc:
        print(f"YouTube discovery failed, preserving cache: {type(exc).__name__}")
    return sorted(cache.values(), key=lambda item: item.get("playlist_position", 999999))


if __name__ == "__main__":
    print(json.dumps(fetch_videos(), ensure_ascii=False, indent=2))
