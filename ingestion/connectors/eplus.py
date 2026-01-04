import asyncio
import httpx
from datetime import datetime, timedelta, timezone, date
from typing import List, Optional, Tuple, Set
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type, before_sleep_log
import logging
from .base import BaseConnector, Event, CONSTANTS

logger = logging.getLogger(__name__)

class EplusConnector(BaseConnector):
    def __init__(self):
        super().__init__()

        self.api_url = "https://api.eplus.jp/v3/koen"
        self.headers = {
            'User-Agent': CONSTANTS.USER_AGENT,
            'Accept-Language': 'ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7',
            'X-APIToken': 'FGXySj3mTd' # Static token
        }
        # httpx limits
        self.limits = httpx.Limits(max_keepalive_connections=40, max_connections=40)
        self.timeout = httpx.Timeout(30.0)


    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type((httpx.RequestError, httpx.HTTPStatusError)),
        reraise=True
    )
    async def _fetch(self, client: httpx.AsyncClient, params: dict):
        response = await client.get(self.api_url, headers=self.headers, params=params)
        response.raise_for_status()
        return response.json()

    async def _get_all_ids_async(self, client: httpx.AsyncClient, genre_code: str) -> Set[Tuple[str, str]]:
        """
        Fetch all ID tuples for genre.
        """
        print(f"  [eplus] Fetching exclusion list for genre {genre_code}...")
        items_per_page = 200
        params = {
            "shutoku_kensu": 1,
            "shutoku_start_ichi": 1,
            "parent_genre_code_list": genre_code,
            "streaming_haishin_kubun_list": "0",
            "sort_key": "koenbi,kaien_time,parent_koen_taisho_flag,kogyo_code,kogyo_sub_code"
        }

        try:
            data = await self._fetch(client, params)
            if not data:
                return set()
                
            total_count = data['data'].get('so_kensu', 0)
            print(f"  [eplus] Genre {genre_code} has {total_count} items. Fetching all...")
            
            ids = set()
            tasks = []
            
            for start_index in range(1, total_count + 1, items_per_page):
                p = params.copy()
                p['shutoku_kensu'] = items_per_page
                p['shutoku_start_ichi'] = start_index
                tasks.append(self._fetch(client, p))
                
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            for d in results:
                if isinstance(d, Exception):
                    continue
                if d and d.get('data') and d['data'].get('record_list'):
                    for item in d['data']['record_list']:
                        k_code = item.get('kogyo_code')
                        k_sub = item.get('kogyo_sub_code')
                        if k_code and k_sub:
                            ids.add((str(k_code), str(k_sub)))
                            
            print(f"  [eplus] Fetched {len(ids)} unique exclusion IDs for genre {genre_code} out of {total_count} total items reported.")
            return ids
        except Exception as e:
            print(f"  [eplus] Error fetching exclusions: {e}")
            return set()

    def _process_item_sync(self, item: dict, dt_now: datetime, excluded_ids: Set[Tuple[str, str]]) -> Optional[Event]:
        """Sync processing"""
        try:
            k_code = item.get('kogyo_code')
            k_sub = item.get('kogyo_sub_code')
            if k_code and k_sub:
                if (str(k_code), str(k_sub)) in excluded_ids:
                    return None

            kogyo = item.get('kanren_kogyo_sub', {})
            title_1 = kogyo.get('kogyo_name_1')
            title_2 = kogyo.get('kogyo_name_2')
            title = f"{title_1}||{title_2}" if title_2 else (title_1 or "Unknown Event")
            
            venue_info = item.get('kanren_venue', {})
            venue_name = venue_info.get('venue_name') or "Unknown Venue"
            
            detail_path = item.get('koen_detail_url_pc')
            link = detail_path if detail_path else None
            if link and not link.startswith("http"):
                    link = f"https://eplus.jp{detail_path}"

            koenbi_term = item.get('koenbi_term', '')
            date_obj = dt_now 
            valid_dates = []

            if koenbi_term:
                # Check for range "YYYYMMDD～YYYYMMDD"
                if "～" in koenbi_term:
                    parts = koenbi_term.split("～")
                    JST = timezone(timedelta(hours=9))
                    for p in parts:
                        p = p.strip()
                        if len(p) >= 8:
                            try:
                                d = datetime.strptime(p[:8], "%Y%m%d").replace(tzinfo=JST)
                                valid_dates.append(d.strftime("%Y-%m-%d"))
                            except ValueError:
                                pass
                    if valid_dates:
                        try:
                            # Use first date as primary object for further parsing
                            first_p = parts[0].strip()[:8]
                            date_obj = datetime.strptime(first_p, "%Y%m%d").replace(tzinfo=JST)
                        except:
                            pass
                else:
                    # Single date logic
                    date_str = koenbi_term[:8]
                    try:
                        JST = timezone(timedelta(hours=9))
                        date_obj = datetime.strptime(date_str, "%Y%m%d").replace(tzinfo=JST)
                    except ValueError:
                        pass

                # Apply time to date_obj (start date)
                kaien_time = item.get('kaien_time') 
                if kaien_time and len(kaien_time) == 4:
                    try:
                        date_obj = date_obj.replace(
                            hour=int(kaien_time[:2]),
                            minute=int(kaien_time[2:])
                        )
                    except ValueError:
                        pass
            
            pref_name = venue_info.get('todofuken_name')
            location = pref_name if pref_name else ""

            uketsuke_list = item.get('kanren_uketsuke_koen_list')
            ticket_name = ""
            artist = None
            if uketsuke_list:
                first_uketsuke = uketsuke_list[0]
                ticket_name = first_uketsuke.get('uketsuke_name_pc') or first_uketsuke.get('uketsuke_name_mobile') or ""
                
                if item.get('koenbi_hyoji_mongon_hyoji_flag') is True:
                    mongon = item.get('koenbi_hyoji_mongon')
                    if mongon:
                        ticket_name = f"{mongon} / {ticket_name}"

                performers = first_uketsuke.get('shutsuensha') 
                if performers:
                    performers = performers.replace("※2枚以上ご購入の方はお申込み前に同行者登録が必要です。同行者登録されていない場合お申込み手続きには進めません。\n同行者登録につきましてはこちら\nhttps://eplus.jp/sf/guide/fellow-ep\nをご確認ください。\nチケットには申込者･同行者共、会員登録の氏名が印字されます。", "")
                    performers = performers.strip()
                    if performers:
                        artist = performers

            if link:
                event_date = date_obj.date()
                if "～" in koenbi_term and valid_dates:
                     event_date = " ".join(valid_dates)

                return Event(
                    event=title,
                    performer=artist,
                    ticket=ticket_name,
                    venue=venue_name,
                    location=location,
                    date=event_date,
                    time=None if "～" in koenbi_term else (date_obj.timetz() if item.get('kaien_time') and len(item.get('kaien_time')) == 4 else None),
                    url=link
                )
            return None
        except Exception as e:
            print(f"  [eplus] Error processing item: {e}")
            return None

    async def _get_events_async(self, query: str = None, max_pages: int = None) -> List[Event]:
        all_events = []
        dt_now = datetime.now()

        async with httpx.AsyncClient(limits=self.limits, timeout=self.timeout) as client:
            # 1. Fetch Exclusions concurrently
            excl_tasks = [
                self._get_all_ids_async(client, "200"),
                self._get_all_ids_async(client, "700")
            ]
            excl_results = await asyncio.gather(*excl_tasks) # type: ignore
            excluded_ids = set().union(*excl_results)
            print(f"  [eplus] Total excluded IDs: {len(excluded_ids)}")

            # 2. Setup main event fetch
            items_per_page = 200
            params = {
                "shutoku_kensu": items_per_page,
                "shutoku_start_ichi": 1,
                "sort_key": "koenbi,kaien_time,parent_koen_taisho_flag,kogyo_code,kogyo_sub_code",
                "parent_genre_code_list": "100", 
                "streaming_haishin_kubun_list": "0"
            }

            # Fetch first page to get count
            try:
                first_page = await self._fetch(client, params)
            except Exception as e:
                print(f"  [eplus] Failed to fetch first page: {e}")
                return []
            
            if not first_page:
                return []

            total_count = first_page['data'].get('so_kensu', 0)
            print(f"  [eplus] Total events found: {total_count}")

            # Collect tasks
            tasks = []
            
            # Helper to extract events from a page response dict
            def extract_from_json(d):
                events = []
                if d and d.get('data') and d['data'].get('record_list'):
                    for item in d['data']['record_list']:
                        ev = self._process_item_sync(item, dt_now, excluded_ids)
                        if ev:
                            events.append(ev)
                return events

            all_events.extend(extract_from_json(first_page))

            # Remaining pages
            for start_index in range(1 + items_per_page, total_count + 1, items_per_page):
                p = params.copy()
                p['shutoku_start_ichi'] = start_index
                tasks.append(self._fetch(client, p))

            print(f"  [eplus] Fetching {len(tasks)} remaining pages concurrently...")
            
            # Execute with concurrency limit handled by httpx limits, but we await gather here
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            for d in results:
                if isinstance(d, Exception):
                    # Individual page failure handled by retry, but if it bubbles up to here, log it
                    print(f"  [eplus] Page fetch failed with error check log: {d}")
                    continue
                    
                all_events.extend(extract_from_json(d))

        return all_events

    def get_events(self, query: str = None) -> List[Event]:
        # Required by BaseConnector interface
        return asyncio.run(self._get_events_async(query))
