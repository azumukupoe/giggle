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
        supabase.table("events").upsert(data, on_conflict="url").execute() 
    except Exception as e:
        print(f"Supabase upsert error: {e}")
        raise e

def delete_old_events(supabase: Client):
    """
    Delete past events.
    """
    dt_today = datetime.now(ZoneInfo("Asia/Tokyo")).date()
    today_iso = dt_today.isoformat()
    
    print("Deleting old events...")
    ids_to_delete = []
    
    try:
        # Fetch candidates that look old (lexicographically < today)
        # This includes valid ranges that started in past but end in future (false positives).
        # We must verify them in Python.
        
        page = 0
        page_size = 1000
        has_more = True
        
        while has_more:
            # Fetch batch of candidates
            res = supabase.table("events").select("url, date").lt("date", today_iso).range(page*page_size, (page+1)*page_size - 1).execute()
            rows = res.data
            
            if not rows:
                break
            
            for row in rows:
                d_str = row.get('date')
                if not d_str:
                    continue
                
                # Verify if TRULY past
                # Handle space-separated ranges like "2026-01-04 2026-01-31"
                parts = d_str.split()
                any_future = False
                parsed_count = 0
                
                for part in parts:
                    try:
                        # Clean potential whitespace or weirdness
                        clean_part = part.strip()[:10]
                        p_date = datetime.strptime(clean_part, '%Y-%m-%d').date()
                        parsed_count += 1
                        if p_date >= dt_today:
                            any_future = True
                            break
                    except ValueError:
                        pass
                
                # If any date in the string is today or future, KEEP IT.
                if any_future:
                    continue
                
                # If we parsed valid dates and NONE were future, it is safe to delete.
                if parsed_count > 0:
                    ids_to_delete.append(row['url'])
            
            if len(rows) < page_size:
                has_more = False
            page += 1
            
        if ids_to_delete:
            print(f"  -> Found {len(ids_to_delete)} confirmed old events. Deleting...")
            # Batch delete
            chunk_size = 200
            for i in range(0, len(ids_to_delete), chunk_size):
                chunk = ids_to_delete[i:i+chunk_size]
                try:
                    supabase.table("events").delete().in_("url", chunk).execute()
                except Exception as e:
                    print(f"    Error deleting chunk {i}: {e}")
            print("  -> Cleanup complete.")
        else:
            print("  -> No old events found to delete.")
            
    except Exception as e:
        print(f"Error deleting old events: {e}")
