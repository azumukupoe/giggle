from typing import List, Optional, Set
import requests
from bs4 import BeautifulSoup
from datetime import datetime, timezone, timedelta, date
import unicodedata
import re
import urllib.parse
import concurrent.futures
import time
import random
from .base import BaseConnector, Event

class PiaConnector(BaseConnector):
    def __init__(self):
        super().__init__()
        self.base_url = "https://t.pia.jp/pia/rlsInfo.do"
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }

    def get_events(self, query: str = None) -> List[Event]:
        all_events = []
        
        # Concurrent fetching for prefectures 01-47
        prefecture_codes = [f"{i:02d}" for i in range(1, 48)]
        
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
            future_to_code = {
                executor.submit(self._fetch_prefecture_events, pf_code): pf_code 
                for pf_code in prefecture_codes
            }
            
            for future in concurrent.futures.as_completed(future_to_code):
                pf_code = future_to_code[future]
                try:
                    events = future.result()
                    all_events.extend(events)
                    print(f"  [Pia] Finished prefecture {pf_code}: {len(events)} events.")
                except Exception as e:
                    print(f"  [Pia] Error fetching prefecture {pf_code}: {e}")

        return all_events

    def _fetch_prefecture_events(self, pf_code: str) -> List[Event]:
        pf_events = []
        page = 1
        processed_urls: Set[str] = set()
        
        # Base query parameters as requested
        # https://t.pia.jp/pia/rlsInfo.do?pf=13&lg=01&page=1&dispMode=1
        params = {
            "pf": pf_code,
            "lg": "01",      # Genre: Music
            "dispMode": "1", # Required for the new format
            "page": page
        }

        print(f"  [Pia] Starting prefecture {pf_code}...")

        while True:
            params["page"] = page

            try:
                # Random sleep to be polite
                time.sleep(random.uniform(1.0, 3.0))

                resp = requests.get(self.base_url, headers=self.headers, params=params, timeout=15)
                if resp.status_code != 200:
                    print(f"    [Pia] Prefecture {pf_code} page {page} failed. Status: {resp.status_code}")
                    break

                soup = BeautifulSoup(resp.content, 'html.parser')
                event_bundles = soup.select('#contents_html > ul > li')

                if not event_bundles:
                    # No events found means we reached the end
                    break

                page_events = []
                for bundle in event_bundles:
                    # Title from h3 > a
                    title_tag = bundle.select_one('h3 > a')
                    title = self._normalize_text(title_tag.get_text()) if title_tag else "Unknown"
                    if title == "Unknown":
                        continue

                    # Sub-events in the bundle
                    sub_items = bundle.select('ul > li')
                    for sub in sub_items:
                        try:
                            # URL Extraction & Validation
                            link_tag = sub.select_one('.PC-detaillink-button a')
                            if not link_tag or 'href' not in link_tag.attrs:
                                continue
                            
                            url = link_tag['href']
                            # Ensure absolute URL
                            if url.startswith('/'):
                                url = f"http://ticket.pia.jp{url}"
                            
                            # Only standard ticket info pages
                            if 'ticketInformation.do' not in url:
                                continue

                            # Deduplication
                            if url in processed_urls:
                                continue
                            processed_urls.add(url)

                            # Date Parsing
                            period_div = sub.select_one('.PC-perfinfo-period')
                            date_str = period_div.get_text() if period_div else ""
                            event_date = self._parse_date(date_str)
                            if not event_date:
                                continue

                            # Venue Parsing
                            venue_div = sub.select_one('.PC-perfinfo-venue')
                            raw_venue = self._normalize_text(venue_div.get_text()) if venue_div else "Unknown"
                            
                            venue = raw_venue
                            location = "" # Default to empty
                            
                            # 1. Check for (Location) pattern at the end
                            loc_match = re.search(r'\(([^)]+)\)$', raw_venue)
                            if loc_match:
                                location = loc_match.group(1)
                                venue = raw_venue[:loc_match.start()].strip()
                            else:
                                # 2. Check if the string is a location list
                                # Split by full-width or half-width slash
                                parts = re.split(r'[／/]', raw_venue)
                                # Check if ALL parts end with 都, 道, 府, or 県
                                is_location_list = all(
                                    part.strip().endswith(('都', '道', '府', '県')) 
                                    for part in parts 
                                    if part.strip()
                                )
                                
                                if is_location_list:
                                    venue = ""
                                    location = raw_venue
                                # Else: strictly use raw_venue as venue, location empty

                            # Ticket Name Parsing
                            ticket_name_h4 = sub.select_one('.PC-perfinfo-title')
                            ticket_name = ""
                            if ticket_name_h4:
                                # Remove mark tag content if needed, or just get all text. 
                                # Based on user snippet, the mark has a span inside.
                                # Let's try to get text node directly or just strip.
                                # For now, simple get_text() should work but might include extra chars. 
                                # Use strip() to clean up.
                                ticket_name = self._normalize_text(ticket_name_h4.get_text())

                            # Create Event
                            event = Event(
                                event=title,
                                performer="",  # Explicitly blank
                                ticket=ticket_name,
                                venue=venue,
                                location=location,
                                date=event_date,
                                time=None,
                                url=url
                            )
                            page_events.append(event)
                            pf_events.append(event)

                        except Exception as e:
                            print(f"      [Pia] Error parsing event in prefecture {pf_code}: {e}")
                            continue

                if not page_events:
                    # Page loaded but no valid events extracted, break
                    break

                page += 1

            except Exception as e:
                print(f"    [Pia] Error scraping prefecture {pf_code} page {page}: {e}")
                break
        
        return pf_events

    def get_artist_events(self, artist_name: str) -> List[Event]:
        # Not implementing specific artist search for now as the main requirement changed 
        # to generic list scraping, but keeping interface compliant.
        return []

    def _normalize_text(self, text: str) -> str:
        if not text:
            return ""
        # NFKC normalizes full-width to half-width (e.g. Ｚｅｐｐ -> Zepp)
        return unicodedata.normalize('NFKC', text).strip()

    def _parse_date(self, date_str: str) -> Optional[date]:
        if not date_str:
            return None
        
        # Remove day of week (e.g., (土))
        cleaned_date = re.sub(r'\([^\)]+\)', '', date_str)
        
        # Handle ranges: keep start date
        # "2026/7/25 ～ 2026/8/23" -> "2026/7/25 "
        if '～' in cleaned_date:
            cleaned_date = cleaned_date.split('～')[0].strip()
            
        try:
            dt = datetime.strptime(cleaned_date.strip(), '%Y/%m/%d')
            # Pia usually doesn't give time here, so just return date
            return dt.date()
        except ValueError:
            return None
