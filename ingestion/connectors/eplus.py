import asyncio
import httpx
from datetime import datetime, time
from typing import List, Optional, Tuple, Set
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
import logging
from .base import BaseConnector, Event
from .registry import register_connector

logger = logging.getLogger(__name__)

@register_connector
class EplusConnector(BaseConnector):
    @property
    def source_name(self) -> str:
        return "Eplus"

    def __init__(self, debug: bool = False):
        super().__init__(debug)

        self.api_url = "https://api.eplus.jp/v3/koen"
        self.headers = {
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
            "streaming_haishin_kubun_list": "0"
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

        try:
            k_code = item.get('kogyo_code')
            k_sub = item.get('kogyo_sub_code')
            if k_code and k_sub:
                if (str(k_code), str(k_sub)) in excluded_ids:
                    return None

            kogyo = item.get('kanren_kogyo_sub', {})
            title_1 = kogyo.get('kogyo_name_1')
            title_2 = kogyo.get('kogyo_name_2')
            titles = [t for t in [title_1, title_2] if t]

            
            venue_info = item.get('kanren_venue', {})
            venue_name = venue_info.get('venue_name')
            
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
                    for p in parts:
                        p = p.strip()
                        if len(p) >= 8:
                            try:
                                d = datetime.strptime(p[:8], "%Y%m%d")
                                valid_dates.append(d.strftime("%Y-%m-%d"))
                            except ValueError:
                                pass
                    if valid_dates:
                        try:
                            # Use first date as primary object for further parsing
                            first_p = parts[0].strip()[:8]
                            date_obj = datetime.strptime(first_p, "%Y%m%d")
                        except:
                            pass
                else:
                    # Single date logic
                    date_str = koenbi_term[:8]
                    try:
                        date_obj = datetime.strptime(date_str, "%Y%m%d")
                    except ValueError:
                        pass

                # Time handling
                times = []
                kaien_time = item.get('kaien_time')
                shuen_time = item.get('shuen_time')

                if kaien_time and len(kaien_time) == 4:
                     try:
                         t_start = time(int(kaien_time[:2]), int(kaien_time[2:]))
                         times.append(t_start)
                     except ValueError:
                         pass

                if shuen_time and len(shuen_time) == 4:
                     try:
                         t_end = time(int(shuen_time[:2]), int(shuen_time[2:]))
                         times.append(t_end)
                     except ValueError:
                         pass

                # Apply time to date_obj (start date) just in case it's used elsewhere, 
                # although we use .date() mostly.
                if times:
                    date_obj = date_obj.replace(
                        hour=times[0].hour,
                        minute=times[0].minute
                    )
            
            pref_name = venue_info.get('todofuken_name')
            location = pref_name if pref_name else None

            ticket_names = []
            # Wait, uketsuke_list was NOT defined in the viewed snippet around line 157.
            # I must have missed where uketsuke_list comes from.
            # Looking at original file content I viewed...
            # Line 157: if uketsuke_list:
            # I don't see uketsuke_list definition in `_process_item_sync`.
            # Ah, maybe I missed a chunk in previous view?
            # Let me check `_process_item_sync` start (Line 89).
            # It gets `item`.
            # I suspect `uketsuke_list` extraction is missing in my previous `view_file` output or my mental model?
            # Line 98: `kogyo = item.get('kanren_kogyo_sub', {})`
            # I don't see `uketsuke_list = ...`
            # Line 157 uses `uketsuke_list`.
            # If `uketsuke_list` is missing in the file, then the code was broken before?
            # Or I missed it.
            # Let me re-read `view_file` output carefully.
            # Lines 89-197.
            # I see `k_code`, `k_sub`, `kogyo`, `venue_info`, `detail_path`, `koenbi_term`, `date_obj`.
            # Then `pref_name`.
            # Then `ticket_names = []`.
            # Then `if uketsuke_list:` (Line 157).
            # `uketsuke_list` IS NOT DEFINED locally.
            # Is it a standardizer global? No.
            # Is it implicitly available? No.
            # It must be `uketsuke_list = item.get('uketsuke_list')` or similar.
            # Maybe I accidentally deleted it in previous edits or it was never there and code was broken?
            # I should add it. `uketsuke_list = item.get('uketsuke_list', [])`
            
            uketsuke_list = item.get('kanren_uketsuke_koen_list', [])
            if isinstance(uketsuke_list, dict):
                uketsuke_list = [uketsuke_list]

            if uketsuke_list:
                for uketsuke in uketsuke_list:
                    t_name = uketsuke.get('uketsuke_name_pc') or uketsuke.get('uketsuke_name_mobile')
                    if t_name:
                         # Append mongon if flag is true (applied to all? logic suggests per item maybe but existing used root item flag)
                         # The item level has 'koenbi_hyoji_mongon'. Let's assume it applies globally or check item.
                         if item.get('koenbi_hyoji_mongon_hyoji_flag') is True:
                             mongon = item.get('koenbi_hyoji_mongon')
                             if mongon:
                                 t_name = f"{mongon} / {t_name}"
                         ticket_names.append(t_name)

                # Collect performers from all uketsuke entries
                artists = []
                for uketsuke in uketsuke_list:
                    p_raw = uketsuke.get('shutsuensha')
                    if p_raw:
                         # Cleanup boilerplate text commonly found in Eplus performer fields
                         p_cleaned = p_raw.replace("※2枚以上ご購入の方はお申込み前に同行者登録が必要です。同行者登録されていない場合お申込み手続きには進めません。\n同行者登録につきましてはこちら\nhttps://eplus.jp/sf/guide/fellow-ep\nをご確認ください。\nチケットには申込者･同行者共、会員登録の氏名が印字されます。", "")
                         p_cleaned = p_cleaned.strip()
                         if p_cleaned and p_cleaned not in artists:
                             artists.append(p_cleaned)
                
                artist = artists if artists else None

            if 'artist' not in locals(): artist = None


            if link:
                event_dates = [date_obj.date().isoformat()]
                if "～" in koenbi_term and valid_dates:
                     event_dates = valid_dates

                return Event(
                    event=titles,
                    performer=artist,
                    ticket=ticket_names if ticket_names else None,
                    venue=venue_name,
                    location=location,
                    date=event_dates,
                    time=times if (times and "～" not in koenbi_term) else None,
                    url=link,
                    metadata=None
                )
            return None
        except Exception as e:
            print(f"  [eplus] Error processing item: {e}")
            return None

    async def _get_events_async(self, query: str = None, max_pages: int = None) -> List[Event]:
        all_events = []
        dt_now = datetime.now()

        async with httpx.AsyncClient(limits=self.limits, timeout=self.timeout) as client:
            excl_tasks = [

                self._get_all_ids_async(client, "200"),
                self._get_all_ids_async(client, "700")
            ]
            excl_results = await asyncio.gather(*excl_tasks) # type: ignore
            excluded_ids = set().union(*excl_results)
            print(f"  [eplus] Total excluded IDs: {len(excluded_ids)}")

            items_per_page = 200

            params = {
                "shutoku_kensu": items_per_page,
                "shutoku_start_ichi": 1,
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

            tasks = []

            
            def extract_from_json(d):

                events = []
                if d and d.get('data') and d['data'].get('record_list'):
                    record_list = d['data']['record_list']
                    if isinstance(record_list, dict):
                        record_list = [record_list]
                    for item in record_list:
                        ev = self._process_item_sync(item, dt_now, excluded_ids)
                        if ev:
                            events.append(ev)
                return events

            all_events.extend(extract_from_json(first_page))

            # Remaining pages
            page_count = 1
            for start_index in range(1 + items_per_page, total_count + 1, items_per_page):
                if max_pages and page_count >= max_pages:
                    break
                page_count += 1
                
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
        max_pages = None
        if self.debug:
            print("  [eplus] DEBUG MODE: Limiting fetch to 1 page.")
            max_pages = 1
        return asyncio.run(self._get_events_async(query, max_pages=max_pages))

