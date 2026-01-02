import os
from supabase import create_client, Client
import unicodedata
from dotenv import load_dotenv

load_dotenv()

url: str = os.environ.get("SUPABASE_URL", "")
key: str = os.environ.get("SUPABASE_KEY", "")

def get_supabase_client() -> Client:
    if not url or not key:
        raise ValueError("SUPABASE_URL or SUPABASE_KEY not found in environment variables.")
    return create_client(url, key)

def upsert_events(supabase: Client, events: list):
    """
    Upsert events (url constrained).
    """
    if not events:
        return

    # Convert Event objects to dictionaries
    data = []
    for e in events:

        if hasattr(e, "model_dump"):
            event_dict = e.model_dump()
            # Serialize date and time
            if "date" in event_dict and event_dict["date"]:
                if isinstance(event_dict["date"], str):
                     # keep as is
                     pass
                else:
                    event_dict["date"] = event_dict["date"].isoformat()
            if "time" in event_dict:
                if event_dict["time"]:
                    event_dict["time"] = event_dict["time"].isoformat()
                else:
                    event_dict["time"] = None
        else:
            event_dict = {
                "event": e.event,
                "ticket": e.ticket,
                "performer": e.performer,
                "date": e.date if isinstance(e.date, str) else e.date.isoformat(),
                "time": e.time.isoformat() if e.time else None,
                "venue": e.venue,
                "location": e.location,
                "url": e.url
            }

        # Normalize strings and handle empty
        for key in ["event", "ticket", "performer", "venue", "location", "date"]:
            if key in event_dict:
                val = event_dict[key]
                if isinstance(val, str):
                    # Normalize using NFKC (converts full-width alphanumeric to half-width)
                    val = unicodedata.normalize("NFKC", val).strip()
                    # Convert empty strings to None (except maybe 'event' if strictly required, but usually title is needed. 
                    # If empty title, Supabase might reject or store empty. Empty string is cleaner than None for required fields? 
                    # But previous logic converted specific fields to None. I will keep that logic but applied to all if empty.)
                    if val == "":
                        # 'event', 'venue', 'location', 'url' are NOT optional in Event model, but strictly speaking in DB?
                        # DB schema likely allows nulls or has defaults. 
                        # Previous code only converted "ticket", "performer", "venue", "location" to None.
                        # I'll replicate that behavior but ensure normalization first.
                        pass
                    
                    event_dict[key] = val

        # Convert empty fields to None
        for key in ["ticket", "performer", "venue", "location"]:
            if key in event_dict and event_dict[key] == "":
                event_dict[key] = None

        data.append(event_dict)

    # Perform upsert
    try:
        response = supabase.table("events").upsert(data, on_conflict="url").execute() 
    except Exception as e:
        print(f"Supabase upsert error: {e}")
        raise e

def get_all_artists(supabase: Client) -> list[str]:
    """Fetch all artist names"""
    try:
        response = supabase.table("artists").select("name").execute()
        return [row['name'] for row in response.data]
    except Exception as e:
        print(f"Error fetching artists from DB: {e}")
        return []

def delete_old_events(supabase: Client):
    """
    Delete past events.
    """
    from datetime import datetime
    from zoneinfo import ZoneInfo
    
    today_iso = datetime.now(ZoneInfo("Asia/Tokyo")).date().isoformat()
    
    print("Deleting old events...")
    try:
        # Compare against date column (YYYY-MM-DD)
        response = supabase.table("events").delete().lt("date", today_iso).execute()
        if response.data:
            print(f"  -> Deleted {len(response.data)} old events.")
        else:
            print("  -> No old events found to delete.")
    except Exception as e:
        print(f"Error deleting old events: {e}")
