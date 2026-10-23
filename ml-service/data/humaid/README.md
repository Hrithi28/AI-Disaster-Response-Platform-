# Real crisis-tweet data (optional)

Download the **HumAID** dataset (Alam et al., ICWSM 2021) from https://crisisnlp.qcri.org/humaid_dataset
and copy its `.tsv` files (any event, e.g. `kerala_floods_2018_train.tsv`, `cyclone_*`, …) into this folder.

On the next start (or POST /retrain) the NLP classifier trains on the real tweets plus the built-in
English/Tamil corpus, and the AI Lab → Model comparison shows the real-data accuracy.

Label mapping used (HumAID → platform category):

| HumAID label | Category |
|---|---|
| injured_or_dead_people | medical |
| missing_or_found_people | rescue |
| displaced_people_and_evacuations | shelter |
| infrastructure_and_utility_damage | infrastructure |
| requests_or_urgent_needs | food_water |
| others (caution, sympathy, donations, not humanitarian) | info |
| dont_know_cant_judge | dropped |
