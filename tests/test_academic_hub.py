import copy
import json
import sys
import types
from pathlib import Path

import pytest

import build
from scripts.fetch_wordpress import clean_html, fetch_posts
from scripts.generate_posts import validate_generated
from scripts.generate_summaries import needs_generation
from scripts.content_model import THEMES, source_hash, validate_summary
from scripts.fetch_youtube import _clean_caption, _verified_upload_date, fetch_gemini_video_evidence, fetch_videos


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


def test_summary_schema_rejects_stray_thai_characters():
    summary = valid_summary()
    summary["ko"]["overview"] += " ห"
    with pytest.raises(ValueError, match="Thai"):
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


def test_youtube_upload_date_requires_verified_timestamp():
    assert _verified_upload_date({"timestamp": 1704067200}) == "2024-01-01T00:00:00+00:00"
    assert _verified_upload_date({"upload_date": "20240101"}) == ""
    assert _verified_upload_date({"timestamp": "1704067200"}) == ""


def test_offline_build_preserves_support_files_and_generates_routes():
    protected = ["CNAME", "robots.txt", "ads.txt", "app-ads.txt"]
    before = {name: (ROOT / name).read_bytes() for name in protected}
    build.build_site(offline=True)
    assert (ROOT / "videos" / "index.html").exists()
    assert (ROOT / "publications" / "index.html").exists()
    assert (ROOT / "projects" / "index.html").exists()
    assert (ROOT / "posts" / "index.html").exists()
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


def test_detail_pages_have_breadcrumb_structured_data():
    build.build_site(offline=True)
    pages = [
        next((ROOT / "posts").glob("*/index.html")),
        next((ROOT / "videos").glob("*/index.html")),
        next((ROOT / "publications").glob("*/index.html")),
        ROOT / "projects" / "index.html",
    ]
    for page in pages:
        text = page.read_text(encoding="utf-8")
        assert '"@type": "BreadcrumbList"' in text
        assert '"position": 1' in text
        assert '"item": "https://ahn-lab.org/' in text


def test_video_schema_is_emitted_only_with_verified_upload_date():
    env = build.environment()
    base = {
        "title": "강의 제목",
        "video_id": "abc",
        "thumbnail": "https://img.youtube.com/vi/abc/hqdefault.jpg",
        "url": "https://www.youtube.com/watch?v=abc",
        "seo_description": "강의 설명",
        "generated": {"status": "pending_source"},
    }
    context = {"author": build.AUTHOR, "base_url": build.BASE_URL, "page": "videos", "themes": THEMES, "build_year": 2026}
    without_date = env.get_template("video_detail.html").render(video=base, **context)
    assert '"@type": "VideoObject"' not in without_date
    with_date = env.get_template("video_detail.html").render(video={**base, "upload_date": "2024-01-01T00:00:00+00:00"}, **context)
    assert '"@type": "VideoObject"' in with_date
    for field in ["name", "description", "thumbnailUrl", "uploadDate", "url", "embedUrl"]:
        assert f'"{field}"' in with_date


def test_index_pages_have_distinct_descriptions():
    build.build_site(offline=True)
    pages = [ROOT / "index.html", ROOT / "posts" / "index.html", ROOT / "videos" / "index.html", ROOT / "publications" / "index.html", ROOT / "projects" / "index.html"]
    descriptions = []
    for page in pages:
        text = page.read_text(encoding="utf-8")
        match = __import__("re").search(r'<meta name="description" content="([^"]+)', text)
        assert match
        descriptions.append(match.group(1))
    assert len(set(descriptions)) == len(pages)


def test_sitemap_uses_source_dates_and_preserves_route_count():
    build.build_site(offline=True)
    sitemap = (ROOT / "sitemap.xml").read_text(encoding="utf-8")
    post = next(iter(json.loads((ROOT / "_pipeline" / "posts.json").read_text(encoding="utf-8"))["items"].values()))
    route = f"https://ahn-lab.org/posts/{post['wordpress_id']}/"
    entry = sitemap.split(f"<loc>{route}</loc>", 1)[1].split("</url>", 1)[0]
    assert f"<lastmod>{post['original_modified_at'][:10]}</lastmod>" in entry
    assert sitemap.count("<url>") == 165
    assert "<loc>https://ahn-lab.org/ttokttok/</loc>" in sitemap
    assert "build_year" not in sitemap


def test_data_files_are_valid_json():
    for path in [*(ROOT / "data").glob("*.json"), *(ROOT / "_pipeline").glob("*.json")]:
        json.loads(path.read_text(encoding="utf-8"))


def test_wordpress_html_is_reduced_to_safe_text():
    source = '<p>Hello <img src="x">world</p><script>bad()</script><iframe>bad</iframe><h2>Next</h2>'
    cleaned = clean_html(source)
    assert cleaned == "Hello world\nNext"
    assert "bad" not in cleaned


def test_wordpress_fetch_requires_50_unique_items(monkeypatch, tmp_path):
    class Response:
        def raise_for_status(self):
            return None
        def json(self):
            return [{"id": index, "date": "2024-01-01T00:00:00", "modified": "2024-01-01T00:00:00", "link": f"https://example.com/{index}", "title": {"rendered": f"Post {index}"}, "content": {"rendered": "<p>" + ("source text " * 50) + "</p>"}} for index in range(50)]
    class Session:
        @staticmethod
        def get(*_args, **_kwargs):
            return Response()
    monkeypatch.setattr("scripts.fetch_wordpress.CACHE", tmp_path / "sources.json")
    result = fetch_posts(session=Session)
    assert result["fixed_count"] == 50
    assert len(result["items"]) == 50
    assert result["items"]["0"]["published_at"] == "2024-01-01T00:00:00"


def test_generated_post_validation_rejects_disclosure_and_html():
    valid = {"title": "A useful title", "standfirst": "A compact introduction.", "sections": [
        {"heading": "First", "paragraphs": ["Evidence grounded discussion " * 35], "bullets": []},
        {"heading": "Second", "paragraphs": ["Further source grounded discussion " * 35], "bullets": []},
    ]}
    assert validate_generated(valid) == valid
    invalid = copy.deepcopy(valid)
    invalid["sections"][0]["paragraphs"][0] = "This article was generated by AI. " * 80
    with pytest.raises(ValueError):
        validate_generated(invalid)
    valid["sections"][0]["paragraphs"][0] = "AI-generated text can be studied as an aid to writing. " * 40
    assert validate_generated(valid) == valid


def test_pages_config_excludes_internal_data():
    config = (ROOT / "_config.yml").read_text(encoding="utf-8")
    assert "_pipeline" in config
    assert "data" in config


def test_partial_post_collection_is_not_published(monkeypatch, tmp_path):
    monkeypatch.setattr(build, "ROOT", tmp_path)
    monkeypatch.setattr(build, "DATA", ROOT / "data")
    monkeypatch.setattr(build, "PIPELINE", tmp_path / "_pipeline")
    monkeypatch.setattr(build, "TEMPLATES", ROOT / "templates")
    (tmp_path / "_pipeline").mkdir()
    (tmp_path / "_pipeline" / "posts.json").write_text(json.dumps({"items": {"1": {"status": "ready", "wordpress_id": 1, "published_at": "2024-01-01", "title": "Partial"}}}), encoding="utf-8")
    build.build_site(offline=True)
    assert "Partial" not in (tmp_path / "posts" / "index.html").read_text(encoding="utf-8")


def test_generation_disclaimer_section_is_not_rendered():
    post = {"sections": [
        {"heading": "Findings", "paragraphs": ["AI-generated text was studied."], "bullets": []},
        {"heading": "Disclaimer", "paragraphs": ["This article was generated by ChatGPT."], "bullets": []},
    ]}
    cleaned = build.remove_generation_disclosures(post)
    assert [section["heading"] for section in cleaned["sections"]] == ["Findings"]


def test_public_posts_do_not_present_the_authors_work_as_derived():
    build.build_site(offline=True)
    page = next((ROOT / "posts").glob("*/index.html")).read_text(encoding="utf-8")
    assert "Original post" not in page
    assert '"isBasedOn"' not in page


def test_post_lists_are_unnumbered_and_title_first():
    build.build_site(offline=True)
    page = (ROOT / "posts" / "index.html").read_text(encoding="utf-8")
    assert '<ul class="post-list">' in page
    assert '<ol class="post-list">' not in page
    first_item = page.split('<li>', 1)[1].split('</li>', 1)[0]
    assert first_item.index('<a ') < first_item.index('<time ')


def test_profile_email_is_obfuscated_and_research_interests_are_current():
    build.build_site(offline=True)
    page = (ROOT / "index.html").read_text(encoding="utf-8")
    assert "sangzinahn@gmail.com" not in page
    assert 'class="email-copy"' in page
    assert 'data-user="sangzinahn"' in page
    assert 'data-domain="gmail.com"' in page
    first = "대형언어모델의 의학 지식 표현 및 추론 평가 (Evaluation of Medical Knowledge Representation and Reasoning in LLMs)"
    second = "의학교육에서 대형언어모델 활용 (LLMs in Medical Education)"
    assert page.index(first) < page.index(second)
    assert "LLM Applications in Medical Research" not in page


def test_project_descriptions_are_korean_on_home_and_project_pages():
    build.build_site(offline=True)
    for path in [ROOT / "index.html", ROOT / "projects" / "index.html"]:
        page = path.read_text(encoding="utf-8")
        assert "위치 파일을 브라우저 밖으로 전송하지 않고" in page
        assert "의학과 학습을 위한 암기법과 기억 단서를 모으는 커뮤니티입니다." in page
        assert "Turns a Google Maps Timeline export" not in page


def test_site_uses_white_background_and_accessible_link_color():
    css = (ROOT / "static" / "css" / "style.css").read_text(encoding="utf-8")
    assert "--paper: #fff" in css
    assert "--accent: #245b85" in css
    assert "background: var(--paper)" in css


def test_site_has_no_copyright_footer():
    build.build_site(offline=True)
    page = (ROOT / "index.html").read_text(encoding="utf-8")
    assert "<footer" not in page
    assert "©" not in page


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
    assert items[0]["title_language"] == "ko"


def test_video_discovery_requests_korean_youtube_metadata(monkeypatch, tmp_path):
    captured = {}
    class FakeYDL:
        def __init__(self, options):
            captured.update(options)
        def __enter__(self):
            return self
        def __exit__(self, *_args):
            return False
        def extract_info(self, *_args, **_kwargs):
            return {"entries": []}
    monkeypatch.setattr("scripts.fetch_youtube.CACHE_FILE", tmp_path / "videos.json")
    monkeypatch.setattr("scripts.fetch_youtube.yt_dlp.YoutubeDL", FakeYDL)
    fetch_videos()
    assert captured["extractor_args"]["youtube"]["lang"] == ["ko"]
    assert captured["http_headers"]["Accept-Language"].startswith("ko-KR")


def test_pending_source_does_not_replace_ready_record():
    ready = {"status": "ready", "source_hash": "old", "summary": valid_summary()}
    candidate = {"status": "pending_source", "source_hash": ""}
    output = {"video:abc": ready}
    if candidate["status"] == "ready":
        output["video:abc"] = candidate
    assert output["video:abc"] == ready


def test_pending_items_are_retried_without_rewriting_ready_content():
    item = {"source_hash": "same"}
    assert needs_generation({"status": "pending_source", "source_hash": "same"}, item)
    assert not needs_generation({"status": "ready", "source_hash": "same"}, item)


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
