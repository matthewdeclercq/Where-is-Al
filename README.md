# Where Is Al

A simple website for tracking Al's Appalachian Trail thru-hike adventure.

## Features

- Password-protected access
- Live map (Garmin inReach MapShare integration)
- Trail statistics dashboard
- Captain's Log with dispatches from the trail
- Responsive design

## File Structure

```
Where-is-Al/
├── index.html          # Password gate entry point
├── main.html           # Main content page
├── css/
│   └── style.css      # Main stylesheet
├── js/
│   ├── utils.js       # Storage utilities & DOM ready helper
│   ├── password.js    # Password validation
│   ├── map.js         # Map initialization (includes config)
│   └── log-loader.js  # Loads log entries from manifest
├── log-entries/
│   ├── manifest.json  # List of log entry filenames
│   └── *.html         # Individual log entry files
├── assets/            # Images and media
├── .nojekyll          # GitHub Pages configuration
├── CNAME              # Custom domain configuration
└── README.md
```

## Setup

### Enable Garmin Map

1. Get your Garmin MapShare URL from [explore.garmin.com](https://explore.garmin.com)
2. Open `js/map.js` and set `mapShareUrl` in the `MapConfig` object:
   ```javascript
   mapShareUrl: "https://share.garmin.com/YourMapShareName"
   ```

### Add Log Entries

1. Create an HTML file in `log-entries/` (e.g., `2024-05-01.html`)
2. Use the log entry structure:
   ```html
   <div class="log-entry">
       <div class="log-entry-header">
           <h3 class="log-entry-title">Title</h3>
           <div class="log-entry-meta">
               <span class="log-entry-date">May 1, 2024</span>
               <span class="log-entry-location">Location</span>
           </div>
       </div>
       <div class="log-entry-content">
           <p>Content here...</p>
       </div>
   </div>
   ```
3. Add the filename to `log-entries/manifest.json`:
   ```json
   [
     "2024-05-01.html",
     ...
   ]
   ```

### Change Password

Edit `PASSWORD` in `js/password.js`:
```javascript
const PASSWORD = 'your-password';
```

