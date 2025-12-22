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

    def get_events(self, query: str = None, max_pages: int = 5):
        print(f"  [eplus] Scraping base URL: {self.base_url}")
        
        all_events = []
        
        for page in range(1, max_pages + 1):
            # Eplus uses &page=N
            url = f"{self.base_url}&page={page}"
            print(f"  [eplus] Fetching page {page}: {url}")

            try:
                response = requests.get(url, headers=self.headers, timeout=15)
                if response.status_code != 200:
                    print(f"  [eplus] Failed to fetch page {page}: {response.status_code}")
                    break

                soup = BeautifulSoup(response.content, 'html.parser')
                
                # Extract the embedded JSON data
                json_script = soup.find('script', id='json')
                if not json_script:
                    print(f"  [eplus] Failed to find embedded JSON data on page {page}.")
                    break

                try:
                    data = json.loads(json_script.string.strip())
                except json.JSONDecodeError as e:
                    print(f"  [eplus] JSON parsing error on page {page}: {e}")
                    break

                record_list = data.get('data', {}).get('record_list', [])
                if not record_list:
                    print(f"  [eplus] No items found on page {page}. Stopping.")
                    break
                
                print(f"  [eplus] Found {len(record_list)} items on page {page}.")

                print(f"  [eplus] Found {len(record_list)} items on page {page}.")

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
                        img_url = None 
                        
                        # Artist
                        # Try to find 'shutsuensha' (performers) in the first ticket info block
                        artist = "Various"
                        uketsuke_list = item.get('kanren_uketsuke_koen_list', [])
                            performers = uketsuke_list[0].get('shutsuensha')
                            if performers:
                                # Filter out system messages (Streaming+ stamp/gift info)
                                if "スタンプ&ギフト" in performers or "streamingplus" in performers:
                                    artist = "Various"
                                else:
                                    artist = performers
                        
                        # Strict filtering: Skip if artist is generic
                        if artist == "Various":
                             # print(f"  [eplus] Skipping {title} (No artist info)")
                             continue

                        if link:
                            all_events.append(Event(
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

            # End of page loop
        
            except Exception as e:
                print(f"  [eplus] Error processing page {page}: {e}")
            
        return all_events
