from typing import List, Optional, Set
import httpx
from bs4 import BeautifulSoup
from datetime import datetime
import re
import concurrent.futures
import random
import time
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)
from .base import BaseConnector, Event
from .registry import register_connector


@register_connector
class PiaConnector(BaseConnector):
    @property
    def source_name(self) -> str:
        return "Pia"

    def __init__(self, debug: bool = False):
        super().__init__(debug)
        self.base_url = "https://t.pia.jp/pia/rlsInfo.do"
        self.client = httpx.Client(timeout=15.0, http2=True)

    def __del__(self):
        try:
            self.client.close()
        except Exception:
            pass

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=5),
        retry=retry_if_exception_type((httpx.RequestError, httpx.HTTPStatusError)),
        reraise=True,
    )
    def _fetch(self, params: dict):
        response = self.client.get(self.base_url, params=params)
        response.raise_for_status()
        return response

    def get_events(self, query: str = None) -> List[Event]:
        all_events = []

        # Concurrent fetch for prefectures
        prefecture_codes = [f"{i:02d}" for i in range(1, 48)]
        if self.debug:
            print("  [Pia] DEBUG MODE: Limiting to first 1 prefecture.")
            prefecture_codes = prefecture_codes[:1]

        # We can still use threads for high-level concurrency, or rewrite to async.
        # For minimal change, we stick to threads with httpx sync client.
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
                    print(
                        f"  [Pia] Finished prefecture {pf_code}: {len(events)} events."
                    )
                except Exception as e:
                    print(f"  [Pia] Error fetching prefecture {pf_code}: {e}")

        return all_events

    def _fetch_prefecture_events(self, pf_code: str) -> List[Event]:
        pf_events = []
        page = 1
        processed_urls: Set[str] = set()

        params = {
            "pf": pf_code,
            "lg": "01",  # Genre: Music
            "dispMode": "1",  # Required for the new format
            "page": page,
        }

        print(f"  [Pia] Starting prefecture {pf_code}...")

        while True:
            if self.debug and page > 1:
                break
            params["page"] = page

            try:
                # Random sleep
                time.sleep(random.uniform(1.0, 3.0))

                resp = self._fetch(params)

                soup = BeautifulSoup(resp.content, "html.parser", from_encoding="utf-8")
                event_bundles = soup.select("#contents_html > ul > li")

                if not event_bundles:
                    break

                events_found_on_page = 0
                for bundle in event_bundles:
                    # Title from h3 > a
                    title_tag = bundle.select_one("h3 > a")
                    title = title_tag.get_text().strip() if title_tag else None
                    if not title:
                        continue

                    sub_items = bundle.select("ul > li")

                    for sub in sub_items:
                        try:
                            link_tag = sub.select_one(".PC-detaillink-button a")

                            if not link_tag or "href" not in link_tag.attrs:
                                continue

                            url = link_tag["href"]
                            if url.startswith("/"):
                                url = f"https://ticket.pia.jp{url}"
                            elif url.startswith("http://"):
                                url = url.replace("http://", "https://", 1)

                            if "ticketInformation.do" not in url:
                                continue

                            if url in processed_urls:
                                continue
                            processed_urls.add(url)

                            period_div = sub.select_one(".PC-perfinfo-period")

                            date_str = period_div.get_text() if period_div else ""
                            event_date = self._parse_date(date_str)
                            if not event_date:
                                continue

                            venue_div = sub.select_one(".PC-perfinfo-venue")

                            raw_venue = (
                                venue_div.get_text().strip() if venue_div else None
                            )

                            venue = raw_venue
                            location = None  # Default to empty

                            # 1. Check for (Location) pattern at the end
                            loc_match = (
                                re.search(r"\(([^)]+)\)$", raw_venue)
                                if raw_venue
                                else None
                            )
                            if loc_match:
                                location = loc_match.group(1)
                                venue = raw_venue[: loc_match.start()].strip()
                            else:
                                # 2. Check if the string is a location list
                                # Split by full-width or half-width slash
                                parts = re.split(r"[／/]", raw_venue)
                                # Check if ALL parts end with 都, 道, 府, or 県
                                is_location_list = all(
                                    part.strip().endswith(("都", "道", "府", "県"))
                                    for part in parts
                                    if part.strip()
                                )

                                if is_location_list:
                                    venue = None
                                    location = [p.strip() for p in parts if p.strip()]
                                # Else: strictly use raw_venue as venue, location empty

                            ticket_name_h4 = sub.select_one(".PC-perfinfo-title")
                            ticket_name = None
                            if ticket_name_h4:
                                ticket_name = ticket_name_h4.get_text().strip()

                            event = Event(
                                event=title,
                                performer=None,  # Explicitly blank
                                ticket=ticket_name,
                                venue=venue,
                                location=location,
                                date=event_date,
                                time=None,
                                url=url,
                            )
                            pf_events.append(event)
                            events_found_on_page += 1

                        except Exception as e:
                            print(
                                f"      [Pia] Error parsing event in prefecture {pf_code}: {e}"
                            )
                            continue

                if events_found_on_page == 0:
                    # Page loaded but no valid events extracted, break
                    break

                page += 1

            except Exception as e:
                print(f"    [Pia] Error scraping prefecture {pf_code} page {page}: {e}")
                break

        return pf_events

    def _parse_date(self, date_str: str) -> Optional[List[str]]:
        if not date_str:
            return None

        cleaned_str = re.sub(r"\(.*?\)", "", date_str)
        # Handle ranges '～' or just multiple dates if any separator
        parts = re.split(r"[～~]", cleaned_str)

        parsed_dates = []
        for part in parts:
            part = part.strip()
            if not part:
                continue

            # Parse generic date "YYYY/M/D" -> "YYYY-MM-DD"
            try:
                # Assuming format like 2026/5/4
                dt = datetime.strptime(part, "%Y/%m/%d")
                parsed_dates.append(dt.strftime("%Y-%m-%d"))
            except ValueError:
                pass

        if not parsed_dates:
            return None

        return parsed_dates
