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

    PREFECTURES = {
        "01": "Hokkaido", "02": "Aomori", "03": "Iwate", "04": "Miyagi", "05": "Akita",
        "06": "Yamagata", "07": "Fukushima", "08": "Ibaraki", "09": "Tochigi", "10": "Gunma",
        "11": "Saitama", "12": "Chiba", "13": "Tokyo", "14": "Kanagawa", "15": "Niigata",
        "16": "Toyama", "17": "Ishikawa", "18": "Fukui", "19": "Yamanashi", "20": "Nagano",
        "21": "Gifu", "22": "Shizuoka", "23": "Aichi", "24": "Mie", "25": "Shiga",
        "26": "Kyoto", "27": "Osaka", "28": "Hyogo", "29": "Nara", "30": "Wakayama",
        "31": "Tottori", "32": "Shimane", "33": "Okayama", "34": "Hiroshima", "35": "Yamaguchi",
        "36": "Tokushima", "37": "Kagawa", "38": "Ehime", "39": "Kochi", "40": "Fukuoka",
        "41": "Saga", "42": "Nagasaki", "43": "Kumamoto", "44": "Oita", "45": "Miyazaki",
        "46": "Kagoshima", "47": "Okinawa"
    }

    def get_events(self, query: str = None) -> List[Event]:
        all_events = []
        
        # Concurrent fetching
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
            future_to_pf = {
                executor.submit(self._fetch_prefecture_events, pf_code, pf_name): pf_name 
                for pf_code, pf_name in self.PREFECTURES.items()
            }
            
            for future in concurrent.futures.as_completed(future_to_pf):
                pf_name = future_to_pf[future]
                try:
                    events = future.result()
                    all_events.extend(events)
                    print(f"  [Pia] Finished {pf_name}: {len(events)} events.")
                except Exception as e:
                    print(f"  [Pia] Error fetching {pf_name}: {e}")

        return all_events

    def _fetch_prefecture_events(self, pf_code: str, pf_name: str) -> List[Event]:
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

        print(f"  [Pia] Starting {pf_name} (pf={pf_code})...")

        while True:
            params["page"] = page
            # print(f"    [Pia] {pf_name} page {page}...")

            try:
                # Random sleep to be polite
                time.sleep(random.uniform(1.0, 3.0))

                resp = requests.get(self.base_url, headers=self.headers, params=params, timeout=15)
                if resp.status_code != 200:
                    print(f"    [Pia] {pf_name} page {page} failed. Status: {resp.status_code}")
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
                            
                            # Extract location from venue if present "Venue (Location)"
                            # e.g. "日本工学院アリーナ(東京都)" -> title="日本工学院アリーナ", location="東京都"
                            venue = raw_venue
                            location = pf_name # Default fallback
                            
                            loc_match = re.search(r'\(([^)]+)\)$', raw_venue)
                            if loc_match:
                                location = loc_match.group(1)
                                venue = raw_venue[:loc_match.start()].strip()

                            # Create Event
                            event = Event(
                                title=title,
                                artist="",  # Explicitly blank
                                venue=venue,
                                location=location,
                                date=event_date,
                                time=None,
                                url=url
                            )
                            page_events.append(event)
                            pf_events.append(event)

                        except Exception as e:
                            print(f"      [Pia] Error parsing event in {pf_name}: {e}")
                            continue

                if not page_events:
                    # Page loaded but no valid events extracted, break
                    break

                page += 1

            except Exception as e:
                print(f"    [Pia] Error scraping {pf_name} page {page}: {e}")
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
