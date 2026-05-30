# Emergency Navigation System - User Guide

## Feature Overview

The Emergency Navigation System provides a streamlined way for dispatchers to view live Google Maps directions from emergency stations to incident locations by simply clicking on team badges.

## How to Use

### 1. **Viewing Incident Details**
   - Click any emergency alert in the left sidebar
   - The incident details panel opens below the map
   - Scroll down to the **"Suggested Dispatch Teams"** section

### 2. **Opening Navigation**
   - **Click any team badge** (Police, Ambulance, Firefighters)
   - The system automatically:
     - Calculates the nearest emergency station to that incident
     - Opens a full-screen navigation page with Google Maps Directions
     - Shows live directions from the station to the incident

### 3. **Navigation Page Interface**
   - **Header**: Displays "Emergency Dispatch Route" and station name
   - **Info Bar**: Shows departure point (green) and destination (red) with coordinates
   - **Map**: Interactive Google Maps with turn-by-turn directions
   - **Close Button**: Returns to the dashboard at any time

### 4. **Return to Dashboard**
   - Click the **"Close"** button in the top-right corner
   - Browser history: Can use back button to return

## System Components

### Emergency Stations
The system includes 4 pre-configured emergency dispatch stations in Tetovo:
- **Tetovo Central Station** (42.0100°N, 20.9715°E) - Main hub
- **Tetovo South Station** (42.0005°N, 20.9700°E) - Southern station
- **Tetovo East Station** (42.0100°N, 20.9835°E) - Eastern station
- **Tetovo North Station** (42.0185°N, 20.9710°E) - Regional station

### Nearest Station Calculation
When you click a team badge:
1. System calculates the haversine distance from incident to all stations
2. Filters stations that service the selected team type
3. Selects the closest available station
4. Routes from that station to the incident

## Technical Requirements

### Environment Variables
Ensure your `.env.local` file includes:
```
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
```

### Browser Compatibility
- Works in all modern browsers (Chrome, Firefox, Safari, Edge)
- Responsive design for mobile and desktop
- Full-screen iframe for optimal map viewing

## Example Workflow

1. **Dispatcher receives alert**: Medical emergency in Tetovo city center (42.01°N, 20.97°E)
2. **Opens incident details**: Clicks alert in sidebar
3. **Identifies team**: Sees "Ambulance" in suggested teams
4. **Clicks Ambulance badge**: Navigation page opens
5. **Views directions**: System shows route from Tetovo Central Station (nearest) to incident
6. **Dispatches team**: Shares location/directions with ambulance crew
7. **Returns to dashboard**: Clicks Close to reassess incident

## Customization Options

### Add New Station
Edit `/lib/emergencyStations.js`:
```javascript
export const EMERGENCY_STATIONS = [
  {
    id: 'unique_id',
    name: 'Station Name',
    latitude: 37.xxxx,
    longitude: 23.xxxx,
    type: 'Station Type',
    teams: ['Police', 'Ambulance', 'Firefighters'],
  },
  // ... more stations
];
```

### Change Navigation Mode
In navigation page, modify the iframe URL:
- Current: `mode=driving`
- Alternative: `mode=walking`, `mode=transit`, `mode=bicycling`

## Troubleshooting

**"Invalid Route Parameters" error**
- Ensure the incident has valid latitude/longitude coordinates
- Check that incident data was properly saved to database

**Navigation page blank**
- Verify `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is set and valid
- Check browser console for errors
- Ensure Google Maps Embed API is enabled in Google Cloud Console

**Wrong station selected**
- System selects the closest station by distance
- Current stations cover central/suburban Tetovo
- Add more stations to `/lib/emergencyStations.js` for better coverage

## Files Reference

- **Dashboard**: `/app/dashboard/page.js`
- **Navigation Page**: `/app/dashboard/navigation/page.js`
- **Station Data**: `/lib/emergencyStations.js`
- **Team Logic**: `/lib/incidentTeams.js`
