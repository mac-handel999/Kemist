# Kemist 💊

#By:  **{FABIAN CODES HQ}**

**Kemist** is a medicine information and pharmaceutical data platform focused on improving access to reliable drug information, particularly within Nigeria.

The project aims to bring essential medicine information into one searchable platform, helping users discover medicines, understand their ingredients, identify registered pharmaceutical products, and access relevant drug information.

## 🎯 Project Goals

Kemist aims to provide a centralized platform for:

- Searching medicines by brand name or generic name.
- Accessing NAFDAC registration numbers and registration statuses.
- Viewing active ingredients, strengths, dosage forms, and compositions.
- Discovering pharmaceutical manufacturers and applicants.
- Accessing medicine indications, dosage information, contraindications, warnings, and side effects.
- Viewing available medicine images.
- Comparing medicine prices from available and verifiable sources.
- Building a structured, searchable pharmaceutical database.

## ✨ Key Features

- **Medicine Search:** Search for medicines using brand names, generic names, or active ingredients.
- **NAFDAC Records:** Access structured information about registered pharmaceutical products.
- **Drug Information:** Explore available product details, ingredients, strengths, and dosage forms.
- **Clinical Information:** Integrate drug information from reliable clinical data sources.
- **Manufacturer Directory:** Discover pharmaceutical companies, manufacturers, and product applicants.
- **Medicine Pricing:** Collect and organize medicine price observations from available sources.
- **Medicine Images:** Support product identification through properly sourced and reviewed images.

*Features are being developed progressively. Data availability and verification status may vary by medicine and source.*

## 🛠️ Technology Stack

Kemist is being developed with:

- **Frontend:** HTML, CSS, JavaScript
- **Backend:** Node.js and Express.js
- **Database:** Supabase PostgreSQL
- **Storage:** Supabase Storage
- **Data Collection:** Apify and external pharmaceutical data sources
- **Clinical Data:** DailyMed, openFDA, and other relevant sources
- **Automation:** Scheduled data ingestion and synchronization workflows

## 🗂️ Data Sources

Kemist is designed to integrate information from multiple sources, including:

| Source | Purpose |
|---|---|
| [NAFDAC Greenbook](https://greenbook.nafdac.gov.ng/) | Nigerian registered medicine records |
| [Apify](https://apify.com/) | Data extraction and ingestion workflows |
| [DailyMed](https://dailymed.nlm.nih.gov/) | Structured drug labeling information |
| [openFDA](https://open.fda.gov/) | Drug labeling and pharmaceutical information |
| [EMDEX](https://api.emdex.org/) | Potential licensed Nigerian pharmaceutical data integration |
| [Nigeria Essential Medicines List](https://health.gov.ng/) | Essential medicine reference information |

Each source is subject to its own terms, licensing conditions, and data usage restrictions.

## 🏗️ Project Architecture

Kemist follows a data-ingestion architecture designed to collect, normalize, validate, and store pharmaceutical information.

```text
External Data Sources
        |
        v
Data Collection & Ingestion
        |
        v
Normalization & Validation
        |
        v
Supabase PostgreSQL
        |
        v
Node.js / Express API
        |
        v
Kemist Frontend
```

The long-term goal is to maintain a structured database that can be queried directly by the application without depending on external data providers for every user request.

## 🚀 Project Status

<escape>🚧</escape> **Under Active Development**

Kemist is currently in its foundational development stage. Work is focused on:

- Building the pharmaceutical database structure.
- Implementing NAFDAC data ingestion.
- Integrating external clinical drug information.
- Developing medicine search and API endpoints.
- Establishing data validation and synchronization workflows.
- Expanding medicine pricing and image datasets.

## 🔐 Data Accuracy & Disclaimer

Kemist is an informational pharmaceutical data project. It is not a substitute for professional medical advice, diagnosis, or treatment.

Medicine registration information, clinical details, and prices may change over time. Information should be checked against authoritative sources and qualified healthcare professionals before making healthcare decisions.

Kemist does not claim that a medicine is genuine, safe, or suitable for an individual solely because it appears in its database.

## 🤝 Contributions

Contributions, suggestions, bug reports, and ideas are welcome as the project develops.

If you would like to contribute:

1. Fork the repository.
2. Create a new feature branch.
3. Make your changes.
4. Submit a pull request with a clear description.

## 📄 License

This project is intended to use the **Apache License 2.0**.

See the `LICENSE` file for the full license terms.

---

**Kemist** — Building structured access to pharmaceutical information, one medicine at a time.
