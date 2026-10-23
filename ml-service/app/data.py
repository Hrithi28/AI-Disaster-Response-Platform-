"""Synthetic training data generators.

Real disaster datasets (EM-DAT, IMD feeds, NDMA reports) are not freely
redistributable in a ready-to-train form, so the platform ships with a
domain-informed synthetic generator. The generator encodes how responders
reason about severity (people affected, injuries, infrastructure damage,
hazard intensity) and adds noise so the model has to genuinely learn.
The feedback loop later fine-tunes the model on real resolved incidents.
"""
from __future__ import annotations

import random

import numpy as np
import pandas as pd

DISASTER_TYPES = ["flood", "cyclone", "earthquake", "fire", "landslide"]

SEVERITY_LABELS = {1: "Low", 2: "Moderate", 3: "High", 4: "Severe", 5: "Critical"}

FEATURES = [
    "disaster_type",
    "rainfall_mm",
    "wind_kmph",
    "magnitude",
    "water_level_m",
    "population_density",
    "affected_people",
    "injured",
    "infrastructure_damage",
    "report_count",
]

NUMERIC_FEATURES = FEATURES[1:]


def _hazard_intensity(row: dict) -> float:
    """0..1 hazard score that depends on the disaster type."""
    t = row["disaster_type"]
    if t == "flood":
        return min(1.0, row["rainfall_mm"] / 300 * 0.5 + row["water_level_m"] / 4 * 0.5)
    if t == "cyclone":
        return min(1.0, row["wind_kmph"] / 220 * 0.7 + row["rainfall_mm"] / 300 * 0.3)
    if t == "earthquake":
        return min(1.0, max(0.0, (row["magnitude"] - 3) / 5))
    if t == "landslide":
        return min(1.0, row["rainfall_mm"] / 250 * 0.6 + row["infrastructure_damage"] * 0.4)
    # fire
    return min(1.0, row["infrastructure_damage"] * 0.6 + row["wind_kmph"] / 100 * 0.4)


def severity_from_features(row: dict, noise: float = 0.0) -> int:
    hazard = _hazard_intensity(row)
    people = min(1.0, np.log1p(row["affected_people"]) / np.log1p(20000))
    injured = min(1.0, np.log1p(row["injured"]) / np.log1p(500))
    density = min(1.0, row["population_density"] / 30000)
    reports = min(1.0, np.log1p(row["report_count"]) / np.log1p(200))
    score = (
        0.30 * hazard
        + 0.22 * people
        + 0.22 * injured
        + 0.12 * row["infrastructure_damage"]
        + 0.08 * density
        + 0.06 * reports
        + noise
    )
    # map 0..1 -> 1..5
    return int(np.clip(np.digitize(score, [0.2, 0.36, 0.52, 0.68]) + 1, 1, 5))


def random_incident_features(rng: random.Random) -> dict:
    t = rng.choice(DISASTER_TYPES)
    big = rng.random()  # overall event scale
    row = {
        "disaster_type": t,
        "rainfall_mm": round(max(0.0, rng.gauss(40 + 220 * big, 40)) if t in ("flood", "cyclone", "landslide") else rng.uniform(0, 30), 1),
        "wind_kmph": round(max(0.0, rng.gauss(30 + 170 * big, 20)) if t == "cyclone" else rng.uniform(0, 60), 1),
        "magnitude": round(min(9.0, max(2.5, rng.gauss(3.5 + 4 * big, 0.5))) if t == "earthquake" else 0.0, 1),
        "water_level_m": round(max(0.0, rng.gauss(0.3 + 3.2 * big, 0.4)) if t in ("flood", "cyclone") else 0.0, 2),
        "population_density": int(rng.uniform(500, 30000)),
        "affected_people": int(max(0, rng.lognormvariate(3 + 5 * big, 0.8))),
        "injured": int(max(0, rng.lognormvariate(0.5 + 4 * big, 0.9))) if rng.random() > 0.15 else 0,
        "infrastructure_damage": round(min(1.0, max(0.0, rng.gauss(0.1 + 0.75 * big, 0.12))), 2),
        "report_count": int(max(1, rng.lognormvariate(1 + 3 * big, 0.6))),
    }
    return row


def make_severity_dataset(n: int = 4000, seed: int = 42) -> pd.DataFrame:
    rng = random.Random(seed)
    rows = []
    for _ in range(n):
        r = random_incident_features(rng)
        r["severity"] = severity_from_features(r, noise=rng.gauss(0, 0.035))
        rows.append(r)
    return pd.DataFrame(rows)


# --------------------------------------------------------------------------
# NLP report classification corpus
# --------------------------------------------------------------------------
REPORT_CATEGORIES = {
    "medical": [
        "{n} people injured near {loc}, need ambulance urgently",
        "elderly man having chest pain stranded at {loc}, no doctor available",
        "pregnant woman needs hospital, roads blocked in {loc}",
        "many people hurt after building collapse at {loc}, bleeding badly",
        "need medicines and first aid kits at relief camp {loc}",
        "child with high fever and breathing problem at {loc}",
        "diabetic patients running out of insulin in {loc}",
        "injured people waiting for medical help since morning in {loc}",
    ],
    "rescue": [
        "{n} people trapped on rooftop in {loc}, water rising fast",
        "family stuck inside house at {loc}, need boat rescue",
        "people trapped under debris after collapse in {loc}",
        "stranded in car, water up to the windows near {loc}",
        "need boats to evacuate residents of {loc} immediately",
        "kids and old people stuck on second floor at {loc}, please send rescue team",
        "fishermen missing off the coast near {loc}",
        "landslide buried two houses at {loc}, people inside",
    ],
    "food_water": [
        "no drinking water for two days in {loc}",
        "{n} families need food packets at {loc}",
        "relief camp at {loc} running out of food and water",
        "babies need milk powder in {loc}, shops closed",
        "drinking water contaminated in {loc}, need clean water cans",
        "please send rice and water bottles to {loc}",
        "community kitchen at {loc} has no supplies left",
    ],
    "shelter": [
        "houses flooded in {loc}, {n} people need shelter tonight",
        "roof blown off by wind at {loc}, family has nowhere to stay",
        "relief camp at {loc} is overcrowded, need more tents and blankets",
        "people sleeping on the road after houses collapsed in {loc}",
        "need temporary shelter for displaced families at {loc}",
    ],
    "infrastructure": [
        "bridge collapsed near {loc}, road cut off",
        "power lines down across main road at {loc}",
        "huge tree fallen blocking the road at {loc}",
        "subway flooded at {loc}, traffic completely stopped",
        "mobile network down in {loc} since last night",
        "water main burst and road caved in at {loc}",
        "electric transformer exploded at {loc}, power outage",
    ],
    "fire": [
        "fire spreading in warehouse near {loc}",
        "huge fire at chemical factory in {loc}, thick smoke",
        "gas cylinder blast caused fire at {loc}",
        "short circuit fire in flooded building at {loc}",
        "forest fire approaching houses near {loc}",
    ],
    "info": [
        "water level at {loc} has started receding",
        "is the relief camp at {loc} still open",
        "road to {loc} is now clear for traffic",
        "volunteers available at {loc} to help with distribution",
        "rain has stopped in {loc}, situation under control",
        "any update on school closures in {loc}",
    ],
}

URGENT_WORDS = ["urgent", "urgently", "immediately", "trapped", "dying", "bleeding", "please", "help", "rising fast", "sos", "critical", "asap"]

LOCALITIES = [
    "Velachery", "Tambaram", "Adyar", "T Nagar", "Anna Nagar", "Mudichur", "Pallikaranai",
    "Ennore", "Royapuram", "Porur", "Guindy", "Saidapet", "Sholinganallur", "Perungudi",
    "Kelambakkam", "Kodambakkam", "Thiruvanmiyur", "Ashok Nagar", "Chromepet", "Manali",
]


TAMIL_TEMPLATES = {
    "rescue": [
        "{loc} பகுதியில் {n} பேர் வெள்ளத்தில் சிக்கியுள்ளோம், உடனே படகு அனுப்புங்கள்",
        "வீட்டின் மாடியில் {n} பேர் சிக்கியுள்ளோம், தண்ணீர் உயர்கிறது, உதவி",
        "{loc} இல் குழந்தைகளும் முதியவர்களும் சிக்கியுள்ளனர், மீட்புக் குழு தேவை",
    ],
    "medical": [
        "{loc} இல் {n} பேர் காயமடைந்துள்ளனர், ஆம்புலன்ஸ் தேவை",
        "என் அப்பாவுக்கு நெஞ்சு வலி, {loc} இல் மருத்துவர் உடனே தேவை",
        "{loc} முகாமில் மருந்துகள் தேவை, குழந்தைகளுக்கு காய்ச்சல்",
    ],
    "food_water": [
        "{loc} இல் இரண்டு நாட்களாக குடிநீர் இல்லை",
        "{loc} இல் {n} குடும்பங்களுக்கு உணவு தேவை",
        "குழந்தைகளுக்கு பால் பவுடர் தேவை, {loc} கடைகள் மூடப்பட்டுள்ளன",
    ],
    "shelter": [
        "{loc} இல் வீடுகள் வெள்ளத்தில் மூழ்கியுள்ளன, {n} பேருக்கு தங்குமிடம் தேவை",
        "காற்றில் கூரை பறந்துவிட்டது, {loc} இல் தங்க இடமில்லை",
    ],
    "infrastructure": [
        "{loc} அருகே பாலம் இடிந்துள்ளது, சாலை துண்டிக்கப்பட்டுள்ளது",
        "{loc} இல் மின்கம்பிகள் சாலையில் விழுந்துள்ளன",
        "பெரிய மரம் விழுந்து {loc} சாலை அடைபட்டுள்ளது",
    ],
    "fire": [
        "{loc} இல் தொழிற்சாலையில் தீ விபத்து, அடர்ந்த புகை",
        "கேஸ் சிலிண்டர் வெடித்து {loc} இல் தீ பரவுகிறது",
    ],
    "info": [
        "{loc} இல் தண்ணீர் வடியத் தொடங்கியுள்ளது",
        "{loc} செல்லும் சாலை இப்போது சரியாக உள்ளது",
    ],
}

TAMIL_LOCALITY_NAMES = ["வேளச்சேரி", "தாம்பரம்", "அடையாறு", "முடிச்சூர்", "பள்ளிக்கரணை", "கிண்டி", "சைதாப்பேட்டை", "போரூர்", "எண்ணூர்", "மணலி"]


def make_report_corpus(per_template: int = 12, seed: int = 7) -> tuple[list[str], list[str]]:
    rng = random.Random(seed)
    texts, labels = [], []
    prefixes = ["", "", "pls ", "URGENT: ", "help ", "update: ", "SOS ", ""]
    suffixes = ["", "", " please help", " #ChennaiRains", " asap", " !!", ""]
    for label, templates in REPORT_CATEGORIES.items():
        for tpl in templates:
            for _ in range(per_template):
                txt = tpl.format(n=rng.randint(2, 60), loc=rng.choice(LOCALITIES))
                pre = rng.choice(prefixes) if label != "info" else rng.choice(["", "update: ", "fyi "])
                suf = rng.choice(suffixes) if label != "info" else rng.choice(["", " #ChennaiRains"])
                texts.append(f"{pre}{txt}{suf}")
                labels.append(label)
    for label, templates in TAMIL_TEMPLATES.items():
        for tpl in templates:
            for _ in range(per_template):
                texts.append(tpl.format(n=rng.randint(2, 60), loc=rng.choice(TAMIL_LOCALITY_NAMES)))
                labels.append(label)
    return texts, labels
