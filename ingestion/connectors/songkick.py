from typing import List, Optional
import httpx
from datetime import datetime, timezone, timedelta
from .base import BaseConnector, Event, CONSTANTS
from bs4 import BeautifulSoup
import urllib.parse
import json
import concurrent.futures
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

class SongkickConnector(BaseConnector):
    def __init__(self):
        super().__init__()
        self.base_url = "https://www.songkick.com"
        self.headers = {
            "User-Agent": CONSTANTS.USER_AGENT
        }
        
        self.client = httpx.Client(
            timeout=30.0, 
            headers=self.headers,
            http2=True,
            limits=httpx.Limits(max_keepalive_connections=20, max_connections=20)
        )
    
    def __del__(self):
        try:
            self.client.close()
        except:
            pass

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type((httpx.RequestError, httpx.HTTPStatusError)),
        reraise=True
    )
    def _fetch(self, url: str):
        response = self.client.get(url)
        response.raise_for_status()
        return response

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
                resp = self._fetch(url)
                
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
                                items_to_process.append(item)
                                
                        except Exception as e:
                            print(f"    [Songkick] JSON Load Error on page {page}: {e}")
                
                # Execute parsing in threads (CPU bound-ish), but fetch was sync
                with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
                    futures = [executor.submit(self._parse_json_ld, item) for item in items_to_process]
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

    def _parse_json_ld(self, item):
        try:
            # Organizer Name -> Event
            organizer = item.get('organizer', {})
            event_name = organizer.get('name')
            # Fallback to main item name if organizer name is missing
            if not event_name:
                event_name = item.get('name', 'Unknown Event')

            # Performer Names -> Performer
            performers = item.get('performer', [])
            if not isinstance(performers, list):
                performers = [performers]
            
            performer_names = [p.get('name') for p in performers if isinstance(p, dict) and p.get('name')]
            performer_str = ", ".join(performer_names)

            # StartDate -> Date & Time
            date_str = item.get('startDate')
            if not date_str: return None
            event_date = datetime.fromisoformat(date_str)
            
            # Location Name -> Venue
            venue = item.get('location', {})
            venue_name = venue.get('name', 'Unknown Venue')
            
            # AddressLocality -> Location
            address = venue.get('address', {})
            if isinstance(address, dict):
                 loc = address.get('addressLocality', '')
            else:
                 loc = str(address)

            # Image
            image = item.get('image')
            image_url = None
            if image:
                if isinstance(image, list):
                    # Filter and extract URLs
                    urls = []
                    for img in image:
                        if isinstance(img, str):
                            urls.append(img)
                        elif isinstance(img, dict):
                            u = img.get('url')
                            if u: urls.append(u)
                    if urls:
                        image_url = ",".join(urls)
                elif isinstance(image, dict):
                    image_url = image.get('url')
                elif isinstance(image, str):
                    image_url = image

            # URL Handling
            url = item.get('url')
            if url:
                parsed = urllib.parse.urlparse(url)
                qs = urllib.parse.parse_qs(parsed.query)
                qs.pop('utm_medium', None)
                qs.pop('utm_source', None)
                new_query = urllib.parse.urlencode(qs, doseq=True)
                url = urllib.parse.urlunparse(parsed._replace(query=new_query))
            
            # DATE HANDLING: Force JST if naive
            if event_date.tzinfo is None:
                jst = timezone(timedelta(hours=9))
                event_date = event_date.replace(tzinfo=jst)
            
            return Event(
                event=event_name, 
                performer=performer_str,
                ticket=None,
                venue=venue_name,
                location=loc,
                date=event_date.date(),
                time=event_date.timetz() if date_str and ('T' in date_str or ' ' in date_str) else None,
                url=url,
                image=image_url
            )
        except Exception as e:
            print(f"Error parsing JSON-LD item: {e}")
            return None
