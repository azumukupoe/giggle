import requests
from typing import List
from datetime import datetime
from .base import BaseConnector, Event
from bs4 import BeautifulSoup
import urllib.parse
import json
import concurrent.futures


class SongkickConnector(BaseConnector):
    def __init__(self):
        super().__init__()
        self.base_url = "https://www.songkick.com"
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }
        
        # Setup session with retry
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
        Fetches events for a specific metro area (e.g., Tokyo).
        Iterates through pages until max_pages or no events found.
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
                # print(f"  [Songkick] Status: {resp.status_code}")
                
                if resp.status_code != 200:
                    print(f"  [Songkick] Failed to fetch page {page}. Status: {resp.status_code}")
                    break
                
                soup = BeautifulSoup(resp.content, 'html.parser')
                
                # JSON-LD extraction
                scripts = soup.find_all('script', type='application/ld+json')
                page_events = []
                
                found_json = False
                # Prepare list of items to process concurrently
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
                    futures = [executor.submit(self._process_single_item, item, artist_name) for item, artist_name in items_to_process]
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


                # Optional: Check for "Next" button specifically?
                # Usually if 0 events returned we are done.
                
            except Exception as e:
                print(f"Error scraping Songkick metro page {page}: {e}")
                break
        
        return all_events

    def get_artist_events(self, artist_name: str) -> List[Event]:
        # Songkick scraping is 2-step: Search -> User Page -> Calendar
        # Step 1: Search
        search_url = f"{self.base_url}/search?query={urllib.parse.quote(artist_name)}&type=artists"
        try:
            s_resp = self.session.get(search_url, headers=self.headers)
            s_soup = BeautifulSoup(s_resp.content, 'html.parser')
            
            # Find first result
            # Selectors need to be robust. Usually <li class="artist"> <a href="...">
            result_link = s_soup.select_one('.artist-results .artist h4 a')
            if not result_link:
                print(f"Artist not found on Songkick: {artist_name}")
                return []
            
            artist_url = f"{self.base_url}{result_link['href']}/calendar"
            
            # Step 2: Get Calendar
            c_resp = self.session.get(artist_url, headers=self.headers)
            c_soup = BeautifulSoup(c_resp.content, 'html.parser')
            
            events = []
            # Songkick also uses JSON-LD often!
            scripts = c_soup.find_all('script', type='application/ld+json')
            for script in scripts:
                if 'MusicEvent' in script.text:
                    try:
                        data = json.loads(script.text)
                        items = data if isinstance(data, list) else [data]
                        for item in items:
                             if item.get('@type') == 'MusicEvent':
                                evt = self._parse_json_ld(item, artist_name)
                                if evt: events.append(evt)
                    except:
                        continue
            
            return events

        except Exception as e:
            print(f"Error scraping Songkick: {e}")
            return []

    def _parse_json_ld(self, item, artist_name):
        # Same logic as BIT essentially, standard Schema.org
        try:
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
            if not tour_name and url:
                 tour_name = self._get_tour_name_from_page(url)

            # Prioritize Tour Name as the main title if found
            if tour_name:
                title = tour_name
            
            return Event(
                title=title, 
                artist=artist_name,
                venue=venue_name,
                location=loc,
                date=event_date,
                url=item.get('url')
            )
        except Exception as e:
            print(f"Error parsing JSON-LD item: {e}")
            return None

    def _get_tour_name_from_page(self, url: str) -> str:
        """
        Fetches the event detail page and looks for 'Tour name' in Additional Details.
        Returns the tour name string or None.
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
            # print(f"    [Songkick] Detail scrape failed: {e}")
            return None

    def _process_single_item(self, item, artist_name):
        return self._parse_json_ld(item, artist_name)

