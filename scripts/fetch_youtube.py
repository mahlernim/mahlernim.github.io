import feedparser
import json
import re

PLAYLIST_ID = "PL0TnWnPQhDj2-TOwiz_ZhY2Sdurimss2Q"
# Use Web URL for yt-dlp, not RSS
VIDEO_URL = f"https://www.youtube.com/playlist?list={PLAYLIST_ID}"

import requests
import time

import yt_dlp

def fetch_videos():
    print(f"Fetching YouTube playlist: {PLAYLIST_ID}...")
    
    ydl_opts = {
        'quiet': True,
        'extract_flat': True,
        'dump_single_json': True,
        'playlist_items': '1-3' # Fetch top 3 only
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            result = ydl.extract_info(VIDEO_URL, download=False)
            
            if 'entries' in result:
                videos = []
                for entry in result['entries']:
                    videos.append({
                        "title": entry['title'],
                        "link": f"https://www.youtube.com/watch?v={entry['id']}",
                        "published": "", # yt-dlp flat extraction might not have date, skipping
                        "video_id": entry['id'],
                        "thumbnail": f"https://img.youtube.com/vi/{entry['id']}/hqdefault.jpg"
                    })
                
                print(f"Fetched {len(videos)} videos using yt-dlp.")
                return videos
            else:
                print("No entries found in playlist.")
                return []

    except Exception as e:
        print(f"Error fetching YouTube with yt-dlp: {e}")
        return []

if __name__ == "__main__":
    v = fetch_videos()
    print(json.dumps(v[:3], indent=2))
