import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

url: str = os.environ.get("SUPABASE_URL", "")
key: str = os.environ.get("SUPABASE_KEY", "")

def get_supabase_client() -> Client:
    if not url or not key:
        print("Warning: SUPABASE_URL or SUPABASE_KEY not found in environment.")
        # In production, we might want to raise an error
    return create_client(url, key)

def upsert_events(supabase: Client, events: list):
    """
    Upserts a list of Event objects into the 'events' table.
    Relies on the unique constraint (external_id, source).
    """
    if not events:
        return

    # Convert Event objects to dictionaries
    data = []
    for e in events:
        # Pydantic-style dict or manual
        if hasattr(e, "dict"):
            event_dict = e.dict()
        else:
            event_dict = {
                "title": e.title,
                "artist": e.artist,
                "venue": e.venue,
                "location": e.location,
                "date": e.date.isoformat(),
                "url": e.url,
                "image_url": e.image_url,
                "source": e.source,
                "external_id": str(e.external_id)
            }
        
        # Remove None values if necessary, or let DB handle defaults
        data.append(event_dict)

    # Perform upsert
    try:
        # 'on_conflict' needs columns that form the unique constraint
        response = supabase.table("events").upsert(data, on_conflict="external_id, source").execute()
        # print(f"Upsert Response: {response}") 
    except Exception as e:
        print(f"Supabase upsert error: {e}")
        raise e
