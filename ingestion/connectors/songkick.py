from typing import List, Optional

import httpx
from datetime import datetime, timezone, timedelta
from .base import BaseConnector, Event
from .registry import register_connector
from bs4 import BeautifulSoup
import urllib.parse
import json
import concurrent.futures
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

@register_connector
class SongkickConnector(BaseConnector):
    @property
    def source_name(self) -> str:
        return "Songkick"

    def __init__(self):
        super().__init__()
        self.base_url = "https://www.songkick.com"
        
        self.client = httpx.Client(
            timeout=30.0, 
            http2=True,
            limits=httpx.Limits(max_keepalive_connections=20, max_connections=20)
        )
    


    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type((httpx.RequestError, httpx.HTTPStatusError)),
        reraise=True
    )
    def _fetch(self, url: str):
        response = self.client.get(url)
        response.raise_for_status()
        return response

    def get_events(self, query: str = None) -> List[Event]:
        events = []
        
        sk_metros_slugs = JAPAN_METROS

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

    def get_metro_events(self, metro_id: str = "30717-japan-tokyo", max_pages: int = None) -> List[Event]:
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
                
                soup = BeautifulSoup(resp.content, 'html.parser')
                
                # Extract JSON-LD
                scripts = soup.find_all('script', type='application/ld+json')
                page_events = []
                
                found_json = False
                items_to_process = []
                for script in scripts:
                    if 'MusicEvent' in script.text:
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
                    futures = [executor.submit(self._parse_json_ld, item) for item in items_to_process]
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
            organizer = item.get('organizer', {})
            if isinstance(organizer, list):
                organizer = organizer[0] if organizer else {}

            event_name = organizer.get('name')
            # Fallback to main item name if organizer name is missing
            if not event_name:
                event_name = item.get('name')

            performers = item.get('performer', [])

            if not isinstance(performers, list):
                performers = [performers]
            
            performer_list = [p.get('name') for p in performers if isinstance(p, dict) and p.get('name')]

            date_str = item.get('startDate')

            if not date_str: return None
            
            event_dates = []
            end_date_str = item.get('endDate')

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
                     event_dates.append(date_str.split('T')[0])
            else:
                try:
                    start_dt = datetime.fromisoformat(date_str)
                    event_dates.append(start_dt.date().isoformat())
                except ValueError:
                    event_dates.append(date_str.split('T')[0])
            
            # Parsing for time extraction
            times = []
            try:
                if date_str and ('T' in date_str or ' ' in date_str):
                     s_dt = datetime.fromisoformat(date_str)
                     times.append(s_dt.timetz())
            except:
                pass
            
            if end_date_str:
                 try:
                     if 'T' in end_date_str or ' ' in end_date_str:
                         e_dt = datetime.fromisoformat(end_date_str)
                         times.append(e_dt.timetz())
                 except:
                     pass
            
            venue = item.get('location', {})
            if isinstance(venue, list):
                venue = venue[0] if venue else {}

            venue_name = venue.get('name')
            
            address = venue.get('address', {})
            locality = address.get('addressLocality')
            country = address.get('addressCountry')
            
            loc = None
            if locality:
                loc = locality
            elif country:
                loc = country

            image_data = item.get('image')
            image_url = None

            if image_data:
                if isinstance(image_data, list):
                    # Take the first valid image found
                    for img in image_data:
                        if isinstance(img, str):
                            image_url = img
                            break
                        elif isinstance(img, dict):
                            u = img.get('url')
                            if u: 
                                image_url = u
                                break
                elif isinstance(image_data, dict):
                    image_url = image_data.get('url')
                elif isinstance(image_data, str):
                    image_url = image_data

            url = item.get('url')

            if url:
                parsed = urllib.parse.urlparse(url)
                qs = urllib.parse.parse_qs(parsed.query)
                qs.pop('utm_medium', None)
                qs.pop('utm_source', None)
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
                metadata={'country': country} if country else None
            )
        except Exception as e:
            print(f"Error parsing JSON-LD item: {e}")
            return None
JAPAN_METROS = [
    "30717-japan-tokyo",
    "30647-japan-osaka",
    "30611-japan-nagoya",
    "30571-japan-kyoto",
    "30434-japan-fukuoka",
    "30754-japan-yokohama",
    "30668-japan-sapporo",
    "30545-japan-kobe",
    "30470-japan-hiroshima",
    "30673-japan-sendai",
    "30619-japan-niigata",
    "30534-japan-kawasaki",
    "30684-japan-shizuoka",
    "30453-japan-hamamatsu",
    "30518-japan-kanazawa",
    "30637-japan-okayama",
    "30606-japan-nagano",
    "30641-japan-okinawa",
    "58226-japan-kichijoji",
    "30696-japan-takamatsu",
    "30443-japan-gifu",
    "30563-japan-kumamoto",
    "30748-japan-yamagata",
    "30580-japan-matsumoto",
    "30433-japan-fukui",
    "30546-japan-kochi",
    "30598-japan-morioka",
    "30582-japan-matsuyama",
    "30510-japan-kagoshima",
    "30724-japan-toyama",
    "30615-japan-nara",
    "68726-japan-hakata",
    "30741-japan-utsunomiya",
    "30588-japan-mito",
    "30753-japan-yokkaichi",
    "30526-japan-kashiwa",
    "57191-japan-yamanashi",
    "30609-japan-nagasaki",
    "30749-japan-yamaguchi",
    "30592-japan-miyazaki",
    "30715-japan-tokushima",
    "30581-japan-matsusaka",
    "30515-japan-kamakura",
    "30755-japan-yokosuka",
    "30636-japan-oita",
    "30408-japan-aomori",
    "30548-japan-kofu",
    "30403-japan-akita",
    "30558-japan-koriyama",
    "30574-japan-maebashi",
    "30656-japan-saga",
    "30743-japan-wakayama",
    "68746-japan-hyogo",
    "30543-japan-kitakyushu",
    "30651-japan-otsu",
    "30699-japan-takasaki",
    "30409-japan-asahikawa",
    "99241-japan-mie",
    "30413-japan-atsugi",
    "30718-japan-tomakomai",
    "30436-japan-fukushima",
    "30464-japan-himeji",
    "30437-japan-fukuyama",
    "30725-japan-toyohashi",
    "30427-japan-fuji",
    "30444-japan-ginowan",
    "30612-japan-naha",
    "30435-japan-fukuroi",
    "30451-japan-hakodate",
    "30430-japan-fujisawa",
    "30565-japan-kurashiki",
    "30710-japan-tochigi",
    "99236-japan-ishikawa",
    "30572-japan-machida",
    "30756-japan-yonago",
    "30440-japan-fussa",
    "30669-japan-sasebo",
    "99251-japan-rifu",
    "58196-japan-kokura",
    "30442-japan-gamagori",
    "30579-japan-matsue",
    "30639-japan-okazaki",
    "33189-japan-kushiro",
    "30723-japan-tottori",
    "30649-japan-otaru",
    "30492-japan-ise",
    "30568-japan-kurume",
    "30428-japan-fujinomiya",
    "30455-japan-handa",
    "30501-japan-iwaki",
    "30729-japan-tsukuba",
    "30478-japan-ichinomiya",
    "30538-japan-kiryu",
    "30630-japan-obihiro",
    "30655-japan-sagamihara",
    "30425-japan-fuchu",
    "30417-japan-chigasaki",
    "30463-japan-hikone",
    "30469-japan-hirosaki",
    "30471-japan-hitachi",
    "176264-japan-chugoku",
    "30414-japan-beppu",
    "30449-japan-hachioji",
    "30494-japan-ishikari",
    "30503-japan-iwamizawa",
    "30733-japan-tsu",
    "68761-japan-kadena",
    "176266-japan-ibaraki-prefecture",
    "30448-japan-hachinohe",
    "30562-japan-kumagaya",
    "30629-japan-numazu",
    "30645-japan-onomichi",
    "30502-japan-iwakuni",
    "30512-japan-kakamigahara",
    "30757-japan-yonezawa",
    "30664-japan-saku",
    "30407-japan-anjo",
    "30544-japan-kitami",
    "30569-japan-kusatsu",
    "30607-japan-nagaoka",
    "30730-japan-tsuruga",
    "30728-japan-toyota",
    "30763-japan-zushi",
    "68786-japan-misawa",
    "30424-japan-ebetsu",
    "30476-japan-ichihara",
    "30617-japan-narita",
    "30508-japan-izumo",
    "30697-japan-takaoka",
    "30735-japan-ube",
    "30738-japan-uji",
    "68731-japan-hakone",
    "58047-japan-yokota",
    "30411-japan-ashikaga",
    "30613-japan-nakatsugawa",
    "30614-japan-nakatsu",
    "30644-japan-omuta",
    "30487-japan-ina",
    "30493-japan-isesaki",
    "30495-japan-ishinomaki",
    "30489-japan-inuyama",
    "30628-japan-noshiro",
    "30661-japan-sakata",
    "30657-japan-saijo",
    "30672-japan-seki",
    "30689-japan-suwa",
    "30701-japan-takayama",
    "30713-japan-toki",
    "30736-japan-ueda",
    "30760-japan-yuki",
    "30762-japan-zama",
    "30747-japan-yaizu",
    "68821-japan-sangenchaya",
    "68716-japan-esashi",
    "68796-japan-nagayo",
    "68801-japan-nagoja",
    "99256-japan-saporo",
    "182360-japan-biei",
    "30402-japan-akashi",
    "30420-japan-chitose",
    "30416-japan-chichibu",
    "30445-japan-gotemba",
    "30555-japan-komatsu",
    "30542-japan-kitakami",
    "30584-japan-mihara",
    "30591-japan-miyakonojo",
    "30618-japan-naruto",
    "30631-japan-obu",
    "30633-japan-odawara",
    "30480-japan-iida",
    "30513-japan-kakegawa",
    "30504-japan-iwata",
    "30496-japan-ishioka",
    "30522-japan-kariya",
    "30531-japan-kawagoe",
    "30652-japan-oyama",
    "30665-japan-sanda",
    "30667-japan-sano",
    "30694-japan-tajimi",
    "30691-japan-suzuka",
    "30473-japan-hofu",
    "30734-japan-tsuyama",
    "68721-japan-gumma",
    "68756-japan-iwanuma",
    "68841-japan-toyohasi",
    "68771-japan-kioto",
    "68806-japan-ogura",
    "68861-japan-yashima",
    "30586-japan-mishima",
    "182350-japan-kamogawa",
    "176268-japan-kanto",
    "33188-japan-yamato",
    "33196-japan-hakusan",
    "33198-japan-fujimi",
    "30404-japan-ako",
    "30418-japan-chino",
    "30419-japan-chiryu",
    "30406-japan-anan",
    "30431-japan-fukaya",
    "30441-japan-futtsu",
    "30454-japan-hanamaki",
    "30468-japan-hiratsuka",
    "30535-japan-kazo",
    "30554-japan-komaki",
    "30537-japan-kimitsu",
    "30566-japan-kure",
    "30539-japan-kisarazu",
    "30557-japan-konosu",
    "30549-japan-koga",
    "30576-japan-marugame",
    "30585-japan-miki",
    "30589-japan-miura",
    "30602-japan-muroran",
    "30599-japan-moriyama",
    "30610-japan-nago",
    "30605-japan-nagahama",
    "30625-japan-noboribetsu",
    "30620-japan-niihama",
    "30623-japan-nishio",
    "30472-japan-hita",
    "30483-japan-ikoma",
    "30484-japan-imabari",
    "30485-japan-imaichi",
    "30490-japan-isahaya",
    "30519-japan-kanoya",
    "30529-japan-kasugai",
    "30524-japan-kashihara",
    "30530-japan-kasukabe",
    "30525-japan-kashima",
    "30643-japan-omura",
    "30679-japan-shimonoseki",
    "30702-japan-takefu",
    "30704-japan-tanabe",
    "30722-japan-tosu",
    "30731-japan-tsuruoka",
    "30737-japan-ueno",
    "30761-japan-yukuhashi",
    "30516-japan-kameoka",
    "30752-japan-yawata",
    "68856-japan-yamaguti",
    "68781-japan-mikuni",
    "181004-japan-asagaya",
    "179731-japan-mito-art-tower",
    "180315-japan-atami",
    "180360-japan-ayabe",
    "179525-japan-bihorocity",
    "176518-japan-matsushima",
    "109301-japan-sumoto",
    "120909-japan-niigita",
    "33192-japan-tama",
    "33193-japan-osaki",
    "33195-japan-mino",
    "33194-japan-misato",
    "33197-japan-kasuga",
    "33199-japan-yokote",
    "33190-japan-yachiyo",
    "33191-japan-iruma",
    "30401-japan-ageo",
    "30400-japan-abiko",
    "30422-japan-choshi",
    "30426-japan-fujieda",
    "30432-japan-fukuchiyama",
    "30446-japan-gushikawa",
    "30439-japan-furukawa",
    "30447-japan-gyoda",
    "30452-japan-hamakita",
    "30456-japan-hanno",
    "30457-japan-hanyu",
    "30462-japan-hekinan",
    "30450-japan-hadano",
    "30458-japan-hashimoto",
    "30474-japan-honjo",
    "30459-japan-hasuda",
    "30465-japan-himi",
    "30461-japan-hatsukaichi",
    "30429-japan-fujioka",
    "30541-japan-kitaibaraki",
    "30536-japan-kesennuma",
    "30560-japan-kudamatsu",
    "30561-japan-kuki",
    "30567-japan-kuroiso",
    "30583-japan-matto",
    "30551-japan-kokubu",
    "30573-japan-maebaru",
    "30570-japan-kuwana",
    "30575-japan-maizuru",
    "30590-japan-miyako",
    "30594-japan-mizusawa",
    "30600-japan-moriya",
    "30601-japan-muko",
    "30595-japan-mobara",
    "30596-japan-moka",
    "30593-japan-miyoshi",
    "30604-japan-nabari",
    "30624-japan-nobeoka",
    "30626-japan-noda",
    "30634-japan-ogaki",
    "30648-japan-ota",
    "30621-japan-niitsu",
    "30635-japan-oi",
    "30632-japan-odate",
    "30640-japan-okegawa",
    "30627-japan-nogata",
    "30650-japan-otawara",
    "30481-japan-iizuka",
    "30479-japan-ichinoseki",
    "30488-japan-inazawa",
    "30499-japan-itoman",
    "30486-japan-imari",
    "30500-japan-iwade",
    "30514-japan-kakogawa",
    "30505-japan-iwatsuki",
    "30491-japan-isehara",
    "30498-japan-ito",
    "30528-japan-kashiwazaki",
    "30523-japan-kasaoka",
    "30517-japan-kamifukuoka",
    "30520-japan-kanuma",
    "30521-japan-karatsu",
    "30653-japan-ryugasaki",
    "30646-japan-ono",
    "30642-japan-ome",
    "30658-japan-sakado",
    "30638-japan-okaya",
    "30654-japan-sabae",
    "30659-japan-sakaide",
    "30674-japan-seto",
    "30662-japan-sakurai",
    "30670-japan-satte",
    "30666-japan-sanjo",
    "30675-japan-shibata",
    "30663-japan-sakura",
    "30671-japan-sayama",
    "30680-japan-shiogama",
    "30677-japan-shimada",
    "30681-japan-shiojiri",
    "30678-japan-shimodate",
    "30682-japan-shiraoka",
    "30685-japan-soja",
    "30688-japan-sukagawa",
    "30683-japan-shiroi",
    "30708-japan-tendo",
    "30703-japan-tamano",
    "30693-japan-tagawa",
    "30709-japan-tenri",
    "30719-japan-tomigusuku",
    "30720-japan-tondabayashi",
    "30716-japan-tokuyama",
    "30707-japan-tateyama",
    "30721-japan-toride",
    "30712-japan-togane",
    "30732-japan-tsushima",
    "30751-japan-yatsushiro",
    "30706-japan-tatebayashi",
    "30726-japan-toyokawa",
    "30690-japan-suzaka",
    "30556-japan-konan",
    "30740-japan-ushiku",
    "30759-japan-yotsukaido",
    "30746-japan-yachimata",
    "30742-japan-uwajima",
    "183383-japan-hakuba",
    "183384-japan-niseko",
    "183437-japan-kijimadaira",
    "184340-japan-toyooka",
    "184560-japan-yame",
    "185196-japan-koza",
    "185204-japan-ishigaki"
]
