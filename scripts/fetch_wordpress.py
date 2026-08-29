import argparse
import html
import json
from html.parser import HTMLParser
from pathlib import Path

import requests

from scripts.content_model import save_json, source_hash, utc_now


ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "_pipeline" / "wordpress_sources.json"
API = "https://public-api.wordpress.com/wp/v2/sites/largelearningmodel.wordpress.com/posts"


class TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.skip = 0

    def handle_starttag(self, tag, _attrs):
        if tag in {"script", "style", "iframe", "object", "embed", "svg"}:
            self.skip += 1
        elif tag in {"p", "br", "li", "h1", "h2", "h3", "h4", "blockquote", "pre"}:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in {"script", "style", "iframe", "object", "embed", "svg"} and self.skip:
            self.skip -= 1
        elif tag in {"p", "li", "h1", "h2", "h3", "h4", "blockquote", "pre"}:
            self.parts.append("\n")

    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)


def clean_html(value):
    parser = TextExtractor()
    parser.feed(value or "")
    lines = [" ".join(line.split()) for line in "".join(parser.parts).splitlines()]
    return "\n".join(line for line in lines if line)


def fetch_posts(refresh=False, session=requests):
    if CACHE.exists() and not refresh:
        cached = json.loads(CACHE.read_text(encoding="utf-8"))
        if len(cached.get("items", {})) == 50:
            return cached
    response = session.get(
        API,
        params={"per_page": 50, "_fields": "id,date,date_gmt,modified,modified_gmt,slug,link,title,content"},
        timeout=30,
    )
    response.raise_for_status()
    posts = response.json()
    if len(posts) != 50:
        raise ValueError(f"expected 50 WordPress posts, received {len(posts)}")
    items = {}
    for post in posts:
        stable_id = str(post["id"])
        if stable_id in items:
            raise ValueError(f"duplicate WordPress ID {stable_id}")
        source_text = clean_html(post["content"]["rendered"])
        if len(source_text.split()) < 8:
            raise ValueError(f"WordPress post {stable_id} has inadequate source text")
        items[stable_id] = {
            "wordpress_id": int(post["id"]),
            "original_title": html.unescape(clean_html(post["title"]["rendered"])),
            "published_at": post["date"],
            "published_at_gmt": post.get("date_gmt", ""),
            "original_modified_at": post["modified"],
            "original_modified_at_gmt": post.get("modified_gmt", ""),
            "source_url": post["link"],
            "source_text": source_text,
            "source_hash": source_hash(source_text),
        }
    cache = {"schema_version": 1, "fixed_count": 50, "retrieved_at": utc_now(), "items": items}
    save_json(CACHE, cache)
    return cache


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh", action="store_true")
    args = parser.parse_args()
    fetch_posts(refresh=args.refresh)
