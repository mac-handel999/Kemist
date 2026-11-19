# Kemist 💊

#Built BY: ##**{FABIAN CODES HQ}**

**Check a medicine's NAFDAC registration and find pharmacies, clinics and hospitals near you in Nigeria.**

Kemist is a Nigerian medicine-information and nearby-facility discovery Progressive Web App (PWA). It combines pharmaceutical information, medicine registration lookup, nearby healthcare facility discovery, and community concern reporting.

Built with plain HTML, CSS, JavaScript, Node.js, Express, and Supabase PostgreSQL.

AI-powered features are planned for future development.

## ✨ Features

- **Medicine Search:** Search medicines by brand name, generic name, active ingredient, company, or NAFDAC Registration Number (NRN).
- **NAFDAC Registration Lookup:** Check available registration records and display their source timestamps.
- **Similar Medicine Brands:** Find other brands containing the same active ingredient.
- **Nearby Healthcare Facilities:** Discover pharmacies, hospitals, clinics, and laboratories near your location.
- **Interactive Map:** Explore nearby facilities using Leaflet and OpenStreetMap.
- **Community Reports:** Submit medicine-related concerns through a rate-limited reporting endpoint.
- **Progressive Web App:** Installable application with basic offline app-shell caching.
- **Demo Mode:** Explore the application using sample medicine records without configuring Supabase.

## 🛠️ Technology Stack

| Technology | Purpose |
| --- | --- |
| HTML5 | Application structure |
| CSS3 | Styling and responsive interface |
| Vanilla JavaScript | Frontend functionality |
| Node.js | Backend runtime |
| Express.js | REST API |
| Supabase PostgreSQL | Medicine and facility database |
| PostGIS | Geographic and location-based queries |
| Leaflet | Interactive maps |
| OpenStreetMap | Geographic data and map tiles |
| Apify | NAFDAC Greenbook data ingestion |
| PWA / Service Worker | Installation and offline app-shell caching |

## 🚀 Run It in 2 Minutes (Demo Mode)

Clone the repository and install the dependencies:

```bash
git clone <YOUR_REPOSITORY_URL>
cd kemist
npm install
```

Start the application:

```bash
npm start
```

Open:

```text
http://localhost:3000
```

With no Supabase keys configured, Kemist runs using 10 sample medicine records, clearly labelled **Demo data**.

The map also works in demo mode. Nearby places are retrieved live from OpenStreetMap and kept in memory.

### Running Locally

Always open the application through Express:

```bash
npm start
```

Or use development mode with automatic restart:

```bash
npm run dev
```

Visit:

```text
http://localhost:3000
```

The application must be served through Express because its asset URLs are root-absolute, including:

```text
/css/app.css
/js/app.js
/manifest.json
```

**Important:** Opening the application directly through `file://` or using Live Server at the project root will not work correctly. Stylesheets and scripts may return 404 errors, causing the page to render incorrectly, including unstyled SVG icons.

## 🗄️ Go Live With Your Own Database

To use your own Supabase database:

### 1. Create a Supabase project

Create a project at:

<https://supabase.com/>

Enable PostGIS if it is not already enabled.

### 2. Set up the database schema

Open the Supabase SQL Editor.

Paste the contents of:

```text
supabase/schema.sql
```

Run the SQL script to create the required tables and database structures.

### 3. Configure environment variables

Copy the example environment file:

```bash
cp .env.example .env
```

Fill in your Supabase credentials:

```env
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

Find these credentials under:

**Supabase Dashboard → Project Settings → API**

The service-role key is strictly server-side.

Never put it inside the `public/` directory, expose it in frontend JavaScript, or commit `.env` to GitHub.

### 4. Load medicine data

Follow the NAFDAC data import instructions below.

### 5. Start Kemist

```bash
npm start
```

## 📥 Load NAFDAC Data (Apify Greenbook Actor)

Kemist supports importing NAFDAC Greenbook records through a community-maintained Apify Actor.

The application does not automatically scrape NAFDAC without a reviewed import process.

Before importing, confirm the source's current terms and permitted data reuse.

### 1. Configure Apify

Create an Apify account:

<https://apify.com/>

Open the Greenbook Actor:

<https://apify.com/a-g-d/ng-nafdac>

In your `.env` file, configure:

```env
APIFY_TOKEN=your_apify_token
APIFY_ACTOR_ID=username~actor-name
APIFY_INPUT={"maxItems":100}
```

Use the actual Actor ID from its Apify page. Check the Actor's **Input** tab for the correct input field names.

### 2. Perform a dry run first

```bash
npm run sync:drugs -- --dry
```

The dry run prints mapped records alongside their original source records.

If any field is incorrect or empty, adjust the field-name mapping lists at the top of:

```text
src/lib/nafdac.js
```

### 3. Import the records

Once the mapping is correct:

```bash
npm run sync:drugs
```

You can also import using a specific dataset ID:

```bash
npm run sync:drugs -- --dataset <id>
```

Or import a previously exported JSON file:

```bash
npm run sync:drugs -- --file export.json
```

Start with a small number of records and increase `maxItems` after confirming the imported data is correct.

### 4. Automated synchronization

The workflow:

```text
.github/workflows/sync-nafdac.yml
```

is configured to synchronize NAFDAC records weekly.

Add the four required secrets to your GitHub repository's Actions secrets according to the workflow configuration.

Every import preserves:

- Original source records in `source_records`.
- Import history in `sync_logs`.

This supports traceability, troubleshooting, and future data auditing.

## 🏗️ How Kemist Works

Kemist uses a database-centered architecture to collect, organize, and serve pharmaceutical and healthcare facility information.

```text
         External Data Sources
                  |
                  v
          Data Ingestion
                  |
                  v
        Normalization & Validation
                  |
                  v
          Supabase PostgreSQL
              + PostGIS
                  |
                  v
          Node.js / Express
                  |
          +-------+-------+
          |       |       |
          v       v       v
        Drugs  Facilities Reports
          |       |       |
          +-------+-------+
                  |
                  v
             Kemist PWA
```

### Medicine Lookup

The medicine API supports:

- Searching by medicine name, ingredient, company, and NRN.
- Typo-tolerant search.
- Checking available registration records.
- Retrieving individual medicine details.
- Finding other brands containing the same ingredient.

### Nearby Facility Discovery

The facility API uses geographic coordinates to find nearby healthcare facilities.

On the first visit to an area, Kemist retrieves pharmacies, hospitals, clinics, and laboratories from OpenStreetMap once per approximately 5 km grid cell.

Retrieved records are saved in the `facilities` table and served from the database afterward.

The maximum search radius is 5 km.

### Community Reporting

Users can submit medicine-related concerns through the reporting endpoint.

Reports are rate-limited and protected with a honeypot mechanism before being stored in the `reports` table.

Reports can be reviewed through the Supabase Dashboard.

## 🔌 API Endpoints

### Medicine API

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/api/drugs?q=` | Search medicines by name, ingredient, company, or NRN |
| GET | `/api/drugs/verify?nrn=` | Check available registration records |
| GET | `/api/drugs/:id` | Retrieve medicine details |
| GET | `/api/drugs/:id/similar` | Find other brands with the same ingredient |

### Healthcare Facility API

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/facilities/nearby?lat=&lng=&radius=&types=` | Retrieve nearby healthcare facilities |

Example:

```text
/api/facilities/nearby?lat=6.45&lng=3.39&radius=5000
```

### Community Reports API

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/reports` | Submit a community concern report |

## ⚠️ Safety Rules

Kemist includes important safety boundaries that must remain in place.

### 1. Registration Does Not Prove Authenticity

A registration-number match never means that a physical medicine pack is genuine.

Counterfeit products can copy valid NAFDAC registration numbers.

Kemist must never label a physical medicine pack "genuine" or "fake" based only on a database match.

The relevant wording is maintained in:

```text
src/routes/drugs.js
```

and the frontend interface.

For physical product authentication, users should be directed to NAFDAC's current official pack-authentication channels.

NAFDAC Greenbook:

<https://greenbook.nafdac.gov.ng/>

### 2. Not Found Does Not Mean Unregistered

When a medicine is not found, Kemist should say:

**"Not in our copy."**

It should direct users to the official NAFDAC Greenbook for further checking.

An absent record in Kemist's database is not proof that a medicine is unregistered.

### 3. Facility Verification

Facility information retrieved from OpenStreetMap may be inaccurate or outdated.

No facility should be marked as verified until a human administrator has checked its current licence and relevant details.

Verification status is maintained through:

```text
facilities.is_verified
```

### 4. Medical Disclaimer

Kemist is an informational platform and is not medical advice.

It does not replace professional medical consultation, diagnosis, or treatment.

Users should consult qualified healthcare professionals before making medical decisions.

## 🔐 Security and Data Protection

Kemist should follow appropriate security and privacy practices:

- Keep Supabase service-role credentials exclusively on the backend.
- Never expose database secrets in frontend JavaScript.
- Use restrictive Supabase Row Level Security (RLS) policies.
- Validate and sanitize incoming API requests.
- Apply rate limiting and abuse protection.
- Use HTTPS in production.
- Protect community reports and administrative operations.
- Avoid collecting patient diagnoses or unnecessary sensitive health information.

The legal basis for processing personal data must be reviewed under the Nigeria Data Protection Act.

## 🚧 Before You Launch Publicly

The following should be reviewed and completed before a public production launch:

- [ ] Confirm NAFDAC's terms for storing and republishing Greenbook data.
- [ ] Review the community-maintained Apify Actor and its data extraction behaviour.
- [ ] Confirm the emergency number used in `public/js/app.js` (currently 112) before publishing.
- [ ] Confirm NAFDAC's current pack-verification channels.
- [ ] Use a dedicated map tile provider for production traffic instead of relying on the public OpenStreetMap tile server.
- [ ] Confirm tile-provider usage limits, attribution, and licensing requirements.
- [ ] Self-host Leaflet and fonts where appropriate, including Subresource Integrity (SRI) where applicable.
- [ ] Deploy over HTTPS because browser geolocation requires a secure context.
- [ ] Add an administrative interface for reviewing reports.
- [ ] Add facility claim and manual verification workflows.
- [ ] Add automated tests.
- [ ] Implement monitoring, logging, and database backups.
- [ ] Review Nigeria Data Protection Act obligations for community reports.
- [ ] Configure restrictive Supabase RLS policies.
- [ ] Ensure all credentials remain server-side.

## 🐛 Troubleshooting

### 1. Styles, scripts, or map misbehave after updating

An old service worker may still be controlling the page.

Open browser DevTools:

1. Go to **Application → Service Workers**.
2. Select **Unregister**.
3. Open **Storage → Clear site data**.
4. Reload the application.

The service worker only handles same-origin requests. CDN scripts and fonts are loaded directly by the browser.

### 2. Map tiles fail to load

Check that the tile host is included in the Content Security Policy (`img-src`) configuration.

If you switch tile providers, configure:

```env
MAP_TILE_URL=your_map_tile_url
MAP_TILE_ATTRIBUTION=your_map_attribution
```

Restart the server after updating `.env`.

The public OpenStreetMap tile server is intended for light use and is not a guaranteed production tile-hosting service.

For production, consider a dedicated provider such as:

- [Geoapify](https://www.geoapify.com/)
- [MapTiler](https://www.maptiler.com/)
- [Stadia Maps](https://stadiamaps.com/)

### 3. `/api/meta` returns 500

This may indicate missing Supabase tables, incorrect credentials, or a connectivity problem.

First, run:

```text
supabase/schema.sql
```

in the Supabase SQL Editor.

Then verify:

```env
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

Also check your internet connection and whether your Supabase project is reachable.

### 4. Port 3000 is already in use

If you see:

```text
Error: listen EADDRINUSE: address already in use :::3000
```

another process is already using port 3000.

Find the process:

```bash
sudo lsof -i :3000
```

Terminate the process using its actual PID:

```bash
kill <PID>
```

Then restart:

```bash
npm run dev
```

### 5. Demo mode

If no Supabase credentials are configured, Kemist uses 10 sample medicine records.

The application displays a **Demo data** banner to distinguish sample records from real pharmaceutical data.

The map still works using live OpenStreetMap facility data, with retrieved places kept in memory.

## 🔮 Next Development Phases

Kemist is being developed progressively.

Planned improvements include:

### Pharmacy and Healthcare Facility Management

- Pharmacy and clinic accounts.
- Facility ownership and listing claims.
- Facility verification and licence checks.
- Administrative facility management.

### Pharmaceutical Database Expansion

- Medicine product images.
- Medicine price observations.
- Expanded clinical information.
- Improved medicine matching and search.
- More comprehensive pharmaceutical data coverage.

### AI-Powered Features

AI capabilities are planned for a later development phase.

The intended direction is to build retrieval-augmented generation (RAG) over Kemist's own structured pharmaceutical database, potentially using Groq for AI inference.

The existing matching and clinical-source architecture provides a foundation for this phase, including:

- DailyMed integration.
- openFDA integration.
- Separate source records.
- Reviewed clinical-product matches.

## 🤝 Contributions

Contributions, suggestions, bug reports, and ideas are welcome.

To contribute:

1. Fork the repository.
2. Create a feature branch.
3. Make your changes.
4. Test your implementation.
5. Submit a pull request with a clear description.

## 📄 License

Kemist is intended to use the **Apache License 2.0**.

See the `LICENSE` file in the repository for the complete licence terms.

The software licence does not automatically grant redistribution rights for third-party pharmaceutical records, images, or other externally sourced data. Individual source licences and usage restrictions must be respected.

---

**Kemist** — Making pharmaceutical information and healthcare discovery more accessible in Nigeria.
