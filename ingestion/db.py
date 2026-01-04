import os
from supabase import create_client, Client
import html

from dotenv import load_dotenv

load_dotenv()

url: str = os.environ.get("SUPABASE_URL", "")
key: str = os.environ.get("SUPABASE_KEY", "")

def get_supabase_client() -> Client:
    if not url or not key:
        raise ValueError("SUPABASE_URL or SUPABASE_KEY not found in environment variables.")
    return create_client(url, key)


def sanitize_text(text: str) -> str:
    if not text:
        return text
    
    # 0. Decode HTML entities (e.g. &nbsp; -> space)
    text = html.unescape(text)

    # 1. Normalize unicode (NFKC)
    import unicodedata
    text = unicodedata.normalize('NFKC', text)
    
    # 2. Remove common hidden characters
    # \u200b: Zero-width space
    # \ufeff: Byte order mark
    # \u200e: Left-to-right mark
    # \u200f: Right-to-left mark
    hidden_chars = ['\u200b', '\ufeff', '\u200e', '\u200f']
    for char in hidden_chars:
        text = text.replace(char, '')
        
    return text.strip()

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
        
        # Sanitize string fields
        for k, v in event_dict.items():
            if isinstance(v, str):
                event_dict[k] = sanitize_text(v)

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



def delete_missing_events(supabase: Client, source_urls: dict[str, list[str]]):
    """
    Delete events from DB that were NOT found in the current ingestion run,
    but belong to sources that successfully ran.
    
    source_urls: dict where key is source name (e.g. "Songkick") and value is list of found URLs.
    """
    print("--- Deleting missing events (sync) ---")
    
    source_patterns = {
        "Songkick": "songkick.com",
        "Eplus": "eplus.jp",
        "Pia": "pia.jp"
    }

    for source, found_urls in source_urls.items():
        pattern = source_patterns.get(source)
        if not pattern:
            print(f"  [Warn] No URL pattern defined for source '{source}'. Skipping clean up.")
            continue
            
        found_set = set(found_urls)
        print(f"  [{source}] Checking for missing events... (Found {len(found_set)} in this run)")
        
        # Fetch all DB URLs for this source
        db_urls = set()
        page = 0
        page_size = 1000
        has_more = True
        
        try:
            while has_more:
                res = supabase.table("events").select("url").ilike("url", f"%{pattern}%").range(page*page_size, (page+1)*page_size - 1).execute()
                rows = res.data
                
                if not rows:
                    break
                    
                for row in rows:
                    if row.get('url'):
                        db_urls.add(row['url'])
                
                if len(rows) < page_size:
                    has_more = False
                page += 1
                
            # Determine what to delete
            to_delete = list(db_urls - found_set)
            
            if to_delete:
                print(f"    -> Found {len(to_delete)} events in DB that are missing from verify source. Deleting...")
                # Batch delete
                chunk_size = 200
                for i in range(0, len(to_delete), chunk_size):
                    chunk = to_delete[i:i+chunk_size]
                    try:
                        supabase.table("events").delete().in_("url", chunk).execute()
                    except Exception as e:
                        print(f"      Error deleting chunk {i}: {e}")
                print(f"    -> Cleanup complete for {source}.")
            else:
                print(f"    -> Source {source} is in sync.")
                
        except Exception as e:
            print(f"  [{source}] Error during cleanup: {e}")
