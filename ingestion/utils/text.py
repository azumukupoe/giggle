import html
import unicodedata
from typing import Optional

def clean_text(text: Optional[str]) -> Optional[str]:
    if not text:
        return None
    
    text = html.unescape(text)

    text = unicodedata.normalize('NFKC', text)

    # Remove common hidden characters (\u200b, \ufeff, \u200e, \u200f)
    hidden_chars = ['\u200b', '\ufeff', '\u200e', '\u200f']
    for char in hidden_chars:
        text = text.replace(char, '')
        
    text = text.strip().replace('\xa0', ' ')
    return text if text else None
