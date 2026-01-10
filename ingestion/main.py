import argparse
import concurrent.futures
from typing import List, Tuple
from zoneinfo import ZoneInfo
from datetime import datetime, timezone, date
import pytz

from ingestion.utils.config import load_dotenv
from ingestion.services.importer import Importer
from ingestion.utils.db import get_supabase_client

load_dotenv()

def main():
    parser = argparse.ArgumentParser(description="Ingest concert data")
    parser.add_argument("--source", type=str, help="Specific source to run (case-insensitive substring match)")
    parser.add_argument("--dry-run", action="store_true", help="Run without changes to DB")
    parser.add_argument("--debug", action="store_true", help="Enable debug mode (verbose logging, limited fetching)")
    args = parser.parse_args()

    if args.debug:
        logging.basicConfig(level=logging.DEBUG)
        print("DEBUG Mode Enabled")
    else:
        logging.basicConfig(level=logging.INFO)

    # Lazy imports for speed
    from ingestion.models import Event
    from ingestion.connectors.registry import get_connectors
    # Ensure all connectors are registered
    import ingestion.connectors.songkick
    import ingestion.connectors.eplus
    import ingestion.connectors.pia

    def run_connector(connector_cls, std) -> Tuple[str, List[Event]]:
        """Instantiate and run a connector, returning (name, events)."""
        connector_name = "Unknown"
        try:
            connector = connector_cls(debug=args.debug)
            connector_name = connector.source_name
            print(f"[{connector_name}] Starting...")
            events = connector.get_events()
            
            # Standardize immediately while in parallel thread
            if std and events:
                match_lang = 'en' if connector_name == 'Songkick' else 'ja'

                for e in events:
                     raw_loc = e.location
                     e.location = std.get_location_names(raw_loc)
                     e.venue = std.get_venue_names(e.venue)

                     # Timezone Resolution
                     if e.time:
                        # 1. Try to get timezone from Location DB (Applies to all connectors)
                        loc_tz_str = std.get_location_timezone(e.location)
                        resolved_tz = None
                        
                        if loc_tz_str:
                             try:
                                 resolved_tz = ZoneInfo(loc_tz_str)
                             except Exception:
                                 pass
                        
                        # 2. Fallback to Country Metadata (Songkick Specific as requested, or others if they lack location match)
                        if not resolved_tz and connector_name == 'Songkick':
                            country = e.metadata.get('country') if e.metadata else None
                            if country:
                                # Map full name to code if needed
                                if country.lower() == 'japan':
                                    country = 'JP'
                                
                                # Use pytz to look up timezone
                                try:
                                    country_tzs = pytz.country_timezones.get(country)
                                    if country_tzs:
                                        # Use the first one (e.g., 'Asia/Tokyo' for JP)
                                        resolved_tz = ZoneInfo(country_tzs[0])
                                except Exception as e:
                                    print(f"Error resolving timezone for country {country}: {e}")
                        
                        if resolved_tz:
                             # Use date + time to calculate fixed offset for proper serialization
                             target_date = None
                             if isinstance(e.date, list) and e.date:
                                 target_date = e.date[0]
                             elif isinstance(e.date, (date, str)):
                                  target_date = e.date
                             
                             if isinstance(target_date, str):
                                 try:
                                     # Assuming ISO format yyyy-mm-dd
                                     target_date = datetime.strptime(target_date, "%Y-%m-%d").date()
                                 except:
                                     pass

                             new_times = []
                             for t in e.time:
                                 if t.tzinfo is not None:
                                     new_times.append(t)
                                     continue

                                 fixed_tz = None
                                 if target_date and not isinstance(target_date, str):
                                     try:
                                         dt = datetime.combine(target_date, t)
                                         dt_aware = dt.replace(tzinfo=resolved_tz)
                                         offset = resolved_tz.utcoffset(dt_aware)
                                         if offset:
                                             fixed_tz = timezone(offset)
                                     except Exception:
                                         pass

                                 if fixed_tz:
                                      new_times.append(t.replace(tzinfo=fixed_tz))
                                 else:
                                      # Fallback
                                      new_times.append(t.replace(tzinfo=resolved_tz))
                             e.time = new_times
            
            return connector_name, events
        except Exception as e:
            print(f"[{connector_name}] Failed: {e}")
            return connector_name, []

    all_events: List[Event] = []

    successful_sources: List[str] = []

    print("Starting ingestion from all registered sources in parallel...")
    
    connectors = get_connectors()
    if args.source:
        filtered_connectors = []
        for cls in connectors:
            try:
                # Instantiate briefly to check source_name
                if args.source.lower() in cls().source_name.lower():
                    filtered_connectors.append(cls)
            except Exception:
                pass
        connectors = filtered_connectors
        if not connectors:
            print(f"No connectors matched source '{args.source}'")
            return

    if not connectors:
        print("No connectors found in registry!")
        return

    # Init Standardizer and Supabase
    supabase = get_supabase_client()
    try:
        from ingestion.services.standardizer import Standardizer
        std = Standardizer(supabase)
    except Exception as e:
        print(f"Failed to init standardizer: {e}")
        std = None

    with concurrent.futures.ThreadPoolExecutor(max_workers=len(connectors)) as executor:
        futures = {
            executor.submit(run_connector, cls, std): cls 
            for cls in connectors
        }

        for future in concurrent.futures.as_completed(futures):
            try:
                source_name, events = future.result()
                if events:
                    print(f"[{source_name}] Finished. Found {len(events)} events.")
                    all_events.extend(events)
                    successful_sources.append(source_name)
                else:
                     print(f"[{source_name}] Finished with 0 events.")
            except Exception as e:
                # Should be caught inside run_connector but just in case
                cls = futures[future]
                print(f"[{cls}] Critical failure: {e}")

    importer = Importer(supabase)
    importer.save_results(all_events, successful_sources, std, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
