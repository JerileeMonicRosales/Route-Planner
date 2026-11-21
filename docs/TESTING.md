## Overview

This document outlines the test scenarios for the enhanced GraphHopper Route Planner application developed by IT Girls.

## Test Scenarios

| Test ID | Test Scenario | Expected Result |
|---|---|---|
| TC_001 | Search for a valid route | Route information is displayed |
| TC_002 | Leave the starting location empty | An error message is displayed |
| TC_003 | Leave the destination empty | An error message is displayed |
| TC_004 | Select kilometers | Distance is displayed in kilometers |
| TC_005 | Select miles | Distance is displayed in miles |
| TC_006 | Swap starting and destination | Locations are exchanged |
| TC_007 | Select a vehicle profile | The selected vehicle profile is used |
| TC_008 | Enter an unknown location | An appropriate error message is displayed |

## Testing Procedure

1. Run the Flask backend.
2. Run the React frontend.
3. Open the application in a browser.
4. Execute each test scenario.
5. Compare the actual results with the expected results.
6. Record any issues encountered.

## Neon PostgreSQL smoke test

After linking the Neon project and running `neon deploy`, Neon writes its
connection variables to the repository's `.env` or `.env.local`. The backend
loads those values together with `backend/.env`; do not commit either file.
On startup, the backend creates the account and favorite-route tables if needed.

Verify database-backed behavior through the app: register a new account, save a
favorite route, then log in again and confirm that the favorite is still listed.
The backend uses Neon’s pooled `DATABASE_URL` for normal application requests.

## Test Execution Results

Pending execution.