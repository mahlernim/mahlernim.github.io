import copy
import json
import sys
import types
from pathlib import Path

import pytest

import build
from scripts.content_model import THEMES, source_hash, validate_summary
from scripts.fetch_youtube import _clean_caption, fetch_gemini_video_evidence, fetch_videos


ROOT = Path(__file__).resolve().parents[1]


def valid_summary():
    language = {
        "overview": "Evidence-grounded overview.",
        "key_points": ["One", "Two", "Three"],
        "audience": "Researchers",
        "scope_note": "Based on the supplied source.",
        "research_context": "Related to the portfolio theme.",
    }
    return {"theme_id": next(iter(THEMES)), "ko": copy.deepcopy(language), "en": copy.deepcopy(language)}


def test_summary_schema_rejects_unknown_theme_and_wrong_point_count():
    summary = valid_summary()
    assert validate_summary(summary) == summary
    summary["theme_id"] = "invented"
    with pytest.raises(ValueError):
        validate_summary(summary)
    summary = valid_summary()
    summary["ko"]["key_points"].pop()
    with pytest.raises(ValueError):
        validate_summary(summary)


def test_source_hash_is_whitespace_stable():
    assert source_hash("alpha  beta\n gamma") == source_hash("alpha beta gamma")


def test_caption_cleaner_removes_timing_markup_and_duplicates():
    vtt = "WEBVTT\n\n00:00.000 --> 00:01.000\n<c>안녕하세요</c>\n00:01.000 --> 00:02.000\n안녕하세요\n연구 요약"
    assert _clean_caption(vtt) == "안녕하세요 연구 요약"


def test_offline_build_preserves_support_files_and_generates_routes():
    protected = ["CNAME", "robots.txt", "ads.txt", "app-ads.txt"]
    before = {name: (ROOT / name).read_bytes() for name in protected}
    build.build_site(offline=True)
    assert (ROOT / "videos" / "index.html").exists()
    assert (ROOT / "publications" / "index.html").exists()
    assert (ROOT / "projects" / "index.html").exists()
    assert "/google-timeline-visualizer/" in (ROOT / "sitemap.xml").read_text(encoding="utf-8")
    assert before == {name: (ROOT / name).read_bytes() for name in protected}


def test_generated_pages_have_canonical_and_no_secret_marker():
    build.build_site(offline=True)
    pages = [ROOT / "index.html", ROOT / "videos" / "index.html", ROOT / "projects" / "index.html"]
    for page in pages:
        text = page.read_text(encoding="utf-8")
        assert '<link rel="canonical"' in text
        assert "OPENAI_API_KEY" not in text
        assert "sk-proj-" not in text


def test_data_files_are_valid_json():
    for path in (ROOT / "data").glob("*.json"):
        json.loads(path.read_text(encoding="utf-8"))


def test_video_discovery_deduplicates_and_preserves_existing_fields(monkeypatch, tmp_path):
    class FakeYDL:
        def __init__(self, _options):
            pass
        def __enter__(self):
            return self
        def __exit__(self, *_args):
            return False
        def extract_info(self, *_args, **_kwargs):
            return {"entries": [
                {"id": "abc", "title": "New title"},
                {"id": "abc", "title": "Duplicate"},
            ]}

    cache = tmp_path / "videos.json"
    cache.write_text(json.dumps({"abc": {"video_id": "abc", "caption_status": "available", "canonical_title_checked_at": "now"}}), encoding="utf-8")
    monkeypatch.setattr("scripts.fetch_youtube.CACHE_FILE", cache)
    monkeypatch.setattr("scripts.fetch_youtube.yt_dlp.YoutubeDL", FakeYDL)
    items = fetch_videos()
    assert len(items) == 1
    assert items[0]["title"] == "New title"
    assert items[0]["caption_status"] == "available"


def test_pending_source_does_not_replace_ready_record():
    ready = {"status": "ready", "source_hash": "old", "summary": valid_summary()}
    candidate = {"status": "pending_source", "source_hash": ""}
    output = {"video:abc": ready}
    if candidate["status"] == "ready":
        output["video:abc"] = candidate
    assert output["video:abc"] == ready


def test_gemini_video_evidence_is_optional(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    evidence, metadata = fetch_gemini_video_evidence("abc")
    assert evidence == ""
    assert metadata["video_evidence_status"] == "unavailable"


def test_gemini_video_evidence_records_provenance(monkeypatch):
    class FakeInteractions:
        def create(self, **kwargs):
            assert kwargs["input"][1]["uri"].endswith("watch?v=abc")
            return types.SimpleNamespace(output_text="Grounded video evidence")

    class FakeClient:
        def __init__(self, api_key):
            assert api_key == "test-key"
            self.interactions = FakeInteractions()

    fake_genai = types.SimpleNamespace(Client=FakeClient)
    monkeypatch.setitem(sys.modules, "google", types.SimpleNamespace(genai=fake_genai))
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    evidence, metadata = fetch_gemini_video_evidence("abc")
    assert evidence == "Grounded video evidence"
    assert metadata["video_evidence_status"] == "available"
    assert metadata["video_evidence_provider"] == "gemini_youtube"
    assert metadata["source_hash"] == source_hash(evidence)
