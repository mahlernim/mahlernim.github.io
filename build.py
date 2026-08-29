import argparse
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

from scripts.content_model import THEMES, load_json
from scripts.fetch_pubmed import fetch_works
from scripts.fetch_youtube import fetch_videos


ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
TEMPLATES = ROOT / "templates"
BASE_URL = "https://ahn-lab.org"

AUTHOR = {
    "name": "안상진 (Sangzin Ahn)",
    "title": "인제대학교 의과대학 약리학교실 부교수",
    "affiliation": "Associate Professor, Department of Pharmacology, Inje University College of Medicine",
    "research_interests": [
        "의학교육에서 대형언어모델 활용 (LLMs in Medical Education)",
        "의학연구에서 대형언어모델 적용 (LLM Applications in Medical Research)",
    ],
    "education": [
        "2016.03-현재: 인제대학교 의과대학 약리학교실 교수",
        "2009.03-2016.02: 의학박사, 서울대학교 의과학과 약리학 전공",
        "2003.03-2009.02: 의학사, 서울대학교 의과대학",
    ],
    "announcement": "정말 죄송하게도 경남 일대를 제외한 지역은 이동 시간과 체력적인 부담, 지방 연자를 위한 배려가 부족한 강연료 규정 등의 이유로 현장강의를 고사하고 있습니다. 부디 너그러운 양해 부탁드립니다.",
    "scholar": "https://scholar.google.com/citations?hl=ko&user=Xe825ZgAAAAJ&view_op=list_works&sortby=pubdate",
    "orcid": "https://orcid.org/0000-0003-2749-0014",
    "youtube": "https://youtube.com/playlist?list=PL0TnWnPQhDj2-TOwiz_ZhY2Sdurimss2Q",
    "blog": "https://largelearningmodel.wordpress.com/",
}


def environment():
    env = Environment(
        loader=FileSystemLoader(TEMPLATES),
        autoescape=select_autoescape(["html", "xml"]),
        trim_blocks=True,
        lstrip_blocks=True,
    )
    env.filters["from_json"] = json.loads
    return env


def summary_for(content, key):
    record = content.get("items", {}).get(key, {})
    return record if record.get("status") == "ready" else record or {"status": "pending_source"}


def render(env, template_name, output, **context):
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        env.get_template(template_name).render(
            author=AUTHOR,
            themes=THEMES,
            base_url=BASE_URL,
            build_year=datetime.now(timezone.utc).year,
            **context,
        ),
        encoding="utf-8",
        newline="\n",
    )


def build_site(offline=False):
    if offline:
        publications = list(load_json(DATA / "publications_cache.json", {}).values())
        videos = list(load_json(DATA / "videos_cache.json", {}).values())
        videos.sort(key=lambda item: item.get("playlist_position", 999999))
    else:
        publications = fetch_works()
        videos = fetch_videos()
    publications.sort(key=lambda item: (item.get("year", 0), item.get("pmid", "")), reverse=True)
    content = load_json(DATA / "generated_content.json", {"schema_version": 1, "items": {}})
    env = environment()

    for item in videos:
        item["generated"] = summary_for(content, f"video:{item['video_id']}")
    for item in publications:
        item["generated"] = summary_for(content, f"publication:{item['pmid']}")

    render(env, "index.html", ROOT / "index.html", page="home", videos=videos[:3], publications=publications[:6])
    render(env, "videos.html", ROOT / "videos" / "index.html", page="videos", videos=videos)
    for item in videos:
        render(env, "video_detail.html", ROOT / "videos" / item["video_id"] / "index.html", page="videos", video=item)
    render(env, "publications.html", ROOT / "publications" / "index.html", page="publications", publications=publications)
    for item in publications:
        render(env, "publication_detail.html", ROOT / "publications" / item["pmid"] / "index.html", page="publications", publication=item)
    render(env, "projects.html", ROOT / "projects" / "index.html", page="projects")
    write_sitemap(videos, publications)


def write_sitemap(videos, publications):
    routes = ["/", "/videos/", "/publications/", "/projects/", "/google-timeline-visualizer/"]
    routes += [f"/videos/{item['video_id']}/" for item in videos]
    routes += [f"/publications/{item['pmid']}/" for item in publications]
    body = "\n".join(f"  <url><loc>{BASE_URL}{route}</loc></url>" for route in routes)
    (ROOT / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"{body}\n</urlset>\n",
        encoding="utf-8",
        newline="\n",
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--offline", action="store_true")
    args = parser.parse_args()
    build_site(offline=args.offline)
