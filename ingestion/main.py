import argparse
import logging
import concurrent.futures
from typing import List, Tuple, Optional

from ingestion.utils.config import load_dotenv
from ingestion.services.importer import Importer
from ingestion.utils.db import get_supabase_client
from ingestion.utils.timezone import (
    apply_timezone_to_event_times,
    resolve_timezone_for_country,
)

load_dotenv()


def main():
    parser = argparse.ArgumentParser(description="Ingest concert data")
    parser.add_argument(
        "--source",
        type=str,
        help="Specific source to run (case-insensitive substring match)",
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="Run without changes to DB"
    )
    parser.add_argument(
        "--debug",
        action="store_true",
        help="Enable debug mode (verbose logging, limited fetching)",
    )
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

    def run_connector(connector_cls, std) -> Tuple[str, Optional[List[Event]]]:
        """Instantiate and run a connector, returning (name, events)."""
        connector_name = "Unknown"
        try:
            connector = connector_cls(debug=args.debug)
            connector_name = connector.source_name
            print(f"[{connector_name}] Starting...")
            events = connector.get_events()

            # Standardize immediately while in parallel thread
            if std and events:
                for e in events:
                    raw_loc = e.location
                    e.location = std.get_location_names(raw_loc)
                    e.venue = std.get_venue_names(e.venue)

                    # Timezone Resolution
                    if e.time:
                        # 1. Try to get timezone from Location DB
                        tz_name = std.get_location_timezone(e.location)

                        # 2. Fallback to Country Metadata (Songkick specific)
                        if not tz_name and connector_name == "Songkick":
                            country = e.metadata.get("country") if e.metadata else None
                            tz_name = resolve_timezone_for_country(country)

                        if tz_name:
                            # Get reference date for DST handling
                            ref_date = None
                            if isinstance(e.date, list) and e.date:
                                ref_date = e.date[0]
                            elif isinstance(e.date, str):
                                ref_date = e.date

                            e.time = apply_timezone_to_event_times(
                                e.time, tz_name, ref_date
                            )

            return connector_name, events
        except Exception as ex:
            print(f"[{connector_name}] Failed: {ex}")
            return connector_name, None

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
        futures = {executor.submit(run_connector, cls, std): cls for cls in connectors}

        for future in concurrent.futures.as_completed(futures):
            try:
                source_name, events = future.result()

                if events is not None:
                    # Mark source as successful even if 0 events found
                    successful_sources.append(source_name)

                    if events:
                        print(f"[{source_name}] Finished. Found {len(events)} events.")
                        all_events.extend(events)
                    else:
                        print(f"[{source_name}] Finished with 0 events.")
                else:
                    # None means failure
                    pass

            except Exception as e:
                # Should be caught inside run_connector but just in case
                cls = futures[future]
                print(f"[{cls}] Critical failure: {e}")

    importer = Importer(supabase)
    importer.save_results(all_events, successful_sources, std, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
