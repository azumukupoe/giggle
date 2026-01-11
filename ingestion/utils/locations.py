
# Mapping from Japanese prefecture names to Romanized (English) names
PREFECTURES_JP_TO_EN = {
    "北海道": "Hokkaido",
    "青森県": "Aomori",
    "岩手県": "Iwate",
    "宮城県": "Miyagi",
    "秋田県": "Akita",
    "山形県": "Yamagata",
    "福島県": "Fukushima",
    "茨城県": "Ibaraki",
    "栃木県": "Tochigi",
    "群馬県": "Gunma",
    "埼玉県": "Saitama",
    "千葉県": "Chiba",
    "東京都": "Tokyo",
    "神奈川県": "Kanagawa",
    "新潟県": "Niigata",
    "富山県": "Toyama",
    "石川県": "Ishikawa",
    "福井県": "Fukui",
    "山梨県": "Yamanashi",
    "長野県": "Nagano",
    "岐阜県": "Gifu",
    "静岡県": "Shizuoka",
    "愛知県": "Aichi",
    "三重県": "Mie",
    "滋賀県": "Shiga",
    "京都府": "Kyoto",
    "大阪府": "Osaka",
    "兵庫県": "Hyogo",
    "奈良県": "Nara",
    "和歌山県": "Wakayama",
    "鳥取県": "Tottori",
    "島根県": "Shimane",
    "岡山県": "Okayama",
    "広島県": "Hiroshima",
    "山口県": "Yamaguchi",
    "徳島県": "Tokushima",
    "香川県": "Kagawa",
    "愛媛県": "Ehime",
    "高知県": "Kochi",
    "福岡県": "Fukuoka",
    "佐賀県": "Saga",
    "長崎県": "Nagasaki",
    "熊本県": "Kumamoto",
    "大分県": "Oita",
    "宮崎県": "Miyazaki",
    "鹿児島県": "Kagoshima",
    "沖縄県": "Okinawa"
}

def normalize_to_romanized_prefecture(text: str) -> str:
    """
    Normalizes a location string to its Romanized prefecture name if it matches a known Japanese prefecture.
    Returns the original text if no match is found.
    """
    if not text:
        return text
        
    # direct match
    if text in PREFECTURES_JP_TO_EN:
        return PREFECTURES_JP_TO_EN[text]
    
    # partial match check (e.g. "東京都 (Tokyo)" or "Tokyo, Japan" handling might be needed later, 
    # but for now we stick to simple replacement if the string IS the prefecture or contains it?)
    # The requirement is "normalize location to be in alphabets".
    # Often scrapers might return "東京都" exactly.
    
    # Let's try to find if the text *contains* a prefecture name
    # But be careful about false positives? Unlikely with full prefecture names including 'to/fu/ken'.
    
    for jp_name, en_name in PREFECTURES_JP_TO_EN.items():
        if jp_name in text:
            # If the text is just the prefecture, return the English name
            if text == jp_name:
                return en_name
            # If it contains it, maybe we should replace it?
            # For now, let's assume the location field might be just the prefecture or need full replacement.
            # If the user's intent is "normalize to alphabets", replacing "東京都渋谷区" with "Tokyo" might be lossy.
            # But replacing "東京都" with "Tokyo" is correct.
            # Let's stick to exact match or simple replacement if it's the dominant part?
            
            # Re-reading: "normalize location to be in alphabets"
            # If I have "東京都", I want "Tokyo".
            # If I have "Tokyo", I keep "Tokyo".
            pass

    return PREFECTURES_JP_TO_EN.get(text, text)
