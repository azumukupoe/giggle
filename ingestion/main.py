import os
import argparse
import json
from datetime import datetime
from typing import List
import concurrent.futures
from zoneinfo import ZoneInfo

from connectors.base import Event
from connectors.songkick import SongkickConnector
from connectors.eplus import EplusConnector
from connectors.pia import PiaConnector
from db import get_supabase_client, upsert_events, delete_old_events
from dotenv import load_dotenv

# Load env vars
load_dotenv()

def run_songkick() -> List[Event]:
    events = []
    sk_connector = SongkickConnector()
    
    metros_file = os.path.join(os.path.dirname(__file__), 'japan_metro_ids.json')
    if os.path.exists(metros_file):
        with open(metros_file, 'r', encoding='utf-8') as f:
            sk_metros_data = json.load(f)
    else:
        print("  [Songkick] Warning: japan_metro_ids.json not found. using fallback.")
        sk_metros_data = {'30717': {'full_slug': '30717-japan-tokyo', 'name': 'Tokyo'}} # Fallback

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
                metro_events = future.result()
                events.extend(metro_events)
            except Exception as e:
                print(f"    -> [Songkick] Failed for {metro_slug}: {e}")
    return events

def run_eplus() -> List[Event]:
    try:
        eplus = EplusConnector()
        return eplus.get_events()
    except Exception as e:
        print(f"Eplus scraping failed: {e}")
        return []

def run_pia() -> List[Event]:
    try:
        pia = PiaConnector()
        return pia.get_events()
    except Exception as e:
        print(f"Ticket Pia scraping failed: {e}")
        return []

def main():
    parser = argparse.ArgumentParser(description="Ingest concert data")
    args = parser.parse_args()

    all_events: List[Event] = []

    print("Starting ingestion from all sources in parallel...")
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        futures = {
            executor.submit(run_songkick): "Songkick",
            executor.submit(run_eplus): "Eplus",
            executor.submit(run_pia): "Pia"
        }

        for future in concurrent.futures.as_completed(futures):
            source_name = futures[future]
            try:
                events = future.result()
                print(f"[{source_name}] Finished. Found {len(events)} events.")
                all_events.extend(events)
            except Exception as e:
                print(f"[{source_name}] Execution failed: {e}")

    # Save to Supabase
    if all_events:
        # Filter Past Events
        dt_today = datetime.now(ZoneInfo("Asia/Tokyo")).date()
        future_events = [e for e in all_events if e.date >= dt_today]
        all_events = future_events

        unique_events_map = {}
        for event in all_events:
            if event.url not in unique_events_map:
                unique_events_map[event.url] = event
        
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
