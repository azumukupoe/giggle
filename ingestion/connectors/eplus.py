import requests
from bs4 import BeautifulSoup
from datetime import datetime
from .base import BaseConnector, Event
import json
import urllib.parse

class EplusConnector(BaseConnector):
    def __init__(self):
        super().__init__()
        # Search for Concerts (Genre 100), Public Performances (1) and Streaming (2)
        # Note: The query string below matches the user's provided URL
        self.base_url = "https://eplus.jp/sf/search?block=true&p_genre_filter=100&koenKind=1&koenKind=2"
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept-Language': 'ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7'
        }

    def get_artist_events(self, artist_name: str):
        # NOT IMPLEMENTED FOR NOW: Only general discovery
        return []

    def get_events(self, query: str = None):
        print(f"  [eplus] Scraping: {self.base_url}")
        
        events = []
        try:
            response = requests.get(self.base_url, headers=self.headers, timeout=15)
            if response.status_code != 200:
                print(f"  [eplus] Failed to fetch: {response.status_code}")
                return []

            soup = BeautifulSoup(response.content, 'html.parser')
            
            # Extract the embedded JSON data
            json_script = soup.find('script', id='json')
            if not json_script:
                print("  [eplus] Failed to find embedded JSON data.")
                return []

            try:
                data = json.loads(json_script.string.strip())
            except json.JSONDecodeError as e:
                print(f"  [eplus] JSON parsing error: {e}")
                return []

            record_list = data.get('data', {}).get('record_list', [])
            print(f"  [eplus] Found {len(record_list)} items in initial load.")

            for item in record_list:
                try:
                    # Title construction
                    kogyo = item.get('kanren_kogyo_sub', {})
                    title_1 = kogyo.get('kogyo_name_1')
                    title_2 = kogyo.get('kogyo_name_2')
                    title = f"{title_1} {title_2}" if title_2 else title_1
                    if not title:
                        title = "Unknown Event"

                    # URL
                    detail_path = item.get('koen_detail_url_pc')
                    link = f"https://eplus.jp{detail_path}" if detail_path else None

                    # Date
                    # Format in JSON: '20251115～20260112' or single dates?
                    # Looking at dump: "koenbi_hyoji_mongon": "2025/12/11(木)18:30"
                    # Or 'uketsuke_start_datetime': '20250929100000'
                    # Or 'kanren_uketsuke_koen_list' -> 'koenbi_term'
                    
                    # We'll use the first available date or 'koenbi_term' start
                    date_term = item.get('koenbi_term', '') # e.g. "20251115～20260112"
                    if date_term and len(date_term) >= 8:
                        start_date_str = date_term[:8] # 20251115
                        try:
                            date_obj = datetime.strptime(start_date_str, "%Y%m%d")
                        except:
                            date_obj = datetime.now()
                    else:
                        date_obj = datetime.now()

                    # Location / Venue
                    venue_info = item.get('kanren_venue', {})
                    venue_name = venue_info.get('venue_name') or "Unknown Venue"
                    pref_name = venue_info.get('todofuken_name') or "Japan"
                    location = f"{venue_name}, {pref_name}"

                    # Image
                    # Images are not explicitly in the record_list in high res, 
                    # but sometimes derived from codes. For now, leave empty or use generic.
                    img_url = None 
                    
                    # Artist
                    # Try to find 'shutsuensha' (performers) in the first ticket info block
                    artist = "Various"
                    uketsuke_list = item.get('kanren_uketsuke_koen_list', [])
                    if uketsuke_list:
                        performers = uketsuke_list[0].get('shutsuensha')
                        if performers:
                            artist = performers
                    
                    # Fallback to title if artist is still generic or empty
                    if artist == "Various" and title:
                        artist = title

                    if link:
                        events.append(Event(
                            title=title,
                            artist=artist,
                            venue=venue_name,
                            date=date_obj,
                            location=location,
                            url=link,
                            image_url=img_url,
                            source="eplus",
                            external_id=link
                        ))

                except Exception as e:
                    print(f"  [eplus] Error parsing item: {e}")
                    continue

        except Exception as e:
            print(f"  [eplus] Error: {e}")
            
        return events
