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
        
        all_events = []
        
        # Calculate date range (Today to +1 year)
        dt_now = datetime.now()
        dt_end = dt_now + timedelta(days=365)
        
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
                    break

                for item in record_list:
                    try:
                        # Extract basic info
                        kogyo = item.get('kanren_kogyo_sub', {})
                        title_1 = kogyo.get('kogyo_name_1')
                        title_2 = kogyo.get('kogyo_name_2')
                        title = f"{title_1} {title_2}" if title_2 else (title_1 or "Unknown Event")
                        
                        venue_info = item.get('kanren_venue', {})
                        venue_name = venue_info.get('venue_name') or "Unknown Venue"
                        
                        # Detail URL
                        detail_path = item.get('koen_detail_url_pc')
                        link = detail_path if detail_path else None
                        if link and not link.startswith("http"):
                             link = f"https://eplus.jp{detail_path}"

                        # --- DETAIL PAGE GENRE CHECK (User Requirement: No Keyword filtering on Title) ---
                        # We must check the "Genre" breadcrumbs on the detail page to be accurate.
                        # This adds latency (N+1 requests) but is required to avoid false positives.
                        
                        if link:
                            try:
                                # Be polite - add small delay if we are doing this in a loop
                                # However, in a real async scraper we might want to be faster. 
                                # For GitHub Actions, we have time.
                                import time
                                time.sleep(0.5) 
                                
                                detail_res = requests.get(link, headers=self.headers, timeout=10)
                                if detail_res.status_code == 200:
                                    from bs4 import BeautifulSoup
                                    soup = BeautifulSoup(detail_res.text, 'html.parser')
                                    breadcrumbs = soup.find_all(class_="breadcrumb-list__name")
                                    genres = [b.get_text(strip=True) for b in breadcrumbs]
                                    
                                    
                                    # Exclusion list based on GENRE (Breadcrumbs), NOT Title keywords
                                    exclude_genres = ["イベント", "映画"]
                                    is_excluded = False
                                    for g in genres:
                                        if any(ex in g for ex in exclude_genres):
                                            is_excluded = True
                                            break
                                    
                                    if is_excluded:
                                        continue
                            except Exception as e:
                                # If detail scrape fails, decide whether to keep or skip. 
                                # Let's keep it to be safe, but log error?
                                pass
                        # --- End Genre Check ---
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
                                url=link
                            ))

                    except Exception as e:
                        continue
                
                # Update pagination for next loop
                current_start_index += items_per_page
                if current_start_index > total_count:
                    break
                    
            except Exception as e:
                print(f"  [eplus] Error processing page {page}: {e}")
                break
                
        return all_events
