#!/bin/bash
API_KEY="Jz9KjntQHbQpkcMH9KN97dd8KMfgCqqmzjL8L9MR"
INGREDIENTS=("acetaminophen" "ibuprofen" "amoxicillin" "azithromycin" "ciprofloxacin" "metronidazole" "omeprazole" "amlodipine" "losartan" "metformin" "atorvastatin" "lisinopril" "gabapentin" "prednisone" "hydrochlorothiazide" "levothyroxine" "atorvastatin" "amlodipine" "omeprazole" "esomeprazole" "pantoprazole" "ranitidine" "famotidine" "loratadine" "cetirizine" "fexofenadine" "montelukast" "fluticasone" "budesonide" "albuterol" "salmeterol" "tiotropium" "insulin" "metformin" "glipizide" "glyburide" "pioglitazone" "sitagliptin" "linagliptin" "empagliflozin" "canagliflozin" "dapagliflozin")

mkdir -p labels
for ing in "${INGREDIENTS[@]}"; do
  echo "Downloading $ing..."
  curl -s "https://api.fda.gov/drug/label.json?api_key=$API_KEY&search=openfda.generic_name:$ing&limit=50" > "labels/${ing}.json"
  sleep 1
done
