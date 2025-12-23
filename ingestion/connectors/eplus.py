import requests
from datetime import datetime, timedelta
from .base import BaseConnector, Event
import json
import urllib.parse
import sys

class EplusConnector(BaseConnector):
    def __init__(self):
        super().__init__()
        # API V3 Endpoint
        self.api_url = "https://api.eplus.jp/v3/koen"
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept-Language': 'ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7',
            'X-APIToken': 'FGXySj3mTd' # Static token
        }
        
    def get_artist_events(self, artist_name: str):
        # NOT IMPLEMENTED FOR NOW: Only general discovery via get_events
        return []

    def get_events(self, query: str = None, max_pages: int = 5):
        print(f"  [eplus] Fetching events from Eplus API V3...")
        
        all_events = []
        
        # Calculate date range (Today to +3 months)
        dt_now = datetime.now()
        dt_end = dt_now + timedelta(days=90)
        
        # Format: YYYYMMDD
        koenbi_from = dt_now.strftime("%Y%m%d")
        koenbi_to = dt_end.strftime("%Y%m%d")
        
        # Pagination
        items_per_page = 100 
        current_start_index = 1
        
        for page in range(1, max_pages + 1):
            params = {
                "koenbi_from": koenbi_from,
                "koenbi_to": koenbi_to,
                "shutoku_kensu": items_per_page,
                "shutoku_start_ichi": current_start_index,
                "sort_key": "koenbi,kaien_time,parent_koen_taisho_flag,kogyo_code,kogyo_sub_code",
                "parent_genre_code_list": "100",  # Music/Concerts (Stricter than genre_ids[]=1)
                "uketsuke_status_list": [0, 1, 2, 3, 4, 5],
                "streaming_haishin_kubun_list": "0"
            }

            
            # Construct URL manually for array parameters if needed, but requests handles lists usually?
            # Eplus seems to want "genre_ids[]=1". Requests 'params' with list does "genre_ids=1&genre_ids=2".
            # So we might need to handle it carefully. 
            # Actually, verifies script used dictionary key "genre_ids[]" : "1", which results in "&genre_ids%5B%5D=1".
            # This worked in validation.
            
            print(f"  [eplus] Fetching page {page} (Start Index: {current_start_index})...")

            try:
                response = requests.get(self.api_url, headers=self.headers, params=params, timeout=15)
                
                if response.status_code != 200:
                    print(f"  [eplus] Failed to fetch page {page}: {response.status_code}")
                    break

                try:
                    data = response.json()
                except json.JSONDecodeError as e:
                    print(f"  [eplus] JSON parsing error on page {page}: {e}")
                    break
                
                # Check response structure
                if 'data' not in data or 'record_list' not in data['data']:
                     print(f"  [eplus] Unexpected response structure on page {page}.")
                     break

                record_list = data['data']['record_list']
                total_count = data['data'].get('so_kensu', 0)
                
                if not record_list:
                    print(f"  [eplus] No items found on page {page}. Stopping.")
                    break
                
                print(f"  [eplus] Found {len(record_list)} items on page {page}. Total available: {total_count}")

                for item in record_list:
                    try:
                        # Extract basic info
                        kogyo = item.get('kanren_kogyo_sub', {})
                        title_1 = kogyo.get('kogyo_name_1')
                        title_2 = kogyo.get('kogyo_name_2')
                        title = f"{title_1} {title_2}" if title_2 else (title_1 or "Unknown Event")
                        
                        venue_info = item.get('kanren_venue', {})
                        venue_name = venue_info.get('venue_name') or "Unknown Venue"
                        
                        # --- CLIENT SIDE FILTERING ---
                        # Filter out non-music events based on keywords
                        # Exclusion list
                        exclude_keywords = [
                            "美術館", "MUSEUM", # Museum
                            "博物館",            # Museum
                            "展", "EXHIBITION", "PHOTO EXHIBITION", # Exhibition
                            "動物園", "ZOO",     # Zoo
                            "水族館", "AQUARIUM", # Aquarium
                            "温泉", "SPA",       # Spa
                            "テーマパーク", "THEME PARK", # Theme Park
                            "入館券", "ADMISSION", # Admission Ticket
                            "パスポート", "PASSPORT", # Passport
                            "講演会", "TALK SHOW", # Talk Show
                            "お笑い", "COMEDY",    # Comedy
                            "映画", "MOVIE",       # Movie
                            "上映", "SCREENING",   # Screening
                            "舞台挨拶", "GREETING",# Stage Greeting
                            "イベント", "EVENT",   # Generic Event (User Request)
                        ]

                        
                        should_skip = False
                        full_text_check = (title + venue_name).lower()
                        
                        for kw in exclude_keywords:
                            if kw.lower() in full_text_check:
                                should_skip = True
                                break

                        
                        if should_skip:
                            continue

                        # --- End Filtering ---

                        # Detail URL
                        detail_path = item.get('koen_detail_url_pc')
                        # Note: details often come as full URL or relative? Verify script showed full URL.
                        link = detail_path if detail_path else None
                        if link and not link.startswith("http"):
                             link = f"https://eplus.jp{detail_path}"

                        # Date Parsing
                        # koenbi_term: "20250315～20260222" or exact date?
                        # Often koenbi_term is a range.
                        # We also have "uketsuke_start_datetime" but that's for tickets.
                        # There isn't a single clear "event date" in the list object sometimes if it's a period.
                        # But wait, sort_key includes "koenbi".
                        # Let's check verify output... 
                        # "koenbi_term": "20250315～20260222"
                        # "kaien_time": "1000"
                        
                        # Use the start of the term as the event date for now.
                        koenbi_term = item.get('koenbi_term', '')
                        date_obj = dt_now # Fallback
                        
                        if koenbi_term:
                            # Take first 8 chars
                            date_str = koenbi_term[:8]
                            try:
                                date_obj = datetime.strptime(date_str, "%Y%m%d")
                                
                                # Add time if available
                                kaien_time = item.get('kaien_time') # "1000"
                                if kaien_time and len(kaien_time) == 4:
                                    date_obj = date_obj.replace(
                                        hour=int(kaien_time[:2]),
                                        minute=int(kaien_time[2:])
                                    )
                            except ValueError:
                                pass
                        
                        # Location
                        pref_name = venue_info.get('todofuken_name')
                        location = pref_name if pref_name else ""

                        # Artist
                        # Try to find 'shutsuensha'
                        artist = title # Default to title instead of "Various"
                        uketsuke_list = item.get('kanren_uketsuke_koen_list', [])
                        if uketsuke_list:
                             first_uketsuke = uketsuke_list[0]
                             performers = first_uketsuke.get('shutsuensha') # e.g. "Name / Name"
                             if performers:
                                 # Clean up known system text
                                 performers = performers.replace("本公演はスタンプ&ギフト対象公演です。", "")
                                 performers = performers.replace("詳細はこちら /sf/streamingplus/stampgift", "")
                                 performers = performers.strip()
                                 if performers:
                                     artist = performers

                        if link:
                            all_events.append(Event(
                                title=title,
                                artist=artist,
                                venue=venue_name,
                                date=date_obj,
                                location=location,
                                url=link,
                                source="eplus",
                                external_id=link
                            ))

                    except Exception as e:
                        # print(f"  [eplus] Error parsing item: {e}")
                        continue
                
                # Update pagination for next loop
                current_start_index += items_per_page
                if current_start_index > total_count:
                    print(f"  [eplus] Reached end of results ({total_count}).")
                    break
                    
            except Exception as e:
                print(f"  [eplus] Error processing page {page}: {e}")
                break
                
        return all_events
