import argparse
import json
import os
from pathlib import Path

from openai import OpenAI

from scripts.content_model import (
    MODEL_ID,
    PROMPT_VERSION,
    SUMMARY_JSON_SCHEMA,
    THEMES,
    load_json,
    save_json,
    utc_now,
    validate_summary,
)
from scripts.fetch_youtube import fetch_caption_text, fetch_gemini_video_evidence


ROOT = Path(__file__).resolve().parents[1]
PUBLICATIONS = ROOT / "data" / "publications_cache.json"
VIDEOS = ROOT / "data" / "videos_cache.json"
CONTENT = ROOT / "_pipeline" / "generated_content.json"
ACCEPTANCE = ROOT / "data" / "acceptance_samples.json"
ACCEPTANCE_VIDEOS = [
    "5j2estMEg-U", "8wHq_Eg5Fwg", "Qp4U6XlBOLs",
    "yHLm7XH5lw8", "fEHrTSWJ5a0", "FX65lQr7Ghc",
]
ACCEPTANCE_PAPERS = [
    "41035206", "40840934", "39204140",
    "37977236", "36836422", "37128877",
]


SYSTEM_PROMPT = """You are an expert medical librarian and bilingual academic editor.
Summarize only the supplied primary-source text. Korean comes first and English is a
faithful adaptation of the same evidence. Write precise, accessible prose for clinicians,
researchers, and advanced students. Do not add promotional language, clinical advice,
unsupported numbers, invented methods or results, or claims about an author's individual
contribution. The research_context field must be a neutral thematic connection to Sangzin
Ahn's portfolio, never a contributor-role claim. Mention source limitations explicitly.
Choose exactly one allowed theme. Use only standard Korean and English characters. Do not
emit stray characters from unrelated writing systems."""


def build_user_prompt(kind, item, source_text):
    theme_lines = "\n".join(
        f"- {key}: {value['ko']} / {value['en']}" for key, value in THEMES.items()
    )
    return f"""Content type: {kind}
Title: {item.get('title', '')}
Authors: {item.get('authors', '')}
Journal or channel: {item.get('journal', 'Sangzin Ahn YouTube')}
Allowed themes:\n{theme_lines}

Primary source text:\n{source_text}
"""


def generate(client, kind, item, source_text, effort):
    last_error = None
    for _attempt in range(2):
        completion = client.chat.completions.create(
            model=MODEL_ID,
            reasoning_effort=effort,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": build_user_prompt(kind, item, source_text)},
            ],
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": "academic_content_summary",
                    "strict": True,
                    "schema": SUMMARY_JSON_SCHEMA,
                }
            },
        )
        try:
            return validate_summary(json.loads(completion.choices[0].message.content))
        except (json.JSONDecodeError, ValueError) as exc:
            last_error = exc
    raise last_error


def needs_generation(existing, item):
    return (
        not existing
        or existing.get("status") != "ready"
        or existing.get("source_hash") != item.get("source_hash")
    )


def run(mode, effort):
    if not os.getenv("OPENAI_API_KEY"):
        raise SystemExit("OPENAI_API_KEY is required")
    client = OpenAI()
    publications = load_json(PUBLICATIONS, {})
    videos = load_json(VIDEOS, {})
    content = load_json(CONTENT, {"schema_version": 1, "items": {}})
    output = content["items"]
    acceptance_output = {"prompt_version": PROMPT_VERSION, "model": MODEL_ID, "items": {}}

    candidates = []
    for video_id, item in videos.items():
        if mode == "acceptance" and video_id not in ACCEPTANCE_VIDEOS:
            continue
        if mode == "daily" and not needs_generation(output.get(f"video:{video_id}"), item):
            continue
        candidates.append(("video", video_id, item))
    for pmid, item in publications.items():
        if int(item.get("year", 0)) < 2023:
            continue
        if mode == "acceptance" and pmid not in ACCEPTANCE_PAPERS:
            continue
        if mode == "daily" and not needs_generation(output.get(f"publication:{pmid}"), item):
            continue
        candidates.append(("publication", pmid, item))

    for kind, stable_id, item in candidates:
        key = f"{kind}:{stable_id}"
        previous = output.get(key)
        source_text = item.get("abstract", "")
        if kind == "video":
            source_text, caption_meta = fetch_caption_text(stable_id)
            item.update(caption_meta)
            if not source_text:
                source_text, evidence_meta = fetch_gemini_video_evidence(stable_id)
                item.update(evidence_meta)
        if not source_text or len(source_text.split()) < 40:
            record = {
                "status": "pending_source",
                "source_hash": item.get("source_hash", ""),
                "prompt_version": PROMPT_VERSION,
            }
        else:
            try:
                summary = generate(client, kind, item, source_text, effort)
                record = {
                    "status": "ready",
                    "source_hash": item.get("source_hash", ""),
                    "prompt_version": PROMPT_VERSION,
                    "model": MODEL_ID,
                    "reasoning_effort": effort,
                    "generated_at": utc_now(),
                    "summary": summary,
                }
            except Exception as exc:
                record = {
                    "status": "generation_failed",
                    "source_hash": item.get("source_hash", ""),
                    "prompt_version": PROMPT_VERSION,
                    "error_type": type(exc).__name__,
                }
        if mode == "acceptance":
            acceptance_output["items"][key] = record
        else:
            # A transient caption or API failure must never replace valid public copy.
            if record["status"] == "ready" or not previous or previous.get("status") != "ready":
                output[key] = record

    if mode == "acceptance":
        save_json(ACCEPTANCE, acceptance_output)
    else:
        save_json(VIDEOS, videos)
        save_json(CONTENT, content)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["acceptance", "daily", "backfill"], default="daily")
    parser.add_argument("--effort", choices=["low", "medium"], default="medium")
    args = parser.parse_args()
    run(args.mode, args.effort)
