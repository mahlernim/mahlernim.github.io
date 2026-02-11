import feedparser
import json
import re

PLAYLIST_ID = "PL0TnWnPQhDj2-TOwiz_ZhY2Sdurimss2Q"
RSS_URL = f"https://www.youtube.com/feeds/videos.xml?playlist_id={PLAYLIST_ID}"

def fetch_videos():
    print(f"Fetching YouTube playlist: {PLAYLIST_ID}...")
    try:
        feed = feedparser.parse(RSS_URL)
        videos = []
        
        for entry in feed.entries:
            # Entry structure:
            # title, link, published, yt_videoid, media_thumbnail
            
            video_id = getattr(entry, 'yt_videoid', None)
            if not video_id:
                # Try simple regex on link if attribute missing
                match = re.search(r'v=([^&]+)', entry.link)
                if match:
                    video_id = match.group(1)
            
            term = f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg" if video_id else ""
            
            # Prefer using media_group for higher res if available, but constructed URL is safer/standard
            
            videos.append({
                "title": entry.title,
                "link": entry.link,
                "published": entry.published,
                "video_id": video_id,
                "thumbnail": term
            })
            
        print(f"Fetched {len(videos)} videos.")
        return videos
        
    except Exception as e:
        print(f"Exception fetching YouTube: {e}")
        return []

if __name__ == "__main__":
    v = fetch_videos()
    print(json.dumps(v[:3], indent=2))
