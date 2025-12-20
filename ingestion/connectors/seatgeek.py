import requests
import json
from typing import List
from datetime import datetime
from .base import BaseConnector, Event
from bs4 import BeautifulSoup
import urllib.parse

class SeatGeekConnector(BaseConnector):
    def __init__(self):
        super().__init__()
        self.base_url = "https://seatgeek.com"
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }

    def get_events(self, query: str = None) -> List[Event]:
        return []

    def get_artist_events(self, artist_name: str) -> List[Event]:
        # URL pattern: https://seatgeek.com/artist-slug-tickets
        slug = urllib.parse.quote(artist_name.lower().replace(" ", "-"))
        url = f"{self.base_url}/{slug}-tickets"
        
        try:
            resp = requests.get(url, headers=self.headers)
            if resp.status_code == 404:
                return []
            
            soup = BeautifulSoup(resp.content, 'html.parser')
            events = []
            
            # SeatGeek usually puts data in JSON-LD
            scripts = soup.find_all('script', type='application/ld+json')
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
                        pass
            return events

        except Exception as e:
            print(f"Error scraping SeatGeek: {e}")
            return []

    def _parse_json_ld(self, item, artist_name):
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
                source='seatgeek',
                external_id=item.get('url')
            )
        except:
            return None
