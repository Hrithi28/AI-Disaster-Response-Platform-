"""Lightweight Tamil support that works fully offline.

Disaster messages in Chennai are often written in Tamil. Instead of calling a
cloud translation API (unavailable when the internet is down), we use a
stem lexicon of disaster vocabulary: Tamil stems are mapped to English
keywords and appended to the text, and the classifier is also trained on
Tamil examples, so character n-grams learn Tamil patterns directly.
"""
from __future__ import annotations

import re

TAMIL_RE = re.compile(r"[஀-௿]")

# stem -> english keywords (stems match inflected forms: சிக்கி → சிக்கியுள்ளோம்)
LEXICON = {
    "தொழிற்சாலை": "factory",
    "வெள்ள": "flood water",
    "சிக்கி": "trapped",
    "மாட்டி": "stuck",
    "உதவி": "help",
    "உடனே": "urgent immediately",
    "அவசர": "urgent emergency",
    "படகு": "boat rescue",
    "மீட்பு": "rescue",
    "காப்பாற்ற": "rescue save",
    "மாடி": "rooftop floor",
    "காய": "injured",
    "ஆம்புலன்ஸ்": "ambulance",
    "மருத்துவ": "doctor medical",
    "மருந்து": "medicines",
    "வலி": "pain",
    "காய்ச்சல்": "fever",
    "குடிநீர்": "drinking water",
    "தண்ணீர்": "water",
    "உணவு": "food",
    "சாப்பா": "food",
    "பால்": "milk",
    "அரிசி": "rice",
    "தங்குமிட": "shelter",
    "தங்க இட": "shelter",
    "வீடு": "houses",
    "கூரை": "roof",
    "முகாம": "relief camp",
    "பாலம்": "bridge collapsed",
    "சாலை": "road",
    "மின்கம்பி": "power lines down",
    "மின்சார": "power outage",
    "மரம்": "tree fallen",
    "தீ ": "fire",
    "தீ,": "fire",
    "தீவிபத்து": "fire",
    "புகை": "smoke",
    "வெடி": "blast",
    "பேர்": "people",
    "குடும்ப": "families",
    "குழந்தை": "children",
    "முதிய": "elderly",
    "தேவை": "need",
    "வடிய": "receding",
    "சரியாக": "clear",
    "மூழ்கி": "submerged flooded",
    "இடிந்து": "collapsed",
    "நிலச்சரிவு": "landslide",
    "நிலநடுக்க": "earthquake",
    "புயல்": "cyclone",
}

TAMIL_LOCALITIES = {
    "வேளச்சேரி": "Velachery", "தாம்பரம்": "Tambaram", "அடையாறு": "Adyar", "தி. நகர்": "T Nagar", "தியாகராய நகர்": "T Nagar",
    "அண்ணா நகர்": "Anna Nagar", "முடிச்சூர்": "Mudichur", "பள்ளிக்கரணை": "Pallikaranai", "எண்ணூர்": "Ennore", "ராயபுரம்": "Royapuram",
    "போரூர்": "Porur", "கிண்டி": "Guindy", "சைதாப்பேட்டை": "Saidapet", "சோழிங்கநல்லூர்": "Sholinganallur", "பெருங்குடி": "Perungudi",
    "கோடம்பாக்கம்": "Kodambakkam", "திருவான்மியூர்": "Thiruvanmiyur", "அசோக் நகர்": "Ashok Nagar", "குரோம்பேட்டை": "Chromepet",
    "மணலி": "Manali", "கோட்டூர்புரம்": "Kotturpuram",
}


def is_tamil(text: str) -> bool:
    return bool(TAMIL_RE.search(text or ""))


def stem(name: str) -> str:
    """Tamil place names inflect at the end (தாம்பரம் → தாம்பரத்தில்), so match on a stem."""
    if len(name) > 4 and (name.endswith("்") or name.endswith("ு")):
        return name[:-2]
    return name


def find_localities(text: str) -> list[str]:
    return list(dict.fromkeys(en for ta, en in TAMIL_LOCALITIES.items() if stem(ta) in text))


def translate_keywords(text: str) -> str:
    """Return an English keyword gloss of a Tamil message (empty for English)."""
    if not is_tamil(text):
        return ""
    t = f"{text} "
    words = []
    for st in sorted(LEXICON, key=len, reverse=True):  # longest stems first, then consume them
        if st in t:
            words.append(LEXICON[st])
            t = t.replace(st, " ")
    words += find_localities(text)
    nums = re.findall(r"(\d{1,5})\s*(?:பேர்|நபர்|குடும்ப)", t)
    words += [f"{n} people" for n in nums]
    return " ".join(dict.fromkeys(words))
