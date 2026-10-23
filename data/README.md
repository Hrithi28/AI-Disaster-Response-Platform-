# Real data used by the platform

| Data | Source | Licence | Used for |
|---|---|---|---|
| `data/osm/chennai-streets.osm.pbf` (7 MB) | OpenStreetMap street extract of Greater Chennai (via github.com/mohammadamir0762-arch/Chennai_transit) | © OpenStreetMap contributors, **ODbL 1.0** | Offline street map tiles, offline road routing, street-name geocoding |
| `ml-service/data/real/figure_eight_messages.csv` (26,166 messages) | Figure Eight / Appen *Multilingual Disaster Response Messages* — Haiti & Chile earthquakes 2010, Pakistan floods 2010, Super-storm Sandy 2012, disaster news (mirror: github.com/prateeksawhney97/Disaster-Response-Pipeline) | Released by Figure Eight for public research use | Training + **real held-out evaluation** of the report classifier |
| `frontend/public/offline/fonts/*` | Noto Sans glyphs (github.com/protomaps/basemaps-assets) | SIL Open Font License | Street-name labels on the offline map |
| Live: Open-Meteo forecast API | open-meteo.com | CC BY 4.0 | Rainfall / wind for 5 Chennai stations, IMD rainfall categories |
| Live: USGS earthquake feed | earthquake.usgs.gov (GeoJSON) | Public domain | Earthquakes within 2,500 km of Chennai |
| Live: GDACS alerts | gdacs.org (RSS) | Free use with attribution | Cyclone / flood / earthquake alerts for India & neighbours |
| Optional: HumAID tweets | crisisnlp.qcri.org | Research licence (download yourself) | Extra real training data (`ml-service/data/humaid/`) |

## Rebuilding the offline map from a newer OSM extract

```bash
pip install osmium pmtiles
# build tippecanoe once: git clone https://github.com/felt/tippecanoe && cd tippecanoe && make
TIPPECANOE=/path/to/tippecanoe python tools/map/build_offline_map.py path/to/chennai.osm.pbf
```

Any city works: download an extract (e.g. from download.geofabrik.de or extract.bbbike.org), run the
script, and the street map, road graph and gazetteer are regenerated.

## Rebuilding the real NLP dataset

```bash
python ml-service/scripts/prepare_figure_eight.py disaster_messages.csv disaster_categories.csv
```
