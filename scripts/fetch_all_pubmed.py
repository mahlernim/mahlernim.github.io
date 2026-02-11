import requests
import xml.etree.ElementTree as ET
import os
import json
from datetime import datetime

# Import shared functions from the main script
# We can't easily import from sibling if not a module, so copying core logic for safety 
# or fixing path. Let's fix path.

import sys
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(current_dir)

# Actually, let's just use the functions from fetch_pubmed since it's robust
from fetch_pubmed import fetch_pubmed_ids, fetch_details_with_cache, SEARCH_TERM

# Monkey patch or override to fetch ALL
def fetch_all_ids(term):
    print(f"Fetching ALL IDs for {term}...")
    url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
    params = {
        "db": "pubmed",
        "term": term,
        "retmode": "json",
        "retmax": 1000 # Increase max
        # NO reldate param here
    }
    try:
        resp = requests.get(url, params=params)
        if resp.status_code == 200:
            return resp.json().get('esearchresult', {}).get('idlist', [])
    except Exception as e:
        print(f"Error: {e}")
    return []

def main():
    print("--- ONE-TIME FETCH OF ALL PUBLICATIONS ---")
    ids = fetch_all_ids(SEARCH_TERM)
    print(f"Found {len(ids)} total papers.")
    
    if ids:
        # valid cache logic exists in fetch_pubmed
        # this will fetch details for any misses and save to cache
        works = fetch_details_with_cache(ids)
        print(f"Successfully cached {len(works)} papers.")

if __name__ == "__main__":
    main()
