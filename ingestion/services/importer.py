from typing import List, Dict
from datetime import date, datetime, time
from supabase import Client
from ingestion.utils.db import get_supabase_client
from ingestion.utils.dates import is_future_event
from ingestion.models import Event

class Importer:
    def __init__(self, supabase: Client = None):
        self.supabase = supabase or get_supabase_client()

    def save_results(self, all_events: List[Event], successful_sources: List[str], std=None, dry_run: bool = False):
        if not all_events:
            print("No events found to save.")
            print(f"Total events found: 0")
            return

        if dry_run:
            print(f"[DRY RUN] Found {len(all_events)} events from {successful_sources}")
            print("[DRY RUN] Skipping database upsert and sync deletion.")
            return

        future_events = [e for e in all_events if is_future_event(e)]
        
        # Deduplicate
        unique_events_map = {}
        for event in future_events:
            if event.url not in unique_events_map:
                unique_events_map[event.url] = event
        
        unique_events = list(unique_events_map.values())
        print(f"Saving {len(unique_events)} distinct future events to Supabase...")

        try:
            self._upsert_events(unique_events)
            print("Success!")
            
            # Localize pending items (background task effectively)
            if std:
                std.localize_pending()

        except Exception as e:
            print(f"Error saving to DB: {e}")

        # Sync Deletion (Delete items not found in THIS run for successful sources)
        try:
            source_url_map = {}
            patterns = {
                "Songkick": "songkick.com",
                "Eplus": "eplus.jp", 
                "Pia": "pia.jp"
            }
            
            for source in successful_sources:
                pat = patterns.get(source)
                if pat:
                    found_urls = [e.url for e in unique_events if pat in e.url]
                    source_url_map[source] = found_urls
            
            if source_url_map:
                self._delete_missing_events(source_url_map)
                
        except Exception as e:
            print(f"Error running sync deletion: {e}")

        print(f"Total events found: {len(all_events)}")


    def _upsert_events(self, events: List[Event]):
        """
        Upsert events (url constrained).
        """
        if not events:
            return

        # Convert Event objects to dictionaries
        data = []
        for e in events:
            # Exclude 'metadata' from DB payload, but allow None for other optional fields if needed
            event_dict = e.model_dump(exclude={'metadata'})
            
            for field in ['ticket', 'date', 'time', 'image', 'event', 'performer', 'venue', 'location']:
                if event_dict.get(field) is not None and not isinstance(event_dict[field], list):
                    event_dict[field] = [event_dict[field]]

            if event_dict.get("date"):
                new_dates = []
                for d in event_dict["date"]:
                    if isinstance(d, (date, datetime)):
                        new_dates.append(d.isoformat())
                    else:
                        new_dates.append(str(d))
                event_dict["date"] = new_dates

            if "time" in event_dict and event_dict["time"]:
                new_times = []
                for t in event_dict["time"]:
                    if isinstance(t, (time, datetime)):
                        new_times.append(t.isoformat())
                    else:
                        new_times.append(str(t))
                event_dict["time"] = new_times

            data.append(event_dict)

        try:
            # Batch upsert could be needed if list is massive, but for now strict single batch
            self.supabase.table("events").upsert(data, on_conflict="url").execute() 
        except Exception as e:
            print(f"Supabase upsert error: {e}")
            raise e

    def _delete_missing_events(self, source_urls: Dict[str, List[str]]):
        """
        Delete events from DB that were NOT found in the current ingestion run,
        but belong to sources that successfully ran.
        """
        print("--- Deleting missing events (sync) ---")
        
        source_patterns = {
            "Songkick": "songkick.com",
            "Eplus": "eplus.jp",
            "Pia": "pia.jp"
        }

        for source, found_urls in source_urls.items():
            pattern = source_patterns.get(source)
            if not pattern:
                print(f"  [Warn] No URL pattern defined for source '{source}'. Skipping clean up.")
                continue
                
            found_set = set(found_urls)
            print(f"  [{source}] Checking for missing events... (Found {len(found_set)} in this run)")
            
            db_urls = set()

            page = 0
            page_size = 1000
            has_more = True
            
            try:
                while has_more:
                    res = self.supabase.table("events").select("url").ilike("url", f"%{pattern}%").range(page*page_size, (page+1)*page_size - 1).execute()
                    rows = res.data
                    
                    if not rows:
                        break
                        
                    for row in rows:
                        if row.get('url'):
                            db_urls.add(row['url'])
                    
                    if len(rows) < page_size:
                        has_more = False
                    page += 1
                    
                to_delete = list(db_urls - found_set)
                
                if to_delete:
                    print(f"    -> Found {len(to_delete)} events in DB that are missing from verify source. Deleting...")
                    chunk_size = 200

                    for i in range(0, len(to_delete), chunk_size):
                        chunk = to_delete[i:i+chunk_size]
                        try:
                            self.supabase.table("events").delete().in_("url", chunk).execute()
                        except Exception as e:
                            print(f"      Error deleting chunk {i}: {e}")
                    print(f"    -> Cleanup complete for {source}.")
                else:
                    print(f"    -> Source {source} is in sync.")
                    
            except Exception as e:
                print(f"  [{source}] Error during cleanup: {e}")
