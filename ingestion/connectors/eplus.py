import requests
from datetime import datetime, timedelta, timezone
from .base import BaseConnector, Event
import json
import urllib.parse
import sys
import concurrent.futures
from bs4 import BeautifulSoup
import time


class CircuitBreakerError(Exception):
    pass

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
        
        # Setup session with retry
        self.session = requests.Session()
        retries = requests.adapters.Retry(total=3, backoff_factor=1, status_forcelist=[500, 502, 503, 504])
        adapter = requests.adapters.HTTPAdapter(max_retries=retries)
        self.session.mount('http://', adapter)
        self.session.mount('https://', adapter)

        # Circuit Breaker state
        self.consecutive_failures = 0
        self.max_consecutive_failures = 20
        self.circuit_open = False
        
    def get_artist_events(self, artist_name: str):
        # NOT IMPLEMENTED FOR NOW: Only general discovery via get_events
        return []

    def _get_all_ids(self, genre_code: str):
        """
        Fetches all (kogyo_code, kogyo_sub_code) tuples for a given parent_genre_code.
        Uses high concurrency as API handling allows it.
        """
        print(f"  [eplus] Fetching exclusion list for genre {genre_code}...")
        
        items_per_page = 200
        
        params = {
            "shutoku_kensu": 1, # Just to get count
            "shutoku_start_ichi": 1,
            "parent_genre_code_list": genre_code,
            "streaming_haishin_kubun_list": "0"
        }
        
        try:
            res = self.session.get(self.api_url, headers=self.headers, params=params, timeout=15)
            if res.status_code != 200:
                print(f"  [eplus] Failed to check count for genre {genre_code}")
                return set()
            
            data = res.json()
            total_count = data['data'].get('so_kensu', 0)
        except Exception as e:
            print(f"  [eplus] Error checking genre {genre_code}: {e}")
            return set()
            
        print(f"  [eplus] Genre {genre_code} has {total_count} items. Fetching all...")
        
        ids = set()
        
        # Function to fetch a page
        def fetch_page(start_index):
            p = params.copy()
            p['shutoku_kensu'] = items_per_page
            p['shutoku_start_ichi'] = start_index
            # We don't need sorting for IDs, but keeping consistent might help caching?
            
            try:
                r = self.session.get(self.api_url, headers=self.headers, params=p, timeout=20)
                if r.status_code == 200:
                    d = r.json()
                    page_ids = set()
                    if d.get('data') and d['data'].get('record_list'):
                        for item in d['data']['record_list']:
                            k_code = item.get('kogyo_code')
                            k_sub = item.get('kogyo_sub_code')
                            if k_code and k_sub:
                                page_ids.add((k_code, k_sub))
                    return page_ids
            except Exception:
                pass
            return set()

        # Generate start indices
        start_indices = range(1, total_count + 1, items_per_page)
        
        with concurrent.futures.ThreadPoolExecutor(max_workers=20) as executor:
            futures = [executor.submit(fetch_page, i) for i in start_indices]
            for future in concurrent.futures.as_completed(futures):
                ids.update(future.result())
                
        print(f"  [eplus] Fetched {len(ids)} exclusion IDs for genre {genre_code}.")
        return ids

    def get_events(self, query: str = None, max_pages: int = None):
        
        all_events = []
        
        # --- PRE-FETCH EXCLUSIONS ---
        # Fetch IDs for Events (200) and Movies (700) to exclude them
        excluded_ids = set()
        excluded_ids.update(self._get_all_ids("200"))
        excluded_ids.update(self._get_all_ids("700"))
        print(f"  [eplus] Total excluded IDs: {len(excluded_ids)}")
        # ----------------------------

        # Need dt_now for processing
        dt_now = datetime.now()

        # Pagination
        items_per_page = 200 
        current_start_index = 1
        
        page = 0
        while True:
            if self.circuit_open:
                print("  [eplus] Circuit breaker is OPEN. Stopping ingestion.")
                break

            page += 1
            if max_pages and page > max_pages:
                break
            params = {
                "shutoku_kensu": items_per_page,
                "shutoku_start_ichi": current_start_index,
                "sort_key": "koenbi,kaien_time,parent_koen_taisho_flag,kogyo_code,kogyo_sub_code",
                "parent_genre_code_list": "100",  # Music/Concerts
                "streaming_haishin_kubun_list": "0"
            }

            try:
                response = self.session.get(self.api_url, headers=self.headers, params=params, timeout=15)
                
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

                # Restore high concurrency for processing (since no scraping)
                with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
                    # Pass excluded_ids to process_item
                    futures = [executor.submit(self._process_item, item, dt_now, excluded_ids) for item in record_list]
                    for future in concurrent.futures.as_completed(futures):
                        try:
                            result = future.result()
                            if result:
                                all_events.append(result)
                        except Exception as e:
                            pass
                
                if self.circuit_open:
                    break

                # Update pagination for next loop
                current_start_index += items_per_page
                if current_start_index > total_count:
                    break
                    
            except Exception as e:
                print(f"  [eplus] Error processing page {page}: {e}")
                break
                
        # Merging Logic (Post-Processing)
        # Group by (date, venue)
        grouped_events = {}
        for ev in all_events:
            if not ev.date or not ev.venue:
                continue
            
            # Use isoformat or tuple for key
            # ev.date is datetime
            key = (ev.date, ev.venue)
            if key not in grouped_events:
                grouped_events[key] = []
            grouped_events[key].append(ev)
            
        final_events = []
        for key, group in grouped_events.items():
            if not group:
                continue
            
            # Pick the first one as base
            base_ev = group[0]
            
            # Deduplicate artists if they differ?
            artists = set()
            for e in group:
                if e.artist:
                    artists.add(e.artist)
            
            artist = base_ev.artist
            if len(artists) > 1:
                artist = " / ".join(sorted(list(artists)))

            final_events.append(Event(
                title=base_ev.title,
                artist=artist,
                venue=base_ev.venue,
                date=base_ev.date,
                location=base_ev.location,
                url=base_ev.url
            ))
            
        return final_events

    def _process_item(self, item, dt_now, excluded_ids):
        if self.circuit_open:
            return None

        try:
            # Check Exclusion ID first
            k_code = item.get('kogyo_code')
            k_sub = item.get('kogyo_sub_code')
            if k_code and k_sub:
                if (k_code, k_sub) in excluded_ids:
                    return None

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

            # "koenbi_term": "20250315～20260222"
            # "kaien_time": "1000"
            
            # Use the start of the term as the event date for now.
            koenbi_term = item.get('koenbi_term', '')
            date_obj = dt_now # Fallback
            
            if koenbi_term:
                # Take first 8 chars
                date_str = koenbi_term[:8]
                try:
                    # JST timezone
                    JST = timezone(timedelta(hours=9))
                    date_obj = datetime.strptime(date_str, "%Y%m%d").replace(tzinfo=JST)
                    
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
                return Event(
                    title=title,
                    artist=artist,
                    venue=venue_name,
                    date=date_obj,
                    location=location,
                    url=link
                )
            return None

        except Exception as e:
            # print(f"Error processing item: {e}")
            return None



