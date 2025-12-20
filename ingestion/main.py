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

    artists_to_sync = [args.artist] if args.artist else ["Radiohead", "Daft Punk"] # Default/Test list

    all_events: List[Event] = []

    for artist in artists_to_sync:
        print(f"Syncing artist: {artist}")
        for connector in connectors:
            print(f"  Fetching from {connector.__class__.__name__}...")
            events = connector.get_artist_events(artist)
            print(f"    Found {len(events)} events.")
            all_events.extend(events)

    # Save to Supabase (Mocked for now until DB is properly set up with a table)
    # supabase = get_supabase_client()
    print(f"Total events found: {len(all_events)}")
    for e in all_events:
        print(f" - {e.title} @ {e.venue} ({e.date})")

if __name__ == "__main__":
    main()
