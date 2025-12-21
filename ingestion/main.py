import os
import argparse
from typing import List
from connectors.base import Event
from connectors.ticketmaster import TicketmasterConnector
from connectors.bandsintown import BandsInTownConnector
from connectors.songkick import SongkickConnector
from connectors.seatgeek import SeatGeekConnector
from connectors.resident_advisor import ResidentAdvisorConnector
from db import get_supabase_client, get_all_artists
from dotenv import load_dotenv

# Load env vars
load_dotenv()

def main():
    parser = argparse.ArgumentParser(description="Ingest concert data")
    args = parser.parse_args()

    all_events: List[Event] = []

    # --- PHASE 1: Japan Discovery (Broad Search) ---
    print("--- Phase 1: Japan Discovery ---")
    
    # 1. Songkick (Metro Areas)
    # We loop through known Metro IDs. 
    # TODO: Add Osaka/Nagoya/Kyoto once IDs are confirmed.
    sk_connector = SongkickConnector()
    sk_metros = {
        'Tokyo': '30717-japan-tokyo',
        # 'Osaka': '30718-japan-osaka', # Placeholder: Needs correct ID
    }
    
    for city, metro_id in sk_metros.items():
        print(f"  [Songkick] Scraping {city} ({metro_id})...")
        events = sk_connector.get_metro_events(metro_id=metro_id)
        print(f"  [Songkick] Found {len(events)} events in {city}.")
        all_events.extend(events)

    # 2. Resident Advisor (Major Cities)
    # RA uses URL slugs like 'jp/tokyo', 'jp/osaka'
    ra_connector = ResidentAdvisorConnector()
    ra_locations = ['jp/tokyo', 'jp/osaka']
    
    for loc in ra_locations:
        print(f"  [RA] Scraping {loc}...")
        events = ra_connector.get_location_events(location_slug=loc)
        print(f"  [RA] Found {len(events)} events in {loc}.")
        all_events.extend(events)


    # Save to Supabase
    if all_events:
        print(f"Saving {len(all_events)} events to Supabase...")
        try:
             supabase = get_supabase_client()
             from db import upsert_events
             upsert_events(supabase, all_events)
             print("Success!")
        except Exception as e:
             print(f"Error saving to DB: {e}")
    else:
        print("No events found to save.")

    print(f"Total events found: {len(all_events)}")

if __name__ == "__main__":
    main()
