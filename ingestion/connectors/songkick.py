import requests
from typing import List
from datetime import datetime
from .base import BaseConnector, Event
from bs4 import BeautifulSoup
import urllib.parse

class SongkickConnector(BaseConnector):
    def __init__(self):
        super().__init__()
        self.base_url = "https://www.songkick.com"
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }

    def get_events(self, query: str = None) -> List[Event]:
        return []

    def get_artist_events(self, artist_name: str) -> List[Event]:
        # Songkick scraping is 2-step: Search -> User Page -> Calendar
        # Step 1: Search
        search_url = f"{self.base_url}/search?query={urllib.parse.quote(artist_name)}&type=artists"
        try:
            s_resp = requests.get(search_url, headers=self.headers)
            s_soup = BeautifulSoup(s_resp.content, 'html.parser')
            
            # Find first result
            # Selectors need to be robust. Usually <li class="artist"> <a href="...">
            result_link = s_soup.select_one('.artist-results .artist h4 a')
            if not result_link:
                print(f"Artist not found on Songkick: {artist_name}")
                return []
            
            artist_url = f"{self.base_url}{result_link['href']}/calendar"
            
            # Step 2: Get Calendar
            c_resp = requests.get(artist_url, headers=self.headers)
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

            return Event(
                title=item.get('name'),
                artist=artist_name,
                venue=venue_name,
                location=loc,
                date=event_date,
                url=item.get('url'),
                image_url=item.get('image'),
                source='songkick',
                external_id=item.get('url')
            )
        except:
            return None
