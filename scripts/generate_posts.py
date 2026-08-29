import json
import os
from pathlib import Path

from openai import OpenAI

from scripts.content_model import load_json, save_json, utc_now
from scripts.fetch_wordpress import CACHE, fetch_posts


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "_pipeline" / "posts.json"
MODEL_ID = "gpt-5.6-terra"
PROMPT_VERSION = "english-post-v1"

SECTION_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["heading", "paragraphs", "bullets"],
    "properties": {
        "heading": {"type": "string"},
        "paragraphs": {"type": "array", "items": {"type": "string"}, "maxItems": 8},
        "bullets": {"type": "array", "items": {"type": "string"}, "maxItems": 8},
    },
}
POST_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["title", "standfirst", "sections"],
    "properties": {
        "title": {"type": "string"},
        "standfirst": {"type": "string"},
        "sections": {"type": "array", "items": SECTION_SCHEMA, "minItems": 1, "maxItems": 12},
    },
}

SYSTEM_PROMPT = """You are an exacting English editor. Reorganize the supplied Korean or mixed-language blog post into a self-contained English article. Preserve the author's factual meaning, uncertainty, examples, technical details, and personal perspective. Do not add facts, recommendations, citations, claims, or promotional language. Do not mention AI, translation, adaptation, the model, or this instruction. Use a concise title and standfirst. Use headings only when helpful. Return plain text fields without HTML or Markdown."""


def validate_generated(value, min_words=120):
    if not isinstance(value, dict) or not value.get("title", "").strip() or not value.get("standfirst", "").strip():
        raise ValueError("missing title or standfirst")
    sections = value.get("sections")
    if not isinstance(sections, list) or not 1 <= len(sections) <= 12:
        raise ValueError("invalid sections")
    text_parts = [value["title"], value["standfirst"]]
    for section in sections:
        if not isinstance(section, dict):
            raise ValueError("invalid section")
        paragraphs = section.get("paragraphs")
        bullets = section.get("bullets")
        if not isinstance(paragraphs, list) or not isinstance(bullets, list) or not paragraphs + bullets:
            raise ValueError("empty section")
        text_parts.extend([section.get("heading", ""), *paragraphs, *bullets])
    text = "\n".join(text_parts)
    lowered = text.lower()
    if "<script" in lowered or "<iframe" in lowered or "ai-generated" in lowered or "as an ai" in lowered:
        raise ValueError("unsafe or disclosed generation text")
    if len(text.split()) < min_words:
        raise ValueError("article is too short")
    return value


def generate_one(client, source):
    last_error = None
    for _attempt in range(2):
        try:
            response = client.responses.create(
                model=MODEL_ID,
                reasoning={"effort": "medium"},
                instructions=SYSTEM_PROMPT,
                input=f"Original title: {source['original_title']}\nOriginal article:\n{source['source_text']}",
                text={"format": {"type": "json_schema", "name": "english_post", "strict": True, "schema": POST_SCHEMA}},
            )
            minimum = min(120, max(10, len(source["source_text"].split()) // 2))
            return validate_generated(json.loads(response.output_text), min_words=minimum)
        except Exception as exc:
            last_error = exc
    raise last_error


def run():
    if not os.getenv("OPENAI_API_KEY"):
        raise SystemExit("OPENAI_API_KEY is required")
    sources = fetch_posts().get("items", {})
    if len(sources) != 50:
        raise ValueError("the fixed WordPress source set must contain 50 posts")
    document = load_json(OUTPUT, {"schema_version": 1, "fixed_count": 50, "items": {}})
    output = document["items"]
    client = OpenAI()
    for stable_id, source in sources.items():
        previous = output.get(stable_id)
        if previous and previous.get("status") == "ready":
            continue
        try:
            generated = generate_one(client, source)
            output[stable_id] = {
                "status": "ready",
                "wordpress_id": source["wordpress_id"],
                "title": generated["title"],
                "standfirst": generated["standfirst"],
                "sections": generated["sections"],
                "published_at": source["published_at"],
                "original_modified_at": source["original_modified_at"],
                "source_url": source["source_url"],
                "source_hash": source["source_hash"],
                "model": MODEL_ID,
                "reasoning_effort": "medium",
                "prompt_version": PROMPT_VERSION,
                "generated_at": utc_now(),
            }
        except Exception as exc:
            if not previous or previous.get("status") != "ready":
                output[stable_id] = {
                    "status": "generation_failed",
                    "wordpress_id": source["wordpress_id"],
                    "source_hash": source["source_hash"],
                    "error_type": type(exc).__name__,
                }
        save_json(OUTPUT, document)
    ready = sum(item.get("status") == "ready" for item in output.values())
    print(f"{ready} of 50 posts are ready")


if __name__ == "__main__":
    run()
