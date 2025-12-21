import os
import argparse
from typing import List
from db import get_supabase_client
from connectors.base import Event
from connectors.bandsintown import BandsInTownConnector
from connectors.songkick import SongkickConnector
from connectors.seatgeek import SeatGeekConnector
from connectors.ticketmaster import TicketmasterConnector

def main():
    parser = argparse.ArgumentParser(description="Ingest concert data")
    parser.add_argument("--artist", type=str, help="Ingest for a specific artist")
    args = parser.parse_args()

    # Load enabled connectors
    connectors = [
        BandsInTownConnector(),
        SongkickConnector(),
        SeatGeekConnector(),
        TicketmasterConnector(),
        # Scrapers excluded from default run to avoid bans unless explicitly tested
    ]

    if args.artist:
        artists_to_sync = [args.artist]
    else:
        # Dynamic Sync: Fetch from DB
        try:
            from db import get_supabase_client, get_all_artists
            supabase = get_supabase_client()
            db_artists = get_all_artists(supabase)
            if db_artists:
                 print(f"Loaded {len(db_artists)} artists from database.")
                 artists_to_sync = db_artists
            else:
                 print("No artists in database. Defaulting to test list.")
                 artists_to_sync = ["Radiohead", "Daft Punk"]
        except Exception as e:
             print(f"Failed to load artists from DB: {e}")
             artists_to_sync = ["Radiohead", "Daft Punk"]

    all_events: List[Event] = []

    # --- PHASE 1: Japan Discovery (Broad Search) ---
    # Fetch general upcoming music in Japan to populate the feed even without user artists.
    print("--- Phase 1: Japan Discovery (Ticketmaster) ---")
    tm_connector = TicketmasterConnector()
    discovery_events = tm_connector.get_events(country_code="JP", limit=50)
    print(f"  Found {len(discovery_events)} discovery events in Japan.")
    all_events.extend(discovery_events)

    # --- PHASE 2: Personalized/Specific Scrape ---
    for artist in artists_to_sync:
        print(f"Syncing artist: {artist}")
        for connector in connectors:
            print(f"  Fetching from {connector.__class__.__name__}...")
            events = connector.get_artist_events(artist)
            print(f"    Found {len(events)} events.")
            
            # Japan Geofencing
            japan_events = [
                e for e in events 
                if e.location and ("Japan" in e.location or "JP" in e.location or "Tokyo" in e.location or "Osaka" in e.location or "Kyoto" in e.location)
            ]
            if len(japan_events) < len(events):
                print(f"    Filtered {len(events) - len(japan_events)} non-Japan events.")

            all_events.extend(japan_events)

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
    for e in all_events:
        print(f" - {e.title} @ {e.venue} ({e.date})")

if __name__ == "__main__":
    main()
