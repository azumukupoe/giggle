import os
from supabase import create_client, Client
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
    Upserts a list of Event objects into the 'events' table.
    Relies on the unique constraint (url).
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
                "date": e.date.isoformat(),
                "time": e.time.isoformat() if e.time else None,
                "venue": e.venue,
                "location": e.location,
                "url": e.url
            }
        

        data.append(event_dict)

    # Perform upsert
    try:
        response = supabase.table("events").upsert(data, on_conflict="url").execute() 
    except Exception as e:
        print(f"Supabase upsert error: {e}")
        raise e

def get_all_artists(supabase: Client) -> list[str]:
    """Fetch all unique artist names from the 'artists' table."""
    try:
        response = supabase.table("artists").select("name").execute()
        return [row['name'] for row in response.data]
    except Exception as e:
        print(f"Error fetching artists from DB: {e}")
        return []

def delete_old_events(supabase: Client):
    """
    Deletes events from the 'events' table that are in the past.
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
