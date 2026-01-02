import os
from supabase import create_client, Client

from datetime import datetime
from zoneinfo import ZoneInfo
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
        event_dict = e.model_dump()
        # Serialize date and time
        if "date" in event_dict and event_dict["date"]:
            if not isinstance(event_dict["date"], str):
                event_dict["date"] = event_dict["date"].isoformat()
        if "time" in event_dict and event_dict["time"]:
             event_dict["time"] = event_dict["time"].isoformat()

        data.append(event_dict)

    # Perform upsert
    try:
        response = supabase.table("events").upsert(data, on_conflict="url").execute() 
    except Exception as e:
        print(f"Supabase upsert error: {e}")
        raise e


def delete_old_events(supabase: Client):
    """
    Delete past events.
    """
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
