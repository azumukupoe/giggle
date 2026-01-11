
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
        
    cleaned = text.strip()
    
    # direct match
    if cleaned in PREFECTURES_JP_TO_EN:
        return PREFECTURES_JP_TO_EN[cleaned]
    
    # Check if the text matches a value (English name) already
    # This prevents double normalization or returning English when English is passed
    # We can iterate values or just return if it looks like English?
    # Actually, if it's already "Tokyo", we want "Tokyo".
    if cleaned in PREFECTURES_JP_TO_EN.values():
        return cleaned

    # Try matching keys contained in text
    # e.g. "東京都渋谷区" -> "Tokyo" logic?
    # User requirement: "location with multiple values are not being normalized" 
    # and "normalize location to be in alphabets".
    # So if we see "東京都...", we should probably return "Tokyo".
    for jp_name, en_name in PREFECTURES_JP_TO_EN.items():
        if jp_name in cleaned:
            return en_name

    return PREFECTURES_JP_TO_EN.get(cleaned, text)
