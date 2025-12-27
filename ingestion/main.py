import os
import argparse
import json
from datetime import datetime
from typing import List
import concurrent.futures

from connectors.base import Event
from connectors.songkick import SongkickConnector
from connectors.eplus import EplusConnector
from connectors.pia import PiaConnector
from db import get_supabase_client, upsert_events, delete_old_events
from dotenv import load_dotenv

# Load env vars
load_dotenv()

def main():
    parser = argparse.ArgumentParser(description="Ingest concert data")
    args = parser.parse_args()

    all_events: List[Event] = []

    # --- PHASE 1: Japan Discovery (Broad Search) ---
    
    # 1. Songkick (Metro Areas)
    # We loop through known Metro IDs loaded from file.
    sk_connector = SongkickConnector()
    
    # Load Metro IDs from JSON
    metros_file = os.path.join(os.path.dirname(__file__), 'japan_metro_ids.json')
    if os.path.exists(metros_file):
        with open(metros_file, 'r', encoding='utf-8') as f:
            sk_metros_data = json.load(f)

    else:
        print("  [Songkick] Warning: japan_metro_ids.json not found. using fallback.")
        sk_metros_data = {'30717': {'full_slug': '30717-japan-tokyo', 'name': 'Tokyo'}} # Fallback

    # Parallelize Metro Fetching
    print(f"  [Songkick] Fetching {len(sk_metros_data)} metros in parallel...")
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        future_to_metro = {}
        for mid, data in sk_metros_data.items():
            metro_slug = data.get('full_slug')
            future = executor.submit(sk_connector.get_metro_events, metro_id=metro_slug)
            future_to_metro[future] = metro_slug
        
        for future in concurrent.futures.as_completed(future_to_metro):
            metro_slug = future_to_metro[future]
            try:
                events = future.result()
                all_events.extend(events)
            except Exception as e:
                print(f"    -> Failed for {metro_slug}: {e}")

    # 2. eplus (Japan Major Ticket Vendor)
    try:
        eplus = EplusConnector()
        events = eplus.get_events()
        all_events.extend(events)
    except Exception as e:
        print(f"Eplus scraping failed: {e}")

    # 3. Ticket Pia (Japan)
    try:
        pia = PiaConnector()
        pia_events = pia.get_events()
        all_events.extend(pia_events)
    except Exception as e:
        print(f"Ticket Pia scraping failed: {e}")

    # Save to Supabase
    if all_events:
        # Filter Past Events
        # dt_today is naive
        dt_today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        # Convert e.date to naive for safe comparison if it has tzinfo
        future_events = [e for e in all_events if (e.date.replace(tzinfo=None) if e.date.tzinfo else e.date) >= dt_today]
        all_events = future_events

        # Deduplicate to prevent Postgres 21000 error
        # This occurs if the input batch contains multiple rows with the same (source, external_id)
        unique_events_map = {}
        for event in all_events:
            # unique constraint is (source, external_id)
            key = (event.source, str(event.external_id)) 
            if key not in unique_events_map:
                unique_events_map[key] = event
            else:
                pass # Already have this event, skip duplicate
        
        unique_events = list(unique_events_map.values())
        print(f"Saving {len(unique_events)} distinct events to Supabase...")

        try:
             supabase = get_supabase_client()
             upsert_events(supabase, unique_events)
             print("Success!")
        except Exception as e:
             print(f"Error saving to DB: {e}")
    else:
        print("No events found to save.")

    print(f"Total events found: {len(all_events)}")


    # Cleanup Old Events
    print("--- Cleaning up old events ---")
    try:
        supabase = get_supabase_client()
        delete_old_events(supabase)
    except Exception as e:
         print(f"Skipping cleanup due to error connecting to DB: {e}")

if __name__ == "__main__":
    main()
