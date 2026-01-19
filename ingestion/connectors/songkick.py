from typing import List, Optional
import json
from pathlib import Path

import httpx
from datetime import datetime, timezone, timedelta
from .base import BaseConnector, Event
from .registry import register_connector
from bs4 import BeautifulSoup
import urllib.parse
import concurrent.futures
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)


def _load_japan_metros() -> List[str]:
    """Load Japan metro slugs from JSON data file."""
    data_path = Path(__file__).parent.parent / "data" / "japan_metros.json"
    try:
        with open(data_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        print(f"Warning: Could not load japan_metros.json: {e}")
        return []


JAPAN_METROS = _load_japan_metros()


@register_connector
class SongkickConnector(BaseConnector):
    @property
    def source_name(self) -> str:
        return "Songkick"

    def __init__(self, debug: bool = False):
        super().__init__(debug)
        self.base_url = "https://www.songkick.com"

        self.client = httpx.Client(
            timeout=30.0,
            http2=True,
            limits=httpx.Limits(max_keepalive_connections=20, max_connections=20),
        )

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type((httpx.RequestError, httpx.HTTPStatusError)),
        reraise=True,
    )
    def _fetch(self, url: str):
        response = self.client.get(url)
        response.raise_for_status()
        return response

    def get_events(self, query: str = None) -> List[Event]:
        events = []

        sk_metros_slugs = JAPAN_METROS
        if self.debug:
            print("  [Songkick] DEBUG MODE: Limiting to first 2 metros.")
            sk_metros_slugs = sk_metros_slugs[:2]

        print(f"  [Songkick] Fetching {len(sk_metros_slugs)} metros in parallel...")
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
            future_to_metro = {}
            for metro_slug in sk_metros_slugs:
                future = executor.submit(self.get_metro_events, metro_id=metro_slug)
                future_to_metro[future] = metro_slug

            for future in concurrent.futures.as_completed(future_to_metro):
                metro_slug = future_to_metro[future]
                try:
                    metro_events = future.result()
                    events.extend(metro_events)
                except Exception as e:
                    print(f"    -> [Songkick] Failed for {metro_slug}: {e}")
        return events

    def get_metro_events(
        self, metro_id: str = "30717-japan-tokyo", max_pages: int = None
    ) -> List[Event]:
        if self.debug and max_pages is None:
            max_pages = 1
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

                soup = BeautifulSoup(resp.content, "html.parser")

                # Extract JSON-LD
                scripts = soup.find_all("script", type="application/ld+json")
                page_events = []

                found_json = False
                items_to_process = []
                for script in scripts:
                    if "MusicEvent" in script.text:
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
                    futures = [
                        executor.submit(self._parse_json_ld, item)
                        for item in items_to_process
                    ]
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
            organizer = item.get("organizer", {})
            if isinstance(organizer, list):
                organizer = organizer[0] if organizer else {}

            event_name = organizer.get("name")
            # Fallback to main item name if organizer name is missing
            if not event_name:
                event_name = item.get("name")

            performers = item.get("performer", [])

            if not isinstance(performers, list):
                performers = [performers]

            performer_list = [
                p.get("name")
                for p in performers
                if isinstance(p, dict) and p.get("name")
            ]

            date_str = item.get("startDate")

            if not date_str:
                return None

            event_dates = []
            end_date_str = item.get("endDate")

            if end_date_str:
                # We have a range
                try:
                    start_dt = datetime.fromisoformat(date_str)
                    end_dt = datetime.fromisoformat(end_date_str)

                    # Add start date
                    event_dates.append(start_dt.date().isoformat())

                    # If end date is different, add it (or all days in between? Usually just start/end for range representation)
                    # Requirement says "form [start, end] list if range"
                    if end_dt.date() != start_dt.date():
                        event_dates.append(end_dt.date().isoformat())
                except ValueError:
                    # Fallback to just start date string if parsing fails
                    event_dates.append(date_str.split("T")[0])
            else:
                try:
                    start_dt = datetime.fromisoformat(date_str)
                    event_dates.append(start_dt.date().isoformat())
                except ValueError:
                    event_dates.append(date_str.split("T")[0])

            # Parsing for time extraction
            times = []
            try:
                if date_str and ("T" in date_str or " " in date_str):
                    s_dt = datetime.fromisoformat(date_str)
                    times.append(s_dt.timetz())
            except ValueError:
                pass

            if end_date_str:
                try:
                    if "T" in end_date_str or " " in end_date_str:
                        e_dt = datetime.fromisoformat(end_date_str)
                        times.append(e_dt.timetz())
                except ValueError:
                    pass

            venue = item.get("location", {})
            if isinstance(venue, list):
                venue = venue[0] if venue else {}

            venue_name = venue.get("name")

            address = venue.get("address", {})
            locality = address.get("addressLocality")
            country = address.get("addressCountry")

            loc = None
            if locality:
                loc = locality
            elif country:
                loc = country

            image_data = item.get("image")
            image_url = None

            if image_data:
                if isinstance(image_data, list):
                    # Take the first valid image found
                    for img in image_data:
                        if isinstance(img, str):
                            image_url = img
                            break
                        elif isinstance(img, dict):
                            u = img.get("url")
                            if u:
                                image_url = u
                                break
                elif isinstance(image_data, dict):
                    image_url = image_data.get("url")
                elif isinstance(image_data, str):
                    image_url = image_data

            url = item.get("url")

            if url:
                parsed = urllib.parse.urlparse(url)
                qs = urllib.parse.parse_qs(parsed.query)
                qs.pop("utm_medium", None)
                qs.pop("utm_source", None)
                new_query = urllib.parse.urlencode(qs, doseq=True)
                url = urllib.parse.urlunparse(parsed._replace(query=new_query))

            # DATE HANDLING: Removed local TZ forcing as per plan
            # if event_date and event_date.tzinfo is None:
            #     jst = timezone(timedelta(hours=9))
            #     event_date = event_date.replace(tzinfo=jst)

            return Event(
                event=event_name,
                performer=performer_list,
                ticket=None,
                venue=venue_name,
                location=loc,
                date=event_dates,
                time=times if times else None,
                url=url,
                image=image_url if image_url else None,
                metadata={"country": country} if country else None,
            )
        except Exception as e:
            print(f"Error parsing JSON-LD item: {e}")
            return None
