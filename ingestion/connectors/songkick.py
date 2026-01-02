import requests
from typing import List
from datetime import datetime, timezone, timedelta
from .base import BaseConnector, Event, CONSTANTS
from bs4 import BeautifulSoup
import urllib.parse
import json
import concurrent.futures


class SongkickConnector(BaseConnector):
    def __init__(self):
        super().__init__()
        self.base_url = "https://www.songkick.com"
        self.headers = {
            "User-Agent": CONSTANTS.USER_AGENT
        }
        
        # Setup retry session
        self.session = requests.Session()
        retries = requests.adapters.Retry(total=3, backoff_factor=1, status_forcelist=[500, 502, 503, 504])
        adapter = requests.adapters.HTTPAdapter(max_retries=retries)
        self.session.mount('http://', adapter)
        self.session.mount('https://', adapter)

    def get_events(self, query: str = None) -> List[Event]:
        # Required by BaseConnector
        return []

    def get_metro_events(self, metro_id: str = "30717-japan-tokyo", max_pages: int = None) -> List[Event]:
        """
        Fetch events for metro.
        """
        all_events = []
        base_metro_url = f"{self.base_url}/metro-areas/{metro_id}"
        print(f"  [Songkick] Scraping metro area: {base_metro_url}")

        page = 0
        while True:
            page += 1
            if max_pages and page > max_pages:
                break
            url = f"{base_metro_url}?page={page}"
            print(f"  [Songkick] Fetching page {page}: {url}")
            
            try:
                resp = self.session.get(url, headers=self.headers)

                if resp.status_code != 200:
                    print(f"  [Songkick] Failed to fetch page {page}. Status: {resp.status_code}")
                    break
                
                soup = BeautifulSoup(resp.content, 'html.parser')
                
                # Extract JSON-LD
                scripts = soup.find_all('script', type='application/ld+json')
                page_events = []
                
                found_json = False
                items_to_process = []
                for script in scripts:
                    if 'MusicEvent' in script.text:
                        found_json = True
                        try:
                            data = json.loads(script.text)
                            items = data if isinstance(data, list) else [data]
                            for item in items:
                                # Identify artist
                                performers = item.get('performer', [])
                                if isinstance(performers, list) and performers:
                                    # Use performer name, fallback to event name
                                    artist_name = performers[0].get('name') or item.get('name', 'Event')
                                else:
                                    artist_name = item.get('name', 'Event')
                                
                                items_to_process.append((item, artist_name))
                                
                        except Exception as e:
                            print(f"    [Songkick] JSON Load Error on page {page}: {e}")
                
                # Execute in parallel
                with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
                    futures = [executor.submit(self._parse_json_ld, item, artist_name) for item, artist_name in items_to_process]
                    for future in concurrent.futures.as_completed(futures):
                        try:
                            result = future.result()
                            if result:
                                page_events.append(result)
                        except Exception:
                            pass

                if not found_json and page == 1:
                     print("  [Songkick] Warning: No JSON-LD found on page 1.")
                
                if not page_events:
                    print(f"  [Songkick] No events found on page {page}. Stopping.")
                    break
                
                print(f"    -> Found {len(page_events)} events on page {page}.")
                all_events.extend(page_events)



            except Exception as e:
                print(f"Error scraping Songkick metro page {page}: {e}")
                break
        
        return all_events



    def _parse_json_ld(self, item, artist_name):
        try:
            # Extract all performers
            performers = item.get('performer', [])
            if not isinstance(performers, list):
                performers = [performers]
            
            artist_names = [p.get('name') for p in performers if isinstance(p, dict) and p.get('name')]
            if not artist_names:
                # Fallback to main item name if no performers listed (unlikely for well-formed JSON-LD)
                artist_names = [item.get('name', 'Unknown Artist')]

            all_artists_str = ", ".join(artist_names)

            date_str = item.get('startDate')
            if not date_str: return None
            event_date = datetime.fromisoformat(date_str)
            
            venue = item.get('location', {})
            venue_name = venue.get('name', 'Unknown')
            
            address = venue.get('address', {})
            if isinstance(address, dict):
                 loc = f"{address.get('addressLocality')}, {address.get('addressCountry')}"
            else:
                 loc = str(address)

            title = item.get('name', 'Unknown Event')
            
            # 1. Check JSON-LD for tour/superEvent (Fast)
            tour_info = item.get('tour') or item.get('superEvent')
            tour_name = None
            if isinstance(tour_info, dict):
                tour_name = tour_info.get('name')
            
            # 2. If not in JSON, scrape the detail page (Slow but accurate)
            url = item.get('url')

            # Strip UTM parameters
            if url:
                parsed = urllib.parse.urlparse(url)
                qs = urllib.parse.parse_qs(parsed.query)
                qs.pop('utm_medium', None)
                qs.pop('utm_source', None)
                new_query = urllib.parse.urlencode(qs, doseq=True)
                url = urllib.parse.urlunparse(parsed._replace(query=new_query))

            if not tour_name and url:
                 tour_name = self._get_tour_name_from_page(url)

            # Title vs Artist
            if tour_name:
                title = tour_name
                artist_final = all_artists_str
            else:
                # If no tour name, set Title to Artist Names and leave Artist field empty
                title = all_artists_str
                artist_final = ""
            
            # DATE HANDLING: Force JST if naive
            if event_date.tzinfo is None:
                jst = timezone(timedelta(hours=9))
                event_date = event_date.replace(tzinfo=jst)
            
            return Event(
                event=title, 
                performer=artist_final,
                ticket=None,
                venue=venue_name if venue_name != 'Unknown' else 'Unknown venue',
                location=loc,
                date=event_date.date(),
                time=event_date.timetz() if date_str and ('T' in date_str or ' ' in date_str) else None, # Rough check if time existed in input
                url=url
            )
        except Exception as e:
            print(f"Error parsing JSON-LD item: {e}")
            return None

    def _get_tour_name_from_page(self, url: str) -> str:
        """
        Fetch tour name from details.
        """
        try:
            resp = self.session.get(url, headers=self.headers, timeout=10)
            if resp.status_code != 200: return None
            
            soup = BeautifulSoup(resp.content, 'html.parser')
            
            # 1. Direct CSS Selector (Robust)
            tour_name_tag = soup.select_one('.tour_name')
            if tour_name_tag:
                return tour_name_tag.get_text(strip=True)

            # 2. Text-based Fallback
            target = soup.find(string=lambda t: t and "Tour name:" in t)
            if target:
                parent_text = target.parent.get_text(strip=True)
                if "Tour name:" in parent_text:
                     return parent_text.split("Tour name:")[-1].strip()

            return None
        except Exception as e:
            return None



