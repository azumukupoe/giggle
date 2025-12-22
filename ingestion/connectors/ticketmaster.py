import requests
from typing import List
from datetime import datetime
from .base import BaseConnector, Event
import os

class TicketmasterConnector(BaseConnector):
    def __init__(self, api_key: str = None):
        super().__init__()
        self.api_key = api_key or os.environ.get("TICKETMASTER_API_KEY")
        self.base_url = "https://app.ticketmaster.com/discovery/v2"

    def get_events(self, country_code: str = "JP", limit: int = 100) -> List[Event]:
        """
        Fetches 'Discovery' events for a whole country, not specific to an artist.
        """
        if not self.api_key:
            print("Ticketmaster API Key missing.")
            return []

        events_data = []

        # 1. Broad Search: Japan
        print(f"  [Ticketmaster] Broad search: countryCode={country_code}")
        url = f"{self.base_url}/events.json?classificationName=music&countryCode={country_code}&size={limit}&sort=date,asc&apikey={self.api_key}"
        try:
            resp = requests.get(url)
            if resp.status_code == 200:
                data = resp.json()
                if '_embedded' in data:
                   events_data.extend(data['_embedded'].get('events', []))
        except Exception as e:
            print(f"  [Ticketmaster] Country search error: {e}")

        # 2. Fallback: Specific City Search if Country search yields low results
        if len(events_data) < 5:
            cities = ["Tokyo", "Osaka", "Nagoya", "Kyoto", "Sapporo", "Fukuoka", "Yokohama"]
            print(f"  [Ticketmaster] Low results ({len(events_data)}). Retrying with specific cities: {cities}")
            
            for city in cities:
                url = f"{self.base_url}/events.json?classificationName=music&city={city}&size={limit}&apikey={self.api_key}&sort=date,asc"
                print(f"    Searching {city}...")
                try:
                    resp = requests.get(url)
                    if resp.status_code == 200:
                        data = resp.json()
                        if '_embedded' in data:
                            city_events = data['_embedded'].get('events', [])
                            print(f"    -> Found {len(city_events)} events in {city}")
                            # Deduplicate by ID
                            existing_ids = {e['id'] for e in events_data}
                            for ce in city_events:
                                if ce['id'] not in existing_ids:
                                    events_data.append(ce)
                                    existing_ids.add(ce['id'])
                except Exception as e:
                   print(f"    Search failed for {city}: {e}")

        print(f"  [Ticketmaster] Total raw event count: {len(events_data)}")
        
        events = []
        for item in events_data:
            # Ticketmaster dates
            start = item.get('dates', {}).get('start', {})
            date_str = f"{start.get('localDate')}T{start.get('localTime', '00:00:00')}"
            try:
                event_date = datetime.fromisoformat(date_str)
            except:
                continue 

            venue_info = item.get('_embedded', {}).get('venues', [{}])[0]
            city = venue_info.get('city', {}).get('name', 'Unknown City')
            country = venue_info.get('country', {}).get('name', 'Unknown Country')
            location = f"{city}, {country}"
            
            # Filter artists
            # Ticketmaster returns a list of attractions. We'll grab the first one as the 'primary' artist.
            attractions = item.get('_embedded', {}).get('attractions', [])
            artist_name = attractions[0]['name'] if attractions else item.get('name')

            images = item.get('images', [])
            image_url = images[0]['url'] if images else None

            event = Event(
                title=item.get('name'),
                artist=artist_name,
                venue=venue_info.get('name', 'Unknown Venue'),
                location=location,
                date=event_date,
                url=item.get('url'),
                image_url=image_url,
                source="ticketmaster",
                external_id=item.get('id')
            )
            events.append(event)
        return events

    def get_artist_events(self, artist_name: str) -> List[Event]:
        if not self.api_key:
            print("Ticketmaster API Key missing.")
            return []

        url = f"{self.base_url}/events.json?keyword={artist_name}&apikey={self.api_key}&classificationName=music&countryCode=JP"
        
        try:
            resp = requests.get(url)
            resp.raise_for_status()
            data = resp.json()
            
            if '_embedded' not in data:
                return []

            events = []
            for item in data['_embedded'].get('events', []):
                # Ticketmaster dates
                start = item.get('dates', {}).get('start', {})
                date_str = f"{start.get('localDate')}T{start.get('localTime', '00:00:00')}"
                try:
                    event_date = datetime.fromisoformat(date_str)
                except:
                    continue # Skip if date is weird

                venue_info = item.get('_embedded', {}).get('venues', [{}])[0]
                location = f"{venue_info.get('city', {}).get('name')}, {venue_info.get('country', {}).get('name')}"
                
                images = item.get('images', [])
                image_url = images[0]['url'] if images else None

                event = Event(
                    title=item.get('name'),
                    artist=artist_name,
                    venue=venue_info.get('name', 'Unknown Venue'),
                    location=location,
                    date=event_date,
                    url=item.get('url'),
                    image_url=image_url,
                    source="ticketmaster",
                    external_id=item.get('id')
                )
                events.append(event)
            return events

        except Exception as e:
            print(f"Error fetching from Ticketmaster: {e}")
            return []
