[![pages-build-deployment](https://github.com/FarFigNewGut/lich-mapdb-room/actions/workflows/pages/pages-build-deployment/badge.svg)](https://github.com/FarFigNewGut/lich-mapdb-room/actions/workflows/pages/pages-build-deployment)

# Lich Map Room Database

A web app for exploring rooms from the Lich map database for Gemstone IV. Search for rooms, navigate maps, and get detailed room info.

## What's This For?

This tool helps Gemstone IV players:
- Find rooms by ID, UID, tags, or just searching text
- Jump between different areas using interactive maps
- See how rooms connect to each other
- Get all the details about a room (exits, descriptions, tags, etc.)
- Filter searches by specific maps and locations

## Features

### 🔍 Search Stuff
- **Basic Search**: Type a room ID, UID (like u12345), tag name, or any text
- **Advanced Search**: Pick specific tags, maps, and locations to narrow things down
    * Tags are what the map databases uses to track information about the room's purpose or contents. Town (like TSC), bank, herbs that can be foraged in a room, etc. are all common tag types.
- **Smart Results**: When you get tons of results (100+), it groups them by map you can click to further refine the results
- **Auto-complete**: Start typing a tag and it'll suggest options

### 🗺️ Getting Around
- **Map Dropdown**: Jump straight to any map area (organized by categories)
- **Room Pages**: See everything about a room - exits, descriptions, coordinates, the works
- **Clickable rooms**: Any room on the map, clickable or not, can be clicked to navigate to that room specifically
- **Map Highlighting**: Click to highlight rooms by tags or locations on the map
- **View Complex Movements**: Complex (StringProc) wayto (movements) and timeto (weight values) called out when applicable
- **Connected Maps**: Quick links to maps that connect to where you are

## How to Use It

### Basic Search
```
Search for: "bank"
Gets you: All rooms with "bank" in the title, description, or tags
```

### Advanced Tag Search
```
1. Start typing "shop" in the tag field
2. Pick "Wehnimer's Landing" from the map dropdown
3. Maybe pick a specific location if you want
4. Hit "Go to Map" and you're there
```

### Quick Navigation
```
Direct links:
- /228 (goes to room 228)
- /u13100042 (goes to room with UID u13100042)
- Use the map dropdown to jump anywhere
```
