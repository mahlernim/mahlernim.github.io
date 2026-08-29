import hashlib
import json
from datetime import datetime, timezone


PROMPT_VERSION = "academic-hub-v2"
MODEL_ID = "gpt-5.6-luna"
THEMES = {
    "medical-ai-data-science": {
        "ko": "의료 AI 및 데이터과학",
        "en": "Medical AI & Data Science",
    },
    "pharmacology-precision-medicine": {
        "ko": "약리학 및 정밀의학",
        "en": "Pharmacology & Precision Medicine",
    },
    "neuroscience": {"ko": "신경과학", "en": "Neuroscience"},
    "education-public-health": {
        "ko": "교육 및 공중보건",
        "en": "Education & Public Health",
    },
}

STATUS_VALUES = {"ready", "pending_source", "generation_failed"}


def utc_now():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def source_hash(text):
    normalized = " ".join((text or "").split())
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def load_json(path, default):
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except FileNotFoundError:
        return default


def save_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")


def validate_summary(summary):
    required_text = ["overview", "audience", "scope_note", "research_context"]
    if not isinstance(summary, dict):
        raise ValueError("summary must be an object")
    if summary.get("theme_id") not in THEMES:
        raise ValueError("unknown theme_id")
    for language in ("ko", "en"):
        block = summary.get(language)
        if not isinstance(block, dict):
            raise ValueError(f"missing {language} block")
        for key in required_text:
            if not isinstance(block.get(key), str) or not block[key].strip():
                raise ValueError(f"missing {language}.{key}")
        points = block.get("key_points")
        if not isinstance(points, list) or len(points) != 3:
            raise ValueError(f"{language}.key_points must contain exactly three items")
        if any(not isinstance(point, str) or not point.strip() for point in points):
            raise ValueError(f"invalid {language}.key_points")
    serialized = json.dumps(summary, ensure_ascii=False)
    if any("\u0e00" <= char <= "\u0e7f" for char in serialized):
        raise ValueError("unexpected Thai character in bilingual summary")
    return summary


SUMMARY_JSON_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["theme_id", "ko", "en"],
    "properties": {
        "theme_id": {"type": "string", "enum": list(THEMES)},
        "ko": {"$ref": "#/$defs/language"},
        "en": {"$ref": "#/$defs/language"},
    },
    "$defs": {
        "language": {
            "type": "object",
            "additionalProperties": False,
            "required": [
                "overview",
                "key_points",
                "audience",
                "scope_note",
                "research_context",
            ],
            "properties": {
                "overview": {"type": "string"},
                "key_points": {
                    "type": "array",
                    "minItems": 3,
                    "maxItems": 3,
                    "items": {"type": "string"},
                },
                "audience": {"type": "string"},
                "scope_note": {"type": "string"},
                "research_context": {"type": "string"},
            },
        }
    },
}
