import os
import argparse
import json
from typing import List
from connectors.base import Event
from connectors.ticketmaster import TicketmasterConnector
from connectors.bandsintown import BandsInTownConnector
from connectors.songkick import SongkickConnector
from connectors.seatgeek import SeatGeekConnector
from connectors.resident_advisor import ResidentAdvisorConnector
from connectors.tokyo_cheapo import TokyoCheapoConnector
from connectors.eplus import EplusConnector
from connectors.pia import PiaConnector
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
    # 1. Songkick (Metro Areas)
    sk_connector = SongkickConnector()
    
    # Load Metro IDs from JSON
    metros_file = os.path.join(os.path.dirname(__file__), 'japan_metro_ids.json')
    if os.path.exists(metros_file):
        with open(metros_file, 'r', encoding='utf-8') as f:
            sk_metros_data = json.load(f)
        print(f"  [Songkick] Loaded {len(sk_metros_data)} metro areas from file.")
    else:
        print("  [Songkick] Warning: japan_metro_ids.json not found. using fallback.")
        sk_metros_data = {'30717': {'full_slug': '30717-japan-tokyo', 'name': 'Tokyo'}} # Fallback

    # Iterate
    for i, (mid, data) in enumerate(sk_metros_data.items()):
        metro_slug = data.get('full_slug')
        name = data.get('name', mid)
        print(f"  [Songkick] ({i+1}/{len(sk_metros_data)}) Scraping {name} ({metro_slug})...")
        try:
             events = sk_connector.get_metro_events(metro_id=metro_slug)
             print(f"    -> Found {len(events)} events.")
             all_events.extend(events)
        except Exception as e:
             print(f"    -> Failed: {e}")

    # 2. Resident Advisor (Disabled due to 403 blocks)
    # ra_connector = ResidentAdvisorConnector()
    # ...

    # 3. eplus (Japan Major Ticket Vendor)
    from connectors.eplus import EplusConnector
    # --- Eplus (Japan) ---
    print("\n--- Scraping Eplus (Japan) ---")
    try:
        eplus = EplusConnector()
        events = eplus.get_events()
        print(f"Found {len(events)} events from Eplus.")
        all_events.extend(events)
    except Exception as e:
        print(f"Eplus scraping failed: {e}")

    # --- Ticket Pia (Japan) ---
    print("\n--- Scraping Ticket Pia (Japan) ---")
    try:
        pia = PiaConnector()
        pia_events = pia.get_events()
        print(f"Found {len(pia_events)} events from Ticket Pia.")
        all_events.extend(pia_events)
    except Exception as e:
        print(f"Ticket Pia scraping failed: {e}")

    # 4. Tokyo Cheapo (Disabled)
    # tc_connector = TokyoCheapoConnector()
    # print("  [Cheapo] Scraping Top Events...")
    # try:
    #     tc_events = tc_connector.get_events()
    #     print(f"  [Cheapo] Found {len(tc_events)} events.")
    #     all_events.extend(tc_events)
    # except Exception as e:
    #     print(f"  [Cheapo] Error: {e}")


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
