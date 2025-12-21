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

    all_events: List[Event] = []

    # --- PHASE 1: Japan Discovery (Broad Search) ---
    # Fetch general upcoming music in Japan to populate the feed.
    # We rely on Songkick's Metro Area for broad discovery (Ticketmaster Japan API proved empty).
    print("--- Phase 1: Japan Discovery (Songkick Tokyo) ---")
    sk_connector = SongkickConnector()
    discovery_events = sk_connector.get_metro_events(metro_id="30717-japan-tokyo")
    print(f"  Found {len(discovery_events)} discovery events in Tokyo.")
    all_events.extend(discovery_events)
    
    # Note: Other connectors (Songkick, BandsInTown) are artist-centric. 
    # Without a specific artist list, we skip them for the general public directory.

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
