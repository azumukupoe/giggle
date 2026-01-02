from typing import List, Optional, Set
import requests
from bs4 import BeautifulSoup
from datetime import datetime, timezone, timedelta

import re
import urllib.parse
import concurrent.futures
import time
import random
from .base import BaseConnector, Event, CONSTANTS

class PiaConnector(BaseConnector):
    def __init__(self):
        super().__init__()
        self.base_url = "https://t.pia.jp/pia/rlsInfo.do"
        self.headers = {
            "User-Agent": CONSTANTS.USER_AGENT
        }

    def get_events(self, query: str = None) -> List[Event]:
        all_events = []
        
        # Concurrent fetch for prefectures
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
        
        # Base query parameters
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
                # Random sleep
                time.sleep(random.uniform(1.0, 3.0))

                resp = requests.get(self.base_url, headers=self.headers, params=params, timeout=15)
                if resp.status_code != 200:
                    print(f"    [Pia] Prefecture {pf_code} page {page} failed. Status: {resp.status_code}")
                    break

                soup = BeautifulSoup(resp.content, 'html.parser')
                event_bundles = soup.select('#contents_html > ul > li')

                if not event_bundles:
                    # No events found
                    break

                page_events = []
                for bundle in event_bundles:
                    # Title from h3 > a
                    title_tag = bundle.select_one('h3 > a')
                    title = title_tag.get_text().strip() if title_tag else "Unknown"
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
                                url = f"https://ticket.pia.jp{url}"
                            elif url.startswith('http://'):
                                url = url.replace('http://', 'https://', 1)
                            
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
                            raw_venue = venue_div.get_text().strip() if venue_div else "Unknown"
                            
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
                                ticket_name = ticket_name_h4.get_text().strip()

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





    def _parse_date(self, date_str: str) -> Optional[str]:
        if not date_str:
            return None
        
        # 1. Remove anything in parentheses (e.g. (月・祝), (土))
        #    Use regex to remove (...) blocks
        cleaned_str = re.sub(r'\(.*?\)', '', date_str)

        # 2. Split by range separator
        #    Pia often uses full-width tilde '～' or half-width '~'
        parts = re.split(r'[～~]', cleaned_str)

        parsed_dates = []
        for part in parts:
            part = part.strip()
            if not part:
                continue
            
            # 3. Parse generic date "YYYY/M/D" -> "YYYY-MM-DD"
            try:
                # Assuming format like 2026/5/4
                dt = datetime.strptime(part, "%Y/%m/%d")
                parsed_dates.append(dt.strftime("%Y-%m-%d"))
            except ValueError:
                pass
        
        if not parsed_dates:
            return None
            
        # 4. Return space-separated
        return " ".join(parsed_dates)
