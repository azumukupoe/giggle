import requests
from datetime import datetime, timedelta
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

    def get_events(self, query: str = None, max_pages: int = None):
        
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
        
        page = 0
        while True:
            if self.circuit_open:
                print("  [eplus] Circuit breaker is OPEN. Stopping ingestion.")
                break

            page += 1
            if max_pages and page > max_pages:
                break
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

                # Parallel processing
                # We need to be careful with concurrency and the circuit breaker counter.
                # However, since we are just incrementing/resetting an integer, the GIL might protect us enough for this simple logic,
                # or we accept slight race conditions as it's just a heuristic.
                with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
                    futures = [executor.submit(self._process_item, item, dt_now) for item in record_list]
                    for future in concurrent.futures.as_completed(futures):
                        try:
                            result = future.result()
                            if result:
                                all_events.append(result)
                        except CircuitBreakerError:
                            self.circuit_open = True
                            print("  [eplus] Circuit breaker triggered! stopping batch.")
                            # Cancel remaining futures? Not easy with ThreadPoolExecutor without shutting down.
                            # We'll just break the loop and the `get_events` loop.
                            break
                        except Exception as e:
                            # Log individual item failure if needed, but keeping silent as per original try/catch block
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
            
            # If there's a need to pick a better title, do it here.
            # Eplus title is constructed as "Title1 Title2".
            # If duplicates have different titles, we might want to prioritize?
            # For now, just taking the first one is consistent with "merging".
            
            # If multiple artists, maybe join them if they differ?
            # Assuming duplicates are mostly same event different tickets.
            
            # Deduplicate artists if they differ?
            artists = set()
            for e in group:
                if e.artist:
                    artists.add(e.artist)
            
            artist = base_ev.artist
            # If we have multiple distinct artists, join them?
            # Eplus artist extraction is "kanren_uketsuke_koen_list[0].shutsuensha"
            # If merged items have different artists, we probably want to keep them.
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

    def _process_item(self, item, dt_now):
        if self.circuit_open:
            return None

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
            if link:
                is_excluded = self._check_exclusion(link)
                if is_excluded:
                    return None
            # --- End Genre Check ---

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
                return Event(
                    title=title,
                    artist=artist,
                    venue=venue_name,
                    date=date_obj,
                    location=location,
                    url=link
                )
            return None

        except CircuitBreakerError:
            raise
        except Exception as e:
            # print(f"Error processing item: {e}")
            return None

    def _check_exclusion(self, link):
        """
        Scrapes the detail page to check for excluded genres.
        Returns True if the event should be excluded (or if check fails).
        Retries up to a limit, then skips the item.
        """
        if self.circuit_open:
             raise CircuitBreakerError("Circuit breaker is open")

        backoff = 1
        max_backoff = 5
        max_retries = 3 # Reduced from 10
        attempt = 0
        
        while attempt < max_retries:
            attempt += 1
            try:
                # Use standard request here within our own loop, 
                # or rely on session. But since we want "infinite" retry for this specific check, 
                # a manual loop is safer than configuring the adapter for MaxInt retries.
                # We can still use self.session for connection pooling.
                
                detail_res = self.session.get(link, headers=self.headers, timeout=10)
                
                if detail_res.status_code == 200:
                    soup = BeautifulSoup(detail_res.text, 'html.parser')
                    breadcrumbs = soup.find_all(class_="breadcrumb-list__name")
                    genres = [b.get_text(strip=True) for b in breadcrumbs]
                    
                    # Reset failures on success
                    self.consecutive_failures = 0

                    exclude_genres = ["イベント", "映画"]
                    for g in genres:
                        if any(ex in g for ex in exclude_genres):
                             return True # Excluded
                    return False
                
                elif detail_res.status_code == 404:
                    print(f"  [eplus] Page not found (404): {link}. Keeping event.")
                    self.consecutive_failures = 0 # 404 is a valid response, not an outage
                    return False # Can't check, assume safe to keep or maybe event is gone.
                    
                else:
                    print(f"  [eplus] Failed to fetch detail page {link}: {detail_res.status_code}. Retrying ({attempt}/{max_retries}) in {backoff}s...")
                    time.sleep(backoff)
                    backoff = min(backoff * 2, max_backoff)
                    
            except Exception as e:
                print(f"  [eplus] Error checking exclusion for {link}: {e}. Retrying ({attempt}/{max_retries}) in {backoff}s...")
                time.sleep(backoff)
                backoff = min(backoff * 2, max_backoff)
        
        # If we get here, we failed max_retries times
        print(f"  [eplus] Gave up checking exclusion for {link} after {max_retries} attempts. SKIPPING item.")
        
        # Increment global failure counter
        self.consecutive_failures += 1
        print(f"  [eplus] Consecutive failure count: {self.consecutive_failures}/{self.max_consecutive_failures}")
        
        if self.consecutive_failures >= self.max_consecutive_failures:
            print("  [eplus] TOO MANY CONSECUTIVE FAILURES. Opening Circuit Breaker.")
            self.circuit_open = True
            raise CircuitBreakerError("Too many consecutive failures")

        return True # Excluded (Skipped) because we couldn't verify it



